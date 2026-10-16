-- ============================================================================
-- NRIclub: admin access and who sees whom (2026-10-23)
--
--   * Admin rights (private.is_admin, which every admin policy and function
--     checks) need an account listed in public.admins that isn't blocked, and,
--     once "Require two-step login for admin rights" is switched on in the
--     admin panel (Security), a session signed in with the 6-digit code from
--     an authenticator app (Supabase Auth's TOTP, aal2 in the session). The
--     switch is off until an admin who has set up two-step login turns it on,
--     so nobody is locked out by this update (C4).
--   * public.admin_mfa_status() tells the signed-in account whether it is an
--     admin, whether two-step login is required and how it signed in;
--     public.admin_set_mfa_required() turns the switch on or off, only from a
--     session signed in with the code. An admin can't block their own account
--     (they would lose admin rights and couldn't undo it).
--   * Who sees whom: other members see only the profiles of members our team
--     has approved and who aren't blocked (private.is_listed_member). Members
--     waiting for review, unfinished, declined and blocked accounts aren't
--     shown to other members; admins see everyone, and everyone sees their
--     own profile. What such an account posted before stays, without their
--     name: the site shows "NRIClub member" and no profile. The organiser's
--     name on their events is cleared too (and comes back when they're
--     approved again). LinkedIn links and contact settings follow the
--     profile.
--   * Admin search across all members (public.admin_search_members, by name,
--     email, city or place, with trigram indexes), and the review queue in
--     pages or for chosen members (public.admin_verification_queue, approved
--     and declined members newest decision first) (C25).
-- Needs all earlier migrations (up to 20261020000000_notifications_limits_privacy.sql).
-- Existing rows: events of organisers who aren't shown lose the organiser's
-- name; nothing else changes. The two-step switch starts off.
-- ============================================================================

-- ============================================================================
-- SETTINGS
-- ============================================================================

-- Settings our team changes in the admin panel, one row each. Only the
-- database reads and writes them (through the functions below); updated_by
-- and updated_at say who changed one last, and when.
--   admin_mfa_required: true once admin rights need two-step login.
CREATE TABLE private.app_settings (
  key TEXT PRIMARY KEY CHECK (char_length(key) <= 100),
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE private.app_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.app_settings FROM PUBLIC, anon, authenticated;
INSERT INTO private.app_settings (key, value) VALUES ('admin_mfa_required', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Whether admin rights need two-step login (false unless switched on).
CREATE FUNCTION private.admin_mfa_required()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT s.value = 'true'::jsonb FROM private.app_settings s WHERE s.key = 'admin_mfa_required'), FALSE);
$$;

-- How the signed-in session was signed in: 'aal2' after the 6-digit code,
-- 'aal1' with the password (or an email code) only; '' without a session.
CREATE FUNCTION private.session_aal()
RETURNS TEXT LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT COALESCE((SELECT auth.jwt()) ->> 'aal', '');
$$;

-- ============================================================================
-- ADMIN RIGHTS (C4)
-- ============================================================================

-- Replaces the 2026-10-12 version (any account in public.admins). Now the
-- account must also be active (not blocked), and, while two-step login is
-- required, the session must have been signed in with the code. Every admin
-- policy, admin function and the admin exemptions in triggers use this.
-- If the only admin can no longer get in (e.g. a lost phone), the owner
-- turns the requirement off in the Supabase SQL editor:
--   UPDATE private.app_settings SET value = 'false' WHERE key = 'admin_mfa_required';
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins a JOIN public.profile_private pp ON pp.id = a.user_id
    WHERE a.user_id = (SELECT auth.uid()) AND pp.status = 'active')
  AND (NOT private.admin_mfa_required() OR private.session_aal() = 'aal2');
$$;

-- For the admin login and the Security page: about the signed-in account
-- only. listed: in public.admins; active: not blocked; mfa_required: admin
-- rights need two-step login; aal: how this session was signed in;
-- is_admin: whether it has admin rights now; mfa_changed_at: when an admin
-- last switched the requirement (null if nobody has). Other accounts learn
-- only that they aren't admins.
CREATE FUNCTION public.admin_mfa_status()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN NOT x.listed THEN jsonb_build_object('listed', FALSE, 'is_admin', FALSE)
    ELSE jsonb_build_object(
      'listed', TRUE,
      'active', x.active,
      'mfa_required', private.admin_mfa_required(),
      'aal', private.session_aal(),
      'is_admin', private.is_admin(),
      'mfa_changed_at', (SELECT s.updated_at FROM private.app_settings s
                         WHERE s.key = 'admin_mfa_required' AND s.updated_by IS NOT NULL))
    END
  FROM (SELECT
      EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = (SELECT auth.uid())) AS listed,
      EXISTS (SELECT 1 FROM public.profile_private pp WHERE pp.id = (SELECT auth.uid()) AND pp.status = 'active') AS active) x;
