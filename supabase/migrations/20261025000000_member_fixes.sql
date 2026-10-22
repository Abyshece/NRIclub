-- ============================================================================
-- NRIclub: member-app fixes (2026-10-25)
--
--   * Posts go only into groups the author has joined (C12): the posts
--     INSERT policy checks it, and moving one of your posts into another
--     group is refused unless you're in that group too. Before, the Home
--     page's "Add Post" could post into the last group opened, even one the
--     member never joined.
--   * Location (C29): public.update_my_city sets the city, country and the
--     place shown on the profile together, the way Get verified does, so
--     urgent questions reach members in the city they live in now.
--   * Blocking (C29): public.block_member blocks a member and removes the
--     Namaste connections between the two in one go; it either all happens
--     or nothing does.
--   * Events: their author can edit them. Only the author can (as before),
--     the event's id, author, "going" count and creation time can't be
--     changed, and a member can't give a new or edited event a date that has
--     passed (an event that has already happened can still be edited, as
--     long as its date stays as it is).
--   * LinkedIn: other members see a new member's LinkedIn link unless the
--     member chooses "Only the NRIClub team" (Settings, Privacy & Safety).
--     Existing members keep the choice they have. Admins always see it,
--     through public.profile_links as before.
-- Needs all earlier migrations (up to 20261024000000_ambassador_applications.sql).
-- Can be run again: it replaces what it made the first time.
-- Existing rows: none change.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('private.ambassador_applications') IS NULL THEN
    RAISE EXCEPTION 'Run the ambassador applications update (20261024000000) first.';
  END IF;
END;
$$;

-- ============================================================================
-- POSTS ONLY IN GROUPS THE AUTHOR HAS JOINED (C12)
-- ============================================================================

-- As in 2026-10-12, plus: a post in a group needs its author to be in that
-- group.
DROP POLICY IF EXISTS "Users can create posts" ON public.posts;
CREATE POLICY "Users can create posts" ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_active_member()
              AND (group_id IS NULL OR EXISTS (
                SELECT 1 FROM public.group_members m
                WHERE m.group_id = posts.group_id AND m.user_id = (SELECT auth.uid()))));

-- Members may edit their own posts; moving one into another group needs
-- them to be in it. (A post stays in a group its author has since left.)
CREATE OR REPLACE FUNCTION private.check_post_group()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user = 'authenticated' AND NEW.group_id IS NOT NULL
     AND NEW.group_id IS DISTINCT FROM OLD.group_id
     AND NOT EXISTS (SELECT 1 FROM public.group_members m
                     WHERE m.group_id = NEW.group_id AND m.user_id = (SELECT auth.uid())) THEN
    RAISE EXCEPTION 'You can only post in groups you''ve joined.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS check_post_group ON public.posts;
CREATE TRIGGER check_post_group BEFORE UPDATE OF group_id ON public.posts
  FOR EACH ROW EXECUTE FUNCTION private.check_post_group();

-- ============================================================================
-- THE MEMBER'S CITY (C29)
-- ============================================================================

