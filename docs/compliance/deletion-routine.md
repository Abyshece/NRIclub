# Deletion routine (by hand, until the clean-up jobs exist)

The Privacy Policy promises how long data is kept (section 2) and says that,
for now, our team deletes it by hand once a month (section 9). This file is
how. The periods are in `RETENTION` in `src/content/legal/privacy.js`; if
you change one there, change it here too, and the other way round.

Photo files are no longer deleted by hand (plan C1, since the 2026-10-22
update): see "Photo files" below. When the database does the rest itself
(plan C20, clean-up jobs), set `byHand` in `RETENTION` to false and stop
the monthly part of this routine.

| What | Kept for | How often you run it |
|---|---|---|
| Photo files nothing uses any more (deleted posts, listings, events, replaced or removed profile photos, deleted accounts, content our team removed) | deleted within 7 days at most | **automatic** when an admin opens the admin panel (once a day); open it at least once a week |
| Sign-ups that never confirmed their email address | 30 days | once a month |
| Accounts that never sent their check details | 90 days | once a month |
| Accounts our team declined | 6 months after the decision | once a month |
| Accounts whose membership we ended | 6 months after the decision | once a month (by hand, below) |
| In-app notices the member has read | 6 months | once a month |
| Closed reports, and evidence copies kept with them | once closed and 12 months old | once a month |
| Record of declined and blocked accounts | 24 months after the decision; its note after 12 months | once a month |
| Emails about rights and reports of illegal content, with our answers | 3 years after the matter is closed | once a month (mailbox) |
| All other emails, with our replies | 12 months after the matter is closed | once a month (mailbox) |

Write the date and what you deleted in the log at the end.

All SQL runs in the Supabase dashboard → SQL Editor, on the live project.

## Photo files (automatic, from the admin panel)

What the site deletes by itself, at once:

- a member's post, Market listing or event they delete: its photos;
- a profile photo they replace or remove;
- all of a member's photo files when they delete their account (before the
  account itself);
- a photo taken off a post or event before it was published.

What is left behind (content our team removed, accounts deleted by the
nightly clean-up or by hand, a deletion that failed, photos uploaded for a
post that was never published) the **photo clean-up** in the admin panel
deletes. It asks the database (`public.admin_storage_orphans`) for photo
files no profile, post, event, group or Market listing uses and that either
belong to an account that no longer exists or are more than a day old, and
deletes them through Storage with the admin's own session. The database
lets an admin delete a photo file only while nothing uses it, so the
clean-up can never break a photo that is shown.

- It runs **by itself once a day**, for the first admin who opens the admin
  panel that day (a toast says what it deleted, if anything).
- **Overview → Photo files → Clean up photo files** runs it at once and
  shows what it deleted.
- The Privacy Policy promises these files go within 7 days at most
  (`RETENTION.photoCleanupDays`). So **open the admin panel at least once a
  week**; if you can't, ask another admin to.

