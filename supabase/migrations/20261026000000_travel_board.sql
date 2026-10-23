-- ============================================================================
-- NRIclub: the travel board, "Flying to or from India" (2026-10-26)
--
--   * Members our team has approved post trips between their city abroad and
--     India (public.travel_posts), to find a travel companion (for example
--     for parents flying alone) or someone to carry documents or a small open
--     item as a favour. "I'm travelling" (kind 'offer'): the day of the
--     flight, the flight number if they like, and what they can help with.
--     "I need help" (kind 'request'): a window of up to 120 days and what
--     they need. A short note with each. The author can edit a post (not its
--     kind) and delete it. Dates can't be in the past or more than a year
--     ahead.
--   * The board's rules: a member ticks them once, before their first post
--     or message from the board (public.accept_travel_rules, kept in
--     private.travel_rules_ack with the rules' version; the site asks with
--     public.travel_rules_status). The INSERT policy needs it, and so does a
--     message tagged with a trip ("[TRAVEL: ...]", a trigger on messages).
--   * Approved members see the posts whose last date hasn't passed (in
--     Germany), except those of members they blocked or who blocked them,
--     and of accounts other members don't see (blocked, under review).
--     Signed-out visitors and members waiting for our check see none.
--   * Matching: the same route (city names compared without case, extra
--     spaces and a few other spellings, private.travel_city_key, the same as
--     cityKey in src/content/travel.js), dates that overlap and at least one
--     kind of help in common. When a post goes up, the authors of open posts
--     of the other kind that match get an in-app notification
--     ('travel_match', pointing at the new post): at most 20 per post, and
--     none between members who blocked each other.
--   * Limits: 5 posts a day and 20 in 30 days per member (private.rate_limit).
--   * Reports: travel posts can be reported like other content
--     (reports.content_type 'travel'). Our team removes one with
--     public.admin_moderate, which keeps the record and tells the author
--     why.
--   * Clean-up (private.daily_cleanup): the 2026-10-25 version plus travel
--     posts 30 days after their last date; the counts behind the 30-day limit
--     are kept 30 days.
--   * "Download my data" also has the member's travel posts and when they
--     accepted the rules.
--   * Terms of Use version 2026-10-23 (the travel board's rules in section 7,
--     travel posts in section 9): private.current_terms_version(). As
--     section 14 of the Terms says, members who accepted 2026-10-19 keep
--     taking part under it until they accept the new version
--     (private.previous_terms_version, private.is_verified_member); the
--     site asks them each time they open NRIClub, and they can say "Later".
--     Posting on the travel board, and a first message from it, need the
--     new version (private.has_current_terms).
-- Needs all earlier migrations (up to 20261025100000_admin_tools.sql).
-- Can be run again: it replaces what it made the first time.
-- Existing rows: none change. reports.content_type and notifications.type
-- accept one more value each ('travel', 'travel_match').
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('private.inbox_messages') IS NULL THEN
    RAISE EXCEPTION 'Run the round 3 update (up to 20261025100000_admin_tools.sql) first.';
  END IF;
END;
$$;

-- ============================================================================
-- TERMS OF USE 2026-10-23
-- ============================================================================

-- The version of the Terms of Use members accept now (replaces 2026-10-19,
-- which is at nriclub.app/terms/2026-10-19). The site shows this version's
-- text (TERMS_VERSION in src/content/legal/terms.js and
-- src/member/LegalModals.jsx) and asks public.current_terms_version() which
-- version to accept, so it can go live before this update: until then
-- members keep accepting 2026-10-19. public.accept_terms records only the
-- version this function names.
CREATE OR REPLACE FUNCTION private.current_terms_version()
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '2026-10-23'::text;
$$;