-- Sets the signed-in member's city, country (ISO code) and the place their
-- profile shows (p_location: the city, then the country's name, as the site
-- writes it; anything else becomes the city alone). Returns what was saved.
CREATE OR REPLACE FUNCTION public.update_my_city(p_city TEXT, p_country_code TEXT, p_location TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  v_city TEXT := btrim(regexp_replace(COALESCE(p_city, ''), '\s+', ' ', 'g'));
  v_country TEXT := upper(btrim(COALESCE(p_country_code, '')));
  v_location TEXT := btrim(regexp_replace(COALESCE(p_location, ''), '\s+', ' ', 'g'));
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF (SELECT private.is_blocked_me()) THEN
    RAISE EXCEPTION 'Your profile has been blocked, so it can''t be changed.' USING ERRCODE = 'P0001';
  END IF;
  IF v_city = '' OR char_length(v_city) > 200 THEN
    RAISE EXCEPTION 'Please enter the city you live in.' USING ERRCODE = 'P0001';
  END IF;
  IF v_country !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Please choose your country.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_location) > 200 OR lower(v_location) NOT LIKE lower(replace(replace(replace(v_city, '\', '\\'), '%', '\%'), '_', '\_')) || ', %' THEN
    v_location := v_city;
  END IF;
  UPDATE public.profiles SET city = v_city, country_code = v_country, location = v_location
  WHERE id = uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your profile couldn''t be found.' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object('city', v_city, 'country_code', v_country, 'location', v_location);
END;
$$;

-- ============================================================================
-- BLOCKING A MEMBER (C29)
-- ============================================================================

-- The signed-in member blocks p_member: the block is recorded (again is
-- fine) and the Namaste connections between the two, either way and in any
-- state, are removed, all at once.
CREATE OR REPLACE FUNCTION public.block_member(p_member UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_member IS NULL OR p_member = uid THEN
    RAISE EXCEPTION 'You can''t block yourself.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_member) THEN
    RAISE EXCEPTION 'This member can''t be blocked.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.blocks (blocker_id, blocked_id) VALUES (uid, p_member)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
  DELETE FROM public.connections
  WHERE (requester_id = uid AND recipient_id = p_member)
     OR (requester_id = p_member AND recipient_id = uid);
  RETURN TRUE;
END;
$$;

-- ============================================================================
-- EDITING EVENTS
-- ============================================================================

-- The author edits their event through the existing policy ("Organizers can
-- update their events": only the author, while they can take part). These
-- columns stay as they are: the id (RSVPs and notifications point at it)
-- too, from now on.
DROP TRIGGER IF EXISTS protect_columns ON public.events;
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{"attendees_count": 0}', 'id', 'organizer_id', 'attendees_count', 'created_at');

-- A member's new event, or a new date for one, needs a date from the date
-- picker (YYYY-MM-DD) that hasn't passed. A day's grace for members in time
-- zones behind the database's (UTC). Events with older dates ("Mar 25,
-- 2026 • 10:00 AM") can still be edited as long as the date stays.
CREATE OR REPLACE FUNCTION private.check_event_date()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  d DATE;
BEGIN
  IF current_user <> 'authenticated' OR (TG_OP = 'UPDATE' AND NEW.date IS NOT DISTINCT FROM OLD.date) THEN
    RETURN NEW;
  END IF;
  BEGIN
    IF NEW.date !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'bad date';
    END IF;
    d := NEW.date::DATE;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Please choose the date of the event.' USING ERRCODE = 'P0001';
  END;
  IF d < CURRENT_DATE - 1 THEN
    RAISE EXCEPTION 'That date has passed. Please choose today or a later date.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS check_event_date ON public.events;
CREATE TRIGGER check_event_date BEFORE INSERT OR UPDATE OF date ON public.events
  FOR EACH ROW EXECUTE FUNCTION private.check_event_date();

-- ============================================================================
-- WHO SEES A MEMBER'S LINKEDIN LINK
-- ============================================================================

-- Only the NRIClub team sees it until the member chooses "All members"
-- (privacy by default, Art. 25(2) GDPR). Members can't read linkedin_url
-- from profiles (2026-10-20); public.profile_links gives it to other
-- members only when linkedin_public is true, and always to the member and
-- to admins.
ALTER TABLE public.profiles ALTER COLUMN linkedin_public SET DEFAULT FALSE;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- The triggers run for members (as the other triggers do); the two
-- functions check who is asking themselves.
REVOKE ALL ON FUNCTION private.check_post_group(), private.check_event_date() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.check_post_group(), private.check_event_date() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_my_city(TEXT, TEXT, TEXT), public.block_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_city(TEXT, TEXT, TEXT), public.block_member(UUID) TO authenticated;
