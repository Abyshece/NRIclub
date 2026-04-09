-- ============================================================================
-- IndIn Social Network - Complete Supabase Database Migration
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/uzzkdmybsbwknpsucuvv/sql
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. PROFILES TABLE (extends Supabase auth.users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  location TEXT DEFAULT '',
  hometown TEXT DEFAULT '',
  profession TEXT DEFAULT '',
  occupation_status TEXT DEFAULT 'Working Professional',
  years_abroad TEXT DEFAULT '',
  linkedin_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  email_verified BOOLEAN DEFAULT FALSE,
  gdpr_consent BOOLEAN DEFAULT FALSE,
  gdpr_consent_date TIMESTAMPTZ,
  marketing_consent BOOLEAN DEFAULT FALSE,
  online_status BOOLEAN DEFAULT TRUE,
  profile_visibility TEXT DEFAULT 'Everyone',
  namaste_requests TEXT DEFAULT 'Everyone',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 2. POSTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image_url TEXT,
  tags TEXT[] DEFAULT '{}',
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  group_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_group_id ON public.posts(group_id);

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 3. COMMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments(post_id);

-- Update post comments_count trigger
CREATE OR REPLACE FUNCTION public.update_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comments_count = comments_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_post_comments_count
  AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.update_comments_count();

-- ============================================================================
-- 4. LIKES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_likes_post_id ON public.likes(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON public.likes(user_id);

-- Update post likes_count trigger
CREATE OR REPLACE FUNCTION public.update_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_post_likes_count
  AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.update_likes_count();

-- ============================================================================
-- 5. CONNECTIONS (Namaste / Follow system)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requester_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_connections_requester ON public.connections(requester_id);
CREATE INDEX IF NOT EXISTS idx_connections_recipient ON public.connections(recipient_id);

-- ============================================================================
-- 6. GROUPS / COMMUNITIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'City' CHECK (category IN ('City', 'Professional', 'Interest', 'Support')),
  image_url TEXT DEFAULT '',
  members_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id),
  is_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group memberships
CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('member', 'admin', 'moderator')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON public.group_members(user_id);

-- Update group members_count trigger
CREATE OR REPLACE FUNCTION public.update_members_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.groups SET members_count = members_count + 1 WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.groups SET members_count = members_count - 1 WHERE id = OLD.group_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_group_members_count
  AFTER INSERT OR DELETE ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.update_members_count();

-- ============================================================================
-- 7. EVENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  date TEXT NOT NULL,
  location TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  link TEXT DEFAULT '',
  attendees_count INTEGER DEFAULT 0,
  organizer_id UUID REFERENCES public.profiles(id),
  organizer_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event RSVPs
CREATE TABLE IF NOT EXISTS public.event_rsvps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

CREATE OR REPLACE FUNCTION public.update_attendees_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.events SET attendees_count = attendees_count + 1 WHERE id = NEW.event_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.events SET attendees_count = attendees_count - 1 WHERE id = OLD.event_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_event_attendees_count
  AFTER INSERT OR DELETE ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.update_attendees_count();

-- ============================================================================
-- 8. MESSAGES (Direct messaging)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_1 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_2 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_text TEXT DEFAULT '',
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(participant_1, participant_2)
);

CREATE INDEX IF NOT EXISTS idx_conversations_p1 ON public.conversations(participant_1);
CREATE INDEX IF NOT EXISTS idx_conversations_p2 ON public.conversations(participant_2);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at);

-- Update conversation last_message on new message
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_text = NEW.content, last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_convo_last_msg
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message();

