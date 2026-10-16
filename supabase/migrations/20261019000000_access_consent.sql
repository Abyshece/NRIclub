-- ============================================================================
-- NRIclub: who can take part, and a separate consent (2026-10-19)
--
--   * Members waiting for review (pending, or asked for more information)
--     wait until an admin approves them. Until then they can edit their own
--     profile, finish Get verified, see the list of approved groups and read
--     the guides, but they can't see other members or what they post, post
--     anything themselves or contact anyone, and they get no notifications
--     about what other members do. The site says our team checks every new
--     member; now nobody takes part before that check (C3).
--   * Taking part also needs the member's explicit consent to NRIClub
--     processing what they share that can show their ethnic origin,
--     religion or health (Art. 9(2)(a) GDPR). It is asked separately at
--     signup, or once on the Terms screen, and recorded with its time and
--     the version of its wording (C8).
--   * No more made-up consents: ticking "18 or older and the Terms" no
--     longer writes gdpr_consent, and the columns that held consents nobody
--     was asked for (gdpr_consent, gdpr_consent_date, marketing_consent,
--     user_settings.marketing_emails) are dropped. Accepting the Terms is the
--     contract (Art. 6(1)(b)), not a consent.
--   * Every acceptance of the Terms and every Art. 9 consent is kept
--     (public.terms_acceptances, with the version and time), readable by the
--     member and part of "Download my data". The Terms of Use are now
--     version 2026-10-19, and public.current_terms_version() tells the site
--     which version is current, so it only asks members to accept again once
--     this migration has run (C22).
--   * Blocked members can't change their profile or places, file reports or
--     upload photos; members who can't take part can't upload photos for
--     posts or listings either (C14).
--   * A member who is blocked, rejected, or moved back to review or to
--     unfinished stops being an ambassador, and only active, verified
--     members can be made one (C26).
-- Needs all earlier migrations. Existing rows: the consent columns above
-- are dropped; each member's current Terms acceptance is copied into
-- terms_acceptances; ambassadors who aren't active, verified members lose
-- the role. Every member, approved ones included, accepts the new Terms and
-- gives the Art. 9 consent once (the site's Terms screen) before they can
-- take part again.
-- ============================================================================

-- ============================================================================
-- VERSIONS
-- ============================================================================

-- The version of the Terms of Use members accept now (replaces '2026-10').
-- The site asks public.current_terms_version() below which version that is,
-- so the version the site shows (TERMS_VERSION in src/member/LegalModals.jsx)
-- must be this one when it is deployed. Members who accepted another version
-- can't take part until they accept this one.
CREATE OR REPLACE FUNCTION private.current_terms_version()
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '2026-10-19'::text;
$$;

-- The version of the wording of the Art. 9 consent the site shows (signup,
-- Get verified and the Terms screen), recorded with each consent. Change it
-- when the wording changes.
CREATE FUNCTION private.current_art9_version()
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '2026-10-19'::text;
$$;

-- For the site: the version of the Terms members must have accepted. Anyone
-- may ask, signed in or not (the signup page needs it too).
CREATE FUNCTION public.current_terms_version()
RETURNS TEXT LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT private.current_terms_version();
$$;

-- ============================================================================
-- CONSENT AND ACCEPTANCES
-- ============================================================================

-- When the member gave the Art. 9 consent and which wording they agreed to.
-- Set only by the database (accept_terms); NULL until given. Withdrawing it
-- means deleting the content or the account, so nothing sets it back.
ALTER TABLE public.profile_private
  ADD COLUMN art9_consent_at TIMESTAMPTZ,
  ADD COLUMN art9_consent_version TEXT CHECK (char_length(art9_consent_version) <= 20);

-- Consents nobody was asked for: gdpr_consent was set by ticking "18 or older
-- and the Terms", and NRIClub never asked for marketing consent (it sends no
-- newsletters). The trigger that dated gdpr_consent goes with them.
DROP TRIGGER IF EXISTS stamp_gdpr_consent ON public.profile_private;
DROP FUNCTION IF EXISTS private.stamp_gdpr_consent();
ALTER TABLE public.profile_private
  DROP COLUMN IF EXISTS gdpr_consent,
  DROP COLUMN IF EXISTS gdpr_consent_date,
  DROP COLUMN IF EXISTS marketing_consent;
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS marketing_emails;

