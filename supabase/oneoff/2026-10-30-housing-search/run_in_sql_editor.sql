-- Run this whole file once in the Supabase SQL Editor (find a place: housing
-- search by city and dates). Run it after the website analytics update
-- (2026-10-29-analytics/run_in_sql_editor.sql). It can run before or after
-- the site update: until it runs, Market → Housing says the housing search
-- is coming soon, and the rest of the Market works as before. It runs as
-- one transaction: if anything fails, nothing changes. It refuses to run a
-- second time. Role: postgres (the SQL Editor's default).
-- Schema: supabase/migrations/20261030000000_housing_search.sql
--
-- What it does:
--   * public.housing_listings: the details of a housing listing in the
--     Market (kind of place, city, free from and until, warm rent, deposit,
--     size, furnished, whether registering one's address there is
--     possible). Housing listings from before stay as they are.
--   * public.housing_wanted: "Looking for a place" posts. Only their author,
--     our team and the members whose listing matches them see them.
--   * public.search_housing (by kinds of place, city, dates, "flexible ±1
--     week", rent, furnished and Anmeldung), and post_housing_listing,
--     update_housing_listing, renew_housing_listing, housing_matches and
--     housing_status for the site. Approved members only.
--   * A new kind of in-app notification, 'housing_match': a new listing that
--     fits a member's looking post (at most 20 members for each listing).
--   * Limits per member: 5 listings a day and 10 in 30 days, 3 looking posts
--     a day and 5 in 30 days, and 10 changes a day to a listing's details.
--   * "Download my data" also has the housing details and looking posts.
--   * private.housing_cleanup(), every night at 03:53 UTC (its own pg_cron
--     job, nriclub-housing-cleanup; the result shows in the messages below):
--     expired listings leave the Market and are deleted 30 days later unless
--     renewed; looking posts 30 days after they ended; the limit counts
--     after 30 days. The daily clean-up isn't changed.
--   * No existing rows change.
--
-- Afterwards, if Market → Housing still says "Coming soon" a few minutes
-- later, run:
--   NOTIFY pgrst, 'reload schema';

DO $guard$
BEGIN
  IF to_regclass('private.analytics_events') IS NULL THEN
    RAISE EXCEPTION 'Run the website analytics update (2026-10-29-analytics/run_in_sql_editor.sql) first.';
  END IF;
  IF to_regclass('public.housing_listings') IS NOT NULL THEN
    RAISE EXCEPTION 'This update has already run. Nothing to do.';
  END IF;
END
$guard$;

-- ==== 20261030000000_housing_search.sql ====
-- ============================================================================
-- NRIclub: find a place, housing search by city and dates (2026-10-30)
--
--   * Housing listings in the Market get details (public.housing_listings,
--     one row per Market listing of category 'Housing', listing_id): the
--     kind of place (kind: 'wg_room' a room in a shared flat, 'sublet'
--     (Zwischenmiete), 'flat' a whole flat, 'short_stay', 'house'), the
--     city, the day it's free from (available_from) and until
--     (available_until; NULL: open-ended), the warm rent per month and the
--     deposit in euros, the size in m² (if given), furnished, and whether
--     registering one's address there is possible (anmeldung). The listing
--     itself (title, description, photos, Contact, Report, Delete, our
--     team's removals) stays a Market listing, so everything about Market
--     listings still applies to it. public.post_housing_listing posts both
--     at once and public.update_housing_listing changes the details; both
--     run as the member, so the Market's own rules and limits apply as to
--     any listing. Housing listings from before this update have no details
--     and show as before.
--   * Search (public.search_housing): by kinds of place, city, dates (from
--     and to, or only one of them), "flexible ±1 week", highest warm rent,
--     furnished and Anmeldung possible; by city alone or by dates alone too.
--     First the places free for all the dates ('full'), then those free
--     within a week of them if the member is flexible ('flexible'), then
--     those free for part of them ('partial', e.g. "Free 12 of your 20
--     days"); the best fit first, then the newest. Only listings that
--     haven't expired, of members other members see, without members who
--     blocked each other. There is no search or filter by gender, religion,
--     caste, origin, nationality, language, diet or anything like it (German
--     General Equal Treatment Act, AGG).
--   * "Looking for a place" posts (public.housing_wanted): the kinds of
--     place, the city, from when and until when (NULL: no end), the highest
--     warm rent, furnished or Anmeldung needed, and a short note. Only their
--     author and our team read them. The member can turn a post off and on,
--     change it and delete it.
--   * Matching: a new housing listing fits a looking post when it's in the
--     same city (private.travel_city_key, as on the travel board), of a kind
--     they want, within their rent, furnished and with Anmeldung if they
--     need that, and free for their dates give or take a week
--     (private.housing_fits). The authors of active looking posts it fits
--     get an in-app notification ('housing_match', pointing at the listing):
--     at most 20 a listing, none between members who blocked each other.
--     The listing's author sees the looking posts that fit it
--     (public.housing_matches), with their authors, to message them.
--   * Expiry: a listing is shown until its "until" date, or, open-ended, 60
--     days after it was posted or last renewed (public.renew_housing_listing).
--     A looking post until its end date, or 60 days after it was posted.
--   * Limits: 5 listings a day and 10 in 30 days, 3 looking posts a day and
--     5 in 30 days per member, and 10 changes a day to a listing's kind,
--     city, dates, rent, furnished or Anmeldung (so its author can't sweep
--     through other members' looking posts with public.housing_matches;
--     renewing isn't a change). Counted in private.housing_post_log:
--     deleting a post doesn't give another try; private.rate_log isn't used,
--     because the daily clean-up keeps its rows only a day.
--   * Access: only members our team has approved (private.is_active_member)
--     read and post; signed-out visitors and members waiting for our check
--     get nothing (the policies and functions below).
--   * Clean-up: private.housing_cleanup(), every night at 03:53 UTC with its
--     own pg_cron job (nriclub-housing-cleanup): expired listings leave the
--     Market (marketplace.status 'expired') and are deleted 30 days after
--     they expired, unless renewed; looking posts 30 days after they
--     expired; the counts behind the limits after 30 days.
--     private.daily_cleanup is not changed.
--   * "Download my data" (public.export_my_data, the 2026-10-27 version plus
--     these) also has the member's housing details, looking posts and the
--     counts behind the limits. All of them go with the account.
--   * notifications.type accepts 'housing_match' too: the new CHECK is the
--     one the database has now plus 'housing_match', so types added by
--     other updates stay.
-- Needs the earlier migrations (up to 20261029000000_analytics.sql).
-- Can be run again: it replaces what it made the first time and keeps the
-- data. Existing rows: none change (the clean-up only ever changes listings
-- that have housing details).
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('private.analytics_events') IS NULL OR to_regclass('private.ambassador_log') IS NULL
     OR to_regclass('private.profile_reminders') IS NULL THEN
    RAISE EXCEPTION 'Run the earlier updates (up to 20261029000000_analytics.sql) first.';
  END IF;
END;
$$;

-- ============================================================================
-- THE NEW KIND OF NOTIFICATION
-- ============================================================================

-- 'housing_match': a new housing listing fits one of the member's looking
-- posts. Built from the constraint as it is now, so kinds another update
-- added stay (as in 20261028000000_profile_completeness.sql).
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
  IF kinds IS NULL OR NOT kinds @> ARRAY['like', 'comment', 'request', 'message', 'verification', 'moderation',
                                         'travel_match', 'profile'] THEN
    RAISE EXCEPTION 'Unexpected notifications_type_check: %', def;
  END IF;
  IF 'housing_match' = ANY (kinds) THEN
    RETURN;
  END IF;
  EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check, '
                 'ADD CONSTRAINT notifications_type_check CHECK (type IN (%s))',
                 (SELECT string_agg(quote_literal(k), ', ' ORDER BY n)
                  FROM unnest(kinds || 'housing_match'::text) WITH ORDINALITY AS y(k, n)));
END;
$$;

-- ============================================================================
-- KINDS OF PLACE, DATES AND WORDS
-- ============================================================================

-- The kinds of place, in the order the site shows them (HOUSING_KINDS in
-- src/content/housing.js; supabase/tests/rls_test.py compares them).
CREATE OR REPLACE FUNCTION private.housing_kinds()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY['wg_room', 'sublet', 'flat', 'short_stay', 'house']::TEXT[];
$$;

-- "a WG room", "a sublet" …: a kind of place in a notification.
CREATE OR REPLACE FUNCTION private.housing_kind_text(p_kind TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_kind WHEN 'wg_room' THEN 'a WG room' WHEN 'sublet' THEN 'a sublet' WHEN 'flat' THEN 'a whole flat'
    WHEN 'short_stay' THEN 'a short stay' WHEN 'house' THEN 'a house' ELSE 'a place' END;
$$;

-- "from 1 Mar 2027" for an open-ended place, else as on the travel board:
-- "1–31 Mar 2027", "1 Mar–31 May 2027", "1 Dec 2026–28 Feb 2027".
CREATE OR REPLACE FUNCTION private.housing_dates_text(p_from DATE, p_until DATE)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_until IS NULL THEN 'from ' || to_char(p_from, 'FMDD Mon YYYY')
    ELSE private.travel_dates_text(p_from, p_until) END;
$$;

-- The Market listing's price for a housing listing: "€1,250/month warm".
CREATE OR REPLACE FUNCTION private.housing_price_text(p_rent INTEGER)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '€' || to_char(p_rent, 'FM999,999,990') || '/month warm';
$$;

-- ============================================================================
-- HOUSING LISTINGS: THE DETAILS OF A MARKET LISTING
-- ============================================================================

-- One row per Market listing of category 'Housing' that has details (the
-- listing's id). user_id: its author, the same as the listing's. kind: see
-- the top of this file. city_key: the city for searching and matching.
-- available_until NULL: open-ended. warm_rent and deposit: euros (deposit 0:
-- none); size_m2: NULL if not given. anmeldung: registering one's address
-- there is possible. expires_on: the last day it's shown (the trigger below
-- works it out: available_until, or 60 days after renewed_at or
-- created_at). Deleted with the listing and with the account.
CREATE TABLE IF NOT EXISTS public.housing_listings (
  listing_id UUID PRIMARY KEY REFERENCES public.marketplace(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('wg_room', 'sublet', 'flat', 'short_stay', 'house')),
  city TEXT NOT NULL CHECK (private.travel_city_ok(city)),
  city_key TEXT GENERATED ALWAYS AS (private.travel_city_key(city)) STORED,
  available_from DATE NOT NULL,
  available_until DATE,
  warm_rent INTEGER NOT NULL CHECK (warm_rent BETWEEN 1 AND 20000),
  deposit INTEGER NOT NULL DEFAULT 0 CHECK (deposit BETWEEN 0 AND 100000),
  size_m2 INTEGER CHECK (size_m2 BETWEEN 1 AND 2000),
  furnished BOOLEAN NOT NULL DEFAULT FALSE,
  anmeldung BOOLEAN NOT NULL DEFAULT FALSE,
  expires_on DATE NOT NULL,
  renewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT housing_listings_dates CHECK (available_until IS NULL OR available_until >= available_from)
);
CREATE INDEX IF NOT EXISTS idx_housing_listings_city ON public.housing_listings (city_key, expires_on);
CREATE INDEX IF NOT EXISTS idx_housing_listings_user ON public.housing_listings (user_id);
CREATE INDEX IF NOT EXISTS idx_housing_listings_expires ON public.housing_listings (expires_on);

-- Before details are saved: spaces tidied, and the rules in plain words
-- (the table's checks stay as the last word). For members (an API request),
-- the dates mustn't have passed (in Germany) or be more than a year ahead:
-- on new details, and on changed dates (a place free since a day that has
-- passed keeps that day). The listing, its author and when it was posted
-- stay as they are; only public.renew_housing_listing renews it. expires_on
-- is worked out here every time.
CREATE OR REPLACE FUNCTION private.check_housing_listing()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  today DATE := private.today_in_germany();
  member BOOLEAN := current_user = 'authenticated';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.listing_id := OLD.listing_id;
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
    IF member THEN
      NEW.renewed_at := OLD.renewed_at;
    END IF;
  ELSIF member THEN
    NEW.created_at := NOW();
    NEW.renewed_at := NULL;
  END IF;
  NEW.updated_at := NOW();
  NEW.city := btrim(regexp_replace(COALESCE(NEW.city, ''), '\s+', ' ', 'g'));
  NEW.deposit := COALESCE(NEW.deposit, 0);
  NEW.furnished := COALESCE(NEW.furnished, FALSE);
  NEW.anmeldung := COALESCE(NEW.anmeldung, FALSE);

  IF NEW.kind IS NULL OR NOT (NEW.kind = ANY (private.housing_kinds())) THEN
    RAISE EXCEPTION 'Please choose what kind of place it is: a WG room, a sublet, a whole flat, a short stay or a house.'
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.city = '' THEN
    RAISE EXCEPTION 'Please say which city the place is in.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT private.travel_city_ok(NEW.city) THEN
    RAISE EXCEPTION 'Please write the city''s name in letters (2 to 60 characters, no numbers).' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.available_from IS NULL THEN
    RAISE EXCEPTION 'Please choose the day the place is free from.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.available_until IS NOT NULL AND NEW.available_until < NEW.available_from THEN
    RAISE EXCEPTION 'The "until" date is before the "from" date. Please check the dates.' USING ERRCODE = 'P0001';
  END IF;
  IF member AND (TG_OP = 'INSERT' OR NEW.available_from IS DISTINCT FROM OLD.available_from
                 OR NEW.available_until IS DISTINCT FROM OLD.available_until) THEN
    IF NEW.available_until < today
       OR (NEW.available_from < today AND (TG_OP = 'INSERT' OR NEW.available_from IS DISTINCT FROM OLD.available_from)) THEN
      RAISE EXCEPTION 'That date has passed. Please choose today or a later date.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.available_from > today + 365 OR NEW.available_until > today + 365 THEN
      RAISE EXCEPTION 'Please choose dates within the next 12 months. If the place is free for longer, choose "open-ended".'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NEW.warm_rent IS NULL OR NEW.warm_rent < 1 OR NEW.warm_rent > 20000 THEN
    RAISE EXCEPTION 'Please give the warm rent per month in euros (a whole number up to 20,000).' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.deposit < 0 OR NEW.deposit > 100000 THEN
    RAISE EXCEPTION 'Please give the deposit in euros (0 if there is none).' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.size_m2 IS NOT NULL AND (NEW.size_m2 < 1 OR NEW.size_m2 > 2000) THEN
    RAISE EXCEPTION 'Please give the size in m² (1 to 2,000), or leave it empty.' USING ERRCODE = 'P0001';
  END IF;
  NEW.expires_on := COALESCE(NEW.available_until,
    (COALESCE(NEW.renewed_at, NEW.created_at, NOW()) AT TIME ZONE 'Europe/Berlin')::DATE + 60);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS check_housing_listing ON public.housing_listings;
CREATE TRIGGER check_housing_listing BEFORE INSERT OR UPDATE ON public.housing_listings
  FOR EACH ROW EXECUTE FUNCTION private.check_housing_listing();

-- Who sees what. The author always sees their own details; approved members
-- and our team see the details of the listings they see (every Market
-- listing, as public.marketplace's policy says). Only members who can take
-- part add details to their own housing listings, and change them. Nobody
-- deletes details on their own: they go with the listing.
ALTER TABLE public.housing_listings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.housing_listings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.housing_listings TO authenticated;
GRANT ALL ON public.housing_listings TO service_role;

DROP POLICY IF EXISTS "Members see housing details" ON public.housing_listings;
CREATE POLICY "Members see housing details" ON public.housing_listings
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT private.is_active_member()) OR (SELECT private.is_admin()));

DROP POLICY IF EXISTS "Members add details to their housing listings" ON public.housing_listings;
CREATE POLICY "Members add details to their housing listings" ON public.housing_listings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT private.is_active_member())
              AND EXISTS (SELECT 1 FROM public.marketplace m
                          WHERE m.id = listing_id AND m.user_id = (SELECT auth.uid()) AND m.category = 'Housing'));

DROP POLICY IF EXISTS "Authors change their housing details" ON public.housing_listings;
CREATE POLICY "Authors change their housing details" ON public.housing_listings
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT private.is_active_member()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT private.is_active_member()));

-- ============================================================================
-- "LOOKING FOR A PLACE" POSTS
-- ============================================================================

-- kinds: one or more kinds of place. date_to NULL: no end. max_rent: the
-- highest warm rent a month in euros, NULL for any. furnished, anmeldung:
-- the place must be furnished, registering one's address there must be
-- possible. active: the member can turn the post off. expires_on: the last
-- day it's matched (date_to, or 60 days after it was posted). Deleted with
-- the account.
CREATE TABLE IF NOT EXISTS public.housing_wanted (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  kinds TEXT[] NOT NULL CHECK (cardinality(kinds) BETWEEN 1 AND 5
                               AND kinds <@ ARRAY['wg_room', 'sublet', 'flat', 'short_stay', 'house']::TEXT[]),
  city TEXT NOT NULL CHECK (private.travel_city_ok(city)),
  city_key TEXT GENERATED ALWAYS AS (private.travel_city_key(city)) STORED,
  date_from DATE NOT NULL,
  date_to DATE,
  max_rent INTEGER CHECK (max_rent BETWEEN 1 AND 20000),
  furnished BOOLEAN NOT NULL DEFAULT FALSE,
  anmeldung BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT housing_wanted_dates CHECK (date_to IS NULL OR date_to >= date_from)
);
CREATE INDEX IF NOT EXISTS idx_housing_wanted_city ON public.housing_wanted (city_key, expires_on) WHERE active;
CREATE INDEX IF NOT EXISTS idx_housing_wanted_user ON public.housing_wanted (user_id);
CREATE INDEX IF NOT EXISTS idx_housing_wanted_expires ON public.housing_wanted (expires_on);

-- Before a looking post is saved: spaces tidied, the kinds each once (in
-- the site's order), and the rules in plain words. Dates as for listings.
-- Its id, author and when it was posted stay as they are; an expired post
-- can't be turned on again.
CREATE OR REPLACE FUNCTION private.check_housing_wanted()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  today DATE := private.today_in_germany();
  member BOOLEAN := current_user = 'authenticated';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.id := OLD.id;
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
  ELSIF member THEN
    NEW.created_at := NOW();
  END IF;
  NEW.updated_at := NOW();
  NEW.city := btrim(regexp_replace(COALESCE(NEW.city, ''), '\s+', ' ', 'g'));
  NEW.note := btrim(COALESCE(NEW.note, ''));
  NEW.kinds := ARRAY(SELECT d.k FROM (SELECT DISTINCT k FROM unnest(COALESCE(NEW.kinds, '{}'::TEXT[])) k) d
                     ORDER BY COALESCE(array_position(private.housing_kinds(), d.k), 99), d.k);
  NEW.furnished := COALESCE(NEW.furnished, FALSE);
  NEW.anmeldung := COALESCE(NEW.anmeldung, FALSE);
  NEW.active := COALESCE(NEW.active, TRUE);

  IF cardinality(NEW.kinds) = 0 THEN
    RAISE EXCEPTION 'Please choose at least one kind of place.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT NEW.kinds <@ private.housing_kinds() THEN
    RAISE EXCEPTION 'Please choose a WG room, a sublet, a whole flat, a short stay or a house.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.city = '' THEN
    RAISE EXCEPTION 'Please say which city you''re looking in.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT private.travel_city_ok(NEW.city) THEN
    RAISE EXCEPTION 'Please write the city''s name in letters (2 to 60 characters, no numbers).' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.date_from IS NULL THEN
    RAISE EXCEPTION 'Please choose the day you need the place from.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.date_to IS NOT NULL AND NEW.date_to < NEW.date_from THEN
    RAISE EXCEPTION 'The "until" date is before the "from" date. Please check the dates.' USING ERRCODE = 'P0001';
  END IF;
  IF member AND (TG_OP = 'INSERT' OR NEW.date_from IS DISTINCT FROM OLD.date_from OR NEW.date_to IS DISTINCT FROM OLD.date_to) THEN
    IF NEW.date_to < today
       OR (NEW.date_from < today AND (TG_OP = 'INSERT' OR NEW.date_from IS DISTINCT FROM OLD.date_from)) THEN
      RAISE EXCEPTION 'That date has passed. Please choose today or a later date.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.date_from > today + 365 OR NEW.date_to > today + 365 THEN
      RAISE EXCEPTION 'Please choose dates within the next 12 months.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NEW.max_rent IS NOT NULL AND (NEW.max_rent < 1 OR NEW.max_rent > 20000) THEN
    RAISE EXCEPTION 'Please give the highest warm rent in euros (a whole number up to 20,000), or leave it empty.'
      USING ERRCODE = 'P0001';
  END IF;
  IF char_length(NEW.note) > 500 THEN
    RAISE EXCEPTION 'Please keep the note to 500 characters.' USING ERRCODE = 'P0001';
  END IF;
  NEW.expires_on := COALESCE(NEW.date_to, (COALESCE(NEW.created_at, NOW()) AT TIME ZONE 'Europe/Berlin')::DATE + 60);
  IF member AND TG_OP = 'UPDATE' AND NEW.active AND NOT OLD.active AND NEW.expires_on < today THEN
    RAISE EXCEPTION 'This post has expired. Please post a new one.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS check_housing_wanted ON public.housing_wanted;
CREATE TRIGGER check_housing_wanted BEFORE INSERT OR UPDATE ON public.housing_wanted
  FOR EACH ROW EXECUTE FUNCTION private.check_housing_wanted();

-- Only the author (and our team) reads a looking post. Members who can take
-- part post, change and turn off their own; the author deletes it. Other
-- members see a post only through public.housing_matches, when it fits a
-- listing of theirs.
ALTER TABLE public.housing_wanted ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.housing_wanted FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.housing_wanted TO authenticated;
GRANT ALL ON public.housing_wanted TO service_role;

DROP POLICY IF EXISTS "Members see their looking posts" ON public.housing_wanted;
CREATE POLICY "Members see their looking posts" ON public.housing_wanted
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));