-- The version before it. New Terms apply to a member only once they accept
-- them; until then the Terms they accepted keep applying, and NRIClub asks
-- each time they open it (Terms section 14). So members who accepted this
-- version still take part (private.is_verified_member below), and the site
-- lets them answer "Later". Only the travel board, whose rules are in the
-- new section 7, needs the current version (private.has_current_terms).
-- Members on an even earlier version (2026-10, before the Art. 9 consent)
-- still accept the current one first. Before the next version replaces
-- 2026-10-19 here, members still on it must have accepted a later one or
-- had their membership ended with 4 weeks' notice (section 12); otherwise
-- they would be locked out.
CREATE OR REPLACE FUNCTION private.previous_terms_version()
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '2026-10-19'::text;
$$;

-- For the site: the version before the current one, which members may still
-- be on. Anyone may ask, like public.current_terms_version().
CREATE OR REPLACE FUNCTION public.previous_terms_version()
RETURNS TEXT LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT private.previous_terms_version();
$$;

-- Whether the signed-in member has accepted the current version.
CREATE OR REPLACE FUNCTION private.has_current_terms()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_private
    WHERE id = (SELECT auth.uid()) AND terms_accepted_at IS NOT NULL
      AND terms_version = private.current_terms_version()
  );
$$;

-- Members who may see other members and take part (replaces the 2026-10-19
-- version): not blocked, approved by an admin, 18 or older, accepted the
-- current Terms or the previous version, and gave the Art. 9 consent (a
-- consent the law requires, so there is no "later" for it).
-- private.is_active_member and private.can_browse, and with them every
-- policy that lets a member see or do something, go through this.
CREATE OR REPLACE FUNCTION private.is_verified_member()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_private
    WHERE id = (SELECT auth.uid()) AND status = 'active' AND verification_status = 'approved'
      AND age_confirmed_at IS NOT NULL AND terms_accepted_at IS NOT NULL
      AND terms_version IN (private.current_terms_version(), private.previous_terms_version())
      AND art9_consent_at IS NOT NULL
  );
$$;

-- ============================================================================
-- CITIES, DATES AND KINDS OF HELP
-- ============================================================================

