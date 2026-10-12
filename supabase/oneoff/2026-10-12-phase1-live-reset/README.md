# Phase 1 live reset (NRI+ project, `uzzkdmybsbwknpsucuvv`)

Moves the existing project to `supabase/migrations/20261012000000_nriclub_schema.sql`
while keeping its data. Run it once.

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

- Group member and event attendee counts are kept as they were.
- Post like counts restart at 0 (the old likes had already been overwritten);
  comment counts are recounted.
- A conversation stored twice (A→B and B→A) is kept once (the most recent).
- Private chat messages: none to restore (the table had been overwritten).

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
- Check the app and the admin panel (LAUNCH-GUIDE.md, Step 6).
- Once you're happy, drop the backup: `DROP SCHEMA phase1_backup CASCADE;`
- If you start using the Supabase CLI for this project, mark the schema as
  already applied so `supabase db push` doesn't run it again:
  `supabase migration repair --status applied 20261012000000`.