DROP POLICY IF EXISTS "Members post what they're looking for" ON public.housing_wanted;
CREATE POLICY "Members post what they're looking for" ON public.housing_wanted
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT private.is_active_member()));

DROP POLICY IF EXISTS "Authors change their looking posts" ON public.housing_wanted;
CREATE POLICY "Authors change their looking posts" ON public.housing_wanted
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT private.is_active_member()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT private.is_active_member()));

DROP POLICY IF EXISTS "Authors delete their looking posts" ON public.housing_wanted;
CREATE POLICY "Authors delete their looking posts" ON public.housing_wanted
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ============================================================================
-- LIMITS
-- ============================================================================

-- When a member posted housing details ('listing') or a looking post
-- ('looking'), or changed a listing's details ('change'), for the limits
-- below. Kept 30 days (private.housing_cleanup), so deleting a post doesn't
-- give another try; deleted with the account. Only the database reads it.
-- (Not private.rate_log: the daily clean-up keeps its rows only a day,
-- except the travel board's.)
CREATE TABLE IF NOT EXISTS private.housing_post_log (
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('listing', 'looking', 'change')),
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE private.housing_post_log
  DROP CONSTRAINT IF EXISTS housing_post_log_kind_check,
  ADD CONSTRAINT housing_post_log_kind_check CHECK (kind IN ('listing', 'looking', 'change'));
CREATE INDEX IF NOT EXISTS idx_housing_post_log ON private.housing_post_log (member_id, kind, at);
ALTER TABLE private.housing_post_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.housing_post_log FROM PUBLIC, anon, authenticated;

-- Counts one more p_kind for the signed-in member, or refuses it if that
-- would go over a limit. p_limits: pairs of how many and in what time, as
-- for private.take_rate.
CREATE OR REPLACE FUNCTION private.take_housing_rate(p_kind TEXT, p_limits TEXT[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := (SELECT auth.uid());
  i INTEGER;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;
  -- Two requests sent at the same moment are counted one by one.
  PERFORM pg_advisory_xact_lock(hashtext('nriclub-housing-rate:' || me::text || ':' || p_kind));
  FOR i IN 1 .. COALESCE(array_length(p_limits, 1), 0) / 2 LOOP
    IF (SELECT count(*) FROM private.housing_post_log l
        WHERE l.member_id = me AND l.kind = p_kind
          AND l.at > NOW() - p_limits[2 * i]::INTERVAL) >= p_limits[2 * i - 1]::INTEGER THEN
      IF p_limits[2 * i]::INTERVAL <= INTERVAL '1 day' THEN
        RAISE EXCEPTION 'You''re doing that too often. Please wait a little and try again.' USING ERRCODE = 'P0001';
      END IF;
      RAISE EXCEPTION 'You can post at most % % in % days. Please try again later, or delete one you no longer need.',
        p_limits[2 * i - 1], CASE WHEN p_kind = 'listing' THEN 'housing listings' ELSE '"looking for a place" posts' END,
        extract(day FROM p_limits[2 * i]::INTERVAL) USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  INSERT INTO private.housing_post_log (member_id, kind) VALUES (me, p_kind);
END;
$$;

-- BEFORE INSERT: TG_ARGV[0] names the kind, the rest are its limits. Runs
-- as the member, like private.rate_limit; admins have no limits. A row that
-- is refused later (by a policy) isn't counted: the whole request is undone.
CREATE OR REPLACE FUNCTION private.housing_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user = 'authenticated' AND NOT private.is_admin() THEN
    PERFORM private.take_housing_rate(TG_ARGV[0], TG_ARGV[1:TG_NARGS - 1]);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS rate_limit ON public.housing_listings;
CREATE TRIGGER rate_limit BEFORE INSERT ON public.housing_listings
  FOR EACH ROW EXECUTE FUNCTION private.housing_rate_limit('listing', '5', '1 day', '10', '30 days');
DROP TRIGGER IF EXISTS rate_limit ON public.housing_wanted;
CREATE TRIGGER rate_limit BEFORE INSERT ON public.housing_wanted
  FOR EACH ROW EXECUTE FUNCTION private.housing_rate_limit('looking', '3', '1 day', '5', '30 days');
-- A change to what a listing fits (renewing, which runs as the database,
-- isn't counted).
DROP TRIGGER IF EXISTS rate_limit_change ON public.housing_listings;
CREATE TRIGGER rate_limit_change BEFORE UPDATE ON public.housing_listings
  FOR EACH ROW WHEN (OLD.kind IS DISTINCT FROM NEW.kind OR OLD.city IS DISTINCT FROM NEW.city
    OR OLD.available_from IS DISTINCT FROM NEW.available_from OR OLD.available_until IS DISTINCT FROM NEW.available_until
    OR OLD.warm_rent IS DISTINCT FROM NEW.warm_rent OR OLD.furnished IS DISTINCT FROM NEW.furnished
    OR OLD.anmeldung IS DISTINCT FROM NEW.anmeldung)
  EXECUTE FUNCTION private.housing_rate_limit('change', '10', '1 day');

-- ============================================================================
-- POSTING, CHANGING AND RENEWING A LISTING
-- ============================================================================

-- A new housing listing: the Market listing (title, description, photos as
-- for any listing; its price says the warm rent, its location the city) and
-- its details, in one go. Runs as the member, so the Market's policies,
-- photo checks and limits apply as to any listing, and the details' own.
-- Returns { listing_id, expires_on }.
CREATE OR REPLACE FUNCTION public.post_housing_listing(p_title TEXT, p_description TEXT, p_image_url TEXT,
  p_kind TEXT, p_city TEXT, p_from DATE, p_until DATE, p_warm_rent INTEGER, p_deposit INTEGER,
  p_size_m2 INTEGER DEFAULT NULL, p_furnished BOOLEAN DEFAULT FALSE, p_anmeldung BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  v_title TEXT := btrim(COALESCE(p_title, ''));
  v_city TEXT := btrim(regexp_replace(COALESCE(p_city, ''), '\s+', ' ', 'g'));
  new_id UUID;
  h public.housing_listings;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_active_member() THEN
    RAISE EXCEPTION 'Only members our team has approved can post housing listings.' USING ERRCODE = '42501';
  END IF;
  IF v_title = '' THEN
    RAISE EXCEPTION 'Please give your listing a title.' USING ERRCODE = 'P0001';
  END IF;
  IF p_warm_rent IS NULL OR p_warm_rent < 1 OR p_warm_rent > 20000 THEN
    RAISE EXCEPTION 'Please give the warm rent per month in euros (a whole number up to 20,000).' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.marketplace (user_id, title, description, price, category, location, image_url)
  VALUES (uid, v_title, btrim(COALESCE(p_description, '')), private.housing_price_text(p_warm_rent), 'Housing',
          LEFT(v_city, 200), COALESCE(p_image_url, ''))
  RETURNING id INTO new_id;
  INSERT INTO public.housing_listings (listing_id, user_id, kind, city, available_from, available_until, warm_rent,
    deposit, size_m2, furnished, anmeldung)
  VALUES (new_id, uid, p_kind, v_city, p_from, p_until, p_warm_rent, COALESCE(p_deposit, 0), p_size_m2,
    COALESCE(p_furnished, FALSE), COALESCE(p_anmeldung, FALSE))
  RETURNING * INTO h;
  RETURN jsonb_build_object('listing_id', h.listing_id, 'expires_on', h.expires_on);
END;
$$;

-- The author changes their listing's details (all of them, as the form
-- sends them); the Market listing's price and location follow, and an
-- expired listing whose new dates are current is shown again. Runs as the
-- member. Returns the details as saved.
CREATE OR REPLACE FUNCTION public.update_housing_listing(p_listing UUID, p_kind TEXT, p_city TEXT, p_from DATE,
  p_until DATE, p_warm_rent INTEGER, p_deposit INTEGER, p_size_m2 INTEGER DEFAULT NULL,
  p_furnished BOOLEAN DEFAULT FALSE, p_anmeldung BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  h public.housing_listings;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  UPDATE public.housing_listings x SET kind = p_kind, city = p_city, available_from = p_from, available_until = p_until,
    warm_rent = p_warm_rent, deposit = COALESCE(p_deposit, 0), size_m2 = p_size_m2,
    furnished = COALESCE(p_furnished, FALSE), anmeldung = COALESCE(p_anmeldung, FALSE)
  WHERE x.listing_id = p_listing
  RETURNING x.* INTO h;
  IF h.listing_id IS NULL THEN
    RAISE EXCEPTION 'This listing couldn''t be changed. It may have been deleted.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.marketplace m SET price = private.housing_price_text(h.warm_rent), location = LEFT(h.city, 200),
    status = CASE WHEN m.status = 'expired' AND h.expires_on >= private.today_in_germany() THEN 'active' ELSE m.status END
  WHERE m.id = h.listing_id;
  RETURN to_jsonb(h);
END;
$$;

-- An open-ended listing is shown for 60 more days from today, and comes
-- back if it had expired. (A listing with an "until" date is shown until
-- that date: to show it longer, its author changes its dates.) Only its
-- author, while they can take part. Returns { listing_id, expires_on,
-- renewed_at }.
CREATE OR REPLACE FUNCTION public.renew_housing_listing(p_listing UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := auth.uid();
  h public.housing_listings;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_active_member() THEN
    RAISE EXCEPTION 'Only members our team has approved can renew housing listings.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO h FROM public.housing_listings x WHERE x.listing_id = p_listing FOR UPDATE;
  IF h.listing_id IS NULL OR h.user_id <> me THEN
    RAISE EXCEPTION 'This listing couldn''t be found. It may have been deleted.' USING ERRCODE = 'P0002';
  END IF;
  IF h.available_until IS NOT NULL THEN
    RAISE EXCEPTION 'This place is shown until its "until" date. To show it for longer, change its dates.'
      USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.housing_listings x SET renewed_at = NOW() WHERE x.listing_id = p_listing RETURNING x.* INTO h;
  UPDATE public.marketplace m SET status = 'active' WHERE m.id = p_listing AND m.status = 'expired';
  RETURN jsonb_build_object('listing_id', h.listing_id, 'expires_on', h.expires_on, 'renewed_at', h.renewed_at);
END;
$$;

-- ============================================================================
-- SEARCH
-- ============================================================================

-- For the site: the housing listings that haven't expired, as
-- { total, wanted_days, results: [...] }, at most p_limit (1 to 200) of
-- them. p_kinds: kinds of place (NULL or empty for any); p_city: the city
-- (any of its names, as on the travel board; NULL or empty for any city);
-- p_from, p_to: the member's dates (only p_to: from today; only p_from: no
-- end); p_flexible: give or take a week; p_max_rent: the highest warm
-- rent; p_furnished, p_anmeldung: only furnished places, only places where
-- registering is possible. Without dates, the newest first. With dates,
-- only places free for at least a day of them (or, flexible, within a week
-- of them), each with fit: 'full' (free for all the dates), 'flexible'
-- (free from at most a week after the first day until at most a week before
-- the last) or 'partial'; free_from, free_until: the part of the dates it's
-- free (free_until NULL: no end); free_days of wanted_days (with an end
-- date). The best fit first (full; flexible, the fewest days off; partial,
-- the most days free, or without an end date the soonest free), then the
-- newest. Each result has the listing (title, description, photos,
-- location, posted_at), its details and its author (name, avatar_url).
-- Only members who can take part; listings of members other members don't
-- see, and of members who blocked the member or whom they blocked, are left
-- out (their own are in, as mine).
CREATE OR REPLACE FUNCTION public.search_housing(p_kinds TEXT[] DEFAULT NULL, p_city TEXT DEFAULT NULL,
  p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL, p_flexible BOOLEAN DEFAULT FALSE, p_max_rent INTEGER DEFAULT NULL,
  p_furnished BOOLEAN DEFAULT FALSE, p_anmeldung BOOLEAN DEFAULT FALSE, p_limit INTEGER DEFAULT 100)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := auth.uid();
  today DATE := private.today_in_germany();
  v_kinds TEXT[] := NULLIF(ARRAY(SELECT DISTINCT k FROM unnest(COALESCE(p_kinds, '{}'::TEXT[])) k WHERE k IS NOT NULL), '{}'::TEXT[]);
  v_key TEXT := NULLIF(private.travel_city_key(p_city), '');
  v_from DATE := p_from;
  v_to DATE := p_to;
  flex INTEGER := CASE WHEN COALESCE(p_flexible, FALSE) THEN 7 ELSE 0 END;
  lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  result JSONB;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_active_member() THEN
    RAISE EXCEPTION 'Only members our team has approved can search for a place.' USING ERRCODE = '42501';
  END IF;
  IF v_kinds IS NOT NULL AND NOT v_kinds <@ private.housing_kinds() THEN
    RAISE EXCEPTION 'Please choose a WG room, a sublet, a whole flat, a short stay or a house.' USING ERRCODE = 'P0001';
  END IF;
  IF v_from IS NULL AND v_to IS NOT NULL THEN
    v_from := LEAST(today, v_to);
  END IF;
  IF v_to < v_from THEN
    RAISE EXCEPTION 'The "to" date is before the "from" date. Please check the dates.' USING ERRCODE = 'P0001';
  END IF;
  IF p_max_rent IS NOT NULL AND p_max_rent < 1 THEN
    RAISE EXCEPTION 'Please give the highest warm rent in euros, or leave it empty.' USING ERRCODE = 'P0001';
  END IF;

  WITH c AS (
    SELECT h.*, m.title, m.description, m.image_url, m.location, m.created_at AS posted_at, p.name, p.avatar_url
    FROM public.housing_listings h
    JOIN public.marketplace m ON m.id = h.listing_id
    JOIN public.profiles p ON p.id = h.user_id
    WHERE m.category = 'Housing' AND m.status = 'active' AND h.expires_on >= today
      AND (h.user_id = me OR (private.is_listed_member(h.user_id) AND NOT private.is_blocked_between(me, h.user_id)))
      AND (v_key IS NULL OR h.city_key = v_key)
      AND (v_kinds IS NULL OR h.kind = ANY (v_kinds))
      AND (p_max_rent IS NULL OR h.warm_rent <= p_max_rent)
      AND (NOT COALESCE(p_furnished, FALSE) OR h.furnished)
      AND (NOT COALESCE(p_anmeldung, FALSE) OR h.anmeldung)
  ), f AS (
    SELECT c.*,
      CASE
        WHEN v_from IS NULL THEN NULL
        WHEN c.available_from <= v_from AND (c.available_until IS NULL OR c.available_until >= v_to) THEN 'full'
        WHEN flex > 0 AND c.available_from <= v_from + flex
             AND (c.available_until IS NULL OR c.available_until >= v_to - flex) THEN 'flexible'
        WHEN (v_to IS NULL OR c.available_from <= v_to) AND (c.available_until IS NULL OR c.available_until >= v_from)
          THEN 'partial'
      END AS fit,
      -- (GREATEST and LEAST leave out NULLs: no end date is no limit.)
      GREATEST(c.available_from, v_from) AS free_from,
      LEAST(c.available_until, v_to) AS free_until
    FROM c
  ), g AS (
    SELECT f.*,
      CASE WHEN v_to IS NOT NULL AND f.fit IS NOT NULL THEN GREATEST(f.free_until - f.free_from + 1, 0) END AS free_days,
      CASE f.fit WHEN 'full' THEN 0 WHEN 'flexible' THEN 1 WHEN 'partial' THEN 2 ELSE 3 END AS rank,
      CASE
        WHEN f.fit = 'flexible' THEN GREATEST(f.available_from - v_from, 0)
          + CASE WHEN f.available_until IS NULL OR v_to IS NULL THEN 0 ELSE GREATEST(v_to - f.available_until, 0) END
        WHEN f.fit = 'partial' AND v_to IS NOT NULL THEN (v_to - v_from + 1) - GREATEST(f.free_until - f.free_from + 1, 0)
        WHEN f.fit = 'partial' THEN GREATEST(f.available_from - v_from, 0)
        ELSE 0 END AS gap
    FROM f
    WHERE v_from IS NULL OR f.fit IS NOT NULL
  ), o AS (
    SELECT g.*, row_number() OVER (ORDER BY g.rank, g.gap, g.posted_at DESC, g.listing_id) AS ord FROM g
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM o),
    'wanted_days', CASE WHEN v_to IS NOT NULL THEN v_to - v_from + 1 END,
    'from', v_from, 'to', v_to,
    'results', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'listing_id', o.listing_id, 'user_id', o.user_id, 'name', o.name, 'avatar_url', o.avatar_url,
        'mine', o.user_id = me, 'title', o.title, 'description', o.description, 'image_url', o.image_url,
        'location', o.location, 'posted_at', o.posted_at, 'kind', o.kind, 'city', o.city,
        'available_from', o.available_from, 'available_until', o.available_until, 'warm_rent', o.warm_rent,
        'deposit', o.deposit, 'size_m2', o.size_m2, 'furnished', o.furnished, 'anmeldung', o.anmeldung,
        'expires_on', o.expires_on, 'fit', o.fit, 'free_from', CASE WHEN o.fit IS NOT NULL THEN o.free_from END,
        'free_until', CASE WHEN o.fit IS NOT NULL THEN o.free_until END, 'free_days', o.free_days) ORDER BY o.ord)
      FROM o WHERE o.ord <= lim), '[]'::jsonb))
  INTO result;
  RETURN result;
