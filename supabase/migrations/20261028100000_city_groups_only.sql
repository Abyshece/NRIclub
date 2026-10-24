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
