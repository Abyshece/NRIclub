-- ============================================================================
-- NRIclub: the ambassador panel (2026-10-27)
--
--   * City ambassadors (profiles.ambassador_city, set by our team) get a
--     panel for their own city on the site (/ambassador). Before they first
--     use it they accept the ambassador agreement (a volunteer role, with
--     rules for members' data; its text is in src/content/ambassador.js),
--     kept with its version in private.ambassador_agreement_ack
--     (public.accept_ambassador_agreement; the site asks with
--     public.ambassador_status). Every function of the panel needs a member
--     who is still the city's ambassador, can take part
--     (private.is_active_member: not blocked, approved, Terms accepted) and
--     has accepted the current version of the agreement
--     (private.ambassador_gate).
--   * The city at a glance (public.ambassador_overview): members of the city
--     group, members who joined it in the last 7 and 30 days, upcoming
--     events in the city, questions from the city still waiting for a best
--     answer, and the group's starter post.
--   * Welcoming newcomers: the members who joined the city group in the last
--     30 days (public.ambassador_new_members), with only what members
--     already see (name, photo, when they joined), leaving out the
--     ambassador, members who blocked the ambassador or whom the ambassador
--     blocked, and accounts other members don't see; and whether the
--     ambassador has welcomed them (private.ambassador_welcomes,
--     public.ambassador_mark_welcomed). The welcome itself is an ordinary
--     message, with its usual rules and limits.
--   * Questions from the city still waiting for a best answer (as "Still
--     open" in Ask: the asker hasn't chosen one), newest first
--     (public.ambassador_open_questions).
--   * Running the city group: its description
--     (public.ambassador_update_group, 10 to 1,000 characters, 20 changes a
--     day) and its starter post (public.pin_group_post, which now needs the
--     agreement from an ambassador too). The changes are logged in
--     private.ambassador_log, which only our team reads
--     (public.admin_ambassador_activity, with each ambassador's agreement).
--   * Meetups: an ambassador marks their own event in their city as hosted
--     by the city ambassador (events.ambassador_hosted,
--     public.set_event_ambassador_hosted). Members can't set it themselves
--     (private.protect_columns); it comes off when the event moves to
--     another city or its organiser stops being that city's ambassador.
--   * Flag to the team (public.ambassador_flag): a report like any other
--     (the same reasons, explanation and good faith, and the same daily
--     limit) about a post or comment in the city group, a question or
--     answer from the city, an event in the city or a member of the city
--     group, marked with the city (reports.ambassador_city) so the admin
--     panel shows it first; every admin gets an in-app notice. Ambassadors
--     can't remove, hide or block anything.
--   * Stepping down (public.ambassador_step_down): ends the role at once; it
--     is logged and every admin gets an in-app notice.
--   * Clean-up (private.daily_cleanup): the 2026-10-26 version plus the log
--     and the welcomes 12 months after each entry. Both, and the record of
--     the agreement, go with the account.
--   * "Download my data" also has the agreement, the welcomes and the log.
-- Needs all earlier migrations (up to 20261026000000_travel_board.sql).
-- Can be run again: it replaces what it made the first time.
-- Existing rows: none change. events and reports get one column each
-- (ambassador_hosted false, ambassador_city '').
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.travel_posts') IS NULL THEN
    RAISE EXCEPTION 'Run the travel board update (20261026000000_travel_board.sql) first.';
  END IF;
END;
$$;

-- ============================================================================
-- THE AMBASSADOR AGREEMENT
-- ============================================================================

-- The version of the agreement the site shows (AMBASSADOR_AGREEMENT_VERSION
-- in src/content/ambassador.js). Change both when the agreement changes (in
-- a new migration): ambassadors then accept it again before they use the
-- panel. supabase/tests/rls_test.py checks they're the same.
CREATE OR REPLACE FUNCTION private.ambassador_agreement_version()
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '2026-10-27'::TEXT;
$$;

-- Each version of the agreement a member accepted, and when (accepting a
-- new version adds a row). Deleted with the account. Only the database reads
-- it (public.ambassador_status, public.admin_ambassador_activity).
CREATE TABLE IF NOT EXISTS private.ambassador_agreement_ack (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  version TEXT NOT NULL CHECK (char_length(version) <= 40),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, version)
);
ALTER TABLE private.ambassador_agreement_ack ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ambassador_agreement_ack FROM PUBLIC, anon, authenticated;

-- What ambassadors did as ambassador, for our team: accepting the
-- agreement, changing the group's description (detail: before and after),
-- pinning and unpinning its starter post, marking a meetup, flagging
-- something to the team (detail: what, and the report), stepping down.
-- Deleted with the account, and 12 months after each entry
-- (private.daily_cleanup). Only the database reads it
-- (public.admin_ambassador_activity, and "Download my data").
CREATE TABLE IF NOT EXISTS private.ambassador_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  city TEXT NOT NULL CHECK (char_length(city) <= 200),
  action TEXT NOT NULL CHECK (action IN (
    'agreement', 'group_description', 'pin', 'unpin', 'meetup', 'meetup_off', 'flag', 'step_down')),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ambassador_log_ambassador ON private.ambassador_log (ambassador_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_ambassador_log_at ON private.ambassador_log (at DESC);
ALTER TABLE private.ambassador_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ambassador_log FROM PUBLIC, anon, authenticated;

-- Newcomers an ambassador marked as welcomed (once each), so the panel can
-- say "Welcomed by you". Deleted when either account is deleted, and 12
-- months after the welcome (private.daily_cleanup). Only the database reads
-- it.
CREATE TABLE IF NOT EXISTS private.ambassador_welcomes (
  ambassador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ambassador_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_ambassador_welcomes_member ON private.ambassador_welcomes (member_id);
CREATE INDEX IF NOT EXISTS idx_ambassador_welcomes_at ON private.ambassador_welcomes (at);
ALTER TABLE private.ambassador_welcomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ambassador_welcomes FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- WHO MAY USE THE PANEL
-- ============================================================================

-- The city the signed-in member may run the panel for: they're its
-- ambassador now, can take part (private.is_active_member) and have
-- accepted the current agreement. Otherwise it says why (42501 for who they
-- are, P0001 with the agreement to accept). Every function of the panel
-- starts with it.
CREATE OR REPLACE FUNCTION private.ambassador_gate()
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := (SELECT auth.uid());
  v_city TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  SELECT p.ambassador_city INTO v_city FROM public.profiles p WHERE p.id = uid;
  IF COALESCE(v_city, '') = '' THEN
    RAISE EXCEPTION 'Only a city ambassador can do this.' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_active_member() THEN
    RAISE EXCEPTION 'Your account can''t take part on NRIClub right now, so the ambassador panel is closed.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM private.ambassador_agreement_ack a
                 WHERE a.user_id = uid AND a.version = private.ambassador_agreement_version()) THEN
    RAISE EXCEPTION 'Please read and accept the ambassador agreement first, in the Ambassador panel.' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_city;
END;
$$;

-- The approved group of a city ("Indians in <city>", compared without case),
-- if there is one.
CREATE OR REPLACE FUNCTION private.city_group_id(p_city TEXT)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT g.id FROM public.groups g
  WHERE btrim(COALESCE(p_city, '')) <> '' AND g.category = 'City' AND g.is_approved
    AND lower(g.name) = private.city_group_name(p_city)
  ORDER BY g.members_count DESC, g.created_at
  LIMIT 1;
$$;

-- Whether two city names are the same city as the site's addresses write
-- them (private.slug: "Düsseldorf" and "dusseldorf" are the same).
CREATE OR REPLACE FUNCTION private.same_city(p_a TEXT, p_b TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT private.slug(p_a) <> '' AND private.slug(p_a) = private.slug(p_b);
$$;

-- One entry in the ambassadors' log, by the signed-in member.
CREATE OR REPLACE FUNCTION private.ambassador_log_add(p_city TEXT, p_action TEXT, p_detail JSONB DEFAULT '{}'::jsonb)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO private.ambassador_log (ambassador_id, city, action, detail)
  VALUES ((SELECT auth.uid()), LEFT(p_city, 200), p_action, COALESCE(p_detail, '{}'::jsonb));
$$;

-- The members who joined the city's group in the last p_days days (1 to
-- 30), as its ambassador may see them: not the ambassador, shown to members
-- (private.is_listed_member), and neither of the two blocked the other.
CREATE OR REPLACE FUNCTION private.city_newcomers(p_city TEXT, p_days INTEGER)
RETURNS TABLE (user_id UUID, joined_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.user_id, m.joined_at FROM public.group_members m
  WHERE m.group_id = private.city_group_id(p_city)
    AND m.joined_at > NOW() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 30))
    AND m.user_id <> (SELECT auth.uid())
    AND private.is_listed_member(m.user_id)
    AND NOT private.is_blocked_between((SELECT auth.uid()), m.user_id);
$$;

-- For the site: { city (null for a member who isn't an ambassador),
-- group_id (the city's group, if there is one), version (the agreement's
-- current version), accepted (that version), accepted_at, accepted_version
-- (the latest they accepted), can_take_part }.
CREATE OR REPLACE FUNCTION public.ambassador_status()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'city', NULLIF(p.ambassador_city, ''),
    'group_id', private.city_group_id(NULLIF(p.ambassador_city, '')),
    'version', private.ambassador_agreement_version(),
    'accepted', EXISTS (SELECT 1 FROM private.ambassador_agreement_ack a
                        WHERE a.user_id = p.id AND a.version = private.ambassador_agreement_version()),
    'accepted_at', (SELECT a.accepted_at FROM private.ambassador_agreement_ack a
                    WHERE a.user_id = p.id AND a.version = private.ambassador_agreement_version()),
    'accepted_version', (SELECT a.version FROM private.ambassador_agreement_ack a
                         WHERE a.user_id = p.id ORDER BY a.accepted_at DESC LIMIT 1),
    'can_take_part', private.is_active_member())
  FROM (SELECT 1) one LEFT JOIN public.profiles p ON p.id = (SELECT auth.uid());
$$;

-- The ambassador accepts the agreement (p_version: the version they read).
-- Only a city ambassador who can take part; accepting the same version
-- again keeps the first time. Returns ambassador_status().
CREATE OR REPLACE FUNCTION public.accept_ambassador_agreement(p_version TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  v_city TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  SELECT p.ambassador_city INTO v_city FROM public.profiles p WHERE p.id = uid;
  IF COALESCE(v_city, '') = '' THEN
    RAISE EXCEPTION 'Only a city ambassador can accept the ambassador agreement.' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_active_member() THEN
    RAISE EXCEPTION 'Your account can''t take part on NRIClub right now, so the ambassador panel is closed.' USING ERRCODE = '42501';
  END IF;
  IF p_version IS DISTINCT FROM private.ambassador_agreement_version() THEN
    RAISE EXCEPTION 'The ambassador agreement has changed. Please reload the page and read it again.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO private.ambassador_agreement_ack (user_id, version) VALUES (uid, p_version)
  ON CONFLICT (user_id, version) DO NOTHING;
  IF FOUND THEN
    PERFORM private.ambassador_log_add(v_city, 'agreement', jsonb_build_object('version', p_version));
  END IF;
  RETURN public.ambassador_status();
END;
$$;

-- ============================================================================
-- THE CITY AT A GLANCE, NEWCOMERS AND OPEN QUESTIONS
-- ============================================================================

-- The ambassador's city: { city, group (id, name, description, members,
-- pinned_post: id, content, created_at, author (null for an account
-- members don't see)) or null, new_7d, new_30d (as
-- ambassador_new_members counts them), welcomed_30d (of those, welcomed by
-- the ambassador), events_upcoming and events (the next 5: from today in
-- Germany, in the city by its name, or without a city but with it in the
-- place), open_questions (still waiting for a best answer, as
-- ambassador_open_questions) and unanswered (of those, with no answer at
-- all) }.
CREATE OR REPLACE FUNCTION public.ambassador_overview()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  v_city TEXT := private.ambassador_gate();
  g public.groups;
  today TEXT := to_char(private.today_in_germany(), 'YYYY-MM-DD');
BEGIN
  SELECT * INTO g FROM public.groups x WHERE x.id = private.city_group_id(v_city);
  RETURN jsonb_build_object(
    'city', v_city,
    'group', CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', g.id, 'name', g.name, 'description', g.description, 'members', g.members_count,
      'pinned_post', (SELECT jsonb_build_object('id', x.id, 'content', LEFT(x.content, 300), 'created_at', x.created_at,
          'author', CASE WHEN private.is_listed_member(x.user_id) THEN (SELECT p.name FROM public.profiles p WHERE p.id = x.user_id) END)
        FROM public.posts x WHERE x.id = g.pinned_post_id)) END,
    'new_7d', (SELECT count(*) FROM private.city_newcomers(v_city, 7)),
    'new_30d', (SELECT count(*) FROM private.city_newcomers(v_city, 30)),
    'welcomed_30d', (SELECT count(*) FROM private.city_newcomers(v_city, 30) n
                     JOIN private.ambassador_welcomes w ON w.member_id = n.user_id AND w.ambassador_id = uid),
    'events_upcoming', (SELECT count(*) FROM public.events e
      WHERE e.date ~ '^\d{4}-\d{2}-\d{2}$' AND e.date >= today
        AND (private.same_city(e.city, v_city) OR (e.city = '' AND position(lower(v_city) IN lower(e.location)) > 0))),
    'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'date', e.date, 'time', e.time,
        'location', e.location, 'organizer_id', e.organizer_id, 'ambassador_hosted', e.ambassador_hosted) ORDER BY e.date, e.time)
      FROM (SELECT * FROM public.events e
            WHERE e.date ~ '^\d{4}-\d{2}-\d{2}$' AND e.date >= today
              AND (private.same_city(e.city, v_city) OR (e.city = '' AND position(lower(v_city) IN lower(e.location)) > 0))
            ORDER BY e.date, e.time LIMIT 5) e), '[]'::jsonb),
    'open_questions', (SELECT count(*) FROM public.help_requests h
      WHERE private.same_city(h.city, v_city) AND h.best_response_id IS NULL AND h.status = 'Open'
        AND h.user_id <> uid AND NOT private.is_blocked_between(uid, h.user_id)),
    'unanswered', (SELECT count(*) FROM public.help_requests h
      WHERE private.same_city(h.city, v_city) AND h.best_response_id IS NULL AND h.status = 'Open' AND h.responses_count = 0
        AND h.user_id <> uid AND NOT private.is_blocked_between(uid, h.user_id)));
