-- ============================================================================
-- NRIclub: fixes from the Phase 1 review (2026-10-12) and from the review of
-- those fixes (2026-10-13, R1-R26)
--
-- Runs after 20261012000000_nriclub_schema.sql, on a database that may
-- already hold members and content. No rows are deleted. Existing rows are
-- only changed where noted (submission dates, forged dates, over-long
-- message previews, names copied from email addresses, group member counts).
--
-- What changes
--   * Only active members (and admins) can read other members' rows; rejected,
--     blocked and unverified accounts can still read their own (F2).
--   * Being active now also needs the 18+ record and the current Terms
--     version (F14, R20), and a member who matches a rejected or blocked
--     account is held for review and isn't active until an admin approves
--     them (F7). Matching compares a keyed hash of the email address and the
--     LinkedIn link, both in a standard form (R9, R18), and only happens at
--     signup and when details are submitted (R7, R8).
--   * Verification decisions lock the member's rows, follow the allowed
--     status changes and refuse if the member's status, name or LinkedIn
--     changed since the admin looked (F5, F6, F25, F31, R15). A rejected
--     signup that never sent details can go back to unfinished (R4).
--   * The server sets dates, message previews and organiser names (F10, F21);
--     notifications must point at the right post (F22); image links must be
--     the member's own uploads (F23); only active members can accept a
--     Namaste request (R10).
--   * New RPCs: accept_terms() and export_my_data() (F14, F16, R19).
-- ============================================================================

-- ============================================================================
-- TABLES
-- ============================================================================

-- 'held' while a member waits for an admin because their email address or
-- LinkedIn link matched a rejected or blocked account; '' otherwise. Members
-- can read it, so it says no more than that: what matched is in
-- private.review_hold. Set by the server; cleared when an admin approves.
ALTER TABLE public.profile_private
  ADD COLUMN review_flag TEXT NOT NULL DEFAULT '' CHECK (review_flag IN ('', 'held'));

-- The site keeps marketing consent in profile_private.marketing_consent only.
COMMENT ON COLUMN public.user_settings.marketing_emails IS
  'Deprecated: no longer read or written by the site. Marketing consent is profile_private.marketing_consent.';

-- Rejections and blocks, kept after the account is deleted so the same
-- person signing up again is held for review. Holds no email address, only
-- a keyed hash of it (private.email_hash), plus the LinkedIn slug, the
-- decision and the admin's note. The account id is removed when the account
-- is deleted (private.forget_moderation_member). In the private schema: not
-- reachable through the API.
CREATE TABLE private.moderation_record (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID,                                   -- the account, until it's deleted
  email_hash TEXT,
  linkedin_slug TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('rejected', 'blocked')),
  admin_note TEXT NOT NULL DEFAULT '' CHECK (char_length(admin_note) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()     -- when the admin decided
);
CREATE INDEX idx_moderation_record_email ON private.moderation_record(email_hash);
CREATE INDEX idx_moderation_record_linkedin ON private.moderation_record(linkedin_slug);
CREATE INDEX idx_moderation_record_member ON private.moderation_record(member_id);

