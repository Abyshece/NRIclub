# Deletion routine (by hand, until the clean-up jobs exist)

The Privacy Policy promises how long data is kept (section 2) and says that,
for now, our team deletes it by hand: photo files every week, everything
else once a month (section 9). This file is how. The periods are in
`RETENTION` in `src/content/legal/privacy.js`; if you change one there,
change it here too, and the other way round.

When the database does this itself (plan C20, clean-up jobs; plan C1, photo
files deleted with their post or account), set `byHand` (and
`photoFilesDeleted`) in `RETENTION` accordingly and stop this routine.

| What | Kept for | How often you run it |
|---|---|---|
| Photo files nothing uses any more (deleted posts, listings, events, replaced profile photos, deleted accounts) | deleted within 7 days | **every week** |
| Sign-ups that never confirmed their email address | 30 days | once a month |
| Accounts that never sent their check details | 90 days | once a month |
| Accounts our team declined | 6 months after the decision | once a month |
| Accounts whose membership we ended | 6 months after the decision | once a month (by hand, below) |
| In-app notices the member has read | 6 months | once a month |
| Closed reports, and evidence copies kept with them | once closed and 12 months old | once a month |
| Closed reports from the form at nriclub.app/report | once closed and 12 months old | once a month |
| Coded addresses behind the report limits (`private.notice_log`) | 24 hours | once a month |
| Record of our decisions (`private.moderation_action`) | 24 months; the copy of removed content in it after 6 months | once a month |
| Record of declined and blocked accounts | 24 months after the decision; its note after 12 months | once a month |
| Emails about rights and reports of illegal content, with our answers | 3 years after the matter is closed | once a month (mailbox) |
| All other emails, with our replies | 12 months after the matter is closed | once a month (mailbox) |

Write the date and what you deleted in the log at the end.

All SQL runs in the Supabase dashboard → SQL Editor, on the live project.

## Every week: photo files

Files in Storage aren't deleted with their post or account yet. This query
lists every photo file that is more than a day old and that either belongs
to an account that no longer exists or that no profile, post, event, group
or Market listing uses. It changes nothing.

```sql
-- NRIClub weekly: photo files nothing uses any more.
WITH used AS (
  SELECT avatar_url AS url FROM public.profiles WHERE avatar_url <> ''
  UNION ALL SELECT image_url FROM public.posts WHERE image_url <> ''
  UNION ALL SELECT image_url FROM public.events WHERE image_url <> ''
  UNION ALL SELECT image_url FROM public.groups WHERE image_url <> ''
  UNION ALL SELECT image_url FROM public.marketplace WHERE image_url <> ''
)
SELECT o.bucket_id, json_agg(o.name ORDER BY o.name) AS files, count(*) AS how_many
FROM storage.objects o
WHERE o.bucket_id IN ('avatars', 'post-images', 'marketplace-images')
  AND o.created_at < now() - interval '1 day'
  AND (
    NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id::text = split_part(o.name, '/', 1))
    OR NOT EXISTS (SELECT 1 FROM used WHERE position('/' || o.bucket_id || '/' || o.name IN used.url) > 0)
  )
GROUP BY o.bucket_id
ORDER BY o.bucket_id;
```

Then delete the listed files:

- **In the dashboard:** Storage → the bucket → open the folder (the first
  part of the name) → tick the files → Delete. A whole folder of an account
  that no longer exists can be deleted at once.
- **Or with one request per bucket** (many files), using the service role
  key from Project Settings → API (never put it anywhere else):

  ```
  curl -X DELETE "https://uzzkdmybsbwknpsucuvv.supabase.co/storage/v1/object/<bucket>" \
    -H "apikey: <service role key>" -H "Authorization: Bearer <service role key>" \
    -H "Content-Type: application/json" \
    -d '{"prefixes": <the files list from the query>}'
  ```

Never delete rows from `storage.objects` with SQL: the file itself would
stay, and the live project refuses it anyway.

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
  WHERE admin_note <> '' AND created_at < now() - interval '12 months'
UNION ALL
SELECT 'closed reports from the form, 12 months', count(*) FROM private.notices
  WHERE status = 'closed' AND created_at < now() - interval '12 months' AND hold_reason = ''
UNION ALL
SELECT 'report-limit counters, 1 day', count(*) FROM private.notice_log
  WHERE at < now() - interval '1 day'
UNION ALL
SELECT 'copies of removed content, 6 months', count(*) FROM private.moderation_action
  WHERE snapshot IS NOT NULL AND created_at < now() - interval '6 months'
UNION ALL
SELECT 'records of our decisions, 24 months', count(*) FROM private.moderation_action
  WHERE created_at < now() - interval '24 months';
```

(The last four exist once the database update of 21 October 2026 is in;
before it, leave them out.)

The first time, older accounts that never finished signing up go at once.
If you'd like to warn them first, email them two weeks before.

### Step 2: delete

A report that is part of a legal dispute or a police matter that is still
open stays: put its id between the braces in `'{}'` below (several ids
separated by commas, e.g. `'{1b2c..., 3d4e...}'`), or hold it with
`private.report_hold` (`moderation-guidelines.md`, step 8). A report from
the form that is held has `hold_reason` set and stays; so do the decisions
that answered held reports. Evidence copies you kept
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
-- Since the database update of 21 October 2026:
DELETE FROM private.notices
  WHERE status = 'closed' AND created_at < now() - interval '12 months' AND hold_reason = '';
DELETE FROM private.notice_log WHERE at < now() - interval '1 day';
UPDATE private.moderation_action a SET snapshot = NULL
  WHERE snapshot IS NOT NULL AND created_at < now() - interval '6 months'
    AND NOT EXISTS (SELECT 1 FROM private.report_hold h WHERE h.report_id = ANY (a.report_ids))
    AND NOT EXISTS (SELECT 1 FROM private.notices n WHERE n.id = a.notice_id AND n.hold_reason <> '');
DELETE FROM private.moderation_action a
  WHERE created_at < now() - interval '24 months'
    AND NOT EXISTS (SELECT 1 FROM private.report_hold h WHERE h.report_id = ANY (a.report_ids))
    AND NOT EXISTS (SELECT 1 FROM private.notices n WHERE n.id = a.notice_id AND n.hold_reason <> '');
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

| Date | Photo files deleted | Accounts deleted | Notices, reports, records | Mailbox | By |
|---|---|---|---|---|---|
| | | | | | |
