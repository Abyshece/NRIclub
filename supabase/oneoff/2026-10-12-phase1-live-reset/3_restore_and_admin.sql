-- ============================================================================
-- Phase 1 live reset, step 3 of 3: restore data into the new schema and
-- grant the first admin. Runs after the schema migration (step 2), in the
-- same transaction.
-- ============================================================================

-- Profiles (public part). The email-verified flag now mirrors Supabase Auth.
INSERT INTO public.profiles (id, name, avatar_url, location, hometown, profession, occupation_status,
  years_abroad, linkedin_url, bio, email_verified, linkedin_verified, status, last_active, created_at, updated_at)
SELECT b.id, LEFT(COALESCE(b.name, ''), 200), COALESCE(b.avatar_url, ''), COALESCE(b.location, ''),
  COALESCE(b.hometown, ''), COALESCE(b.profession, ''), COALESCE(NULLIF(b.occupation_status, ''), 'Working Professional'),
  COALESCE(b.years_abroad, ''), COALESCE(b.linkedin_url, ''), LEFT(COALESCE(b.bio, ''), 2000),
  u.email_confirmed_at IS NOT NULL, COALESCE(b.linkedin_verified, FALSE),
  CASE WHEN b.status = 'blocked' THEN 'blocked' ELSE 'active' END,
  b.last_active, COALESCE(b.created_at, NOW()), COALESCE(b.updated_at, NOW())
FROM phase1_backup.profiles b
JOIN auth.users u ON u.id = b.id;

-- Profiles (private part), keeping the original consent dates.
ALTER TABLE public.profile_private DISABLE TRIGGER stamp_gdpr_consent;
INSERT INTO public.profile_private (id, email, gdpr_consent, gdpr_consent_date, marketing_consent, created_at)
SELECT b.id, u.email, COALESCE(b.gdpr_consent, FALSE), b.gdpr_consent_date, COALESCE(b.marketing_consent, FALSE),
  COALESCE(b.created_at, NOW())
FROM phase1_backup.profiles b
JOIN auth.users u ON u.id = b.id;
ALTER TABLE public.profile_private ENABLE TRIGGER stamp_gdpr_consent;

-- Any auth user without a profile gets one, as the signup trigger would have made.
INSERT INTO public.profiles (id, name, email_verified)
SELECT u.id, LEFT(SPLIT_PART(u.email, '@', 1), 200), u.email_confirmed_at IS NOT NULL
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);
INSERT INTO public.profile_private (id, email)
SELECT u.id, u.email
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profile_private p WHERE p.id = u.id);

INSERT INTO public.user_settings (id, user_id, profile_visibility, online_status, namaste_requests,
  receive_messages, email_notifications, push_notifications, marketing_emails, updated_at)
SELECT b.id, b.user_id, COALESCE(b.profile_visibility, 'Everyone'), COALESCE(b.online_status, TRUE),
  COALESCE(b.namaste_requests, 'Everyone'), COALESCE(b.receive_messages, 'Everyone'),
  COALESCE(b.email_notifications, TRUE), COALESCE(b.push_notifications, TRUE),
  COALESCE(b.marketing_emails, FALSE), COALESCE(b.updated_at, NOW())
FROM phase1_backup.user_settings b
WHERE b.user_id IN (SELECT id FROM public.profiles);

-- Groups keep their stored member counts, so memberships are restored with
-- the counter trigger switched off.
INSERT INTO public.groups (id, name, description, category, image_url, members_count, created_by, is_approved, created_at)
SELECT b.id, b.name, COALESCE(b.description, ''), COALESCE(b.category, 'City'), COALESCE(b.image_url, ''),
  COALESCE(b.members_count, 0),
  CASE WHEN b.created_by IN (SELECT id FROM public.profiles) THEN b.created_by END,
  COALESCE(b.is_approved, FALSE), COALESCE(b.created_at, NOW())
FROM phase1_backup.groups b;