END;
$$;

-- ============================================================================
-- MATCHES
-- ============================================================================

-- Whether a listing fits a looking post: the same city, a kind of place they
-- want, within their highest rent, furnished and with Anmeldung if they
-- need it, and free for their dates give or take a week: from at most 7
-- days after their first day, and until at most 7 days before their last
-- day (or open-ended); for a post without an end date, open-ended or free
-- for at least 4 weeks from their first day. (Expiry and who may see whom
-- are checked where it's used.)
CREATE OR REPLACE FUNCTION private.housing_fits(l public.housing_listings, w public.housing_wanted)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT l.city_key = w.city_key AND l.kind = ANY (w.kinds)
    AND (w.max_rent IS NULL OR l.warm_rent <= w.max_rent)
    AND (NOT w.furnished OR l.furnished) AND (NOT w.anmeldung OR l.anmeldung)
    AND l.available_from <= w.date_from + 7
    AND (l.available_until IS NULL
         OR CASE WHEN w.date_to IS NULL THEN l.available_until >= w.date_from + 28
                 ELSE l.available_until >= w.date_to - 7 END);
$$;

-- A new listing with details: the authors of active looking posts it fits
-- hear about it (pointing at the listing), the newest posts first, at most
-- 20 members, each once. Not members who can't take part, nor between
-- members who blocked each other (private.notify checks both again).
-- Changing or renewing a listing notifies nobody.
CREATE OR REPLACE FUNCTION private.notify_housing_matches()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m RECORD;
BEGIN
  IF NEW.expires_on < private.today_in_germany() THEN
    RETURN NULL;
  END IF;
  FOR m IN
    SELECT x.user_id FROM (
      SELECT DISTINCT ON (w.user_id) w.user_id, w.created_at
      FROM public.housing_wanted w
      WHERE w.active AND w.expires_on >= private.today_in_germany() AND w.user_id <> NEW.user_id
        AND private.housing_fits(NEW, w)
        AND private.gets_notifications(w.user_id)
        AND NOT private.is_blocked_between(w.user_id, NEW.user_id)
      ORDER BY w.user_id, w.created_at DESC) x
    ORDER BY x.created_at DESC
    LIMIT 20
  LOOP
    PERFORM private.notify(m.user_id, 'housing_match', NEW.user_id,
      'posted ' || private.housing_kind_text(NEW.kind) || ' in ' || NEW.city || ', free '
      || private.housing_dates_text(NEW.available_from, NEW.available_until) || ', '
      || '€' || to_char(NEW.warm_rent, 'FM999,999,990') || ' a month warm. It matches what you''re looking for.',
      NEW.listing_id);
  END LOOP;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS notify_housing_matches ON public.housing_listings;
CREATE TRIGGER notify_housing_matches AFTER INSERT ON public.housing_listings
  FOR EACH ROW EXECUTE FUNCTION private.notify_housing_matches();

-- A listing that goes (deleted by its author, removed by our team, or by the
-- clean-up): the notifications pointing at it go too.
CREATE OR REPLACE FUNCTION private.forget_housing_notifications()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.notifications n WHERE n.reference_id = OLD.listing_id AND n.type = 'housing_match';
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS forget_housing_notifications ON public.housing_listings;
CREATE TRIGGER forget_housing_notifications AFTER DELETE ON public.housing_listings
  FOR EACH ROW EXECUTE FUNCTION private.forget_housing_notifications();

-- For a listing's author: the active looking posts their listing fits
-- (newest first, at most 50), with their authors (id, name, avatar_url),
-- so they can message them. Not posts of members other members don't see,
-- nor of members who blocked the author or whom the author blocked. Only
-- the listing's author, while they can take part.
CREATE OR REPLACE FUNCTION public.housing_matches(p_listing UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := auth.uid();
  l public.housing_listings;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_active_member() THEN
    RAISE EXCEPTION 'Only members our team has approved can see who is looking for a place.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO l FROM public.housing_listings h WHERE h.listing_id = p_listing;
  IF l.listing_id IS NULL OR l.user_id <> me THEN
    RAISE EXCEPTION 'Only the member who posted this listing can see who is looking for a place like it.'
      USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'id', w.id, 'user_id', w.user_id, 'name', p.name, 'avatar_url', p.avatar_url, 'kinds', to_jsonb(w.kinds),
        'city', w.city, 'date_from', w.date_from, 'date_to', w.date_to, 'max_rent', w.max_rent,
        'furnished', w.furnished, 'anmeldung', w.anmeldung, 'note', w.note, 'created_at', w.created_at)
      ORDER BY w.created_at DESC)
    FROM (SELECT x.* FROM public.housing_wanted x
          WHERE x.active AND x.expires_on >= private.today_in_germany() AND x.user_id <> me
            AND private.housing_fits(l, x) AND private.is_listed_member(x.user_id)
            AND NOT private.is_blocked_between(me, x.user_id)
          ORDER BY x.created_at DESC LIMIT 50) w
    JOIN public.profiles p ON p.id = w.user_id), '[]'::jsonb);
