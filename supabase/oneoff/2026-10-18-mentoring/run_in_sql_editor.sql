-- Run this whole file once in the Supabase SQL Editor (mentoring).
-- Needs the Batch 3-5 update (already run on live on 2026-10-13).
-- Schema: supabase/migrations/20261018000000_mentoring.sql

DO $$
BEGIN
  IF to_regclass('public.answer_thanks') IS NULL THEN
    RAISE EXCEPTION 'Run the Batch 3-5 file (2026-10-17-batch5/run_all_batches_3_4_5.sql) first.';
  END IF;
END;
$$;

-- ============================================================================
-- NRIclub: mentoring (2026-10-18)
--
--   * profiles: "Open to mentoring" (verified members only) with the areas a
--     mentor helps with, and "Looking for a mentor" with what the member
--     needs help with.
--   * public.mentor_slots: times a mentor is free for a session (up to 90
--     days ahead, 15 to 120 minutes, at most 40 open times at once).
--   * public.mentor_bookings: a member books one of those times. Only the
--     mentor and the member see a booking. Booking and cancelling go
--     through public.book_mentor_session and public.cancel_mentor_session;
--     a member can have 3 upcoming sessions, 1 of them with the same mentor.
--   * public.mentor_reviews: after a session, the member rates it (1 to 5
--     stars) with an optional comment, once. Reviews are public to members;
--     public.mentor_ratings() gives each mentor's average.
--   * A mentor and a member with a booked session can message each other,
--     even if one only takes messages from connections ("Nobody" still
--     means nobody, and blocks still apply).
--   * Notifications: a new booking, a cancelled session, a new review.
-- Needs the 2026-10-17 (Batch 5) changes. No existing rows change.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN mentor_open BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN mentor_areas TEXT NOT NULL DEFAULT '' CHECK (char_length(mentor_areas) <= 300),
  ADD COLUMN mentee_open BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN mentee_needs TEXT NOT NULL DEFAULT '' CHECK (char_length(mentee_needs) <= 300);
CREATE INDEX idx_profiles_mentor_open ON public.profiles (mentor_open) WHERE mentor_open;

-- Only verified members can offer mentoring.
-- (Runs as the member, so current_user tells a member's change apart from
-- the database's own.)
CREATE FUNCTION private.check_mentor_open()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.mentor_open AND (TG_OP = 'INSERT' OR NOT OLD.mentor_open)
     AND current_user = 'authenticated' AND NOT private.is_admin()
     AND NOT EXISTS (SELECT 1 FROM public.profile_private pp
                     WHERE pp.id = NEW.id AND pp.verification_status = 'approved' AND pp.status = 'active') THEN
    RAISE EXCEPTION 'Only verified members can offer mentoring.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER check_mentor_open BEFORE INSERT OR UPDATE OF mentor_open ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.check_mentor_open();

-- ---------------------------------------------------------------------------
-- OPEN TIMES
-- ---------------------------------------------------------------------------
CREATE TABLE public.mentor_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 30 CHECK (duration_min BETWEEN 15 AND 120),
  booked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mentor_id, starts_at)
);
CREATE INDEX idx_mentor_slots_open ON public.mentor_slots (starts_at) WHERE NOT booked;

ALTER TABLE public.mentor_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mentor_slots FROM anon;
CREATE POLICY "Members can view open times" ON public.mentor_slots
  FOR SELECT TO authenticated USING (mentor_id = (SELECT auth.uid()) OR (SELECT private.can_browse()));
CREATE POLICY "Mentors can add their times" ON public.mentor_slots
  FOR INSERT TO authenticated WITH CHECK (
    mentor_id = (SELECT auth.uid()) AND (SELECT private.is_active_member())
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.mentor_open));
CREATE POLICY "Mentors can remove their free times" ON public.mentor_slots
  FOR DELETE TO authenticated USING (mentor_id = (SELECT auth.uid()) AND NOT booked);