ALTER TABLE public.group_members DISABLE TRIGGER update_group_members_count;
INSERT INTO public.group_members (id, group_id, user_id, role, joined_at)
SELECT b.id, b.group_id, b.user_id, COALESCE(b.role, 'member'), COALESCE(b.joined_at, NOW())
FROM phase1_backup.group_members b
WHERE b.group_id IN (SELECT id FROM public.groups) AND b.user_id IN (SELECT id FROM public.profiles);
ALTER TABLE public.group_members ENABLE TRIGGER update_group_members_count;

-- Posts start at zero likes (the old likes table had been overwritten);
-- comment counts are rebuilt by the trigger as comments are restored.
INSERT INTO public.posts (id, user_id, content, image_url, tags, group_id, created_at, updated_at)
SELECT b.id, b.user_id, b.content, b.image_url, COALESCE(b.tags, '{}'),
  CASE WHEN b.group_id IN (SELECT id FROM public.groups) THEN b.group_id END,
  COALESCE(b.created_at, NOW()), COALESCE(b.updated_at, NOW())
FROM phase1_backup.posts b
WHERE b.user_id IN (SELECT id FROM public.profiles);

INSERT INTO public.comments (id, post_id, user_id, content, created_at)
SELECT b.id, b.post_id, b.user_id, b.content, COALESCE(b.created_at, NOW())
FROM phase1_backup.comments b
WHERE b.post_id IN (SELECT id FROM public.posts) AND b.user_id IN (SELECT id FROM public.profiles);

INSERT INTO public.connections (id, requester_id, recipient_id, status, created_at)
SELECT b.id, b.requester_id, b.recipient_id, COALESCE(b.status, 'pending'), COALESCE(b.created_at, NOW())
FROM phase1_backup.connections b
WHERE b.requester_id <> b.recipient_id
  AND b.requester_id IN (SELECT id FROM public.profiles) AND b.recipient_id IN (SELECT id FROM public.profiles);

-- Events keep their stored attendee counts.
INSERT INTO public.events (id, title, description, date, location, image_url, link, attendees_count,
  organizer_id, organizer_name, created_at)
SELECT b.id, b.title, COALESCE(b.description, ''), b.date, COALESCE(b.location, ''), COALESCE(b.image_url, ''),
  COALESCE(b.link, ''), COALESCE(b.attendees_count, 0),
  CASE WHEN b.organizer_id IN (SELECT id FROM public.profiles) THEN b.organizer_id END,
  COALESCE(b.organizer_name, ''), COALESCE(b.created_at, NOW())
FROM phase1_backup.events b;

ALTER TABLE public.event_rsvps DISABLE TRIGGER update_event_attendees_count;
INSERT INTO public.event_rsvps (id, event_id, user_id, created_at)
SELECT b.id, b.event_id, b.user_id, COALESCE(b.created_at, NOW())
FROM phase1_backup.event_rsvps b
WHERE b.event_id IN (SELECT id FROM public.events) AND b.user_id IN (SELECT id FROM public.profiles);
ALTER TABLE public.event_rsvps ENABLE TRIGGER update_event_attendees_count;

-- Conversations keep their last-message preview; if a pair was stored twice
-- (A->B and B->A) the most recent one is kept. The old messages table had
-- been overwritten, so there are no messages to restore.
INSERT INTO public.conversations (id, participant_1, participant_2, last_message_text, last_message_at, created_at)
SELECT DISTINCT ON (LEAST(b.participant_1, b.participant_2), GREATEST(b.participant_1, b.participant_2))
  b.id, b.participant_1, b.participant_2, COALESCE(b.last_message_text, ''),
  COALESCE(b.last_message_at, NOW()), COALESCE(b.created_at, NOW())
FROM phase1_backup.conversations b
WHERE b.participant_1 <> b.participant_2
  AND b.participant_1 IN (SELECT id FROM public.profiles) AND b.participant_2 IN (SELECT id FROM public.profiles)
ORDER BY LEAST(b.participant_1, b.participant_2), GREATEST(b.participant_1, b.participant_2), b.last_message_at DESC NULLS LAST;

