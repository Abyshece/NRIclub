-- ============================================================================
-- NRIclub: admin tools (2026-10-25)
--
--   * Decision emails. When our team approves a member, asks them for more
--     information, declines them or blocks them, the member also gets a short
--     email (until now only an in-app notice). The admin panel asks the Edge
--     Function member-email (supabase/functions/member-email) to send it, a
--     few seconds after the decision, once its Undo has gone. The function
--     first calls public.admin_member_email as the admin: it checks admin
--     rights (private.is_admin, so two-step login counts too), that the
--     decision is still the member's current one and less than an hour old,
--     and that no email about it has gone out yet (one per decision), counts
--     it against the admin's limits, and returns what the email may say: only
--     what the member already sees in the app (the message with a request
--     for more information or a refusal, the reason for a block). The
--     function then reads the address with the service role and sends the
--     email through Resend. private.member_email_log notes which decision
--     emails went out (not their text), for 30 days.
--   * Deleting unfinished sign-ups. Our team can delete an account that never
--     sent its check details (verification status 'incomplete', never sent),
--     confirmed email address or not: the Edge Function admin-delete-signup
--     checks with public.admin_check_signup_delete (as the admin), deletes
--     the account with Supabase Auth's admin API, then records it with
--     public.admin_record_signup_delete (service role only) in
--     private.moderation_action as 'delete_signup', like our team's other
--     decisions. Approved, waiting, declined and blocked accounts, admins and
--     the admin's own account can't be deleted this way.
--   * What's on from the admin panel. public.whats_on_events holds events our
--     team adds in the admin panel, next to the list in src/content/whatson.js
--     (the site shows both; an id used in the code wins). Anyone can read the
--     events still to come that aren't hidden (not who added them); only
--     admins change them, through public.admin_save_whats_on_event,
--     admin_hide_whats_on_event and admin_delete_whats_on_event, which check
--     the same rules as the build does for the list in the code
--     (validateWhatsOn): an id of a-z, 0-9 and dashes, a known category, real
--     dates (end not before start), a summary of at most 160 characters, a
--     full https:// address. public.admin_whats_on_events lists them all for
--     the panel.
--   * Inbox. Mail to hello@nriclub.app (received by Resend) is stored in
--     private.inbox_messages by the Edge Function forward-email
--     (public.inbox_store, service role only), which may still forward a
--     copy. The admin panel lists it (public.admin_inbox_list), opens a
--     message and marks it read (admin_inbox_get), archives it or marks it
--     unread (admin_inbox_set), and replies through the Edge Function
--     admin-inbox-reply (public.admin_inbox_reply_prepare as the admin, then
--     public.inbox_record_reply, service role only, into
--     private.inbox_replies). Messages and their replies are deleted 12
--     months after they arrived.
--   * Emails left this month: every Edge Function that calls Resend stores
--     Resend's own counters from its answer (public.resend_quota_store,
--     service role only, into private.app_settings 'resend_quota'); the
--     admin panel reads them (public.admin_resend_quota).
--   * Clean-up (private.daily_cleanup): the 2026-10-24 version plus the
--     Inbox (12 months) and the log of decision emails (30 days).
-- Needs all earlier migrations (up to 20261024000000_ambassador_applications.sql).
-- Runs as one transaction (it can be run as it is in the SQL editor); it
-- refuses to run before the 2026-10-24 update, and a second time.
-- Existing rows: none change. private.moderation_action accepts one more
-- action ('delete_signup').
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('private.ambassador_applications') IS NULL OR to_regclass('private.moderation_action') IS NULL
     OR to_regprocedure('private.take_rate(text, text[])') IS NULL THEN
    RAISE EXCEPTION 'Run the earlier updates (up to 20261024000000_ambassador_applications.sql) first.';
  END IF;
  IF to_regclass('public.whats_on_events') IS NOT NULL THEN
    RAISE EXCEPTION 'This update has already run. Nothing to do.';
  END IF;
END;
$$;

-- ============================================================================
-- DECISION EMAILS
-- ============================================================================

-- The decision emails that went out: which member, which decision (kind:
-- 'approved', 'needs_info', 'rejected' or 'blocked') and when it was taken
-- (decided_at: reviewed_at or blocked_at), so one decision is emailed once.
-- actor_id: the admin. Kept 30 days (private.daily_cleanup, and
-- admin_member_email), and deleted with the member's account. Only the database reads it.
CREATE TABLE private.member_email_log (
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('approved', 'needs_info', 'rejected', 'blocked')),
  decided_at TIMESTAMPTZ NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_id, kind, decided_at)
);
CREATE INDEX idx_member_email_log_created ON private.member_email_log (created_at);
ALTER TABLE private.member_email_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.member_email_log FROM PUBLIC, anon, authenticated;

