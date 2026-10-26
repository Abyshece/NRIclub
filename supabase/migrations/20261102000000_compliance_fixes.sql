-- ============================================================================
-- NRIclub: compliance fixes, and the Terms of Use 2026-10-26 (2026-11-02)
--
--   * Terms of Use version 2026-10-26 (private.current_terms_version; the
--     version before it, 2026-10-23, is private.previous_terms_version). As
--     section 14 of the Terms promises, the Terms a member accepted keep
--     applying until they accept new ones: members on any version from
--     2026-10-19 on keep taking part (private.terms_versions_in_force, used
--     by private.is_verified_member), not only on the current and the
--     previous one. The site asks them each time they open NRIClub, and
--     they can answer "Later" (it asks public.terms_versions_in_force which
--     versions those are). What needs the current version still needs it:
--     the travel board (private.has_current_terms).
--   * The Art. 9 consent has new wording (city groups only; previews the
--     member chooses to turn on): private.current_art9_version() is
--     2026-10-26. public.accept_terms records a consent given with the new
--     wording also for a member who consented to an earlier one (the Terms
--     screen asks for it with the new Terms), with its own entry in
--     public.terms_acceptances. A consent to the earlier wording still
--     counts for taking part.
--   * Website analytics without the shortened IP address: public.
--     analytics_ingest ignores it, the column private.analytics_events.
--     ip_truncated is dropped with what it held, and the admin panel's
--     single visits (public.admin_analytics_sessions,
--     public.admin_analytics_journey) give their times to the hour only.
--   * "Download my data" (public.export_my_data, the 2026-10-30 version) also
--     has the profile reminders our team sent the member
--     (private.profile_reminders: kind, sent_at) and the decision emails sent
--     to them (private.member_email_log: kind, decided_at, emailed_at), with
--     a line in its readme; and lists reports about the member's "Looking for
--     a place" posts under reports_about_me.
--   * A nightly clean-up of its own, private.retention_cleanup() (pg_cron
--     job nriclub-retention-cleanup, 04:05 UTC): the log behind the one
--     urgent question a day (private.urgent_log) after 2 days, and every
--     in-app notification (read or not) after 12 months.
--     private.daily_cleanup is not changed.
--   * "Looking for a place" posts (public.housing_wanted) can be reported
--     (reports.content_type 'housing_wanted') and removed by our team with
--     public.admin_moderate, which keeps the record and the copy, and tells
--     the author why, as for every other kind.
--   * No preview for questions in the Health or Legal/Visa category (their
--     title can show someone's health or origin): public.public_preview
--     gives NULL for them (private.question_preview_allowed), and their
--     switch stays off (a trigger on public.help_requests; existing ones are
--     switched off).
-- Needs the earlier migrations (up to 20261101000000_admin_delete_member.sql).
-- Can be run again: it replaces what it made the first time.
-- Existing rows: private.analytics_events loses its ip_truncated column;
-- questions in the Health or Legal/Visa category with their preview on get
-- it switched off. reports.content_type accepts one more value
-- ('housing_wanted'); the list is rebuilt from the one the database has, so
-- every earlier value stays allowed.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.admin_check_member_delete(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'Run the admin member deletion update (20261101000000_admin_delete_member.sql) first.';
  END IF;
END;
$$;

-- ============================================================================
-- TERMS OF USE 2026-10-26, AND THE ART. 9 CONSENT 2026-10-26
-- ============================================================================

-- The version of the Terms of Use members accept now (replaces 2026-10-23,
-- which is at nriclub.app/terms/2026-10-23). The site shows this version's
-- text (TERMS_VERSION in src/content/legal/terms.js and
-- src/member/LegalModals.jsx) and asks public.current_terms_version() which
-- version to accept, so it can go live before this update: until then
-- members keep accepting 2026-10-23. public.accept_terms records only the
-- version this function names.
CREATE OR REPLACE FUNCTION private.current_terms_version()
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '2026-10-26'::text;
$$;

-- The version before it (public.previous_terms_version tells the site; its
-- Terms screen links to the version a member accepted).
CREATE OR REPLACE FUNCTION private.previous_terms_version()
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '2026-10-23'::text;
$$;

-- Every version of the Terms under which members keep taking part, oldest
-- first: new Terms apply to a member only once they accept them, and until
-- then the Terms they accepted keep applying (Terms section 14). From
-- 2026-10-19, the first version with the Art. 9 consent, to the current
-- one. Members on an earlier version (2026-10) still accept the current one
-- first. The site shows each of them at nriclub.app/terms/<version>
-- (TERMS_ARCHIVE in src/content/legal/terms.js; supabase/tests/rls_test.py
-- checks). Take a version out only once nobody is on it any more, or after
-- ending, with 4 weeks' notice (section 12), the membership of those who
-- are; otherwise they would be locked out.
CREATE OR REPLACE FUNCTION private.terms_versions_in_force()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY['2026-10-19', '2026-10-23', private.current_terms_version()]::TEXT[];
$$;

-- For the site: the versions in force, so the Terms screen offers "Later"
-- to a member on any of them. Anyone may ask, like
-- public.current_terms_version().
CREATE OR REPLACE FUNCTION public.terms_versions_in_force()
RETURNS TEXT[] LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT private.terms_versions_in_force();
$$;

-- Members who may see other members and take part (replaces the 2026-10-23
-- version, which allowed only the current and the previous version): not
-- blocked, approved by an admin, 18 or older, on a version of the Terms
-- still in force, and gave the Art. 9 consent (a consent the law requires,
-- so there is no "later" for it; a consent to an earlier wording counts).
-- private.is_active_member and private.can_browse, and with them every
-- policy that lets a member see or do something, go through this.
CREATE OR REPLACE FUNCTION private.is_verified_member()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_private
    WHERE id = (SELECT auth.uid()) AND status = 'active' AND verification_status = 'approved'
      AND age_confirmed_at IS NOT NULL AND terms_accepted_at IS NOT NULL
      AND terms_version = ANY (private.terms_versions_in_force())
      AND art9_consent_at IS NOT NULL
  );
$$;

-- The version of the wording of the Art. 9 consent the site shows (signup,
-- Get verified and the Terms screen; ART9_CONSENT_VERSION in
-- src/content/legal/consent.js), recorded with each consent. 2026-10-26: the
-- examples name city groups only, and the purposes the previews a member
-- chooses to turn on.
CREATE OR REPLACE FUNCTION private.current_art9_version()
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '2026-10-26'::text;
$$;

-- As on 2026-10-19, except that a consent with p_art9 is also recorded for a
-- member whose consent was to an earlier wording (the Terms screen asks for
-- it again with the new Terms): art9_consent_at and art9_consent_version
-- become the new ones, and terms_acceptances keeps both entries.
CREATE OR REPLACE FUNCTION public.accept_terms(p_version TEXT, p_art9 BOOLEAN DEFAULT FALSE)
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
         COALESCE(p_art9, FALSE) AND (art9_consent_at IS NULL OR art9_consent_version IS DISTINCT FROM art9_version)
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

-- ============================================================================
-- WEBSITE ANALYTICS: NO IP ADDRESS, TIMES TO THE HOUR
-- ============================================================================

-- As on 2026-10-29, without the shortened IP address: a p_meta that still has
-- ip_truncated (an /api/collect from before this update) is stored without it.
CREATE OR REPLACE FUNCTION public.analytics_ingest(p_events JSONB, p_meta JSONB)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m JSONB := CASE WHEN jsonb_typeof(p_meta) = 'object' THEN p_meta ELSE '{}'::jsonb END;
  v_visitor UUID;
  v_session UUID;
  v_have INTEGER;
  v_stored INTEGER;
  v_device TEXT := COALESCE(m ->> 'device', '');
  v_browser TEXT := LEFT(COALESCE(m ->> 'browser', ''), 30);
  v_os TEXT := LEFT(COALESCE(m ->> 'os', ''), 30);
  v_country TEXT := upper(COALESCE(m ->> 'country', ''));
  v_region TEXT := upper(LEFT(COALESCE(m ->> 'region', ''), 10));
BEGIN
  IF jsonb_typeof(p_events) IS DISTINCT FROM 'array' OR jsonb_array_length(p_events) = 0 THEN
    RETURN 0;
  END IF;
  IF jsonb_array_length(p_events) > 50 THEN
    RAISE EXCEPTION 'At most 50 events at a time.' USING ERRCODE = 'P0001';
  END IF;
  BEGIN
    v_visitor := (m ->> 'visitor_id')::UUID;
    v_session := (m ->> 'session_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_visitor := NULL;
  END;
  IF v_visitor IS NULL OR v_session IS NULL THEN
    RAISE EXCEPTION 'visitor_id and session_id must be ids (uuid).' USING ERRCODE = 'P0001';
  END IF;
  -- One visit (a browser tab) can't fill the table.
  SELECT count(*) INTO v_have FROM private.analytics_events e WHERE e.session_id = v_session;
  IF v_have >= 2000 THEN
    RETURN 0;
  END IF;

  INSERT INTO private.analytics_events (at, visitor_id, session_id, type, path, title, label, target,
    referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, country, region, city,
    device, browser, os)
  SELECT
    CASE WHEN COALESCE(ev ->> 'at', '') ~ '^[0-9]{10,14}$'
      THEN LEAST(NOW(), GREATEST(NOW() - INTERVAL '1 hour', to_timestamp((ev ->> 'at')::NUMERIC / 1000)))
      ELSE NOW() END,
    v_visitor, v_session, ev ->> 'type',
    LEFT(COALESCE(ev ->> 'path', ''), 200), LEFT(COALESCE(ev ->> 'title', ''), 120),
    LEFT(COALESCE(ev ->> 'label', ''), 80), LEFT(COALESCE(ev ->> 'target', ''), 200),
    LEFT(lower(COALESCE(ev ->> 'referrer_domain', '')), 100),
    LEFT(COALESCE(ev ->> 'utm_source', ''), 100), LEFT(COALESCE(ev ->> 'utm_medium', ''), 100),
    LEFT(COALESCE(ev ->> 'utm_campaign', ''), 100), LEFT(COALESCE(ev ->> 'utm_content', ''), 100),
    CASE WHEN v_country ~ '^[A-Z]{2}$' THEN v_country ELSE '' END,
    v_region, LEFT(COALESCE(m ->> 'city', ''), 100),
    CASE WHEN v_device IN ('mobile', 'tablet', 'desktop') THEN v_device ELSE '' END, v_browser, v_os
  FROM jsonb_array_elements(p_events) WITH ORDINALITY AS x(ev, n)
  WHERE jsonb_typeof(ev) = 'object'
    AND ev ->> 'type' IN ('pageview', 'click', 'funnel', 'session_end')
    AND (ev ->> 'type' <> 'funnel' OR ev ->> 'label' = ANY (private.analytics_funnel_steps()))
  ORDER BY n
  LIMIT 2000 - v_have;
  GET DIAGNOSTICS v_stored = ROW_COUNT;
  RETURN v_stored;
END;
$$;

-- As on 2026-10-29, without the IP address, and with each visit's start and
-- end to the hour only (rounded down), so a visit can't be matched to the
-- minute a member did something: { total, sessions: [{ id, started_at,
-- ended_at, country, region, city, device, browser, os, referrer_domain,
-- utm_source, utm_medium, utm_campaign, steps (page views and clicks),
-- pages, exit }] }, newest first.
CREATE OR REPLACE FUNCTION public.admin_analytics_sessions(p_days INTEGER DEFAULT 30, p_limit INTEGER DEFAULT 25,
  p_offset INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  since TIMESTAMPTZ := private.analytics_since(p_days);
  lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  off INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  result JSONB;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  WITH visits AS MATERIALIZED (
    SELECT e.session_id, min(e.at) AS started_at, max(e.at) AS ended_at,
      count(*) FILTER (WHERE e.type IN ('pageview', 'click')) AS steps,
      count(*) FILTER (WHERE e.type = 'pageview') AS pages
    FROM private.analytics_events e WHERE e.at >= since GROUP BY e.session_id
  ),
  shown AS (
    SELECT v.* FROM visits v ORDER BY v.started_at DESC, v.session_id LIMIT lim OFFSET off
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM visits),
    'sessions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.session_id, 'started_at', date_trunc('hour', s.started_at),
        'ended_at', date_trunc('hour', s.ended_at),
        'country', f.country, 'region', f.region, 'city', f.city, 'device', f.device,
        'browser', f.browser, 'os', f.os, 'referrer_domain', f.referrer_domain, 'utm_source', f.utm_source,
        'utm_medium', f.utm_medium, 'utm_campaign', f.utm_campaign, 'steps', s.steps, 'pages', s.pages,
        'exit', l.path) ORDER BY s.started_at DESC, s.session_id)
      FROM shown s
      CROSS JOIN LATERAL (
        SELECT e.* FROM private.analytics_events e WHERE e.session_id = s.session_id AND e.at >= since
        ORDER BY (e.type <> 'pageview'), e.at, e.id LIMIT 1) f
      LEFT JOIN LATERAL (
        SELECT e.path FROM private.analytics_events e
        WHERE e.session_id = s.session_id AND e.at >= since AND e.type <> 'funnel'
        ORDER BY e.at DESC, e.id DESC LIMIT 1) l ON TRUE), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

