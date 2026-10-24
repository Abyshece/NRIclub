-- ============================================================================
-- NRIclub: website analytics, only with the visitor's consent (2026-10-29)
--
--   * Visitors who choose "Accept" on the privacy banner (src/ConsentBanner.jsx)
--     send which pages they open, which buttons and links they click, the
--     steps of signing up and logging in, and the last page of each visit,
--     with a random visitor id and a visit (session) id made in their
--     browser. Nothing before they accept, nothing after they withdraw.
--   * The site's Edge Function /api/collect (api/collect.js) checks each
--     request, adds the shortened IP address (IPv4 without its last part,
--     IPv6 with its first 48 bits only) and the approximate place Vercel
--     looks up (country, region, city), and stores it with
--     public.analytics_ingest (service role only) in private.analytics_events.
--     Device: only mobile/tablet/desktop and the browser and system family.
--   * Pseudonymous: the events are never linked to a member's account (no
--     member id, no email address). Only the database reads the tables.
--   * The banner's Accept and Decline are counted per day, without anything
--     about who chose (public.analytics_consent_count, for anyone, with a
--     ceiling per day), so the admin panel can show the share who accept.
--   * The admin panel's Analytics page reads it with public.admin_analytics
--     (the numbers for 1 to 183 days), public.admin_analytics_sessions (recent
--     visits, a page at a time) and public.admin_analytics_journey (one
--     visit's pages and clicks, in order). Admins only (private.is_admin).
--   * Kept 6 months: private.analytics_cleanup() deletes older events, every
--     night at 03:41 UTC with its own pg_cron job (nriclub-analytics-cleanup;
--     private.daily_cleanup is not changed). The daily counts of Accept and
--     Decline hold nothing about anyone and are kept.
-- Needs the earlier migrations (up to 20261026000000_travel_board.sql); it
-- doesn't depend on 20261027000000 or 20261028000000.
-- Can be run again: it replaces what it made the first time and keeps the
-- data. Existing rows: none change.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('private.is_admin()') IS NULL OR to_regclass('public.travel_posts') IS NULL THEN
    RAISE EXCEPTION 'Run the earlier updates (up to 20261026000000_travel_board.sql) first.';
  END IF;
END;
$$;

-- ============================================================================
-- TABLES
-- ============================================================================

-- One row per event. at: when it happened (the browser's time, within the
-- hour before it arrived; else when it arrived). type: 'pageview',
-- 'click', 'funnel' (label is the step, private.analytics_funnel_steps) or
-- 'session_end' (path is the visit's last page). path: the page, with
-- member, post and other ids replaced by ":id". label: a button's or link's
-- visible text, cut to 80 characters (in the members' area only the site's
-- own names for buttons). target: where a link goes (a path on this site or
-- another site's domain). referrer_domain and utm_*: where a visit came
-- from (the first page of a visit). The rest describes the visit.
CREATE TABLE IF NOT EXISTS private.analytics_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visitor_id UUID NOT NULL,
  session_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pageview', 'click', 'funnel', 'session_end')),
  path TEXT NOT NULL DEFAULT '' CHECK (length(path) <= 200),
  title TEXT NOT NULL DEFAULT '' CHECK (length(title) <= 120),
  label TEXT NOT NULL DEFAULT '' CHECK (length(label) <= 80),
  target TEXT NOT NULL DEFAULT '' CHECK (length(target) <= 200),
  referrer_domain TEXT NOT NULL DEFAULT '' CHECK (length(referrer_domain) <= 100),
  utm_source TEXT NOT NULL DEFAULT '' CHECK (length(utm_source) <= 100),
  utm_medium TEXT NOT NULL DEFAULT '' CHECK (length(utm_medium) <= 100),
  utm_campaign TEXT NOT NULL DEFAULT '' CHECK (length(utm_campaign) <= 100),
  utm_content TEXT NOT NULL DEFAULT '' CHECK (length(utm_content) <= 100),
  country TEXT NOT NULL DEFAULT '' CHECK (country ~ '^([A-Z]{2})?$'),
  region TEXT NOT NULL DEFAULT '' CHECK (length(region) <= 10),
  city TEXT NOT NULL DEFAULT '' CHECK (length(city) <= 100),
  ip_truncated TEXT NOT NULL DEFAULT '' CHECK (length(ip_truncated) <= 45),
  device TEXT NOT NULL DEFAULT '' CHECK (device IN ('', 'mobile', 'tablet', 'desktop')),
  browser TEXT NOT NULL DEFAULT '' CHECK (length(browser) <= 30),
  os TEXT NOT NULL DEFAULT '' CHECK (length(os) <= 30)
);
-- The date range (and the clean-up), one visit's events in order, and the
-- page views, clicks and steps of a date range.
CREATE INDEX IF NOT EXISTS idx_analytics_events_at ON private.analytics_events (at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON private.analytics_events (session_id, at, id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_at ON private.analytics_events (type, at);
ALTER TABLE private.analytics_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.analytics_events FROM PUBLIC, anon, authenticated;

-- How many chose Accept and Decline on the banner each day (in Germany).
CREATE TABLE IF NOT EXISTS private.analytics_consent_counts (
  day DATE PRIMARY KEY,
  accepted INTEGER NOT NULL DEFAULT 0 CHECK (accepted >= 0),
  declined INTEGER NOT NULL DEFAULT 0 CHECK (declined >= 0)
);
ALTER TABLE private.analytics_consent_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.analytics_consent_counts FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- STORING
-- ============================================================================

-- The steps of signing up, in order, then of logging in (SIGNUP_STEPS and
-- LOGIN_STEPS in src/content/analytics.js: keep them the same).
CREATE OR REPLACE FUNCTION private.analytics_funnel_steps()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY['signup_open', 'signup_email', 'signup_code_sent', 'signup_code_ok', 'signup_password',
    'details_open', 'details_sent', 'login_start', 'login_ok']::TEXT[];
$$;

-- Stores what /api/collect received (service role only). p_events: up to 50
-- of { type, at (milliseconds since 1970), path, title, label, target,
-- referrer_domain, utm_source, utm_medium, utm_campaign, utm_content };
-- p_meta: { visitor_id, session_id, device, browser, os, country, region,
-- city, ip_truncated }. The function has checked them already; this checks
-- again: events of an unknown type or step are left out, texts are cut to
-- their length, and a visit stores at most 2,000 events. Returns how many
-- were stored.
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
    referrer_domain, utm_source, utm_medium, utm_campaign, utm_content, country, region, city, ip_truncated,
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
    v_region, LEFT(COALESCE(m ->> 'city', ''), 100), LEFT(COALESCE(m ->> 'ip_truncated', ''), 45),
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

-- Counts one choice on the banner: p_choice 'accepted' or 'declined'. Anyone
-- may call it (signed in or not); it stores nothing about who called. At most
-- 50,000 choices a day are counted (a ceiling against floods; true counts
-- are far lower). Returns whether it counted.
CREATE OR REPLACE FUNCTION public.analytics_consent_count(p_choice TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  d DATE := (NOW() AT TIME ZONE 'Europe/Berlin')::DATE;
BEGIN
  IF p_choice IS NULL OR p_choice NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'The choice must be accepted or declined.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO private.analytics_consent_counts (day) VALUES (d) ON CONFLICT (day) DO NOTHING;
  UPDATE private.analytics_consent_counts c
  SET accepted = c.accepted + (p_choice = 'accepted')::INTEGER, declined = c.declined + (p_choice = 'declined')::INTEGER
  WHERE c.day = d AND c.accepted + c.declined < 50000;
  RETURN FOUND;
END;
$$;

-- ============================================================================
-- THE ADMIN PANEL'S ANALYTICS PAGE
-- ============================================================================

-- The first moment of the date range: the last p_days days in Germany,
-- today included (1 to 183).
CREATE OR REPLACE FUNCTION private.analytics_since(p_days INTEGER)
RETURNS TIMESTAMPTZ LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (((NOW() AT TIME ZONE 'Europe/Berlin')::DATE - (LEAST(GREATEST(COALESCE(p_days, 30), 1), 183) - 1))::TIMESTAMP)
    AT TIME ZONE 'Europe/Berlin';
$$;

-- Everything the Analytics page shows for the last p_days days (in Germany,
-- today included; 1 to 183, usually 7, 30 or 90):
--   overview: visitors, sessions, pageviews, pages_per_session, accepted and
--     declined (the banner, those days), signups_started (visitors who
--     opened sign-up) and details_sent (who sent their check details)
--   per_day: [{ day, visitors, sessions, pageviews }], every day of the range
--   top_pages: [{ path, title, views, visitors }]
--   top_clicks: [{ label, path, target, clicks, visitors }]
--   exit_pages: [{ path, exits, views }]: where visits ended
--   funnel: [{ step, visitors }] in order, sign-up then log-in steps
--   referrers: [{ domain, sessions, visitors }]: the first page's referrer
--   campaigns: [{ source, medium, campaign, content, sessions, visitors }]
--   countries, cities, devices, browsers, systems: [{ name (and country for
--     cities), sessions, visitors }]
-- Lists are the top 25 or fewer.
CREATE OR REPLACE FUNCTION public.admin_analytics(p_days INTEGER DEFAULT 30)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  days INTEGER := LEAST(GREATEST(COALESCE(p_days, 30), 1), 183);
  since TIMESTAMPTZ := private.analytics_since(days);
  first_day DATE := (since AT TIME ZONE 'Europe/Berlin')::DATE;
  result JSONB;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  WITH ev AS MATERIALIZED (
    SELECT e.* FROM private.analytics_events e WHERE e.at >= since
  ),
  -- Each visit: its first page view (where it came from) or, without one,
  -- its first event; and its last event (the page it ended on).
  firsts AS (
    SELECT DISTINCT ON (e.session_id) e.session_id, e.visitor_id, e.referrer_domain, e.utm_source, e.utm_medium,
      e.utm_campaign, e.utm_content, e.country, e.city, e.device, e.browser, e.os
    FROM ev e ORDER BY e.session_id, (e.type <> 'pageview'), e.at, e.id
  ),
  lasts AS (
    SELECT DISTINCT ON (e.session_id) e.session_id, e.path
    FROM ev e WHERE e.type <> 'funnel' ORDER BY e.session_id, e.at DESC, e.id DESC
  ),
  totals AS (
    SELECT count(DISTINCT e.visitor_id) AS visitors, count(DISTINCT e.session_id) AS sessions,
      count(*) FILTER (WHERE e.type = 'pageview') AS pageviews,
      count(DISTINCT e.visitor_id) FILTER (WHERE e.type = 'funnel' AND e.label = 'signup_open') AS signups_started,
      count(DISTINCT e.visitor_id) FILTER (WHERE e.type = 'funnel' AND e.label = 'details_sent') AS details_sent
    FROM ev e
  ),
  consent AS (
    SELECT COALESCE(sum(c.accepted), 0) AS accepted, COALESCE(sum(c.declined), 0) AS declined
    FROM private.analytics_consent_counts c WHERE c.day >= first_day
  )
  SELECT jsonb_build_object(
    'days', days,
    'since', first_day,
    'overview', (
      SELECT jsonb_build_object('visitors', t.visitors, 'sessions', t.sessions, 'pageviews', t.pageviews,
        'pages_per_session', CASE WHEN t.sessions > 0 THEN round(t.pageviews::NUMERIC / t.sessions, 1) ELSE 0 END,
        'accepted', c.accepted, 'declined', c.declined,
        'signups_started', t.signups_started, 'details_sent', t.details_sent)
      FROM totals t, consent c),
    'per_day', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('day', d.day::DATE, 'visitors', COALESCE(x.visitors, 0),
        'sessions', COALESCE(x.sessions, 0), 'pageviews', COALESCE(x.pageviews, 0)) ORDER BY d.day), '[]'::jsonb)
      FROM generate_series(first_day, (NOW() AT TIME ZONE 'Europe/Berlin')::DATE, INTERVAL '1 day') AS d(day)
      LEFT JOIN (
        SELECT (e.at AT TIME ZONE 'Europe/Berlin')::DATE AS day, count(DISTINCT e.visitor_id) AS visitors,
          count(DISTINCT e.session_id) AS sessions, count(*) FILTER (WHERE e.type = 'pageview') AS pageviews
        FROM ev e GROUP BY 1
      ) x ON x.day = d.day::DATE),
    'top_pages', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('path', p.path, 'title', p.title, 'views', p.views,
        'visitors', p.visitors) ORDER BY p.views DESC, p.path), '[]'::jsonb)
      FROM (SELECT e.path, max(e.title) AS title, count(*) AS views, count(DISTINCT e.visitor_id) AS visitors
            FROM ev e WHERE e.type = 'pageview' GROUP BY e.path ORDER BY count(*) DESC, e.path LIMIT 25) p),
    'top_clicks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('label', k.label, 'path', k.path, 'target', k.target,
        'clicks', k.clicks, 'visitors', k.visitors) ORDER BY k.clicks DESC, k.label), '[]'::jsonb)
      FROM (SELECT e.label, e.path, e.target, count(*) AS clicks, count(DISTINCT e.visitor_id) AS visitors
            FROM ev e WHERE e.type = 'click' GROUP BY e.label, e.path, e.target
            ORDER BY count(*) DESC, e.label LIMIT 25) k),
    'exit_pages', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('path', x.path, 'exits', x.exits,
        'views', (SELECT count(*) FROM ev e WHERE e.type = 'pageview' AND e.path = x.path)) ORDER BY x.exits DESC, x.path), '[]'::jsonb)
      FROM (SELECT l.path, count(*) AS exits FROM lasts l GROUP BY l.path ORDER BY count(*) DESC, l.path LIMIT 15) x),
    'funnel', (
      SELECT jsonb_agg(jsonb_build_object('step', s.step, 'visitors',
        (SELECT count(DISTINCT e.visitor_id) FROM ev e WHERE e.type = 'funnel' AND e.label = s.step)) ORDER BY s.n)
      FROM unnest(private.analytics_funnel_steps()) WITH ORDINALITY AS s(step, n)),
    'referrers', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('domain', r.domain, 'sessions', r.sessions, 'visitors', r.visitors)
        ORDER BY r.sessions DESC, r.domain), '[]'::jsonb)
      FROM (SELECT f.referrer_domain AS domain, count(*) AS sessions, count(DISTINCT f.visitor_id) AS visitors
            FROM firsts f GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 25) r),
    'campaigns', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('source', u.utm_source, 'medium', u.utm_medium,
        'campaign', u.utm_campaign, 'content', u.utm_content, 'sessions', u.sessions, 'visitors', u.visitors)
        ORDER BY u.sessions DESC, u.utm_source, u.utm_campaign), '[]'::jsonb)
      FROM (SELECT f.utm_source, f.utm_medium, f.utm_campaign, f.utm_content, count(*) AS sessions,
              count(DISTINCT f.visitor_id) AS visitors
            FROM firsts f WHERE f.utm_source <> '' OR f.utm_medium <> '' OR f.utm_campaign <> '' OR f.utm_content <> ''
            GROUP BY 1, 2, 3, 4 ORDER BY count(*) DESC, 1, 3 LIMIT 25) u),
    'countries', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', g.country, 'sessions', g.sessions, 'visitors', g.visitors)
        ORDER BY g.sessions DESC, g.country), '[]'::jsonb)
      FROM (SELECT f.country, count(*) AS sessions, count(DISTINCT f.visitor_id) AS visitors
            FROM firsts f GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 25) g),
    'cities', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', g.city, 'country', g.country, 'sessions', g.sessions,
        'visitors', g.visitors) ORDER BY g.sessions DESC, g.city), '[]'::jsonb)
      FROM (SELECT f.city, f.country, count(*) AS sessions, count(DISTINCT f.visitor_id) AS visitors
            FROM firsts f GROUP BY 1, 2 ORDER BY count(*) DESC, 1 LIMIT 25) g),
    'devices', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', g.device, 'sessions', g.sessions, 'visitors', g.visitors)
        ORDER BY g.sessions DESC, g.device), '[]'::jsonb)
      FROM (SELECT f.device, count(*) AS sessions, count(DISTINCT f.visitor_id) AS visitors
            FROM firsts f GROUP BY 1) g),
    'browsers', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', g.browser, 'sessions', g.sessions, 'visitors', g.visitors)
        ORDER BY g.sessions DESC, g.browser), '[]'::jsonb)
      FROM (SELECT f.browser, count(*) AS sessions, count(DISTINCT f.visitor_id) AS visitors
            FROM firsts f GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 25) g),
    'systems', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', g.os, 'sessions', g.sessions, 'visitors', g.visitors)
        ORDER BY g.sessions DESC, g.os), '[]'::jsonb)
      FROM (SELECT f.os, count(*) AS sessions, count(DISTINCT f.visitor_id) AS visitors
            FROM firsts f GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 25) g)
  ) INTO result;
  RETURN result;