-- What the email about a decision may say, for the Edge Function
-- member-email (which calls it as the admin). p_kind: 'approved',
-- 'needs_info', 'rejected' or 'blocked'. Refused unless that decision is the
-- member's current one, taken less than an hour ago, and not emailed yet; an
-- admin can have 30 sent a minute and 300 a day. Returns { kind, first_name,
-- message (needs_info, rejected: the message the member sees in the app),
-- rule and reason (blocked: as the block screen shows them), decided_at }.
-- The email address isn't returned: the function reads it itself.
CREATE FUNCTION public.admin_member_email(p_member UUID, p_kind TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  pp public.profile_private;
  v_name TEXT;
  decided TIMESTAMPTZ;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('approved', 'needs_info', 'rejected', 'blocked') THEN
    RAISE EXCEPTION 'Unknown kind of email: %', p_kind USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO pp FROM public.profile_private WHERE id = p_member;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found.' USING ERRCODE = 'P0002';
  END IF;
  SELECT p.name INTO v_name FROM public.profiles p WHERE p.id = p_member;
  decided := CASE WHEN p_kind = 'blocked'
    THEN CASE WHEN pp.status = 'blocked' THEN pp.blocked_at END
    ELSE CASE WHEN pp.verification_status = p_kind THEN pp.reviewed_at END END;
  IF decided IS NULL OR decided < NOW() - INTERVAL '1 hour' THEN
    RAISE EXCEPTION 'This decision has changed since, or is too old to email.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM private.take_rate('member_email', ARRAY['30', '1 minute', '300', '1 day']);
  DELETE FROM private.member_email_log l WHERE l.created_at < NOW() - INTERVAL '30 days';
  INSERT INTO private.member_email_log (member_id, kind, decided_at, actor_id)
  VALUES (p_member, p_kind, decided, (SELECT auth.uid()))
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An email about this decision has already gone out.' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object(
    'kind', p_kind,
    'first_name', split_part(btrim(COALESCE(v_name, '')), ' ', 1),
    'message', CASE WHEN p_kind IN ('needs_info', 'rejected') THEN pp.verification_message ELSE '' END,
    'rule', CASE WHEN p_kind = 'blocked' THEN pp.block_rule ELSE '' END,
    'reason', CASE WHEN p_kind = 'blocked' THEN pp.block_reason ELSE '' END,
    'decided_at', decided);
END;
$$;

-- ============================================================================
-- EMAILS LEFT THIS MONTH (Resend's counter)
-- ============================================================================

-- How many emails Resend has counted, as its answers say
-- (x-resend-monthly-quota, x-resend-daily-quota): kept in
-- private.app_settings under 'resend_quota' as { monthly_used, daily_used,
-- observed_at }. Every Edge Function that calls Resend stores it after the
-- call (service role only). Sign-in and sign-up codes go through Resend too
-- and count, which only Resend's own counter shows. null: not in the answer.
CREATE FUNCTION public.resend_quota_store(p_monthly_used INTEGER, p_daily_used INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v JSONB;
BEGIN
  IF p_monthly_used IS NULL AND p_daily_used IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_monthly_used < 0 OR p_daily_used < 0 THEN
    RAISE EXCEPTION 'Counts can''t be negative.' USING ERRCODE = 'P0001';
  END IF;
  v := jsonb_build_object('monthly_used', p_monthly_used, 'daily_used', p_daily_used, 'observed_at', NOW());
  INSERT INTO private.app_settings (key, value, updated_at) VALUES ('resend_quota', v, NOW())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
  RETURN v;
END;
$$;

-- The last counts, for the admin panel; null before any was seen.
CREATE FUNCTION public.admin_resend_quota()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT s.value FROM private.app_settings s WHERE s.key = 'resend_quota');
END;
$$;

-- ============================================================================
-- DELETING UNFINISHED SIGN-UPS
-- ============================================================================

ALTER TABLE private.moderation_action DROP CONSTRAINT moderation_action_action_check;
ALTER TABLE private.moderation_action ADD CONSTRAINT moderation_action_action_check
  CHECK (action IN ('remove', 'warn', 'block', 'unblock', 'dismiss', 'reopen',
    'group_approve', 'group_unapprove', 'group_reject', 'group_delete', 'ambassador', 'delete_signup'));

-- Whether an account is an unfinished sign-up our team may delete: it never
-- sent its check details (still 'incomplete', no submission date and no
-- 'submitted' in its history), isn't blocked and isn't an admin.
CREATE FUNCTION private.is_unfinished_signup(p_member UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_private pp
    WHERE pp.id = p_member AND pp.verification_status = 'incomplete' AND pp.submitted_at IS NULL
      AND pp.status <> 'blocked'
      AND NOT EXISTS (SELECT 1 FROM public.verification_log l WHERE l.member_id = pp.id AND l.decision = 'submitted')
      AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = pp.id));
$$;