-- Why a member is held for review (review_flag = 'held'): the moderation
-- record they matched, and whether the email address, the LinkedIn link or
-- both matched. For admins only. If that record goes later (an admin
-- reversed the decision), record_id is empty and the member stays held
-- until an admin decides.
CREATE TABLE private.review_hold (
  member_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  record_id UUID REFERENCES private.moderation_record(id) ON DELETE SET NULL,
  matched_on TEXT NOT NULL CHECK (matched_on IN ('email', 'linkedin', 'both')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_review_hold_record ON private.review_hold(record_id);

-- Settings the database needs to know. Set the project's public Storage
-- address once per project, e.g.:
--   INSERT INTO private.app_config (key, value)
--   VALUES ('storage_public_url', 'https://<project-ref>.supabase.co/storage/v1/object/public/');
CREATE TABLE private.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- The secret key of the email hashes in moderation records, made once per
-- database. Never change or delete it: no stored hash would match again.
INSERT INTO private.app_config (key, value) VALUES ('moderation_salt', gen_random_uuid()::text)
ON CONFLICT (key) DO NOTHING;

REVOKE ALL ON private.moderation_record, private.review_hold, private.app_config FROM PUBLIC, anon, authenticated;

-- An admin can move a rejected signup back to unfinished (R4).
ALTER TABLE public.verification_log
  DROP CONSTRAINT verification_log_decision_check,
  ADD CONSTRAINT verification_log_decision_check
    CHECK (decision IN ('submitted', 'approved', 'needs_info', 'rejected', 'pending', 'incomplete'));

-- A conversation's preview is the start of its last message (F10).
UPDATE public.conversations SET last_message_text = LEFT(last_message_text, 500)
WHERE char_length(last_message_text) > 500;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_last_message_text_length CHECK (char_length(last_message_text) <= 500);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- The version of the Terms of Use members accept now. It must change
-- together with TERMS_VERSION in src/member/LegalModals.jsx: members who
-- accepted another version lose access until they accept this one (the
-- site shows them the Terms screen, which calls accept_terms).
CREATE FUNCTION private.current_terms_version()
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '2026-10'::text;
$$;

-- An email address in one form for matching: lower case, without a "+tag"
-- after the name, and for Gmail without dots in the name and as gmail.com
-- (Gmail delivers all of those to the same inbox). NULL for an empty one.
CREATE FUNCTION private.canonical_email(email TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN m IS NULL THEN NULLIF(x.e, '')
    WHEN m[2] IN ('gmail.com', 'googlemail.com') THEN replace(m[1], '.', '') || '@gmail.com'
    ELSE m[1] || '@' || m[2] END
  FROM (SELECT lower(btrim(COALESCE(email, ''))) AS e) x,
    regexp_match(x.e, '^([^+@]+)(?:\+[^@]*)?@([^@]+)$') AS m;
$$;

-- A keyed hash of an email address in its standard form, for moderation
-- records: it matches the same address again, but without the secret key
-- (private.app_config 'moderation_salt') nobody can test a guessed address
-- against a record. Only for the database's own functions.
CREATE FUNCTION private.email_hash(email TEXT)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT encode(sha256(convert_to(c.value || private.canonical_email(email), 'UTF8')), 'hex')
  FROM private.app_config c
  WHERE c.key = 'moderation_salt' AND private.canonical_email(email) IS NOT NULL;
$$;

-- '<slug>' from any LinkedIn profile link, with %XX escapes decoded (so
-- /in/d%61ve and /in/dave are the same profile); NULL for anything else,
-- including a slug that decodes to characters other than a-z, 0-9, _ . -
CREATE FUNCTION private.linkedin_slug(url TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN s.decoded ~ '^[a-z0-9_.-]+$' THEN s.decoded END
  FROM (
    SELECT lower(string_agg(CASE WHEN c[1] ~* '^%[0-9a-f]{2}$' AND c[1] <> '%00'
                                 THEN chr(('x' || right(c[1], 2))::bit(8)::int) ELSE c[1] END, '' ORDER BY n)) AS decoded
    FROM regexp_matches(substring(private.normalize_linkedin(url) FROM '/in/(.+)$'), '(%[0-9a-f]{2}|.)', 'gi')
      WITH ORDINALITY AS t(c, n)
  ) s;
$$;

-- The moderation record (not the member's own) that an email address or a
-- LinkedIn link matches: one matching both first, then a block before a
-- rejection, then the latest. No row if nothing matches.
CREATE FUNCTION private.moderation_match(member UUID, email TEXT, linkedin_url TEXT)
RETURNS TABLE (record_id UUID, matched_on TEXT)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT r.id, CASE WHEN m.on_email AND m.on_linkedin THEN 'both' WHEN m.on_email THEN 'email' ELSE 'linkedin' END
  FROM (SELECT private.email_hash(email) AS hash, private.linkedin_slug(linkedin_url) AS slug) k
  JOIN private.moderation_record r ON r.email_hash = k.hash OR r.linkedin_slug = k.slug
  CROSS JOIN LATERAL (SELECT COALESCE(r.email_hash = k.hash, FALSE) AS on_email,
                             COALESCE(r.linkedin_slug = k.slug, FALSE) AS on_linkedin) m
  WHERE r.member_id IS DISTINCT FROM member
  ORDER BY (m.on_email AND m.on_linkedin) DESC, (r.decision = 'blocked') DESC, r.created_at DESC
  LIMIT 1;
$$;

-- Holds a member for review if their email address or LinkedIn link matches
-- a rejected or blocked account, and ends an earlier hold if nothing matches
-- now; returns the member's review_flag. Only signup (the email address),
-- submitting details (the email address and the submitted link) and an
-- admin moving a member back to review check: editing a profile doesn't, so
-- nobody can try links one by one and watch their own flag.
CREATE FUNCTION private.recheck_review_hold(member UUID, email TEXT, linkedin_url TEXT)
RETURNS TEXT LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  hit_id UUID;
  hit_on TEXT;
BEGIN
  SELECT m.record_id, m.matched_on INTO hit_id, hit_on
  FROM private.moderation_match(member, email, linkedin_url) m;
  IF hit_id IS NULL THEN
    DELETE FROM private.review_hold h WHERE h.member_id = member;
    UPDATE public.profile_private SET review_flag = '' WHERE id = member AND review_flag <> '';
    RETURN '';
  END IF;
  INSERT INTO private.review_hold (member_id, record_id, matched_on) VALUES (member, hit_id, hit_on)
  ON CONFLICT (member_id) DO UPDATE SET record_id = EXCLUDED.record_id, matched_on = EXCLUDED.matched_on, created_at = NOW();
  UPDATE public.profile_private SET review_flag = 'held' WHERE id = member AND review_flag <> 'held';
  RETURN 'held';
END;
$$;

-- Members who submitted their verification details (pending, needs_info or
-- approved), confirmed they're 18 or older, accepted the current version of
-- the Terms and aren't blocked. A member held for review counts only once
-- approved. Everyone else can still sign in and edit their profile, but
-- can't create content, contact anyone or see other members.
CREATE OR REPLACE FUNCTION private.is_active_member()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_private
    WHERE id = (SELECT auth.uid()) AND status = 'active'
      AND verification_status IN ('pending', 'needs_info', 'approved')
      AND age_confirmed_at IS NOT NULL AND terms_accepted_at IS NOT NULL
      AND terms_version = private.current_terms_version()
      AND (review_flag = '' OR verification_status = 'approved')
  );
$$;

-- Who may see other members and their content.
CREATE FUNCTION private.can_browse()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.is_admin() OR private.is_active_member();
$$;

-- '' / NULL, or a public Storage link in the given bucket inside the
-- signed-in member's own folder (<user id>/...).
CREATE FUNCTION private.is_own_image_url(url TEXT, bucket TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT url IS NULL OR url = '' OR COALESCE(
    url !~* '[[:space:]\\]|\.\.|%2e'
    AND CASE
      WHEN base IS NOT NULL THEN starts_with(url, rtrim(base, '/') || '/' || bucket || '/' || (SELECT auth.uid()) || '/')
      ELSE url ~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/' || bucket || '/' || (SELECT auth.uid()) || '/')
    END, FALSE)
  FROM (SELECT (SELECT value FROM private.app_config WHERE key = 'storage_public_url') AS base) config;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Server-owned columns, as before, and now on INSERT the dates too: created_at,
-- updated_at, joined_at and last_message_at come from the server clock on
-- every table that has them (names a table doesn't have are ignored).
CREATE OR REPLACE FUNCTION private.protect_columns()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  locked JSONB;
BEGIN
  IF current_user <> 'authenticated' OR private.is_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(
      'created_at', NOW(), 'updated_at', NOW(), 'joined_at', NOW(), 'last_message_at', NOW())
      || TG_ARGV[0]::jsonb);
  ELSIF TG_NARGS > 1 THEN
    SELECT jsonb_object_agg(col, to_jsonb(OLD) -> col) INTO locked
    FROM unnest(TG_ARGV[1:TG_NARGS - 1]) AS col;
    NEW := jsonb_populate_record(NEW, locked);
  END IF;
  RETURN NEW;
END;
$$;

-- review_flag is the server's, like the other review fields.
DROP TRIGGER protect_columns ON public.profile_private;
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns(
    '{"verification_status": "incomplete", "status": "active", "age_confirmed_at": null, "terms_accepted_at": null, "terms_version": null, "submitted_at": null, "reviewed_at": null, "verification_message": "", "verification_note": "", "voucher": "", "review_flag": ""}',
    'id', 'email', 'verification_status', 'status', 'age_confirmed_at', 'terms_accepted_at', 'terms_version',
    'verification_note', 'voucher', 'submitted_at', 'reviewed_at', 'verification_message', 'review_flag', 'created_at');

-- Tables that had no protected columns still get server dates on INSERT; a
-- new conversation starts with an empty preview and a message starts unread.
CREATE TRIGGER protect_columns BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{}');
CREATE TRIGGER protect_columns BEFORE INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{}');
CREATE TRIGGER protect_columns BEFORE INSERT ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{}');
CREATE TRIGGER protect_columns BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{"last_message_text": ""}');
CREATE TRIGGER protect_columns BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{"read": false}');
CREATE TRIGGER protect_columns BEFORE INSERT ON public.doc_comments
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{}');
CREATE TRIGGER protect_columns BEFORE INSERT ON public.help_responses
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{}');
CREATE TRIGGER protect_columns BEFORE INSERT ON public.blocks
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{}');

-- Events show the organiser's own name, not free text.
CREATE FUNCTION private.set_organizer_name()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user <> 'authenticated' OR private.is_admin() THEN
    RETURN NEW;
  END IF;
  NEW.organizer_name := COALESCE((SELECT name FROM public.profiles WHERE id = (SELECT auth.uid())), '');
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_organizer_name BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION private.set_organizer_name();

-- Image links written through the API (admins included) must be the
-- writer's own uploads (TG_ARGV: column, bucket, and 'list' for a JSON array
-- of links), so nobody's browser loads images from other sites. Only new or
-- changed values are checked.
CREATE FUNCTION private.check_image_url()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  link TEXT := to_jsonb(NEW) ->> TG_ARGV[0];
  photos JSONB;
  ok BOOLEAN;
BEGIN
  IF current_user <> 'authenticated'
     OR (TG_OP = 'UPDATE' AND link IS NOT DISTINCT FROM to_jsonb(OLD) ->> TG_ARGV[0]) THEN
    RETURN NEW;
  END IF;
  IF TG_NARGS > 2 AND TG_ARGV[2] = 'list' AND COALESCE(link, '') <> '' THEN
    BEGIN
      photos := link::jsonb;
    EXCEPTION WHEN OTHERS THEN
      photos := NULL;
    END;
    ok := jsonb_typeof(photos) = 'array' AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(photos) AS photo
      WHERE jsonb_typeof(photo) <> 'string' OR NOT private.is_own_image_url(photo #>> '{}', TG_ARGV[1]));
  ELSE
    ok := private.is_own_image_url(link, TG_ARGV[1]);
  END IF;
  IF NOT COALESCE(ok, FALSE) THEN
    RAISE EXCEPTION 'Please upload the photo here instead of linking to it.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_image_url BEFORE INSERT OR UPDATE OF avatar_url ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.check_image_url('avatar_url', 'avatars');
CREATE TRIGGER check_image_url BEFORE INSERT OR UPDATE OF image_url ON public.posts
  FOR EACH ROW EXECUTE FUNCTION private.check_image_url('image_url', 'post-images');
-- The site uploads event photos to the post-images bucket.
CREATE TRIGGER check_image_url BEFORE INSERT OR UPDATE OF image_url ON public.events
  FOR EACH ROW EXECUTE FUNCTION private.check_image_url('image_url', 'post-images');
CREATE TRIGGER check_image_url BEFORE INSERT OR UPDATE OF image_url ON public.marketplace
  FOR EACH ROW EXECUTE FUNCTION private.check_image_url('image_url', 'marketplace-images', 'list');

-- A member who changes their name or LinkedIn: after approval they go back
-- to review (as before); while waiting for review the change is logged for
-- the admin, with the name and link before it. The new link isn't looked up
-- in the moderation records (see private.recheck_review_hold).
CREATE OR REPLACE FUNCTION private.reverify_on_identity_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  current_status TEXT;
BEGIN
  IF (SELECT auth.uid()) IS DISTINCT FROM NEW.id OR private.is_admin()
     OR (NEW.linkedin_url IS NOT DISTINCT FROM OLD.linkedin_url AND NEW.name IS NOT DISTINCT FROM OLD.name) THEN
    RETURN NULL;
  END IF;
  SELECT verification_status INTO current_status FROM public.profile_private WHERE id = NEW.id;
  IF current_status = 'approved' THEN
    UPDATE public.profile_private SET verification_status = 'pending', submitted_at = NOW() WHERE id = NEW.id;
    INSERT INTO public.verification_log (member_id, decision, admin_note, actor_id)
    VALUES (NEW.id, 'submitted', 'Changed their name or LinkedIn after approval.', NEW.id);
  ELSIF current_status IN ('pending', 'needs_info')
        AND COALESCE(current_setting('nriclub.submitting', TRUE), '') <> 'on' THEN
    INSERT INTO public.verification_log (member_id, decision, admin_note, actor_id)
    VALUES (NEW.id, 'submitted', LEFT('Changed their name or LinkedIn while waiting for review. Before: '
      || OLD.name || ', ' || COALESCE(NULLIF(OLD.linkedin_url, ''), 'no LinkedIn') || '.', 2000), NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

-- Keep a moderation record when a member is rejected or blocked (with the
-- admin's note, which review_member passes in nriclub.moderation_note), and
-- drop it when an admin reverses that decision. A record only ever holds a
-- LinkedIn link an admin had in front of them: the profile's link when the
-- member is first rejected or blocked, after that the link already on
-- record (a rejected or blocked member can still edit their profile).
CREATE FUNCTION private.record_moderation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  note TEXT := LEFT(COALESCE(current_setting('nriclub.moderation_note', TRUE), ''), 2000);
  kind TEXT;
  is_now BOOLEAN;
  was BOOLEAN;
  earlier private.moderation_record;
BEGIN
  FOREACH kind IN ARRAY ARRAY['rejected', 'blocked'] LOOP
    is_now := CASE kind WHEN 'rejected' THEN NEW.verification_status = 'rejected' ELSE NEW.status = 'blocked' END;
    was := TG_OP = 'UPDATE' AND CASE kind WHEN 'rejected' THEN OLD.verification_status = 'rejected' ELSE OLD.status = 'blocked' END;
    IF is_now AND NOT was THEN
      SELECT * INTO earlier FROM private.moderation_record r WHERE r.member_id = NEW.id ORDER BY r.created_at LIMIT 1;
      INSERT INTO private.moderation_record (member_id, email_hash, linkedin_slug, decision, admin_note)
      VALUES (NEW.id, private.email_hash(NEW.email),
        CASE WHEN earlier.id IS NOT NULL THEN earlier.linkedin_slug
             ELSE (SELECT private.linkedin_slug(p.linkedin_url) FROM public.profiles p WHERE p.id = NEW.id) END,
        kind, CASE WHEN kind = 'rejected' THEN note ELSE '' END);
    ELSIF is_now AND NEW.email IS DISTINCT FROM OLD.email THEN
      -- A new email address: one more record, with the link, note and date
      -- of the decision.
      SELECT * INTO earlier FROM private.moderation_record r
      WHERE r.member_id = NEW.id AND r.decision = kind ORDER BY r.created_at LIMIT 1;
      IF NOT EXISTS (SELECT 1 FROM private.moderation_record r WHERE r.member_id = NEW.id AND r.decision = kind
                     AND r.email_hash = private.email_hash(NEW.email)) THEN
        INSERT INTO private.moderation_record (member_id, email_hash, linkedin_slug, decision, admin_note, created_at)
        VALUES (NEW.id, private.email_hash(NEW.email), earlier.linkedin_slug, kind,
          COALESCE(earlier.admin_note, ''), COALESCE(earlier.created_at, NOW()));
      END IF;
    ELSIF is_now AND kind = 'rejected' AND note <> '' THEN
      UPDATE private.moderation_record r SET admin_note = note
      WHERE r.member_id = NEW.id AND r.decision = 'rejected';
    ELSIF was AND NOT is_now THEN
      DELETE FROM private.moderation_record r WHERE r.member_id = NEW.id AND r.decision = kind;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER moderation_record AFTER INSERT OR UPDATE OF verification_status, status, email ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION private.record_moderation();

-- A deleted account's moderation records stay, but no longer say whose
-- account it was (its id is also the folder name of any photos left in
-- Storage). A trigger, not a foreign key: a foreign key would lock the
-- profile row each time a block adds a record, in the opposite order to
-- review_member, and the two could deadlock.
CREATE FUNCTION private.forget_moderation_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE private.moderation_record SET member_id = NULL WHERE member_id = OLD.id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER forget_moderation_member AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.forget_moderation_member();

-- Signup: no name means an empty name (never part of the email address),
-- and someone whose email address matches a rejected or blocked account is
-- held for review. Only the email address: anyone can put any LinkedIn link
-- in the signup data (also of an address they don't own), so the link is
-- checked when the member submits it.
CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  -- Only what the signup form sends (name and country). Anything else in the
  -- metadata is ignored: whoever registers an address first through the API
  -- must not be able to leave a LinkedIn link, hometown or job on it.
  INSERT INTO public.profiles (id, name, country_code, email_verified)
  VALUES (
    NEW.id,
    LEFT(COALESCE(NULLIF(BTRIM(meta ->> 'full_name'), ''), NULLIF(BTRIM(meta ->> 'name'), ''), ''), 200),
    CASE WHEN UPPER(COALESCE(meta ->> 'country_code', '')) ~ '^[A-Z]{2}$' THEN UPPER(meta ->> 'country_code') ELSE '' END,
    NEW.email_confirmed_at IS NOT NULL
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profile_private (id, email, gdpr_consent, marketing_consent,
    age_confirmed_at, terms_accepted_at, terms_version)
  VALUES (NEW.id, NEW.email,
    COALESCE(meta ->> 'gdpr_consent', '') = 'true',
    COALESCE(meta ->> 'marketing_consent', '') = 'true',
    CASE WHEN COALESCE(meta ->> 'age_confirmed', '') = 'true' THEN NOW() END,
    CASE WHEN COALESCE(meta ->> 'terms_version', '') <> '' THEN NOW() END,
    NULLIF(LEFT(COALESCE(meta ->> 'terms_version', ''), 20), ''))
  ON CONFLICT (id) DO NOTHING;
  IF FOUND THEN
    PERFORM private.recheck_review_hold(NEW.id, NEW.email, NULL);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO anon, authenticated, service_role;
-- Only the database's own functions match against moderation records.
REVOKE EXECUTE ON FUNCTION private.email_hash(TEXT), private.moderation_match(UUID, TEXT, TEXT),
  private.recheck_review_hold(UUID, TEXT, TEXT) FROM anon, authenticated;

-- ============================================================================
-- RPC: member preferences, verification, Terms and data export
-- ============================================================================

-- Only members who can see other members can look up their settings.
CREATE OR REPLACE FUNCTION public.get_member_preferences(member UUID)
RETURNS TABLE (namaste_requests TEXT, receive_messages TEXT, profile_visibility TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.namaste_requests, s.receive_messages, s.profile_visibility
  FROM public.user_settings s
  WHERE s.user_id = member AND (SELECT auth.uid()) IS NOT NULL AND private.can_browse();
$$;

-- As before, plus: the member's rows are locked first (in the same order as
-- review_member, so the two wait for each other instead of overwriting each
-- other), blocked members can't submit, p_accept_terms records the current
-- Terms version, and the email address and the submitted LinkedIn link are
-- checked against rejected and blocked accounts (a match holds the member
-- for review; no match ends an earlier hold).
CREATE OR REPLACE FUNCTION public.submit_verification(
  p_city TEXT, p_country_code TEXT, p_location TEXT,
  p_linkedin_url TEXT, p_note TEXT, p_voucher TEXT, p_profession TEXT,
  p_accept_terms BOOLEAN DEFAULT FALSE)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  current_status TEXT;
  current_block TEXT;
  current_email TEXT;
  v_linkedin TEXT := NULLIF(BTRIM(COALESCE(p_linkedin_url, '')), '');
  normalized TEXT;
  v_note TEXT := BTRIM(COALESCE(p_note, ''));
  v_city TEXT := BTRIM(COALESCE(p_city, ''));
  v_country TEXT := UPPER(BTRIM(COALESCE(p_country_code, '')));
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.profiles WHERE id = uid FOR UPDATE;
  SELECT verification_status, status, email INTO current_status, current_block, current_email
  FROM public.profile_private WHERE id = uid FOR UPDATE;
  IF current_block = 'blocked' THEN
    RAISE EXCEPTION 'Your profile has been blocked, so your details can''t be submitted.' USING ERRCODE = 'P0001';
  END IF;
  IF current_status IS NULL OR current_status NOT IN ('incomplete', 'pending', 'needs_info') THEN
    RAISE EXCEPTION 'Your verification can''t be changed right now.' USING ERRCODE = 'P0001';
  END IF;
  IF p_accept_terms THEN
    UPDATE public.profile_private SET
      age_confirmed_at = COALESCE(age_confirmed_at, NOW()),
      terms_accepted_at = CASE WHEN terms_accepted_at IS NULL OR terms_version IS DISTINCT FROM private.current_terms_version()
                               THEN NOW() ELSE terms_accepted_at END,
      terms_version = private.current_terms_version()
    WHERE id = uid;
  END IF;
  IF EXISTS (SELECT 1 FROM public.profile_private
             WHERE id = uid AND (age_confirmed_at IS NULL OR terms_accepted_at IS NULL)) THEN
    RAISE EXCEPTION 'Please confirm you''re 18 or older and accept the Terms of Use.' USING ERRCODE = 'P0001';
  END IF;
  IF v_city = '' OR char_length(v_city) > 200 THEN
    RAISE EXCEPTION 'Please enter the city you live in.' USING ERRCODE = 'P0001';
  END IF;
  IF v_country !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Please choose your country.' USING ERRCODE = 'P0001';
  END IF;
  IF v_linkedin IS NOT NULL THEN
    normalized := private.normalize_linkedin(v_linkedin);
    IF normalized IS NULL THEN
      RAISE EXCEPTION 'That doesn''t look like a LinkedIn profile link (linkedin.com/in/your-name).' USING ERRCODE = 'P0001';
    END IF;
  ELSIF char_length(v_note) < 20 THEN
    RAISE EXCEPTION 'Tell us in a sentence or two how you''re connected to the community.' USING ERRCODE = 'P0001';
  END IF;

  -- The submission itself is logged below, not as a change while waiting.
  PERFORM set_config('nriclub.submitting', 'on', TRUE);
  UPDATE public.profiles SET
    city = v_city,
    country_code = v_country,
    location = LEFT(COALESCE(NULLIF(BTRIM(COALESCE(p_location, '')), ''), v_city), 200),
    linkedin_url = COALESCE(normalized, ''),
    profession = CASE WHEN p_profession IS NULL THEN profession ELSE LEFT(BTRIM(p_profession), 200) END
  WHERE id = uid;
  PERFORM set_config('nriclub.submitting', '', TRUE);
  UPDATE public.profile_private SET
    verification_status = 'pending',
    verification_note = LEFT(v_note, 1000),
    voucher = LEFT(BTRIM(COALESCE(p_voucher, '')), 200),
    submitted_at = NOW()
  WHERE id = uid;
  PERFORM private.recheck_review_hold(uid, current_email, normalized);
  INSERT INTO public.verification_log (member_id, decision, actor_id) VALUES (uid, 'submitted', uid);
  RETURN 'pending';
END;
$$;

-- An admin decides on a member:
--   approved / needs_info: only for members waiting for review (pending or needs_info)
--   rejected: any member (a message to the member is required, as for needs_info)
--   pending: reopens an approved, needs_info or rejected member (also Undo),
--     except a member rejected before ever sending their details
--   incomplete: moves a member rejected before ever sending their details
--     back to unfinished (also Undo of that rejection); the rejection's
--     moderation record goes, and the member isn't notified
-- p_expected_status / _name / _linkedin are what the admin saw; if the
-- member's verification status, name or LinkedIn changed since, nothing is
-- decided. Approving (or moving back to unfinished) ends a hold for review;
-- back in review (e.g. Undo of an approval) the member is checked against
-- rejected and blocked accounts again.
-- Every other decision leaves the member one unread notification with it.
DROP FUNCTION public.review_member(UUID, TEXT, TEXT, TEXT);
CREATE FUNCTION public.review_member(p_member UUID, p_decision TEXT, p_message TEXT, p_admin_note TEXT,
  p_expected_name TEXT DEFAULT NULL, p_expected_linkedin TEXT DEFAULT NULL, p_expected_status TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  message TEXT := LEFT(BTRIM(COALESCE(p_message, '')), 1000);
  note TEXT := LEFT(BTRIM(COALESCE(p_admin_note, '')), 2000);
  current_status TEXT;
  current_flag TEXT;
  current_submitted TIMESTAMPTZ;
  current_email TEXT;
  current_name TEXT;
  current_linkedin TEXT;
  ever_submitted BOOLEAN;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'needs_info', 'rejected', 'pending', 'incomplete') THEN
    RAISE EXCEPTION 'Unknown decision %', p_decision USING ERRCODE = 'P0001';
  END IF;
  IF p_decision IN ('needs_info', 'rejected') AND message = '' THEN
    RAISE EXCEPTION 'Add a message for the member.' USING ERRCODE = 'P0001';
  END IF;

  -- Lock the member (profile first, then the private row, as
  -- submit_verification does) until this decision is saved.
  SELECT name, linkedin_url INTO current_name, current_linkedin
  FROM public.profiles WHERE id = p_member FOR UPDATE;
  SELECT verification_status, review_flag, submitted_at, email
  INTO current_status, current_flag, current_submitted, current_email
  FROM public.profile_private WHERE id = p_member FOR UPDATE;
  IF current_status IS NULL THEN
    RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_status IS NOT NULL AND p_expected_status IS DISTINCT FROM current_status THEN
    RAISE EXCEPTION 'This member''s status changed. Reload to see the latest.' USING ERRCODE = 'P0001';
  END IF;
  -- Sent their details at some point (or were approved before that step
  -- existed: the migration gave those members a submission date).
  ever_submitted := current_submitted IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.verification_log l WHERE l.member_id = p_member AND l.decision = 'submitted');
  IF p_decision IN ('approved', 'needs_info', 'pending') AND current_status = 'incomplete' THEN
    RAISE EXCEPTION 'This member hasn''t submitted their details yet.' USING ERRCODE = 'P0001';
  END IF;
  IF p_decision = 'pending' AND current_status = 'rejected' AND NOT ever_submitted THEN
    RAISE EXCEPTION 'This member hasn''t submitted their details yet. Move them back to unfinished instead.'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_decision = 'incomplete' AND current_status = 'rejected' AND ever_submitted THEN
    RAISE EXCEPTION 'This member has sent their details. Move them back to pending instead.' USING ERRCODE = 'P0001';
  END IF;
  IF p_decision = 'incomplete' AND current_status <> 'rejected' THEN
    RAISE EXCEPTION 'Only a rejected member who never sent their details can be moved back to unfinished.'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_decision IN ('approved', 'needs_info') AND current_status NOT IN ('pending', 'needs_info') THEN
    RAISE EXCEPTION 'This member isn''t waiting for review. Move them back to pending first.' USING ERRCODE = 'P0001';
  END IF;
  IF p_decision = 'pending' AND current_status = 'pending' THEN
    RAISE EXCEPTION 'This member is already waiting for review.' USING ERRCODE = 'P0001';
  END IF;
  IF (p_expected_name IS NOT NULL AND p_expected_name IS DISTINCT FROM current_name)
     OR (p_expected_linkedin IS NOT NULL AND p_expected_linkedin IS DISTINCT FROM current_linkedin) THEN
    RAISE EXCEPTION 'This member changed their details. Reload to see the latest.' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('nriclub.moderation_note', note, TRUE);
  UPDATE public.profile_private SET
    verification_status = p_decision,
    -- Back in review counts as sent, so a later rejection can be undone.
    submitted_at = CASE WHEN p_decision = 'pending' THEN COALESCE(submitted_at, NOW()) ELSE submitted_at END,
    reviewed_at = CASE WHEN p_decision IN ('pending', 'incomplete') THEN NULL ELSE NOW() END,
    verification_message = CASE WHEN p_decision IN ('needs_info', 'rejected') THEN message ELSE '' END,
    review_flag = CASE WHEN p_decision IN ('approved', 'incomplete') THEN '' ELSE review_flag END
  WHERE id = p_member;
  PERFORM set_config('nriclub.moderation_note', '', TRUE);
  IF p_decision IN ('approved', 'incomplete') THEN
    DELETE FROM private.review_hold h WHERE h.member_id = p_member;
  ELSIF p_decision = 'pending' AND current_flag = '' THEN
    PERFORM private.recheck_review_hold(p_member, current_email, current_linkedin);
  END IF;
  -- Only the latest decision should be waiting in the member's notifications.
  DELETE FROM public.notifications WHERE user_id = p_member AND type = 'verification' AND NOT read;
  INSERT INTO public.verification_log (member_id, decision, member_message, admin_note, actor_id)
  VALUES (p_member, p_decision, message, note, auth.uid());
  IF p_decision <> 'incomplete' THEN
    INSERT INTO public.notifications (user_id, type, text)
    VALUES (p_member, 'verification', CASE p_decision
      WHEN 'approved' THEN 'You''re verified. Welcome to NRIClub!'
      WHEN 'needs_info' THEN LEFT('We need a little more information to verify you: ' || message, 1000)
      WHEN 'pending' THEN 'Your profile is back in review.'
      ELSE LEFT('Your membership request wasn''t approved: ' || message, 1000)
    END);
  END IF;
  RETURN p_decision;
END;
$$;

-- The admin review queue, now with the review flag and, for a member held
-- for review, what they matched: the earlier decision, its note and date,
-- and whether the email address, the LinkedIn link or both matched (all
-- empty if that decision was reversed since). same_linkedin_count compares
-- links in their standard form. Unfinished signups (incomplete) come newest
-- first, so the latest are within the API's 1,000-row limit; everyone else
-- oldest first, as before.
DROP FUNCTION public.admin_verification_queue(TEXT[]);
CREATE FUNCTION public.admin_verification_queue(p_statuses TEXT[] DEFAULT ARRAY['pending'])
RETURNS TABLE (
  id UUID, name TEXT, avatar_url TEXT, email TEXT, email_verified BOOLEAN,
  city TEXT, country_code TEXT, location TEXT, hometown TEXT, profession TEXT,
  linkedin_url TEXT, verification_note TEXT, voucher TEXT,
  verification_status TEXT, status TEXT, verification_message TEXT,
  created_at TIMESTAMPTZ, submitted_at TIMESTAMPTZ, reviewed_at TIMESTAMPTZ,
  age_confirmed_at TIMESTAMPTZ, terms_accepted_at TIMESTAMPTZ,
  same_linkedin_count INTEGER, previous_decisions INTEGER, review_flag TEXT,
  flag_decision TEXT, flag_matched_on TEXT, flag_note TEXT, flag_date TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH links AS (
    SELECT private.linkedin_slug(o.linkedin_url) AS slug, count(*)::int AS n
    FROM public.profiles o WHERE o.linkedin_url <> ''
    GROUP BY 1)
  SELECT p.id, p.name, p.avatar_url, pp.email, p.email_verified,
    p.city, p.country_code, p.location, p.hometown, p.profession,
    p.linkedin_url, pp.verification_note, pp.voucher,
    pp.verification_status, pp.status, pp.verification_message,
    p.created_at, pp.submitted_at, pp.reviewed_at,
    pp.age_confirmed_at, pp.terms_accepted_at,
    COALESCE(li.n - 1, 0),
    (SELECT count(*)::int FROM public.verification_log l
      WHERE l.member_id = p.id AND l.decision IN ('approved', 'needs_info', 'rejected')),
    pp.review_flag, r.decision, h.matched_on, r.admin_note, r.created_at
  FROM public.profiles p
  LEFT JOIN public.profile_private pp ON pp.id = p.id
  LEFT JOIN links li ON li.slug = private.linkedin_slug(p.linkedin_url)
  LEFT JOIN private.review_hold h ON h.member_id = p.id AND pp.review_flag = 'held'
  LEFT JOIN private.moderation_record r ON r.id = h.record_id
  WHERE pp.verification_status = ANY (p_statuses)
  ORDER BY pp.submitted_at NULLS LAST,
    CASE WHEN pp.verification_status = 'incomplete' THEN p.created_at END DESC NULLS LAST,
    p.created_at;
END;
$$;

-- A member confirms they're 18 or older and accepts the current Terms of
-- Use (p_version is the version the site showed them). Accepting a newer
-- version than the one on record stamps a new acceptance date.
CREATE FUNCTION public.accept_terms(p_version TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  version TEXT := private.current_terms_version();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_version IS DISTINCT FROM version THEN
    RAISE EXCEPTION 'The Terms of Use have been updated. Please reload the page and try again.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.profile_private SET
    age_confirmed_at = COALESCE(age_confirmed_at, NOW()),
    terms_accepted_at = CASE WHEN terms_accepted_at IS NULL OR terms_version IS DISTINCT FROM version
                             THEN NOW() ELSE terms_accepted_at END,
    terms_version = version
  WHERE id = uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0001';
  END IF;
  RETURN version;
END;
$$;

-- Everything stored about the signed-in member, for "Download my data".
-- The verification history has each decision and the message the member
-- was sent; a 'note' only on entries the member's own actions wrote (e.g.
-- their name and LinkedIn before a change), never the admins' notes or
-- names (the Privacy Policy says those are available on request).
CREATE FUNCTION public.export_my_data()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'exported_at', NOW(),
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = uid),
    'profile_private', (SELECT to_jsonb(pp) FROM public.profile_private pp WHERE pp.id = uid),
    'user_settings', (SELECT to_jsonb(s) FROM public.user_settings s WHERE s.user_id = uid),
    'verification_log', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'decision', l.decision, 'member_message', l.member_message, 'created_at', l.created_at)
        || CASE WHEN l.actor_id = uid THEN jsonb_build_object('note', l.admin_note) ELSE '{}'::jsonb END
        ORDER BY l.created_at)
      FROM public.verification_log l WHERE l.member_id = uid), '[]'::jsonb),
    'posts', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.posts x WHERE x.user_id = uid), '[]'::jsonb),
    'comments', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.comments x WHERE x.user_id = uid), '[]'::jsonb),
    'likes', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.likes x WHERE x.user_id = uid), '[]'::jsonb),
    'connections', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.connections x WHERE uid IN (x.requester_id, x.recipient_id)), '[]'::jsonb),
    'group_memberships', COALESCE((SELECT jsonb_agg(to_jsonb(x) || jsonb_build_object('group_name', g.name) ORDER BY x.joined_at)
      FROM public.group_members x LEFT JOIN public.groups g ON g.id = x.group_id WHERE x.user_id = uid), '[]'::jsonb),
    'groups_requested', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.groups x WHERE x.created_by = uid), '[]'::jsonb),
    'events_organised', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.events x WHERE x.organizer_id = uid), '[]'::jsonb),
    'event_rsvps', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.event_rsvps x WHERE x.user_id = uid), '[]'::jsonb),
    'conversations', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.conversations x WHERE uid IN (x.participant_1, x.participant_2)), '[]'::jsonb),
    'messages', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.messages x JOIN public.conversations c ON c.id = x.conversation_id
      WHERE uid IN (c.participant_1, c.participant_2)), '[]'::jsonb),
    'marketplace_listings', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.marketplace x WHERE x.user_id = uid), '[]'::jsonb),
    'docs', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.docs x WHERE x.user_id = uid), '[]'::jsonb),
    'doc_comments', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.doc_comments x WHERE x.user_id = uid), '[]'::jsonb),
    'help_requests', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.help_requests x WHERE x.user_id = uid), '[]'::jsonb),
    'help_responses', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.help_responses x WHERE x.user_id = uid), '[]'::jsonb),
    'notifications', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.notifications x WHERE x.user_id = uid), '[]'::jsonb),
    'reports_filed', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.reports x WHERE x.reporter_id = uid), '[]'::jsonb),
    'blocks', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.blocks x WHERE x.blocker_id = uid), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_member(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_verification_queue(TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_terms(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.export_my_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_member(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verification_queue(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_terms(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY: other members' rows need private.can_browse(); your
-- own rows stay readable. Approved groups stay readable by every signed-in
-- member (Get verified suggests cities from them).
-- ============================================================================

DROP POLICY "Members can view profiles" ON public.profiles;
CREATE POLICY "Members can view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid()) OR (SELECT private.can_browse()));

DROP POLICY "Members can view group members" ON public.group_members;
CREATE POLICY "Members can view group members" ON public.group_members
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT private.can_browse()));

DROP POLICY "Members can view posts" ON public.posts;
CREATE POLICY "Members can view posts" ON public.posts
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT private.can_browse()));

DROP POLICY "Members can view comments" ON public.comments;
CREATE POLICY "Members can view comments" ON public.comments
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT private.can_browse()));