END;
$$;

-- For the site: whether the housing search is there (this update), whether
-- the member can take part, and how many listings and looking posts they
-- can still post in the next 30 days. { version, can_take_part,
-- listing_limit, listings_left, looking_limit, looking_left }.
CREATE OR REPLACE FUNCTION public.housing_status()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('version', '2026-10-30', 'can_take_part', private.is_active_member(),
    'listing_limit', 10,
    'listings_left', GREATEST(0, 10 - (SELECT count(*) FROM private.housing_post_log l
                                        WHERE l.member_id = me AND l.kind = 'listing' AND l.at > NOW() - INTERVAL '30 days')),
    'looking_limit', 5,
    'looking_left', GREATEST(0, 5 - (SELECT count(*) FROM private.housing_post_log l
                                      WHERE l.member_id = me AND l.kind = 'looking' AND l.at > NOW() - INTERVAL '30 days')));
END;
$$;

-- ============================================================================
-- "DOWNLOAD MY DATA"
-- ============================================================================

-- As on 2026-10-27, plus the details of the member's housing listings (the
-- listings themselves are under marketplace_listings), their looking posts
-- and when they posted them (the counts behind the limits).
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
  ) || jsonb_build_object(
    'housing_listings', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.housing_listings x WHERE x.user_id = uid), '[]'::jsonb),
    'housing_looking_posts', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.housing_wanted x WHERE x.user_id = uid), '[]'::jsonb),
    'housing_post_log', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', l.kind, 'at', l.at) ORDER BY l.at)
      FROM private.housing_post_log l WHERE l.member_id = uid), '[]'::jsonb)
  );
