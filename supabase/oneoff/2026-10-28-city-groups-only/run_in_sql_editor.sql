-- Run this whole file once in the Supabase SQL Editor (city groups only).
-- Run it after the members' progress update
-- (2026-10-28-profile-completeness/run_in_sql_editor.sql), and after the
-- site update that shows only city groups is live. It runs as one
-- transaction: if anything fails, nothing changes. Role: postgres (the SQL
-- Editor's default).
-- Schema: supabase/migrations/20261028100000_city_groups_only.sql
--
-- What it does:
--   * Deletes the groups that aren't city groups: the ten language groups
--     (Hindi speakers, Tamil, Telugu, Malayali, Kannada, Bengali, Gujarati,
--     Marathi, Punjabi and Odia community), "Indian students abroad" and
--     "Parents' corner", with who had joined them. On 24 October 2026 they
--     had no posts; three memberships (two in Hindi speakers, one in Indian
--     students abroad) go with them.
--   * From now on a group can only be a city group ("Indians in Munich").
--
-- This can't be undone except from a backup.

DO $guard$
BEGIN
  IF to_regclass('private.profile_reminders') IS NULL THEN
    RAISE EXCEPTION 'Run the members'' progress update (2026-10-28-profile-completeness/run_in_sql_editor.sql) first.';
  END IF;
  IF (SELECT pg_catalog.pg_get_constraintdef(c.oid) FROM pg_catalog.pg_constraint c
      WHERE c.conrelid = 'public.groups'::regclass AND c.conname = 'groups_category_check') NOT LIKE '%Language%' THEN
    RAISE EXCEPTION 'This update has already run. Nothing to do.';
  END IF;
END
$guard$;

-- ==== 20261028100000_city_groups_only.sql ====
-- ============================================================================
-- NRIclub: city groups only (2026-10-28)
--
--   * NRIClub has one group per city ("Indians in Munich"), for every Indian
--     who lives there, students and working people alike. The language
--     groups ("Hindi speakers", "Tamil community", …), "Indian students
--     abroad" and "Parents' corner" (added 2026-10-17) are deleted, with who
--     had joined them (group_members, ON DELETE CASCADE). Posts in them, if
--     any, stay as posts without a group (posts.group_id ON DELETE SET NULL).
--     Requests for such groups go too.
--   * groups.category accepts only 'City' from now on, so members can only
--     ask for city groups (the site asks for nothing else since the same
--     day).
-- Needs all earlier migrations (up to 20261028000000_profile_completeness.sql).
-- Can be run again: it deletes and replaces only what isn't so yet.
-- Existing rows: the groups that aren't city groups, and their members,
-- are deleted.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('private.profile_reminders') IS NULL THEN
    RAISE EXCEPTION 'Run the members'' progress update (20261028000000) first.';
  END IF;
END;
$$;

DELETE FROM public.groups WHERE category IS DISTINCT FROM 'City';

ALTER TABLE public.groups
  DROP CONSTRAINT IF EXISTS groups_category_check,
  ADD CONSTRAINT groups_category_check CHECK (category = 'City');