-- A city's name for matching routes: the part before a comma, without case,
-- extra spaces or a part in brackets, with ä, ö, ü and ß written out, and a
-- few other names of the same city made one ("New Delhi" is "delhi",
-- "München" and "Muenchen" are "munich"). The same as cityKey and
-- CITY_ALIASES in src/content/travel.js: change both together
-- (supabase/tests/rls_test.py compares them), and in the same migration run
-- UPDATE public.travel_posts SET from_city = from_city; so the keys stored
-- with the posts (from_key, to_key) follow.
CREATE OR REPLACE FUNCTION private.travel_city_key(p_city TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE k
    WHEN 'new delhi' THEN 'delhi'
    WHEN 'bangalore' THEN 'bengaluru'
    WHEN 'bombay' THEN 'mumbai'
    WHEN 'calcutta' THEN 'kolkata'
    WHEN 'madras' THEN 'chennai'
    WHEN 'cochin' THEN 'kochi'
    WHEN 'trivandrum' THEN 'thiruvananthapuram'
    WHEN 'calicut' THEN 'kozhikode'
    WHEN 'vizag' THEN 'visakhapatnam'
    WHEN 'gurgaon' THEN 'gurugram'
    WHEN 'muenchen' THEN 'munich'
    WHEN 'munchen' THEN 'munich'
    WHEN 'koeln' THEN 'cologne'
    WHEN 'koln' THEN 'cologne'
    WHEN 'frankfurt am main' THEN 'frankfurt'
    WHEN 'frankfurt/main' THEN 'frankfurt'
    WHEN 'frankfurt a.m.' THEN 'frankfurt'
    WHEN 'dusseldorf' THEN 'duesseldorf'
    WHEN 'nuernberg' THEN 'nuremberg'
    WHEN 'nurnberg' THEN 'nuremberg'
    WHEN 'wien' THEN 'vienna'
    WHEN 'zurich' THEN 'zuerich'
    ELSE k END
  FROM (SELECT btrim(regexp_replace(regexp_replace(
      replace(replace(replace(replace(lower(translate(split_part(COALESCE(p_city, ''), ',', 1), 'ÄÖÜ', 'äöü')),
        'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
      '\s*\(.*\)\s*$', ''), '\s+', ' ', 'g')) AS k) x;
$$;

-- A city as members may write it: 2 to 60 characters, starting with a
-- letter, without digits or symbols other than . , ' ’ ( ) / -, and nothing
-- like a web address ("pay-courier.com": a dot followed by two letters).
-- Names in notifications stay names. (cityProblem in src/content/travel.js
-- says the same.)
CREATE OR REPLACE FUNCTION private.travel_city_ok(p_city TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT p_city IS NOT NULL AND char_length(p_city) BETWEEN 2 AND 60 AND p_city ~ '^[[:alpha:]]'
    AND translate(p_city, '0123456789!"#$%&*+:;<=>?@[\]^_`{|}~', '') = p_city
    AND p_city !~ '\.[[:alpha:]]{2}';
$$;

-- "12 Dec 2026", "10–20 Dec 2026", "28 Dec 2026–5 Jan 2027".
CREATE OR REPLACE FUNCTION private.travel_dates_text(p_from DATE, p_to DATE)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_from = p_to THEN to_char(p_from, 'FMDD Mon YYYY')
    WHEN date_trunc('month', p_from) = date_trunc('month', p_to) THEN to_char(p_from, 'FMDD') || '–' || to_char(p_to, 'FMDD Mon YYYY')
    WHEN date_trunc('year', p_from) = date_trunc('year', p_to) THEN to_char(p_from, 'FMDD Mon') || '–' || to_char(p_to, 'FMDD Mon YYYY')
    ELSE to_char(p_from, 'FMDD Mon YYYY') || '–' || to_char(p_to, 'FMDD Mon YYYY') END;
$$;

-- The help in a notification: what a traveller can do ('offer': "be a
-- travel companion and carry documents") or what a member is looking for
-- ('request': "someone to carry documents and a small open item").
CREATE OR REPLACE FUNCTION private.travel_help_text(p_help TEXT[], p_kind TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN companion IS NOT NULL AND carry IS NOT NULL
              THEN companion || CASE WHEN carry LIKE '% and %' THEN ', ' ELSE ' and ' END || carry
              ELSE COALESCE(companion, carry) END
  FROM (SELECT
    CASE WHEN 'companion' = ANY (p_help) THEN
      CASE WHEN p_kind = 'offer' THEN 'be a travel companion' ELSE 'a travel companion' END END AS companion,
    CASE WHEN p_help && ARRAY['documents', 'items']::TEXT[] THEN
      CASE WHEN p_kind = 'offer' THEN 'carry ' ELSE 'someone to carry ' END
      || concat_ws(' and ', CASE WHEN 'documents' = ANY (p_help) THEN 'documents' END,
                            CASE WHEN 'items' = ANY (p_help) THEN
                              CASE WHEN p_kind = 'offer' THEN 'small open items' ELSE 'a small open item' END END) END AS carry) x;
$$;

-- ============================================================================
-- THE BOARD'S RULES
-- ============================================================================

-- The version of the rules the site shows (TRAVEL_RULES_VERSION in
-- src/content/travel.js). Change both when the rules change: members then
-- tick them again before their next post.
CREATE OR REPLACE FUNCTION private.travel_rules_version()
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT '2026-10-26'::TEXT;
$$;

-- When a member ticked the rules, and which version. Deleted with the
-- account. Only the database reads it (public.travel_rules_status).
CREATE TABLE IF NOT EXISTS private.travel_rules_ack (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  rules_version TEXT NOT NULL CHECK (char_length(rules_version) <= 40),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE private.travel_rules_ack ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.travel_rules_ack FROM PUBLIC, anon, authenticated;

-- Whether the signed-in member has ticked the current rules.
CREATE OR REPLACE FUNCTION private.has_travel_rules()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM private.travel_rules_ack a
                 WHERE a.user_id = (SELECT auth.uid()) AND a.rules_version = private.travel_rules_version());
$$;

-- For the site: { version: the current rules, accepted: whether the member
-- ticked them, accepted_version, accepted_at }.
CREATE OR REPLACE FUNCTION public.travel_rules_status()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'version', private.travel_rules_version(),
    'accepted', COALESCE(a.rules_version = private.travel_rules_version(), FALSE),
    'accepted_version', a.rules_version,
    'accepted_at', a.accepted_at)
  FROM (SELECT 1) one LEFT JOIN private.travel_rules_ack a ON a.user_id = (SELECT auth.uid());
$$;

-- The member ticked the rules (p_version: the version they read). Only
-- members who can take part; ticking the same version again keeps the first
-- time. Returns travel_rules_status().
CREATE OR REPLACE FUNCTION public.accept_travel_rules(p_version TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_active_member() THEN
    RAISE EXCEPTION 'Only members our team has approved can use the travel board.' USING ERRCODE = '42501';
  END IF;
  IF p_version IS DISTINCT FROM private.travel_rules_version() THEN
    RAISE EXCEPTION 'The travel board''s rules have changed. Please reload the page and read them again.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO private.travel_rules_ack AS a (user_id, rules_version, accepted_at) VALUES (uid, p_version, NOW())
  ON CONFLICT (user_id) DO UPDATE SET rules_version = EXCLUDED.rules_version, accepted_at = EXCLUDED.accepted_at
  WHERE a.rules_version IS DISTINCT FROM EXCLUDED.rules_version;
  RETURN public.travel_rules_status();
END;
$$;

-- ============================================================================
-- TRAVEL POSTS
-- ============================================================================

-- kind: 'offer' ("I'm travelling": date_from is the day of the flight, and
-- date_to the same day) or 'request' ("I need help": the earliest and the
-- latest date). from_key / to_key: the cities for matching. flight: e.g.
-- "LH 760", offers only, may be empty. help: one or more of 'companion'
-- (a travel companion), 'documents' and 'items' (small open items): what
-- the traveller can help with, or what the member needs.
CREATE TABLE IF NOT EXISTS public.travel_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('offer', 'request')),
  from_city TEXT NOT NULL CHECK (private.travel_city_ok(from_city)),
  to_city TEXT NOT NULL CHECK (private.travel_city_ok(to_city)),
  from_key TEXT GENERATED ALWAYS AS (private.travel_city_key(from_city)) STORED,
  to_key TEXT GENERATED ALWAYS AS (private.travel_city_key(to_city)) STORED,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  flight TEXT NOT NULL DEFAULT '' CHECK (flight = '' OR flight ~ '^[A-Z0-9]{2,3} ?[0-9]{1,4}[A-Z]?$'),
  help TEXT[] NOT NULL CHECK (cardinality(help) BETWEEN 1 AND 3 AND help <@ ARRAY['companion', 'documents', 'items']::TEXT[]),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT travel_posts_dates CHECK (date_to >= date_from AND date_to - date_from <= 120),
  CONSTRAINT travel_posts_offer_one_day CHECK (kind = 'request' OR date_to = date_from),
  CONSTRAINT travel_posts_flight_offers CHECK (kind = 'offer' OR flight = ''),
  CONSTRAINT travel_posts_route CHECK (from_key <> to_key)
);
CREATE INDEX IF NOT EXISTS idx_travel_posts_route ON public.travel_posts (from_key, to_key, date_to);
CREATE INDEX IF NOT EXISTS idx_travel_posts_user ON public.travel_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_travel_posts_date_to ON public.travel_posts (date_to);

-- Before a post is saved: spaces tidied, the flight number in capitals, the
-- kinds of help each once, an offer's last date its first; and the rules in
-- plain words (the table's checks stay as the last word). For members (an
-- API request), the dates mustn't have passed (in Germany) or be more than a
-- year ahead: on a new post, and on an edited one whose dates change (a
-- request whose window has begun can still move its latest date). A post's
-- id, author, kind and creation time stay as they are.
CREATE OR REPLACE FUNCTION private.check_travel_post()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  today DATE := private.today_in_germany();
  member BOOLEAN := current_user = 'authenticated';
BEGIN
  -- The board's rules are in the Terms 2026-10-23 (section 7): a member
  -- still on the previous version accepts them first. (In so many words
  -- here; the INSERT policy checks it too.)
  IF TG_OP = 'INSERT' AND member AND private.is_active_member() AND NOT private.has_current_terms() THEN
    RAISE EXCEPTION 'Please accept the updated Terms of Use to use the travel board.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.kind IS NULL OR NEW.kind NOT IN ('offer', 'request') THEN
    RAISE EXCEPTION 'Please choose "I''m travelling" or "I need help".' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.kind IS DISTINCT FROM OLD.kind THEN
      RAISE EXCEPTION 'A post''s type can''t be changed. Delete it and post a new one.' USING ERRCODE = 'P0001';
    END IF;
    NEW.id := OLD.id;
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
  ELSIF member THEN
    NEW.created_at := NOW();
  END IF;
  NEW.updated_at := NOW();
  NEW.from_city := btrim(regexp_replace(COALESCE(NEW.from_city, ''), '\s+', ' ', 'g'));
  NEW.to_city := btrim(regexp_replace(COALESCE(NEW.to_city, ''), '\s+', ' ', 'g'));
  NEW.flight := upper(btrim(regexp_replace(COALESCE(NEW.flight, ''), '\s+', ' ', 'g')));
  NEW.note := btrim(COALESCE(NEW.note, ''));
  NEW.help := ARRAY(SELECT DISTINCT h FROM unnest(COALESCE(NEW.help, '{}'::TEXT[])) h ORDER BY h);
  IF NEW.kind = 'offer' THEN
    NEW.date_to := NEW.date_from;
  ELSE
    NEW.flight := '';
  END IF;

  IF NEW.from_city = '' OR NEW.to_city = '' THEN
    RAISE EXCEPTION 'Please say which city you fly from and which city you fly to.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT private.travel_city_ok(NEW.from_city) OR NOT private.travel_city_ok(NEW.to_city) THEN
    RAISE EXCEPTION 'Please write each city''s name in letters (2 to 60 characters, no numbers).' USING ERRCODE = 'P0001';
  END IF;
  IF private.travel_city_key(NEW.from_city) = private.travel_city_key(NEW.to_city) THEN
    RAISE EXCEPTION 'The two cities are the same. Please check where you fly from and to.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.date_from IS NULL OR NEW.date_to IS NULL THEN
    RAISE EXCEPTION 'Please choose the date.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.date_to < NEW.date_from THEN
    RAISE EXCEPTION 'The latest date is before the earliest. Please check the dates.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.date_to - NEW.date_from > 120 THEN
    RAISE EXCEPTION 'The earliest and the latest date can be at most 120 days apart.' USING ERRCODE = 'P0001';
  END IF;
  IF member AND (TG_OP = 'INSERT' OR NEW.date_from IS DISTINCT FROM OLD.date_from OR NEW.date_to IS DISTINCT FROM OLD.date_to) THEN
    IF NEW.date_to < today OR (NEW.date_from < today AND (TG_OP = 'INSERT' OR NEW.date_from IS DISTINCT FROM OLD.date_from)) THEN
      RAISE EXCEPTION 'That date has passed. Please choose today or a later date.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.date_from > today + 365 OR NEW.date_to > today + 365 THEN
      RAISE EXCEPTION 'Please choose a date within the next 12 months.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NEW.flight <> '' AND NEW.flight !~ '^[A-Z0-9]{2,3} ?[0-9]{1,4}[A-Z]?$' THEN
    RAISE EXCEPTION 'Please write the flight number like LH 760, or leave it empty.' USING ERRCODE = 'P0001';
  END IF;
  IF cardinality(NEW.help) = 0 THEN
    RAISE EXCEPTION '%', CASE WHEN NEW.kind = 'offer' THEN 'Please choose what you can help with.'
                              ELSE 'Please choose what you need.' END USING ERRCODE = 'P0001';
  END IF;
  IF NOT NEW.help <@ ARRAY['companion', 'documents', 'items']::TEXT[] THEN
    RAISE EXCEPTION 'Please choose a travel companion, documents or small open items.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(NEW.note) > 500 THEN
    RAISE EXCEPTION 'Please keep the note to 500 characters.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS check_travel_post ON public.travel_posts;
CREATE TRIGGER check_travel_post BEFORE INSERT OR UPDATE ON public.travel_posts
  FOR EACH ROW EXECUTE FUNCTION private.check_travel_post();

-- 5 posts a day and 20 in 30 days. (Deleting a post doesn't give another
-- try; the clean-up keeps these counts for 30 days.)
DROP TRIGGER IF EXISTS rate_limit ON public.travel_posts;
CREATE TRIGGER rate_limit BEFORE INSERT ON public.travel_posts
  FOR EACH ROW EXECUTE FUNCTION private.rate_limit('travel_post', '5', '1 day', '20', '30 days');

-- Who sees what. The author always sees their own posts; admins see all
-- (to deal with reports). Other members who can take part see the posts
-- whose last date hasn't passed, of members who are shown, unless one of
-- the two blocked the other. Only members who can take part, have accepted
-- the current Terms and have ticked the current rules post; only the author
-- edits (while they can take part) and deletes. Our team removes posts through public.admin_moderate.
ALTER TABLE public.travel_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.travel_posts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.travel_posts TO authenticated;
GRANT ALL ON public.travel_posts TO service_role;

DROP POLICY IF EXISTS "Members see current travel posts" ON public.travel_posts;
CREATE POLICY "Members see current travel posts" ON public.travel_posts
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())
         OR (SELECT private.is_admin())
         OR ((SELECT private.is_active_member())
             AND date_to >= (SELECT private.today_in_germany())
             AND private.is_listed_member(user_id)
             AND NOT private.is_blocked_between((SELECT auth.uid()), user_id)));

DROP POLICY IF EXISTS "Members post trips once they ticked the rules" ON public.travel_posts;
CREATE POLICY "Members post trips once they ticked the rules" ON public.travel_posts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT private.is_active_member()) AND (SELECT private.has_current_terms())
              AND (SELECT private.has_travel_rules()));

DROP POLICY IF EXISTS "Authors edit their travel posts" ON public.travel_posts;
CREATE POLICY "Authors edit their travel posts" ON public.travel_posts
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT private.is_active_member()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT private.is_active_member()));