-- As on 2026-10-29, with each event's time to the hour only (rounded down);
-- still in the order they happened: [{ at, type, path, title, label,
-- target }].
CREATE OR REPLACE FUNCTION public.admin_analytics_journey(p_session UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('at', date_trunc('hour', j.at), 'type', j.type, 'path', j.path, 'title', j.title,
      'label', j.label, 'target', j.target) ORDER BY j.at, j.id)
    FROM (SELECT e.id, e.at, e.type, e.path, e.title, e.label, e.target FROM private.analytics_events e
          WHERE e.session_id = p_session ORDER BY e.at, e.id LIMIT 500) j), '[]'::jsonb);
END;
$$;

-- The shortened IP addresses stored until now go, with their column.
ALTER TABLE private.analytics_events DROP COLUMN IF EXISTS ip_truncated;

-- ============================================================================
-- "DOWNLOAD MY DATA"
-- ============================================================================

-- As on 2026-10-30, plus the profile reminders our team sent the member
-- (profile_reminders: which one and when; not the admin who sent it), the
-- decision emails sent to them (decision_emails_sent: the decision, when it
-- was taken and when the email went out; not the admin, and not the text,
-- which isn't kept), a line about both in the readme, and reports about
-- their "Looking for a place" posts under reports_about_me.
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  sessions JSONB := '[]'::jsonb;
  invite TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF to_regclass('auth.sessions') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'created_at', s->'created_at', 'refreshed_at', s->'refreshed_at', 'updated_at', s->'updated_at',
          'ip', s->'ip', 'user_agent', s->'user_agent') ORDER BY s->>'created_at'), '[]'::jsonb)
      FROM (SELECT to_jsonb(x) AS s FROM auth.sessions x WHERE x.user_id = $1) y
    $q$ INTO sessions USING uid;
  END IF;
  IF to_regclass('public.invites') IS NOT NULL THEN
    EXECUTE 'SELECT i.code FROM public.invites i WHERE i.member_id = $1' INTO invite USING uid;
  END IF;
  RETURN jsonb_build_object(
    'exported_at', NOW(),
    'readme', jsonb_build_object(
      'about', 'Everything NRIClub keeps about you in its database at the time of exported_at: your account, profile and settings, what you posted, sent and received, and the records about you below.',
      'privacy_policy', 'https://nriclub.app/privacy: why we use each kind of data, the legal basis, who receives it, how long we keep it, and your rights.',
      'not_included', 'The photo files themselves (listed under files; you see them in the app), copies in our database provider''s daily backups (overwritten after 7 days), server logs, emails between you and us, and our team''s internal notes on decisions about your account. Write to hello@nriclub.app for a copy of any of these.',
      'left_out', 'To protect members who report content, this file doesn''t say who reported you, and leaves out reports about messages you sent (only the member you wrote to can report a message). A message of yours we removed is under moderation_actions_about_me.',
      'reminders_and_decision_emails', 'profile_reminders: the reminders about your profile our team sent you in the app (which one and when; kept 12 months). decision_emails_sent: the emails about our decisions on your membership we sent you (which decision, when it was taken and when the email went out; we note these for 30 days, not their text).',
      'contact', 'hello@nriclub.app'),
    'account', (SELECT jsonb_build_object(
        'email', a->'email', 'created_at', a->'created_at', 'email_confirmed_at', a->'email_confirmed_at',
        'last_sign_in_at', a->'last_sign_in_at', 'signup_data', a->'raw_user_meta_data')
      FROM (SELECT to_jsonb(u) AS a FROM auth.users u WHERE u.id = uid) x),
    'sessions', sessions,
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = uid),
    'profile_private', (SELECT to_jsonb(pp) FROM public.profile_private pp WHERE pp.id = uid),
    'user_settings', (SELECT to_jsonb(s) FROM public.user_settings s WHERE s.user_id = uid),
    'invite_code', invite,
    'terms_acceptances', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'kind', x.kind, 'version', x.version, 'accepted_at', x.accepted_at) ORDER BY x.accepted_at, x.kind)
      FROM public.terms_acceptances x WHERE x.member_id = uid), '[]'::jsonb),
    'verification_log', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'decision', l.decision, 'member_message', l.member_message, 'created_at', l.created_at)
        || CASE WHEN l.actor_id = uid THEN jsonb_build_object('note', l.admin_note) ELSE '{}'::jsonb END
        ORDER BY l.created_at)
      FROM public.verification_log l WHERE l.member_id = uid), '[]'::jsonb),
    'moderation_actions_about_me', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'created_at', a.created_at, 'action', a.action, 'about', a.target_kind, 'ground', a.ground, 'rule', a.rule,
        'facts', a.explanation, 'immediate_block_because', a.urgent, 'source', a.source,
        'statement_sent_to_you', NULLIF(a.statement, ''), 'copy_of_removed_content', a.snapshot -> 'row')
        ORDER BY a.created_at)
      FROM private.moderation_action a WHERE a.target_user = uid
        AND NOT (a.action = 'dismiss' AND a.target_kind = 'message')), '[]'::jsonb),
    'name_changes', COALESCE((SELECT jsonb_agg(c.changed_at ORDER BY c.changed_at)
      FROM private.name_changes c WHERE c.member_id = uid), '[]'::jsonb),
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
    'urgent_questions_sent', COALESCE((SELECT jsonb_agg(u.sent_at ORDER BY u.sent_at)
      FROM private.urgent_log u WHERE u.user_id = uid), '[]'::jsonb),
    'help_responses', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.help_responses x WHERE x.user_id = uid), '[]'::jsonb),
    'notifications', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.notifications x WHERE x.user_id = uid), '[]'::jsonb),
    'reports_filed', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.reports x WHERE x.reporter_id = uid), '[]'::jsonb),
    -- Without the reporter's own words, which could say who they are: the
    -- explanation, and in a report the site sent the old way, what follows
    -- the reason in its reason line ("... — Illegal: Fraud or a scam: <their
    -- words>").
    'reports_about_me', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'created_at', x.created_at, 'about', x.content_type,
        'reason', regexp_replace(x.reason, '((Illegal|Against our rules): [^:]*):.*$', '\1'), 'category', x.category,
        'status', x.status) ORDER BY x.created_at)
      FROM public.reports x
      WHERE x.reporter_id IS DISTINCT FROM uid AND x.content_type IS DISTINCT FROM 'feedback'
        AND x.content_type IS DISTINCT FROM 'message'
        AND (x.reported_user_id = uid OR x.reported_post_id IN (
        SELECT y.id FROM public.posts y WHERE y.user_id = uid
        UNION ALL SELECT y.id FROM public.docs y WHERE y.user_id = uid
        UNION ALL SELECT y.id FROM public.events y WHERE y.organizer_id = uid
        UNION ALL SELECT y.id FROM public.help_requests y WHERE y.user_id = uid
        UNION ALL SELECT y.id FROM public.marketplace y WHERE y.user_id = uid
        UNION ALL SELECT y.id FROM public.travel_posts y WHERE y.user_id = uid
        UNION ALL SELECT y.id FROM public.housing_wanted y WHERE y.user_id = uid
        UNION ALL SELECT y.id FROM public.mentor_reviews y WHERE y.mentee_id = uid))), '[]'::jsonb),
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
      FROM public.mentor_reviews x WHERE x.mentee_id = uid), '[]'::jsonb),
    'mentor_reviews_received', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'rating', x.rating, 'comment', x.comment, 'created_at', x.created_at) ORDER BY x.created_at)
      FROM public.mentor_reviews x WHERE x.mentor_id = uid), '[]'::jsonb),
    'files', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'bucket', o.bucket_id, 'name', o.name, 'created_at', o.created_at) ORDER BY o.created_at)
      FROM storage.objects o WHERE (storage.foldername(o.name))[1] = uid::text), '[]'::jsonb),
    'ambassador_applications', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'reference', x.reference, 'created_at', x.created_at, 'name', x.name, 'email', x.email, 'city', x.city,
        'country', x.country, 'organisation', x.organisation, 'linkedin_url', x.linkedin_url,
        'motivation', x.motivation, 'hours_per_week', x.hours_per_week, 'status', x.status,
        'decided_at', x.decided_at) ORDER BY x.created_at)
      FROM private.ambassador_applications x WHERE x.member_id = uid), '[]'::jsonb),
    'travel_posts', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.travel_posts x WHERE x.user_id = uid), '[]'::jsonb),
    'travel_rules_accepted', (SELECT jsonb_build_object('version', a.rules_version, 'accepted_at', a.accepted_at)
      FROM private.travel_rules_ack a WHERE a.user_id = uid),
    'rate_limit_log', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', r.action, 'at', r.at) ORDER BY r.at)
      FROM private.rate_log r WHERE r.member_id = uid), '[]'::jsonb)
  ) || jsonb_build_object(
    'ambassador_agreement', COALESCE((SELECT jsonb_agg(jsonb_build_object('version', a.version, 'accepted_at', a.accepted_at)
        ORDER BY a.accepted_at)
      FROM private.ambassador_agreement_ack a WHERE a.user_id = uid), '[]'::jsonb),
    'ambassador_welcomes_given', COALESCE((SELECT jsonb_agg(jsonb_build_object('member_id', w.member_id, 'at', w.at) ORDER BY w.at)
      FROM private.ambassador_welcomes w WHERE w.ambassador_id = uid), '[]'::jsonb),
    'welcomed_by_your_city_ambassador', COALESCE((SELECT jsonb_agg(w.at ORDER BY w.at)
      FROM private.ambassador_welcomes w WHERE w.member_id = uid), '[]'::jsonb),
    'ambassador_log', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'action', l.action, 'city', l.city, 'detail', l.detail, 'at', l.at) ORDER BY l.at)
      FROM private.ambassador_log l WHERE l.ambassador_id = uid), '[]'::jsonb)
  ) || jsonb_build_object(
    'housing_listings', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.housing_listings x WHERE x.user_id = uid), '[]'::jsonb),
    'housing_looking_posts', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.housing_wanted x WHERE x.user_id = uid), '[]'::jsonb),
    'housing_post_log', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', l.kind, 'at', l.at) ORDER BY l.at)
      FROM private.housing_post_log l WHERE l.member_id = uid), '[]'::jsonb)
  ) || jsonb_build_object(
    'profile_reminders', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', r.kind, 'sent_at', r.sent_at) ORDER BY r.sent_at)
      FROM private.profile_reminders r WHERE r.member_id = uid), '[]'::jsonb),
    'decision_emails_sent', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'kind', l.kind, 'decided_at', l.decided_at, 'emailed_at', l.created_at) ORDER BY l.created_at)
      FROM private.member_email_log l WHERE l.member_id = uid), '[]'::jsonb)
  );
