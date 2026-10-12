-- ============================================================================
-- NRIclub database schema
--
-- Apply to a fresh Supabase project with `supabase db push`, or paste into the
-- SQL editor. Seed data lives in supabase/seed.sql.
--
-- Security model
--   * Every table has RLS. Policies are granted to `authenticated` only; the
--     anon role has no table access at all (the landing page needs no data).
--   * Admins are rows in public.admins. Policies check private.is_admin(),
--     which reads that table server-side, so admin rights can't be faked from
--     the browser.
--   * Columns the server owns (counters, approval/verification flags, owners)
--     are reset by private.protect_columns() when a non-admin writes them
--     through the API.
--   * Helper functions live in the `private` schema, which is not exposed by
--     the API, so they can't be called as RPCs.
--   * New members verify their identity: signup leaves them 'incomplete';
--     public.submit_verification() moves them to 'pending'; an admin decides
--     with public.review_member() (approved / needs_info / rejected).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

-- ============================================================================
-- TABLES
-- ============================================================================

-- Admins: membership grants access to the admin dashboard and moderation.
-- Add one with: INSERT INTO public.admins (user_id) SELECT id FROM auth.users WHERE email = '...';
CREATE TABLE public.admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Public profile: readable by every signed-in member.
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '' CHECK (char_length(avatar_url) <= 2048),
  location TEXT NOT NULL DEFAULT '' CHECK (char_length(location) <= 200),
  hometown TEXT NOT NULL DEFAULT '' CHECK (char_length(hometown) <= 200),
  profession TEXT NOT NULL DEFAULT '' CHECK (char_length(profession) <= 200),
  occupation_status TEXT NOT NULL DEFAULT '' CHECK (char_length(occupation_status) <= 100),
  years_abroad TEXT NOT NULL DEFAULT '' CHECK (char_length(years_abroad) <= 100),
  linkedin_url TEXT NOT NULL DEFAULT '' CHECK (char_length(linkedin_url) <= 500),
  city TEXT NOT NULL DEFAULT '' CHECK (char_length(city) <= 200),
  country_code TEXT NOT NULL DEFAULT '' CHECK (country_code ~ '^([A-Z]{2})?$'), -- ISO 3166-1 alpha-2
  bio TEXT NOT NULL DEFAULT '',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,   -- mirrors auth.users.email_confirmed_at
  -- The Verified badge: mirrors profile_private.verification_status = 'approved'.
  linkedin_verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_active TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT profiles_name_length CHECK (char_length(name) <= 200),
  CONSTRAINT profiles_bio_length CHECK (char_length(bio) <= 2000)
);

-- Private profile data: only the owner and admins can read it.
CREATE TABLE public.profile_private (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT,                                       -- mirrors auth.users.email
  gdpr_consent BOOLEAN NOT NULL DEFAULT FALSE,
  gdpr_consent_date TIMESTAMPTZ,                    -- stamped server-side
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  -- incomplete: signed up, hasn't submitted verification details yet
  -- pending: waiting for an admin; needs_info: admin asked for more
  verification_status TEXT NOT NULL DEFAULT 'incomplete'
    CHECK (verification_status IN ('incomplete', 'pending', 'needs_info', 'approved', 'rejected')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')), -- moderation
  age_confirmed_at TIMESTAMPTZ,                     -- "I'm 18 or older", at signup
  terms_accepted_at TIMESTAMPTZ,
  terms_version TEXT CHECK (char_length(terms_version) <= 20),
  -- Verification details only the member and admins see.
  verification_note TEXT NOT NULL DEFAULT '' CHECK (char_length(verification_note) <= 1000), -- no-LinkedIn explanation
  voucher TEXT NOT NULL DEFAULT '' CHECK (char_length(voucher) <= 200),                      -- member who can vouch
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  verification_message TEXT NOT NULL DEFAULT '' CHECK (char_length(verification_message) <= 1000), -- from the admin
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- History of verification decisions (admins only).
CREATE TABLE public.verification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('submitted', 'approved', 'needs_info', 'rejected', 'pending')),
  member_message TEXT NOT NULL DEFAULT '' CHECK (char_length(member_message) <= 1000),
  admin_note TEXT NOT NULL DEFAULT '' CHECK (char_length(admin_note) <= 2000),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_verification_log_member ON public.verification_log(member_id, created_at DESC);
CREATE INDEX idx_verification_log_actor ON public.verification_log(actor_id);

-- Privacy and notification preferences. Only the owner (and admins) can read
-- a row; other members see the public part via public.get_member_preferences().
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  profile_visibility TEXT NOT NULL DEFAULT 'Everyone' CHECK (profile_visibility IN ('Everyone', 'Connections Only', 'Only Me')),
  online_status BOOLEAN NOT NULL DEFAULT TRUE,
  namaste_requests TEXT NOT NULL DEFAULT 'Everyone' CHECK (namaste_requests IN ('Everyone', 'Nobody')),
  receive_messages TEXT NOT NULL DEFAULT 'Everyone' CHECK (receive_messages IN ('Everyone', 'Connections Only', 'Nobody')),
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  push_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  marketing_emails BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (char_length(name) <= 200),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  category TEXT NOT NULL DEFAULT 'City' CHECK (category IN ('City', 'Professional', 'Interest', 'Support')),
  image_url TEXT NOT NULL DEFAULT '' CHECK (char_length(image_url) <= 2048),
  members_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_groups_created_by ON public.groups(created_by);

CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin', 'moderator')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);
CREATE INDEX idx_group_members_user ON public.group_members(user_id);

CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 10000),
  image_url TEXT CHECK (char_length(image_url) <= 2048),
  tags TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 30 AND char_length(array_to_string(tags, '')) <= 1500),
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_posts_user_id ON public.posts(user_id);
CREATE INDEX idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX idx_posts_group_id ON public.posts(group_id);

CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_comments_post_id ON public.comments(post_id);
CREATE INDEX idx_comments_user_id ON public.comments(user_id);

CREATE TABLE public.likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);
CREATE INDEX idx_likes_user_id ON public.likes(user_id);

-- Namaste requests. 'blocked' is what the UI stores when a request is ignored.
CREATE TABLE public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requester_id, recipient_id),
  CHECK (requester_id <> recipient_id)
);
CREATE INDEX idx_connections_recipient ON public.connections(recipient_id);

-- date/time are free text: the UI stores e.g. 'Mar 25, 2026 • 10:00 AM' and 'TBD'.
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) <= 300),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 10000),
  date TEXT NOT NULL CHECK (char_length(date) <= 100),
  time TEXT NOT NULL DEFAULT 'TBD' CHECK (char_length(time) <= 100),
  location TEXT NOT NULL DEFAULT '' CHECK (char_length(location) <= 300),
  city TEXT NOT NULL DEFAULT '' CHECK (char_length(city) <= 200),
  image_url TEXT NOT NULL DEFAULT '' CHECK (char_length(image_url) <= 2048),
  link TEXT NOT NULL DEFAULT '' CHECK (char_length(link) <= 2048),
  attendees_count INTEGER NOT NULL DEFAULT 0,
  organizer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  organizer_name TEXT NOT NULL DEFAULT '' CHECK (char_length(organizer_name) <= 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_events_organizer ON public.events(organizer_id);

CREATE TABLE public.event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);
CREATE INDEX idx_event_rsvps_user ON public.event_rsvps(user_id);

CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_2 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_text TEXT NOT NULL DEFAULT '',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (participant_1 <> participant_2)
);
-- One conversation per pair, whichever way round it was opened.
CREATE UNIQUE INDEX conversations_pair_key ON public.conversations (LEAST(participant_1, participant_2), GREATEST(participant_1, participant_2));
CREATE INDEX idx_conversations_p1 ON public.conversations(participant_1);
CREATE INDEX idx_conversations_p2 ON public.conversations(participant_2);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);

-- image_url holds a JSON array of photo URLs (or a single URL).
CREATE TABLE public.marketplace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) <= 300),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 10000),
  price TEXT NOT NULL CHECK (char_length(price) <= 100),
  category TEXT NOT NULL DEFAULT 'Items' CHECK (category IN ('Housing', 'Jobs', 'Items', 'Vehicles', 'Services')),
  location TEXT NOT NULL DEFAULT '' CHECK (char_length(location) <= 200),
  image_url TEXT NOT NULL DEFAULT '' CHECK (char_length(image_url) <= 20000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_marketplace_user ON public.marketplace(user_id);
CREATE INDEX idx_marketplace_category ON public.marketplace(category);

CREATE TABLE public.docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) <= 300),
  excerpt TEXT NOT NULL DEFAULT '' CHECK (char_length(excerpt) <= 50000),
  content TEXT NOT NULL DEFAULT '' CHECK (char_length(content) <= 50000),
  category TEXT NOT NULL DEFAULT 'General' CHECK (char_length(category) <= 100),
  city TEXT NOT NULL DEFAULT '' CHECK (char_length(city) <= 200),
  read_time TEXT NOT NULL DEFAULT '1 min read' CHECK (char_length(read_time) <= 50),
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_docs_user ON public.docs(user_id);

CREATE TABLE public.doc_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES public.docs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_doc_comments_doc ON public.doc_comments(doc_id);
CREATE INDEX idx_doc_comments_user ON public.doc_comments(user_id);

CREATE TABLE public.help_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) <= 300),
  description TEXT NOT NULL CHECK (char_length(description) <= 10000),
  category TEXT NOT NULL DEFAULT 'General' CHECK (char_length(category) <= 100),
  urgency TEXT NOT NULL DEFAULT 'Low' CHECK (urgency IN ('Low', 'Medium', 'High')),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Resolved')),
  responses_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_help_requests_user ON public.help_requests(user_id);

CREATE TABLE public.help_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.help_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_help_responses_request ON public.help_responses(request_id);
CREATE INDEX idx_help_responses_user ON public.help_responses(user_id);

-- reference_id points at a post (like/comment) or a connection (request).
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('like', 'comment', 'request', 'event', 'group', 'trending', 'message', 'verification')),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) <= 1000),
  read BOOLEAN NOT NULL DEFAULT FALSE,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_actor ON public.notifications(actor_id);

