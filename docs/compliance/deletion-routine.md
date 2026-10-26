# Retention and deletion: the scheduled jobs, and what is still by hand

The Privacy Policy promises how long data is kept (section 2) and says
(section 9) that the periods are kept automatically every night, except
for a few things our team does by hand: once a month, the accounts whose
membership we ended and the copies of emails we keep longer than the admin
Inbox does; and photo files left behind, when an admin opens the admin
panel. This file documents the jobs and those steps. The periods are in
`RETENTION` in `src/content/legal/privacy.js` (`byHand: false` since 26
October 2026); if you change one there, change it here and in the job too.

A member who asks us to delete their account: see "Deleting an account on
request" below.

## The scheduled jobs (pg_cron, every night, times in UTC)

| Job | Function | Since | Deletes |
|---|---|---|---|
| `nriclub-daily-cleanup`, 03:17 | `private.daily_cleanup()` | 20 October 2026 (extended by later updates) | Sign-ups never confirmed (30 days); accounts that never sent their check details (90 days); accounts we declined (6 months after the decision); read in-app notices (6 months); closed reports, once 12 months old, unless held; closed reports from the form at nriclub.app/report, once 12 months old, unless held; the record of declined and blocked accounts (24 months; its note after 12); the copy of removed content in our decisions (6 months) and the decisions (24 months), unless held; ambassador applications (6 months after the decision, undecided ones 12 months); the admin Inbox with our replies (12 months after arrival); travel board posts (30 days after their last date); the ambassador log and welcomes (12 months); the limit counters (`private.rate_log`, 1 day, travel board posts 30 days), name changes (30 days), the report and application limit hashes (1 day), the note of decision emails sent (`private.member_email_log`, 30 days) |
| `nriclub-profile-reminders-cleanup`, 03:29 | `private.profile_reminders_cleanup()` | 28 October 2026 | Notes of profile reminders our team sent (12 months) |
| `nriclub-analytics-cleanup`, 03:41 | `private.analytics_cleanup()` | 29 October 2026 | Website analytics events (6 months) |
| `nriclub-housing-cleanup`, 03:53 | `private.housing_cleanup()` | 30 October 2026 | Housing listings with their Market listing and matching notices, and "Looking for a place" posts, 30 days after they expired (listings: their "until" date, or 60 days after posting or renewal if open-ended; looking posts: their end date, or 60 days); the counts behind their limits (30 days) |
| `nriclub-retention-cleanup`, 04:05 | `private.retention_cleanup()` | 2 November 2026 (`20261102000000_compliance_fixes.sql`) | The urgent-question log (`private.urgent_log`, 2 days); every in-app notice, read or not (12 months) |

The four jobs before the last were confirmed scheduled on the live project
(26 October 2026). The database update of 2 November 2026 schedules the
fifth itself, if pg_cron is there.

### Check the jobs (once a month)

In the Supabase dashboard → SQL Editor (it changes nothing):

```sql
-- NRIClub: the clean-up jobs, and how their last runs went.
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'nriclub-%' ORDER BY jobname;
SELECT j.jobname, d.status, d.return_message, d.start_time
FROM cron.job_run_details d JOIN cron.job j USING (jobid)
WHERE j.jobname LIKE 'nriclub-%' ORDER BY d.start_time DESC LIMIT 20;
```

Five jobs, all active, and recent runs `succeeded` (the return message says
how many rows each part deleted). If a job is missing, schedule it again
(safe to run more than once): `SELECT private.schedule_daily_cleanup();`,
`private.schedule_profile_reminders_cleanup()`,
`private.schedule_analytics_cleanup()`, `private.schedule_housing_cleanup()`
or `private.schedule_retention_cleanup()`. If one failed, run its function
by hand (for example `SELECT private.retention_cleanup();`), read the
error, and fix it before the next night.

A report that is part of a legal dispute or a police matter that is still
open stays: hold it with `private.report_hold`, or set `hold_reason` on a
report from the form (`moderation-guidelines.md`, step 8). Evidence copies
you kept outside the database (screenshots) go with their report: delete
them by hand when the report goes.

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

## Once a month: memberships we ended