-- The new consent fields are the server's, like the Terms fields: members
-- can't set or backdate them (admins pass through, as before).
DROP TRIGGER protect_columns ON public.profile_private;
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns(
    '{"verification_status": "incomplete", "status": "active", "age_confirmed_at": null, "terms_accepted_at": null, "terms_version": null, "submitted_at": null, "reviewed_at": null, "verification_message": "", "verification_note": "", "voucher": "", "review_flag": "", "art9_consent_at": null, "art9_consent_version": null}',
    'id', 'email', 'verification_status', 'status', 'age_confirmed_at', 'terms_accepted_at', 'terms_version',
    'verification_note', 'voucher', 'submitted_at', 'reviewed_at', 'verification_message', 'review_flag',
    'art9_consent_at', 'art9_consent_version', 'created_at');

-- Each time a member accepted a version of the Terms of Use ('terms') or
-- gave the Art. 9 consent ('art9'), with the version and the server's time.
-- profile_private keeps only the latest; this keeps them all. Written only
-- by the database (accept_terms, submit_verification); members read their
-- own rows (and get them in "Download my data"). Deleted with the account.
CREATE TABLE public.terms_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('terms', 'art9')),
  version TEXT NOT NULL CHECK (char_length(version) <= 20),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_terms_acceptances_member ON public.terms_acceptances (member_id, accepted_at);
ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.terms_acceptances FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.terms_acceptances TO authenticated;
CREATE POLICY "Members see their own acceptances" ON public.terms_acceptances
  FOR SELECT TO authenticated USING (member_id = (SELECT auth.uid()));

-- ============================================================================
-- WHO MAY TAKE PART
-- ============================================================================

-- Members who may see other members and take part: not blocked, approved by
-- an admin, 18 or older, accepted the current Terms and gave the Art. 9
-- consent. (Approving also ends a hold for review, so review_flag needs no
-- check.)
CREATE FUNCTION private.is_verified_member()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_private
    WHERE id = (SELECT auth.uid()) AND status = 'active' AND verification_status = 'approved'
      AND age_confirmed_at IS NOT NULL AND terms_accepted_at IS NOT NULL
      AND terms_version = private.current_terms_version()
      AND art9_consent_at IS NOT NULL
  );
$$;

-- Replaces the 2026-10-13 version, which also let members waiting for review
-- (pending, needs_info) take part. Every policy and function that lets a
-- member create something (posts, comments, likes, groups, RSVPs, listings,
-- guides, questions, places, thanks, mentoring) checks this, so they all
-- now need an approved member, as seeing other members does.
CREATE OR REPLACE FUNCTION private.is_active_member()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.is_verified_member();
$$;

-- Who may see other members and their content (replaces the 2026-10-13
-- version, which included members waiting for review).
CREATE OR REPLACE FUNCTION private.can_browse()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.is_admin() OR private.is_verified_member();
$$;

-- Whether the signed-in member is blocked.
CREATE FUNCTION private.is_blocked_me()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_private WHERE id = (SELECT auth.uid()) AND status = 'blocked'
  );
$$;

-- Contacting someone (a conversation, a message, a Namaste request) needs a
-- verified member, said in so many words (is_active_member is the same check
-- now, but these must never be loosened with it). Booking a mentor goes
-- through public.book_mentor_session, which checks is_active_member.
DROP POLICY "Users can start conversations" ON public.conversations;
CREATE POLICY "Users can start conversations" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IN (participant_1, participant_2)
    AND (SELECT private.is_verified_member())
    AND private.can_message(
      (SELECT auth.uid()),
      CASE WHEN participant_1 = (SELECT auth.uid()) THEN participant_2 ELSE participant_1 END)
  );

DROP POLICY "Participants can send messages" ON public.messages;
CREATE POLICY "Participants can send messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND (SELECT private.is_verified_member())
    AND private.is_conversation_participant(conversation_id)
    AND private.can_message(sender_id, private.conversation_partner(conversation_id))
  );

