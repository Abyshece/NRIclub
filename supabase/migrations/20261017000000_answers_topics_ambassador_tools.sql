-- ============================================================================
-- NRIclub: answers, thanks, urgent help, "Ask me about", professionals,
-- starter posts, language and university groups, city stats (2026-10-17)
--
--   * Ask: the asker marks the best answer (the question then counts as
--     answered); members thank helpful answers (public.answer_thanks);
--     urgent questions alert members of the asker's city and its ambassador
--     (one urgent question per member a day). Questions keep the asker's
--     city, so open questions can be shown to members nearby.
--   * Notifications the database sends by itself: an answer to your
--     question, a thank-you, your answer chosen as the best, someone going
--     to your event, an urgent question in your city, and (for ambassadors)
--     a new member in their city.
--   * profiles.ask_me_about: up to five topics a member can help with.
--   * Places: doctors, tax and accounts, lawyers and driving schools, with
--     the languages they speak.
--   * groups.pinned_post_id: a starter post at the top of a group, pinned by
--     an admin or by the city's ambassador (public.pin_group_post).
--   * Group categories 'Language' and 'University', and language groups.
--   * public.admin_city_stats(): members and activity per city, for admins.
--   * public.city_summary() also finds a city by its address form
--     ("new-york" for New York).
-- Needs the 2026-10-15 (places) and 2026-10-16 (ambassadors) changes.
-- No existing rows change, apart from adding the language groups.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- NOTIFICATION TYPES
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications
  DROP CONSTRAINT notifications_type_check,
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'like', 'comment', 'request', 'event', 'group', 'trending', 'message', 'verification',
    'answer', 'thanks', 'best', 'rsvp', 'urgent', 'member'));