INSERT INTO public.marketplace (id, user_id, title, description, price, category, location, image_url, status, created_at)
SELECT b.id, b.user_id, b.title, COALESCE(b.description, ''), b.price, COALESCE(b.category, 'Items'),
  COALESCE(b.location, ''), COALESCE(b.image_url, ''), COALESCE(b.status, 'active'), COALESCE(b.created_at, NOW())
FROM phase1_backup.marketplace b
WHERE b.user_id IN (SELECT id FROM public.profiles);

INSERT INTO public.docs (id, user_id, title, excerpt, content, category, city, read_time, likes_count, created_at)
SELECT b.id, b.user_id, b.title, COALESCE(b.excerpt, ''), COALESCE(b.content, ''), COALESCE(b.category, 'General'),
  COALESCE(b.city, ''), COALESCE(b.read_time, '1 min read'), COALESCE(b.likes_count, 0), COALESCE(b.created_at, NOW())
FROM phase1_backup.docs b
WHERE b.user_id IN (SELECT id FROM public.profiles);

INSERT INTO public.doc_comments (id, doc_id, user_id, content, created_at)
SELECT b.id, b.doc_id, b.user_id, b.content, COALESCE(b.created_at, NOW())
FROM phase1_backup.doc_comments b
WHERE b.doc_id IN (SELECT id FROM public.docs) AND b.user_id IN (SELECT id FROM public.profiles);

-- Response counts are rebuilt by the trigger as responses are restored.
INSERT INTO public.help_requests (id, user_id, title, description, category, urgency, status, created_at)
SELECT b.id, b.user_id, b.title, b.description, COALESCE(b.category, 'General'), COALESCE(b.urgency, 'Low'),
  COALESCE(b.status, 'Open'), COALESCE(b.created_at, NOW())
FROM phase1_backup.help_requests b
WHERE b.user_id IN (SELECT id FROM public.profiles);

INSERT INTO public.help_responses (id, request_id, user_id, content, created_at)
SELECT b.id, b.request_id, b.user_id, b.content, COALESCE(b.created_at, NOW())
FROM phase1_backup.help_responses b
WHERE b.request_id IN (SELECT id FROM public.help_requests) AND b.user_id IN (SELECT id FROM public.profiles);

INSERT INTO public.notifications (id, user_id, type, actor_id, text, read, reference_id, created_at)
SELECT b.id, b.user_id, b.type, CASE WHEN b.actor_id IN (SELECT id FROM public.profiles) THEN b.actor_id END,
  LEFT(b.text, 1000), COALESCE(b.read, FALSE), b.reference_id, COALESCE(b.created_at, NOW())
FROM phase1_backup.notifications b
WHERE b.user_id IN (SELECT id FROM public.profiles);

INSERT INTO public.reports (id, reporter_id, reported_user_id, reported_post_id, reason, status, created_at)
SELECT b.id, b.reporter_id, CASE WHEN b.reported_user_id IN (SELECT id FROM public.profiles) THEN b.reported_user_id END,
  b.reported_post_id, b.reason, COALESCE(b.status, 'pending'), COALESCE(b.created_at, NOW())
FROM phase1_backup.reports b
WHERE b.reporter_id IN (SELECT id FROM public.profiles);

INSERT INTO public.blocks (id, blocker_id, blocked_id, created_at)
SELECT b.id, b.blocker_id, b.blocked_id, COALESCE(b.created_at, NOW())
FROM phase1_backup.blocks b
WHERE b.blocker_id <> b.blocked_id
  AND b.blocker_id IN (SELECT id FROM public.profiles) AND b.blocked_id IN (SELECT id FROM public.profiles);

-- The dating app's empty storage bucket. Storage may refuse direct SQL
-- deletes; that must not abort the reset, so leave the bucket if it does.
DO $$
BEGIN
  DELETE FROM storage.buckets b
  WHERE b.id = 'photos' AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'photos');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Left the empty "photos" bucket in place: %', SQLERRM;
END $$;

-- First admin.
INSERT INTO public.admins (user_id)
SELECT id FROM auth.users WHERE email = 'abyshece@gmail.com';