-- ============================================================================
-- 9. MARKETPLACE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketplace (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  price TEXT NOT NULL,
  category TEXT DEFAULT 'Items' CHECK (category IN ('Housing', 'Jobs', 'Items', 'Vehicles', 'Services')),
  location TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'sold', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_user ON public.marketplace(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_category ON public.marketplace(category);

-- ============================================================================
-- 10. DOCS (Community Knowledge Base)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.docs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  excerpt TEXT DEFAULT '',
  content TEXT DEFAULT '',
  category TEXT DEFAULT 'General',
  city TEXT DEFAULT '',
  read_time TEXT DEFAULT '1 min read',
  likes_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.doc_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_id UUID NOT NULL REFERENCES public.docs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 11. HELP REQUESTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.help_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  urgency TEXT DEFAULT 'Low' CHECK (urgency IN ('Low', 'Medium', 'High')),
  status TEXT DEFAULT 'Open' CHECK (status IN ('Open', 'Resolved')),
  responses_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.help_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES public.help_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 12. NOTIFICATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('like', 'comment', 'request', 'event', 'group', 'trending', 'message')),
  actor_id UUID REFERENCES public.profiles(id),
  text TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  reference_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);

-- ============================================================================
-- 13. REPORTS & BLOCKS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES public.profiles(id),
  reported_post_id UUID REFERENCES public.posts(id),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
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

-- PROFILES: Anyone can read, users can update their own
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- POSTS: Anyone can read, users can CRUD their own
CREATE POLICY "Posts are viewable by everyone" ON public.posts FOR SELECT USING (true);
CREATE POLICY "Users can create posts" ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own posts" ON public.posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own posts" ON public.posts FOR DELETE USING (auth.uid() = user_id);

-- COMMENTS: Anyone can read, users can create/delete their own
CREATE POLICY "Comments are viewable by everyone" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Users can create comments" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON public.comments FOR DELETE USING (auth.uid() = user_id);

-- LIKES: Anyone can read, users can toggle their own
CREATE POLICY "Likes are viewable by everyone" ON public.likes FOR SELECT USING (true);
CREATE POLICY "Users can like" ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike" ON public.likes FOR DELETE USING (auth.uid() = user_id);

-- CONNECTIONS: Participants can view their own
CREATE POLICY "Users can view own connections" ON public.connections FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = recipient_id);
CREATE POLICY "Users can send connection requests" ON public.connections FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Recipients can update connection status" ON public.connections FOR UPDATE USING (auth.uid() = recipient_id);
CREATE POLICY "Users can delete own connections" ON public.connections FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

-- GROUPS: Everyone can view approved groups
CREATE POLICY "Groups are viewable" ON public.groups FOR SELECT USING (true);
CREATE POLICY "Users can create groups" ON public.groups FOR INSERT WITH CHECK (auth.uid() = created_by);

-- GROUP MEMBERS
CREATE POLICY "Group members viewable" ON public.group_members FOR SELECT USING (true);
CREATE POLICY "Users can join groups" ON public.group_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave groups" ON public.group_members FOR DELETE USING (auth.uid() = user_id);

-- EVENTS
CREATE POLICY "Events are viewable" ON public.events FOR SELECT USING (true);
CREATE POLICY "Users can create events" ON public.events FOR INSERT WITH CHECK (auth.uid() = organizer_id);
CREATE POLICY "Organizers can update events" ON public.events FOR UPDATE USING (auth.uid() = organizer_id);

-- EVENT RSVPs
CREATE POLICY "RSVPs are viewable" ON public.event_rsvps FOR SELECT USING (true);
CREATE POLICY "Users can RSVP" ON public.event_rsvps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can un-RSVP" ON public.event_rsvps FOR DELETE USING (auth.uid() = user_id);

-- CONVERSATIONS: Only participants
CREATE POLICY "Users see own conversations" ON public.conversations FOR SELECT USING (auth.uid() = participant_1 OR auth.uid() = participant_2);
CREATE POLICY "Users can create conversations" ON public.conversations FOR INSERT WITH CHECK (auth.uid() = participant_1 OR auth.uid() = participant_2);

-- MESSAGES: Only conversation participants
CREATE POLICY "Users see own messages" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid()))
);
CREATE POLICY "Users can send messages" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can delete own messages" ON public.messages FOR DELETE USING (auth.uid() = sender_id);

-- MARKETPLACE
CREATE POLICY "Marketplace viewable" ON public.marketplace FOR SELECT USING (true);
CREATE POLICY "Users can post items" ON public.marketplace FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own items" ON public.marketplace FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own items" ON public.marketplace FOR DELETE USING (auth.uid() = user_id);