DROP POLICY IF EXISTS "Authors delete their travel posts" ON public.travel_posts;
CREATE POLICY "Authors delete their travel posts" ON public.travel_posts
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ============================================================================
-- MATCHES
-- ============================================================================

-- One more kind of notification: a new post that matches one of yours.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check,
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'like', 'comment', 'request', 'event', 'group', 'trending', 'message', 'verification',
    'answer', 'thanks', 'best', 'rsvp', 'urgent', 'member',
    'booking', 'booking_cancelled', 'review',
    'moderation', 'report', 'alert',
    'travel_match'));

-- A new post: the authors of open posts of the other kind on the same route,
-- with dates that overlap and help in common, hear about it (pointing at the
-- new post), the closest dates first, at most 20 members, each once. Not
-- members who can't take part, nor between members who blocked each other
-- (private.notify checks both again). Editing a post notifies nobody.
CREATE OR REPLACE FUNCTION private.notify_travel_matches()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m RECORD;
  common TEXT[];
BEGIN
  FOR m IN
    SELECT x.user_id, x.help FROM (
      SELECT DISTINCT ON (t.user_id) t.user_id, t.help, t.created_at, abs(t.date_from - NEW.date_from) AS gap
      FROM public.travel_posts t
      WHERE t.kind <> NEW.kind AND t.from_key = NEW.from_key AND t.to_key = NEW.to_key
        AND t.date_from <= NEW.date_to AND t.date_to >= NEW.date_from
        AND t.date_to >= private.today_in_germany()
        AND t.help && NEW.help AND t.user_id <> NEW.user_id
        AND private.gets_notifications(t.user_id)
        AND NOT private.is_blocked_between(t.user_id, NEW.user_id)
      ORDER BY t.user_id, abs(t.date_from - NEW.date_from), t.created_at DESC) x
    ORDER BY x.gap, x.created_at DESC
    LIMIT 20
  LOOP
    -- The help both posts have in common.
    common := ARRAY(SELECT unnest(NEW.help) INTERSECT SELECT unnest(m.help));
    PERFORM private.notify(m.user_id, 'travel_match', NEW.user_id,
      CASE WHEN NEW.kind = 'offer'
        THEN 'is flying ' || NEW.from_city || ' → ' || NEW.to_city || ' on ' || private.travel_dates_text(NEW.date_from, NEW.date_to)
             || ' and can ' || private.travel_help_text(common, 'offer') || '. This matches your request on the travel board.'
        ELSE 'is looking for ' || private.travel_help_text(common, 'request') || ' on ' || NEW.from_city || ' → ' || NEW.to_city
             || ', ' || private.travel_dates_text(NEW.date_from, NEW.date_to) || '. This matches your trip on the travel board.' END,
      NEW.id);
  END LOOP;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS notify_travel_matches ON public.travel_posts;