DROP POLICY "Members can view likes" ON public.likes;
CREATE POLICY "Members can view likes" ON public.likes
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT private.can_browse()));

-- Accepted connections are visible to members who can browse (follower
-- counts); any request only to the two people involved.
DROP POLICY "Members can view connections" ON public.connections;
CREATE POLICY "Members can view connections" ON public.connections
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (requester_id, recipient_id) OR (status = 'accepted' AND (SELECT private.can_browse())));

-- Only active members can accept a Namaste request (an accepted connection
-- is seen by other members and opens "Connections only" messaging); anyone
-- can still ignore one, or remove it.
DROP POLICY "Recipients can answer Namaste requests" ON public.connections;
CREATE POLICY "Recipients can answer Namaste requests" ON public.connections
  FOR UPDATE TO authenticated
  USING (recipient_id = (SELECT auth.uid()))
  WITH CHECK (recipient_id = (SELECT auth.uid()) AND (status <> 'accepted' OR (SELECT private.is_active_member())));

DROP POLICY "Members can view events" ON public.events;
CREATE POLICY "Members can view events" ON public.events
  FOR SELECT TO authenticated USING (organizer_id = (SELECT auth.uid()) OR (SELECT private.can_browse()));

DROP POLICY "Members can view RSVPs" ON public.event_rsvps;
CREATE POLICY "Members can view RSVPs" ON public.event_rsvps
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT private.can_browse()));