-- DOCS
CREATE POLICY "Docs are viewable" ON public.docs FOR SELECT USING (true);
CREATE POLICY "Users can create docs" ON public.docs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own docs" ON public.docs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own docs" ON public.docs FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Doc comments viewable" ON public.doc_comments FOR SELECT USING (true);
CREATE POLICY "Users can comment on docs" ON public.doc_comments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- HELP REQUESTS
CREATE POLICY "Help requests viewable" ON public.help_requests FOR SELECT USING (true);
CREATE POLICY "Users can create help requests" ON public.help_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own requests" ON public.help_requests FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Help responses viewable" ON public.help_responses FOR SELECT USING (true);
CREATE POLICY "Users can respond to help" ON public.help_responses FOR INSERT WITH CHECK (auth.uid() = user_id);

-- NOTIFICATIONS: Only own
CREATE POLICY "Users see own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can create notifications" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- REPORTS
CREATE POLICY "Users can create reports" ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- BLOCKS
CREATE POLICY "Users see own blocks" ON public.blocks FOR SELECT USING (auth.uid() = blocker_id);
CREATE POLICY "Users can block" ON public.blocks FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "Users can unblock" ON public.blocks FOR DELETE USING (auth.uid() = blocker_id);

-- ============================================================================
-- SEED DATA: Default communities
-- ============================================================================
INSERT INTO public.groups (name, description, category, members_count, is_approved) VALUES
  ('Indians in Aachen', 'Community for Indians living in Aachen.', 'City', 850, true),
  ('Indians in Augsburg', 'Community for Indians living in Augsburg.', 'City', 620, true),
  ('Indians in Berlin', 'The largest community of Indians living in Berlin. Join for housing leads and meetups.', 'City', 12500, true),
  ('Indians in Bielefeld', 'Community for Indians living in Bielefeld.', 'City', 480, true),
  ('Indians in Bochum', 'Community for Indians living in Bochum.', 'City', 560, true),
  ('Indians in Bonn', 'Community for Indians living in Bonn.', 'City', 920, true),
  ('Indians in Braunschweig', 'Community for Indians living in Braunschweig.', 'City', 710, true),
  ('Indians in Bremen', 'Community for Indians living in Bremen.', 'City', 980, true),
  ('Indians in Chemnitz', 'Community for Indians living in Chemnitz.', 'City', 340, true),
  ('Indians in Cologne', 'Community for Indians living in Cologne.', 'City', 3200, true),
  ('Indians in Darmstadt', 'Community for Indians living in Darmstadt.', 'City', 1800, true),
  ('Indians in Dortmund', 'Community for Indians living in Dortmund.', 'City', 1400, true),
  ('Indians in Dresden', 'Community for Indians living in Dresden.', 'City', 1600, true),
  ('Indians in Duisburg', 'Community for Indians living in Duisburg.', 'City', 780, true),
  ('Indians in Düsseldorf', 'Community for Indians living in Düsseldorf.', 'City', 2800, true),
  ('Indians in Erlangen', 'Community for Indians living in Erlangen.', 'City', 1200, true),
  ('Indians in Essen', 'Community for Indians living in Essen.', 'City', 1100, true),
  ('Indians in Frankfurt', 'Community for Indians living in Frankfurt.', 'City', 8500, true),
  ('Indians in Freiburg', 'Community for Indians living in Freiburg.', 'City', 920, true),
  ('Indians in Göttingen', 'Community for Indians living in Göttingen.', 'City', 680, true),
  ('Indians in Hamburg', 'Community for Indians living in Hamburg.', 'City', 6200, true),
  ('Indians in Hannover', 'Community for Indians living in Hannover.', 'City', 2400, true),
  ('Indians in Heidelberg', 'Community for Indians living in Heidelberg.', 'City', 1500, true),
  ('Indians in Ingolstadt', 'Community for Indians living in Ingolstadt.', 'City', 950, true),
  ('Indians in Jena', 'Community for Indians living in Jena.', 'City', 520, true),
  ('Indians in Karlsruhe', 'Community for Indians living in Karlsruhe.', 'City', 1800, true),
  ('Indians in Kassel', 'Community for Indians living in Kassel.', 'City', 640, true),
  ('Indians in Kiel', 'Community for Indians living in Kiel.', 'City', 480, true),
  ('Indians in Leipzig', 'Community for Indians living in Leipzig.', 'City', 1300, true),
  ('Indians in Leverkusen', 'Community for Indians living in Leverkusen.', 'City', 420, true),
  ('Indians in Lübeck', 'Community for Indians living in Lübeck.', 'City', 350, true),
  ('Indians in Magdeburg', 'Community for Indians living in Magdeburg.', 'City', 460, true),
  ('Indians in Mainz', 'Community for Indians living in Mainz.', 'City', 880, true),
  ('Indians in Mannheim', 'Community for Indians living in Mannheim.', 'City', 1600, true),
  ('Indians in Mönchengladbach', 'Community for Indians living in Mönchengladbach.', 'City', 380, true),
  ('Indians in Munich', 'Community for Indians living in Munich.', 'City', 9800, true),
  ('Indians in Münster', 'Community for Indians living in Münster.', 'City', 1100, true),
  ('Indians in Nuremberg', 'Community for Indians living in Nuremberg.', 'City', 2100, true),
  ('Indians in Offenbach', 'Community for Indians living in Offenbach.', 'City', 580, true),
  ('Indians in Oldenburg', 'Community for Indians living in Oldenburg.', 'City', 420, true),
  ('Indians in Osnabrück', 'Community for Indians living in Osnabrück.', 'City', 380, true),
  ('Indians in Paderborn', 'Community for Indians living in Paderborn.', 'City', 520, true),
  ('Indians in Potsdam', 'Community for Indians living in Potsdam.', 'City', 640, true),
  ('Indians in Regensburg', 'Community for Indians living in Regensburg.', 'City', 720, true),
  ('Indians in Rostock', 'Community for Indians living in Rostock.', 'City', 340, true),
  ('Indians in Saarbrücken', 'Community for Indians living in Saarbrücken.', 'City', 480, true),
  ('Indians in Stuttgart', 'Community for Indians living in Stuttgart.', 'City', 5600, true),
  ('Indians in Ulm', 'Community for Indians living in Ulm.', 'City', 680, true),
  ('Indians in Wiesbaden', 'Community for Indians living in Wiesbaden.', 'City', 780, true),
  ('Indians in Wolfsburg', 'Community for Indians living in Wolfsburg.', 'City', 920, true)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- SEED DATA: Default events