The database doesn't know whether a block is for a time or ends the
membership, so the jobs leave these accounts alone. This lists accounts
blocked more than 6 months ago:

```sql
SELECT pp.id, p.name, pp.email, r.created_at AS blocked_on
FROM public.profile_private pp
JOIN public.profiles p ON p.id = pp.id
LEFT JOIN private.moderation_record r ON r.member_id = pp.id AND r.decision = 'blocked'
WHERE pp.status = 'blocked' AND (r.created_at IS NULL OR r.created_at < now() - interval '6 months')
ORDER BY r.created_at;
```

For each one whose membership you ended (Terms, section 12; check your
moderation log), delete the account in the admin panel: Members → search
for them → open them → **Delete account…** → **Blocked account** (see
"Deleting an account on request" below for the rest of the form). That also
deletes their photo files, emails them and records the deletion. Only
before the database update of 1 November 2026, or if the panel can't be
used, delete it in the SQL Editor instead (no email, no record; the photo
clean-up deletes the files within days):

```sql
DELETE FROM auth.users WHERE id = '<id>';
```

## Deleting an account on request

When a member asks us to delete their account (Art. 17 GDPR), usually by
email to hello@nriclub.app because they can't sign in any more. Answer
within one month (Privacy Policy, section 10). Since the database update of
1 November 2026 and the Edge Function `admin-delete-member`
(`docs/DEPLOY-ROUND3.md`).

1. **Check it's them.** The request should come from the address of the
   account. If it doesn't, reply to the account's address and ask them to
   confirm from there; don't delete until they do.
2. **Note it** in the request log (date, who, what, deadline; see
   `moderation-guidelines.md`).
3. **Delete it:** admin panel → Members → search for their email address →
   open them → **Delete account…**:
   - Why: **The member asked us to delete their account**;
   - Internal note (optional, at most 500 characters): e.g. "Asked by email
     on 26 October". Don't write their name or email address: the note stays
     in our record of decisions after the account is gone;
   - type their email address to confirm → **Delete account**.

   Their photo files, profile, everything they posted and their messages go,
   as when members delete their own account; our records of decisions stay,
   without their name. Admins' accounts, and your own, can't be deleted
   there.
4. **The email.** They get "Your NRIClub account has been deleted" from
   `MAIL_FROM`. If the panel says "The email couldn't be sent; please tell
   the member yourself", reply to their request in the Inbox to say it's
   done.
5. **Close it** in the request log (date answered). Keep a copy of the
   request and our answers with the log for 3 years (below): the Inbox
   deletes them after 12 months.

If the panel says "Some photo files are left", the photo clean-up deletes
them within days; nothing to do. The deletion shows in the record of our
decisions (`private.moderation_action`, action `delete_member`, with the
account's ID only), which is deleted after 24 months like the rest.

## Once a month: copies of emails

The admin Inbox deletes every email, with our replies, 12 months after it
arrived (the daily job). Longer or elsewhere, by hand:

- **Requests about rights** (access, erasure, objection and so on),
  **reports of illegal content, appeals and authority orders**, with our
  answers: before the Inbox deletes them, save a copy (for example as PDF)
  with the request log, outside the repository, and delete it once the
  matter was closed more than 3 years ago.
- **Emails sent from your mail app** (the emails the panel prepares,
  `docs/EMAIL-SETUP.md`): delete those whose matter was closed more than 12
  months ago, or 3 years for the requests above.
- **Received emails in Resend** (Emails → Receiving): if Resend keeps them
  longer than 12 months, delete older ones (`processor-agreements.md`).
- **Gmail:** nothing should be there. The copies forwarded until 26 October
  2026 are deleted once (`LAUNCH-GUIDE.md`, "Compliance fixes: what to do").

Keep a request log (date, who, what, deadline, date answered; see
`moderation-guidelines.md`) and delete its entries on the same schedule.

## Log

Note the monthly check here. The jobs and the photo clean-up aren't logged
here: they report in `cron.job_run_details` and in the admin panel.

| Date | Jobs all succeeded? | Ended memberships deleted | Email copies deleted | By |
|---|---|---|---|---|
| | | | | |