DROP POLICY "Users can send Namaste requests" ON public.connections;
CREATE POLICY "Users can send Namaste requests" ON public.connections
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = (SELECT auth.uid())
    AND (SELECT private.is_verified_member())
    AND private.can_request(requester_id, recipient_id)
  );

-- Notifications the database sends for what other members do (an urgent
-- question in the member's city group, an answer, an RSVP, a booking...)
-- carry their words, such as the title of a question about health. They go
-- only to approved, active members now (replaces the 2026-10-17 version,
-- which also sent them to members waiting for review): a member who joined a
-- city group while waiting was allowed under the old rules would otherwise
-- still read what members post there. Members who haven't accepted the
-- current Terms yet still get them, and read them once they have.
CREATE OR REPLACE FUNCTION private.notify(p_user UUID, p_type TEXT, p_actor UUID, p_text TEXT, p_ref UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.notifications (user_id, type, actor_id, text, reference_id)
  SELECT p_user, p_type, p_actor, LEFT(p_text, 1000), p_ref
  WHERE p_user IS NOT NULL AND p_user IS DISTINCT FROM p_actor
    AND (p_actor IS NULL OR NOT private.is_blocked_between(p_actor, p_user))
    AND EXISTS (
      SELECT 1 FROM public.profile_private pp
      WHERE pp.id = p_user AND pp.status = 'active' AND pp.verification_status = 'approved')
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = p_user AND n.type = p_type
        AND n.actor_id IS NOT DISTINCT FROM p_actor AND n.reference_id IS NOT DISTINCT FROM p_ref);
$$;

-- ============================================================================
-- BLOCKED AND INACTIVE ACCOUNTS (C14)
-- ============================================================================

-- A blocked member can't change their profile (e.g. rename themselves
-- "NRIClub Support Team"); everyone else can still edit their own, members
-- waiting for review and rejected members included. Admins as before.
DROP POLICY "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((id = (SELECT auth.uid()) AND NOT (SELECT private.is_blocked_me())) OR (SELECT private.is_admin()))
  WITH CHECK ((id = (SELECT auth.uid()) AND NOT (SELECT private.is_blocked_me())) OR (SELECT private.is_admin()));

-- Places: only members who can take part edit the places they added.
DROP POLICY "Members can edit their own places" ON public.places;
CREATE POLICY "Members can edit their own places" ON public.places
  FOR UPDATE TO authenticated
  USING (created_by = (SELECT auth.uid()) AND (SELECT private.is_active_member()))
  WITH CHECK (created_by = (SELECT auth.uid()) AND (SELECT private.is_active_member()));

-- Reports about members and content come from members who can see them.
-- Feedback (a bug report or an idea, "[BUG] ..." / "[IDEA] ...") can also
-- come from a member waiting for review. Blocked, rejected and unfinished
-- accounts file nothing here; anyone can still report illegal content by
-- email or on the public page.
DROP POLICY "Users can file reports" ON public.reports;
CREATE POLICY "Users can file reports" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (
    reporter_id = (SELECT auth.uid())
    AND (
      (SELECT private.can_browse())
      OR ((reason LIKE '[BUG]%' OR reason LIKE '[IDEA]%') AND EXISTS (
        SELECT 1 FROM public.profile_private pp
        WHERE pp.id = (SELECT auth.uid()) AND pp.status = 'active'
          AND pp.verification_status IN ('pending', 'needs_info')))
    )
  );

-- Uploads: a profile photo from anyone who isn't blocked (members waiting
-- for review add one too); photos for posts, events and listings only from
-- members who can take part. Always inside the member's own folder.
DROP POLICY "NRIclub: users can upload to their own folder" ON storage.objects;
CREATE POLICY "NRIclub: users can upload to their own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND ((bucket_id = 'avatars' AND NOT (SELECT private.is_blocked_me()))
         OR (bucket_id IN ('post-images', 'marketplace-images') AND (SELECT private.is_active_member())))
  );