-- Before the Edge Function admin-delete-signup deletes an account (called as
-- the admin): refused unless the caller is an admin and the account is an
-- unfinished sign-up (private.is_unfinished_signup), and not their own. 20 a
-- minute and 200 a day. Returns { member, actor, email_confirmed }.
CREATE FUNCTION public.admin_check_signup_delete(p_member UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := (SELECT auth.uid());
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_member IS NULL OR NOT EXISTS (SELECT 1 FROM public.profile_private pp WHERE pp.id = p_member) THEN
    RAISE EXCEPTION 'Member not found.' USING ERRCODE = 'P0002';
  END IF;
  IF p_member = me OR NOT private.is_unfinished_signup(p_member) THEN
    RAISE EXCEPTION 'Only an account that never finished signing up can be deleted here.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM private.take_rate('delete_signup', ARRAY['20', '1 minute', '200', '1 day']);
  RETURN jsonb_build_object('member', p_member, 'actor', me,
    'email_confirmed', EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_member AND u.email_confirmed_at IS NOT NULL));
END;
$$;

-- After the Edge Function deleted the account (service role only): records
-- it like our team's other decisions. p_actor must be an admin; the account
-- must be gone. No personal data of the deleted account is kept, only its id.
CREATE FUNCTION public.admin_record_signup_delete(p_actor UUID, p_member UUID, p_email_confirmed BOOLEAN)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  action_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = p_actor) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_member IS NULL OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_member) THEN
    RAISE EXCEPTION 'This account hasn''t been deleted.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO private.moderation_action (actor_id, action, target_kind, target_id, explanation, source)
  VALUES (p_actor, 'delete_signup', 'member', p_member,
    CASE WHEN p_email_confirmed THEN 'Unfinished sign-up deleted (email address confirmed, check details never sent)'
         ELSE 'Unfinished sign-up deleted (email address never confirmed)' END, 'own_initiative')
  RETURNING id INTO action_id;
  RETURN action_id;
END;
$$;

-- ============================================================================
-- WHAT'S ON
-- ============================================================================

-- The kinds of event, as CATEGORY_LABELS in src/content/whatson.js.
CREATE FUNCTION private.whats_on_categories()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY['festival', 'music', 'party', 'comedy', 'film', 'food', 'sport', 'spiritual', 'community',
    'talk', 'culture']::TEXT[];
$$;

-- Today in Germany (the events are there; the day turns at midnight in Berlin).
CREATE FUNCTION private.today_in_germany()
RETURNS DATE LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (NOW() AT TIME ZONE 'Europe/Berlin')::DATE;
$$;

-- One event our team added, with the fields of an item in
-- src/content/whatson.js (start_date, end_date and event_time there are
-- start, end and time; optional fields are '' when left out). hidden: taken
-- off the site without deleting it. created_by / updated_by: the admins.
CREATE TABLE public.whats_on_events (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(id) <= 100),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  category TEXT NOT NULL CHECK (category = ANY (private.whats_on_categories())),
  start_date DATE NOT NULL,
  end_date DATE CHECK (end_date >= start_date),
  event_time TEXT NOT NULL DEFAULT '' CHECK (char_length(event_time) <= 40),
  city TEXT NOT NULL CHECK (char_length(city) BETWEEN 1 AND 100 AND city ~ '[[:alpha:]]'),
  venue TEXT NOT NULL DEFAULT '' CHECK (char_length(venue) <= 200),
  area TEXT NOT NULL DEFAULT '' CHECK (char_length(area) <= 200),
  organiser TEXT NOT NULL CHECK (char_length(btrim(organiser)) BETWEEN 1 AND 200),
  price TEXT NOT NULL DEFAULT '' CHECK (char_length(price) <= 200),
  language TEXT NOT NULL DEFAULT '' CHECK (char_length(language) <= 200),
  summary TEXT NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 1 AND 160),
  url TEXT NOT NULL CHECK (url ~ '^https://[^[:space:]/?#]+[^[:space:]]*$' AND char_length(url) <= 2000),
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_whats_on_events_end ON public.whats_on_events ((COALESCE(end_date, start_date))) WHERE NOT hidden;
ALTER TABLE public.whats_on_events ENABLE ROW LEVEL SECURITY;
-- Everyone (signed out too) reads the events still to come that aren't
-- hidden, without who added them; nobody writes through the API (the admin
-- functions below do).
REVOKE ALL ON public.whats_on_events FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, title, category, start_date, end_date, event_time, city, venue, area, organiser, price, language,
  summary, url) ON public.whats_on_events TO anon, authenticated;
CREATE POLICY "Upcoming events are public" ON public.whats_on_events FOR SELECT TO anon, authenticated
  USING (NOT hidden AND COALESCE(end_date, start_date) >= private.today_in_germany());
GRANT EXECUTE ON FUNCTION private.today_in_germany() TO anon, authenticated;