-- Sends one notification, unless it's to yourself or one of the two blocked
-- the other. Used by the triggers below (never by members directly).
CREATE FUNCTION private.notify(p_user UUID, p_type TEXT, p_actor UUID, p_text TEXT, p_ref UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.notifications (user_id, type, actor_id, text, reference_id)
  SELECT p_user, p_type, p_actor, LEFT(p_text, 1000), p_ref
  WHERE p_user IS NOT NULL AND p_user IS DISTINCT FROM p_actor
    AND (p_actor IS NULL OR NOT private.is_blocked_between(p_actor, p_user));
$$;

-- "Your question" in a notification: the title, shortened.
CREATE FUNCTION private.short_title(p_title TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN char_length(p_title) > 80 THEN LEFT(p_title, 77) || '...' ELSE p_title END;
$$;

-- The city group's name for a city, compared without case.
CREATE FUNCTION private.city_group_name(p_city TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT lower('Indians in ' || btrim(p_city));
$$;

-- ---------------------------------------------------------------------------
-- ASK: city, best answer, urgent
-- ---------------------------------------------------------------------------
ALTER TABLE public.help_requests
  ADD COLUMN city TEXT NOT NULL DEFAULT '' CHECK (char_length(city) <= 200),
  ADD COLUMN urgent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN best_response_id UUID REFERENCES public.help_responses(id) ON DELETE SET NULL;
CREATE INDEX idx_help_requests_city ON public.help_requests (lower(city));
CREATE INDEX idx_help_requests_best_response ON public.help_requests(best_response_id);

-- The asker can't change who asked, the counts, the city or "urgent" later
-- (urgent alerts go out once, when the question is posted).
DROP TRIGGER protect_columns ON public.help_requests;
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.help_requests
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns(
    '{"responses_count": 0, "status": "Open", "best_response_id": null}',
    'user_id', 'responses_count', 'created_at', 'city', 'urgent');

-- New question: the city is the asker's own; one urgent question a day.
-- Best answer: it must be an answer to this question, and the question's
-- status follows it (Resolved with a best answer, Open without).
CREATE FUNCTION private.check_help_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.city := COALESCE((SELECT p.city FROM public.profiles p WHERE p.id = NEW.user_id), '');
    IF NEW.urgent AND EXISTS (
      SELECT 1 FROM public.help_requests h
      WHERE h.user_id = NEW.user_id AND h.urgent AND h.created_at > NOW() - INTERVAL '1 day'
    ) THEN
      RAISE EXCEPTION 'You can post one urgent question a day.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.best_response_id IS DISTINCT FROM OLD.best_response_id THEN
    IF NEW.best_response_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.help_responses r WHERE r.id = NEW.best_response_id AND r.request_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'That answer belongs to another question.' USING ERRCODE = '23514';
    END IF;
    NEW.status := CASE WHEN NEW.best_response_id IS NULL THEN 'Open' ELSE 'Resolved' END;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER check_help_request BEFORE INSERT OR UPDATE ON public.help_requests
  FOR EACH ROW EXECUTE FUNCTION private.check_help_request();

-- Urgent question: members of the asker's city group and the city's
-- ambassadors hear about it (at most 500 people).
CREATE FUNCTION private.notify_urgent_question()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  asker TEXT := COALESCE((SELECT p.name FROM public.profiles p WHERE p.id = NEW.user_id), 'A member');
BEGIN
  IF NOT NEW.urgent OR NEW.city = '' THEN
    RETURN NULL;
  END IF;
  PERFORM private.notify(r.user_id, 'urgent', NEW.user_id,
    'needs urgent help in ' || NEW.city || ': ' || private.short_title(NEW.title), NEW.id)
  FROM (
    SELECT gm.user_id FROM public.group_members gm
    JOIN public.groups g ON g.id = gm.group_id
    WHERE g.is_approved AND lower(g.name) = private.city_group_name(NEW.city)
    UNION
    SELECT p.id FROM public.profiles p
    WHERE p.ambassador_city <> '' AND lower(p.ambassador_city) = lower(btrim(NEW.city))
    LIMIT 500
  ) r;
  RETURN NULL;
END;
$$;
CREATE TRIGGER notify_urgent_question AFTER INSERT ON public.help_requests
  FOR EACH ROW EXECUTE FUNCTION private.notify_urgent_question();

-- Best answer chosen: its author hears about it.
CREATE FUNCTION private.notify_best_answer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.best_response_id IS NOT NULL AND NEW.best_response_id IS DISTINCT FROM OLD.best_response_id THEN
    PERFORM private.notify(r.user_id, 'best', NEW.user_id,
      'chose your answer as the best answer: ' || private.short_title(NEW.title), NEW.id)
    FROM public.help_responses r WHERE r.id = NEW.best_response_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER notify_best_answer AFTER UPDATE OF best_response_id ON public.help_requests
  FOR EACH ROW EXECUTE FUNCTION private.notify_best_answer();

-- A new answer: the asker hears about it.
CREATE FUNCTION private.notify_new_answer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.notify(h.user_id, 'answer', NEW.user_id,
    'answered your question: ' || private.short_title(h.title), h.id)
  FROM public.help_requests h WHERE h.id = NEW.request_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER notify_new_answer AFTER INSERT ON public.help_responses
  FOR EACH ROW EXECUTE FUNCTION private.notify_new_answer();

-- ---------------------------------------------------------------------------
-- THANKS FOR AN ANSWER
-- ---------------------------------------------------------------------------
ALTER TABLE public.help_responses
  ADD COLUMN thanks_count INTEGER NOT NULL DEFAULT 0;
DROP TRIGGER protect_columns ON public.help_responses;
CREATE TRIGGER protect_columns BEFORE INSERT ON public.help_responses
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{"thanks_count": 0}');

CREATE TABLE public.answer_thanks (
  response_id UUID NOT NULL REFERENCES public.help_responses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (response_id, user_id)
);
CREATE INDEX idx_answer_thanks_user ON public.answer_thanks(user_id);
ALTER TABLE public.answer_thanks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.answer_thanks FROM anon;

CREATE POLICY "Members can view thanks" ON public.answer_thanks
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT private.can_browse()));
CREATE POLICY "Members can thank other members' answers" ON public.answer_thanks
  FOR INSERT TO authenticated WITH CHECK (
    user_id = (SELECT auth.uid()) AND (SELECT private.is_active_member())
    AND EXISTS (SELECT 1 FROM public.help_responses r
                WHERE r.id = response_id AND r.user_id <> (SELECT auth.uid())));
CREATE POLICY "Members can take back thanks" ON public.answer_thanks
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE TRIGGER protect_columns BEFORE INSERT ON public.answer_thanks
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{}');

-- Keeps help_responses.thanks_count, and tells the answer's author.
CREATE FUNCTION private.update_thanks_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.help_responses SET thanks_count = thanks_count + 1 WHERE id = NEW.response_id;
    PERFORM private.notify(r.user_id, 'thanks', NEW.user_id,
      'thanked you for your answer: ' || private.short_title(h.title), h.id)
    FROM public.help_responses r JOIN public.help_requests h ON h.id = r.request_id
    WHERE r.id = NEW.response_id;
  ELSE
    UPDATE public.help_responses SET thanks_count = GREATEST(thanks_count - 1, 0) WHERE id = OLD.response_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER update_thanks_count AFTER INSERT OR DELETE ON public.answer_thanks
  FOR EACH ROW EXECUTE FUNCTION private.update_thanks_count();

-- How many members thanked this member for an answer ("Helped 12 members").
CREATE FUNCTION public.member_helped_count(p_member UUID)
RETURNS INTEGER LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT count(DISTINCT t.user_id)::INTEGER
  FROM public.answer_thanks t JOIN public.help_responses r ON r.id = t.response_id
  WHERE r.user_id = p_member;
$$;

-- ---------------------------------------------------------------------------
-- EVENTS: the organizer hears who is going
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.notify_rsvp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Going, not going, going again: one notification, not three.
  DELETE FROM public.notifications n
  WHERE n.type = 'rsvp' AND n.actor_id = NEW.user_id AND n.reference_id = NEW.event_id;
  PERFORM private.notify(e.organizer_id, 'rsvp', NEW.user_id,
    'is going to ' || private.short_title(e.title), e.id)
  FROM public.events e WHERE e.id = NEW.event_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER notify_rsvp AFTER INSERT ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION private.notify_rsvp();

-- ---------------------------------------------------------------------------
-- AMBASSADORS: a new member in their city
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.notify_new_city_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.notify(p.id, 'member', NEW.user_id,
    'joined ' || g.name || '. Say hello!', g.id)
  FROM public.groups g
  JOIN public.profiles p ON p.ambassador_city <> '' AND private.city_group_name(p.ambassador_city) = lower(g.name)
  WHERE g.id = NEW.group_id AND g.category = 'City';
  RETURN NULL;
END;
$$;
CREATE TRIGGER notify_new_city_member AFTER INSERT ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION private.notify_new_city_member();

-- ---------------------------------------------------------------------------
-- "ASK ME ABOUT" (up to five topics, separated by commas)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN ask_me_about TEXT NOT NULL DEFAULT '' CHECK (char_length(ask_me_about) <= 300);

-- ---------------------------------------------------------------------------
-- PLACES: professionals, and the languages they speak
-- ---------------------------------------------------------------------------
ALTER TABLE public.places
  DROP CONSTRAINT places_kind_check,
  ADD CONSTRAINT places_kind_check CHECK (kind IN (
    'Grocery', 'Restaurant', 'Temple', 'Shop', 'Doctor', 'Tax & accounts', 'Lawyer', 'Driving school', 'Other')),
  ADD COLUMN languages TEXT NOT NULL DEFAULT '' CHECK (char_length(languages) <= 100);

-- ---------------------------------------------------------------------------
-- GROUPS: starter post, new categories, language groups
-- ---------------------------------------------------------------------------
ALTER TABLE public.groups
  DROP CONSTRAINT groups_category_check,
  ADD CONSTRAINT groups_category_check CHECK (category IN (
    'City', 'Professional', 'Interest', 'Support', 'Language', 'University')),
  ADD COLUMN pinned_post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;
CREATE INDEX idx_groups_pinned_post ON public.groups(pinned_post_id);
DROP TRIGGER protect_columns ON public.groups;
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns(
    '{"is_approved": false, "members_count": 0, "pinned_post_id": null}',
    'created_by', 'is_approved', 'members_count', 'created_at', 'pinned_post_id');

-- Pins one of the group's posts at the top (NULL unpins). Admins can pin in
-- any group; an ambassador in their own city's group.
CREATE FUNCTION public.pin_group_post(p_group UUID, p_post UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := (SELECT auth.uid());
BEGIN
  IF NOT (private.is_admin() OR (private.is_active_member() AND EXISTS (
    SELECT 1 FROM public.groups g JOIN public.profiles p ON p.id = me
    WHERE g.id = p_group AND g.category = 'City' AND p.ambassador_city <> ''
      AND lower(g.name) = private.city_group_name(p.ambassador_city)))) THEN
    RAISE EXCEPTION 'Only the city''s ambassador can pin posts here.' USING ERRCODE = '42501';
  END IF;
  IF p_post IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.posts x WHERE x.id = p_post AND x.group_id = p_group
  ) THEN
    RAISE EXCEPTION 'That post isn''t in this group.' USING ERRCODE = '23514';
  END IF;
  UPDATE public.groups SET pinned_post_id = p_post WHERE id = p_group;
END;
$$;

INSERT INTO public.groups (name, description, category, is_approved) VALUES
  ('Tamil community', 'For Tamil speakers living outside India: language, food, festivals and friends.', 'Language', true),
  ('Telugu community', 'For Telugu speakers living outside India: language, food, festivals and friends.', 'Language', true),
  ('Malayali community', 'For Malayalis living outside India: Onam, food, films and friends.', 'Language', true),
  ('Kannada community', 'For Kannada speakers living outside India: language, food, festivals and friends.', 'Language', true),
  ('Bengali community', 'For Bengalis living outside India: Durga Puja, food, books and friends.', 'Language', true),
  ('Gujarati community', 'For Gujaratis living outside India: Navratri, food, business and friends.', 'Language', true),
  ('Marathi community', 'For Marathi speakers living outside India: Ganeshotsav, food and friends.', 'Language', true),
  ('Punjabi community', 'For Punjabis living outside India: Baisakhi, gurdwaras, food and friends.', 'Language', true),
  ('Hindi speakers', 'For Hindi speakers living outside India: films, books, festivals and friends.', 'Language', true),
  ('Odia community', 'For Odia speakers living outside India: Rath Yatra, food and friends.', 'Language', true),
  ('Parents'' corner', 'For parents visiting their children abroad, and for families planning a visit: travel, insurance, meeting other parents.', 'Support', true),
  ('Indian students abroad', 'For Indian students everywhere: admissions, visas, part-time jobs, housing and your first months abroad.', 'University', true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- CITY PAGES: find a city by its address form too ("new-york")
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.slug(p_text TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT btrim(regexp_replace(lower(COALESCE(p_text, '')), '[^[:alnum:]]+', '-', 'g'), '-');
$$;

CREATE OR REPLACE FUNCTION public.city_summary(p_city TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH q AS (SELECT LEFT(btrim(COALESCE(p_city, '')), 100) AS raw),
  grp AS (
    SELECT x.name, x.members_count FROM public.groups x, q
    WHERE x.is_approved AND x.category = 'City'
      AND private.slug(x.name) = private.slug('Indians in ' || q.raw)
    ORDER BY x.members_count DESC LIMIT 1
  ),
  c AS (
    SELECT COALESCE((SELECT substr(grp.name, 12) FROM grp), replace(q.raw, '-', ' ')) AS city FROM q WHERE q.raw <> ''
  )
  SELECT jsonb_build_object(
    'city', c.city,
    'group', EXISTS (SELECT 1 FROM grp),
    'members', COALESCE((SELECT grp.members_count FROM grp), 0),
    'events', (SELECT count(*) FROM public.events e WHERE e.location ILIKE '%' || c.city || '%' OR e.city ILIKE c.city),
    'places', (SELECT count(*) FROM public.places p WHERE lower(p.city) = lower(c.city))
  )
  FROM c;
$$;

-- ---------------------------------------------------------------------------
-- ADMIN: members and activity per city
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_city_stats()
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
    (SELECT count(*)::INTEGER FROM public.events e WHERE e.date >= to_char(CURRENT_DATE, 'YYYY-MM-DD') AND (e.city ILIKE substr(g.name, 12) OR e.location ILIKE '%' || substr(g.name, 12) || '%')),
    COALESCE((SELECT string_agg(p.name, ', ' ORDER BY p.name) FROM public.profiles p
              WHERE p.ambassador_city <> '' AND private.city_group_name(p.ambassador_city) = lower(g.name)), '')
  FROM public.groups g
  WHERE g.is_approved AND g.category = 'City'
  ORDER BY g.members_count DESC, g.name;
END;
$$;

-- ---------------------------------------------------------------------------
-- "DOWNLOAD MY DATA" also includes hidden conversations, places, place
-- recommendations and thanks
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
      FROM public.answer_thanks x WHERE x.user_id = uid), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- PERMISSIONS
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.notify(UUID, TEXT, UUID, TEXT, UUID), private.short_title(TEXT),
  private.city_group_name(TEXT), private.check_help_request(), private.notify_urgent_question(),
  private.notify_best_answer(), private.notify_new_answer(), private.update_thanks_count(),
  private.notify_rsvp(), private.notify_new_city_member(), private.slug(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.check_help_request(), private.notify_urgent_question(),
  private.notify_best_answer(), private.notify_new_answer(), private.update_thanks_count(),
  private.notify_rsvp(), private.notify_new_city_member() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.notify(UUID, TEXT, UUID, TEXT, UUID), private.short_title(TEXT),
  private.city_group_name(TEXT), private.slug(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.member_helped_count(UUID), public.pin_group_post(UUID, UUID),
  public.admin_city_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_helped_count(UUID), public.pin_group_post(UUID, UUID),
  public.admin_city_stats() TO authenticated;