DROP POLICY "Members can view listings" ON public.marketplace;
CREATE POLICY "Members can view listings" ON public.marketplace
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT private.can_browse()));

DROP POLICY "Members can view docs" ON public.docs;
CREATE POLICY "Members can view docs" ON public.docs
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT private.can_browse()));

DROP POLICY "Members can view doc comments" ON public.doc_comments;
CREATE POLICY "Members can view doc comments" ON public.doc_comments
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT private.can_browse()));

DROP POLICY "Members can view help requests" ON public.help_requests;
CREATE POLICY "Members can view help requests" ON public.help_requests
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT private.can_browse()));

DROP POLICY "Members can view help responses" ON public.help_responses;
CREATE POLICY "Members can view help responses" ON public.help_responses
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT private.can_browse()));

-- Conversations stay private to the two members, admins included: removing
-- one (e.g. spam) is done in the SQL editor until the site has a delete
-- action (docs/BACKLOG.md).

-- NOTIFICATIONS: members notify others in their own name, never someone who
-- blocked them (or whom they blocked). A like or comment notification must
-- point at a post of the person notified; a Namaste notification at the
-- matching pending request. Admins can notify anyone.
DROP POLICY "Users can notify other members" ON public.notifications;
CREATE POLICY "Users can notify other members" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      actor_id = (SELECT auth.uid())
      AND type IN ('like', 'comment', 'request')
      AND user_id <> (SELECT auth.uid())
      AND private.is_active_member()
      AND NOT private.is_blocked_between(actor_id, user_id)
      AND CASE type
        WHEN 'request' THEN EXISTS (
          SELECT 1 FROM public.connections c
          WHERE c.id = reference_id AND c.requester_id = actor_id
            AND c.recipient_id = notifications.user_id AND c.status = 'pending')
        ELSE EXISTS (
          SELECT 1 FROM public.posts p
          WHERE p.id = reference_id AND p.user_id = notifications.user_id)
      END
    )
    OR private.is_admin()
  );