DROP POLICY "NRIclub: users can replace their own uploads" ON storage.objects;
CREATE POLICY "NRIclub: users can replace their own uploads" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND ((bucket_id = 'avatars' AND NOT (SELECT private.is_blocked_me()))
         OR (bucket_id IN ('post-images', 'marketplace-images') AND (SELECT private.is_active_member())))
  )
  WITH CHECK (
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND ((bucket_id = 'avatars' AND NOT (SELECT private.is_blocked_me()))
         OR (bucket_id IN ('post-images', 'marketplace-images') AND (SELECT private.is_active_member())))
  );

-- ============================================================================
-- AMBASSADORS (C26)
-- ============================================================================

-- A member who is no longer an active, verified member (blocked, rejected,
-- moved back to review or to unfinished, also by changing their name or
-- LinkedIn after approval) stops being an ambassador, whichever way the
-- change was made: members would otherwise see them as their city's
-- contact. An admin can make them one again once they're approved.
CREATE FUNCTION private.end_ambassador_when_inactive()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status <> 'active' OR NEW.verification_status <> 'approved' THEN
    UPDATE public.profiles SET ambassador_city = '' WHERE id = NEW.id AND ambassador_city <> '';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER end_ambassador_when_inactive AFTER UPDATE OF status, verification_status ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION private.end_ambassador_when_inactive();

-- Only active, verified members can be made ambassadors. (Named to run
-- after protect_columns, which already undoes a member setting it on
-- themselves; this is for admins.)
CREATE FUNCTION private.verified_ambassador_only()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.ambassador_city <> ''
     AND (TG_OP = 'INSERT' OR NEW.ambassador_city IS DISTINCT FROM OLD.ambassador_city)
     AND NOT EXISTS (SELECT 1 FROM public.profile_private pp
                     WHERE pp.id = NEW.id AND pp.status = 'active' AND pp.verification_status = 'approved') THEN
    RAISE EXCEPTION 'Only active, verified members can be ambassadors.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER verified_ambassador_only BEFORE INSERT OR UPDATE OF ambassador_city ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.verified_ambassador_only();

-- ============================================================================
-- RPC: Terms and consent, verification, data export
-- ============================================================================

-- Replaces accept_terms(p_version). A member confirms they're 18 or older
-- and accepts the current Terms of Use (p_version: the version the site
-- showed them), and with p_art9 gives the separate Art. 9 consent. Neither
-- is consent to the Privacy Policy, which is information only. A new
-- acceptance (a first one, or of a newer version) and a new consent are each
-- kept in terms_acceptances; accepting the same version again changes
-- nothing. p_art9 false (the default, which older pages send) leaves the
-- consent as it is: it's withdrawn by deleting the content or the account.
DROP FUNCTION public.accept_terms(TEXT);
CREATE FUNCTION public.accept_terms(p_version TEXT, p_art9 BOOLEAN DEFAULT FALSE)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  version TEXT := private.current_terms_version();
  art9_version TEXT := private.current_art9_version();
  new_terms BOOLEAN;
  new_art9 BOOLEAN;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_version IS DISTINCT FROM version THEN
    RAISE EXCEPTION 'The Terms of Use have been updated. Please reload the page and try again.' USING ERRCODE = 'P0001';
  END IF;
  SELECT terms_accepted_at IS NULL OR terms_version IS DISTINCT FROM version,
         COALESCE(p_art9, FALSE) AND art9_consent_at IS NULL
  INTO new_terms, new_art9
  FROM public.profile_private WHERE id = uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.profile_private SET
    age_confirmed_at = COALESCE(age_confirmed_at, NOW()),
    terms_accepted_at = CASE WHEN new_terms THEN NOW() ELSE terms_accepted_at END,
    terms_version = version,
    art9_consent_at = CASE WHEN new_art9 THEN NOW() ELSE art9_consent_at END,
    art9_consent_version = CASE WHEN new_art9 THEN art9_version ELSE art9_consent_version END
  WHERE id = uid;
  IF new_terms THEN
    INSERT INTO public.terms_acceptances (member_id, kind, version) VALUES (uid, 'terms', version);
  END IF;
  IF new_art9 THEN
    INSERT INTO public.terms_acceptances (member_id, kind, version) VALUES (uid, 'art9', art9_version);
  END IF;
  RETURN version;