-- reported_post_id holds the id of whatever was reported (post, doc, event,
-- help request, marketplace item); the reason prefix ('[DOC] ...') says which.
-- Bug reports also live here with a '[BUG]' prefix.
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reported_post_id UUID,
  reason TEXT NOT NULL CHECK (char_length(reason) <= 5000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reports_reporter ON public.reports(reporter_id);
CREATE INDEX idx_reports_reported_user ON public.reports(reported_user_id);

CREATE TABLE public.blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX idx_blocks_blocked ON public.blocks(blocked_id);

-- ============================================================================
-- HELPER FUNCTIONS (private schema: usable in policies, not callable as RPCs)
-- ============================================================================

CREATE FUNCTION private.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.admins WHERE user_id = (SELECT auth.uid()));
$$;

-- True for members who submitted their verification details (pending,
-- needs_info or approved) and aren't blocked. Members who haven't finished
-- signing up, were rejected or are blocked can still sign in and edit their
-- profile, but can't create content or contact anyone.
CREATE FUNCTION private.is_active_member()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_private
    WHERE id = (SELECT auth.uid()) AND status = 'active'
      AND verification_status IN ('pending', 'needs_info', 'approved')
  );
$$;

-- 'https://www.linkedin.com/in/<slug>' for anything that is a LinkedIn
-- profile link (with or without https://, www., a country subdomain, a
-- trailing slash or a query string); NULL for anything else.
CREATE FUNCTION private.normalize_linkedin(url TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT 'https://www.linkedin.com/in/' || lower(m[1])
  FROM regexp_match(
    btrim(COALESCE(url, '')),
    '^(?:https?://)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com/in/([a-z0-9%_.-]{3,100})/?(?:[?#].*)?$',
    'i') AS m;
$$;

CREATE FUNCTION private.is_blocked_between(a UUID, b UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a)
  );
$$;

CREATE FUNCTION private.are_connected(a UUID, b UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.connections
    WHERE status = 'accepted'
      AND ((requester_id = a AND recipient_id = b) OR (requester_id = b AND recipient_id = a))
  );
$$;

