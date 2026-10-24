-- Run this whole file once in the Supabase SQL Editor (members' progress and
-- profile reminders). Run it after the ambassador panel update
-- (2026-10-27-ambassador-panel/run_in_sql_editor.sql), and after the site
-- update with Members' progress is live: until then the admin panel's
-- Members' progress shows that it needs the database update, and everything
-- else keeps working as before. It runs as one transaction: if anything
-- fails, nothing changes. Role: postgres (the SQL Editor's default).
-- Schema: supabase/migrations/20261028000000_profile_completeness.sql
--
-- What it does:
--   * Admin panel → Members' progress: how many accounts are at each sign-up
--     stage (email not confirmed, unfinished, waiting for review, asked for
--     more information, approved, declined, blocked), with the accounts at
--     each stage.
--   * Profile completeness of approved members (photo, profession, work
--     status, About me, hometown, Ask me about, years abroad), with the
--     members and what each one is missing.
--   * Reminders in the app (a new kind of notification, 'profile'): general
--     or about one missing item, to one member or many at once, at most one
--     per member in 7 days. A note of which reminder went to whom
--     (private.profile_reminders) is kept 12 months; its own nightly
--     clean-up job ('nriclub-profile-reminders-cleanup') deletes it after
--     that.
--
-- The messages pane shows whether the nightly clean-up was scheduled.
-- Afterwards, if Members' progress still says it needs the update a few
-- minutes later, run:
--   NOTIFY pgrst, 'reload schema';

DO $guard$
BEGIN
  IF to_regclass('private.ambassador_agreement_ack') IS NULL THEN
    RAISE EXCEPTION 'Run the ambassador panel update (2026-10-27-ambassador-panel/run_in_sql_editor.sql) first.';
  END IF;
  IF to_regclass('private.profile_reminders') IS NOT NULL THEN
    RAISE EXCEPTION 'This update has already run. Nothing to do.';
  END IF;
END
$guard$;

-- ==== 20261028000000_profile_completeness.sql ====
-- ============================================================================
-- NRIclub: members' progress and profile reminders (2026-10-28)
--
--   * Sign-up stages, for the admin panel (Members' progress):
--     public.admin_signup_stages counts every account by the stage it has
--     reached, and lists the accounts at one stage, a page at a time. The
--     stages, each account in exactly one: blocked (status 'blocked',
--     whatever else); email not confirmed (verification status
--     'incomplete' and profiles.email_verified false); unfinished (confirmed
--     but check details not sent: 'incomplete', email confirmed); waiting
--     for review ('pending'); asked for more information ('needs_info');
--     approved; declined ('rejected').
--   * Profile completeness of approved members (active, verification status
--     'approved'): seven items, each worth the same, a photo, profession,
--     work status, "About me" (bio), hometown, "Ask me about" topics and
--     years abroad (private.profile_missing, in step with PROFILE_ITEMS in
--     src/content/profileReminders.js). public.admin_profile_completeness
--     gives how many members have each number of items, how many miss each
--     item and the cities, and lists the members (filtered by level,
--     missing item, city and search) with their missing items and their
--     last reminder, a page at a time.
--   * Reminders. public.admin_send_profile_reminders sends approved members
--     a reminder in the app (a notification of the new type 'profile'):
--     either general ("Your NRIClub profile is 71% complete. Add …") or
--     about one missing item. The words come from the admin panel
--     (src/content/profileReminders.js is the one place for them); the
--     database checks them, fills in each member's percentage, missing items
--     and city, and decides who gets one: only approved, active members,
--     only if something (that item) is missing, and at most one profile
--     reminder per member in 7 days. Members it skips are counted, not
--     refused, so a bulk send goes through. Admins only; members can't write
--     notifications at all (no INSERT policy since 2026-10-21).
--   * private.profile_reminders keeps which reminder went to whom, from which
--     admin and when: for the 7-day rule and the panel's "last reminded".
--     Deleted with the member's account, and after 12 months by
--     private.profile_reminders_cleanup(), its own pg_cron job
--     ('nriclub-profile-reminders-cleanup', every night).
--     private.daily_cleanup is not changed.
--   * notifications.type accepts 'profile' too: the new CHECK is the one the
--     database has now plus 'profile', so types added by other updates stay.
-- Needs all earlier migrations (up to 20261026000000_travel_board.sql).
-- Can be run again: it replaces what it made the first time.
-- Existing rows: none change.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.travel_posts') IS NULL OR to_regprocedure('private.take_rate(text, text[])') IS NULL THEN
    RAISE EXCEPTION 'Run the earlier updates (up to 20261026000000_travel_board.sql) first.';
  END IF;
END;
$$;

-- ============================================================================
-- THE NEW KIND OF NOTIFICATION
-- ============================================================================

-- 'profile': a reminder from our team about missing profile details. Built
-- from the constraint as it is now, so kinds another update added stay.
DO $$
DECLARE
  def TEXT;
  kinds TEXT[];
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(c.oid) INTO def
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'public.notifications'::regclass AND c.conname = 'notifications_type_check';
  IF def IS NULL THEN
    RAISE EXCEPTION 'notifications_type_check is missing: run the earlier updates first.';
  END IF;
  SELECT array_agg(replace(m[1], '''''', '''') ORDER BY n) INTO kinds
  FROM regexp_matches(def, '''((?:[^'']|'''')*)''', 'g') WITH ORDINALITY AS x(m, n);
  -- The kinds every earlier update has (a guard against reading the
  -- constraint wrongly, which would otherwise drop kinds).
  IF kinds IS NULL OR NOT kinds @> ARRAY['like', 'comment', 'request', 'message', 'verification', 'moderation', 'travel_match'] THEN
    RAISE EXCEPTION 'Unexpected notifications_type_check: %', def;
  END IF;
  IF 'profile' = ANY (kinds) THEN
    RETURN;
  END IF;
  EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check, '
                 'ADD CONSTRAINT notifications_type_check CHECK (type IN (%s))',
                 (SELECT string_agg(quote_literal(k), ', ' ORDER BY n)
                  FROM unnest(kinds || 'profile'::text) WITH ORDINALITY AS y(k, n)));
END;
$$;

-- ============================================================================
-- PROFILE COMPLETENESS
-- ============================================================================

-- The seven items, in order (the keys of PROFILE_ITEMS in
-- src/content/profileReminders.js).
CREATE OR REPLACE FUNCTION private.profile_item_keys()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY['photo', 'profession', 'occupation_status', 'bio', 'hometown', 'ask_me_about', 'years_abroad']::TEXT[];
$$;

-- The keys of the items missing from a profile, in that order. An item
-- counts once it has more than spaces or line breaks (as missingItems in
-- src/content/profileReminders.js).
CREATE OR REPLACE FUNCTION private.profile_missing(p public.profiles)
RETURNS TEXT[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY(
    SELECT x.k FROM (VALUES
        (1, 'photo', p.avatar_url),
        (2, 'profession', p.profession),
        (3, 'occupation_status', p.occupation_status),
        (4, 'bio', p.bio),
        (5, 'hometown', p.hometown),
        (6, 'ask_me_about', p.ask_me_about),
        (7, 'years_abroad', p.years_abroad)) AS x(n, k, v)
    WHERE COALESCE(x.v, '') !~ '\S'
    ORDER BY x.n);
$$;

-- Which reminder went to whom (member_id), from which admin (admin_id) and
-- when. kind: 'general' or an item's key. id: the notification's
-- reference_id. Deleted with the member's account, and after 12 months
-- (private.profile_reminders_cleanup). Only the database reads it.
CREATE TABLE IF NOT EXISTS private.profile_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('general', 'photo', 'profession', 'occupation_status', 'bio', 'hometown',
                                     'ask_me_about', 'years_abroad')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profile_reminders_member ON private.profile_reminders (member_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_reminders_sent ON private.profile_reminders (sent_at);
CREATE INDEX IF NOT EXISTS idx_profile_reminders_admin ON private.profile_reminders (admin_id);
ALTER TABLE private.profile_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.profile_reminders FROM PUBLIC, anon, authenticated;

-- "a, b and c": the words of the missing items in a reminder (as listWords
-- in src/content/profileReminders.js).
CREATE OR REPLACE FUNCTION private.profile_list_words(p_words TEXT[])
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN COALESCE(cardinality(p_words), 0) = 0 THEN ''
    WHEN cardinality(p_words) = 1 THEN p_words[1]
    ELSE array_to_string(p_words[1:cardinality(p_words) - 1], ', ') || ' and ' || p_words[cardinality(p_words)] END;
$$;

-- For the admin panel: approved, active members and how complete their
-- profiles are. Over all of them: levels (how many members have 0 … 7 items,
-- as { "0": n, …, "7": n }), missing (how many miss each item), average
-- (the average percentage), cities (the 100 most common, with counts). Then
-- the members that match p_level (number of items they have, 0 to 7),
-- p_missing (an item's key: members it's missing from), p_city (any case)
-- and p_query (part of the name, email address or city): total, recent
-- (reminded in the last 7 days), complete (all 7 items, not reminded
-- lately), and members: p_limit (at most 200) from p_offset, fewest items
-- first, each { id, name, avatar_url, city, country_code, location, email,
-- filled, percent, missing (keys), reminded_at, reminded_kind }. p_ids_only:
-- instead of members, ids: every match's id (at most 5,000), for a bulk
-- send.
CREATE OR REPLACE FUNCTION public.admin_profile_completeness(p_level INTEGER DEFAULT NULL, p_missing TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL, p_query TEXT DEFAULT '', p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0,
  p_ids_only BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  q TEXT := LEFT(btrim(COALESCE(p_query, '')), 200);
  v_city TEXT := NULLIF(lower(btrim(COALESCE(p_city, ''))), '');
  v_missing TEXT := NULLIF(btrim(COALESCE(p_missing, '')), '');
  lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  off INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  pattern TEXT;
  result JSONB;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF v_missing IS NOT NULL AND NOT (v_missing = ANY (private.profile_item_keys())) THEN
    RAISE EXCEPTION 'Unknown profile item: %', v_missing USING ERRCODE = 'P0001';
  END IF;
  IF p_level IS NOT NULL AND (p_level < 0 OR p_level > 7) THEN
    RAISE EXCEPTION 'A level is a number of items from 0 to 7.' USING ERRCODE = 'P0001';
  END IF;
  -- Letters as typed, any case; % and _ are matched as themselves.
  pattern := CASE WHEN q = '' THEN NULL
    ELSE '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%' END;
  WITH m AS (
    SELECT p.id, p.name, p.avatar_url, p.city, p.country_code, p.location, pp.email, pp.reviewed_at, p.created_at,
      private.profile_missing(p) AS missing, r.sent_at AS reminded_at, r.kind AS reminded_kind
    FROM public.profiles p
    JOIN public.profile_private pp ON pp.id = p.id
    LEFT JOIN LATERAL (SELECT x.sent_at, x.kind FROM private.profile_reminders x
                       WHERE x.member_id = p.id ORDER BY x.sent_at DESC LIMIT 1) r ON TRUE
    WHERE pp.status = 'active' AND pp.verification_status = 'approved'
  ), f AS (
    SELECT m.*, 7 - cardinality(m.missing) AS filled,
      COALESCE(m.reminded_at > NOW() - INTERVAL '7 days', FALSE) AS recent,
      row_number() OVER (ORDER BY cardinality(m.missing) DESC, m.reviewed_at DESC NULLS LAST, m.created_at DESC, m.id) AS ord
    FROM m
    WHERE (p_level IS NULL OR 7 - cardinality(m.missing) = p_level)
      AND (v_missing IS NULL OR v_missing = ANY (m.missing))
      AND (v_city IS NULL OR lower(btrim(m.city)) = v_city)
      AND (pattern IS NULL OR m.name ILIKE pattern OR m.email ILIKE pattern OR m.city ILIKE pattern)
  )
  SELECT jsonb_build_object(
    'approved', (SELECT count(*) FROM m),
    'levels', (SELECT jsonb_object_agg(l::text, (SELECT count(*) FROM m WHERE 7 - cardinality(m.missing) = l))
               FROM generate_series(0, 7) AS l),
    'missing', (SELECT jsonb_object_agg(k, (SELECT count(*) FROM m WHERE k = ANY (m.missing)))
                FROM unnest(private.profile_item_keys()) AS k),
    'average', (SELECT COALESCE(round(avg((7 - cardinality(m.missing)) * 100.0 / 7)), 0) FROM m),
    'cities', COALESCE((SELECT jsonb_agg(jsonb_build_object('city', c.city, 'count', c.n) ORDER BY c.n DESC, c.city)
                        FROM (SELECT min(btrim(m.city)) AS city, count(*) AS n FROM m WHERE btrim(m.city) <> ''
                              GROUP BY lower(btrim(m.city)) ORDER BY count(*) DESC, min(btrim(m.city)) LIMIT 100) c), '[]'::jsonb),
    'total', (SELECT count(*) FROM f),
    'recent', (SELECT count(*) FROM f WHERE f.recent),
    'complete', (SELECT count(*) FROM f WHERE NOT f.recent AND f.filled = 7))
    || CASE WHEN p_ids_only THEN jsonb_build_object(
         'ids', COALESCE((SELECT jsonb_agg(f.id ORDER BY f.ord) FROM f WHERE f.ord <= 5000), '[]'::jsonb))
       ELSE jsonb_build_object(
         'members', COALESCE((SELECT jsonb_agg(jsonb_build_object(
             'id', f.id, 'name', f.name, 'avatar_url', f.avatar_url, 'city', f.city, 'country_code', f.country_code,
             'location', f.location, 'email', f.email, 'filled', f.filled, 'percent', round(f.filled * 100.0 / 7),
             'missing', to_jsonb(f.missing), 'reminded_at', f.reminded_at, 'reminded_kind', f.reminded_kind) ORDER BY f.ord)
           FROM f WHERE f.ord > off AND f.ord <= off + lim), '[]'::jsonb)) END
  INTO result;
  RETURN result;
END;
$$;

-- Sends approved members a reminder about their profile in the app (a
-- notification of type 'profile', from our team), and keeps a note of it.
-- p_kind: 'general' or an item's key. p_text: the reminder's words, from
-- src/content/profileReminders.js: {percent}, {missing} (general only) and
-- {city} are filled in for each member. p_words (general): { items: { key:
-- the item's words in the list, for all seven }, no_city: the words for a
-- member without a city }. Members are skipped, not refused: those who
-- aren't approved and active (or don't exist), those reminded in the last
-- 7 days, and those with nothing to remind them of (general: all seven
-- items; an item: they have it). At most 500 members a call; an admin can
-- make 30 calls a minute and 300 a day. Returns { sent, skipped,
-- skipped_recent, skipped_complete, skipped_not_eligible, sent_to (ids),
-- sent_at }.
CREATE OR REPLACE FUNCTION public.admin_send_profile_reminders(p_members UUID[], p_kind TEXT, p_text TEXT,
  p_words JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := (SELECT auth.uid());
  keys TEXT[] := private.profile_item_keys();
  v_text TEXT := btrim(COALESCE(p_text, ''));
  words JSONB := COALESCE(p_words, '{}'::jsonb);
  allowed TEXT[];
  k TEXT;
  v_member UUID;
  p public.profiles;
  pp public.profile_private;
  missing TEXT[];
  body TEXT;
  log_id UUID;
  sent UUID[] := '{}';
  recent INTEGER := 0;
  complete INTEGER := 0;
  not_eligible INTEGER := 0;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR NOT (p_kind = 'general' OR p_kind = ANY (keys)) THEN
    RAISE EXCEPTION 'Unknown kind of reminder: %', p_kind USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(cardinality(p_members), 0) > 500 THEN
    RAISE EXCEPTION 'At most 500 members at a time.' USING ERRCODE = 'P0001';
  END IF;
  -- The words: not empty, not too long, and only the blanks this kind fills in.
  allowed := CASE WHEN p_kind = 'general' THEN ARRAY['{percent}', '{missing}', '{city}'] ELSE ARRAY['{city}'] END;
  IF v_text = '' OR char_length(v_text) > 400
     OR regexp_replace(v_text, '\{(percent|missing|city)\}', '', 'g') ~ '[{}]'
     OR EXISTS (SELECT 1 FROM regexp_matches(v_text, '\{[a-z]+\}', 'g') AS x(m) WHERE NOT (x.m[1] = ANY (allowed)))
     OR (p_kind = 'general' AND (position('{percent}' IN v_text) = 0 OR position('{missing}' IN v_text) = 0)) THEN
    RAISE EXCEPTION 'The reminder''s words aren''t right for this kind of reminder.' USING ERRCODE = 'P0001';
  END IF;
  IF p_kind = 'general' THEN
    FOREACH k IN ARRAY keys LOOP
      IF jsonb_typeof(words -> 'items' -> k) IS DISTINCT FROM 'string'
         OR btrim(words -> 'items' ->> k) = '' OR char_length(words -> 'items' ->> k) > 80 THEN
        RAISE EXCEPTION 'The words for each profile item are missing.' USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;
  IF position('{city}' IN v_text) > 0 AND (jsonb_typeof(words -> 'no_city') IS DISTINCT FROM 'string'
     OR btrim(words ->> 'no_city') = '' OR char_length(words ->> 'no_city') > 40) THEN
    RAISE EXCEPTION 'The words for a member without a city are missing.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM private.take_rate('profile_reminders', ARRAY['30', '1 minute', '300', '1 day']);
  -- One send at a time, so two admins can't both remind the same member.
  PERFORM pg_advisory_xact_lock(hashtext('nriclub-profile-reminders'));

  FOR v_member IN SELECT DISTINCT x.id FROM unnest(COALESCE(p_members, '{}'::UUID[])) AS x(id) WHERE x.id IS NOT NULL LOOP
    SELECT * INTO p FROM public.profiles x WHERE x.id = v_member;
    SELECT * INTO pp FROM public.profile_private x WHERE x.id = v_member;
    IF p.id IS NULL OR pp.id IS NULL OR pp.status <> 'active' OR pp.verification_status <> 'approved' THEN
      not_eligible := not_eligible + 1;
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM private.profile_reminders r
               WHERE r.member_id = p.id AND r.sent_at > NOW() - INTERVAL '7 days') THEN
      recent := recent + 1;
      CONTINUE;
    END IF;
    missing := private.profile_missing(p);
    IF (p_kind = 'general' AND cardinality(missing) = 0) OR (p_kind <> 'general' AND NOT (p_kind = ANY (missing))) THEN
      complete := complete + 1;
      CONTINUE;
    END IF;
    body := v_text;
    IF p_kind = 'general' THEN
      body := replace(body, '{percent}', round((7 - cardinality(missing)) * 100.0 / 7)::text);
      body := replace(body, '{missing}', private.profile_list_words(ARRAY(
        SELECT btrim(words -> 'items' ->> y.k) FROM unnest(missing) WITH ORDINALITY AS y(k, n) ORDER BY y.n)));
    END IF;
    body := replace(body, '{city}', COALESCE(NULLIF(btrim(p.city), ''), btrim(words ->> 'no_city'), ''));
    INSERT INTO private.profile_reminders (member_id, admin_id, kind) VALUES (p.id, me, p_kind) RETURNING id INTO log_id;
    INSERT INTO public.notifications (user_id, type, text, reference_id) VALUES (p.id, 'profile', LEFT(body, 1000), log_id);
    sent := sent || p.id;
  END LOOP;

  RETURN jsonb_build_object(
    'sent', cardinality(sent), 'skipped', recent + complete + not_eligible,
    'skipped_recent', recent, 'skipped_complete', complete, 'skipped_not_eligible', not_eligible,
    'sent_to', to_jsonb(sent), 'sent_at', NOW());
END;
$$;

-- ============================================================================
-- SIGN-UP STAGES
-- ============================================================================

-- The stage an account has reached (see the top of this file).
CREATE OR REPLACE FUNCTION private.signup_stage(p_status TEXT, p_verification TEXT, p_email_verified BOOLEAN)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_status = 'blocked' THEN 'blocked'
    WHEN p_verification = 'incomplete' AND NOT COALESCE(p_email_verified, FALSE) THEN 'unconfirmed'
    WHEN p_verification = 'incomplete' THEN 'unfinished'
    ELSE p_verification END;
$$;

-- For the admin panel: counts, how many accounts are at each stage
-- (unconfirmed, unfinished, pending, needs_info, approved, rejected,
-- blocked), and, for p_stage, total and members: the accounts at that stage
-- matching p_query (part of the name, email address or city), p_limit (at
-- most 200) from p_offset. Unconfirmed and unfinished ones newest first;
-- waiting ones (pending, needs_info) the longest waiting first; approved and
-- declined ones the latest decision first; blocked ones the latest block
-- first. Each { id, name, email, avatar_url, city, country_code, location,
-- created_at, submitted_at, reviewed_at, blocked_at, last_active,
-- email_verified, verification_status, status, review_flag }.
CREATE OR REPLACE FUNCTION public.admin_signup_stages(p_stage TEXT DEFAULT NULL, p_query TEXT DEFAULT '',
  p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  q TEXT := LEFT(btrim(COALESCE(p_query, '')), 200);
  v_stage TEXT := NULLIF(btrim(COALESCE(p_stage, '')), '');
  lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  off INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  stages TEXT[] := ARRAY['unconfirmed', 'unfinished', 'pending', 'needs_info', 'approved', 'rejected', 'blocked'];
  pattern TEXT;
  result JSONB;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF v_stage IS NOT NULL AND NOT (v_stage = ANY (stages)) THEN
    RAISE EXCEPTION 'Unknown stage: %', v_stage USING ERRCODE = 'P0001';
  END IF;
  pattern := CASE WHEN q = '' THEN NULL
    ELSE '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%' END;
  WITH a AS (
    SELECT p.id, p.name, pp.email, p.avatar_url, p.city, p.country_code, p.location, p.created_at, pp.submitted_at,
      pp.reviewed_at, pp.blocked_at, pp.last_active, p.email_verified, pp.verification_status, pp.status, pp.review_flag,
      private.signup_stage(pp.status, pp.verification_status, p.email_verified) AS stage
    FROM public.profiles p
    JOIN public.profile_private pp ON pp.id = p.id
  ), f AS (
    SELECT a.*, row_number() OVER (ORDER BY
        CASE WHEN a.stage IN ('unconfirmed', 'unfinished') THEN a.created_at END DESC NULLS LAST,
        CASE WHEN a.stage IN ('pending', 'needs_info') THEN COALESCE(a.submitted_at, a.created_at) END NULLS LAST,
        CASE WHEN a.stage IN ('approved', 'rejected') THEN a.reviewed_at END DESC NULLS LAST,
        CASE WHEN a.stage = 'blocked' THEN a.blocked_at END DESC NULLS LAST,
        a.created_at DESC, a.id) AS ord
    FROM a
    WHERE a.stage = v_stage
      AND (pattern IS NULL OR a.name ILIKE pattern OR a.email ILIKE pattern OR a.city ILIKE pattern)
  )
  SELECT jsonb_build_object(
    'counts', (SELECT jsonb_object_agg(s, (SELECT count(*) FROM a WHERE a.stage = s)) FROM unnest(stages) AS s),
    'total', (SELECT count(*) FROM f),
    'members', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'email', f.email, 'avatar_url', f.avatar_url, 'city', f.city,
        'country_code', f.country_code, 'location', f.location, 'created_at', f.created_at,
        'submitted_at', f.submitted_at, 'reviewed_at', f.reviewed_at, 'blocked_at', f.blocked_at,
        'last_active', f.last_active, 'email_verified', f.email_verified,
        'verification_status', f.verification_status, 'status', f.status, 'review_flag', f.review_flag) ORDER BY f.ord)
      FROM f WHERE f.ord > off AND f.ord <= off + lim), '[]'::jsonb))
  INTO result;
  RETURN result;
END;
$$;

-- ============================================================================
-- CLEAN-UP
-- ============================================================================

-- Deletes the notes of reminders sent more than 12 months ago (the Privacy
-- Policy's period). Returns how many it deleted. Its own job, so
-- private.daily_cleanup stays as it is.
CREATE OR REPLACE FUNCTION private.profile_reminders_cleanup()
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH gone AS (
    DELETE FROM private.profile_reminders r WHERE r.sent_at < NOW() - INTERVAL '12 months' RETURNING 1)
  SELECT count(*)::INTEGER FROM gone;
$$;

-- Runs private.profile_reminders_cleanup() every night at 03:29 (UTC) with
-- pg_cron, as private.schedule_daily_cleanup does for the daily clean-up.
-- Says what it did. Safe to run again (the job keeps its name):
-- SELECT private.schedule_profile_reminders_cleanup();
-- Stop it with: SELECT cron.unschedule('nriclub-profile-reminders-cleanup');
CREATE OR REPLACE FUNCTION private.schedule_profile_reminders_cleanup()
RETURNS TEXT LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name = 'pg_cron') THEN
      RETURN 'not scheduled: this database has no pg_cron. Run SELECT private.profile_reminders_cleanup(); by hand once a day.';
    END IF;
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
    EXCEPTION WHEN OTHERS THEN
      RETURN 'not scheduled: pg_cron could not be enabled (' || SQLERRM || '). Enable it under Database → Extensions, then run SELECT private.schedule_profile_reminders_cleanup();';
    END;
  END IF;
  BEGIN
    EXECUTE 'SELECT cron.schedule($1, $2, $3)'
      USING 'nriclub-profile-reminders-cleanup', '29 3 * * *', 'SELECT private.profile_reminders_cleanup()';
  EXCEPTION WHEN OTHERS THEN
    RETURN 'not scheduled: ' || SQLERRM;
  END;
  RETURN 'scheduled: private.profile_reminders_cleanup() runs every night at 03:29 UTC (pg_cron job nriclub-profile-reminders-cleanup)';
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Helpers run as the database (inside the functions above); the clean-up
-- also as the service role, by hand.
REVOKE ALL ON FUNCTION private.profile_item_keys(), private.profile_missing(public.profiles), private.profile_list_words(TEXT[]),
  private.signup_stage(TEXT, TEXT, BOOLEAN), private.profile_reminders_cleanup(),
  private.schedule_profile_reminders_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.profile_reminders_cleanup() TO service_role;

-- Admin functions check private.is_admin() themselves; members get "Admins only".
REVOKE ALL ON FUNCTION public.admin_profile_completeness(INTEGER, TEXT, TEXT, TEXT, INTEGER, INTEGER, BOOLEAN),
  public.admin_send_profile_reminders(UUID[], TEXT, TEXT, JSONB),
  public.admin_signup_stages(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_profile_completeness(INTEGER, TEXT, TEXT, TEXT, INTEGER, INTEGER, BOOLEAN),
  public.admin_send_profile_reminders(UUID[], TEXT, TEXT, JSONB),
  public.admin_signup_stages(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- The nightly clean-up of the reminder notes (the result shows in the SQL
-- editor's messages).
DO $$
BEGIN
  RAISE NOTICE 'NRIClub profile reminders clean-up: %', private.schedule_profile_reminders_cleanup();
END $$;
