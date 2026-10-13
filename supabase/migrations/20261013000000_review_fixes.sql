-- ============================================================================
-- NRIclub: fixes from the Phase 1 review (2026-10-12)
--
-- Runs after 20261012000000_nriclub_schema.sql, on a database that may
-- already hold members and content. No rows are deleted. Existing rows are
-- only changed where noted (marketing consent, forged dates, over-long
-- message previews, names copied from email addresses, group member counts).
--
-- What changes
--   * Only active members (and admins) can read other members' rows; rejected,
--     blocked and unverified accounts can still read their own (F2).
--   * Being active now also needs the 18+ and Terms records (F14), and a
--     member who matches a rejected or blocked account starts flagged for
--     review and isn't active until an admin approves them (F7).
--   * Verification decisions lock the member's rows, follow the allowed
--     status changes and refuse if the member changed their name or LinkedIn
--     since the admin looked (F5, F6, F25, F31).
--   * The server sets dates, message previews and organiser names (F10, F21);
--     notifications must point at the right post (F22); image links must be
--     the member's own uploads (F23).
--   * New RPCs: accept_terms() and export_my_data() (F14, F16).
-- ============================================================================

-- ============================================================================
-- TABLES
-- ============================================================================

-- Why a member waits for a closer look ('' = nothing to check), e.g.
-- 'previously rejected'. Set by the server; cleared when an admin approves.
ALTER TABLE public.profile_private
  ADD COLUMN review_flag TEXT NOT NULL DEFAULT '' CHECK (char_length(review_flag) <= 100);

-- The site keeps marketing consent in profile_private.marketing_consent only.
COMMENT ON COLUMN public.user_settings.marketing_emails IS
  'Deprecated: no longer read or written by the site. Marketing consent is profile_private.marketing_consent.';