CREATE TRIGGER notify_travel_matches AFTER INSERT ON public.travel_posts
  FOR EACH ROW EXECUTE FUNCTION private.notify_travel_matches();

-- A first message from the board starts with the trip it's about
-- ("[TRAVEL: Frankfurt → Delhi, 12 Dec] ...", travelTag in
-- src/content/travel.js): it needs the current Terms accepted and the
-- board's rules ticked, as a post does.
CREATE OR REPLACE FUNCTION private.check_travel_message()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user = 'authenticated' AND NOT private.has_current_terms() THEN
    RAISE EXCEPTION 'Please accept the updated Terms of Use to use the travel board.' USING ERRCODE = 'P0001';
  END IF;
  IF current_user = 'authenticated' AND NOT private.has_travel_rules() THEN
    RAISE EXCEPTION 'Please read and tick the travel board''s rules first.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS check_travel_message ON public.messages;
CREATE TRIGGER check_travel_message BEFORE INSERT ON public.messages
  FOR EACH ROW WHEN (NEW.content LIKE '[TRAVEL:%') EXECUTE FUNCTION private.check_travel_message();

-- A deleted post: the notifications pointing at it go too.
CREATE OR REPLACE FUNCTION private.forget_travel_notifications()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.notifications n WHERE n.reference_id = OLD.id AND n.type = 'travel_match';
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS forget_travel_notifications ON public.travel_posts;
CREATE TRIGGER forget_travel_notifications AFTER DELETE ON public.travel_posts
  FOR EACH ROW EXECUTE FUNCTION private.forget_travel_notifications();

