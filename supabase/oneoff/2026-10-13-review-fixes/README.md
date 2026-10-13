# Review fixes on the live project (NRI+ project, `uzzkdmybsbwknpsucuvv`)

The fixes from the Phase 1 review (2026-10-12) come in two halves:

- the website: the pull request with the review fixes;
- the database: `supabase/migrations/20261013000000_review_fixes.sql`.

This folder explains how to put the database half on the live project, and
holds a few follow-up queries (`live_followups.sql`). Apply the migration
once.

## The order

1. **Apply the migration** (below).
2. **Straight away, merge the pull request.** Vercel builds and deploys the
   new site in a minute or two.
3. **Run `live_followups.sql`**, part by part.
4. **Check the site** (list at the end).

Why the migration goes first: the new site needs the new database. Its
Terms screen, "Download my data", and the admin panel's member list and
decisions all use database functions that only exist after the migration.
The current site keeps working on the new database, so applying the
migration first is safe. Keep the gap between steps 1 and 2 short (minutes,
not hours), because of the changes below.

## What members notice between steps 1 and 2

The current site stays up and works, with these differences:

- **Members who joined before Phase 1** (the ones the reset restored) and
  haven't yet confirmed they're 18+ and accepted the 2026-10 Terms: they can
  still sign in, but other members' posts, profiles and names don't show, and
  posting, commenting, messaging, RSVPs and listings fail. The database now
  needs the 18+ and Terms records before a member counts as active, and the
  current site has no screen to give them. Once the new site is live it asks
  them once ("Before you continue"), and everything is back as soon as they
  tick the box.
- **Members who signed up or sent their Get verified details on the Phase 1
  site** already have these records: nothing changes for them.
- **Rejected, blocked and unfinished accounts** no longer receive other
  members' data. The current site already shows them a lock screen or Get
  verified, so they see no difference.
- **Someone signing up with the email address or LinkedIn link of a
  rejected or blocked account** is held back until an admin approves them:
  on the current site they see an empty feed and can't post. The current
  admin panel doesn't show why; the new one marks them "Previously
  rejected" or "Previously blocked".
- **The current admin panel**: Approve and "Ask for more info" are refused
  for members who haven't sent their details ("This member hasn't submitted
  their details yet.") and for members who aren't waiting for review (move
  them back to pending first). "Move to pending" is refused for members
  rejected before they sent their details, and now also leaves the member a
  notification: "Your profile is back in review."
- **Settings → Marketing Emails** on the current site saves the choice in a
  place the new site no longer reads. Part 2 of `live_followups.sql` catches
  anyone who switched it off in between.
- Not visible to members: dates are now set by the server, event organiser
  names come from the organiser's profile, message previews have a length
  limit, and photo links must be uploads to this project.

Members who have the site open keep the old version until they reload the
page.

## 1. Apply the migration

What it changes in the existing data (nothing is deleted):

- marketing consent: kept only if it was given and the member never switched
  Marketing Emails off in Settings;
- dates in the future (which only a tampered request could set) become now;
- message previews longer than 500 characters are shortened;
- names that are just the email address, or the part before the `@`, are
  emptied (they came from accounts made outside the site's signup);
- community member counts are set to the real number of members;
- members already rejected or blocked get a moderation record, so they're
  recognised if they delete their account and sign up again.

If your Supabase plan has backups (**Database → Backups**), check there is
one from today.

In the Supabase dashboard, **SQL Editor → New query**:

1. Open the migration file in the pull request on GitHub (**Files changed →
   `supabase/migrations/20261013000000_review_fixes.sql` → View file →
   Raw**), select everything and copy it.
2. In the new query, type `BEGIN;` on the first line, paste the file below
   it, and type `COMMIT;` on the last line:

   ```sql
   BEGIN;
   -- contents of supabase/migrations/20261013000000_review_fixes.sql
   COMMIT;
   ```
3. Click **Run**. The editor may warn about destructive operations: the file
   replaces some database functions and rules, and deletes no data. Confirm.
4. You should see "Success. No rows returned" after a few seconds.

If it shows an error instead, nothing was changed: the file runs as one
transaction, all or nothing. Send the error message to your developer, and
don't try to run parts of the file. Running the whole file a second time
also fails harmlessly ("already exists") and changes nothing.

From a terminal with the database connection string, the same in one go:

```
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20261013000000_review_fixes.sql
```

If you use the Supabase CLI for this project, mark the migration as applied
so `supabase db push` doesn't run it again:

```
supabase migration repair --status applied 20261013000000
```

(The Phase 1 schema needs the same once, if you haven't done it yet:
`supabase migration repair --status applied 20261012000000`.)

## 2. Merge the pull request

Merge it on GitHub. In Vercel, wait until the new deployment shows
**Ready**, then reload the site.

## 3. Follow-ups: `live_followups.sql`

Run each numbered part as its own query (copy the part into a new query and
run it): the SQL editor only shows the result of the last statement.

1. **Storage address.** Tells the database the project's Storage address,
   so photo links saved through the site must be uploads in this project.
   The table it shows counts the photos already on the site: most should be
   under `uploaded_here`. Links under `from_elsewhere` are older ones and are
   left alone. If `uploaded_here` is 0 everywhere but members do have
   photos, the address is wrong: ask your developer before members upload
   more photos.
2. **Bring stored data up to date.** Sets community member counts and event
   attendee counts to the real numbers (the old seed and the reset kept
   made-up starting numbers, such as Berlin 12,500), and withdraws marketing
   consent for anyone who switched Marketing Emails off on the old site in
   the last day. Run it the same day as the migration. It's safe to run
   again.
3. **Approval audit** (only reads). Lists members the Phase 1 reset marked
   "approved" with no decision on record. Before the reset any member could
   switch on the old "LinkedIn verified" flag on their own profile, and the
   reset turned that flag into "approved", so these members look reviewed but
   may never have been. For each one, open **Admin panel → Verification →
   Approved**, find them and check their name and LinkedIn as you would for a
   new member:
   - **Genuine:** run the `INSERT` under part 3 for them: copy it into a new
     query, remove the `-- ` at the start of each line, and replace
     `<member id>` with their id from the list. It records your check without
     changing anything for them. (Or press **Move to pending** and then
     **Approve**: both decisions are recorded, and they get a "You're
     verified" notification again.)
   - **Not sure:** **Move to pending**, then **Ask for more info**.
   - **Not genuine:** **Reject**, with a reason.

   Run part 3 again: you're done when it lists nobody.
4. **Names check** (only reads). Expected: no rows. If it lists anyone, their
   name was copied from their email address: empty it with the `UPDATE`
   under part 4 (copy it into a new query and remove the `-- ` at the start of
   each line).
5. **Reminder, not for now:** drop the Phase 1 backup with
   `DROP SCHEMA phase1_backup CASCADE;` **on or before 2026-11-11**. It still
   holds copies of members who have since deleted their account, and the
   Privacy Policy promises their data is erased within 30 days. Put it in your
   calendar.

## 4. Check the site

- Sign in as a member who joined before Phase 1: the "Before you continue"
  screen asks once for 18+ and the Terms, then the feed loads.
- Admin panel → **Verification** and **Members** load, and the member counts
  look right.
- Upload a profile photo and a post photo: both save.
- Settings → **Download My Data**: the file has your profile, settings, posts
  and verification history.
- The rest of the checklist in `LAUNCH-GUIDE.md` (Step 6).

The other launch tasks from the review (custom email, the old admin
password, the backup deadline) are in `LAUNCH-GUIDE.md` under "Before
inviting the public".
