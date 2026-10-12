-- ============================================================================
-- Phase 1 live reset, step 1 of 3: back up data, then drop the old schema.
-- See README.md in this folder. Run steps 1-3 together in ONE transaction.
-- ============================================================================

-- Copy every table that holds NRIclub data. This schema is not exposed by the
-- API. Drop it once the new schema has been verified:
--   DROP SCHEMA phase1_backup CASCADE;
CREATE SCHEMA phase1_backup;
REVOKE ALL ON SCHEMA phase1_backup FROM PUBLIC, anon, authenticated;

CREATE TABLE phase1_backup.profiles AS TABLE public.profiles;
CREATE TABLE phase1_backup.user_settings AS TABLE public.user_settings;
CREATE TABLE phase1_backup.groups AS TABLE public.groups;
CREATE TABLE phase1_backup.group_members AS TABLE public.group_members;
CREATE TABLE phase1_backup.posts AS TABLE public.posts;
CREATE TABLE phase1_backup.comments AS TABLE public.comments;
CREATE TABLE phase1_backup.connections AS TABLE public.connections;
CREATE TABLE phase1_backup.events AS TABLE public.events;
CREATE TABLE phase1_backup.event_rsvps AS TABLE public.event_rsvps;
CREATE TABLE phase1_backup.conversations AS TABLE public.conversations;
CREATE TABLE phase1_backup.marketplace AS TABLE public.marketplace;
CREATE TABLE phase1_backup.docs AS TABLE public.docs;
CREATE TABLE phase1_backup.doc_comments AS TABLE public.doc_comments;
CREATE TABLE phase1_backup.help_requests AS TABLE public.help_requests;
CREATE TABLE phase1_backup.help_responses AS TABLE public.help_responses;
CREATE TABLE phase1_backup.notifications AS TABLE public.notifications;
CREATE TABLE phase1_backup.reports AS TABLE public.reports;
CREATE TABLE phase1_backup.blocks AS TABLE public.blocks;

-- Old NRIclub tables, plus the unused dating-app tables that were applied to
-- this project by mistake (likes and messages had been replaced by its versions).
DROP TABLE IF EXISTS
  public.admin_users, public.blocks, public.boosts, public.comments, public.connections,
  public.conversations, public.doc_comments, public.docs, public.event_rsvps, public.events,
  public.group_members, public.groups, public.help_requests, public.help_responses,
  public.likes, public.marketplace, public.matches, public.messages, public.notifications,
  public.photos, public.posts, public.profiles, public.reports, public.search_history,
  public.subscriptions, public.support_ticket_messages, public.support_tickets,
  public.user_settings
  CASCADE;

-- Old functions, including the admin_* RPCs that anyone could call.
DROP TRIGGER IF EXISTS trigger_handle_new_user ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS
  public.admin_approve_group(uuid, boolean),
  public.admin_delete_content(text, uuid),
  public.admin_delete_report(uuid),
  public.admin_get_groups(),
  public.admin_get_profiles(),
  public.admin_get_reports(),
  public.admin_update_report(uuid, text),
  public.admin_update_user(uuid, boolean, text),
  public.create_match_on_mutual_like(),
  public.handle_new_user(),
  public.update_attendees_count(),
  public.update_comments_count(),
  public.update_conversation_last_message(),
  public.update_likes_count(),
  public.update_members_count(),
  public.update_updated_at()
  CASCADE;

-- Old storage policies (any signed-in user could write anywhere in a bucket).
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Avatar read" ON storage.objects;
DROP POLICY IF EXISTS "Avatar update" ON storage.objects;
DROP POLICY IF EXISTS "Avatar upload" ON storage.objects;
DROP POLICY IF EXISTS "Marketplace images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Post images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload marketplace images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload post images" ON storage.objects;