-- ============================================================================
-- REPORTS AND MODERATION
-- ============================================================================

-- Travel posts can be reported ('travel'), as the other content.
ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_content_type_check,
  ADD CONSTRAINT reports_content_type_check CHECK (content_type IN (
    'post', 'comment', 'answer', 'doc', 'doc_comment', 'event', 'help', 'market', 'review', 'place', 'message',
    'profile', 'feedback', 'travel'));

-- As in 2026-10-21, plus travel posts.
CREATE OR REPLACE FUNCTION private.content_noun(p_kind TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_kind
    WHEN 'post' THEN 'post' WHEN 'comment' THEN 'comment' WHEN 'answer' THEN 'answer'
    WHEN 'doc' THEN 'guide' WHEN 'doc_comment' THEN 'comment on a guide' WHEN 'event' THEN 'event'
    WHEN 'help' THEN 'question' WHEN 'market' THEN 'Market listing' WHEN 'review' THEN 'mentoring review'
    WHEN 'place' THEN 'place' WHEN 'place_recommendation' THEN 'recommendation' WHEN 'message' THEN 'message'
    WHEN 'travel' THEN 'travel post'
    WHEN 'profile_photo' THEN 'profile photo' WHEN 'profile_bio' THEN 'profile bio' WHEN 'profile' THEN 'profile'
    ELSE 'content' END;
$$;

-- As in 2026-10-21, plus "[TRAVEL]".
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
    WHEN upper(p_reason) LIKE '[USER]%' OR upper(p_reason) LIKE '[PROFILE]%' THEN 'profile'
    WHEN upper(p_reason) LIKE '[POST]%' THEN 'post'
    WHEN p_user IS NOT NULL AND p_post IS NULL THEN 'profile'
    ELSE 'post' END;
$$;

-- As in 2026-10-21, plus travel posts.
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
  END;
$$;

-- As in 2026-10-21, plus travel posts ('the travel post "Frankfurt → Delhi"').
CREATE OR REPLACE FUNCTION private.report_item(p_kind TEXT, p_id UUID, p_user UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN p_kind = 'profile' THEN COALESCE('the member ' || NULLIF((SELECT p.name FROM public.profiles p WHERE p.id = p_user), ''), 'a member')
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

-- As in 2026-10-21, plus travel posts (p_kind 'travel': remove or warn).
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
     'review', 'place', 'travel', 'message', 'place_recommendation', 'profile_photo', 'profile_bio', 'member') THEN
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
      WHEN 'message' THEN SELECT to_jsonb(x), x.sender_id, x.conversation_id INTO row_json, author, convo FROM public.messages x WHERE x.id = p_id FOR UPDATE;
    END CASE;
    -- Admins can't read messages: only one that was reported can be acted on.
    IF p_kind = 'message' AND NOT EXISTS (
      SELECT 1 FROM public.reports r WHERE r.content_type = 'message' AND r.reported_post_id = p_id) THEN
      RAISE EXCEPTION 'Only a message someone reported can be removed.' USING ERRCODE = '42501';
    END IF;
    what_text := 'your ' || private.content_noun(p_kind)
      || COALESCE(' "' || NULLIF(private.snippet(COALESCE(
           CASE WHEN p_kind = 'travel' THEN (row_json ->> 'from_city') || ' → ' || (row_json ->> 'to_city') END,
           row_json ->> 'title', row_json ->> 'name', row_json ->> 'content', row_json ->> 'comment', '')), '') || '"', '');
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
-- "DOWNLOAD MY DATA" AND CLEAN-UP
-- ============================================================================

-- As on 2026-10-24, plus the member's travel posts and when they ticked the
-- board's rules (and reports about their travel posts).
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
  );