To check by hand which files the clean-up would delete (SQL Editor; it
changes nothing; replace the email with an admin's):

```sql
-- NRIClub: photo files the clean-up would delete now.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', id, 'role', 'authenticated', 'aal', 'aal2')::text, true)
FROM auth.users WHERE email = 'admin@example.com';
SET LOCAL ROLE authenticated;
SELECT * FROM public.admin_storage_orphans(1000);
ROLLBACK;
```

If the panel can't be used, delete the listed files in the dashboard:
Storage → the bucket → open the folder (the first part of the name) → tick
the files → Delete. Never delete rows from `storage.objects` with SQL: the
file itself would stay, and the live project refuses it anyway.

### Once, after the 2026-10-22 update: photos uploaded before it

Since that update the site saves every photo again before uploading it,
which removes hidden details such as where it was taken (EXIF/GPS). Photos
uploaded before were often kept as they were (two post photos on live had
GPS data, and some profile photos were HEIC files from iPhones). The
clean-up deletes those nothing uses; the ones still shown stay. List them
(it changes nothing):

```sql
-- NRIClub once: photo files from before 2026-10-22 (not named <random>.jpg).
SELECT o.bucket_id, o.name, o.metadata->>'mimetype' AS type, o.created_at
FROM storage.objects o
WHERE o.bucket_id IN ('avatars', 'post-images', 'marketplace-images')
  AND o.name !~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
ORDER BY o.created_at;
```

Open each JPEG or HEIC file (Storage → the bucket → the file → Download)
and look for a location in its details (for example with exiftool, or on a
Mac in Preview → Tools → Show Inspector). For each one with a location:

- take it off what shows it, in the SQL Editor:
  - a post: `UPDATE public.posts SET image_url = NULL WHERE image_url LIKE '%/<file name>';`
  - an event: `UPDATE public.events SET image_url = '' WHERE image_url LIKE '%/<file name>';`
  - a profile photo: `UPDATE public.profiles SET avatar_url = '' WHERE avatar_url LIKE '%/<file name>%';`
  - a Market listing: ask the member to delete the listing and post it again;
- then press **Clean up photo files** (the file is older than a day, so it
  goes at once), and ask the member to add the photo again: the site now
  removes the location;
- note the date and the files in `breach-register.md` (the line marked
  **[fill in]**).

## Once a month: the database

### Step 1: see what will go (changes nothing)

```sql
-- NRIClub monthly, step 1: what the deletion will remove.
SELECT 'unconfirmed sign-ups, 30 days' AS what, count(*) FROM auth.users u
  WHERE u.email_confirmed_at IS NULL AND u.created_at < now() - interval '30 days'
    AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = u.id)
UNION ALL
SELECT 'unfinished accounts, 90 days', count(*) FROM public.profile_private pp
  WHERE pp.verification_status = 'incomplete' AND pp.updated_at < now() - interval '90 days'
    AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = pp.id)
UNION ALL
SELECT 'declined accounts, 6 months', count(*) FROM public.profile_private pp
  WHERE pp.verification_status = 'rejected' AND COALESCE(pp.reviewed_at, pp.updated_at) < now() - interval '6 months'
    AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = pp.id)
UNION ALL
SELECT 'read in-app notices, 6 months', count(*) FROM public.notifications
  WHERE read AND created_at < now() - interval '6 months'
UNION ALL
SELECT 'closed reports, 12 months', count(*) FROM public.reports
  WHERE status <> 'pending' AND created_at < now() - interval '12 months'
UNION ALL
SELECT 'records of declined and blocked accounts, 24 months', count(*) FROM private.moderation_record
  WHERE created_at < now() - interval '24 months'
UNION ALL
SELECT 'notes in those records, 12 months', count(*) FROM private.moderation_record
  WHERE admin_note <> '' AND created_at < now() - interval '12 months';
```

The first time, older accounts that never finished signing up go at once.
If you'd like to warn them first, email them two weeks before.

### Step 2: delete

A report that is part of a legal dispute or a police matter that is still
open stays: put its id between the braces in `'{}'` below (several ids
separated by commas, e.g. `'{1b2c..., 3d4e...}'`). Evidence copies you kept
outside the database (screenshots) go with their report: delete them by
hand when the report goes.

```sql
-- NRIClub monthly, step 2: delete. Deleting the auth.users row deletes an
-- account exactly as Settings > Delete account does.
BEGIN;
DELETE FROM auth.users u
  WHERE u.email_confirmed_at IS NULL AND u.created_at < now() - interval '30 days'
    AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = u.id);
DELETE FROM auth.users u USING public.profile_private pp
  WHERE pp.id = u.id AND pp.verification_status = 'incomplete' AND pp.updated_at < now() - interval '90 days'
    AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = u.id);
DELETE FROM auth.users u USING public.profile_private pp
  WHERE pp.id = u.id AND pp.verification_status = 'rejected'
    AND COALESCE(pp.reviewed_at, pp.updated_at) < now() - interval '6 months'
    AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = u.id);
DELETE FROM public.notifications WHERE read AND created_at < now() - interval '6 months';
DELETE FROM public.reports
  WHERE status <> 'pending' AND created_at < now() - interval '12 months'
    AND NOT (id = ANY ('{}'::uuid[]));
DELETE FROM private.moderation_record WHERE created_at < now() - interval '24 months';
UPDATE private.moderation_record SET admin_note = ''
  WHERE admin_note <> '' AND created_at < now() - interval '12 months';
COMMIT;
```

Run step 1 again: the counts should now be 0 (except reports you kept).

### Step 3: memberships we ended

The database doesn't know whether a block is for a time or ends the
membership. This lists accounts blocked more than 6 months ago:

```sql
SELECT pp.id, p.name, pp.email, r.created_at AS blocked_on
FROM public.profile_private pp
JOIN public.profiles p ON p.id = pp.id
LEFT JOIN private.moderation_record r ON r.member_id = pp.id AND r.decision = 'blocked'
WHERE pp.status = 'blocked' AND (r.created_at IS NULL OR r.created_at < now() - interval '6 months')
ORDER BY r.created_at;
```

For each one whose membership you ended (Terms, section 12; check your
moderation log), delete the account:

```sql
DELETE FROM auth.users WHERE id = '<id>';
```

## Once a month: the mailbox

In the hello@nriclub.app mailbox, delete:

- requests about rights (access, erasure, objection and so on), reports of
  illegal content, appeals and authority orders, with our answers, whose
  matter was closed more than 3 years ago;
- all other emails, with our replies, whose matter was closed more than 12
  months ago.

Keep a request log (date, who, what, deadline, date answered; see
`moderation-guidelines.md`) and delete its entries on the same schedule.

## Log

Photo files aren't logged here: the admin panel deletes them by itself.

| Date | Accounts deleted | Notices, reports, records | Mailbox | By |
|---|---|---|---|---|
| | | | | |