-- An event as the admin panel has it (all fields, in the shape of
-- src/content/whatson.js, plus hidden and the dates).
CREATE FUNCTION private.whats_on_json(e public.whats_on_events)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', e.id, 'title', e.title, 'category', e.category, 'start', e.start_date::TEXT,
    'end', e.end_date::TEXT, 'time', NULLIF(e.event_time, ''), 'city', e.city, 'venue', NULLIF(e.venue, ''),
    'area', NULLIF(e.area, ''), 'organiser', e.organiser, 'price', NULLIF(e.price, ''),
    'language', NULLIF(e.language, ''), 'summary', e.summary, 'url', e.url))
    || jsonb_build_object('hidden', e.hidden, 'created_at', e.created_at, 'updated_at', e.updated_at);
$$;

-- Every event in the table, for the admin panel: upcoming ones soonest first,
-- then those that have ended (the latest first, at most 200 of them).
CREATE FUNCTION public.admin_whats_on_events()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  today DATE := private.today_in_germany();
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'upcoming', COALESCE((SELECT jsonb_agg(private.whats_on_json(e) ORDER BY e.start_date, e.title)
      FROM public.whats_on_events e WHERE COALESCE(e.end_date, e.start_date) >= today), '[]'::jsonb),
    'past', COALESCE((SELECT jsonb_agg(private.whats_on_json(x) ORDER BY x.start_date DESC, x.title)
      FROM (SELECT * FROM public.whats_on_events e WHERE COALESCE(e.end_date, e.start_date) < today
            ORDER BY e.start_date DESC LIMIT 200) x), '[]'::jsonb));
END;
$$;