END;
$$;

-- ============================================================================
-- EXPIRY AND CLEAN-UP
-- ============================================================================

-- Every night (the periods are the Privacy Policy's, RETENTION in
-- src/content/legal/privacy.js): housing listings past their last day leave
-- the Market (status 'expired'); 30 days after it they are deleted, with
-- their Market listing, unless renewed or given new dates; looking posts 30
-- days after their last day; the counts behind the limits after 30 days.
-- Its own job, so private.daily_cleanup stays as it is. Returns what it did.
CREATE OR REPLACE FUNCTION private.housing_cleanup()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  today DATE := private.today_in_germany();
  expired INTEGER;
  listings INTEGER;
  looking INTEGER;
  counts INTEGER;
BEGIN
  WITH x AS (
    UPDATE public.marketplace m SET status = 'expired'
    FROM public.housing_listings h
    WHERE h.listing_id = m.id AND h.expires_on < today AND m.status = 'active'
    RETURNING 1)
  SELECT count(*) INTO expired FROM x;
  WITH x AS (
    DELETE FROM public.marketplace m USING public.housing_listings h
    WHERE h.listing_id = m.id AND h.expires_on < today - 30
    RETURNING 1)
  SELECT count(*) INTO listings FROM x;
  WITH x AS (
    DELETE FROM public.housing_wanted w WHERE w.expires_on < today - 30 RETURNING 1)
  SELECT count(*) INTO looking FROM x;
  WITH x AS (
    DELETE FROM private.housing_post_log l WHERE l.at < NOW() - INTERVAL '30 days' RETURNING 1)
  SELECT count(*) INTO counts FROM x;
  RETURN jsonb_build_object('housing_listings_expired', expired, 'housing_listings_deleted', listings,
    'housing_looking_posts_deleted', looking, 'housing_post_log', counts);