END;
$$;

-- The members who joined the ambassador's city group in the last p_days
-- days (at most 30; see private.city_newcomers), newest first, with only
-- what members already see, and whether the ambassador marked them as
-- welcomed.
CREATE OR REPLACE FUNCTION public.ambassador_new_members(p_days INTEGER DEFAULT 30)
RETURNS TABLE (id UUID, name TEXT, avatar_url TEXT, joined_at TIMESTAMPTZ, welcomed BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_city TEXT := private.ambassador_gate();
BEGIN
  RETURN QUERY
  SELECT p.id, p.name, p.avatar_url, n.joined_at,
    EXISTS (SELECT 1 FROM private.ambassador_welcomes w WHERE w.ambassador_id = (SELECT auth.uid()) AND w.member_id = p.id)
  FROM private.city_newcomers(v_city, p_days) n JOIN public.profiles p ON p.id = n.user_id
  ORDER BY n.joined_at DESC
  LIMIT 500;
END;
$$;

-- Marks a newcomer (one in ambassador_new_members) as welcomed by the
-- ambassador, or with p_on false takes that back. Returns whether they're
-- marked now.
CREATE OR REPLACE FUNCTION public.ambassador_mark_welcomed(p_member UUID, p_on BOOLEAN DEFAULT TRUE)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  v_city TEXT := private.ambassador_gate();
BEGIN
  IF COALESCE(p_on, TRUE) THEN
    IF NOT EXISTS (SELECT 1 FROM private.city_newcomers(v_city, 30) n WHERE n.user_id = p_member) THEN
      RAISE EXCEPTION 'This member isn''t one of the newcomers in your city''s group.' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO private.ambassador_welcomes (ambassador_id, member_id) VALUES (uid, p_member)
    ON CONFLICT (ambassador_id, member_id) DO NOTHING;
    RETURN TRUE;
  END IF;
  DELETE FROM private.ambassador_welcomes w WHERE w.ambassador_id = uid AND w.member_id = p_member;
  RETURN FALSE;
END;
$$;

-- Questions from members in the ambassador's city (the city they had when
-- they asked) that are still waiting for a best answer: a question counts as
-- answered once its asker chooses the best answer (Resolved, as "Answered" in
-- Ask). Newest first, at most 100; not the ambassador's own, nor those of
-- members either of the two blocked. answers: how many it has; asker: the
-- name, or null for an account members don't see.
CREATE OR REPLACE FUNCTION public.ambassador_open_questions()
RETURNS TABLE (id UUID, title TEXT, category TEXT, urgent BOOLEAN, created_at TIMESTAMPTZ, answers INTEGER, asker TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  v_city TEXT := private.ambassador_gate();
BEGIN
  RETURN QUERY
  SELECT h.id, h.title, h.category, h.urgent, h.created_at, h.responses_count,
    CASE WHEN private.is_listed_member(h.user_id) THEN p.name END
  FROM public.help_requests h LEFT JOIN public.profiles p ON p.id = h.user_id
  WHERE private.same_city(h.city, v_city) AND h.best_response_id IS NULL AND h.status = 'Open'
    AND h.user_id <> uid AND NOT private.is_blocked_between(uid, h.user_id)
  ORDER BY h.created_at DESC
  LIMIT 100;
END;
$$;

-- ============================================================================
-- RUNNING THE CITY GROUP
-- ============================================================================

-- The ambassador changes their city group's description (10 to 1,000
-- characters; spaces tidied, at most one empty line in a row), at most 20
-- times a day. Logged with the text before and after. Returns { id,
-- description }.
CREATE OR REPLACE FUNCTION public.ambassador_update_group(p_description TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_city TEXT := private.ambassador_gate();
  v_group UUID := private.city_group_id(v_city);
  v_text TEXT := btrim(regexp_replace(regexp_replace(regexp_replace(COALESCE(p_description, ''),
    E'\r\n?', E'\n', 'g'), E'[ \t]+', ' ', 'g'), E'\n( ?\n)+', E'\n\n', 'g'));
  before TEXT;
BEGIN
  IF v_group IS NULL THEN
    RAISE EXCEPTION 'Your city has no group on NRIClub yet. Write to hello@nriclub.app and our team will set it up.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_text) < 10 THEN
    RAISE EXCEPTION 'Please write at least 10 characters.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_text) > 1000 THEN
    RAISE EXCEPTION 'Please keep the description to 1,000 characters.' USING ERRCODE = 'P0001';
  END IF;
  SELECT g.description INTO before FROM public.groups g WHERE g.id = v_group FOR UPDATE;
  IF before IS DISTINCT FROM v_text THEN
    PERFORM private.take_rate('ambassador_group', ARRAY['20', '1 day']);
    UPDATE public.groups SET description = v_text WHERE id = v_group;
    PERFORM private.ambassador_log_add(v_city, 'group_description',
      jsonb_build_object('group_id', v_group, 'before', before, 'after', v_text));
  END IF;
  RETURN (SELECT jsonb_build_object('id', g.id, 'description', g.description) FROM public.groups g WHERE g.id = v_group);
END;
$$;

-- As in 2026-10-17 (admins pin in any group, an ambassador in their own
-- city's group; NULL unpins), plus: an ambassador needs to be able to use
-- the panel (private.ambassador_gate: the agreement accepted), and their
-- pins and unpins are logged.
CREATE OR REPLACE FUNCTION public.pin_group_post(p_group UUID, p_post UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := (SELECT auth.uid());
  v_city TEXT;
  before UUID;
BEGIN
  IF NOT private.is_admin() THEN
    IF NOT (private.is_active_member() AND EXISTS (
      SELECT 1 FROM public.groups g JOIN public.profiles p ON p.id = me
      WHERE g.id = p_group AND g.category = 'City' AND p.ambassador_city <> ''
        AND lower(g.name) = private.city_group_name(p.ambassador_city))) THEN
      RAISE EXCEPTION 'Only the city''s ambassador can pin posts here.' USING ERRCODE = '42501';
    END IF;
    v_city := private.ambassador_gate();
  END IF;
  IF p_post IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.posts x WHERE x.id = p_post AND x.group_id = p_group
  ) THEN
    RAISE EXCEPTION 'That post isn''t in this group.' USING ERRCODE = '23514';
  END IF;
  SELECT g.pinned_post_id INTO before FROM public.groups g WHERE g.id = p_group FOR UPDATE;
  UPDATE public.groups SET pinned_post_id = p_post WHERE id = p_group;
  IF v_city IS NOT NULL AND before IS DISTINCT FROM p_post THEN
    PERFORM private.ambassador_log_add(v_city, CASE WHEN p_post IS NULL THEN 'unpin' ELSE 'pin' END,
      jsonb_build_object('group_id', p_group, 'post_id', COALESCE(p_post, before),
        'post', (SELECT private.snippet(x.content) FROM public.posts x WHERE x.id = COALESCE(p_post, before))));
  END IF;
END;
$$;

-- ============================================================================
-- MEETUPS HOSTED BY THE CITY AMBASSADOR
-- ============================================================================

-- true: the event's organiser marked it as hosted by the city ambassador
-- (public.set_event_ambassador_hosted). Members can't write it themselves.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ambassador_hosted BOOLEAN NOT NULL DEFAULT FALSE;

-- As in 2026-10-25, plus ambassador_hosted.
DROP TRIGGER IF EXISTS protect_columns ON public.events;
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{"attendees_count": 0, "ambassador_hosted": false}',
    'id', 'organizer_id', 'attendees_count', 'created_at', 'ambassador_hosted');

-- The mark stays only on an event in the city its organiser is ambassador
-- for: moving the event to another city takes it off. (Named to run after
-- protect_columns, which would otherwise put it back for a member's edit.)
CREATE OR REPLACE FUNCTION private.sync_ambassador_hosted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.ambassador_hosted AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = NEW.organizer_id AND p.ambassador_city <> '' AND private.same_city(NEW.city, p.ambassador_city)) THEN
    NEW.ambassador_hosted := FALSE;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sync_ambassador_hosted ON public.events;
CREATE TRIGGER sync_ambassador_hosted BEFORE INSERT OR UPDATE OF city, organizer_id, ambassador_hosted ON public.events
  FOR EACH ROW EXECUTE FUNCTION private.sync_ambassador_hosted();

-- A member who stops being a city's ambassador (stepping down, our team, or
-- a block) no longer hosts as its ambassador: the mark comes off their
-- events in a city they aren't ambassador for any more.
CREATE OR REPLACE FUNCTION private.end_ambassador_hosted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.events e SET ambassador_hosted = FALSE
  WHERE e.organizer_id = NEW.id AND e.ambassador_hosted
    AND (NEW.ambassador_city = '' OR NOT private.same_city(e.city, NEW.ambassador_city));
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS end_ambassador_hosted ON public.profiles;
CREATE TRIGGER end_ambassador_hosted AFTER UPDATE OF ambassador_city ON public.profiles
  FOR EACH ROW WHEN (OLD.ambassador_city IS DISTINCT FROM NEW.ambassador_city)
  EXECUTE FUNCTION private.end_ambassador_hosted();