-- Adds an event (p_new) or changes one (its id stays), from the admin
-- panel's form: p_event in the shape of an item in src/content/whatson.js.
-- The rules of validateWhatsOn, plus: an event that has already ended can't
-- be added or changed. Text is trimmed; spaces inside are kept. 60 changes an
-- hour per admin. Returns the event (private.whats_on_json).
CREATE FUNCTION public.admin_save_whats_on_event(p_event JSONB, p_new BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := (SELECT auth.uid());
  f JSONB := COALESCE(p_event, '{}'::jsonb);
  v_id TEXT;
  v_start DATE;
  v_end DATE;
  t TEXT;
  saved public.whats_on_events;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(f) <> 'object' THEN
    RAISE EXCEPTION 'The event must be an object.' USING ERRCODE = 'P0001';
  END IF;
  -- Only the fields of an item in src/content/whatson.js, all text.
  SELECT string_agg(k, ', ') INTO t FROM jsonb_object_keys(f) k
  WHERE k NOT IN ('id', 'title', 'category', 'start', 'end', 'time', 'city', 'venue', 'area', 'organiser',
    'price', 'language', 'summary', 'url');
  IF t IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown field: %', t USING ERRCODE = 'P0001';
  END IF;
  SELECT string_agg(k, ', ') INTO t FROM jsonb_each(f) x(k, v) WHERE jsonb_typeof(v) NOT IN ('string', 'null');
  IF t IS NOT NULL THEN
    RAISE EXCEPTION 'These fields must be text: %', t USING ERRCODE = 'P0001';
  END IF;
  -- Every field as trimmed text ('' for null).
  SELECT jsonb_object_agg(k, btrim(COALESCE(v #>> '{}', ''))) INTO f
  FROM jsonb_each(f) x(k, v);
  f := COALESCE(f, '{}'::jsonb);

  v_id := COALESCE(f ->> 'id', '');
  IF v_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(v_id) > 100 THEN
    RAISE EXCEPTION 'The id may have only a-z, 0-9 and single dashes, e.g. "2026-11-07-diwali-mela-berlin".' USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(f ->> 'title', '') = '' OR COALESCE(f ->> 'city', '') = '' OR COALESCE(f ->> 'organiser', '') = ''
     OR COALESCE(f ->> 'summary', '') = '' OR COALESCE(f ->> 'url', '') = '' OR COALESCE(f ->> 'category', '') = ''
     OR COALESCE(f ->> 'start', '') = '' THEN
    RAISE EXCEPTION 'Fill in the title, type, date, city, organiser, summary and link.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(f ->> 'title') > 120 THEN
    RAISE EXCEPTION 'Keep the title to 120 characters.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT (f ->> 'category') = ANY (private.whats_on_categories()) THEN
    RAISE EXCEPTION 'Unknown type of event: %', f ->> 'category' USING ERRCODE = 'P0001';
  END IF;
  -- Real dates as YYYY-MM-DD ("2026-02-30" isn't one).
  BEGIN
    IF (f ->> 'start') !~ '^\d{4}-\d{2}-\d{2}$' OR COALESCE(NULLIF(f ->> 'end', ''), '2000-01-01') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION USING ERRCODE = '22007';
    END IF;
    v_start := (f ->> 'start')::DATE;
    v_end := NULLIF(f ->> 'end', '')::DATE;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Give the dates as real days, e.g. 2026-11-07.' USING ERRCODE = 'P0001';
  END;
  IF v_end = v_start THEN
    v_end := NULL;
  END IF;
  IF v_end < v_start THEN
    RAISE EXCEPTION 'The last day is before the first.' USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(v_end, v_start) < private.today_in_germany() THEN
    RAISE EXCEPTION 'This event has already ended.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(f ->> 'summary') > 160 THEN
    RAISE EXCEPTION 'Keep the summary to 160 characters (it has %).', char_length(f ->> 'summary') USING ERRCODE = 'P0001';
  END IF;
  IF (f ->> 'url') !~ '^https://[^[:space:]/?#]+[^[:space:]]*$' OR char_length(f ->> 'url') > 2000 THEN
    RAISE EXCEPTION 'The link must be a full https:// address.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(COALESCE(f ->> 'time', '')) > 40 THEN
    RAISE EXCEPTION 'Give the time as e.g. "18:00" or "18:30–23:00".' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(f ->> 'city') > 100 OR (f ->> 'city') !~ '[[:alpha:]]' THEN
    RAISE EXCEPTION 'Give the city by its name.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(f ->> 'organiser') > 200 OR char_length(COALESCE(f ->> 'venue', '')) > 200
     OR char_length(COALESCE(f ->> 'area', '')) > 200 OR char_length(COALESCE(f ->> 'price', '')) > 200
     OR char_length(COALESCE(f ->> 'language', '')) > 200 THEN
    RAISE EXCEPTION 'Keep the organiser, place, price and language to 200 characters each.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM private.take_rate('whats_on', ARRAY['60', '1 hour']);

  IF COALESCE(p_new, FALSE) THEN
    INSERT INTO public.whats_on_events (id, title, category, start_date, end_date, event_time, city, venue, area,
      organiser, price, language, summary, url, created_by, updated_by)
    VALUES (v_id, f ->> 'title', f ->> 'category', v_start, v_end, COALESCE(f ->> 'time', ''), f ->> 'city',
      COALESCE(f ->> 'venue', ''), COALESCE(f ->> 'area', ''), f ->> 'organiser', COALESCE(f ->> 'price', ''),
      COALESCE(f ->> 'language', ''), f ->> 'summary', f ->> 'url', me, me)
    ON CONFLICT (id) DO NOTHING
    RETURNING * INTO saved;
    IF saved.id IS NULL THEN
      RAISE EXCEPTION 'An event with this id already exists. Change the id.' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    UPDATE public.whats_on_events SET title = f ->> 'title', category = f ->> 'category', start_date = v_start,
      end_date = v_end, event_time = COALESCE(f ->> 'time', ''), city = f ->> 'city', venue = COALESCE(f ->> 'venue', ''),
      area = COALESCE(f ->> 'area', ''), organiser = f ->> 'organiser', price = COALESCE(f ->> 'price', ''),
      language = COALESCE(f ->> 'language', ''), summary = f ->> 'summary', url = f ->> 'url',
      updated_by = me, updated_at = NOW()
    WHERE id = v_id
    RETURNING * INTO saved;
    IF saved.id IS NULL THEN
      RAISE EXCEPTION 'Event not found. It may have been deleted.' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN private.whats_on_json(saved);
END;
$$;

-- Takes an event off the site (p_hidden) or puts it back. Returns the event.
CREATE FUNCTION public.admin_hide_whats_on_event(p_id TEXT, p_hidden BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  saved public.whats_on_events;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_hidden IS NULL THEN
    RAISE EXCEPTION 'Say whether to hide the event.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.whats_on_events SET hidden = p_hidden, updated_by = (SELECT auth.uid()), updated_at = NOW()
  WHERE id = p_id
  RETURNING * INTO saved;
  IF saved.id IS NULL THEN
    RAISE EXCEPTION 'Event not found. It may have been deleted.' USING ERRCODE = 'P0002';
  END IF;
  RETURN private.whats_on_json(saved);
END;
$$;

-- Deletes an event. Returns its id.
CREATE FUNCTION public.admin_delete_whats_on_event(p_id TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.whats_on_events WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found. It may have been deleted.' USING ERRCODE = 'P0002';
  END IF;
  RETURN p_id;
END;
$$;

-- ============================================================================
-- INBOX (mail to hello@nriclub.app)
-- ============================================================================

-- Mail to hello@nriclub.app, as Resend received it. The Edge Function
-- forward-email stores each one (public.inbox_store, service role only) and
-- may also forward a copy. resend_email_id: Resend's id (each email is stored
-- once). message_id: the email's own Message-ID header, for the threading of
-- replies. from_address, reply_to, to_addresses, subject, text_body,
-- html_body: as received (the panel shows text only; the HTML is kept for an
-- email without text and is never shown as HTML). attachments: their names,
-- types and sizes only (the files stay with Resend). read_at, archived,
-- replied_at: our team's handling. Deleted 12 months after it arrived
-- (private.daily_cleanup), with our replies.
CREATE TABLE private.inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_email_id TEXT NOT NULL UNIQUE CHECK (char_length(resend_email_id) BETWEEN 1 AND 200),
  message_id TEXT NOT NULL DEFAULT '' CHECK (char_length(message_id) <= 1000),
  from_address TEXT NOT NULL DEFAULT '' CHECK (char_length(from_address) <= 1000),
  reply_to TEXT NOT NULL DEFAULT '' CHECK (char_length(reply_to) <= 1000),
  to_addresses TEXT[] NOT NULL DEFAULT '{}',
  subject TEXT NOT NULL DEFAULT '' CHECK (char_length(subject) <= 1000),
  text_body TEXT NOT NULL DEFAULT '' CHECK (char_length(text_body) <= 200000),
  html_body TEXT NOT NULL DEFAULT '' CHECK (char_length(html_body) <= 500000),
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attachments) = 'array'),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  replied_at TIMESTAMPTZ
);
CREATE INDEX idx_inbox_messages_received ON private.inbox_messages (received_at DESC);
ALTER TABLE private.inbox_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.inbox_messages FROM PUBLIC, anon, authenticated;

-- Our team's replies from the admin panel, sent through Resend (resend_id:
-- Resend's id of the sent email). admin_id: who replied.
CREATE TABLE private.inbox_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES private.inbox_messages(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resend_id TEXT NOT NULL DEFAULT '' CHECK (char_length(resend_id) <= 200)
);
CREATE INDEX idx_inbox_replies_message ON private.inbox_replies (message_id, sent_at);
ALTER TABLE private.inbox_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.inbox_replies FROM PUBLIC, anon, authenticated;

-- Stores one received email (forward-email, service role only): p_email
-- with resend_email_id, message_id, from, reply_to, to (an array), subject,
-- text, html, attachments ([{ filename, content_type, size }]) and
-- received_at. Too long text is cut. The same email again changes nothing.
-- Returns the message's id.
CREATE FUNCTION public.inbox_store(p_email JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e JSONB := COALESCE(p_email, '{}'::jsonb);
  v_key TEXT := LEFT(COALESCE(p_email ->> 'resend_email_id', ''), 200);
  v_id UUID;
  v_received TIMESTAMPTZ;
BEGIN
  IF v_key = '' THEN
    RAISE EXCEPTION 'resend_email_id is missing.' USING ERRCODE = 'P0001';
  END IF;
  BEGIN
    v_received := LEAST(COALESCE(NULLIF(e ->> 'received_at', '')::TIMESTAMPTZ, NOW()), NOW());
  EXCEPTION WHEN OTHERS THEN
    v_received := NOW();
  END;
  INSERT INTO private.inbox_messages (resend_email_id, message_id, from_address, reply_to, to_addresses, subject,
    text_body, html_body, attachments, received_at)
  VALUES (v_key, LEFT(COALESCE(e ->> 'message_id', ''), 1000),
    LEFT(COALESCE(e ->> 'from', ''), 1000), LEFT(COALESCE(e ->> 'reply_to', ''), 1000),
    COALESCE((SELECT array_agg(LEFT(x, 1000)) FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(e -> 'to') = 'array' THEN e -> 'to' ELSE '[]'::jsonb END) x), '{}'),
    LEFT(COALESCE(e ->> 'subject', ''), 1000), LEFT(COALESCE(e ->> 'text', ''), 200000),
    LEFT(COALESCE(e ->> 'html', ''), 500000),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'filename', LEFT(COALESCE(NULLIF(a ->> 'filename', ''), 'attachment'), 300),
        'content_type', LEFT(COALESCE(a ->> 'content_type', ''), 200),
        'size', CASE WHEN jsonb_typeof(a -> 'size') = 'number' THEN a -> 'size' ELSE 'null'::jsonb END))
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e -> 'attachments') = 'array' THEN e -> 'attachments' ELSE '[]'::jsonb END) a
      WHERE jsonb_typeof(a) = 'object'), '[]'::jsonb),
    v_received)
  ON CONFLICT (resend_email_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT m.id INTO v_id FROM private.inbox_messages m WHERE m.resend_email_id = v_key;
  END IF;
  RETURN v_id;
END;
$$;

-- A message as the Inbox lists it: who it's from, the subject, the start of
-- the text, and our handling.
CREATE FUNCTION private.inbox_summary(m private.inbox_messages)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', m.id, 'from', m.from_address, 'subject', m.subject,
    'snippet', LEFT(btrim(regexp_replace(m.text_body, '\s+', ' ', 'g')), 200), 'received_at', m.received_at,
    'read', m.read_at IS NOT NULL, 'archived', m.archived, 'replied_at', m.replied_at,
    'attachments', jsonb_array_length(m.attachments));
