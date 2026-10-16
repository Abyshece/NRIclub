-- ============================================================================
-- NRIclub: notifications, limits and privacy (2026-10-20)
--
--   * Notifications about a like, a comment or a Namaste request are written
--     by the database itself, with its own wording. Members can't write
--     notifications any more (only admins can), so nobody can send another
--     member made-up text such as "NRIClub Security Team: your account will
--     be deleted". Liking, unliking and liking again notifies once; a second
--     comment updates the waiting notification; a Namaste request sent again
--     moves the earlier notification instead of adding another (C5).
--   * Names: invisible direction and zero-width characters are removed;
--     members can't call themselves NRIClub, Admin, Support, Moderator, Team,
--     Official or Staff; and a member can change their name 3 times in 30
--     days (C5).
--   * Limits on how often a member can do things, counted by the database:
--     messages (30 a minute, 500 a day), new conversations (20 a day),
--     Namaste requests (50 a day), comments, guide comments and answers (60
--     an hour each), posts, events, listings, guides and questions (20 a day
--     each), reports (20 a day; feedback 5 a day), group requests (5 a day)
--     and places (20 a day). The same report sent twice is kept once (C13).
--   * Public city pages: the city must be a city name (no search patterns),
--     events are matched by their city exactly, and counts of members and
--     events below 5 aren't given out. The admin city numbers match events
--     by city exactly too (C17).
--   * Less about members for other members (C18): when a member was last
--     active is kept with their private details (they and admins only); their
--     LinkedIn link is shown to other members only if they choose so in Edit
--     profile (profiles.linkedin_public), admins always see it; who
--     recommended which place (a temple, a doctor) is no longer shown, only
--     how many members did; and the unused settings profile_visibility and
--     online_status are removed.
--   * Clean-up (C20): private.daily_cleanup() deletes what the Privacy Policy
--     says is deleted after a time (src/content/legal/privacy.js, RETENTION),
--     and runs every night with pg_cron where the database has it. The
--     signup data Supabase Auth keeps is reduced to the name and country.
--   * "Download my data" also has the account (email, sign-up and sign-in
--     dates, signup data), sign-in sessions, reviews and reports about the
--     member, their photo files, urgent questions, name changes and a readme
--     pointing to the Privacy Policy (C21).
--   * The starter posts say hello@nriclub.app instead of support@ (C10).
-- Needs all earlier migrations (20261019000000_access_consent.sql included).
-- Existing rows: the like, comment and Namaste notifications members sent
-- stay; last_active moves from profiles to profile_private; names lose
-- invisible characters; signup data in auth.users keeps only the name and
-- country; contact addresses in member content become hello@nriclub.app.
-- ============================================================================

-- ============================================================================
-- NOTIFICATIONS THE DATABASE WRITES (C5)
-- ============================================================================

