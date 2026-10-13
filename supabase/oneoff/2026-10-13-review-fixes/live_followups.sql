-- ============================================================================
-- Review fixes, follow-ups on the live project (NRI+, uzzkdmybsbwknpsucuvv).
-- See README.md in this folder. Run these AFTER the migration
-- 20261013000000_review_fixes.sql is applied and the new site is live.
--
-- Run each numbered part as its own query: the Supabase SQL editor only
-- shows the result of the last statement it runs. Parts 1 and 2 change data
-- and are safe to run again; parts 3 and 4 only read; part 5 is a reminder
-- and is commented out.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The project's public Storage address. From now on, photo links saved
--    through the site must be uploads in this project's Storage, in the
--    member's own folder. (Until this is set, a Storage link of any Supabase
--    project is accepted.)
-- ----------------------------------------------------------------------------
INSERT INTO private.app_config (key, value)
VALUES ('storage_public_url', 'https://uzzkdmybsbwknpsucuvv.supabase.co/storage/v1/object/public/')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Check: photos already on the site mostly start with that address
-- (uploaded_here). Links from elsewhere are older ones and are left alone.
-- If uploaded_here is 0 everywhere but there are many photos, the address
-- above is wrong: ask your developer before members upload more photos.
WITH base AS (SELECT value FROM private.app_config WHERE key = 'storage_public_url')
SELECT 'profile photos' AS photos,
  count(*) FILTER (WHERE starts_with(p.avatar_url, base.value)) AS uploaded_here,
  count(*) FILTER (WHERE p.avatar_url <> '' AND NOT starts_with(p.avatar_url, base.value)) AS from_elsewhere
FROM public.profiles p, base
UNION ALL
SELECT 'post photos',
  count(*) FILTER (WHERE starts_with(x.image_url, base.value)),
  count(*) FILTER (WHERE x.image_url <> '' AND NOT starts_with(x.image_url, base.value))
FROM public.posts x, base
UNION ALL
SELECT 'event photos',
  count(*) FILTER (WHERE starts_with(x.image_url, base.value)),
  count(*) FILTER (WHERE x.image_url <> '' AND NOT starts_with(x.image_url, base.value))
FROM public.events x, base;


-- ----------------------------------------------------------------------------
-- 2. Bring stored data up to date.
-- ----------------------------------------------------------------------------

-- 2a. Community member counts = the real number of members. The old seed
--     and the Phase 1 reset kept made-up starting numbers (Berlin 12,500 ...).
UPDATE public.groups g SET members_count = c.n
FROM (SELECT g2.id, (SELECT count(*)::int FROM public.group_members m WHERE m.group_id = g2.id) AS n
      FROM public.groups g2) c
WHERE c.id = g.id AND g.members_count <> c.n;

-- 2b. Event attendee counts = the real number of RSVPs.
UPDATE public.events e SET attendees_count = c.n
FROM (SELECT e2.id, (SELECT count(*)::int FROM public.event_rsvps r WHERE r.event_id = e2.id) AS n
      FROM public.events e2) c
WHERE c.id = e.id AND e.attendees_count <> c.n;

-- 2c. Marketing emails switched off in Settings while the old site was
--     still live. The old site saved that switch in user_settings, which the
--     new site no longer reads; the member's consent is profile_private.
--     Run this the same day as the migration (it looks back one day).
UPDATE public.profile_private pp SET marketing_consent = FALSE
WHERE pp.marketing_consent
  AND EXISTS (SELECT 1 FROM public.user_settings s
              WHERE s.user_id = pp.id AND NOT s.marketing_emails
                AND s.updated_at > NOW() - INTERVAL '1 day');


-- ----------------------------------------------------------------------------
-- 3. Approval audit (read only). Members the Phase 1 reset marked
--    "approved" with no decision on record. Before the reset any member could
--    switch on the old "LinkedIn verified" flag on their own profile, and the
--    reset turned that flag into "approved", so no admin may ever have looked
--    at these members. Re-check each one: README.md says how.
-- ----------------------------------------------------------------------------
SELECT p.id, p.name, pp.email, p.linkedin_url, pp.reviewed_at
FROM public.profile_private pp
JOIN public.profiles p ON p.id = pp.id
WHERE pp.verification_status = 'approved'
  AND NOT EXISTS (SELECT 1 FROM public.verification_log l WHERE l.member_id = pp.id)
ORDER BY p.name;

-- For a member you've checked and know is genuine, this records your check
-- without changing anything for them (no notification). Put their id in
-- (from the list above) and run it; they then drop off the list.
--
-- INSERT INTO public.verification_log (member_id, decision, admin_note, actor_id)
-- SELECT '<member id>', 'approved', 'Approved by the Phase 1 reset; re-checked by an admin.', a.user_id
-- FROM public.admins a JOIN auth.users u ON u.id = a.user_id
-- WHERE u.email = 'abyshece@gmail.com';


-- ----------------------------------------------------------------------------
-- 4. Names copied from email addresses (read only). Expected: no rows (the
--    migration emptied these names). A name like this came from an account
--    made outside the site's signup, not from the member.
-- ----------------------------------------------------------------------------
SELECT p.id, p.name, pp.email, p.created_at
FROM public.profiles p
JOIN public.profile_private pp ON pp.id = p.id
WHERE p.name <> '' AND NULLIF(BTRIM(COALESCE(pp.email, '')), '') IS NOT NULL
  AND (lower(p.name) = lower(BTRIM(pp.email)) OR p.name = LEFT(SPLIT_PART(BTRIM(pp.email), '@', 1), 200));

-- If it does list someone, empty those names with:
--
-- UPDATE public.profiles p SET name = ''
-- FROM public.profile_private pp
-- WHERE pp.id = p.id AND p.name <> '' AND NULLIF(BTRIM(COALESCE(pp.email, '')), '') IS NOT NULL
--   AND (lower(p.name) = lower(BTRIM(pp.email)) OR p.name = LEFT(SPLIT_PART(BTRIM(pp.email), '@', 1), 200));
--
-- How many members have no name at all:
--   SELECT count(*) FROM public.profiles WHERE name = '';


-- ----------------------------------------------------------------------------
-- 5. REMINDER, do not run now: drop the Phase 1 backup ON OR BEFORE
--    2026-11-11. It still holds copies of members who have since deleted
--    their account, and the Privacy Policy promises their data is erased
--    within 30 days of deletion. Once dropped it can't be brought back.
-- ----------------------------------------------------------------------------
-- DROP SCHEMA phase1_backup CASCADE;
--
-- Still there? This lists it until it's dropped:
--   SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'phase1_backup';