$$;

-- The Inbox, for the admin panel: p_filter 'inbox' (not archived; unread
-- first, then newest), 'unread', 'archived' or 'all' (newest first);
-- p_query finds part of the sender, subject or text. { messages, total
-- (matching), unread (all unread, not archived) }. At most 100 at a time.
CREATE FUNCTION public.admin_inbox_list(p_filter TEXT DEFAULT 'inbox', p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0, p_query TEXT DEFAULT '')
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  q TEXT := btrim(LEFT(COALESCE(p_query, ''), 200));
  pat TEXT;
  lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  off INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  f TEXT := COALESCE(p_filter, 'inbox');
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF f NOT IN ('inbox', 'unread', 'archived', 'all') THEN
    RAISE EXCEPTION 'Unknown filter: %', f USING ERRCODE = 'P0001';
  END IF;
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  RETURN (
    WITH matching AS (
      SELECT m FROM private.inbox_messages m
      WHERE CASE f WHEN 'inbox' THEN NOT m.archived WHEN 'unread' THEN NOT m.archived AND m.read_at IS NULL
                   WHEN 'archived' THEN m.archived ELSE TRUE END
        AND (q = '' OR m.from_address ILIKE pat OR m.subject ILIKE pat OR m.text_body ILIKE pat)),
    page AS (
      SELECT x.m, row_number() OVER (ORDER BY ((x.m).read_at IS NULL AND f = 'inbox') DESC, (x.m).received_at DESC, (x.m).id) AS n
      FROM (SELECT y.m FROM matching y
            ORDER BY ((y.m).read_at IS NULL AND f = 'inbox') DESC, (y.m).received_at DESC, (y.m).id
            LIMIT lim OFFSET off) x)
    SELECT jsonb_build_object(
      'messages', COALESCE((SELECT jsonb_agg(private.inbox_summary(p.m) ORDER BY p.n) FROM page p), '[]'::jsonb),
      'total', (SELECT count(*) FROM matching),
      'unread', (SELECT count(*) FROM private.inbox_messages m WHERE NOT m.archived AND m.read_at IS NULL)));