$$;

-- Turns "Require two-step login for admin rights" on or off. Only an admin
-- (listed, not blocked) whose session was signed in with the 6-digit code
-- can change it, either way: turning it on proves the admin can get back in,
-- and a stolen password alone can't turn it off. Returns the new setting.
CREATE FUNCTION public.admin_set_mfa_required(p_on BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF p_on IS NULL THEN
    RAISE EXCEPTION 'Say whether two-step login is required.' USING ERRCODE = 'P0001';
  END IF;
  IF uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.admins a JOIN public.profile_private pp ON pp.id = a.user_id
    WHERE a.user_id = uid AND pp.status = 'active') THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;
  IF private.session_aal() <> 'aal2' THEN
    RAISE EXCEPTION 'Confirm with the 6-digit code from your authenticator app first.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO private.app_settings (key, value, updated_at, updated_by)
  VALUES ('admin_mfa_required', to_jsonb(p_on), NOW(), uid)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  RETURN p_on;
END;
$$;

-- An admin can't block their own account through the site: they would lose
-- admin rights at once and couldn't unblock themselves. (The SQL editor,
-- which has no signed-in member, still can.)
CREATE FUNCTION private.keep_own_admin_account()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'blocked' AND OLD.status IS DISTINCT FROM 'blocked'
     AND NEW.id = (SELECT auth.uid())
     AND EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = NEW.id) THEN
    RAISE EXCEPTION 'You can''t block your own account.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER keep_own_admin_account BEFORE UPDATE OF status ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION private.keep_own_admin_account();

-- ============================================================================
-- WHO SEES WHOM
-- ============================================================================

-- Members other members see: approved by our team and not blocked.
-- (Accepting newer Terms doesn't matter here: a member who hasn't yet is
-- still a member.)
CREATE FUNCTION private.is_listed_member(p_member UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_private pp
    WHERE pp.id = p_member AND pp.status = 'active' AND pp.verification_status = 'approved');
$$;

-- Replaces the 2026-10-13 version (every profile, for members who can
-- browse). Members see their own profile; admins see every profile; members
-- who can browse see the members who are shown. Content keeps its own rules:
-- a post by an account that isn't shown is still there, but the site gets no
-- profile with it.
DROP POLICY "Members can view profiles" ON public.profiles;
CREATE POLICY "Members can view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT private.is_admin())
         OR ((SELECT private.can_browse()) AND private.is_listed_member(id)));