-- Honours blocks and the recipient's "Receive messages" setting.
CREATE FUNCTION private.can_message(sender UUID, recipient UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT private.is_blocked_between(sender, recipient)
    AND COALESCE((
      SELECT CASE s.receive_messages
        WHEN 'Nobody' THEN FALSE
        WHEN 'Connections Only' THEN private.are_connected(sender, recipient)
        ELSE TRUE
      END
      FROM public.user_settings s WHERE s.user_id = recipient
    ), TRUE);
$$;

-- Honours blocks and the recipient's "Namaste requests" setting.
CREATE FUNCTION private.can_request(requester UUID, recipient UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT private.is_blocked_between(requester, recipient)
    AND COALESCE((SELECT s.namaste_requests <> 'Nobody' FROM public.user_settings s WHERE s.user_id = recipient), TRUE);
$$;

CREATE FUNCTION private.is_conversation_participant(convo UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = convo AND (SELECT auth.uid()) IN (participant_1, participant_2)
  );
$$;

CREATE FUNCTION private.conversation_partner(convo UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN participant_1 = (SELECT auth.uid()) THEN participant_2 ELSE participant_1 END
  FROM public.conversations WHERE id = convo;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO anon, authenticated, service_role;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Server-owned columns. For writes made through the API by a member (not an
-- admin): on INSERT, TG_ARGV[0] (a JSON object) overrides the given columns;
-- on UPDATE, the columns named in TG_ARGV[1..] keep their old values.
-- SECURITY INVOKER on purpose: current_user is the API role here, while the
-- SECURITY DEFINER counter triggers below run as the owner and pass through.
CREATE FUNCTION private.protect_columns()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  locked JSONB;
BEGIN
  IF current_user <> 'authenticated' OR private.is_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW := jsonb_populate_record(NEW, TG_ARGV[0]::jsonb);
  ELSIF TG_NARGS > 1 THEN
    SELECT jsonb_object_agg(col, to_jsonb(OLD) -> col) INTO locked
    FROM unnest(TG_ARGV[1:TG_NARGS - 1]) AS col;
    NEW := jsonb_populate_record(NEW, locked);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns(
    '{"linkedin_verified": false, "email_verified": false}',
    'id', 'linkedin_verified', 'email_verified', 'created_at');
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns(
    '{"verification_status": "incomplete", "status": "active", "age_confirmed_at": null, "terms_accepted_at": null, "terms_version": null, "submitted_at": null, "reviewed_at": null, "verification_message": "", "verification_note": "", "voucher": ""}',
    'id', 'email', 'verification_status', 'status', 'age_confirmed_at', 'terms_accepted_at', 'terms_version',
    'verification_note', 'voucher', 'submitted_at', 'reviewed_at', 'verification_message', 'created_at');
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{}', 'user_id');
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns(
    '{"is_approved": false, "members_count": 0}', 'created_by', 'is_approved', 'members_count', 'created_at');
CREATE TRIGGER protect_columns BEFORE INSERT ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{"role": "member"}');
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns(
    '{"likes_count": 0, "comments_count": 0}', 'user_id', 'likes_count', 'comments_count', 'created_at');
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns(
    '{"status": "pending"}', 'requester_id', 'recipient_id', 'created_at');
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns(
    '{"attendees_count": 0}', 'organizer_id', 'attendees_count', 'created_at');
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.marketplace
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{}', 'user_id', 'created_at');
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.docs
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns(
    '{"likes_count": 0}', 'user_id', 'likes_count', 'created_at');
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.help_requests
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns(
    '{"responses_count": 0, "status": "Open"}', 'user_id', 'responses_count', 'created_at');
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns(
    '{"read": false}', 'user_id', 'type', 'actor_id', 'text', 'reference_id', 'created_at');
CREATE TRIGGER protect_columns BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{"status": "pending"}');

CREATE FUNCTION private.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- Record when GDPR consent was given, using the server clock.
CREATE FUNCTION private.stamp_gdpr_consent()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.gdpr_consent IS DISTINCT FROM OLD.gdpr_consent THEN
    NEW.gdpr_consent_date := CASE WHEN NEW.gdpr_consent THEN NOW() END;
  ELSE
    NEW.gdpr_consent_date := OLD.gdpr_consent_date;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stamp_gdpr_consent BEFORE INSERT OR UPDATE ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION private.stamp_gdpr_consent();

-- When a member edits their own profile: store LinkedIn links in one format
-- (runs after protect_columns; triggers fire in name order) ...
CREATE FUNCTION private.normalize_profile_linkedin()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (SELECT auth.uid()) IS DISTINCT FROM NEW.id OR private.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.linkedin_url IS DISTINCT FROM OLD.linkedin_url AND NEW.linkedin_url <> '' THEN
    NEW.linkedin_url := private.normalize_linkedin(NEW.linkedin_url);
    IF NEW.linkedin_url IS NULL THEN
      RAISE EXCEPTION 'That doesn''t look like a LinkedIn profile link (linkedin.com/in/your-name).' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER verification_linkedin BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.normalize_profile_linkedin();

-- ... and send an approved member back to review if they change their name
-- or LinkedIn (their identity is what the admin approved). An AFTER trigger,
-- because the status change updates this profile row again (the badge).
CREATE FUNCTION private.reverify_on_identity_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT auth.uid()) IS DISTINCT FROM NEW.id OR private.is_admin() THEN
    RETURN NULL;
  END IF;
  IF (NEW.linkedin_url IS DISTINCT FROM OLD.linkedin_url OR NEW.name IS DISTINCT FROM OLD.name)
     AND EXISTS (SELECT 1 FROM public.profile_private WHERE id = NEW.id AND verification_status = 'approved') THEN
    UPDATE public.profile_private SET verification_status = 'pending', submitted_at = NOW() WHERE id = NEW.id;
    INSERT INTO public.verification_log (member_id, decision, admin_note, actor_id)
    VALUES (NEW.id, 'submitted', 'Changed their name or LinkedIn after approval.', NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER verification_review AFTER UPDATE OF name, linkedin_url ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.reverify_on_identity_change();

-- profiles.linkedin_verified is the public Verified badge; the status
-- itself stays private.
CREATE FUNCTION private.sync_linkedin_verified()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.profiles SET linkedin_verified = (NEW.verification_status = 'approved')
  WHERE id = NEW.id AND linkedin_verified IS DISTINCT FROM (NEW.verification_status = 'approved');
  RETURN NULL;
END;
$$;

CREATE TRIGGER verification_sync AFTER INSERT OR UPDATE OF verification_status ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION private.sync_linkedin_verified();

-- Create the profile rows when someone signs up. The signup form passes its
-- fields as user metadata, so the profile is complete before email
-- verification (when the user has no session yet and can't write it).
CREATE FUNCTION private.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  INSERT INTO public.profiles (id, name, location, hometown, profession, occupation_status, years_abroad,
    linkedin_url, country_code, email_verified)
  VALUES (
    NEW.id,
    LEFT(COALESCE(NULLIF(BTRIM(meta ->> 'full_name'), ''), NULLIF(BTRIM(meta ->> 'name'), ''), SPLIT_PART(NEW.email, '@', 1), ''), 200),
    LEFT(BTRIM(COALESCE(meta ->> 'location', '')), 200),
    LEFT(BTRIM(COALESCE(meta ->> 'hometown', '')), 200),
    LEFT(BTRIM(COALESCE(meta ->> 'profession', '')), 200),
    LEFT(BTRIM(COALESCE(meta ->> 'occupation_status', '')), 100),
    LEFT(COALESCE(meta ->> 'years_abroad', ''), 100),
    COALESCE(private.normalize_linkedin(meta ->> 'linkedin_url'), ''),
    CASE WHEN UPPER(COALESCE(meta ->> 'country_code', '')) ~ '^[A-Z]{2}$' THEN UPPER(meta ->> 'country_code') ELSE '' END,
    NEW.email_confirmed_at IS NOT NULL
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profile_private (id, email, gdpr_consent, marketing_consent,
    age_confirmed_at, terms_accepted_at, terms_version)
  VALUES (NEW.id, NEW.email,
    COALESCE(meta ->> 'gdpr_consent', '') = 'true',
    COALESCE(meta ->> 'marketing_consent', '') = 'true',
    CASE WHEN COALESCE(meta ->> 'age_confirmed', '') = 'true' THEN NOW() END,
    CASE WHEN COALESCE(meta ->> 'terms_version', '') <> '' THEN NOW() END,
    NULLIF(LEFT(COALESCE(meta ->> 'terms_version', ''), 20), ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();

-- Keep the email copy and the verified flag in step with Supabase Auth.
CREATE FUNCTION private.sync_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.profile_private SET email = NEW.email
    WHERE id = NEW.id AND email IS DISTINCT FROM NEW.email;
  UPDATE public.profiles SET email_verified = (NEW.email_confirmed_at IS NOT NULL)
    WHERE id = NEW.id AND email_verified IS DISTINCT FROM (NEW.email_confirmed_at IS NOT NULL);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_updated AFTER UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.sync_auth_user();

-- Denormalised counters, maintained by the database.
CREATE FUNCTION private.update_post_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSE
    UPDATE public.posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER update_post_likes_count AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION private.update_post_likes_count();

CREATE FUNCTION private.update_post_comments_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSE
    UPDATE public.posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER update_post_comments_count AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION private.update_post_comments_count();

CREATE FUNCTION private.update_group_members_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.groups SET members_count = members_count + 1 WHERE id = NEW.group_id;
  ELSE
    UPDATE public.groups SET members_count = GREATEST(members_count - 1, 0) WHERE id = OLD.group_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER update_group_members_count AFTER INSERT OR DELETE ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION private.update_group_members_count();

CREATE FUNCTION private.update_event_attendees_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.events SET attendees_count = attendees_count + 1 WHERE id = NEW.event_id;
  ELSE
    UPDATE public.events SET attendees_count = GREATEST(attendees_count - 1, 0) WHERE id = OLD.event_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER update_event_attendees_count AFTER INSERT OR DELETE ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION private.update_event_attendees_count();

CREATE FUNCTION private.update_help_responses_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.help_requests SET responses_count = responses_count + 1 WHERE id = NEW.request_id;
  ELSE
    UPDATE public.help_requests SET responses_count = GREATEST(responses_count - 1, 0) WHERE id = OLD.request_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER update_help_responses_count AFTER INSERT OR DELETE ON public.help_responses
  FOR EACH ROW EXECUTE FUNCTION private.update_help_responses_count();

CREATE FUNCTION private.update_conversation_last_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.conversations
    SET last_message_text = LEFT(NEW.content, 500), last_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER update_conversation_last_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.update_conversation_last_message();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO anon, authenticated, service_role;

-- ============================================================================
-- RPC: account deletion (removes the auth user; everything else cascades)
-- ============================================================================

CREATE FUNCTION public.delete_my_account()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- RPC: the settings other members need to see before contacting someone.
CREATE FUNCTION public.get_member_preferences(member UUID)
RETURNS TABLE (namaste_requests TEXT, receive_messages TEXT, profile_visibility TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.namaste_requests, s.receive_messages, s.profile_visibility
  FROM public.user_settings s
  WHERE s.user_id = member AND (SELECT auth.uid()) IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_member_preferences(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_preferences(UUID) TO authenticated;

-- ============================================================================
-- RPC: member verification
-- ============================================================================

-- A member submits (or corrects) their verification details: city and
-- country, and a LinkedIn profile link or, without LinkedIn, a short note on
-- how they're connected to the community. Moves them to 'pending'.
-- Members who never confirmed 18+ and the Terms (accounts from before this
-- step existed) confirm them here with p_accept_terms.
CREATE FUNCTION public.submit_verification(
  p_city TEXT, p_country_code TEXT, p_location TEXT,
  p_linkedin_url TEXT, p_note TEXT, p_voucher TEXT, p_profession TEXT,
  p_accept_terms BOOLEAN DEFAULT FALSE)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  current_status TEXT;
  v_linkedin TEXT := NULLIF(BTRIM(COALESCE(p_linkedin_url, '')), '');
  normalized TEXT;
  v_note TEXT := BTRIM(COALESCE(p_note, ''));
  v_city TEXT := BTRIM(COALESCE(p_city, ''));
  v_country TEXT := UPPER(BTRIM(COALESCE(p_country_code, '')));
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  SELECT verification_status INTO current_status FROM public.profile_private WHERE id = uid;
  IF current_status IS NULL OR current_status NOT IN ('incomplete', 'pending', 'needs_info') THEN
    RAISE EXCEPTION 'Your verification can''t be changed right now.' USING ERRCODE = 'P0001';
  END IF;
  IF p_accept_terms THEN
    UPDATE public.profile_private SET
      age_confirmed_at = COALESCE(age_confirmed_at, NOW()),
      terms_accepted_at = COALESCE(terms_accepted_at, NOW()),
      terms_version = COALESCE(terms_version, '2026-10')
    WHERE id = uid;
  END IF;
  IF EXISTS (SELECT 1 FROM public.profile_private
             WHERE id = uid AND (age_confirmed_at IS NULL OR terms_accepted_at IS NULL)) THEN
    RAISE EXCEPTION 'Please confirm you''re 18 or older and accept the Terms of Use.' USING ERRCODE = 'P0001';
  END IF;
  IF v_city = '' OR char_length(v_city) > 200 THEN
    RAISE EXCEPTION 'Please enter the city you live in.' USING ERRCODE = 'P0001';
  END IF;
  IF v_country !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Please choose your country.' USING ERRCODE = 'P0001';
  END IF;
  IF v_linkedin IS NOT NULL THEN
    normalized := private.normalize_linkedin(v_linkedin);
    IF normalized IS NULL THEN
      RAISE EXCEPTION 'That doesn''t look like a LinkedIn profile link (linkedin.com/in/your-name).' USING ERRCODE = 'P0001';
    END IF;
  ELSIF char_length(v_note) < 20 THEN
    RAISE EXCEPTION 'Tell us in a sentence or two how you''re connected to the community.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.profiles SET
    city = v_city,
    country_code = v_country,
    location = LEFT(COALESCE(NULLIF(BTRIM(COALESCE(p_location, '')), ''), v_city), 200),
    linkedin_url = COALESCE(normalized, ''),
    profession = CASE WHEN p_profession IS NULL THEN profession ELSE LEFT(BTRIM(p_profession), 200) END
  WHERE id = uid;
  UPDATE public.profile_private SET
    verification_status = 'pending',
    verification_note = LEFT(v_note, 1000),
    voucher = LEFT(BTRIM(COALESCE(p_voucher, '')), 200),
    submitted_at = NOW()
  WHERE id = uid;
  INSERT INTO public.verification_log (member_id, decision, actor_id) VALUES (uid, 'submitted', uid);
  RETURN 'pending';
END;
$$;

-- An admin decides on a member: approved, needs_info or rejected (a message
-- to the member is required for the last two), or 'pending' to reopen.
-- The member gets a notification.
CREATE FUNCTION public.review_member(p_member UUID, p_decision TEXT, p_message TEXT, p_admin_note TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  message TEXT := LEFT(BTRIM(COALESCE(p_message, '')), 1000);
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved', 'needs_info', 'rejected', 'pending') THEN
    RAISE EXCEPTION 'Unknown decision %', p_decision USING ERRCODE = 'P0001';
  END IF;
  IF p_decision IN ('needs_info', 'rejected') AND message = '' THEN
    RAISE EXCEPTION 'Add a message for the member.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.profile_private SET
    verification_status = p_decision,
    reviewed_at = CASE WHEN p_decision = 'pending' THEN NULL ELSE NOW() END,
    verification_message = CASE WHEN p_decision IN ('needs_info', 'rejected') THEN message ELSE '' END
  WHERE id = p_member;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0001';
  END IF;
  -- Only the latest decision should be waiting in the member's notifications.
  DELETE FROM public.notifications WHERE user_id = p_member AND type = 'verification' AND NOT read;
  INSERT INTO public.verification_log (member_id, decision, member_message, admin_note, actor_id)
  VALUES (p_member, p_decision, message, LEFT(BTRIM(COALESCE(p_admin_note, '')), 2000), auth.uid());

  IF p_decision <> 'pending' THEN
    INSERT INTO public.notifications (user_id, type, text)
    VALUES (p_member, 'verification', CASE p_decision
      WHEN 'approved' THEN 'You''re verified. Welcome to NRIClub!'
      WHEN 'needs_info' THEN LEFT('We need a little more information to verify you: ' || message, 1000)
      ELSE LEFT('Your membership request wasn''t approved: ' || message, 1000)
    END);
  END IF;
  RETURN p_decision;
END;
$$;

-- The admin review queue: everything needed to decide on each member.
CREATE FUNCTION public.admin_verification_queue(p_statuses TEXT[] DEFAULT ARRAY['pending'])
RETURNS TABLE (
  id UUID, name TEXT, avatar_url TEXT, email TEXT, email_verified BOOLEAN,
  city TEXT, country_code TEXT, location TEXT, hometown TEXT, profession TEXT,
  linkedin_url TEXT, verification_note TEXT, voucher TEXT,
  verification_status TEXT, status TEXT, verification_message TEXT,
  created_at TIMESTAMPTZ, submitted_at TIMESTAMPTZ, reviewed_at TIMESTAMPTZ,
  age_confirmed_at TIMESTAMPTZ, terms_accepted_at TIMESTAMPTZ,
  same_linkedin_count INTEGER, previous_decisions INTEGER)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.name, p.avatar_url, pp.email, p.email_verified,
    p.city, p.country_code, p.location, p.hometown, p.profession,
    p.linkedin_url, pp.verification_note, pp.voucher,
    pp.verification_status, pp.status, pp.verification_message,
    p.created_at, pp.submitted_at, pp.reviewed_at,
    pp.age_confirmed_at, pp.terms_accepted_at,
    (SELECT count(*)::int FROM public.profiles o
      WHERE o.id <> p.id AND p.linkedin_url <> '' AND o.linkedin_url = p.linkedin_url),
    (SELECT count(*)::int FROM public.verification_log l
      WHERE l.member_id = p.id AND l.decision IN ('approved', 'needs_info', 'rejected'))
  FROM public.profiles p
  LEFT JOIN public.profile_private pp ON pp.id = p.id
  WHERE pp.verification_status = ANY (p_statuses)
  ORDER BY pp.submitted_at NULLS LAST, p.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_verification(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_member(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_verification_queue(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_verification(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_member(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verification_queue(TEXT[]) TO authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_log ENABLE ROW LEVEL SECURITY;

-- ADMINS: a user can see whether they are an admin; nobody can grant it via the API.
CREATE POLICY "Users can see their own admin row" ON public.admins
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- PROFILES
CREATE POLICY "Members can view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Users can create their own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR private.is_admin())
  WITH CHECK (id = (SELECT auth.uid()) OR private.is_admin());

-- PROFILE_PRIVATE
CREATE POLICY "Users and admins can view private profile data" ON public.profile_private
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid()) OR private.is_admin());
CREATE POLICY "Users can create their own private profile data" ON public.profile_private
  FOR INSERT TO authenticated WITH CHECK (id = (SELECT auth.uid()));
CREATE POLICY "Users can update their own private profile data" ON public.profile_private
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR private.is_admin()) WITH CHECK (id = (SELECT auth.uid()) OR private.is_admin());

-- USER_SETTINGS
CREATE POLICY "Users can view their own settings" ON public.user_settings
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR private.is_admin());
CREATE POLICY "Users can create their own settings" ON public.user_settings
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can update their own settings" ON public.user_settings
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can delete their own settings" ON public.user_settings
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- GROUPS: members see approved groups and their own pending requests.
CREATE POLICY "Members can view approved groups" ON public.groups
  FOR SELECT TO authenticated
  USING (is_approved OR created_by = (SELECT auth.uid()) OR private.is_admin());
CREATE POLICY "Members can request groups" ON public.groups
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND private.is_active_member());
CREATE POLICY "Admins can update groups" ON public.groups
  FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "Admins can delete groups" ON public.groups
  FOR DELETE TO authenticated USING (private.is_admin());

-- GROUP_MEMBERS
CREATE POLICY "Members can view group members" ON public.group_members
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Users can join approved groups" ON public.group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND private.is_active_member()
    AND EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.is_approved)
  );
CREATE POLICY "Users can leave groups" ON public.group_members
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()) OR private.is_admin());

-- POSTS
CREATE POLICY "Members can view posts" ON public.posts
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Users can create posts" ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_active_member());
CREATE POLICY "Users can update their own posts" ON public.posts
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND private.is_active_member())
  WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_active_member());
CREATE POLICY "Users and admins can delete posts" ON public.posts
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()) OR private.is_admin());

-- COMMENTS
CREATE POLICY "Members can view comments" ON public.comments
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Users can comment" ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_active_member());
CREATE POLICY "Users and admins can delete comments" ON public.comments
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()) OR private.is_admin());

