# Phase 1 live reset (NRI+ project, `uzzkdmybsbwknpsucuvv`)

Moves the existing project to `supabase/migrations/20261012000000_nriclub_schema.sql`
while keeping its data. Run it once.

**Status:** this has been run on the live project; don't run it again. What
is still open is under "Afterwards" below. The fixes from the Phase 1 review
come next: `../2026-10-13-review-fixes/`.

## Why

The live database had drifted from the repo:

- An unrelated dating-app schema had been applied to it (`matches`, `photos`,
  `subscriptions`, `boosts`, `support_tickets`, `admin_users`, ~150 extra
  `profiles` columns). Its `likes` and `messages` tables replaced NRIclub's, so
  post likes and chat were broken. All of its tables were empty.
- `admin_*` functions (delete any row in any table, read every profile) were
  callable by anyone with the public key, and many policies let signed-out
  visitors delete posts, groups, events and listings or read all reports.

## What it does (one transaction)

1. `1_backup_and_drop.sql`: copies every NRIclub table into the
   `phase1_backup` schema (not exposed by the API), then drops the old tables,
   the dating-app tables, the old functions/triggers and the old storage
   policies.
2. `supabase/migrations/20261012000000_nriclub_schema.sql`: creates the new
   schema.
3. `3_restore_and_admin.sql`: restores the data, removes the empty `photos`
   bucket and makes `abyshece@gmail.com` the first admin.

What changes in the data:

- Group member and event attendee counts are kept as they were. They
  included made-up starting numbers from the old seed (Berlin 12,500 and so
  on); the review fixes set them to the real numbers.
- Post like counts restart at 0 (the old likes had already been overwritten);
  comment counts are recounted.
- A conversation stored twice (A→B and B→A) is kept once (the most recent).
- Private chat messages: none to restore (the table had been overwritten).
- Members whose old profile had the "LinkedIn verified" flag become
  approved, with no decision on record. An earlier version of the comment in
  `3_restore_and_admin.sql` called them members "an admin already approved",
  but before the reset any member could switch that flag on for themselves
  (and the old `admin_update_user` function was open to anyone). See
  "Approval audit" below.
- Restored members have no record of confirming they're 18+ or accepting the
  2026-10 Terms. With the review fixes, the site asks them once.
- Sign-in accounts that had no profile get one named after the part of
  their email before the `@`. The review fixes empty those names.

## Before running it

- Make sure you can sign in to the app as `abyshece@gmail.com` (the account
  that becomes admin). If you don't know its password, use **Forgot password?**
  on the login page after this branch is deployed, or in the Supabase
  dashboard: Authentication → Users → the account → *Send password recovery*.
- Optional check that no existing value is longer than the new limits (all
  were well within them on 2026-10-12):

  ```sql
  SELECT 'posts', count(*) FROM public.posts WHERE char_length(content) > 10000
  UNION ALL SELECT 'marketplace image_url', count(*) FROM public.marketplace WHERE char_length(image_url) > 20000
  UNION ALL SELECT 'reports', count(*) FROM public.reports WHERE char_length(reason) > 5000;
  ```

## Running it

All three files must run in **one** transaction, so if anything fails nothing
changes. In the Supabase SQL editor, paste the three files one after another
into a single query, wrapped like this, and run it:

```sql
BEGIN;
-- contents of 1_backup_and_drop.sql
-- contents of ../../migrations/20261012000000_nriclub_schema.sql
-- contents of 3_restore_and_admin.sql
COMMIT;
```

From a terminal with the database connection string:

```
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 \
  -f 1_backup_and_drop.sql \
  -f ../../migrations/20261012000000_nriclub_schema.sql \
  -f 3_restore_and_admin.sql
```

## Afterwards

- Deploy the app from this branch right after the reset commits (merge the
  pull request). The new app needs the new schema, and the old app's admin
  panel stops working against it.
- Delete `VITE_ADMIN_EMAIL` / `VITE_ADMIN_PASS` from the Vercel project; they
  are no longer used.
- **Treat the old admin password as public.** The old site built it into the
  JavaScript every visitor downloaded, and it is in the git history (commits
  from before 2026-04-24). Deleting the Vercel variables, or the old
  deployments, doesn't take it back. Change it wherever it, or something
  close to it, was used: above all the `abyshece@gmail.com` mailbox and that
  NRIClub account, which is now a full admin. Turn on two-step verification
  (MFA) for that email account and for the Supabase account. Details:
  LAUNCH-GUIDE.md, Step 3.
- Check the app and the admin panel (LAUNCH-GUIDE.md, Step 6).
- **Drop the backup on or before 2026-11-11** (30 days after the reset):
  `DROP SCHEMA phase1_backup CASCADE;` It holds full copies of the old
  tables, including members who have since deleted their account, and the
  Privacy Policy promises a deleted account's data is erased within 30 days.
  It can't be brought back once dropped.
- Run the approval audit (below).
- If you start using the Supabase CLI for this project, mark the schema as
  already applied so `supabase db push` doesn't run it again:
  `supabase migration repair --status applied 20261012000000`.

## Approval audit

The reset gave members with the old "LinkedIn verified" flag the status
"approved", and a "Last reviewed" date of the reset, with no decision on
record. Any member could set that flag on themselves before the reset, so
these members look reviewed by an admin but may never have been. This gives
them no extra access (approved members can do what pending members can), but
it does give them the Verified badge.

List them in the SQL editor (it only reads):

```sql
SELECT p.id, p.name, pp.email, p.linkedin_url, pp.reviewed_at
FROM public.profile_private pp
JOIN public.profiles p ON p.id = pp.id
WHERE pp.verification_status = 'approved'
  AND NOT EXISTS (SELECT 1 FROM public.verification_log l WHERE l.member_id = pp.id)
ORDER BY p.name;
```

Re-check each one in the admin panel (**Verification → Approved**) as you
would a new member. Keep the genuine ones and record your check; move the
others to pending and ask for more information, or reject them. The steps,
and the query that records a check, are in part 3 of
`../2026-10-13-review-fixes/live_followups.sql` (its README explains them).
You're done when the query lists nobody.