END;
$$;

-- As in 2026-10-13, except that p_accept_terms records 18+ and the current
-- Terms only (no "consent to the Privacy Policy" any more) and keeps a new
-- acceptance in terms_acceptances. The site now sends the Art. 9 consent
-- through accept_terms first; older pages still send p_accept_terms.
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
  new_terms BOOLEAN;
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
  SELECT verification_status, status, email,
         terms_accepted_at IS NULL OR terms_version IS DISTINCT FROM private.current_terms_version()
  INTO current_status, current_block, current_email, new_terms
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
      terms_accepted_at = CASE WHEN new_terms THEN NOW() ELSE terms_accepted_at END,
      terms_version = private.current_terms_version()
    WHERE id = uid;
    IF new_terms THEN
      INSERT INTO public.terms_acceptances (member_id, kind, version)
      VALUES (uid, 'terms', private.current_terms_version());
    END IF;
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

-- "Download my data": as in 2026-10-18, plus every acceptance of the Terms
-- and every Art. 9 consent (the latest are also in profile_private).
CREATE OR REPLACE FUNCTION public.export_my_data()
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
    'terms_acceptances', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'kind', x.kind, 'version', x.version, 'accepted_at', x.accepted_at) ORDER BY x.accepted_at, x.kind)
      FROM public.terms_acceptances x WHERE x.member_id = uid), '[]'::jsonb),
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
      FROM public.blocks x WHERE x.blocker_id = uid), '[]'::jsonb),
    'conversations_hidden', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.hidden_at)
      FROM public.conversation_hides x WHERE x.user_id = uid), '[]'::jsonb),
    'places_added', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.places x WHERE x.created_by = uid), '[]'::jsonb),
    'place_recommendations', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.place_recommendations x WHERE x.user_id = uid), '[]'::jsonb),
    'answer_thanks', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.answer_thanks x WHERE x.user_id = uid), '[]'::jsonb),
    'mentor_times', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.starts_at)
      FROM public.mentor_slots x WHERE x.mentor_id = uid), '[]'::jsonb),
    'mentoring_sessions', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.starts_at)
      FROM public.mentor_bookings x WHERE uid IN (x.mentor_id, x.mentee_id)), '[]'::jsonb),
    'mentor_reviews_written', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.mentor_reviews x WHERE x.mentee_id = uid), '[]'::jsonb)
  );
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Helpers in policies run as the member; the trigger functions as the
-- database. Members can't call anything in private through the API (the
-- schema isn't exposed).
REVOKE ALL ON FUNCTION private.current_art9_version(), private.is_verified_member(), private.is_blocked_me(),
  private.end_ambassador_when_inactive(), private.verified_ambassador_only() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.current_art9_version(), private.is_verified_member(), private.is_blocked_me(),
  private.end_ambassador_when_inactive(), private.verified_ambassador_only() TO authenticated, service_role;
-- public.current_terms_version runs as the caller, signed out too.
GRANT EXECUTE ON FUNCTION private.current_terms_version() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.current_terms_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_terms_version() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_terms(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_terms(TEXT, BOOLEAN) TO authenticated;

-- ============================================================================
-- EXISTING DATA
-- ============================================================================

-- Each member's current acceptance of the Terms, as the first entry of
-- their history (earlier ones weren't kept).
INSERT INTO public.terms_acceptances (member_id, kind, version, accepted_at)
SELECT pp.id, 'terms', pp.terms_version, pp.terms_accepted_at
FROM public.profile_private pp
WHERE pp.terms_accepted_at IS NOT NULL AND pp.terms_version IS NOT NULL;

-- Ambassadors who aren't active, verified members any more lose the role
-- (as end_ambassador_when_inactive does from now on).
UPDATE public.profiles p SET ambassador_city = ''
FROM public.profile_private pp
WHERE pp.id = p.id AND p.ambassador_city <> ''
  AND (pp.status <> 'active' OR pp.verification_status <> 'approved');