-- Rejections and blocks, kept after the account is deleted so the same
-- person signing up again is flagged for review. Holds no email address,
-- only its SHA-256 hash, plus the LinkedIn slug and the admin's note.
-- In the private schema: not reachable through the API.
CREATE TABLE private.moderation_record (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID,                                   -- the account at the time; no foreign key on purpose
  email_hash TEXT,
  linkedin_slug TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('rejected', 'blocked')),
  admin_note TEXT NOT NULL DEFAULT '' CHECK (char_length(admin_note) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_moderation_record_email ON private.moderation_record(email_hash);
CREATE INDEX idx_moderation_record_linkedin ON private.moderation_record(linkedin_slug);
CREATE INDEX idx_moderation_record_member ON private.moderation_record(member_id);

-- Settings the database needs to know. Set the project's public Storage
-- address once per project, e.g.:
--   INSERT INTO private.app_config (key, value)
--   VALUES ('storage_public_url', 'https://<project-ref>.supabase.co/storage/v1/object/public/');
CREATE TABLE private.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

REVOKE ALL ON private.moderation_record, private.app_config FROM PUBLIC, anon, authenticated;

-- A conversation's preview is the start of its last message (F10).
UPDATE public.conversations SET last_message_text = LEFT(last_message_text, 500)
WHERE char_length(last_message_text) > 500;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_last_message_text_length CHECK (char_length(last_message_text) <= 500);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- The version of the Terms of Use members accept now.
CREATE FUNCTION private.current_terms_version()
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '2026-10'::text;
$$;

CREATE FUNCTION private.email_hash(email TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT encode(sha256(convert_to(lower(btrim(email)), 'UTF8')), 'hex')
  WHERE NULLIF(btrim(COALESCE(email, '')), '') IS NOT NULL;
$$;

-- '<slug>' from any LinkedIn profile link; NULL for anything else.
CREATE FUNCTION private.linkedin_slug(url TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT substring(private.normalize_linkedin(url) FROM '/in/(.+)$');
$$;

-- 'previously blocked' or 'previously rejected' if the email or LinkedIn
-- link belongs to an account that was blocked or rejected (other than this
-- member's own current account); '' otherwise.
CREATE FUNCTION private.moderation_flag(member UUID, email TEXT, linkedin_url TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((
    SELECT 'previously ' || r.decision
    FROM private.moderation_record r
    WHERE (r.email_hash = private.email_hash(email) OR r.linkedin_slug = private.linkedin_slug(linkedin_url))
      AND r.member_id IS DISTINCT FROM member
    ORDER BY (r.decision = 'blocked') DESC
    LIMIT 1), '');
$$;

-- Members who submitted their verification details (pending, needs_info or
-- approved), confirmed they're 18 or older, accepted the Terms and aren't
-- blocked. A member flagged for review counts only once approved. Everyone
-- else can still sign in and edit their profile, but can't create content,
-- contact anyone or see other members.
CREATE OR REPLACE FUNCTION private.is_active_member()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_private
    WHERE id = (SELECT auth.uid()) AND status = 'active'
      AND verification_status IN ('pending', 'needs_info', 'approved')
      AND age_confirmed_at IS NOT NULL AND terms_accepted_at IS NOT NULL
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
-- the admin. A LinkedIn link that belongs to a rejected or blocked account
-- flags them for a closer look.
CREATE OR REPLACE FUNCTION private.reverify_on_identity_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  current_status TEXT;
  flag TEXT;
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
  IF NEW.linkedin_url IS DISTINCT FROM OLD.linkedin_url THEN
    flag := private.moderation_flag(NEW.id, NULL, NEW.linkedin_url);
    IF flag <> '' THEN
      UPDATE public.profile_private SET review_flag = flag WHERE id = NEW.id AND review_flag = '';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- Keep a moderation record when a member is rejected or blocked (with the
-- admin's note, which review_member passes in nriclub.moderation_note), and
-- drop it when an admin reverses that decision.
CREATE FUNCTION private.record_moderation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  note TEXT := LEFT(COALESCE(current_setting('nriclub.moderation_note', TRUE), ''), 2000);
  slug TEXT;
  kind TEXT;
  is_now BOOLEAN;
  was BOOLEAN;
BEGIN
  SELECT private.linkedin_slug(linkedin_url) INTO slug FROM public.profiles WHERE id = NEW.id;
  FOREACH kind IN ARRAY ARRAY['rejected', 'blocked'] LOOP
    is_now := CASE kind WHEN 'rejected' THEN NEW.verification_status = 'rejected' ELSE NEW.status = 'blocked' END;
    was := TG_OP = 'UPDATE' AND CASE kind WHEN 'rejected' THEN OLD.verification_status = 'rejected' ELSE OLD.status = 'blocked' END;
    IF is_now AND (NOT was OR NEW.email IS DISTINCT FROM OLD.email) THEN
      INSERT INTO private.moderation_record (member_id, email_hash, linkedin_slug, decision, admin_note)
      VALUES (NEW.id, private.email_hash(NEW.email), slug, kind, CASE WHEN kind = 'rejected' THEN note ELSE '' END);
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

-- Signup: no name means an empty name (never part of the email address),
-- and someone matching a rejected or blocked account is flagged for review.
CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  INSERT INTO public.profiles (id, name, location, hometown, profession, occupation_status, years_abroad,
    linkedin_url, country_code, email_verified)
  VALUES (
    NEW.id,
    LEFT(COALESCE(NULLIF(BTRIM(meta ->> 'full_name'), ''), NULLIF(BTRIM(meta ->> 'name'), ''), ''), 200),
    LEFT(BTRIM(COALESCE(meta ->> 'location', '')), 200),
    LEFT(BTRIM(COALESCE(meta ->> 'hometown', '')), 200),
    LEFT(BTRIM(COALESCE(meta ->> 'profession', '')), 200),
    LEFT(BTRIM(COALESCE(meta ->> 'occupation_status', '')), 100),
    LEFT(COALESCE(meta ->> 'years_abroad', ''), 100),
    COALESCE(private.normalize_linkedin(meta ->> 'linkedin_url'), ''),
    CASE WHEN UPPER(COALESCE(meta ->> 'country_code', '')) ~ '^[A-Z]{2}$' THEN UPPER(meta ->> 'country_code') ELSE '' END,
    NEW.email_confirmed_at IS NOT NULL
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profile_private (id, email, gdpr_consent, marketing_consent,
    age_confirmed_at, terms_accepted_at, terms_version, review_flag)
  VALUES (NEW.id, NEW.email,
    COALESCE(meta ->> 'gdpr_consent', '') = 'true',
    COALESCE(meta ->> 'marketing_consent', '') = 'true',
    CASE WHEN COALESCE(meta ->> 'age_confirmed', '') = 'true' THEN NOW() END,
    CASE WHEN COALESCE(meta ->> 'terms_version', '') <> '' THEN NOW() END,
    NULLIF(LEFT(COALESCE(meta ->> 'terms_version', ''), 20), ''),
    private.moderation_flag(NEW.id, NEW.email, meta ->> 'linkedin_url'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO anon, authenticated, service_role;

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
-- other), blocked members can't submit, and a match with a rejected or
-- blocked account flags the member for review.
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
  flag TEXT;
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
      terms_accepted_at = COALESCE(terms_accepted_at, NOW()),
      terms_version = COALESCE(terms_version, private.current_terms_version())
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
  flag := private.moderation_flag(uid, current_email, normalized);

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
    submitted_at = NOW(),
    review_flag = CASE WHEN flag <> '' THEN flag ELSE review_flag END
  WHERE id = uid;
  INSERT INTO public.verification_log (member_id, decision, actor_id) VALUES (uid, 'submitted', uid);
  RETURN 'pending';
END;
$$;

-- An admin decides on a member:
--   approved / needs_info: only for members waiting for review (pending or needs_info)
--   rejected: any member (a message to the member is required, as for needs_info)
--   pending: reopens an approved, needs_info or rejected member (also Undo); a
--     member rejected before sending their details stays rejected
-- p_expected_name / p_expected_linkedin are what the admin saw; if the member
-- changed either since, nothing is decided. Approving clears the review flag;
-- back in review (e.g. Undo of an approval) a match with a rejected or
-- blocked account flags them again.
-- The member always gets one unread notification with the latest decision.
DROP FUNCTION public.review_member(UUID, TEXT, TEXT, TEXT);
CREATE FUNCTION public.review_member(p_member UUID, p_decision TEXT, p_message TEXT, p_admin_note TEXT,
  p_expected_name TEXT DEFAULT NULL, p_expected_linkedin TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  message TEXT := LEFT(BTRIM(COALESCE(p_message, '')), 1000);
  note TEXT := LEFT(BTRIM(COALESCE(p_admin_note, '')), 2000);
  current_status TEXT;
  current_submitted TIMESTAMPTZ;
  current_email TEXT;
  current_name TEXT;
  current_linkedin TEXT;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'needs_info', 'rejected', 'pending') THEN
    RAISE EXCEPTION 'Unknown decision %', p_decision USING ERRCODE = 'P0001';
  END IF;
  IF p_decision IN ('needs_info', 'rejected') AND message = '' THEN
    RAISE EXCEPTION 'Add a message for the member.' USING ERRCODE = 'P0001';
  END IF;

  -- Lock the member (profile first, then the private row, as
  -- submit_verification does) until this decision is saved.
  SELECT name, linkedin_url INTO current_name, current_linkedin
  FROM public.profiles WHERE id = p_member FOR UPDATE;
  SELECT verification_status, submitted_at, email INTO current_status, current_submitted, current_email
  FROM public.profile_private WHERE id = p_member FOR UPDATE;
  IF current_status IS NULL THEN
    RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0001';
  END IF;
  IF (p_decision IN ('approved', 'needs_info', 'pending') AND current_status = 'incomplete')
     OR (p_decision = 'pending' AND current_status = 'rejected' AND current_submitted IS NULL) THEN
    RAISE EXCEPTION 'This member hasn''t submitted their details yet.' USING ERRCODE = 'P0001';
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
    reviewed_at = CASE WHEN p_decision = 'pending' THEN NULL ELSE NOW() END,
    verification_message = CASE WHEN p_decision IN ('needs_info', 'rejected') THEN message ELSE '' END,
    review_flag = CASE
      WHEN p_decision = 'approved' THEN ''
      WHEN p_decision = 'pending' AND review_flag = '' THEN private.moderation_flag(p_member, current_email, current_linkedin)
      ELSE review_flag END
  WHERE id = p_member;
  PERFORM set_config('nriclub.moderation_note', '', TRUE);
  -- Only the latest decision should be waiting in the member's notifications.
  DELETE FROM public.notifications WHERE user_id = p_member AND type = 'verification' AND NOT read;
  INSERT INTO public.verification_log (member_id, decision, member_message, admin_note, actor_id)
  VALUES (p_member, p_decision, message, note, auth.uid());
  INSERT INTO public.notifications (user_id, type, text)
  VALUES (p_member, 'verification', CASE p_decision
    WHEN 'approved' THEN 'You''re verified. Welcome to NRIClub!'
    WHEN 'needs_info' THEN LEFT('We need a little more information to verify you: ' || message, 1000)
    WHEN 'pending' THEN 'Your profile is back in review.'
    ELSE LEFT('Your membership request wasn''t approved: ' || message, 1000)
  END);
  RETURN p_decision;
END;
$$;

-- The admin review queue, now with the review flag. Unfinished signups
-- (incomplete) come newest first, so the latest are within the API's
-- 1,000-row limit; everyone else oldest first, as before.
DROP FUNCTION public.admin_verification_queue(TEXT[]);
CREATE FUNCTION public.admin_verification_queue(p_statuses TEXT[] DEFAULT ARRAY['pending'])
RETURNS TABLE (
  id UUID, name TEXT, avatar_url TEXT, email TEXT, email_verified BOOLEAN,
  city TEXT, country_code TEXT, location TEXT, hometown TEXT, profession TEXT,
  linkedin_url TEXT, verification_note TEXT, voucher TEXT,
  verification_status TEXT, status TEXT, verification_message TEXT,
  created_at TIMESTAMPTZ, submitted_at TIMESTAMPTZ, reviewed_at TIMESTAMPTZ,
  age_confirmed_at TIMESTAMPTZ, terms_accepted_at TIMESTAMPTZ,
  same_linkedin_count INTEGER, previous_decisions INTEGER, review_flag TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.name, p.avatar_url, pp.email, p.email_verified,
    p.city, p.country_code, p.location, p.hometown, p.profession,
    p.linkedin_url, pp.verification_note, pp.voucher,
    pp.verification_status, pp.status, pp.verification_message,
    p.created_at, pp.submitted_at, pp.reviewed_at,
    pp.age_confirmed_at, pp.terms_accepted_at,
    (SELECT count(*)::int FROM public.profiles o
      WHERE o.id <> p.id AND p.linkedin_url <> '' AND o.linkedin_url = p.linkedin_url),
    (SELECT count(*)::int FROM public.verification_log l
      WHERE l.member_id = p.id AND l.decision IN ('approved', 'needs_info', 'rejected')),
    pp.review_flag
  FROM public.profiles p
  LEFT JOIN public.profile_private pp ON pp.id = p.id
  WHERE pp.verification_status = ANY (p_statuses)
  ORDER BY pp.submitted_at NULLS LAST,
    CASE WHEN pp.verification_status = 'incomplete' THEN p.created_at END DESC NULLS LAST,
    p.created_at;
END;
$$;

-- A member confirms they're 18 or older and accepts the current Terms of
-- Use (p_version is the version the site showed them).
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
-- The verification history leaves out the admins' internal notes and names.
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
        'decision', l.decision, 'member_message', l.member_message, 'created_at', l.created_at) ORDER BY l.created_at)
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

REVOKE ALL ON FUNCTION public.review_member(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_verification_queue(TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_terms(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.export_my_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_member(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
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

-- Marketing consent has one home (profile_private). Consent stays only if it
-- was given and the member never switched Marketing Emails off in Settings.
UPDATE public.profile_private pp SET marketing_consent = FALSE
WHERE pp.marketing_consent
  AND EXISTS (SELECT 1 FROM public.user_settings s WHERE s.user_id = pp.id AND NOT s.marketing_emails);

-- Names that are an email address, or the part before the @, were filled in
-- from the email (accounts created outside the site's signup).
UPDATE public.profiles p SET name = ''
FROM public.profile_private pp
WHERE pp.id = p.id AND p.name <> '' AND NULLIF(BTRIM(COALESCE(pp.email, '')), '') IS NOT NULL
  AND (lower(p.name) = lower(BTRIM(pp.email)) OR p.name = LEFT(SPLIT_PART(BTRIM(pp.email), '@', 1), 200));

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