END;
$$;

-- ============================================================================
-- CLEAN-UP: THE URGENT-QUESTION LOG AND OLD NOTIFICATIONS
-- ============================================================================

-- Every night (the periods are the Privacy Policy's, RETENTION in
-- src/content/legal/privacy.js): the log behind the one urgent question a
-- day (private.urgent_log, read for the last day only) after 2 days, and
-- in-app notifications after 12 months, read or not (read ones also go
-- after 6 months, in private.daily_cleanup). Its own job, so
-- private.daily_cleanup stays as it is. Returns what it did:
-- { urgent_log, notifications }.
CREATE OR REPLACE FUNCTION private.retention_cleanup()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  urgent INTEGER;
  notices INTEGER;
BEGIN
  WITH gone AS (
    DELETE FROM private.urgent_log u WHERE u.sent_at < NOW() - INTERVAL '2 days' RETURNING 1)
  SELECT count(*) INTO urgent FROM gone;
  WITH gone AS (
    DELETE FROM public.notifications n WHERE n.created_at < NOW() - INTERVAL '12 months' RETURNING 1)
  SELECT count(*) INTO notices FROM gone;
  RETURN jsonb_build_object('urgent_log', urgent, 'notifications', notices);
END;
$$;

-- Runs private.retention_cleanup() every night at 04:05 (UTC) with pg_cron,
-- as private.schedule_profile_reminders_cleanup does for its clean-up:
-- enables pg_cron if the database offers it, and does nothing otherwise.
-- Says what it did. Safe to run again (the job keeps its name):
-- SELECT private.schedule_retention_cleanup();
-- Stop it with: SELECT cron.unschedule('nriclub-retention-cleanup');
CREATE OR REPLACE FUNCTION private.schedule_retention_cleanup()
RETURNS TEXT LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name = 'pg_cron') THEN
      RETURN 'not scheduled: this database has no pg_cron. Run SELECT private.retention_cleanup(); by hand once a day.';
    END IF;
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
    EXCEPTION WHEN OTHERS THEN
      RETURN 'not scheduled: pg_cron could not be enabled (' || SQLERRM || '). Enable it under Database → Extensions, then run SELECT private.schedule_retention_cleanup();';
    END;
  END IF;
  BEGIN
    EXECUTE 'SELECT cron.schedule($1, $2, $3)'
      USING 'nriclub-retention-cleanup', '5 4 * * *', 'SELECT private.retention_cleanup()';
  EXCEPTION WHEN OTHERS THEN
    RETURN 'not scheduled: ' || SQLERRM;
  END;
  RETURN 'scheduled: private.retention_cleanup() runs every night at 04:05 UTC (pg_cron job nriclub-retention-cleanup)';