-- LIKES
CREATE POLICY "Members can view likes" ON public.likes
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Users can like" ON public.likes
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_active_member());
CREATE POLICY "Users can unlike" ON public.likes
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- CONNECTIONS: accepted connections are visible to members (follower counts);
-- pending and ignored requests only to the two people involved.
CREATE POLICY "Members can view connections" ON public.connections
  FOR SELECT TO authenticated
  USING (status = 'accepted' OR (SELECT auth.uid()) IN (requester_id, recipient_id));
CREATE POLICY "Users can send Namaste requests" ON public.connections
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = (SELECT auth.uid())
    AND private.is_active_member()
    AND private.can_request(requester_id, recipient_id)
  );
CREATE POLICY "Recipients can answer Namaste requests" ON public.connections
  FOR UPDATE TO authenticated
  USING (recipient_id = (SELECT auth.uid())) WITH CHECK (recipient_id = (SELECT auth.uid()));
CREATE POLICY "Users can remove their connections" ON public.connections
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) IN (requester_id, recipient_id));

-- EVENTS
CREATE POLICY "Members can view events" ON public.events
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Users can create events" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (organizer_id = (SELECT auth.uid()) AND private.is_active_member());
CREATE POLICY "Organizers can update their events" ON public.events
  FOR UPDATE TO authenticated
  USING (organizer_id = (SELECT auth.uid()) AND private.is_active_member())
  WITH CHECK (organizer_id = (SELECT auth.uid()) AND private.is_active_member());
