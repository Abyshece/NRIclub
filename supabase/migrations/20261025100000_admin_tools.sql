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
-- actor_id: the admin. Kept 30 days (admin_member_email deletes older ones),
-- and deleted with the member's account. Only the database reads it.
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
-- PERMISSIONS
-- ============================================================================

-- Helpers run as the database (inside the functions above).
REVOKE ALL ON FUNCTION private.is_unfinished_signup(UUID), private.whats_on_categories(),
  private.whats_on_json(public.whats_on_events) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_unfinished_signup(UUID), private.whats_on_json(public.whats_on_events)
  TO service_role;
-- The table's CHECK uses it, so whoever writes a row needs it (only the
-- functions above do).
GRANT EXECUTE ON FUNCTION private.whats_on_categories() TO anon, authenticated, service_role;

-- Admin functions check private.is_admin() themselves; members get "Admins only".
REVOKE ALL ON FUNCTION public.admin_member_email(UUID, TEXT), public.admin_check_signup_delete(UUID),
  public.admin_whats_on_events(), public.admin_save_whats_on_event(JSONB, BOOLEAN),
  public.admin_hide_whats_on_event(TEXT, BOOLEAN), public.admin_delete_whats_on_event(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_member_email(UUID, TEXT), public.admin_check_signup_delete(UUID),
  public.admin_whats_on_events(), public.admin_save_whats_on_event(JSONB, BOOLEAN),
  public.admin_hide_whats_on_event(TEXT, BOOLEAN), public.admin_delete_whats_on_event(TEXT) TO authenticated;
-- Only the Edge Function, with the service role, records a deletion.
REVOKE ALL ON FUNCTION public.admin_record_signup_delete(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_signup_delete(UUID, UUID, BOOLEAN) TO service_role;