-- A member's text in one line for a notification: spaces and line breaks
-- collapsed, then shortened like a question's title.
CREATE FUNCTION private.snippet(p_text TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT private.short_title(btrim(regexp_replace(COALESCE(p_text, ''), '\s+', ' ', 'g')));
$$;

-- A like: the post's author hears about it. private.notify sends one per
-- member and post, so liking, unliking and liking again notifies once.
CREATE FUNCTION private.notify_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.notify(p.user_id, 'like', NEW.user_id,
    CASE WHEN private.snippet(p.content) = '' THEN 'liked your post'
         ELSE 'liked your post: ' || private.snippet(p.content) END,
    p.id)
  FROM public.posts p WHERE p.id = NEW.post_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER notify_like AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION private.notify_like();

-- Whether a member gets notifications about what other members do: as in
-- private.notify (2026-10-19), only approved, active members.
CREATE FUNCTION private.gets_notifications(p_member UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profile_private pp
                 WHERE pp.id = p_member AND pp.status = 'active' AND pp.verification_status = 'approved');
$$;

-- A comment: the post's author hears about it. While they haven't read the
-- notification, another comment by the same member on the same post updates
-- it (and moves it to the top) instead of adding another; once read, the
-- next comment notifies again.
CREATE FUNCTION private.notify_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  author UUID;
  msg TEXT := 'commented on your post: ' || private.snippet(NEW.content);
BEGIN
  SELECT p.user_id INTO author FROM public.posts p WHERE p.id = NEW.post_id;
  IF author IS NULL OR author = NEW.user_id OR private.is_blocked_between(NEW.user_id, author)
     OR NOT private.gets_notifications(author) THEN
    RETURN NULL;
  END IF;
  UPDATE public.notifications n SET text = msg, created_at = NOW()
  WHERE n.user_id = author AND n.type = 'comment' AND n.actor_id = NEW.user_id
    AND n.reference_id = NEW.post_id AND NOT n.read;
  IF NOT FOUND THEN
    DELETE FROM public.notifications n
    WHERE n.user_id = author AND n.type = 'comment' AND n.actor_id = NEW.user_id AND n.reference_id = NEW.post_id;
    PERFORM private.notify(author, 'comment', NEW.user_id, msg, NEW.post_id);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER notify_comment AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION private.notify_comment();

-- A Namaste request: the member asked hears about it. One notification per
-- pair of members: a request sent again (after it was withdrawn) moves the
-- earlier notification to the new request and shows it again, without a new
-- pop-up, so withdrawing and sending again can't flood anyone.
CREATE FUNCTION private.notify_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status <> 'pending' OR NOT private.gets_notifications(NEW.recipient_id)
     OR private.is_blocked_between(NEW.requester_id, NEW.recipient_id) THEN
    RETURN NULL;
  END IF;
  UPDATE public.notifications n SET reference_id = NEW.id, read = FALSE, created_at = NOW()
  WHERE n.user_id = NEW.recipient_id AND n.type = 'request' AND n.actor_id = NEW.requester_id;
  IF NOT FOUND THEN
    PERFORM private.notify(NEW.recipient_id, 'request', NEW.requester_id, 'sent you a Namaste request', NEW.id);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER notify_request AFTER INSERT ON public.connections
  FOR EACH ROW EXECUTE FUNCTION private.notify_request();

-- A deleted post takes its like and comment notifications with it (they
-- quote it, and lead nowhere once it's gone).
CREATE FUNCTION private.forget_post_notifications()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.notifications n WHERE n.reference_id = OLD.id AND n.type IN ('like', 'comment');
  RETURN NULL;
END;
$$;
CREATE TRIGGER forget_post_notifications AFTER DELETE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION private.forget_post_notifications();

-- Members can't write notifications any more: the database writes them
-- (above, and the triggers and functions of 2026-10-17 and 2026-10-18).
-- Admins can still write one, e.g. from the SQL editor.
DROP POLICY "Users can notify other members" ON public.notifications;
CREATE POLICY "Admins can notify members" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_admin()));

-- For the site, which goes live a little before this update: the kinds of
-- notification the database now writes itself, so the site stops sending
-- them. (Before this update the function doesn't exist and the site sends
-- them as it always did.)
CREATE FUNCTION public.server_notification_types()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY['like', 'comment', 'request']::TEXT[];
$$;

-- ============================================================================
-- NAMES (C5)
-- ============================================================================

-- When a member changed their own name (at most 3 times in 30 days). Rows
-- older than 30 days are deleted (here and by private.daily_cleanup), and
-- with the account. Only the database reads it.
CREATE TABLE private.name_changes (
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_name_changes_member ON private.name_changes (member_id, changed_at);
REVOKE ALL ON private.name_changes FROM PUBLIC, anon, authenticated;

-- A name without invisible characters: zero-width spaces and joiners, and
-- the direction marks and overrides that can make a name read differently
-- from what it is (U+200B-U+200F, U+202A-U+202E, U+2060-U+2069, U+061C,
-- U+FEFF); runs of spaces become one.
CREATE FUNCTION private.clean_name(p_name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(COALESCE(p_name, ''), '[​-‏‪-‮⁠-⁩؜﻿]', '', 'g'),
    '\s+', ' ', 'g'));
$$;