-- The ambassador marks their own event in their city as hosted by the city
-- ambassador (p_on true), or takes the mark off. Logged. Returns the mark.
CREATE OR REPLACE FUNCTION public.set_event_ambassador_hosted(p_event UUID, p_on BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  v_city TEXT := private.ambassador_gate();
  v_on BOOLEAN := COALESCE(p_on, FALSE);
  e public.events;
BEGIN
  SELECT * INTO e FROM public.events x WHERE x.id = p_event FOR UPDATE;
  IF NOT FOUND OR e.organizer_id IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'You can only mark events you organise.' USING ERRCODE = 'P0001';
  END IF;
  IF v_on AND NOT private.same_city(e.city, v_city) THEN
    RAISE EXCEPTION 'Only an event in % can be hosted by its ambassador. Choose % as the event''s city first.', v_city, v_city
      USING ERRCODE = 'P0001';
  END IF;
  IF e.ambassador_hosted IS DISTINCT FROM v_on THEN
    UPDATE public.events SET ambassador_hosted = v_on WHERE id = p_event;
    PERFORM private.ambassador_log_add(v_city, CASE WHEN v_on THEN 'meetup' ELSE 'meetup_off' END,
      jsonb_build_object('event_id', p_event, 'title', private.snippet(e.title), 'date', e.date));
  END IF;
  RETURN v_on;
END;
$$;

-- ============================================================================
-- FLAG TO THE TEAM
-- ============================================================================

-- The city of the ambassador who flagged a report to our team ('' for an
-- ordinary report). Set only by public.ambassador_flag; the admin panel
-- shows these first, "From the ambassador of <city>".
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS ambassador_city TEXT NOT NULL DEFAULT ''
  CHECK (char_length(ambassador_city) <= 200);
CREATE INDEX IF NOT EXISTS idx_reports_ambassador_open ON public.reports (created_at)
  WHERE ambassador_city <> '' AND status = 'pending';

-- As in 2026-10-12, plus ambassador_city: members can't mark their own
-- reports.
DROP TRIGGER IF EXISTS protect_columns ON public.reports;
CREATE TRIGGER protect_columns BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{"status": "pending", "ambassador_city": ""}');

-- The ambassador flags something in their city to our team: a post or a
-- comment in the city group (p_kind 'post', 'comment'), a question or an
-- answer from the city ('help', 'answer'), an event in the city ('event')
-- or a member of the city group ('profile', p_id: the member). A report like
-- one from the Report button: a reason (p_category, as the report form's),
-- the ambassador's words (p_explanation, 10 to 1,000 characters), good faith
-- (the panel asks), the same limit of 20 reports a day, and one open report
-- per member and item (an open report of theirs about it becomes the
-- flag). Marked with the city; every admin is told in the app. Our team
-- decides, as for every report. Returns the report's id.
CREATE OR REPLACE FUNCTION public.ambassador_flag(p_kind TEXT, p_id UUID, p_category TEXT, p_explanation TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  v_city TEXT := private.ambassador_gate();
  v_group UUID := private.city_group_id(v_city);
  v_text TEXT := btrim(regexp_replace(COALESCE(p_explanation, ''), '\s+', ' ', 'g'));
  here BOOLEAN;
  author UUID;
  report UUID;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('post', 'comment', 'help', 'answer', 'event', 'profile') THEN
    RAISE EXCEPTION 'You can flag a post, a comment, a question, an answer, an event or a member.' USING ERRCODE = 'P0001';
  END IF;
  IF p_category IS NULL OR NOT (p_category = ANY (private.report_categories())) THEN
    RAISE EXCEPTION 'Please choose what the problem is.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_text) < 10 OR char_length(v_text) > 1000 THEN
    RAISE EXCEPTION 'Please tell our team why, in 10 to 1,000 characters.' USING ERRCODE = 'P0001';
  END IF;
  here := CASE p_kind
    WHEN 'post' THEN EXISTS (SELECT 1 FROM public.posts x WHERE x.id = p_id AND x.group_id = v_group)
    WHEN 'comment' THEN EXISTS (SELECT 1 FROM public.comments c JOIN public.posts x ON x.id = c.post_id
                                WHERE c.id = p_id AND x.group_id = v_group)
    WHEN 'help' THEN EXISTS (SELECT 1 FROM public.help_requests h WHERE h.id = p_id AND private.same_city(h.city, v_city))
    WHEN 'answer' THEN EXISTS (SELECT 1 FROM public.help_responses r JOIN public.help_requests h ON h.id = r.request_id
                               WHERE r.id = p_id AND private.same_city(h.city, v_city))
    WHEN 'event' THEN EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_id
                              AND (private.same_city(e.city, v_city) OR (e.city = '' AND position(lower(v_city) IN lower(e.location)) > 0)))
    WHEN 'profile' THEN EXISTS (SELECT 1 FROM public.group_members m WHERE m.group_id = v_group AND m.user_id = p_id)
                        AND private.is_listed_member(p_id)
  END;
  IF NOT COALESCE(here, FALSE) THEN
    RAISE EXCEPTION 'You can flag only what is in your city: its group, its questions, its events and its members. For anything else, use Report.' USING ERRCODE = 'P0001';
  END IF;
  author := CASE WHEN p_kind = 'profile' THEN p_id ELSE private.content_author(p_kind, p_id) END;
  IF author = uid THEN
    RAISE EXCEPTION 'You can''t flag your own content or profile.' USING ERRCODE = 'P0001';
  END IF;
  -- The limit of the Report button (private.rate_limit doesn't count what
  -- the database writes itself).
  PERFORM private.take_rate('report', ARRAY['20', '1 day']);
  UPDATE public.reports r SET ambassador_city = v_city, category = p_category, explanation = v_text, good_faith = TRUE
  WHERE r.reporter_id = uid AND r.status = 'pending' AND r.content_type = p_kind
    AND COALESCE(r.reported_post_id, r.reported_user_id) = p_id
  RETURNING r.id INTO report;
  IF report IS NULL THEN
    INSERT INTO public.reports (reporter_id, reported_post_id, reported_user_id, reason, content_type, category,
      explanation, good_faith, ambassador_city)
    VALUES (uid, CASE WHEN p_kind = 'profile' THEN NULL ELSE p_id END, CASE WHEN p_kind = 'profile' THEN p_id END,
      '[' || CASE WHEN p_kind = 'profile' THEN 'USER' ELSE upper(p_kind) END || '] Flagged by the ambassador of ' || v_city,
      p_kind, p_category, v_text, TRUE, v_city)
    RETURNING id INTO report;
  END IF;
  PERFORM private.alert_admins('The ambassador of ' || v_city || ' flagged '
    || CASE WHEN p_kind = 'profile' THEN 'a member' ELSE 'a ' || private.content_noun(p_kind) END
    || ' to our team. Please look at it in the admin panel (Reports).', report);
  PERFORM private.ambassador_log_add(v_city, 'flag', jsonb_build_object('kind', p_kind, 'id', p_id, 'report_id', report));
  RETURN report;
END;
$$;

-- ============================================================================
-- STEPPING DOWN, AND WHAT OUR TEAM SEES
-- ============================================================================

-- The ambassador stops being the city's ambassador, at once (they can at
-- any time, even without the agreement). Logged, and every admin is told in
-- the app. Returns the city they were ambassador for.
CREATE OR REPLACE FUNCTION public.ambassador_step_down()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  v_city TEXT;
  v_name TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  SELECT p.ambassador_city, p.name INTO v_city, v_name FROM public.profiles p WHERE p.id = uid FOR UPDATE;
  IF COALESCE(v_city, '') = '' THEN
    RAISE EXCEPTION 'You aren''t a city ambassador.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.profiles SET ambassador_city = '' WHERE id = uid;
  PERFORM private.ambassador_log_add(v_city, 'step_down', '{}'::jsonb);
  PERFORM private.alert_admins(COALESCE(NULLIF(v_name, ''), 'A member') || ' stepped down as the ambassador for '
    || v_city || '. See Ambassadors in the admin panel.', uid);
  RETURN v_city;
END;
$$;

-- For the admin panel (Ambassadors): { version (the agreement's current
-- version), ambassadors: each city ambassador now, by city (id, name, city,
-- since: when our team last made them ambassador for this city, from the
-- record of our decisions (null if that has been deleted),
-- agreement_version and agreement_accepted_at: the latest version they
-- accepted, current: whether that's the current one, welcomed_30d,
-- last_activity_at), log: the newest p_limit (at most 500) entries of the
-- ambassadors' log, with the ambassador's name }.
CREATE OR REPLACE FUNCTION public.admin_ambassador_activity(p_limit INTEGER DEFAULT 100)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'version', private.ambassador_agreement_version(),
    'ambassadors', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'city', p.ambassador_city,
        'since', (SELECT max(m.created_at) FROM private.moderation_action m
                  WHERE m.action = 'ambassador' AND m.target_user = p.id AND m.explanation = 'Ambassador for ' || p.ambassador_city),
        'agreement_version', a.version, 'agreement_accepted_at', a.accepted_at,
        'current', COALESCE(a.version = private.ambassador_agreement_version(), FALSE),
        'welcomed_30d', (SELECT count(*) FROM private.ambassador_welcomes w
                         WHERE w.ambassador_id = p.id AND w.at > NOW() - INTERVAL '30 days'),
        'last_activity_at', (SELECT max(l.at) FROM private.ambassador_log l WHERE l.ambassador_id = p.id))
      ORDER BY lower(p.ambassador_city), p.name)
      FROM public.profiles p
      LEFT JOIN LATERAL (SELECT x.version, x.accepted_at FROM private.ambassador_agreement_ack x
                         WHERE x.user_id = p.id ORDER BY x.accepted_at DESC LIMIT 1) a ON TRUE
      WHERE p.ambassador_city <> ''), '[]'::jsonb),
    'log', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'ambassador_id', l.ambassador_id, 'name', p.name,
        'city', l.city, 'action', l.action, 'detail', l.detail, 'at', l.at) ORDER BY l.at DESC)
      FROM (SELECT * FROM private.ambassador_log x ORDER BY x.at DESC
            LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)) l
      LEFT JOIN public.profiles p ON p.id = l.ambassador_id), '[]'::jsonb));