CREATE POLICY "Organizers and admins can delete events" ON public.events
  FOR DELETE TO authenticated USING (organizer_id = (SELECT auth.uid()) OR private.is_admin());

-- EVENT_RSVPS
CREATE POLICY "Members can view RSVPs" ON public.event_rsvps
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Users can RSVP" ON public.event_rsvps
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_active_member());
CREATE POLICY "Users can cancel their RSVP" ON public.event_rsvps
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- CONVERSATIONS: only the two participants.
CREATE POLICY "Participants can view conversations" ON public.conversations
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) IN (participant_1, participant_2));
CREATE POLICY "Users can start conversations" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IN (participant_1, participant_2)
    AND private.is_active_member()
    AND private.can_message(
      (SELECT auth.uid()),
      CASE WHEN participant_1 = (SELECT auth.uid()) THEN participant_2 ELSE participant_1 END)
  );

-- MESSAGES: only the two participants; sending honours blocks and settings.
CREATE POLICY "Participants can view messages" ON public.messages
  FOR SELECT TO authenticated USING (private.is_conversation_participant(conversation_id));
CREATE POLICY "Participants can send messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND private.is_active_member()
    AND private.is_conversation_participant(conversation_id)
    AND private.can_message(sender_id, private.conversation_partner(conversation_id))
  );