END;
$$;

-- The visits of the last p_days days, newest first, p_limit (at most 100)
-- from p_offset: { total, sessions: [{ id, started_at, ended_at, country,
-- region, city, ip, device, browser, os, referrer_domain, utm_source,
-- utm_medium, utm_campaign, steps (page views and clicks), pages, exit }] }.
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
      SELECT jsonb_agg(jsonb_build_object('id', s.session_id, 'started_at', s.started_at, 'ended_at', s.ended_at,
        'country', f.country, 'region', f.region, 'city', f.city, 'ip', f.ip_truncated, 'device', f.device,
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

-- One visit's events in order (at most 500): [{ at, type, path, title,
-- label, target }].
CREATE OR REPLACE FUNCTION public.admin_analytics_journey(p_session UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('at', j.at, 'type', j.type, 'path', j.path, 'title', j.title,
      'label', j.label, 'target', j.target) ORDER BY j.at, j.id)
    FROM (SELECT e.id, e.at, e.type, e.path, e.title, e.label, e.target FROM private.analytics_events e
          WHERE e.session_id = p_session ORDER BY e.at, e.id LIMIT 500) j), '[]'::jsonb);
END;
$$;

-- ============================================================================
-- CLEAN-UP: events older than 6 months
-- ============================================================================

-- Deletes the events older than 6 months (KEEP_MONTHS in
-- src/content/analytics.js; the Privacy Policy promises it). Returns
-- { analytics_events: how many }. Its own job, below; private.daily_cleanup
-- doesn't do it.
CREATE OR REPLACE FUNCTION private.analytics_cleanup()
RETURNS JSONB LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  n INTEGER;
BEGIN
  DELETE FROM private.analytics_events e WHERE e.at < NOW() - INTERVAL '6 months';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('analytics_events', n);