-- New times: from the server clock, in the next 90 days, and not too many.
CREATE FUNCTION private.check_mentor_slot()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    NEW.booked := FALSE;
    NEW.created_at := NOW();
    IF NEW.starts_at < NOW() + INTERVAL '1 hour' OR NEW.starts_at > NOW() + INTERVAL '90 days' THEN
      RAISE EXCEPTION 'Pick a time between an hour and 90 days from now.' USING ERRCODE = '23514';
    END IF;
    IF (SELECT count(*) FROM public.mentor_slots s
        WHERE s.mentor_id = NEW.mentor_id AND NOT s.booked AND s.starts_at > NOW()) >= 40 THEN
      RAISE EXCEPTION 'You can have up to 40 open times. Remove some first.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER check_mentor_slot BEFORE INSERT ON public.mentor_slots
  FOR EACH ROW EXECUTE FUNCTION private.check_mentor_slot();

-- ---------------------------------------------------------------------------
-- BOOKINGS (only through the functions below)
-- ---------------------------------------------------------------------------
CREATE TABLE public.mentor_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID REFERENCES public.mentor_slots(id) ON DELETE SET NULL,
  mentor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  duration_min INTEGER NOT NULL CHECK (duration_min BETWEEN 15 AND 120),
  topic TEXT NOT NULL DEFAULT '' CHECK (char_length(topic) <= 200),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  meeting_link TEXT NOT NULL DEFAULT '' CHECK (char_length(meeting_link) <= 500),
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled')),
  cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancel_reason TEXT NOT NULL DEFAULT '' CHECK (char_length(cancel_reason) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_mentor_bookings_one_per_slot ON public.mentor_bookings (slot_id) WHERE status = 'booked';
CREATE INDEX idx_mentor_bookings_mentor ON public.mentor_bookings (mentor_id, starts_at);
CREATE INDEX idx_mentor_bookings_mentee ON public.mentor_bookings (mentee_id, starts_at);
CREATE INDEX idx_mentor_bookings_cancelled_by ON public.mentor_bookings (cancelled_by);

ALTER TABLE public.mentor_bookings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mentor_bookings FROM anon;
CREATE POLICY "Mentor and member see their sessions" ON public.mentor_bookings
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IN (mentor_id, mentee_id) OR (SELECT private.is_admin()));

-- Books an open time for the signed-in member.
CREATE FUNCTION public.book_mentor_session(p_slot UUID, p_topic TEXT DEFAULT '', p_note TEXT DEFAULT '')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := (SELECT auth.uid());
  s public.mentor_slots;
  booking_id UUID;
BEGIN
  IF me IS NULL OR NOT private.is_active_member() THEN
    RAISE EXCEPTION 'You can book sessions once your membership is confirmed.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.mentor_slots WHERE id = p_slot FOR UPDATE;
  IF NOT FOUND OR s.booked OR s.starts_at < NOW() + INTERVAL '30 minutes' THEN
    RAISE EXCEPTION 'This time is no longer free. Please pick another.' USING ERRCODE = 'P0002';
  END IF;
  IF s.mentor_id = me THEN
    RAISE EXCEPTION 'You can''t book your own time.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.profile_private pp ON pp.id = p.id
    WHERE p.id = s.mentor_id AND p.mentor_open AND pp.status = 'active' AND pp.verification_status = 'approved'
  ) OR private.is_blocked_between(me, s.mentor_id) THEN
    RAISE EXCEPTION 'This mentor isn''t taking bookings right now.' USING ERRCODE = '42501';
  END IF;
  -- One member's sessions are checked one by one.
  PERFORM pg_advisory_xact_lock(hashtext('nriclub-booking:' || me::text));
  IF (SELECT count(*) FROM public.mentor_bookings b
      WHERE b.mentee_id = me AND b.status = 'booked' AND b.starts_at > NOW()) >= 3 THEN
    RAISE EXCEPTION 'You can have 3 upcoming sessions at a time.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mentor_bookings b
             WHERE b.mentee_id = me AND b.mentor_id = s.mentor_id AND b.status = 'booked' AND b.starts_at > NOW()) THEN
    RAISE EXCEPTION 'You already have an upcoming session with this mentor.' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.mentor_bookings (slot_id, mentor_id, mentee_id, starts_at, duration_min, topic, note)
  VALUES (s.id, s.mentor_id, me, s.starts_at, s.duration_min, LEFT(btrim(COALESCE(p_topic, '')), 200), LEFT(btrim(COALESCE(p_note, '')), 1000))
  RETURNING id INTO booking_id;
  UPDATE public.mentor_slots SET booked = TRUE WHERE id = s.id;
  PERFORM private.notify(s.mentor_id, 'booking', me,
    'booked a mentoring session with you' || CASE WHEN btrim(COALESCE(p_topic, '')) <> '' THEN ': ' || private.short_title(btrim(p_topic)) ELSE '' END,
    booking_id);
  RETURN booking_id;