END;
$$;

-- Runs private.housing_cleanup() every night at 03:53 (UTC) with pg_cron,
-- as private.schedule_profile_reminders_cleanup does for its clean-up.
-- Says what it did. Safe to run again (the job keeps its name):
-- SELECT private.schedule_housing_cleanup();
-- Stop it with: SELECT cron.unschedule('nriclub-housing-cleanup');
CREATE OR REPLACE FUNCTION private.schedule_housing_cleanup()
RETURNS TEXT LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name = 'pg_cron') THEN
      RETURN 'not scheduled: this database has no pg_cron. Run SELECT private.housing_cleanup(); by hand once a day.';
    END IF;
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
    EXCEPTION WHEN OTHERS THEN
      RETURN 'not scheduled: pg_cron could not be enabled (' || SQLERRM || '). Enable it under Database → Extensions, then run SELECT private.schedule_housing_cleanup();';
    END;
  END IF;
  BEGIN
    EXECUTE 'SELECT cron.schedule($1, $2, $3)'
      USING 'nriclub-housing-cleanup', '53 3 * * *', 'SELECT private.housing_cleanup()';
  EXCEPTION WHEN OTHERS THEN
    RETURN 'not scheduled: ' || SQLERRM;
  END;
  RETURN 'scheduled: private.housing_cleanup() runs every night at 03:53 UTC (pg_cron job nriclub-housing-cleanup)';
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