-- ============================================================================
-- EXISTING DATA
-- ============================================================================

-- (supabase/tests/rls_test.py runs this section again, in a transaction it
-- rolls back, to check the changes to existing rows.)

-- Members already rejected or blocked get their moderation record now.
INSERT INTO private.moderation_record (member_id, email_hash, linkedin_slug, decision, admin_note, created_at)
SELECT pp.id, private.email_hash(pp.email), private.linkedin_slug(p.linkedin_url), 'rejected',
  COALESCE((SELECT l.admin_note FROM public.verification_log l
            WHERE l.member_id = pp.id AND l.decision = 'rejected' ORDER BY l.created_at DESC LIMIT 1), ''),
  COALESCE(pp.reviewed_at, NOW())
FROM public.profile_private pp
JOIN public.profiles p ON p.id = pp.id
WHERE pp.verification_status = 'rejected';
INSERT INTO private.moderation_record (member_id, email_hash, linkedin_slug, decision)
SELECT pp.id, private.email_hash(pp.email), private.linkedin_slug(p.linkedin_url), 'blocked'
FROM public.profile_private pp
JOIN public.profiles p ON p.id = pp.id
WHERE pp.status = 'blocked';

-- Members approved or waiting for review have sent their details, or were
-- approved before that step existed: they get a submission date (when they
-- joined), so after a rejection an admin can still move them back to
-- pending.
UPDATE public.profile_private SET submitted_at = COALESCE(created_at, NOW())
WHERE submitted_at IS NULL AND verification_status IN ('approved', 'pending', 'needs_info');
-- So do rejected members whose history shows they sent their details (the
-- first time they did): the admin panel goes by the submission date when it
-- offers Move to pending or Move back to unfinished.
UPDATE public.profile_private pp SET submitted_at = s.first_sent
FROM (SELECT l.member_id, min(l.created_at) AS first_sent FROM public.verification_log l
      WHERE l.decision = 'submitted' GROUP BY l.member_id) s