END;
$$;

-- As on 2026-10-25, plus travel posts 30 days after their last date, and the
-- counts behind the travel board's 30-day limit kept 30 days. The periods
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
  travel INTEGER;
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
    || jsonb_build_object('travel_posts', travel);
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- The Terms: anyone may ask which versions apply, as with
-- current_terms_version (20261019000000_access_consent.sql); the policies and
-- triggers ask whether the member accepted the current one.
REVOKE ALL ON FUNCTION private.previous_terms_version(), public.previous_terms_version(), private.has_current_terms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.previous_terms_version(), public.previous_terms_version() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_current_terms() TO authenticated, service_role;

REVOKE ALL ON FUNCTION private.travel_city_key(TEXT), private.travel_city_ok(TEXT), private.travel_dates_text(DATE, DATE),
  private.travel_help_text(TEXT[], TEXT), private.travel_rules_version(), private.has_travel_rules(),
  private.check_travel_post(), private.check_travel_message(), private.notify_travel_matches(),
  private.forget_travel_notifications() FROM PUBLIC;
-- The table's generated columns, checks, triggers and policies run as the
-- member who writes or reads.
GRANT EXECUTE ON FUNCTION private.travel_city_key(TEXT), private.travel_city_ok(TEXT), private.travel_rules_version(),
  private.has_travel_rules(), private.check_travel_post(), private.check_travel_message(), private.notify_travel_matches(),
  private.forget_travel_notifications() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.travel_dates_text(DATE, DATE), private.travel_help_text(TEXT[], TEXT) TO service_role;
-- Members only (each function checks who is asking).
REVOKE ALL ON FUNCTION public.travel_rules_status(), public.accept_travel_rules(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.travel_rules_status(), public.accept_travel_rules(TEXT) TO authenticated;
