-- ============================================================================
-- NRIclub: applications to be a city ambassador (2026-10-24)
--
--   * Anyone, signed in or not, can apply to be a city ambassador on the
--     site (the landing page, the city pages and the app) instead of by
--     email: public.submit_ambassador_application. The application is kept
--     in private.ambassador_applications with a short reference code
--     ("A-7F3A92C1"). A member who is signed in applies with their account's
--     name and email address, and the application is linked to the account.
--     One open application (new or contacted) per member and per email
--     address. At most 3 a day from one email address and 10 a day from one
--     internet address (kept only as a coded form, for a day), and 50 a day
--     in all; a visitor told that an address has already applied uses up
--     one of these too, so the form can't be used to test address after
--     address. Every admin gets an in-app notice ('alert', as for reports
--     from the public report page) with the city and the reference only.
--   * The admin panel (Ambassadors) lists the applications, newest first,
--     by status and a page at a time (public.admin_ambassador_applications),
--     and marks them contacted, accepted or declined, with a note
--     (public.admin_update_ambassador_application). Accepting the
--     application of an active, approved member makes them the city's
--     ambassador through public.admin_set_ambassador, so it is recorded in
--     private.moderation_action like any other change of ambassador.
--     Accepting one without an account (or from a member who isn't approved
--     yet) only marks it accepted: our team asks them to join, and makes
--     them ambassador under Members once they are approved. NRIClub sends no
--     emails from the app: our team replies from hello@nriclub.app.
--   * Clean-up (private.daily_cleanup): applications are deleted 6 months
--     after our decision (accepted or declined), undecided ones 12 months
--     after they were sent, the counters behind the daily limits after a
--     day. "Download my data" (public.export_my_data) has the member's own
--     applications (not our team's notes). Both functions are the
--     2026-10-21 versions with only these additions.
-- Needs all earlier migrations (up to 20261023000000_admin_access.sql). Runs
-- as one transaction (it can be run as it is in the SQL editor); it refuses
-- to run before compliance round 2, and a second time.
-- Existing rows: none change.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('private.moderation_action') IS NULL OR to_regclass('private.app_settings') IS NULL
     OR to_regprocedure('public.admin_set_ambassador(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'Run the compliance round 2 update (20261021000000 to 20261023000000) first.';
  END IF;
  IF to_regclass('private.ambassador_applications') IS NOT NULL THEN
    RAISE EXCEPTION 'This update has already run. Nothing to do.';
  END IF;
END;
$$;

-- ============================================================================
-- THE APPLICATIONS
-- ============================================================================

-- How much time an applicant can give, in a week (the form's choices, in
-- step with AMBASSADOR_HOURS in src/content/ambassadors.js).
CREATE FUNCTION private.ambassador_hours()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY['under_1', '1_2', '3_5', 'over_5']::TEXT[];
$$;

-- One application. reference: the code the applicant sees and quotes.
-- member_id: the account it was sent from (members who were signed in);
-- removed when the account is deleted (the application stays until the
-- clean-up deletes it). name and email: the account's for members, as typed
-- otherwise. city, country: where they'd be ambassador. organisation: their
-- university or employer (optional). linkedin_url: optional, in the form
-- https://www.linkedin.com/in/<name>. motivation: why they'd like to do it.
-- hours_per_week: one of private.ambassador_hours(). status: 'new' until our
-- team has written to them ('contacted'), then 'accepted' or 'declined'
-- (decided_by, decided_at). admin_note: our team's note (admins only).
CREATE TABLE private.ambassador_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE CHECK (reference ~ '^A-[0-9A-F]{8}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  member_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  email TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  city TEXT NOT NULL CHECK (char_length(city) BETWEEN 1 AND 60),
  country TEXT NOT NULL CHECK (char_length(country) BETWEEN 2 AND 60),
  organisation TEXT NOT NULL DEFAULT '' CHECK (char_length(organisation) <= 200),
  linkedin_url TEXT NOT NULL DEFAULT '' CHECK (char_length(linkedin_url) <= 200),
  motivation TEXT NOT NULL CHECK (char_length(motivation) BETWEEN 20 AND 1000),
  hours_per_week TEXT NOT NULL CHECK (hours_per_week = ANY (private.ambassador_hours())),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'accepted', 'declined')),
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  admin_note TEXT NOT NULL DEFAULT '' CHECK (char_length(admin_note) <= 2000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ambassador_applications_decided CHECK ((status IN ('accepted', 'declined')) = (decided_at IS NOT NULL))
);
CREATE INDEX idx_ambassador_applications_created ON private.ambassador_applications (created_at DESC);
CREATE INDEX idx_ambassador_applications_status ON private.ambassador_applications (status, created_at DESC);
CREATE INDEX idx_ambassador_applications_member ON private.ambassador_applications (member_id);
-- One open application per member, and per email address (in its standard
-- form: Gmail without dots, without +tags).
CREATE UNIQUE INDEX ambassador_applications_one_open_member ON private.ambassador_applications (member_id)
  WHERE status IN ('new', 'contacted') AND member_id IS NOT NULL;
CREATE UNIQUE INDEX ambassador_applications_one_open_email ON private.ambassador_applications (private.canonical_email(email))
  WHERE status IN ('new', 'contacted');
ALTER TABLE private.ambassador_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ambassador_applications FROM PUBLIC, anon, authenticated;

-- Applications sent per email address and per internet address, for the
-- daily limits: a keyed hash only (never the address), deleted after a day.
CREATE TABLE private.ambassador_application_log (
  key TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ambassador_application_log ON private.ambassador_application_log (key, at);
ALTER TABLE private.ambassador_application_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.ambassador_application_log FROM PUBLIC, anon, authenticated;

-- An application as the admin panel shows it: the application, who on our
-- team decided it, and the account it came from (member: name, status,
-- verification status and ambassador city now). For one without an account,
-- email_member: an account that uses the same email address (e.g. the
-- applicant joined after applying), as a hint for our team; it isn't linked,
-- since anyone can type any address into the form.
CREATE FUNCTION private.ambassador_application_json(a private.ambassador_applications)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', a.id, 'reference', a.reference, 'created_at', a.created_at, 'name', a.name, 'email', a.email,
    'city', a.city, 'country', a.country, 'organisation', a.organisation, 'linkedin_url', a.linkedin_url,
    'motivation', a.motivation, 'hours_per_week', a.hours_per_week, 'status', a.status,
    'decided_at', a.decided_at, 'decided_by_name', (SELECT p.name FROM public.profiles p WHERE p.id = a.decided_by),
    'admin_note', a.admin_note, 'updated_at', a.updated_at,
    'member', (SELECT jsonb_build_object('id', p.id, 'name', p.name, 'status', pp.status,
                 'verification_status', pp.verification_status, 'ambassador_city', p.ambassador_city)
               FROM public.profiles p JOIN public.profile_private pp ON pp.id = p.id WHERE p.id = a.member_id),
    'email_member', CASE WHEN a.member_id IS NULL THEN (
      SELECT jsonb_build_object('id', p.id, 'name', p.name, 'status', pp.status,
               'verification_status', pp.verification_status, 'ambassador_city', p.ambassador_city)
      FROM public.profile_private pp JOIN public.profiles p ON p.id = pp.id
      WHERE lower(pp.email) = a.email
      ORDER BY (pp.status = 'active' AND pp.verification_status = 'approved') DESC, pp.created_at
      LIMIT 1) END);
$$;

-- ============================================================================
-- APPLYING (anyone, on the site)
-- ============================================================================

-- An application from the form. Returns its reference code (e.g.
-- "A-7F3A92C1"), or NULL when a visitor (not signed in) sends one from an
-- email address that already has an open application: nothing is saved,
-- and the form says the application is already waiting. (Raising an error
-- would undo the count, so the answer could be used, free, to test whether
-- an address has applied; this way it counts towards the limits below.)
-- Signed in, the account's name and email address are used (p_name and
-- p_email only if the account has none) and the application is linked to
-- the account. The sender's internet address and the limits work as for
-- public.submit_notice (2026-10-21): the address Cloudflare passes on
-- (CF-Connecting-IP), else the first one in X-Forwarded-For; an IPv6 address
-- counts by its /64 network; since those headers can't be fully trusted, at
-- most 50 applications a day are taken in all, after which the form points
-- to email. Curly apostrophes (as phones type them: "St. John’s") count as
-- straight ones in the city; the country may have one ("Côte d’Ivoire", as
-- the form's list names it).
CREATE FUNCTION public.submit_ambassador_application(p_name TEXT, p_email TEXT, p_city TEXT, p_country TEXT,
  p_organisation TEXT DEFAULT '', p_linkedin_url TEXT DEFAULT '', p_motivation TEXT DEFAULT '',
  p_hours_per_week TEXT DEFAULT '')
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  v_name TEXT := private.clean_name(LEFT(COALESCE(p_name, ''), 1000));
  v_email TEXT := lower(btrim(LEFT(COALESCE(p_email, ''), 1000)));
  v_city TEXT := btrim(regexp_replace(translate(LEFT(COALESCE(p_city, ''), 1000), '‘’', ''''''), '\s+', ' ', 'g'));
  v_country TEXT := btrim(regexp_replace(LEFT(COALESCE(p_country, ''), 1000), '\s+', ' ', 'g'));
  v_organisation TEXT := btrim(regexp_replace(LEFT(COALESCE(p_organisation, ''), 1000), '\s+', ' ', 'g'));
  v_linkedin TEXT := btrim(LEFT(COALESCE(p_linkedin_url, ''), 1000));
  v_motivation TEXT := btrim(LEFT(COALESCE(p_motivation, ''), 5000));
  account_name TEXT;
  account_email TEXT;
  headers JSON := NULLIF(current_setting('request.headers', TRUE), '')::json;
  v_ip TEXT := LEFT(btrim(COALESCE(NULLIF(headers ->> 'cf-connecting-ip', ''),
    split_part(COALESCE(headers ->> 'x-forwarded-for', ''), ',', 1))), 100);
  v_net INET;
  email_key TEXT;
  ip_key TEXT;
  open_ref TEXT;
  v_ref TEXT;
  v_id UUID;
BEGIN
  -- A member who is signed in applies as themselves.
  IF uid IS NOT NULL THEN
    IF private.is_blocked_me() THEN
      RAISE EXCEPTION 'Your account is blocked, so you can''t apply. If you think that''s a mistake, write to hello@nriclub.app.'
        USING ERRCODE = 'P0001';
    END IF;
    SELECT p.name, lower(btrim(COALESCE(pp.email, ''))) INTO account_name, account_email
    FROM public.profiles p JOIN public.profile_private pp ON pp.id = p.id WHERE p.id = uid;
    IF NOT FOUND THEN
      uid := NULL; -- no profile (e.g. a session of a deleted account): as a visitor
    ELSE
      v_name := COALESCE(NULLIF(private.clean_name(account_name), ''), v_name);
      v_email := COALESCE(NULLIF(account_email, ''), v_email);
    END IF;
  END IF;

  IF v_name = '' OR char_length(v_name) > 200 THEN
    RAISE EXCEPTION 'Please give your name (up to 200 characters).' USING ERRCODE = 'P0001';
  END IF;
  -- (No characters that mean something in a mailto: link, such as ? & # %,
  -- in the address our team replies to.)
  IF char_length(v_email) > 254
     OR v_email !~ '^[^@[:space:]?&#%,;:<>()"\\/]+@[^@[:space:]?&#%,;:<>()"\\/]+\.[^@[:space:]?&#%,;:<>()"\\/]+$' THEN
    RAISE EXCEPTION 'Please check your email address: our team will write to you there.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT private.is_city_name(v_city) THEN
    RAISE EXCEPTION 'Please give the name of your city (letters only, up to 60 characters).' USING ERRCODE = 'P0001';
  END IF;
  IF v_country !~ '^[[:alpha:]À-ɏḀ-ỿ .,''’()&-]{2,60}$' THEN
    RAISE EXCEPTION 'Please choose your country.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_organisation) > 200 THEN
    RAISE EXCEPTION 'Please keep your university or employer to 200 characters.' USING ERRCODE = 'P0001';
  END IF;
  IF v_linkedin <> '' THEN
    v_linkedin := private.normalize_linkedin(v_linkedin);
    IF v_linkedin IS NULL THEN
      RAISE EXCEPTION 'That doesn''t look like a LinkedIn profile link (linkedin.com/in/your-name). You can also leave it empty.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF char_length(v_motivation) < 20 THEN
    RAISE EXCEPTION 'Please tell us in a sentence or two why you''d like to be an ambassador (at least 20 characters).'
      USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_motivation) > 1000 THEN
    RAISE EXCEPTION 'Please keep it to 1,000 characters.' USING ERRCODE = 'P0001';
  END IF;
  IF p_hours_per_week IS NULL OR NOT (p_hours_per_week = ANY (private.ambassador_hours())) THEN
    RAISE EXCEPTION 'Please choose how much time you can give.' USING ERRCODE = 'P0001';
  END IF;

  -- The limits: 3 a day from one email address, 10 a day from one internet
  -- address (an IPv6 one by its /64), 50 a day in all. Two applications sent
  -- at the same moment are counted one by one (and the second one from the
  -- same member or address finds the first).
  email_key := private.limit_key('ambassador-email', private.canonical_email(v_email));
  IF v_ip <> '' THEN
    BEGIN
      v_net := v_ip::inet;
      v_ip := CASE WHEN family(v_net) = 6 THEN network(set_masklen(v_net, 64))::TEXT ELSE host(v_net) END;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL; -- not an address: counted as it is
    END;
    ip_key := private.limit_key('ambassador-ip', v_ip);
  END IF;
  IF uid IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('nriclub-ambassador:' || uid::text));
  END IF;
  IF email_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('nriclub-ambassador:' || email_key));
  END IF;
  IF ip_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('nriclub-ambassador:' || ip_key));
  END IF;
  IF (email_key IS NOT NULL AND (SELECT count(*) FROM private.ambassador_application_log l
                                 WHERE l.key = email_key AND l.at > NOW() - INTERVAL '1 day') >= 3)
     OR (ip_key IS NOT NULL AND (SELECT count(*) FROM private.ambassador_application_log l
                                 WHERE l.key = ip_key AND l.at > NOW() - INTERVAL '1 day') >= 10) THEN
    RAISE EXCEPTION 'You''ve sent several applications today. Please try again tomorrow, or write to hello@nriclub.app.'
      USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM private.ambassador_applications a WHERE a.created_at > NOW() - INTERVAL '1 day') >= 50 THEN
    RAISE EXCEPTION 'We''ve received a lot of applications today. Please write to hello@nriclub.app instead, and a person on our team will answer.'
      USING ERRCODE = 'P0001';
  END IF;

  -- One open application per member and per email address.
  IF uid IS NOT NULL THEN
    SELECT a.reference INTO open_ref FROM private.ambassador_applications a
    WHERE a.member_id = uid AND a.status IN ('new', 'contacted');
    IF open_ref IS NOT NULL THEN
      RAISE EXCEPTION 'You''ve already applied (reference %). Our team will write to you by email.', open_ref
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM private.ambassador_applications a
             WHERE private.canonical_email(a.email) = private.canonical_email(v_email)
               AND a.status IN ('new', 'contacted')) THEN
    IF uid IS NOT NULL THEN
      -- (The account's own address.)
      RAISE EXCEPTION 'An application from this email address is already waiting for our team. We''ll write to you soon; if something has changed, write to hello@nriclub.app.'
        USING ERRCODE = 'P0001';
    END IF;
    -- A visitor: the answer uses up one of the day's applications from this
    -- email and internet address, like an application.
    INSERT INTO private.ambassador_application_log (key)
    SELECT k FROM unnest(ARRAY[email_key, ip_key]) k WHERE k IS NOT NULL;
    RETURN NULL;
  END IF;

  LOOP
    v_ref := 'A-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM private.ambassador_applications a WHERE a.reference = v_ref);
  END LOOP;
  INSERT INTO private.ambassador_applications (reference, member_id, name, email, city, country, organisation,
    linkedin_url, motivation, hours_per_week)
  VALUES (v_ref, uid, v_name, v_email, v_city, v_country, v_organisation, v_linkedin, v_motivation, p_hours_per_week)
  RETURNING id INTO v_id;
  INSERT INTO private.ambassador_application_log (key)
  SELECT k FROM unnest(ARRAY[email_key, ip_key]) k WHERE k IS NOT NULL;
  -- (Without the applicant's name: the notice outlives the application.)
  PERFORM private.alert_admins('New application to be the ambassador for ' || v_city || ' (' || v_ref
    || '). Please look at it in the admin panel (Ambassadors) and write to the applicant.', v_id);
  RETURN v_ref;
END;
$$;

-- ============================================================================
-- IN THE ADMIN PANEL
-- ============================================================================

-- The applications, newest first: all (p_status NULL), one status, or
-- 'open' (new and contacted); a page of p_limit (1 to 200) from p_offset.
-- Returns { total: how many match, counts: { new, contacted, accepted,
-- declined }, applications: [private.ambassador_application_json] }.
CREATE FUNCTION public.admin_ambassador_applications(p_status TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  off INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  wanted TEXT[];
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  wanted := CASE
    WHEN p_status IS NULL OR p_status = '' THEN ARRAY['new', 'contacted', 'accepted', 'declined']
    WHEN p_status = 'open' THEN ARRAY['new', 'contacted']
    WHEN p_status IN ('new', 'contacted', 'accepted', 'declined') THEN ARRAY[p_status] END;
  IF wanted IS NULL THEN
    RAISE EXCEPTION 'Unknown status: %', p_status USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM private.ambassador_applications a WHERE a.status = ANY (wanted)),
    'counts', (SELECT jsonb_build_object(
        'new', count(*) FILTER (WHERE a.status = 'new'), 'contacted', count(*) FILTER (WHERE a.status = 'contacted'),
        'accepted', count(*) FILTER (WHERE a.status = 'accepted'), 'declined', count(*) FILTER (WHERE a.status = 'declined'))
      FROM private.ambassador_applications a),
    'applications', COALESCE((SELECT jsonb_agg(private.ambassador_application_json(x) ORDER BY x.created_at DESC, x.id)
      FROM private.ambassador_applications x
      WHERE x.id IN (SELECT a.id FROM private.ambassador_applications a WHERE a.status = ANY (wanted)
                     ORDER BY a.created_at DESC, a.id LIMIT lim OFFSET off)), '[]'::jsonb));
END;
$$;

-- Our team's step on an application: p_status 'contacted' (we wrote to
-- them), 'accepted', 'declined', or 'new' / 'contacted' again to reopen a
-- decided one; p_note (not NULL) replaces our team's note. Accepting the
-- application of an active, approved member makes them the ambassador for
-- p_city (the application's city unless given) with
-- public.admin_set_ambassador, which records it. Returns the application
-- (as in admin_ambassador_applications) with outcome: 'ambassador_set',
-- 'already_ambassador' (they already were, for that city), 'no_account' (an
-- application without an account: ask them to join), 'not_approved' (the
-- member isn't approved, or is blocked: make them ambassador under Members
-- once they are), or null for any other step.
CREATE FUNCTION public.admin_update_ambassador_application(p_application UUID, p_status TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL, p_city TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a private.ambassador_applications;
  v_note TEXT := btrim(COALESCE(p_note, ''));
  v_city TEXT;
  outcome TEXT;
  m RECORD;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM private.ambassador_applications x WHERE x.id = p_application FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found. It may have been deleted (after 6 or 12 months).' USING ERRCODE = 'P0002';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('new', 'contacted', 'accepted', 'declined') THEN
    RAISE EXCEPTION 'Unknown status: %', p_status USING ERRCODE = 'P0001';
  END IF;
  IF p_note IS NOT NULL AND char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'Please keep the note to 2,000 characters.' USING ERRCODE = 'P0001';
  END IF;

  IF p_note IS NOT NULL THEN
    UPDATE private.ambassador_applications SET admin_note = v_note, updated_at = NOW() WHERE id = a.id;
  END IF;

  IF p_status IS NOT NULL AND p_status <> a.status THEN
    BEGIN
      UPDATE private.ambassador_applications
      SET status = p_status, updated_at = NOW(),
          decided_by = CASE WHEN p_status IN ('accepted', 'declined') THEN (SELECT auth.uid()) END,
          decided_at = CASE WHEN p_status IN ('accepted', 'declined') THEN NOW() END
      WHERE id = a.id;
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'This person has another open application. Decide on that one, or decline it first.'
        USING ERRCODE = 'P0001';
    END;
  END IF;

  IF p_status = 'accepted' THEN
    v_city := btrim(regexp_replace(COALESCE(NULLIF(btrim(COALESCE(p_city, '')), ''), a.city), '\s+', ' ', 'g'));
    IF char_length(v_city) > 100 THEN
      RAISE EXCEPTION 'Please keep the city to 100 characters.' USING ERRCODE = 'P0001';
    END IF;
    SELECT p.id, p.ambassador_city, pp.status, pp.verification_status INTO m
    FROM public.profiles p JOIN public.profile_private pp ON pp.id = p.id
    WHERE p.id = a.member_id FOR UPDATE OF p;
    IF a.member_id IS NULL OR m.id IS NULL THEN
      outcome := 'no_account';
    ELSIF m.status <> 'active' OR m.verification_status <> 'approved' THEN
      outcome := 'not_approved';
    ELSIF lower(m.ambassador_city) = lower(v_city) THEN
      outcome := 'already_ambassador';
    ELSE
      PERFORM public.admin_set_ambassador(a.member_id, v_city);
      outcome := 'ambassador_set';
    END IF;
  END IF;

  RETURN (SELECT private.ambassador_application_json(x) || jsonb_build_object('outcome', outcome)
          FROM private.ambassador_applications x WHERE x.id = a.id);
END;
$$;

-- ============================================================================
-- CLEAN-UP (C20) AND "DOWNLOAD MY DATA" (C21)
-- ============================================================================

-- As in 2026-10-21, plus: applications to be an ambassador 6 months after
-- our decision (accepted or declined), undecided ones (new or contacted) 12
-- months after they were sent; the counters behind their daily limits after
-- a day. The periods are the Privacy Policy's (RETENTION in
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

  -- The counters behind the limits and the name changes.
  DELETE FROM private.rate_log r WHERE r.at < NOW() - INTERVAL '1 day';
  DELETE FROM private.name_changes c WHERE c.changed_at < NOW() - INTERVAL '30 days';
  DELETE FROM private.notice_log l WHERE l.at < NOW() - INTERVAL '1 day';
  DELETE FROM private.ambassador_application_log l WHERE l.at < NOW() - INTERVAL '1 day';

  RETURN jsonb_build_object(
    'unconfirmed_signups', unconfirmed, 'unfinished_accounts', unfinished, 'declined_accounts', declined,
    'read_notifications', notices, 'closed_reports', closed_reports, 'closed_notices', closed_notices,
    'moderation_records', records, 'moderation_notes_cleared', notes,
    'moderation_copies_cleared', copies, 'moderation_actions', actions)
    || jsonb_build_object(
    'decided_ambassador_applications', decided_applications,
    'undecided_ambassador_applications', undecided_applications);
END;
$$;

-- "Download my data": as in 2026-10-21, plus the applications to be an
-- ambassador the member sent while signed in (without our team's note and
-- who on our team decided).
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
    'rate_limit_log', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', r.action, 'at', r.at) ORDER BY r.at)
      FROM private.rate_log r WHERE r.member_id = uid), '[]'::jsonb)
  );
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Helpers run as the database (inside the functions below, which are the
-- only ones that write applications).
REVOKE ALL ON FUNCTION private.ambassador_hours(),
  private.ambassador_application_json(private.ambassador_applications) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.ambassador_hours(),
  private.ambassador_application_json(private.ambassador_applications) TO service_role;

-- The form works signed out too.
REVOKE ALL ON FUNCTION public.submit_ambassador_application(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_ambassador_application(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated;
-- Admin functions check private.is_admin() themselves; members get "Admins only".
REVOKE ALL ON FUNCTION public.admin_ambassador_applications(TEXT, INTEGER, INTEGER),
  public.admin_update_ambassador_application(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ambassador_applications(TEXT, INTEGER, INTEGER),
  public.admin_update_ambassador_application(UUID, TEXT, TEXT, TEXT) TO authenticated;