-- Names that sound like the NRIClub team: "NRIClub" (also "N.R.I. Club"),
-- or the words admin, administrator, support, moderator, moderation, team,
-- official, staff or helpdesk on their own (so "Steam" or "Badminton" are
-- fine).
CREATE FUNCTION private.is_reserved_name(p_name TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT COALESCE(p_name, '') ~* '(^|[^[:alpha:]])n[^[:alpha:]]*r[^[:alpha:]]*i[^[:alpha:]]*c[^[:alpha:]]*l[^[:alpha:]]*u[^[:alpha:]]*b'
      OR COALESCE(p_name, '') ~* '\m(admins?|administrators?|support|moderators?|moderation|team|official|staff|helpdesk)\M';
$$;

-- Every name is cleaned (above). A member changing their own name: a name
-- that sounds like the team is refused, and so is a fourth change in 30
-- days. A signup's name comes from the signup data, written by the database
-- (no member is signed in): one that sounds like the team is left empty, and
-- the member chooses another in Settings. Admins can set any name.
CREATE FUNCTION private.check_name()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := (SELECT auth.uid());
BEGIN
  NEW.name := LEFT(private.clean_name(NEW.name), 200);
  IF TG_OP = 'UPDATE' AND NEW.name IS NOT DISTINCT FROM OLD.name THEN
    RETURN NEW;
  END IF;
  IF me IS NOT NULL AND me = NEW.id AND NOT private.is_admin() THEN
    IF private.is_reserved_name(NEW.name) THEN
      RAISE EXCEPTION 'Please use your own name. Names like NRIClub, Admin, Support or Team are kept for the NRIClub team.'
        USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      -- Two changes sent at the same moment are counted one by one.
      PERFORM pg_advisory_xact_lock(hashtext('nriclub-name:' || NEW.id::text));
      IF (SELECT count(*) FROM private.name_changes c
          WHERE c.member_id = NEW.id AND c.changed_at > NOW() - INTERVAL '30 days') >= 3 THEN
        RAISE EXCEPTION 'You can change your name 3 times in 30 days. Please try again later.' USING ERRCODE = 'P0001';
      END IF;
      DELETE FROM private.name_changes c WHERE c.member_id = NEW.id AND c.changed_at <= NOW() - INTERVAL '30 days';
      INSERT INTO private.name_changes (member_id) VALUES (NEW.id);
    END IF;
  ELSIF me IS NULL AND TG_OP = 'INSERT' AND private.is_reserved_name(NEW.name) THEN
    NEW.name := '';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER check_name BEFORE INSERT OR UPDATE OF name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.check_name();

-- ============================================================================
-- LIMITS (C13)
-- ============================================================================

-- What each member did when, for the limits below: one row per post,
-- message, request... sent, kept for a day (the longest period counted), so
-- deleting something doesn't give the member another try. Deleted with the
-- account. Only the database reads it.
CREATE TABLE private.rate_log (
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rate_log ON private.rate_log (member_id, action, at);
REVOKE ALL ON private.rate_log FROM PUBLIC, anon, authenticated;

-- Counts one more p_action for the signed-in member, or refuses it if that
-- would go over a limit. p_limits: pairs of how many and in what time, e.g.
-- {30, '1 minute', 500, '1 day'}.
CREATE FUNCTION private.take_rate(p_action TEXT, p_limits TEXT[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := (SELECT auth.uid());
  i INTEGER;
  longest INTERVAL := INTERVAL '1 day';
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;
  -- Two requests sent at the same moment are counted one by one.
  PERFORM pg_advisory_xact_lock(hashtext('nriclub-rate:' || me::text || ':' || p_action));
  FOR i IN 1 .. COALESCE(array_length(p_limits, 1), 0) / 2 LOOP
    IF (SELECT count(*) FROM private.rate_log r
        WHERE r.member_id = me AND r.action = p_action
          AND r.at > NOW() - p_limits[2 * i]::INTERVAL) >= p_limits[2 * i - 1]::INTEGER THEN
      RAISE EXCEPTION 'You''re doing that too often. Please wait a little and try again.' USING ERRCODE = 'P0001';
    END IF;
    longest := GREATEST(longest, p_limits[2 * i]::INTERVAL);
  END LOOP;
  DELETE FROM private.rate_log r WHERE r.member_id = me AND r.action = p_action AND r.at <= NOW() - longest;
  INSERT INTO private.rate_log (member_id, action) VALUES (me, p_action);
END;
$$;

-- BEFORE INSERT: TG_ARGV[0] names the action, the rest are its limits (as
-- for private.take_rate). Runs as the member (SECURITY INVOKER): current_user
-- then tells a request through the API apart from the database's own
-- writes. Admins have no limits. A row that is refused later (by a policy)
-- isn't counted: the whole request is undone.
CREATE FUNCTION private.rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user = 'authenticated' AND NOT private.is_admin() THEN
    PERFORM private.take_rate(TG_ARGV[0], TG_ARGV[1:TG_NARGS - 1]);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rate_limit BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.rate_limit('message', '30', '1 minute', '500', '1 day');
CREATE TRIGGER rate_limit BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION private.rate_limit('conversation', '20', '1 day');
CREATE TRIGGER rate_limit BEFORE INSERT ON public.connections
  FOR EACH ROW EXECUTE FUNCTION private.rate_limit('namaste', '50', '1 day');
CREATE TRIGGER rate_limit BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION private.rate_limit('comment', '60', '1 hour');
CREATE TRIGGER rate_limit BEFORE INSERT ON public.doc_comments
  FOR EACH ROW EXECUTE FUNCTION private.rate_limit('guide_comment', '60', '1 hour');
CREATE TRIGGER rate_limit BEFORE INSERT ON public.help_responses
  FOR EACH ROW EXECUTE FUNCTION private.rate_limit('answer', '60', '1 hour');
CREATE TRIGGER rate_limit BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION private.rate_limit('post', '20', '1 day');
CREATE TRIGGER rate_limit BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION private.rate_limit('event', '20', '1 day');
CREATE TRIGGER rate_limit BEFORE INSERT ON public.marketplace
  FOR EACH ROW EXECUTE FUNCTION private.rate_limit('listing', '20', '1 day');
CREATE TRIGGER rate_limit BEFORE INSERT ON public.docs
  FOR EACH ROW EXECUTE FUNCTION private.rate_limit('guide', '20', '1 day');
CREATE TRIGGER rate_limit BEFORE INSERT ON public.help_requests
  FOR EACH ROW EXECUTE FUNCTION private.rate_limit('question', '20', '1 day');
CREATE TRIGGER rate_limit BEFORE INSERT ON public.groups
  FOR EACH ROW EXECUTE FUNCTION private.rate_limit('group', '5', '1 day');
CREATE TRIGGER rate_limit BEFORE INSERT ON public.places
  FOR EACH ROW EXECUTE FUNCTION private.rate_limit('place', '20', '1 day');
-- Reports about members and content, and feedback (bug reports and ideas).
CREATE TRIGGER rate_limit BEFORE INSERT ON public.reports
  FOR EACH ROW WHEN (NEW.reason NOT LIKE '[BUG]%' AND NEW.reason NOT LIKE '[IDEA]%')
  EXECUTE FUNCTION private.rate_limit('report', '20', '1 day');
CREATE TRIGGER rate_limit_feedback BEFORE INSERT ON public.reports
  FOR EACH ROW WHEN (NEW.reason LIKE '[BUG]%' OR NEW.reason LIKE '[IDEA]%')
  EXECUTE FUNCTION private.rate_limit('feedback', '5', '1 day');

-- The same report again from the same member while the first still waits
-- (the same post, guide, listing, member...; feedback with the same text)
-- is kept once: the second is quietly dropped, so the member sees it sent and
-- the queue holds it once. Only for the member's own reports, so it can't be
-- used to find out what someone else reported. (Named to run before the
-- other triggers on reports, so a dropped report isn't counted either.)
CREATE FUNCTION private.ignore_duplicate_report()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.reporter_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.reporter_id = NEW.reporter_id AND r.status = 'pending'
      AND r.reported_post_id IS NOT DISTINCT FROM NEW.reported_post_id
      AND r.reported_user_id IS NOT DISTINCT FROM NEW.reported_user_id
      AND ((NEW.reason NOT LIKE '[BUG]%' AND NEW.reason NOT LIKE '[IDEA]%') OR r.reason = NEW.reason)
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ignore_duplicate_report BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION private.ignore_duplicate_report();

-- ============================================================================
-- PUBLIC CITY PAGES (C17)
-- ============================================================================

-- A city name as the public pages ask for it: letters (Latin ones with
-- accents included), spaces, dots, apostrophes, hyphens and brackets, at
-- most 60 characters. Anything else gets no answer.
CREATE FUNCTION private.is_city_name(p_city TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT COALESCE(p_city, '') ~ '^[[:alpha:]À-ɏḀ-ỿ .''()-]{1,60}$';
$$;

-- As in 2026-10-17, except: the city must be a city name (above); events
-- are upcoming events whose city is the city (their address is never
-- searched); and members and events are null below 5, so a page never shows
-- that one or two members live in a small town.
CREATE OR REPLACE FUNCTION public.city_summary(p_city TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH q AS (
    SELECT btrim(COALESCE(p_city, '')) AS raw WHERE private.is_city_name(btrim(COALESCE(p_city, '')))
  ),
  grp AS (
    SELECT x.name, x.members_count FROM public.groups x, q
    WHERE x.is_approved AND x.category = 'City'
      AND private.slug(x.name) = private.slug('Indians in ' || q.raw)
    ORDER BY x.members_count DESC LIMIT 1
  ),
  c AS (
    SELECT COALESCE((SELECT substr(grp.name, 12) FROM grp), replace(q.raw, '-', ' ')) AS city FROM q
  ),
  n AS (
    SELECT
      (SELECT grp.members_count FROM grp) AS members,
      (SELECT count(*) FROM public.events e, c
       WHERE lower(btrim(e.city)) = lower(c.city) AND e.date >= to_char(CURRENT_DATE, 'YYYY-MM-DD')) AS events
  )
  SELECT jsonb_build_object(
    'city', c.city,
    'group', EXISTS (SELECT 1 FROM grp),
    'members', CASE WHEN n.members >= 5 THEN n.members END,
    'events', CASE WHEN n.events >= 5 THEN n.events END,
    'places', (SELECT count(*) FROM public.places p WHERE lower(p.city) = lower(c.city))
  )
  FROM c, n;
$$;

-- As in 2026-10-16, except that groups with fewer than 5 members show no
-- number (null) and are listed after the others by name, so the order
-- doesn't give their size away either.
CREATE OR REPLACE FUNCTION public.public_cities()
RETURNS TABLE (city TEXT, members INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT substr(g.name, 12), CASE WHEN g.members_count >= 5 THEN g.members_count END
  FROM public.groups g
  WHERE g.is_approved AND g.category = 'City' AND g.name ILIKE 'Indians in %'
  ORDER BY CASE WHEN g.members_count >= 5 THEN g.members_count ELSE 0 END DESC, g.name
  LIMIT 500;
$$;

-- As in 2026-10-17, except that upcoming events are those whose city is the
-- group's city exactly (not every event whose address mentions it).
CREATE OR REPLACE FUNCTION public.admin_city_stats()
RETURNS TABLE (city TEXT, members INTEGER, joined_7d INTEGER, joined_30d INTEGER,
               posts_30d INTEGER, questions_30d INTEGER, events_upcoming INTEGER, ambassadors TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT substr(g.name, 12),
    g.members_count,
    (SELECT count(*)::INTEGER FROM public.group_members m WHERE m.group_id = g.id AND m.joined_at > NOW() - INTERVAL '7 days'),
    (SELECT count(*)::INTEGER FROM public.group_members m WHERE m.group_id = g.id AND m.joined_at > NOW() - INTERVAL '30 days'),
    (SELECT count(*)::INTEGER FROM public.posts p WHERE p.group_id = g.id AND p.created_at > NOW() - INTERVAL '30 days'),
    (SELECT count(*)::INTEGER FROM public.help_requests h WHERE lower(h.city) = lower(substr(g.name, 12)) AND h.created_at > NOW() - INTERVAL '30 days'),
    (SELECT count(*)::INTEGER FROM public.events e
     WHERE e.date >= to_char(CURRENT_DATE, 'YYYY-MM-DD') AND private.city_group_name(e.city) = lower(g.name)),
    COALESCE((SELECT string_agg(p.name, ', ' ORDER BY p.name) FROM public.profiles p
              WHERE p.ambassador_city <> '' AND private.city_group_name(p.ambassador_city) = lower(g.name)), '')
  FROM public.groups g
  WHERE g.is_approved AND g.category = 'City'
  ORDER BY g.members_count DESC, g.name;
END;
$$;

-- ============================================================================
-- LESS ABOUT MEMBERS FOR OTHER MEMBERS (C18)
-- ============================================================================

-- When a member last opened NRIClub: only they and admins (the admin
-- overview's "active" numbers) see it now, with their other private details.
-- The site writes it; the server's clock decides the time, and writing it
-- doesn't count as a change to the account (updated_at stays).
ALTER TABLE public.profile_private ADD COLUMN last_active TIMESTAMPTZ;

-- (Named to run after set_updated_at.)
CREATE FUNCTION private.stamp_last_active()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.last_active IS DISTINCT FROM OLD.last_active THEN
    IF current_user = 'authenticated' THEN
      NEW.last_active := NOW();
    END IF;
    IF to_jsonb(NEW) - 'last_active' - 'updated_at' = to_jsonb(OLD) - 'last_active' - 'updated_at' THEN
      NEW.updated_at := OLD.updated_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stamp_last_active BEFORE UPDATE OF last_active ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION private.stamp_last_active();

UPDATE public.profile_private pp SET last_active = p.last_active
FROM public.profiles p
WHERE p.id = pp.id AND p.last_active IS NOT NULL;
ALTER TABLE public.profiles DROP COLUMN last_active;

-- The LinkedIn link was asked for so our team can check a member. Other
-- members see it only if the member chooses so (Edit profile); the member
-- and admins always do.
ALTER TABLE public.profiles ADD COLUMN linkedin_public BOOLEAN NOT NULL DEFAULT FALSE;

-- Members read profiles column by column: every column but linkedin_url,
-- which they get through public.profile_links below. (A request for all
-- columns, select=*, is refused now.) A new column on profiles needs its own
-- GRANT SELECT (column) ON public.profiles TO authenticated, or members can't
-- read it. Writing is unchanged: the policies and triggers decide.
REVOKE SELECT ON public.profiles FROM authenticated;
DO $$
DECLARE
  cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position) INTO cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'profiles' AND c.column_name <> 'linkedin_url';
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', cols);
END $$;

-- LinkedIn links of the given members (up to 2,000) that the signed-in
-- member may see: their own, every member's for admins, and otherwise those
-- the member chose to show (for members who can see other members).
-- linkedin_public says whether the member shows it.
CREATE FUNCTION public.profile_links(p_ids UUID[])
RETURNS TABLE (id UUID, linkedin_url TEXT, linkedin_public BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id, p.linkedin_url, p.linkedin_public
  FROM public.profiles p
  WHERE p.id = ANY (p_ids[1:2000])
    AND ((SELECT auth.uid()) = p.id
         OR (SELECT private.is_admin())
         OR (p.linkedin_public AND p.linkedin_url <> '' AND (SELECT private.can_browse())));
$$;

-- Who recommended a place (a temple, a doctor...) is for the member and
-- admins only; everyone else sees how many members did
-- (public.place_recommendation_counts).
DROP POLICY "Members can view recommendations" ON public.place_recommendations;
CREATE POLICY "Members see their own recommendations" ON public.place_recommendations
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));

-- How many members recommend each place in a city, and whether the
-- signed-in member does, for the places the member can see.
CREATE FUNCTION public.place_recommendation_counts(p_city TEXT)
RETURNS TABLE (place_id UUID, recommendations INTEGER, mine BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id, count(r.user_id)::INTEGER, COALESCE(bool_or(r.user_id = (SELECT auth.uid())), FALSE)
  FROM public.places p
  LEFT JOIN public.place_recommendations r ON r.place_id = p.id
  WHERE lower(p.city) = lower(btrim(COALESCE(p_city, '')))
    AND (p.created_by = (SELECT auth.uid()) OR (SELECT private.can_browse()))
  GROUP BY p.id;
$$;

-- Settings nobody could see or change, which did nothing: removed. Other
-- members' contact settings are as before.
DROP FUNCTION public.get_member_preferences(UUID);
CREATE FUNCTION public.get_member_preferences(member UUID)
RETURNS TABLE (namaste_requests TEXT, receive_messages TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.namaste_requests, s.receive_messages
  FROM public.user_settings s
  WHERE s.user_id = member AND (SELECT auth.uid()) IS NOT NULL AND private.can_browse();
$$;
ALTER TABLE public.user_settings DROP COLUMN profile_visibility, DROP COLUMN online_status;

-- ============================================================================
-- SIGNUP DATA (C20)
-- ============================================================================

-- Supabase Auth keeps what a signup sent (auth.users.raw_user_meta_data).
-- NRIClub uses only the name and country from it (private.handle_new_user;
-- the site sends only the name), so only those stay, with the keys Supabase
-- Auth adds itself (sub, email, email_verified, phone_verified). Older
-- signups had sent hometown, location and job, which then stayed there even
-- after the member changed them on their profile.
CREATE FUNCTION private.trim_signup_data()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.raw_user_meta_data := COALESCE((
    SELECT jsonb_object_agg(e.key, e.value)
    FROM jsonb_each(CASE WHEN jsonb_typeof(NEW.raw_user_meta_data) = 'object' THEN NEW.raw_user_meta_data ELSE '{}'::jsonb END) e
    WHERE e.key IN ('full_name', 'name', 'country_code', 'sub', 'email', 'email_verified', 'phone_verified')
  ), '{}'::jsonb);
  RETURN NEW;
END;
$$;
CREATE TRIGGER nriclub_trim_signup_data BEFORE INSERT OR UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.trim_signup_data();

-- ============================================================================
-- CLEAN-UP (C20)
-- ============================================================================

-- Reports our team keeps past their time because a legal dispute or a police
-- matter about them is still open. Added and removed by hand in the SQL
-- editor: INSERT INTO private.report_hold (report_id, reason) VALUES (...).
CREATE TABLE private.report_hold (
  report_id UUID PRIMARY KEY REFERENCES public.reports(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '' CHECK (char_length(reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
REVOKE ALL ON private.report_hold FROM PUBLIC, anon, authenticated;

-- Deletes what the Privacy Policy says is deleted after a time. The periods
-- are the Policy's (RETENTION in src/content/legal/privacy.js and
-- docs/compliance/deletion-routine.md): change them together. Admin accounts
-- are never deleted here. Deleting the auth.users row deletes an account
-- exactly as Settings > Delete account does (its photo files are removed as
-- for any deleted account). Returns how many of each it deleted. Safe to run
-- by hand: SELECT private.daily_cleanup();
CREATE FUNCTION private.daily_cleanup()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  unconfirmed INTEGER;
  unfinished INTEGER;
  declined INTEGER;
  notices INTEGER;
  closed_reports INTEGER;
  records INTEGER;
  notes INTEGER;
BEGIN
  -- Sign-ups that never confirmed their email address: 30 days.
  WITH gone AS (
    DELETE FROM auth.users u
    WHERE u.email_confirmed_at IS NULL AND u.created_at < NOW() - INTERVAL '30 days'
      AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = u.id)
    RETURNING 1)
  SELECT count(*) INTO unconfirmed FROM gone;

  -- Accounts that never sent their check details: 90 days after signing up
  -- (or after our team sent them back to unfinished).
  WITH gone AS (
    DELETE FROM auth.users u USING public.profile_private pp
    WHERE pp.id = u.id AND pp.verification_status = 'incomplete'
      AND GREATEST(pp.created_at, COALESCE(pp.reviewed_at, pp.created_at)) < NOW() - INTERVAL '90 days'
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

  -- Record of declined and blocked accounts: 24 months after the decision;
  -- the note in it after 12.
  WITH gone AS (
    DELETE FROM private.moderation_record m WHERE m.created_at < NOW() - INTERVAL '24 months' RETURNING 1)
  SELECT count(*) INTO records FROM gone;
  WITH cleared AS (
    UPDATE private.moderation_record m SET admin_note = ''
    WHERE m.admin_note <> '' AND m.created_at < NOW() - INTERVAL '12 months' RETURNING 1)
  SELECT count(*) INTO notes FROM cleared;

  -- The counters behind the limits and the name changes.
  DELETE FROM private.rate_log r WHERE r.at < NOW() - INTERVAL '1 day';
  DELETE FROM private.name_changes c WHERE c.changed_at < NOW() - INTERVAL '30 days';

  RETURN jsonb_build_object(
    'unconfirmed_signups', unconfirmed, 'unfinished_accounts', unfinished, 'declined_accounts', declined,
    'read_notifications', notices, 'closed_reports', closed_reports,
    'moderation_records', records, 'moderation_notes_cleared', notes);
END;
$$;

-- Runs private.daily_cleanup() every night at 03:17 (UTC) with pg_cron:
-- enables pg_cron if the database offers it (Supabase does: Database →
-- Extensions), and does nothing otherwise. Says what it did. Safe to run
-- again (the job keeps its name): SELECT private.schedule_daily_cleanup();
-- Stop it with: SELECT cron.unschedule('nriclub-daily-cleanup');
CREATE FUNCTION private.schedule_daily_cleanup()
RETURNS TEXT LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name = 'pg_cron') THEN
      RETURN 'not scheduled: this database has no pg_cron. Run SELECT private.daily_cleanup(); by hand once a day.';
    END IF;
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
    EXCEPTION WHEN OTHERS THEN
      RETURN 'not scheduled: pg_cron could not be enabled (' || SQLERRM || '). Enable it under Database → Extensions, then run SELECT private.schedule_daily_cleanup();';
    END;
  END IF;
  BEGIN
    EXECUTE 'SELECT cron.schedule($1, $2, $3)'
      USING 'nriclub-daily-cleanup', '17 3 * * *', 'SELECT private.daily_cleanup()';
  EXCEPTION WHEN OTHERS THEN
    RETURN 'not scheduled: ' || SQLERRM;
  END;
  RETURN 'scheduled: private.daily_cleanup() runs every night at 03:17 UTC (pg_cron job nriclub-daily-cleanup)';
END;
$$;

-- ============================================================================
-- "DOWNLOAD MY DATA" (C21)
-- ============================================================================

-- As in 2026-10-19, plus: a readme (where the Privacy Policy explains why
-- each kind of data is used, who receives it and how long it's kept, and
-- what isn't in the file), the account as Supabase Auth keeps it, sign-in
-- sessions, reviews of the member's mentoring, reports about the member or
-- what they posted (without who sent them: that is the reporter's data),
-- the member's photo files, urgent questions sent, name changes, the
-- counters behind the limits, and last_active (in profile_private now).
-- Tables Supabase manages are read by key, so a column it renames or drops
-- leaves a gap instead of breaking the export.
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  sessions JSONB := '[]'::jsonb;
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
  RETURN jsonb_build_object(
    'exported_at', NOW(),
    'readme', jsonb_build_object(
      'about', 'Everything NRIClub keeps about you in its database at the time of exported_at: your account, profile and settings, what you posted, sent and received, and the records about you below.',
      'privacy_policy', 'https://nriclub.app/privacy: why we use each kind of data, the legal basis, who receives it, how long we keep it, and your rights.',
      'not_included', 'The photo files themselves (listed under files; you see them in the app), copies in our database provider''s daily backups (overwritten after 7 days), server logs, emails between you and us, and our team''s internal notes on decisions about your account. Write to hello@nriclub.app for a copy of any of these.',
      'contact', 'hello@nriclub.app'),
    'account', (SELECT jsonb_build_object(
        'email', a->'email', 'created_at', a->'created_at', 'email_confirmed_at', a->'email_confirmed_at',
        'last_sign_in_at', a->'last_sign_in_at', 'signup_data', a->'raw_user_meta_data')
      FROM (SELECT to_jsonb(u) AS a FROM auth.users u WHERE u.id = uid) x),
    'sessions', sessions,
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
    'reports_about_me', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'created_at', x.created_at, 'reason', x.reason, 'status', x.status) ORDER BY x.created_at)
      FROM public.reports x
      WHERE x.reporter_id <> uid AND (x.reported_user_id = uid OR x.reported_post_id IN (
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
    'rate_limit_log', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', r.action, 'at', r.at) ORDER BY r.at)
      FROM private.rate_log r WHERE r.member_id = uid), '[]'::jsonb)
  );
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Trigger functions run as the database (or, for the limits and
-- stamp_last_active, as the member, who then needs to run take_rate); the
-- clean-up runs as the database. Members can't call anything in private
-- through the API (the schema isn't exposed).
REVOKE ALL ON FUNCTION private.snippet(TEXT), private.gets_notifications(UUID), private.notify_like(), private.notify_comment(), private.notify_request(),
  private.forget_post_notifications(), private.clean_name(TEXT), private.is_reserved_name(TEXT), private.check_name(),
  private.take_rate(TEXT, TEXT[]), private.rate_limit(), private.ignore_duplicate_report(), private.is_city_name(TEXT),
  private.stamp_last_active(), private.trim_signup_data(), private.daily_cleanup(), private.schedule_daily_cleanup()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.notify_like(), private.notify_comment(), private.notify_request(),
  private.forget_post_notifications(), private.check_name(), private.take_rate(TEXT, TEXT[]), private.rate_limit(),
  private.ignore_duplicate_report(), private.stamp_last_active() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.snippet(TEXT), private.gets_notifications(UUID), private.clean_name(TEXT), private.is_reserved_name(TEXT),
  private.is_city_name(TEXT), private.daily_cleanup() TO service_role;
-- city_summary runs as the database (SECURITY DEFINER), for signed-out
-- visitors too.
REVOKE ALL ON FUNCTION public.server_notification_types(), public.profile_links(UUID[]),
  public.place_recommendation_counts(TEXT), public.get_member_preferences(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.server_notification_types(), public.profile_links(UUID[]),
  public.place_recommendation_counts(TEXT), public.get_member_preferences(UUID) TO authenticated;

-- ============================================================================
-- EXISTING DATA
-- ============================================================================

-- (supabase/tests/rls_test.py runs this section again, in a transaction it
-- rolls back, to check the changes to existing rows.)

-- Names without invisible characters (a change by the database: not counted
-- as one of the member's changes, and approved members stay approved).
UPDATE public.profiles SET name = private.clean_name(name) WHERE name IS DISTINCT FROM private.clean_name(name);

-- Signup data: only the name and country (as private.trim_signup_data does
-- from now on).
UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data
WHERE raw_user_meta_data IS NOT NULL AND (jsonb_typeof(raw_user_meta_data) <> 'object' OR EXISTS (
  SELECT 1 FROM jsonb_object_keys(raw_user_meta_data) k
  WHERE k NOT IN ('full_name', 'name', 'country_code', 'sub', 'email', 'email_verified', 'phone_verified')));

-- The old support and privacy addresses in what members (and the starter
-- posts) wrote: hello@nriclub.app answers now. Live has 5 starter posts.
UPDATE public.posts SET content = replace(replace(content, 'support@nriclub.app', 'hello@nriclub.app'), 'privacy@nriclub.app', 'hello@nriclub.app')
WHERE content LIKE '%support@nriclub.app%' OR content LIKE '%privacy@nriclub.app%';
UPDATE public.comments SET content = replace(replace(content, 'support@nriclub.app', 'hello@nriclub.app'), 'privacy@nriclub.app', 'hello@nriclub.app')
WHERE content LIKE '%support@nriclub.app%' OR content LIKE '%privacy@nriclub.app%';
UPDATE public.docs SET
  content = replace(replace(content, 'support@nriclub.app', 'hello@nriclub.app'), 'privacy@nriclub.app', 'hello@nriclub.app'),
  excerpt = replace(replace(excerpt, 'support@nriclub.app', 'hello@nriclub.app'), 'privacy@nriclub.app', 'hello@nriclub.app')
WHERE content LIKE '%support@nriclub.app%' OR content LIKE '%privacy@nriclub.app%'
   OR excerpt LIKE '%support@nriclub.app%' OR excerpt LIKE '%privacy@nriclub.app%';
UPDATE public.groups SET description = replace(replace(description, 'support@nriclub.app', 'hello@nriclub.app'), 'privacy@nriclub.app', 'hello@nriclub.app')
WHERE description LIKE '%support@nriclub.app%' OR description LIKE '%privacy@nriclub.app%';
UPDATE public.events SET description = replace(replace(description, 'support@nriclub.app', 'hello@nriclub.app'), 'privacy@nriclub.app', 'hello@nriclub.app')
WHERE description LIKE '%support@nriclub.app%' OR description LIKE '%privacy@nriclub.app%';

-- The nightly clean-up (the result shows in the SQL editor's messages).
DO $$
BEGIN
  RAISE NOTICE 'NRIClub daily clean-up: %', private.schedule_daily_cleanup();
END $$;