CREATE POLICY "Users can delete their own messages" ON public.messages
  FOR DELETE TO authenticated USING (sender_id = (SELECT auth.uid()));

-- MARKETPLACE
CREATE POLICY "Members can view listings" ON public.marketplace
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Users can create listings" ON public.marketplace
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_active_member());
CREATE POLICY "Users can update their own listings" ON public.marketplace
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND private.is_active_member())
  WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_active_member());
CREATE POLICY "Users and admins can delete listings" ON public.marketplace
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()) OR private.is_admin());

-- DOCS
CREATE POLICY "Members can view docs" ON public.docs
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Users can create docs" ON public.docs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_active_member());
CREATE POLICY "Users can update their own docs" ON public.docs
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND private.is_active_member())
  WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_active_member());
CREATE POLICY "Users and admins can delete docs" ON public.docs
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()) OR private.is_admin());

-- DOC_COMMENTS
CREATE POLICY "Members can view doc comments" ON public.doc_comments
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Users can comment on docs" ON public.doc_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_active_member());
CREATE POLICY "Users and admins can delete doc comments" ON public.doc_comments
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()) OR private.is_admin());

-- HELP_REQUESTS
CREATE POLICY "Members can view help requests" ON public.help_requests
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Users can ask for help" ON public.help_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_active_member());
CREATE POLICY "Users can update their own help requests" ON public.help_requests
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND private.is_active_member())
  WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_active_member());