WHERE s.member_id = pp.id AND pp.submitted_at IS NULL AND pp.verification_status = 'rejected';

-- Marketing consent stays exactly as each member gave it
-- (profile_private.marketing_consent). user_settings.marketing_emails says
-- nothing about it: that column is FALSE by default, also for members who
-- never touched the switch.

-- Names that are an email address, or the part before the @, were filled in
-- from the email (accounts created outside the site's signup). A name the
-- member gave when signing up is kept, even one like "rahul" for
-- rahul@gmail.com.
UPDATE public.profiles p SET name = ''
FROM public.profile_private pp
WHERE pp.id = p.id AND p.name <> '' AND NULLIF(BTRIM(COALESCE(pp.email, '')), '') IS NOT NULL
  AND (lower(p.name) = lower(BTRIM(pp.email)) OR p.name = LEFT(SPLIT_PART(BTRIM(pp.email), '@', 1), 200))
  AND NOT EXISTS (SELECT 1 FROM auth.users u
                  WHERE u.id = p.id AND (BTRIM(COALESCE(u.raw_user_meta_data ->> 'full_name', '')) <> ''
                                         OR BTRIM(COALESCE(u.raw_user_meta_data ->> 'name', '')) <> ''));

-- A date in the future can only have been made up by the client.
UPDATE public.posts SET created_at = NOW() WHERE created_at > NOW();
UPDATE public.posts SET updated_at = NOW() WHERE updated_at > NOW();
UPDATE public.comments SET created_at = NOW() WHERE created_at > NOW();
UPDATE public.likes SET created_at = NOW() WHERE created_at > NOW();
UPDATE public.connections SET created_at = NOW() WHERE created_at > NOW();
UPDATE public.groups SET created_at = NOW() WHERE created_at > NOW();
UPDATE public.group_members SET joined_at = NOW() WHERE joined_at > NOW();
UPDATE public.events SET created_at = NOW() WHERE created_at > NOW();
UPDATE public.event_rsvps SET created_at = NOW() WHERE created_at > NOW();
UPDATE public.conversations SET created_at = NOW() WHERE created_at > NOW();
UPDATE public.conversations SET last_message_at = NOW() WHERE last_message_at > NOW();
UPDATE public.messages SET created_at = NOW() WHERE created_at > NOW();
UPDATE public.marketplace SET created_at = NOW() WHERE created_at > NOW();
UPDATE public.docs SET created_at = NOW() WHERE created_at > NOW();
UPDATE public.doc_comments SET created_at = NOW() WHERE created_at > NOW();
UPDATE public.help_requests SET created_at = NOW() WHERE created_at > NOW();
UPDATE public.help_responses SET created_at = NOW() WHERE created_at > NOW();
UPDATE public.notifications SET created_at = NOW() WHERE created_at > NOW();
UPDATE public.reports SET created_at = NOW() WHERE created_at > NOW();
UPDATE public.blocks SET created_at = NOW() WHERE created_at > NOW();

-- Group member counts are the real number of members (the seed and the
-- Phase 1 reset kept made-up starting numbers).
UPDATE public.groups g SET members_count = m.n
FROM (SELECT g2.id, (SELECT count(*)::int FROM public.group_members gm WHERE gm.group_id = g2.id) AS n
      FROM public.groups g2) m
WHERE m.id = g.id AND g.members_count IS DISTINCT FROM m.n;