END;
$$;

-- ============================================================================
-- "DOWNLOAD MY DATA" AND CLEAN-UP
-- ============================================================================

-- As on 2026-10-26, plus the ambassador agreements the member accepted,
-- the newcomers they marked as welcomed (and when an ambassador marked them
-- as welcomed), and what they did as ambassador (the log).
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
  );
END;
$$;

-- As on 2026-10-26, plus the ambassadors' log and their welcomes, 12 months
-- after each entry. The periods are the Privacy Policy's (RETENTION in
-- src/content/legal/privacy.js).
CREATE OR REPLACE FUNCTION private.daily_cleanup()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  unconfirmed INTEGER;
  unfinished INTEGER;
  declined INTEGER;
  notices INTEGER;
  closed_reports INTEGER;
  records INTEGER;
  notes INTEGER;
  closed_notices INTEGER;
  copies INTEGER;
  actions INTEGER;
  decided_applications INTEGER;
  undecided_applications INTEGER;
  inbox INTEGER;
  travel INTEGER;
  amb_log INTEGER;
  welcomes INTEGER;
BEGIN
  -- Sign-ups that never confirmed their email address: 30 days.
  WITH gone AS (
    DELETE FROM auth.users u
    WHERE u.email_confirmed_at IS NULL AND u.created_at < NOW() - INTERVAL '30 days'
      AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = u.id)
    RETURNING 1)
  SELECT count(*) INTO unconfirmed FROM gone;

  -- Accounts that never sent their check details: 90 days after signing up,
  -- or after our team last sent them back to unfinished (that decision
  -- clears reviewed_at, so its date comes from verification_log).
  WITH gone AS (
    DELETE FROM auth.users u USING public.profile_private pp
    WHERE pp.id = u.id AND pp.verification_status = 'incomplete'
      AND pp.created_at < NOW() - INTERVAL '90 days'
      AND NOT EXISTS (SELECT 1 FROM public.verification_log l
                      WHERE l.member_id = pp.id AND l.decision = 'incomplete'
                        AND l.created_at >= NOW() - INTERVAL '90 days')
      AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = u.id)
    RETURNING 1)
  SELECT count(*) INTO unfinished FROM gone;

  -- Accounts our team declined: 6 months after the decision. (Accounts
  -- whose membership we ended are deleted by hand: the database can't tell
  -- a block for a time from the end of a membership.)
  WITH gone AS (
    DELETE FROM auth.users u USING public.profile_private pp
    WHERE pp.id = u.id AND pp.verification_status = 'rejected'
      AND COALESCE(pp.reviewed_at, pp.updated_at) < NOW() - INTERVAL '6 months'
      AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = u.id)
    RETURNING 1)
  SELECT count(*) INTO declined FROM gone;

  -- In-app notifications the member has read: 6 months.
  WITH gone AS (
    DELETE FROM public.notifications n WHERE n.read AND n.created_at < NOW() - INTERVAL '6 months' RETURNING 1)
  SELECT count(*) INTO notices FROM gone;

  -- Closed reports: once closed and 12 months old, unless held.
  WITH gone AS (
    DELETE FROM public.reports r
    WHERE r.status <> 'pending' AND r.created_at < NOW() - INTERVAL '12 months'
      AND NOT EXISTS (SELECT 1 FROM private.report_hold h WHERE h.report_id = r.id)
    RETURNING 1)
  SELECT count(*) INTO closed_reports FROM gone;

  -- Notices from the public report page: once closed and 12 months old,
  -- unless held.
  WITH gone AS (
    DELETE FROM private.notices n
    WHERE n.status = 'closed' AND n.created_at < NOW() - INTERVAL '12 months' AND n.hold_reason = ''
    RETURNING 1)
  SELECT count(*) INTO closed_notices FROM gone;

  -- Applications to be an ambassador: 6 months after our decision; those
  -- we haven't decided on, 12 months after they were sent.
  WITH gone AS (
    DELETE FROM private.ambassador_applications a
    WHERE a.status IN ('accepted', 'declined') AND COALESCE(a.decided_at, a.created_at) < NOW() - INTERVAL '6 months'
    RETURNING 1)
  SELECT count(*) INTO decided_applications FROM gone;
  WITH gone AS (
    DELETE FROM private.ambassador_applications a
    WHERE a.status IN ('new', 'contacted') AND a.created_at < NOW() - INTERVAL '12 months'
    RETURNING 1)
  SELECT count(*) INTO undecided_applications FROM gone;

  -- Record of declined and blocked accounts: 24 months after the decision;
  -- the note in it after 12.
  WITH gone AS (
    DELETE FROM private.moderation_record m WHERE m.created_at < NOW() - INTERVAL '24 months' RETURNING 1)
  SELECT count(*) INTO records FROM gone;
  WITH cleared AS (
    UPDATE private.moderation_record m SET admin_note = ''
    WHERE m.admin_note <> '' AND m.created_at < NOW() - INTERVAL '12 months' RETURNING 1)
  SELECT count(*) INTO notes FROM cleared;

  -- The record of what our team did: the copy of removed content after 6
  -- months, the rest after 24, unless a report or notice it answers is held
  -- for a legal dispute or a police matter.
  WITH cleared AS (
    UPDATE private.moderation_action a SET snapshot = NULL
    WHERE a.snapshot IS NOT NULL AND a.created_at < NOW() - INTERVAL '6 months'
      AND NOT EXISTS (SELECT 1 FROM private.report_hold h WHERE h.report_id = ANY (a.report_ids))
      AND NOT EXISTS (SELECT 1 FROM private.notices n WHERE n.id = a.notice_id AND n.hold_reason <> '')
    RETURNING 1)
  SELECT count(*) INTO copies FROM cleared;
  WITH gone AS (
    DELETE FROM private.moderation_action a
    WHERE a.created_at < NOW() - INTERVAL '24 months'
      AND NOT EXISTS (SELECT 1 FROM private.report_hold h WHERE h.report_id = ANY (a.report_ids))
      AND NOT EXISTS (SELECT 1 FROM private.notices n WHERE n.id = a.notice_id AND n.hold_reason <> '')
    RETURNING 1)
  SELECT count(*) INTO actions FROM gone;

  -- Mail to hello@nriclub.app kept in the admin panel's Inbox, with our
  -- replies: 12 months after it arrived.
  WITH gone AS (
    DELETE FROM private.inbox_messages m WHERE m.received_at < NOW() - INTERVAL '12 months' RETURNING 1)
  SELECT count(*) INTO inbox FROM gone;

  -- Trips on the travel board: 30 days after their last date.
  WITH gone AS (
    DELETE FROM public.travel_posts t WHERE t.date_to < private.today_in_germany() - 30 RETURNING 1)
  SELECT count(*) INTO travel FROM gone;

  -- What city ambassadors did (private.ambassador_log), and the newcomers
  -- they marked as welcomed: 12 months after each.
  WITH gone AS (
    DELETE FROM private.ambassador_log l WHERE l.at < NOW() - INTERVAL '12 months' RETURNING 1)
  SELECT count(*) INTO amb_log FROM gone;
  WITH gone AS (
    DELETE FROM private.ambassador_welcomes w WHERE w.at < NOW() - INTERVAL '12 months' RETURNING 1)
  SELECT count(*) INTO welcomes FROM gone;

  -- The counters behind the limits and the name changes. Those of the
  -- travel board's posts count for 30 days, so they're kept that long.
  DELETE FROM private.rate_log r WHERE r.at < NOW() - INTERVAL '1 day'
    AND (r.action <> 'travel_post' OR r.at < NOW() - INTERVAL '30 days');
  DELETE FROM private.name_changes c WHERE c.changed_at < NOW() - INTERVAL '30 days';
  DELETE FROM private.notice_log l WHERE l.at < NOW() - INTERVAL '1 day';
  DELETE FROM private.ambassador_application_log l WHERE l.at < NOW() - INTERVAL '1 day';
  DELETE FROM private.member_email_log l WHERE l.created_at < NOW() - INTERVAL '30 days';

  RETURN jsonb_build_object(
    'unconfirmed_signups', unconfirmed, 'unfinished_accounts', unfinished, 'declined_accounts', declined,
    'read_notifications', notices, 'closed_reports', closed_reports, 'closed_notices', closed_notices,
    'moderation_records', records, 'moderation_notes_cleared', notes,
    'moderation_copies_cleared', copies, 'moderation_actions', actions)
    || jsonb_build_object(
    'decided_ambassador_applications', decided_applications,
    'undecided_ambassador_applications', undecided_applications)
    || jsonb_build_object('inbox_messages', inbox)
    || jsonb_build_object('travel_posts', travel)
    || jsonb_build_object('ambassador_log', amb_log, 'ambassador_welcomes', welcomes);
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