-- As in 2026-10-20, except that other members get a link only from members
-- who are shown.
CREATE OR REPLACE FUNCTION public.profile_links(p_ids UUID[])
RETURNS TABLE (id UUID, linkedin_url TEXT, linkedin_public BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id, p.linkedin_url, p.linkedin_public
  FROM public.profiles p
  WHERE p.id = ANY (p_ids[1:2000])
    AND ((SELECT auth.uid()) = p.id
         OR (SELECT private.is_admin())
         OR (p.linkedin_public AND p.linkedin_url <> '' AND (SELECT private.can_browse())
             AND private.is_listed_member(p.id)));
$$;

-- As in 2026-10-20, except that the contact settings are only given for
-- members who are shown.
CREATE OR REPLACE FUNCTION public.get_member_preferences(member UUID)
RETURNS TABLE (namaste_requests TEXT, receive_messages TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.namaste_requests, s.receive_messages
  FROM public.user_settings s
  WHERE s.user_id = member AND (SELECT auth.uid()) IS NOT NULL AND private.can_browse()
    AND (private.is_admin() OR private.is_listed_member(member));
$$;

-- Events carry their organiser's name (set when the event is written). It
-- goes when the organiser stops being shown (blocked, declined, back in
-- review) and comes back, with their current name, when they're shown
-- again. (Runs as the database, so the events' own triggers leave the name
-- as given.)
CREATE FUNCTION private.sync_organizer_name()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  listed BOOLEAN := NEW.status = 'active' AND NEW.verification_status = 'approved';
BEGIN
  IF listed IS DISTINCT FROM (OLD.status = 'active' AND OLD.verification_status = 'approved') THEN
    UPDATE public.events e
    SET organizer_name = CASE WHEN listed THEN COALESCE((SELECT p.name FROM public.profiles p WHERE p.id = NEW.id), '') ELSE '' END
    WHERE e.organizer_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER sync_organizer_name AFTER UPDATE OF status, verification_status ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION private.sync_organizer_name();

-- ============================================================================
-- ADMIN SEARCH AND THE REVIEW QUEUE (C25)
-- ============================================================================

-- Trigram indexes, so a search for part of a name, email address or place
-- stays fast with many members. pg_trgm goes into the extensions schema
-- (Supabase's place for extensions); if it is already installed elsewhere,
-- that copy is used.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
DO $$
DECLARE
  s TEXT;
BEGIN
  SELECT n.nspname INTO s FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_profiles_name_trgm ON public.profiles USING gin (name %I.gin_trgm_ops)', s);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_profiles_city_trgm ON public.profiles USING gin (city %I.gin_trgm_ops)', s);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_profiles_location_trgm ON public.profiles USING gin (location %I.gin_trgm_ops)', s);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_profile_private_email_trgm ON public.profile_private USING gin (email %I.gin_trgm_ops)', s);
END $$;

-- Members for the admin panel, newest first, p_limit (at most 200) from
-- p_offset: p_query matches part of the name, email address, city or place
-- (letters as typed, any case; % and _ are matched as themselves);
-- p_status a verification status, p_blocked blocked (true) or not (false);
-- NULL or '' for any. Returns { total, members }: each member is their
-- profile with their private details under profile_private, as the panel
-- reads them from the tables.
CREATE FUNCTION public.admin_search_members(p_query TEXT DEFAULT '', p_status TEXT DEFAULT NULL,
  p_blocked BOOLEAN DEFAULT NULL, p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  q TEXT := LEFT(btrim(COALESCE(p_query, '')), 200);
  v_status TEXT := NULLIF(btrim(COALESCE(p_status, '')), '');
  lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  off INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  pattern TEXT;
  ids UUID[];
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;
  IF q = '' THEN
    SELECT array_agg(p.id ORDER BY p.created_at DESC, p.id) INTO ids
    FROM public.profiles p JOIN public.profile_private pp ON pp.id = p.id
    WHERE (v_status IS NULL OR pp.verification_status = v_status)
      AND (p_blocked IS NULL OR (pp.status = 'blocked') = p_blocked);
  ELSE
    pattern := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    -- Each side can use its table's indexes; then the filters.
    SELECT array_agg(p.id ORDER BY p.created_at DESC, p.id) INTO ids
    FROM (SELECT x.id FROM public.profiles x
          WHERE x.name ILIKE pattern OR x.city ILIKE pattern OR x.location ILIKE pattern
          UNION
          SELECT y.id FROM public.profile_private y WHERE y.email ILIKE pattern) hit
    JOIN public.profiles p ON p.id = hit.id
    JOIN public.profile_private pp ON pp.id = p.id
    WHERE (v_status IS NULL OR pp.verification_status = v_status)
      AND (p_blocked IS NULL OR (pp.status = 'blocked') = p_blocked);
  END IF;
  RETURN jsonb_build_object(
    'total', COALESCE(cardinality(ids), 0),
    'members', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object('profile_private', jsonb_build_object(
          'email', pp.email, 'verification_status', pp.verification_status, 'status', pp.status,
          'review_flag', pp.review_flag, 'last_active', pp.last_active)) ORDER BY x.ord)
      FROM unnest(ids[off + 1 : off + lim]) WITH ORDINALITY x(id, ord)
      JOIN public.profiles p ON p.id = x.id
      JOIN public.profile_private pp ON pp.id = p.id), '[]'::jsonb));
END;
$$;

-- As in 2026-10-13, in pages: p_limit members (at most 1,000, the default,
-- as before) from p_offset, and total_count says how many there are in all.
-- Order: waiting members (pending, needs_info) oldest submission first;
-- approved and declined members newest decision first; unfinished sign-ups
-- newest first. p_ids: only these members (with p_statuses NULL, whatever
-- their status), e.g. the one member an admin opens in Members. Called with
-- only p_statuses, as older pages of the site do, it answers as before (plus
-- total_count).
DROP FUNCTION public.admin_verification_queue(TEXT[]);
CREATE FUNCTION public.admin_verification_queue(p_statuses TEXT[] DEFAULT ARRAY['pending'],
  p_limit INTEGER DEFAULT 1000, p_offset INTEGER DEFAULT 0, p_ids UUID[] DEFAULT NULL)