END;
$$;

-- Cancels a session (mentor or member, before it starts). The time opens
-- up again for others.
CREATE FUNCTION public.cancel_mentor_session(p_booking UUID, p_reason TEXT DEFAULT '')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := (SELECT auth.uid());
  b public.mentor_bookings;
BEGIN
  SELECT * INTO b FROM public.mentor_bookings WHERE id = p_booking FOR UPDATE;
  IF NOT FOUND OR me IS NULL OR me NOT IN (b.mentor_id, b.mentee_id) THEN
    RAISE EXCEPTION 'Session not found.' USING ERRCODE = 'P0002';
  END IF;
  IF b.status <> 'booked' OR b.starts_at <= NOW() THEN
    RAISE EXCEPTION 'This session can''t be cancelled any more.' USING ERRCODE = '23514';
  END IF;
  UPDATE public.mentor_bookings
  SET status = 'cancelled', cancelled_by = me, cancel_reason = LEFT(btrim(COALESCE(p_reason, '')), 300)
  WHERE id = b.id;
  UPDATE public.mentor_slots SET booked = FALSE WHERE id = b.slot_id AND starts_at > NOW();
  PERFORM private.notify(CASE WHEN me = b.mentor_id THEN b.mentee_id ELSE b.mentor_id END, 'booking_cancelled', me,
    'cancelled your mentoring session' || CASE WHEN b.topic <> '' THEN ': ' || private.short_title(b.topic) ELSE '' END,
    b.id);
END;
$$;