CREATE POLICY "Users and admins can delete help requests" ON public.help_requests
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()) OR private.is_admin());

-- HELP_RESPONSES
CREATE POLICY "Members can view help responses" ON public.help_responses
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Users can respond to help requests" ON public.help_responses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_active_member());
CREATE POLICY "Users and admins can delete help responses" ON public.help_responses
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()) OR private.is_admin());

-- NOTIFICATIONS: members notify others in their own name, never someone who
-- blocked them (or whom they blocked); a Namaste notification must point at
-- the matching pending request. Admins can notify anyone.
CREATE POLICY "Users can view their notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can notify other members" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      actor_id = (SELECT auth.uid())
      AND type IN ('like', 'comment', 'request', 'message')
      AND user_id <> (SELECT auth.uid())
      AND private.is_active_member()
      AND NOT private.is_blocked_between(actor_id, user_id)
      AND (type <> 'request' OR EXISTS (
        SELECT 1 FROM public.connections c
        WHERE c.id = reference_id AND c.requester_id = actor_id
          AND c.recipient_id = user_id AND c.status = 'pending'))
    )
    OR private.is_admin()
  );
CREATE POLICY "Users can mark their notifications read" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Users can delete their notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- REPORTS: reporters see their own reports; moderation is admin-only.
CREATE POLICY "Reporters and admins can view reports" ON public.reports
  FOR SELECT TO authenticated USING (reporter_id = (SELECT auth.uid()) OR private.is_admin());
CREATE POLICY "Users can file reports" ON public.reports
  FOR INSERT TO authenticated WITH CHECK (reporter_id = (SELECT auth.uid()));
CREATE POLICY "Admins can update reports" ON public.reports
  FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "Admins can delete reports" ON public.reports
  FOR DELETE TO authenticated USING (private.is_admin());

-- BLOCKS
CREATE POLICY "Users can view their blocks" ON public.blocks
  FOR SELECT TO authenticated USING (blocker_id = (SELECT auth.uid()));
CREATE POLICY "Users can block" ON public.blocks
  FOR INSERT TO authenticated WITH CHECK (blocker_id = (SELECT auth.uid()));
CREATE POLICY "Admins can view the verification history" ON public.verification_log
  FOR SELECT TO authenticated USING (private.is_admin());

CREATE POLICY "Users can unblock" ON public.blocks
  FOR DELETE TO authenticated USING (blocker_id = (SELECT auth.uid()));

-- Nothing in public is for signed-out visitors.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- ============================================================================
-- STORAGE: public image buckets; members write only inside their own folder
-- (<user id>/...). Public URLs work without a SELECT policy.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('avatars', 'avatars', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('post-images', 'post-images', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('marketplace-images', 'marketplace-images', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "NRIclub: users can read their own uploads" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id IN ('avatars', 'post-images', 'marketplace-images')
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "NRIclub: users can upload to their own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('avatars', 'post-images', 'marketplace-images')
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "NRIclub: users can replace their own uploads" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN ('avatars', 'post-images', 'marketplace-images')
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id IN ('avatars', 'post-images', 'marketplace-images')
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "NRIclub: users can delete their own uploads" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('avatars', 'post-images', 'marketplace-images')
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- ============================================================================
-- REALTIME (chat and notifications; RLS applies to subscribers)
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages, public.notifications;