RETURNS TABLE (
  id UUID, name TEXT, avatar_url TEXT, email TEXT, email_verified BOOLEAN,
  city TEXT, country_code TEXT, location TEXT, hometown TEXT, profession TEXT,
  linkedin_url TEXT, verification_note TEXT, voucher TEXT,
  verification_status TEXT, status TEXT, verification_message TEXT,
  created_at TIMESTAMPTZ, submitted_at TIMESTAMPTZ, reviewed_at TIMESTAMPTZ,
  age_confirmed_at TIMESTAMPTZ, terms_accepted_at TIMESTAMPTZ,
  same_linkedin_count INTEGER, previous_decisions INTEGER, review_flag TEXT,
  flag_decision TEXT, flag_matched_on TEXT, flag_note TEXT, flag_date TIMESTAMPTZ,
  total_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH page AS (
    SELECT p.id, count(*) OVER () AS total,
      row_number() OVER (ORDER BY
        CASE WHEN pp.verification_status IN ('approved', 'rejected') THEN pp.reviewed_at END DESC NULLS LAST,
        CASE WHEN pp.verification_status IN ('pending', 'needs_info') THEN pp.submitted_at END NULLS LAST,
        CASE WHEN pp.verification_status = 'incomplete' THEN p.created_at END DESC NULLS LAST,
        p.created_at, p.id) AS ord
    FROM public.profiles p
    JOIN public.profile_private pp ON pp.id = p.id
    WHERE (p_statuses IS NULL OR pp.verification_status = ANY (p_statuses))
      AND (p_ids IS NULL OR p.id = ANY (p_ids))
      AND (p_statuses IS NOT NULL OR p_ids IS NOT NULL)
    ORDER BY ord
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 1000) OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  )
  SELECT p.id, p.name, p.avatar_url, pp.email, p.email_verified,
    p.city, p.country_code, p.location, p.hometown, p.profession,
    p.linkedin_url, pp.verification_note, pp.voucher,
    pp.verification_status, pp.status, pp.verification_message,
    p.created_at, pp.submitted_at, pp.reviewed_at,
    pp.age_confirmed_at, pp.terms_accepted_at,
    (SELECT count(*)::int FROM public.profiles o
      WHERE private.linkedin_slug(o.linkedin_url) = private.linkedin_slug(p.linkedin_url) AND o.id <> p.id),
    (SELECT count(*)::int FROM public.verification_log l
      WHERE l.member_id = p.id AND l.decision IN ('approved', 'needs_info', 'rejected')),
    pp.review_flag, r.decision, COALESCE(now_match.matched_on, h.matched_on), r.admin_note, r.created_at,
    page.total
  FROM page
  JOIN public.profiles p ON p.id = page.id
  JOIN public.profile_private pp ON pp.id = p.id
  LEFT JOIN private.review_hold h ON h.member_id = p.id AND pp.review_flag = 'held'
  -- Only looked up for a hold whose record is gone (OFFSET 0 keeps the
  -- condition in front of the lookup).
  LEFT JOIN LATERAL (
    SELECT m.record_id, m.matched_on FROM private.moderation_match(p.id, pp.email, p.linkedin_url) m
    WHERE h.member_id IS NOT NULL AND h.record_id IS NULL OFFSET 0) now_match ON TRUE
  LEFT JOIN private.moderation_record r ON r.id = COALESCE(h.record_id, now_match.record_id)
  ORDER BY page.ord;
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- is_admin keeps the roles it had. The helpers in policies run as the
-- member; the trigger functions as the database. Members can't call anything
-- in private through the API (the schema isn't exposed).
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_admin() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.admin_mfa_required(), private.session_aal(), private.is_listed_member(UUID),
  private.keep_own_admin_account(), private.sync_organizer_name() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.admin_mfa_required(), private.session_aal(), private.is_listed_member(UUID),
  private.keep_own_admin_account(), private.sync_organizer_name() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_mfa_status(), public.admin_set_mfa_required(BOOLEAN),
  public.admin_search_members(TEXT, TEXT, BOOLEAN, INTEGER, INTEGER),
  public.admin_verification_queue(TEXT[], INTEGER, INTEGER, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mfa_status(), public.admin_set_mfa_required(BOOLEAN),
  public.admin_search_members(TEXT, TEXT, BOOLEAN, INTEGER, INTEGER),
  public.admin_verification_queue(TEXT[], INTEGER, INTEGER, UUID[]) TO authenticated;

-- ============================================================================
-- EXISTING DATA
-- ============================================================================

-- (supabase/tests/rls_test.py runs this section again, in a transaction it
-- rolls back, to check the changes to existing rows.)

-- Events of organisers who aren't shown lose the organiser's name (as
-- private.sync_organizer_name does from now on).
UPDATE public.events e SET organizer_name = ''
FROM public.profile_private pp
WHERE pp.id = e.organizer_id AND e.organizer_name <> ''
  AND NOT (pp.status = 'active' AND pp.verification_status = 'approved');

-- Admins who have no admin rights from now on (a blocked account, or one
-- without its private profile row): shown in the SQL editor's messages, so
-- a surprise is seen at once. Unblock with
--   UPDATE public.profile_private SET status = 'active' WHERE id = '<admin id>';
DO $$
DECLARE
  listed INTEGER;
  without INTEGER;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE pp.id IS NULL OR pp.status <> 'active') INTO listed, without
  FROM public.admins a LEFT JOIN public.profile_private pp ON pp.id = a.user_id;
  RAISE NOTICE 'NRIClub admin access: % admin account(s); % of them without admin rights now (blocked, or no profile). Two-step login is not required until switched on in the admin panel (Security).', listed, without;
END $$;