END;
$$;

-- ============================================================================
-- REPORTS AND MODERATION: "LOOKING FOR A PLACE" POSTS
-- ============================================================================

-- reports.content_type's list as the database has it now
-- (pg_get_constraintdef), plus 'housing_wanted'. Nothing to do if it's there
-- already.
DO $$
DECLARE
  def TEXT;
  vals TEXT[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.reports'::regclass AND c.contype = 'c' AND c.conname = 'reports_content_type_check';
  SELECT array_agg(replace(x.m[1], '''''', '''') ORDER BY x.n) INTO vals
  FROM regexp_matches(COALESCE(def, ''), '''((?:[^'']|'''')*)''::text', 'g') WITH ORDINALITY AS x(m, n);
  -- The kinds every earlier update has (a guard against reading the
  -- constraint wrongly, which would otherwise drop kinds).
  IF vals IS NULL OR NOT vals @> ARRAY['post', 'comment', 'answer', 'doc', 'doc_comment', 'event', 'help', 'market',
                                        'review', 'place', 'message', 'profile', 'feedback', 'travel'] THEN
    RAISE EXCEPTION 'Unexpected reports_content_type_check: %', def;
  END IF;
  IF 'housing_wanted' = ANY (vals) THEN
    RETURN;
  END IF;
  ALTER TABLE public.reports DROP CONSTRAINT reports_content_type_check;
  EXECUTE format('ALTER TABLE public.reports ADD CONSTRAINT reports_content_type_check CHECK (content_type IN (%s))',
    (SELECT string_agg(quote_literal(u.v), ', ' ORDER BY u.n)
     FROM unnest(vals || 'housing_wanted'::TEXT) WITH ORDINALITY AS u(v, n)));
END;
$$;

-- As on 2026-10-26, plus "Looking for a place" posts.
CREATE OR REPLACE FUNCTION private.content_noun(p_kind TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_kind
    WHEN 'post' THEN 'post' WHEN 'comment' THEN 'comment' WHEN 'answer' THEN 'answer'
    WHEN 'doc' THEN 'guide' WHEN 'doc_comment' THEN 'comment on a guide' WHEN 'event' THEN 'event'
    WHEN 'help' THEN 'question' WHEN 'market' THEN 'Market listing' WHEN 'review' THEN 'mentoring review'
    WHEN 'place' THEN 'place' WHEN 'place_recommendation' THEN 'recommendation' WHEN 'message' THEN 'message'
    WHEN 'travel' THEN 'travel post'
    WHEN 'housing_wanted' THEN '"Looking for a place" post'
    WHEN 'profile_photo' THEN 'profile photo' WHEN 'profile_bio' THEN 'profile bio' WHEN 'profile' THEN 'profile'
    ELSE 'content' END;
$$;

-- As on 2026-10-26, plus "[HOUSING_WANTED]".
CREATE OR REPLACE FUNCTION private.report_kind_from_reason(p_reason TEXT, p_post UUID, p_user UUID)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_reason LIKE '[BUG]%' OR p_reason LIKE '[IDEA]%' THEN 'feedback'
    WHEN upper(p_reason) LIKE '[MARKETPLACE]%' OR upper(p_reason) LIKE '[MARKET]%' THEN 'market'
    WHEN upper(p_reason) LIKE '[DOC_COMMENT]%' THEN 'doc_comment'
    WHEN upper(p_reason) LIKE '[DOC]%' THEN 'doc'
    WHEN upper(p_reason) LIKE '[EVENT]%' THEN 'event'
    WHEN upper(p_reason) LIKE '[HELP]%' THEN 'help'
    WHEN upper(p_reason) LIKE '[REVIEW]%' THEN 'review'
    WHEN upper(p_reason) LIKE '[COMMENT]%' THEN 'comment'
    WHEN upper(p_reason) LIKE '[ANSWER]%' THEN 'answer'
    WHEN upper(p_reason) LIKE '[PLACE]%' THEN 'place'
    WHEN upper(p_reason) LIKE '[MESSAGE]%' THEN 'message'
    WHEN upper(p_reason) LIKE '[TRAVEL]%' THEN 'travel'
    WHEN upper(p_reason) LIKE '[HOUSING_WANTED]%' THEN 'housing_wanted'
    WHEN upper(p_reason) LIKE '[USER]%' OR upper(p_reason) LIKE '[PROFILE]%' THEN 'profile'
    WHEN upper(p_reason) LIKE '[POST]%' THEN 'post'
    WHEN p_user IS NOT NULL AND p_post IS NULL THEN 'profile'
    ELSE 'post' END;
$$;

-- As on 2026-10-26, plus "Looking for a place" posts.
CREATE OR REPLACE FUNCTION private.content_author(p_kind TEXT, p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE p_kind
    WHEN 'post' THEN (SELECT x.user_id FROM public.posts x WHERE x.id = p_id)
    WHEN 'comment' THEN (SELECT x.user_id FROM public.comments x WHERE x.id = p_id)
    WHEN 'answer' THEN (SELECT x.user_id FROM public.help_responses x WHERE x.id = p_id)
    WHEN 'doc' THEN (SELECT x.user_id FROM public.docs x WHERE x.id = p_id)
    WHEN 'doc_comment' THEN (SELECT x.user_id FROM public.doc_comments x WHERE x.id = p_id)
    WHEN 'event' THEN (SELECT x.organizer_id FROM public.events x WHERE x.id = p_id)
    WHEN 'help' THEN (SELECT x.user_id FROM public.help_requests x WHERE x.id = p_id)
    WHEN 'market' THEN (SELECT x.user_id FROM public.marketplace x WHERE x.id = p_id)
    WHEN 'review' THEN (SELECT x.mentee_id FROM public.mentor_reviews x WHERE x.id = p_id)
    WHEN 'place' THEN (SELECT x.created_by FROM public.places x WHERE x.id = p_id)
    WHEN 'message' THEN (SELECT x.sender_id FROM public.messages x WHERE x.id = p_id)
    WHEN 'travel' THEN (SELECT x.user_id FROM public.travel_posts x WHERE x.id = p_id)
    WHEN 'housing_wanted' THEN (SELECT x.user_id FROM public.housing_wanted x WHERE x.id = p_id)
  END;
$$;

-- As on 2026-10-26, plus "Looking for a place" posts ('the "Looking for a
-- place" post in Berlin': its city, never its note).
CREATE OR REPLACE FUNCTION private.report_item(p_kind TEXT, p_id UUID, p_user UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN p_kind = 'profile' THEN COALESCE('the member ' || NULLIF((SELECT p.name FROM public.profiles p WHERE p.id = p_user), ''), 'a member')
    WHEN p_kind = 'housing_wanted' THEN 'the ' || private.content_noun(p_kind)
      || COALESCE(' in ' || NULLIF((SELECT x.city FROM public.housing_wanted x WHERE x.id = p_id), ''), '')
    ELSE 'the ' || private.content_noun(p_kind) || COALESCE(' "' || NULLIF(private.snippet(CASE p_kind
      WHEN 'post' THEN (SELECT x.content FROM public.posts x WHERE x.id = p_id)
      WHEN 'comment' THEN (SELECT x.content FROM public.comments x WHERE x.id = p_id)
      WHEN 'answer' THEN (SELECT x.content FROM public.help_responses x WHERE x.id = p_id)
      WHEN 'doc' THEN (SELECT x.title FROM public.docs x WHERE x.id = p_id)
      WHEN 'doc_comment' THEN (SELECT x.content FROM public.doc_comments x WHERE x.id = p_id)
      WHEN 'event' THEN (SELECT x.title FROM public.events x WHERE x.id = p_id)
      WHEN 'help' THEN (SELECT x.title FROM public.help_requests x WHERE x.id = p_id)
      WHEN 'market' THEN (SELECT x.title FROM public.marketplace x WHERE x.id = p_id)
      WHEN 'review' THEN (SELECT x.comment FROM public.mentor_reviews x WHERE x.id = p_id)
      WHEN 'place' THEN (SELECT x.name FROM public.places x WHERE x.id = p_id)
      WHEN 'message' THEN (SELECT x.content FROM public.messages x WHERE x.id = p_id)
      WHEN 'travel' THEN (SELECT x.from_city || ' → ' || x.to_city FROM public.travel_posts x WHERE x.id = p_id)
    END), '') || '"', '') END;
$$;

-- As on 2026-10-26, plus "Looking for a place" posts (p_kind
-- 'housing_wanted': remove or warn). The statement tells the author 'your
-- "Looking for a place" post in Berlin'; the record keeps a copy of the post,
-- like every other kind.
CREATE OR REPLACE FUNCTION public.admin_moderate(p_kind TEXT, p_id UUID, p_action TEXT,
  p_ground TEXT DEFAULT NULL, p_rule TEXT DEFAULT '', p_explanation TEXT DEFAULT '',
  p_report_ids UUID[] DEFAULT '{}', p_urgent TEXT DEFAULT NULL, p_notice UUID DEFAULT NULL,
  p_member UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := (SELECT auth.uid());
  v_rule TEXT := btrim(regexp_replace(COALESCE(p_rule, ''), '\s+', ' ', 'g'));
  v_facts TEXT := private.facts(p_explanation);
  author UUID;
  row_json JSONB;
  photos TEXT[] := '{}';
  label TEXT;
  what_text TEXT;
  items JSONB;
  report_kind TEXT;
  pp public.profile_private;
  src TEXT;
  ids UUID[];
  closed UUID[] := '{}';
  sessions INTEGER := 0;
  statement TEXT := '';
  outcome TEXT;
  action_id UUID;
  convo UUID;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('post', 'comment', 'answer', 'doc', 'doc_comment', 'event', 'help', 'market',
     'review', 'place', 'travel', 'housing_wanted', 'message', 'place_recommendation', 'profile_photo', 'profile_bio', 'member') THEN
    RAISE EXCEPTION 'Unknown kind of content: %', p_kind USING ERRCODE = 'P0001';
  END IF;
  IF p_action IS NULL OR NOT (CASE
       WHEN p_kind = 'member' THEN p_action IN ('warn', 'block', 'unblock')
       WHEN p_kind IN ('profile_photo', 'profile_bio', 'place_recommendation') THEN p_action = 'remove'
       ELSE p_action IN ('remove', 'warn') END) THEN
    RAISE EXCEPTION 'You can''t % this.', p_action USING ERRCODE = 'P0001';
  END IF;
  IF p_action <> 'unblock' THEN
    IF p_ground IS NULL OR p_ground NOT IN ('illegal', 'terms') THEN
      RAISE EXCEPTION 'Choose whether it is illegal or against our Terms of Use.' USING ERRCODE = 'P0001';
    END IF;
    IF v_rule = '' OR char_length(v_rule) > 300 THEN
      RAISE EXCEPTION '%', CASE WHEN p_ground = 'illegal' THEN 'Name the law it breaks.' ELSE 'Choose the rule it breaks.' END
        USING ERRCODE = 'P0001';
    END IF;
    IF char_length(v_facts) < 10 OR char_length(v_facts) > 600 THEN
      RAISE EXCEPTION 'Say in a sentence (10 to 600 characters) what it said or did.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF p_urgent IS NOT NULL AND (p_action <> 'block' OR p_urgent NOT IN ('threat', 'violence', 'fraud', 'illegal', 'danger')) THEN
    RAISE EXCEPTION 'An immediate block needs one of the serious reasons.' USING ERRCODE = 'P0001';
  END IF;

  -- What it is, who it belongs to, and a copy of it.
  IF p_kind IN ('member', 'profile_photo', 'profile_bio') THEN
    author := p_id;
    SELECT to_jsonb(p) INTO row_json FROM public.profiles p WHERE p.id = p_id FOR UPDATE;
    IF row_json IS NULL THEN
      RAISE EXCEPTION 'Member not found.' USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO pp FROM public.profile_private x WHERE x.id = p_id FOR UPDATE;
    IF p_kind = 'profile_photo' THEN
      IF COALESCE(row_json ->> 'avatar_url', '') = '' THEN
        RAISE EXCEPTION 'This member has no profile photo.' USING ERRCODE = 'P0001';
      END IF;
      photos := ARRAY[row_json ->> 'avatar_url'];
      row_json := jsonb_build_object('id', p_id, 'avatar_url', row_json ->> 'avatar_url');
      what_text := 'your profile photo';
    ELSIF p_kind = 'profile_bio' THEN
      IF COALESCE(row_json ->> 'bio', '') = '' THEN
        RAISE EXCEPTION 'This member has no bio.' USING ERRCODE = 'P0001';
      END IF;
      row_json := jsonb_build_object('id', p_id, 'bio', row_json ->> 'bio');
      what_text := 'the bio on your profile';
    ELSE
      row_json := NULL;
      what_text := 'how you use NRIClub';
    END IF;
  ELSIF p_kind = 'place_recommendation' THEN
    author := p_member;
    SELECT jsonb_build_object('place_id', r.place_id, 'user_id', r.user_id, 'created_at', r.created_at, 'place', pl.name)
    INTO row_json
    FROM public.place_recommendations r JOIN public.places pl ON pl.id = r.place_id
    WHERE r.place_id = p_id AND r.user_id = p_member FOR UPDATE OF r;
    what_text := 'your recommendation of "' || private.snippet(row_json ->> 'place') || '"';
  ELSE
    CASE p_kind
      WHEN 'post' THEN SELECT to_jsonb(x), x.user_id, ARRAY[x.image_url] INTO row_json, author, photos FROM public.posts x WHERE x.id = p_id FOR UPDATE;
      WHEN 'comment' THEN SELECT to_jsonb(x), x.user_id INTO row_json, author FROM public.comments x WHERE x.id = p_id FOR UPDATE;
      WHEN 'answer' THEN SELECT to_jsonb(x), x.user_id INTO row_json, author FROM public.help_responses x WHERE x.id = p_id FOR UPDATE;
      WHEN 'doc' THEN SELECT to_jsonb(x), x.user_id INTO row_json, author FROM public.docs x WHERE x.id = p_id FOR UPDATE;
      WHEN 'doc_comment' THEN SELECT to_jsonb(x), x.user_id INTO row_json, author FROM public.doc_comments x WHERE x.id = p_id FOR UPDATE;
      WHEN 'event' THEN SELECT to_jsonb(x), x.organizer_id, ARRAY[x.image_url] INTO row_json, author, photos FROM public.events x WHERE x.id = p_id FOR UPDATE;
      WHEN 'help' THEN SELECT to_jsonb(x), x.user_id INTO row_json, author FROM public.help_requests x WHERE x.id = p_id FOR UPDATE;
      WHEN 'market' THEN SELECT to_jsonb(x), x.user_id, private.listing_photos(x.image_url) INTO row_json, author, photos FROM public.marketplace x WHERE x.id = p_id FOR UPDATE;
      WHEN 'review' THEN SELECT to_jsonb(x), x.mentee_id INTO row_json, author FROM public.mentor_reviews x WHERE x.id = p_id FOR UPDATE;
      WHEN 'place' THEN SELECT to_jsonb(x), x.created_by INTO row_json, author FROM public.places x WHERE x.id = p_id FOR UPDATE;
      WHEN 'travel' THEN SELECT to_jsonb(x), x.user_id INTO row_json, author FROM public.travel_posts x WHERE x.id = p_id FOR UPDATE;
      WHEN 'housing_wanted' THEN SELECT to_jsonb(x), x.user_id INTO row_json, author FROM public.housing_wanted x WHERE x.id = p_id FOR UPDATE;
      WHEN 'message' THEN SELECT to_jsonb(x), x.sender_id, x.conversation_id INTO row_json, author, convo FROM public.messages x WHERE x.id = p_id FOR UPDATE;
    END CASE;
    -- Admins can't read messages: only one that was reported can be acted on.
    IF p_kind = 'message' AND NOT EXISTS (
      SELECT 1 FROM public.reports r WHERE r.content_type = 'message' AND r.reported_post_id = p_id) THEN
      RAISE EXCEPTION 'Only a message someone reported can be removed.' USING ERRCODE = '42501';
    END IF;
    what_text := 'your ' || private.content_noun(p_kind)
      || CASE WHEN p_kind = 'housing_wanted' THEN COALESCE(' in ' || NULLIF(row_json ->> 'city', ''), '')
         ELSE COALESCE(' "' || NULLIF(private.snippet(COALESCE(
           CASE WHEN p_kind = 'travel' THEN (row_json ->> 'from_city') || ' → ' || (row_json ->> 'to_city') END,
           row_json ->> 'title', row_json ->> 'name', row_json ->> 'content', row_json ->> 'comment', '')), '') || '"', '') END;
  END IF;
  IF row_json IS NULL AND p_kind <> 'member' THEN
    RAISE EXCEPTION 'Not found: it may already have been deleted.' USING ERRCODE = 'P0002';
  END IF;
  IF author = me THEN
    RAISE EXCEPTION 'You can''t act on your own account or content.' USING ERRCODE = 'P0001';
  END IF;
  IF author IS NOT NULL AND EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = author) THEN
    RAISE EXCEPTION 'This belongs to an admin. Another admin''s account or content can''t be moderated here.' USING ERRCODE = 'P0001';
  END IF;

  -- The reports it answers: the ones given and every other open one about
  -- the same item (for a photo, a bio or a recommendation, only the ones
  -- given). If all given ones were handled meanwhile, nothing is done.
  report_kind := CASE WHEN p_kind IN ('member', 'profile_photo', 'profile_bio') THEN 'profile'
                      WHEN p_kind = 'place_recommendation' THEN 'place' ELSE p_kind END;
  SELECT COALESCE(array_agg(r.id ORDER BY r.created_at), '{}') INTO ids
  FROM public.reports r
  WHERE r.status = 'pending' AND r.content_type IS DISTINCT FROM 'feedback'
    AND (r.id = ANY (COALESCE(p_report_ids, '{}'))
         OR (p_kind NOT IN ('profile_photo', 'profile_bio', 'place_recommendation') AND p_action <> 'unblock'
             AND r.content_type = report_kind
             AND CASE WHEN report_kind = 'profile' THEN r.reported_user_id = p_id ELSE r.reported_post_id = p_id END));
  PERFORM 1 FROM public.reports r WHERE r.id = ANY (ids) FOR UPDATE;
  IF COALESCE(cardinality(p_report_ids), 0) > 0 AND NOT EXISTS (
    SELECT 1 FROM public.reports r WHERE r.id = ANY (p_report_ids) AND r.status = 'pending') THEN
    RAISE EXCEPTION 'These reports were already handled by someone else. Reload to see the latest.' USING ERRCODE = 'P0001';
  END IF;
  IF p_notice IS NOT NULL AND NOT EXISTS (SELECT 1 FROM private.notices n WHERE n.id = p_notice) THEN
    RAISE EXCEPTION 'Notice not found.' USING ERRCODE = 'P0002';
  END IF;
  src := CASE WHEN p_notice IS NOT NULL THEN 'notice' WHEN cardinality(ids) > 0 THEN 'report' ELSE 'own_initiative' END;
  -- What the reporters are told it was about (before it's gone): for a
  -- photo, a bio or one recommendation, that part ("we removed it" mustn't
  -- read as the member or the place).
  items := private.report_items(ids);
  IF p_kind IN ('profile_photo', 'profile_bio', 'place_recommendation') THEN
    SELECT COALESCE(jsonb_object_agg(x.key, CASE p_kind WHEN 'profile_photo' THEN 'the profile photo of '
      WHEN 'profile_bio' THEN 'the bio of ' ELSE 'a recommendation of ' END || x.value), '{}'::jsonb)
    INTO items FROM jsonb_each_text(items) x;
  END IF;

  -- Do it.
  IF p_action = 'remove' THEN
    CASE p_kind
      WHEN 'post' THEN DELETE FROM public.posts WHERE id = p_id;
      WHEN 'comment' THEN
        DELETE FROM public.comments WHERE id = p_id;
        -- The post's author was notified with the comment's words.
        DELETE FROM public.notifications n
        WHERE n.type = 'comment' AND n.actor_id = author AND n.reference_id = (row_json ->> 'post_id')::UUID;
      WHEN 'answer' THEN DELETE FROM public.help_responses WHERE id = p_id;
      WHEN 'doc' THEN DELETE FROM public.docs WHERE id = p_id;
      WHEN 'doc_comment' THEN DELETE FROM public.doc_comments WHERE id = p_id;
      WHEN 'event' THEN DELETE FROM public.events WHERE id = p_id;
      WHEN 'help' THEN DELETE FROM public.help_requests WHERE id = p_id;
      WHEN 'market' THEN DELETE FROM public.marketplace WHERE id = p_id;
      WHEN 'review' THEN DELETE FROM public.mentor_reviews WHERE id = p_id;
      WHEN 'place' THEN DELETE FROM public.places WHERE id = p_id;
      WHEN 'travel' THEN DELETE FROM public.travel_posts WHERE id = p_id;
      WHEN 'housing_wanted' THEN DELETE FROM public.housing_wanted WHERE id = p_id;
      WHEN 'place_recommendation' THEN DELETE FROM public.place_recommendations WHERE place_id = p_id AND user_id = p_member;
      WHEN 'message' THEN
        DELETE FROM public.messages WHERE id = p_id;
        -- The conversation's preview showed it if it was the last message.
        UPDATE public.conversations c SET last_message_text = COALESCE(
          (SELECT LEFT(m.content, 500) FROM public.messages m WHERE m.conversation_id = c.id
           ORDER BY m.created_at DESC LIMIT 1), '')
        WHERE c.id = convo;
      WHEN 'profile_photo' THEN UPDATE public.profiles SET avatar_url = '' WHERE id = p_id;
      WHEN 'profile_bio' THEN UPDATE public.profiles SET bio = '' WHERE id = p_id;
    END CASE;
  ELSIF p_action = 'block' THEN
    IF pp.status = 'blocked' THEN
      RAISE EXCEPTION 'This member is already blocked.' USING ERRCODE = 'P0001';
    END IF;
    -- A warning with 14 days to reply comes first (Terms of Use, section 10):
    -- the 14 days of the latest warning must be over.
    IF p_urgent IS NULL AND COALESCE((
      SELECT max(a.created_at) FROM private.moderation_action a
      WHERE a.target_user = p_id AND a.action = 'warn') > NOW() - INTERVAL '14 days', TRUE) THEN
      RAISE EXCEPTION 'Warn the member first and give them 14 days to reply, or choose the serious reason that makes an immediate block necessary.'
        USING ERRCODE = 'P0001';
    END IF;
    SELECT count(*) INTO sessions FROM public.mentor_bookings b
    WHERE b.mentor_id = p_id AND b.status = 'booked' AND b.starts_at > NOW();
    UPDATE public.profile_private SET status = 'blocked', block_reason = v_facts,
      block_rule = CASE WHEN p_ground = 'illegal' THEN 'Illegal content: ' ELSE 'Terms of Use: ' END || v_rule,
      blocked_at = NOW()
    WHERE id = p_id;
  ELSIF p_action = 'unblock' THEN
    IF pp.status <> 'blocked' THEN
      RAISE EXCEPTION 'This member isn''t blocked.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.profile_private SET status = 'active', block_reason = '', block_rule = '', blocked_at = NULL
    WHERE id = p_id;
  END IF;

  -- The statement of reasons to the member concerned.
  IF author IS NOT NULL THEN
    statement := private.statement_of_reasons(
      CASE p_action WHEN 'remove' THEN 'removed' WHEN 'warn' THEN 'warning' WHEN 'block' THEN 'blocked' ELSE 'unblocked' END,
      what_text, p_ground, v_rule, v_facts, src, p_urgent, sessions);
  END IF;
  INSERT INTO private.moderation_action (actor_id, action, target_kind, target_id, target_user, ground, rule,
    explanation, urgent, source, report_ids, notice_id, snapshot, statement)
  VALUES (me, p_action, p_kind, p_id, author, CASE WHEN p_action = 'unblock' THEN NULL ELSE p_ground END, v_rule,
    v_facts, p_urgent, src, ids, p_notice,
    CASE WHEN row_json IS NULL THEN NULL
         ELSE jsonb_build_object('kind', p_kind, 'row', row_json, 'files', private.photo_paths(photos)) END,
    LEFT(statement, 2000))
  RETURNING id INTO action_id;
  IF author IS NOT NULL THEN
    PERFORM private.tell_member(author, 'moderation', statement, action_id);
  END IF;

  -- The reports, and whoever sent them.
  outcome := CASE p_action WHEN 'remove' THEN 'removed' WHEN 'block' THEN 'blocked' WHEN 'warn' THEN 'warned' END;
  IF p_action <> 'unblock' THEN
    closed := private.close_reports(ids, 'resolved', outcome, v_facts, items);
    IF p_notice IS NOT NULL THEN
      UPDATE private.notices SET status = 'closed', decision = outcome, decision_reason = v_facts,
        decided_by = me, decided_at = NOW()
      WHERE id = p_notice;
    END IF;
  END IF;
  RETURN jsonb_build_object('action_id', action_id, 'statement', statement, 'closed_reports', to_jsonb(closed),
    'cancelled_sessions', sessions);
END;
$$;

-- ============================================================================
-- PREVIEWS: NONE FOR QUESTIONS ABOUT HEALTH OR LEGAL/VISA MATTERS
-- ============================================================================

-- Whether a question in this category may have a preview: not in the
-- categories Health and Legal/Visa (the site's categories; any category
-- naming health, legal matters or visas, whatever its spelling), whose title
-- can show someone's health or origin (Art. 9 GDPR). The same as
-- questionPreviewAllowed in src/content/preview.js
-- (supabase/tests/rls_test.py compares them).
CREATE OR REPLACE FUNCTION private.question_preview_allowed(p_category TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT lower(COALESCE(p_category, '')) !~ '(health|legal|visa)';
$$;

-- A question in such a category keeps its preview switch off, however it is
-- written (a request that turns it on, or a change of category).
CREATE OR REPLACE FUNCTION private.no_sensitive_question_preview()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.share_preview AND NOT private.question_preview_allowed(NEW.category) THEN
    NEW.share_preview := FALSE;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS no_sensitive_question_preview ON public.help_requests;
CREATE TRIGGER no_sensitive_question_preview BEFORE INSERT OR UPDATE ON public.help_requests
  FOR EACH ROW EXECUTE FUNCTION private.no_sensitive_question_preview();

-- As on 2026-10-31, and NULL for a question in the Health or Legal/Visa
-- category, also one whose switch was turned on before this update.
CREATE OR REPLACE FUNCTION public.public_preview(p_kind TEXT, p_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  today DATE := private.today_in_germany();
  m public.marketplace;
  h public.housing_listings;
  e public.events;
  q public.help_requests;
  t public.travel_posts;
  d DATE;
BEGIN
  IF p_id IS NULL OR p_kind IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_kind = 'market' THEN
    SELECT * INTO m FROM public.marketplace x WHERE x.id = p_id;
    IF m.id IS NULL OR NOT m.share_preview OR m.status <> 'active' OR NOT private.is_listed_member(m.user_id) THEN
      RETURN NULL;
    END IF;
    SELECT * INTO h FROM public.housing_listings x WHERE x.listing_id = m.id;
    IF h.listing_id IS NOT NULL AND h.expires_on < today THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object(
      'kind', 'market',
      'label', private.preview_market_label(m.category, h.kind),
      'city', CASE WHEN h.listing_id IS NOT NULL THEN private.preview_city(h.city)
                   ELSE private.preview_city_from_location(m.location) END,
      'image', private.preview_image((private.listing_photos(NULLIF(m.image_url, '')))[1], m.user_id));
  ELSIF p_kind = 'event' THEN
    SELECT * INTO e FROM public.events x WHERE x.id = p_id;
    IF e.id IS NULL OR NOT e.share_preview OR e.organizer_id IS NULL OR NOT private.is_listed_member(e.organizer_id)
       OR e.date !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RETURN NULL;
    END IF;
    BEGIN
      d := e.date::DATE;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    IF d < today THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object(
      'kind', 'event',
      'label', 'Event',
      'city', private.preview_city(e.city),
      'day', private.preview_day(d),
      'image', private.preview_image(e.image_url, e.organizer_id));
  ELSIF p_kind = 'question' THEN
    SELECT * INTO q FROM public.help_requests x WHERE x.id = p_id;
    IF q.id IS NULL OR NOT q.share_preview OR NOT private.is_listed_member(q.user_id)
       OR NOT private.question_preview_allowed(q.category) THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object(
      'kind', 'question',
      'label', 'Question',
      'city', private.preview_city(q.city),
      'image', NULL,
      'title', btrim(regexp_replace(q.title, '\s+', ' ', 'g')),
      'answers', (SELECT count(*) FROM public.help_responses r WHERE r.request_id = q.id));
  ELSIF p_kind = 'trip' THEN
    SELECT * INTO t FROM public.travel_posts x WHERE x.id = p_id;
    IF t.id IS NULL OR NOT t.share_preview OR t.date_to < today OR NOT private.is_listed_member(t.user_id) THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object(
      'kind', 'trip',
      'label', 'Trip ' || t.from_city || ' → ' || t.to_city,
      'city', NULL,
      'image', NULL,
      'month', private.preview_month(t.date_from, t.date_to));
  END IF;
  RETURN NULL;
END;
$$;

-- Existing questions in these categories with their preview on: off.
UPDATE public.help_requests SET share_preview = FALSE
WHERE share_preview AND NOT private.question_preview_allowed(category);

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- The Terms: anyone may ask which versions are in force, as with
-- previous_terms_version (20261026000000_travel_board.sql).
REVOKE ALL ON FUNCTION private.terms_versions_in_force(), public.terms_versions_in_force() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.terms_versions_in_force(), public.terms_versions_in_force()
  TO anon, authenticated, service_role;
-- The clean-up: the database's job, and the service role by hand.
REVOKE ALL ON FUNCTION private.retention_cleanup(), private.schedule_retention_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.retention_cleanup() TO service_role;
-- The question previews' check runs in the trigger, as the member who
-- writes, and inside public.public_preview.
REVOKE ALL ON FUNCTION private.question_preview_allowed(TEXT), private.no_sensitive_question_preview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.question_preview_allowed(TEXT), private.no_sensitive_question_preview()
  TO authenticated, service_role;
-- The functions replaced above keep the permissions they had.

-- The nightly clean-up (the result shows in the SQL editor's messages).
DO $$
BEGIN
  RAISE NOTICE 'NRIClub retention clean-up: %', private.schedule_retention_cleanup();
END $$;