-- ============================================================================
INSERT INTO public.events (title, description, date, location, attendees_count, organizer_name) VALUES
  ('Holi Festival 2026', 'Celebrate the festival of colors with fellow Indians in NYC!', 'Mar 25, 2026 • 10:00 AM', 'Central Park, New York', 450, 'NYC Desi Club'),
  ('Networking Night: Tech', 'Connect with Indian tech professionals working in Germany.', 'Apr 10, 2026 • 6:00 PM', 'WeWork, Berlin', 120, 'Indian Professionals DE'),
  ('Bollywood Movie Night', 'Watch the latest Bollywood blockbuster together!', 'Apr 15, 2026 • 7:00 PM', 'Hoyts Cinema, Melbourne', 85, 'Melbourne Desi Club')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- ENABLE REALTIME for messages and notifications
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;

-- ============================================================================
-- STORAGE BUCKETS for file uploads
-- ============================================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('post-images', 'post-images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('marketplace-images', 'marketplace-images', true) ON CONFLICT DO NOTHING;

-- Storage policies
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
CREATE POLICY "Users can update own avatars" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Post images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'post-images');
CREATE POLICY "Users can upload post images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'post-images' AND auth.role() = 'authenticated');

CREATE POLICY "Marketplace images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'marketplace-images');
CREATE POLICY "Users can upload marketplace images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'marketplace-images' AND auth.role() = 'authenticated');

-- ============================================================================
-- DONE! Your database is ready.
-- ============================================================================