END;
$$;

-- Runs private.analytics_cleanup() every night at 03:41 (UTC) with pg_cron,
-- as private.schedule_daily_cleanup() does for the other clean-up: enables
-- pg_cron if the database offers it, and does nothing otherwise. Says what
-- it did. Safe to run again (the job keeps its name):
-- SELECT private.schedule_analytics_cleanup();
-- Stop it with: SELECT cron.unschedule('nriclub-analytics-cleanup');
CREATE OR REPLACE FUNCTION private.schedule_analytics_cleanup()
RETURNS TEXT LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name = 'pg_cron') THEN
      RETURN 'not scheduled: this database has no pg_cron. Run SELECT private.analytics_cleanup(); by hand once a day.';
    END IF;
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
    EXCEPTION WHEN OTHERS THEN
      RETURN 'not scheduled: pg_cron could not be enabled (' || SQLERRM || '). Enable it under Database → Extensions, then run SELECT private.schedule_analytics_cleanup();';
    END;
  END IF;
  BEGIN
    EXECUTE 'SELECT cron.schedule($1, $2, $3)'
      USING 'nriclub-analytics-cleanup', '41 3 * * *', 'SELECT private.analytics_cleanup()';
  EXCEPTION WHEN OTHERS THEN
    RETURN 'not scheduled: ' || SQLERRM;
  END;
  RETURN 'scheduled: private.analytics_cleanup() runs every night at 03:41 UTC (pg_cron job nriclub-analytics-cleanup)';
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Helpers run as the database (inside the functions above, and the job).
REVOKE ALL ON FUNCTION private.analytics_funnel_steps(), private.analytics_since(INTEGER),
  private.analytics_cleanup(), private.schedule_analytics_cleanup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.analytics_cleanup() TO service_role;
-- Only /api/collect, with the service role key, stores events.
REVOKE ALL ON FUNCTION public.analytics_ingest(JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_ingest(JSONB, JSONB) TO service_role;
-- Anyone's browser counts a choice on the banner.
REVOKE ALL ON FUNCTION public.analytics_consent_count(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_consent_count(TEXT) TO anon, authenticated, service_role;
-- Admin functions check private.is_admin() themselves; members get "Admins only".
REVOKE ALL ON FUNCTION public.admin_analytics(INTEGER), public.admin_analytics_sessions(INTEGER, INTEGER, INTEGER),
  public.admin_analytics_journey(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_analytics(INTEGER), public.admin_analytics_sessions(INTEGER, INTEGER, INTEGER),
  public.admin_analytics_journey(UUID) TO authenticated;

-- The nightly clean-up of old events (the result shows in the SQL editor's
-- messages).
DO $$
BEGIN
  RAISE NOTICE 'NRIClub analytics clean-up: %', private.schedule_analytics_cleanup();
END $$;