REVOKE ALL ON FUNCTION private.housing_kinds(), private.housing_kind_text(TEXT), private.housing_dates_text(DATE, DATE),
  private.housing_price_text(INTEGER), private.check_housing_listing(), private.check_housing_wanted(),
  private.take_housing_rate(TEXT, TEXT[]), private.housing_rate_limit(),
  private.housing_fits(public.housing_listings, public.housing_wanted), private.notify_housing_matches(),
  private.forget_housing_notifications() FROM PUBLIC;
-- The tables' checks, triggers and the two functions that post and change a
-- listing run as the member who writes.
GRANT EXECUTE ON FUNCTION private.housing_kinds(), private.housing_price_text(INTEGER), private.check_housing_listing(),
  private.check_housing_wanted(), private.take_housing_rate(TEXT, TEXT[]), private.housing_rate_limit(),
  private.notify_housing_matches(), private.forget_housing_notifications() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.housing_kind_text(TEXT), private.housing_dates_text(DATE, DATE),
  private.housing_fits(public.housing_listings, public.housing_wanted) TO service_role;
-- The clean-up: the database's job, and the service role by hand.
REVOKE ALL ON FUNCTION private.housing_cleanup(), private.schedule_housing_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.housing_cleanup() TO service_role;
-- Members only (each function checks who is asking).
REVOKE ALL ON FUNCTION public.post_housing_listing(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, INTEGER, INTEGER, INTEGER, BOOLEAN, BOOLEAN),
  public.update_housing_listing(UUID, TEXT, TEXT, DATE, DATE, INTEGER, INTEGER, INTEGER, BOOLEAN, BOOLEAN),
  public.renew_housing_listing(UUID),
  public.search_housing(TEXT[], TEXT, DATE, DATE, BOOLEAN, INTEGER, BOOLEAN, BOOLEAN, INTEGER),
  public.housing_matches(UUID), public.housing_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_housing_listing(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, INTEGER, INTEGER, INTEGER, BOOLEAN, BOOLEAN),
  public.update_housing_listing(UUID, TEXT, TEXT, DATE, DATE, INTEGER, INTEGER, INTEGER, BOOLEAN, BOOLEAN),
  public.renew_housing_listing(UUID),
  public.search_housing(TEXT[], TEXT, DATE, DATE, BOOLEAN, INTEGER, BOOLEAN, BOOLEAN, INTEGER),
  public.housing_matches(UUID), public.housing_status() TO authenticated;

-- The nightly clean-up (the result shows in the SQL editor's messages).
DO $$
BEGIN
  RAISE NOTICE 'NRIClub housing clean-up: %', private.schedule_housing_cleanup();
END $$;