END;
$$;

-- One message with everything the panel shows (the text; the HTML only for
-- an email without text, which the panel turns into text) and our replies,
-- oldest first. Marks it read.
CREATE FUNCTION public.admin_inbox_get(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m private.inbox_messages;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  UPDATE private.inbox_messages SET read_at = COALESCE(read_at, NOW()) WHERE id = p_id RETURNING * INTO m;
  IF m.id IS NULL THEN
    RAISE EXCEPTION 'Message not found. It may have been deleted.' USING ERRCODE = 'P0002';
  END IF;
  RETURN private.inbox_summary(m) || jsonb_build_object(
    'reply_to', m.reply_to, 'to', to_jsonb(m.to_addresses), 'text', m.text_body,
    'html', CASE WHEN btrim(m.text_body) = '' THEN m.html_body ELSE '' END,
    'attachment_list', m.attachments,
    'replies', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'body', r.body, 'sent_at', r.sent_at,
        'by', COALESCE(NULLIF(p.name, ''), 'NRIClub Team')) ORDER BY r.sent_at)
      FROM private.inbox_replies r LEFT JOIN public.profiles p ON p.id = r.admin_id WHERE r.message_id = m.id), '[]'::jsonb));
END;
$$;

-- Archives a message or brings it back (p_archived), marks it read or unread
-- (p_read); null leaves that as it is. Returns the message as listed.
CREATE FUNCTION public.admin_inbox_set(p_id UUID, p_archived BOOLEAN DEFAULT NULL, p_read BOOLEAN DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m private.inbox_messages;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  UPDATE private.inbox_messages SET
    archived = COALESCE(p_archived, archived),
    read_at = CASE WHEN p_read IS NULL THEN read_at WHEN p_read THEN COALESCE(read_at, NOW()) END
  WHERE id = p_id RETURNING * INTO m;
  IF m.id IS NULL THEN
    RAISE EXCEPTION 'Message not found. It may have been deleted.' USING ERRCODE = 'P0002';
  END IF;
  RETURN private.inbox_summary(m);
END;
$$;

-- Before the Edge Function admin-inbox-reply sends a reply (called as the
-- admin): admin rights, a reply of 1 to 10,000 characters, and the admin's
-- limits (10 a minute, 200 a day). Returns { to (the sender's Reply-To,
-- else From), subject, message_id (for In-Reply-To), admin }.
CREATE FUNCTION public.admin_inbox_reply_prepare(p_id UUID, p_body TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m private.inbox_messages;
  body TEXT := btrim(COALESCE(p_body, ''));
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF body = '' OR char_length(body) > 10000 THEN
    RAISE EXCEPTION 'Write a reply of up to 10,000 characters.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO m FROM private.inbox_messages WHERE id = p_id;
  IF m.id IS NULL THEN
    RAISE EXCEPTION 'Message not found. It may have been deleted.' USING ERRCODE = 'P0002';
  END IF;
  IF btrim(COALESCE(NULLIF(m.reply_to, ''), m.from_address)) = '' THEN
    RAISE EXCEPTION 'This message has no address to reply to.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM private.take_rate('inbox_reply', ARRAY['10', '1 minute', '200', '1 day']);
  RETURN jsonb_build_object('to', COALESCE(NULLIF(m.reply_to, ''), m.from_address),
    'subject', CASE WHEN m.subject ~* '^\s*re:' THEN m.subject
                    ELSE 'Re: ' || COALESCE(NULLIF(btrim(m.subject), ''), 'your message') END,
    'message_id', m.message_id, 'admin', (SELECT auth.uid()));
END;
$$;

-- After the Edge Function sent a reply (service role only): records it and
-- marks the message replied (and read). p_admin must be an admin.
CREATE FUNCTION public.inbox_record_reply(p_message UUID, p_admin UUID, p_body TEXT, p_resend_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r private.inbox_replies;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = p_admin) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  INSERT INTO private.inbox_replies (message_id, admin_id, body, resend_id)
  VALUES (p_message, p_admin, LEFT(btrim(COALESCE(p_body, '')), 10000), LEFT(COALESCE(p_resend_id, ''), 200))
  RETURNING * INTO r;
  UPDATE private.inbox_messages SET replied_at = r.sent_at, read_at = COALESCE(read_at, r.sent_at) WHERE id = p_message;
  RETURN jsonb_build_object('id', r.id, 'body', r.body, 'sent_at', r.sent_at,
    'by', COALESCE((SELECT NULLIF(p.name, '') FROM public.profiles p WHERE p.id = p_admin), 'NRIClub Team'));
END;
$$;

-- ============================================================================
-- CLEAN-UP
-- ============================================================================

-- As on 2026-10-24, plus: Inbox messages (with our replies) 12 months after
-- they arrived, and the log of decision emails after 30 days. The periods
-- are the Privacy Policy's (RETENTION in src/content/legal/privacy.js).
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

  -- The counters behind the limits and the name changes.
  DELETE FROM private.rate_log r WHERE r.at < NOW() - INTERVAL '1 day';
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
    || jsonb_build_object('inbox_messages', inbox);
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Helpers run as the database (inside the functions above).
REVOKE ALL ON FUNCTION private.is_unfinished_signup(UUID), private.whats_on_categories(),
  private.whats_on_json(public.whats_on_events), private.inbox_summary(private.inbox_messages) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_unfinished_signup(UUID), private.whats_on_json(public.whats_on_events),
  private.inbox_summary(private.inbox_messages) TO service_role;
-- The table's CHECK uses it, so whoever writes a row needs it (only the
-- functions above do).
GRANT EXECUTE ON FUNCTION private.whats_on_categories() TO anon, authenticated, service_role;

-- Admin functions check private.is_admin() themselves; members get "Admins only".
REVOKE ALL ON FUNCTION public.admin_member_email(UUID, TEXT), public.admin_resend_quota(), public.admin_check_signup_delete(UUID),
  public.admin_whats_on_events(), public.admin_save_whats_on_event(JSONB, BOOLEAN),
  public.admin_hide_whats_on_event(TEXT, BOOLEAN), public.admin_delete_whats_on_event(TEXT),
  public.admin_inbox_list(TEXT, INTEGER, INTEGER, TEXT), public.admin_inbox_get(UUID),
  public.admin_inbox_set(UUID, BOOLEAN, BOOLEAN), public.admin_inbox_reply_prepare(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_member_email(UUID, TEXT), public.admin_resend_quota(), public.admin_check_signup_delete(UUID),
  public.admin_whats_on_events(), public.admin_save_whats_on_event(JSONB, BOOLEAN),
  public.admin_hide_whats_on_event(TEXT, BOOLEAN), public.admin_delete_whats_on_event(TEXT),
  public.admin_inbox_list(TEXT, INTEGER, INTEGER, TEXT), public.admin_inbox_get(UUID),
  public.admin_inbox_set(UUID, BOOLEAN, BOOLEAN), public.admin_inbox_reply_prepare(UUID, TEXT) TO authenticated;
-- Only the Edge Functions, with the service role, record a deletion, store
-- a received email and record a reply.
REVOKE ALL ON FUNCTION public.admin_record_signup_delete(UUID, UUID, BOOLEAN), public.inbox_store(JSONB),
  public.inbox_record_reply(UUID, UUID, TEXT, TEXT), public.resend_quota_store(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_signup_delete(UUID, UUID, BOOLEAN), public.inbox_store(JSONB),
  public.inbox_record_reply(UUID, UUID, TEXT, TEXT), public.resend_quota_store(INTEGER, INTEGER) TO service_role;