-- The mentor adds (or changes) the video call link for a session.
CREATE FUNCTION public.set_session_link(p_booking UUID, p_link TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  link TEXT := btrim(COALESCE(p_link, ''));
BEGIN
  IF link <> '' AND link !~* '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'The link must start with https://' USING ERRCODE = '23514';
  END IF;
  UPDATE public.mentor_bookings SET meeting_link = LEFT(link, 500)
  WHERE id = p_booking AND mentor_id = (SELECT auth.uid()) AND status = 'booked';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- REVIEWS
-- ---------------------------------------------------------------------------
CREATE TABLE public.mentor_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.mentor_bookings(id) ON DELETE CASCADE,
  mentor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '' CHECK (char_length(comment) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mentor_reviews_mentor ON public.mentor_reviews (mentor_id, created_at DESC);
CREATE INDEX idx_mentor_reviews_mentee ON public.mentor_reviews (mentee_id);

ALTER TABLE public.mentor_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mentor_reviews FROM anon;
CREATE POLICY "Members can read reviews" ON public.mentor_reviews
  FOR SELECT TO authenticated USING (mentee_id = (SELECT auth.uid()) OR mentor_id = (SELECT auth.uid()) OR (SELECT private.can_browse()));
CREATE POLICY "Reviewers and admins can delete reviews" ON public.mentor_reviews
  FOR DELETE TO authenticated USING (mentee_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));

-- The member rates a session that has ended (once).
CREATE FUNCTION public.review_mentor_session(p_booking UUID, p_rating INTEGER, p_comment TEXT DEFAULT '')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := (SELECT auth.uid());
  b public.mentor_bookings;
  review_id UUID;
BEGIN
  SELECT * INTO b FROM public.mentor_bookings WHERE id = p_booking;
  IF NOT FOUND OR me IS NULL OR b.mentee_id <> me OR NOT private.is_active_member() THEN
    RAISE EXCEPTION 'Session not found.' USING ERRCODE = 'P0002';
  END IF;
  IF b.status <> 'booked' OR b.starts_at + make_interval(mins => b.duration_min) > NOW() THEN
    RAISE EXCEPTION 'You can rate a session once it has taken place.' USING ERRCODE = '23514';
  END IF;
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Choose 1 to 5 stars.' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.mentor_reviews (booking_id, mentor_id, mentee_id, rating, comment)
  VALUES (b.id, b.mentor_id, me, p_rating, LEFT(btrim(COALESCE(p_comment, '')), 1000))
  ON CONFLICT (booking_id) DO NOTHING
  RETURNING id INTO review_id;
  IF review_id IS NULL THEN
    RAISE EXCEPTION 'You have already rated this session.' USING ERRCODE = '23505';
  END IF;
  PERFORM private.notify(b.mentor_id, 'review', me,
    'rated your mentoring session ' || repeat('★', p_rating) || repeat('☆', 5 - p_rating), b.id);
  RETURN review_id;
END;
$$;

-- Each mentor's average rating and number of reviews.
CREATE FUNCTION public.mentor_ratings()
RETURNS TABLE (mentor_id UUID, rating NUMERIC, reviews INTEGER)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT r.mentor_id, round(avg(r.rating)::numeric, 1), count(*)::INTEGER
  FROM public.mentor_reviews r GROUP BY r.mentor_id;
$$;

-- ---------------------------------------------------------------------------
-- MESSAGES: a booked session lets the two write to each other
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.have_session(a UUID, b UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mentor_bookings m
    WHERE m.status = 'booked' AND m.starts_at > NOW() - INTERVAL '30 days'
      AND ((m.mentor_id = a AND m.mentee_id = b) OR (m.mentor_id = b AND m.mentee_id = a)));
$$;

CREATE OR REPLACE FUNCTION private.can_message(sender UUID, recipient UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT private.is_blocked_between(sender, recipient)
    AND COALESCE((
      SELECT CASE s.receive_messages
        WHEN 'Nobody' THEN FALSE
        WHEN 'Connections Only' THEN private.are_connected(sender, recipient) OR private.have_session(sender, recipient)
        ELSE TRUE
      END
      FROM public.user_settings s WHERE s.user_id = recipient
    ), TRUE);
$$;

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications
  DROP CONSTRAINT notifications_type_check,
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'like', 'comment', 'request', 'event', 'group', 'trending', 'message', 'verification',
    'answer', 'thanks', 'best', 'rsvp', 'urgent', 'member',
    'booking', 'booking_cancelled', 'review'));

-- ---------------------------------------------------------------------------
-- "DOWNLOAD MY DATA" also includes mentoring
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'exported_at', NOW(),
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = uid),
    'profile_private', (SELECT to_jsonb(pp) FROM public.profile_private pp WHERE pp.id = uid),
    'user_settings', (SELECT to_jsonb(s) FROM public.user_settings s WHERE s.user_id = uid),
    'verification_log', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'decision', l.decision, 'member_message', l.member_message, 'created_at', l.created_at)
        || CASE WHEN l.actor_id = uid THEN jsonb_build_object('note', l.admin_note) ELSE '{}'::jsonb END
        ORDER BY l.created_at)
      FROM public.verification_log l WHERE l.member_id = uid), '[]'::jsonb),
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
    'help_responses', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.help_responses x WHERE x.user_id = uid), '[]'::jsonb),
    'notifications', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.notifications x WHERE x.user_id = uid), '[]'::jsonb),
    'reports_filed', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.reports x WHERE x.reporter_id = uid), '[]'::jsonb),
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
      FROM public.mentor_reviews x WHERE x.mentee_id = uid), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- PERMISSIONS
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.check_mentor_open(), private.check_mentor_slot(), private.have_session(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.check_mentor_open(), private.check_mentor_slot() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.have_session(UUID, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.book_mentor_session(UUID, TEXT, TEXT), public.cancel_mentor_session(UUID, TEXT),
  public.set_session_link(UUID, TEXT), public.review_mentor_session(UUID, INTEGER, TEXT), public.mentor_ratings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_mentor_session(UUID, TEXT, TEXT), public.cancel_mentor_session(UUID, TEXT),
  public.set_session_link(UUID, TEXT), public.review_mentor_session(UUID, INTEGER, TEXT), public.mentor_ratings() TO authenticated;