REVOKE ALL ON FUNCTION private.ambassador_agreement_version(), private.ambassador_gate(), private.city_group_id(TEXT),
  private.same_city(TEXT, TEXT), private.ambassador_log_add(TEXT, TEXT, JSONB), private.city_newcomers(TEXT, INTEGER),
  private.sync_ambassador_hosted(), private.end_ambassador_hosted() FROM PUBLIC;
-- The triggers run for members, as the other triggers do.
GRANT EXECUTE ON FUNCTION private.sync_ambassador_hosted(), private.end_ambassador_hosted() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.ambassador_agreement_version(), private.ambassador_gate(), private.city_group_id(TEXT),
  private.same_city(TEXT, TEXT), private.ambassador_log_add(TEXT, TEXT, JSONB), private.city_newcomers(TEXT, INTEGER)
  TO service_role;
-- Members only (each function checks who is asking; admin_ambassador_activity
-- says "Admins only" to members).
REVOKE ALL ON FUNCTION public.ambassador_status(), public.accept_ambassador_agreement(TEXT), public.ambassador_overview(),
  public.ambassador_new_members(INTEGER), public.ambassador_mark_welcomed(UUID, BOOLEAN), public.ambassador_open_questions(),
  public.ambassador_update_group(TEXT), public.set_event_ambassador_hosted(UUID, BOOLEAN),
  public.ambassador_flag(TEXT, UUID, TEXT, TEXT), public.ambassador_step_down(), public.admin_ambassador_activity(INTEGER),
  public.pin_group_post(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ambassador_status(), public.accept_ambassador_agreement(TEXT), public.ambassador_overview(),
  public.ambassador_new_members(INTEGER), public.ambassador_mark_welcomed(UUID, BOOLEAN), public.ambassador_open_questions(),
  public.ambassador_update_group(TEXT), public.set_event_ambassador_hosted(UUID, BOOLEAN),
  public.ambassador_flag(TEXT, UUID, TEXT, TEXT), public.ambassador_step_down(), public.admin_ambassador_activity(INTEGER),
  public.pin_group_post(UUID, UUID) TO authenticated;
