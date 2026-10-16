# NRIClub Launch Guide

## What's in the repo

| Path | What it is |
|------|-----------|
| `supabase/migrations/` | The whole database, one file per update, applied in name order: the schema (`20261012000000_nriclub_schema.sql`: tables, security policies, triggers, storage buckets, realtime), the Phase 1 review fixes (`20261013…`), the features up to mentoring (`20261014…` to `20261018…`), compliance round 1 (`20261019000000_access_consent.sql`, `20261020000000_notifications_limits_privacy.sql`) and round 2 (`20261021000000_moderation_dsa.sql`, `20261022000000_storage_images.sql`, `20261023000000_admin_access.sql`) |
| `supabase/seed.sql` | Starter data for a new project: the city communities, with no members (no example events) |
| `supabase/tests/` | Automated security tests for the database (see "Testing the database") |
| `supabase/oneoff/` | One-time scripts for the existing project (already applied ones are documented there) |
| `src/supabaseApi.js` | API layer: auth, posts, messages, groups, events, marketplace, admin, etc. |
| `src/App.jsx` | The frontend |
| `src/content/legal/` | The Terms of Use, the Privacy Policy, the Art. 9 consent wording and the reporting texts (shown at nriclub.app/terms and /privacy and in the app) |
| `src/content/imprint.js` | The Impressum, and the operator details the Terms and the Privacy Policy show |
| `vercel.json` | Hosting rules and the security headers (Content-Security-Policy and others) |
| `docs/compliance/` | Records the operator must keep (GDPR, Digital Services Act) and questions for the lawyer |
| `.env.example` | The environment variables the app needs |

---

## Step 1: Database

**New Supabase project:** open **SQL Editor → New query**, paste the whole of
`supabase/migrations/20261012000000_nriclub_schema.sql` and run it. Do the
same with every other file in `supabase/migrations/`, in name order (oldest
first), then with `supabase/seed.sql`. (With the Supabase CLI,
`supabase db push` applies the migrations; run the seed as above.) The seed
is only for a new project.

Then tell the database the project's public Storage address (the project URL
from **Project Settings → API**, plus `/storage/v1/object/public/`). Photo
links members save must point there, inside their own folder:

```sql
INSERT INTO private.app_config (key, value)
VALUES ('storage_public_url', 'https://<project-ref>.supabase.co/storage/v1/object/public/');
```

The review-fixes migration also makes a secret key for the records it keeps
of rejected and blocked members (`moderation_salt` in `private.app_config`;
they hold the email address only in a coded form made with this key). Never
change or delete it: those people would no longer be recognised if they
sign up again.

**The existing NRI+ project** (`uzzkdmybsbwknpsucuvv`) was moved to this schema
with the one-off script in `supabase/oneoff/2026-10-12-phase1-live-reset/`
(already run; see the README there for what is still open). The review fixes
are applied to it as described in `supabase/oneoff/2026-10-13-review-fixes/`:
the migration goes on before the pull request that needs it is merged. Later
updates each have one file to run in the SQL editor, in date order, in
`supabase/oneoff/` (each says at the top what it does and what to do
afterwards). Compliance round 1 is
`2026-10-19-compliance-round1/run_in_sql_editor.sql`; compliance round 2 is
`2026-10-21-compliance-round2/run_in_sql_editor.sql` (see "Compliance round
2: what to do, in order" below). Since round 1, the site goes live first
and the SQL runs right after, the same day: the site works with the
database before and after the update.

## Step 2: Authentication settings

In the Supabase dashboard → **Authentication**:

1. **Sign In / Providers → Email**: email provider ON, *Confirm email* ON,
   *Secure email change* ON, minimum password length **8**, *Email OTP
   length* **6** (the site's code boxes take exactly 6 digits).
2. **Emails → SMTP Settings: set up custom SMTP. Required before anyone
   outside your team signs up.** Signup and code login both need an emailed
   6-digit code. Supabase's built-in sender only delivers to the email
   addresses of your own Supabase team, and only a few emails an hour.
   Without custom SMTP the public sees "We couldn't create your account",
   while your own address still works, which hides the problem.
   - These are the only emails NRIClub sends: sign-up codes, code logins,
     password links and email-change confirmations. Everything else (the
     verification result, new messages, Namaste requests, answers, bookings)
     shows inside the app as a pop-up or under the bell. So the volume is
     about one or two emails per new member plus password resets, not one
     per member per month.
   - Choose an email provider (for example Resend, Postmark, Brevo or Amazon
     SES), verify the `nriclub.app` domain with it (it gives you DNS records
     to add where the domain is registered), and enter its SMTP host, port,
     user name and password here. Mind the daily limits on free plans
     (Resend's free plan: 3,000 a month but only 100 a day; Brevo's: 300 a
     day): a launch day with more sign-ups than that needs a paid plan or
     Amazon SES (about $0.10 per 1,000 emails).
   - Sender address e.g. `no-reply@nriclub.app`, sender name `NRIClub`,
     reply-to `hello@nriclub.app` (never `support@` or `privacy@`: they
     don't exist).
   - In the email provider, switch **off** open and click tracking, so
     password links aren't rewritten through the provider, and accept its
     data processing agreement (`docs/compliance/processor-agreements.md`).
   - Test it: sign up with an address that isn't on your Supabase team (a
     friend's, or a new free mailbox) and check the code arrives.
3. **Rate Limits**: raise the limit for emails sent per hour (e.g. to 100; it
   can only be changed once custom SMTP is on). Every signup, code login,
   resent code and password reset sends an email, and the default is far too
   low for a launch.
4. **Emails → Templates**: the signup flow asks for the 6-digit code. In the
   *Confirm signup* and *Magic Link* templates, **replace** the link with the
   code: remove `{{ .ConfirmationURL }}` and show `{{ .Token }}` instead (e.g.
   "Your NRIClub code is {{ .Token }}"). Don't keep the link next to the
   code; the site only works with the code. The *Reset password* template
   keeps its link (`{{ .ConfirmationURL }}`); it opens the site's "Set a new
   password" screen.
   Below the code in *Confirm signup*, add the contract confirmation
   (wording from the legal review, `docs/compliance/questions-for-the-lawyer.md`):
   "Enter this code to finish signing up. Your membership is then under
   our Terms of Use (version 2026-10-19), which you accepted on the sign-up
   form; you can read and save them at https://nriclub.app/terms.
   Provider: <name, address>, hello@nriclub.app. You can withdraw from the
   contract within 14 days by telling us or by deleting your account."
   Change the template only after `20261019000000_access_consent.sql` has
   run on the live database: before that, sign-ups still accept version
   2026-10. Keep the version in step with the Terms. Once the company is
   registered, add its details (§ 35a GmbHG) to every template.
5. **Attack Protection**: turn on *Leaked password protection* (prevent use of
   leaked passwords). It may need a paid plan (Pro); if yours doesn't offer
   it, skip it.
6. **URL Configuration**: Site URL = your live URL (e.g. `https://nriclub.app`),
   and add `https://nriclub.app/**` and `https://admin.nriclub.app/**` to the
   redirect URLs. Use `http://localhost:3000` while developing.

## Step 3: Make yourself an admin

Admins sign in to the admin panel with a normal NRIClub account. Sign up in
the app first, then in the SQL editor run:

```sql
INSERT INTO public.admins (user_id)
SELECT id FROM auth.users WHERE email = 'you@example.com';
```

To remove an admin: `DELETE FROM public.admins WHERE user_id = (SELECT id FROM auth.users WHERE email = '...');`

The admin panel is only at `https://admin.nriclub.app` (add that domain to
the Vercel project, and check that it opens the site, before you deploy a
version with this rule). `https://nriclub.app/#admin` sends you there. While
developing, `http://localhost:3000/#admin` opens it.

**Two-step login for admins.** In the admin panel open **Security** and set
up two-step login with an authenticator app (Google Authenticator,
Microsoft Authenticator, 1Password, Aegis...). Keep the key it shows in your
password manager. Then switch on **Require two-step login for admin
rights**: from then on the database gives admin rights only to a session
signed in with the 6-digit code. (Supabase: **Authentication → Multi-Factor**
must allow TOTP; it does by default.) Then set `SECURITY.adminTwoStep` to
`true` in `src/content/legal/privacy.js` and deploy, so the Privacy Policy
says so. Every admin should set up two-step login before you switch it on:
while it is on, an admin without it is asked to set it up at the login with
the password alone (so nobody is locked out, but a stolen password of such
an admin would be enough). With two-step login set up, "Forgot password?"
still works: the reset link asks for the 6-digit code before it saves the new
password. If you ever lose both your phone and the key, turn the
requirement off in the SQL editor and remove the factor under
**Authentication → Users → (your user)**:

```sql
UPDATE private.app_settings SET value = 'false' WHERE key = 'admin_mfa_required';
```

An admin account that is blocked has no admin rights, and an admin can't
block their own account from the panel.

Members see only accounts our team has approved, admin accounts included.
If members should see your name on what you post, send your details in
**Get verified** on the site and approve yourself in **Verification** (the
`20261023000000_admin_access.sql` update says in its message how many admin
accounts members don't see).

There are no admin passwords in the code or in environment variables any more.
If `VITE_ADMIN_EMAIL` / `VITE_ADMIN_PASS` are still set in Vercel, delete them.

**The old admin password is public.** The site before Phase 1 built
`VITE_ADMIN_EMAIL` and `VITE_ADMIN_PASS` into its JavaScript, which every
visitor downloads, and the password is also written in the git history
(commits from before 2026-04-24). Phase 1 no longer accepts it, but anyone
may have a copy, so:

1. If that password, or something close to it, was used anywhere else,
   change it there now. Above all: the admin's email account, and the
   admin's NRIClub account (an admin can read and change everything in the
   database). Also check Supabase, GitHub, Vercel and the domain registrar.
2. Turn on two-step verification (MFA) for the admin's email account and for
   the Supabase account (**Account → Security** in the Supabase dashboard),
   and ideally for GitHub and Vercel too.
3. Delete the deployments from before Phase 1 in Vercel (**Deployments**):
   each one still serves the old JavaScript at its own address. That alone
   isn't enough, because the password stays in the git history, which can't
   be taken back if the repository is or ever was public.

## Step 4: Run locally

Requires Node.js 18+.

```
cp .env.example .env      # then fill in the two values
npm install
npm run dev               # http://localhost:3000
```

The values are in Supabase → **Project Settings → API**: the project URL and
the `anon` public key. The anon key is meant to be public; the database's
security policies are what protect the data. Never put the `service_role`
key in the frontend or in a `VITE_` variable.

## Step 5: Deploy to Vercel

1. Import the GitHub repository in Vercel (framework preset **Vite**, build
   command `npm run build`, output directory `dist`).
2. **Settings → Environment Variables**: add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`.
3. Deploy, then set the Supabase Site URL / redirect URLs to the Vercel or
   custom domain (Step 2.6).
4. `vercel.json` sends security headers with every page. Its
   Content-Security-Policy names the Supabase project's address
   (`https://uzzkdmybsbwknpsucuvv.supabase.co` and `wss://...`): for another
   project, change both there, or the site can't reach the database. After
   a deploy that changes `vercel.json`, open the site, sign in and check the
   browser console for "Content Security Policy" errors.

## Legal texts and the Impressum

- **Impressum, operator and controller:** fill in `IMPRINT` in
  `src/content/imprint.js` (your full name, a postal address where letters
  reach you, a phone number) and deploy. The Impressum page and its links
  appear, and the Terms and the Privacy Policy name you as provider and
  controller. Until then they say that NRIClub is run by its founder in
  Germany, and the build only warns. In the same file, `PRIVACY_DETAILS`
  takes, for the Privacy Policy: the data protection authority of your
  federal state, the mailbox provider, which providers have a data
  processing agreement (`agreements`: Vercel's applies only on its Pro and
  Enterprise plans, so set `vercel: true` only once the project is on one;
  `mailbox: true` once you have accepted the mailbox provider's), and how
  long Vercel keeps request logs on your plan.
- **Dates:** `TERMS_DATE` in `src/content/legal/terms.js` and
  `PRIVACY_DATE` in `src/content/legal/privacy.js` say "16 October 2026",
  the day these versions went live (the Terms 2026-10-19; the Privacy Policy
  2026-10-21, compliance round 2). When you change a text, set its date to
  the day the change goes live: if round 2 goes live later than 16 October,
  change `PRIVACY_DATE` to that day in the same deploy.
- **Deleting old data:** the Privacy Policy promises retention periods
  that, for now, you keep by hand once a month
  (`docs/compliance/deletion-routine.md`). Photo files nothing uses any
  more are deleted by the admin panel itself, once a day when an admin
  opens it: open it at least once a week. The periods are in `RETENTION`
  in `privacy.js`; change both together.
- **Who members see:** `VISIBILITY.onlyApprovedListed` in `privacy.js`
  says whether other members see only approved accounts' profiles. It is
  `true` since compliance round 2 (`20261023000000_admin_access.sql` hides
  accounts that are waiting, unfinished, declined or blocked); `false`
  would say that approved members see every profile.
- **Where the texts are:** `src/content/legal/terms.js` and `privacy.js`.
  The build writes them into static pages (nriclub.app/terms and /privacy)
  and the app shows the same text in its dialogs.
- **A new version of the Terms:** copy the current text into a new file in
  `src/content/legal/` (like `terms-2026-10.js`) and add it to
  `TERMS_ARCHIVE`, so it stays at nriclub.app/terms/<version>; change the
  text, `TERMS_VERSION` and `TERMS_DATE` in `terms.js`, `TERMS_VERSION` in
  `src/member/LegalModals.jsx` (the build stops if the two differ) and
  `TERMS_CHANGES` (shown on the "Before you continue" screen); and change
  `private.current_terms_version()` in a new migration. Deploy the site,
  then apply the migration the same day: members are asked to accept the
  new version once the database says it is current. The Terms promise at
  least 2 weeks' notice, in the app and by email, before new Terms apply,
  and (section 14) that a member who doesn't accept them keeps using
  NRIClub under the previous Terms until we end the membership with 4
  weeks' notice. Before the first change that doesn't need a new consent,
  the Terms screen needs a "Later" button and the database must let such
  members take part (today any new version locks members out until they
  accept, which section 14 allows only for a required consent).
- **A change to the Privacy Policy:** change `privacy.js`, its version and
  date, and the matching entry in `docs/compliance/records-of-processing.md`.
  Members don't accept it, but tell them about important changes in the
  app.
- **Compliance records:** `docs/compliance/` (record of processing,
  security measures, breach runbook and register, DPIA check, processor
  agreements, moderation guidelines, the deletion routine, the lawyer's
  advice and open questions).

## Step 6: Testing checklist

With two member accounts and one admin account:

- [ ] Sign up with an address that isn't on your Supabase team → the 6-digit code arrives (custom SMTP works)
- [ ] Sign up → receive the 6-digit code → it fills in and submits by itself → **Get verified** (city + LinkedIn, or "I don't have LinkedIn") → dashboard with the "we're reviewing your profile" banner
- [ ] Admin panel → **Verification**: open the new member, check the LinkedIn link, **Ask for more info** → the member sees the message and updates their details → **Approve** → the member's banner disappears and the Verified badge shows
- [ ] Reject a test member with a reason → they see the "We couldn't verify your membership" screen and can't post or see other members
- [ ] Delete that rejected test account from its screen, then sign up again with the same email address → Get verified says "Our team will check your membership before you can take part" → send the details → the feed stays empty → the admin panel shows them as **Held for review**, with the earlier rejection, its date and any admin note → **Approve** → they can take part
- [ ] Reject a test signup that hasn't sent its details (Verification → **Incomplete**) → open it under Rejected → **Move back to unfinished** → it's back under Incomplete, and the member sees Get verified again
- [ ] A member who joined before Phase 1 signs in → "Before you continue" asks once for 18+ and the Terms → then the dashboard
- [ ] Log out → log back in; a wrong password is rejected
- [ ] **Forgot password?** → the email link opens "Set a new password" for that account → afterwards you log in with the new password
- [ ] Create a post, like it from the other account, comment → counts update, notification arrives
- [ ] Send a Namaste request → accept it from the notification
- [ ] Send messages both ways; set *Receive messages* to *Nobody* and check the other account can't message
- [ ] Block a member → neither of you can message the other
- [ ] Join a community, request a new one → it appears in the admin panel under Communities
- [ ] RSVP to an event, post a marketplace listing, a doc and a help request
- [ ] Report a post (pick a reason, say why, confirm good faith) and file a bug report → both appear in the admin panel; **Dismiss…** the report with a reason → it moves to *Handled* and the reporter is told; **Resolve** the bug report → it moves to *Resolved*
- [ ] Signed out, report something at nriclub.app/report → a reference code; it appears under Reports with that code; send the receipt and the decision from hello@ with the prefilled emails and click **Mark as sent**
- [ ] Admin panel: a non-admin account is refused; approve a member, approve/reject a community, **Remove…** reported content with a rule and the facts → the author gets the message in the app (with how to challenge it), the reporter the outcome
- [ ] **Block…** a member from the admin panel (after a warning 14 days ago, or for a serious reason) → they can no longer post or see other members, and see the reason and how to challenge it when they sign in
- [ ] Admin panel → **Security**: set up two-step login, sign out, sign in again → the 6-digit code is asked
- [ ] Overview → **Photo files** → **Clean up photo files** → it says what it deleted (or that there was nothing)
- [ ] Settings → **Download My Data** → the file has your profile, settings, posts and verification history
- [ ] Delete an account from Settings → the account can no longer log in
- [ ] Test on a phone

## Compliance round 2: what to do, in order

Round 2 (October 2026) adds reporting and moderation under the Digital
Services Act, the photo clean-up and photos without location data, invite
codes, admin two-step login, and hides accounts that aren't approved from
other members.

1. **Before the deploy:** add `admin.nriclub.app` to the Vercel project (with
   the DNS record Vercel asks for) and check that it opens the site. From this
   version on, the admin panel opens only there (`https://nriclub.app/#admin`
   forwards to it). In Supabase → Authentication → URL Configuration, keep
   `https://admin.nriclub.app/**` in the redirect URLs.
2. **Deploy the site** (merge the pull request "Compliance round 2"). It
   works with the database before and after the SQL below.
3. If the round 1 file hasn't run yet, run
   `supabase/oneoff/2026-10-19-compliance-round1/run_in_sql_editor.sql` now
   (it needs the Impressum details first, see "Before inviting the public").
4. **The same day:** run
   `supabase/oneoff/2026-10-21-compliance-round2/run_in_sql_editor.sql` in
   the SQL editor, the whole file at once. It refuses to run before round 1,
   and a second time. Read the messages under the result: "0 of them without
   admin rights" (otherwise unblock that admin as the file says); if it says
   the bucket "photos" couldn't be deleted, delete that empty bucket under
   Storage. If an admin page still says it needs the database update a few
   minutes later, run `NOTIFY pgrst, 'reload schema';`.
5. **Open the admin panel** at https://admin.nriclub.app. The photo clean-up
   runs by itself (Overview → Photo files shows what it deleted). Then check
   the photos uploaded before the update for location data
   (`docs/compliance/deletion-routine.md`, "Once, after the 2026-10-22
   update") and note the result in `docs/compliance/breach-register.md`.
6. **Two-step login:** every admin sets it up under **Security** (Step 3).
   Then turn on **Require two-step login for admin rights**, set
   `SECURITY.adminTwoStep` to `true` in `src/content/legal/privacy.js` and
   deploy.
7. **Moderation:** read "Reports and notices" and "Blocks" in
   `docs/compliance/moderation-guidelines.md` with every admin. Reports
   from nriclub.app/report are answered by email by hand: open the
   prefilled email in the admin panel, send it from hello@nriclub.app, then
   click **Mark as sent**.
8. **Check as members:** an approved member sees only approved members in
   Find, and posts of waiting or blocked accounts show "NRIClub member"; a
   member waiting for review sees Home, Guides and Profile; Settings →
   Account → **Sign out of all devices** works.
9. Ask the lawyer whether the round-2 changes to sections 9 and 10 of the
   Terms (reporting, decisions, blocks, a declined mentor's sessions) need a
   new Terms version (`docs/compliance/questions-for-the-lawyer.md`).

## Before inviting the public

Launch tasks from the Phase 1 review (2026-10-12):

- [ ] Custom email (SMTP) is set up and the email rate limit raised; a signup
      from an address outside your Supabase team gets its code (Steps 2.2
      and 2.3).
- [ ] The old admin password is changed everywhere it was used, and two-step
      verification is on for the admin's email and Supabase accounts (Step 3).
- [ ] The review fixes are on the live database, with their follow-ups
      (`supabase/oneoff/2026-10-13-review-fixes/`).
- [ ] The approval audit is done: every member the reset marked approved has
      been re-checked (`supabase/oneoff/2026-10-12-phase1-live-reset/`,
      "Approval audit").
- [ ] The `phase1_backup` copy is dropped **on or before 2026-11-11**:
      `DROP SCHEMA phase1_backup CASCADE;` in the SQL editor.
- [ ] `hello@nriclub.app` is a real mailbox, with an EU provider that
      signs a data processing agreement, that someone reads every working
      day (the site, the Terms, the Privacy Policy and the Impressum send
      people there, including reports of illegal content and data
      requests, which have deadlines). DNS for nriclub.app: the provider's
      MX records, SPF, DKIM, and DMARC (`p=none` first, then `quarantine`,
      then `reject`); leave the send.nriclub.app records for Resend alone.
      Send a test from an outside address
      (`docs/compliance/processor-agreements.md`).
- [ ] The Impressum details are filled in (`src/content/imprint.js`, see
      "Legal texts and the Impressum") and deployed: /impressum shows, and
      the Terms and the Privacy Policy name the operator.
- [ ] The Terms of Use and the Privacy Policy have had their legal review
      (first review done in October 2026; its advice and the open points
      are in `docs/compliance/questions-for-the-lawyer.md`). If the Terms
      text changes, publish it as a new version ("Legal texts and the
      Impressum").
- [ ] The Impressum details (name and postal address) are filled in
      **before** `20261019000000_access_consent.sql` runs: the lawyer
      advises that an Art. 9 consent given to an unnamed controller is
      hard to defend as informed.
- [ ] The deletion routine runs once a month
      (`docs/compliance/deletion-routine.md`), and an admin opens the admin
      panel at least once a week (its photo clean-up deletes unused photo
      files). After `20261022000000_storage_images.sql`, run Overview →
      Photo files → Clean up photo files once: it also removes the files of
      accounts deleted before October 2026. Then check the photos uploaded
      before that update that are still shown for location data
      (`deletion-routine.md`, "Once, after the 2026-10-22 update").
- [ ] Data processing agreements in place with Supabase, Vercel, Resend and
      the mailbox provider, and `PRIVACY_DETAILS.agreements` in
      `src/content/imprint.js` says so (Vercel's agreement applies only on
      its Pro and Enterprise plans); Supabase's AI options off; Resend
      tracking off; Vercel on a plan that allows business use
      (`docs/compliance/processor-agreements.md`).
- [ ] The breach record for the exposure before 12 October 2026 is
      complete and the notification decision is made with the lawyer
      (`docs/compliance/breach-register.md`).
- [ ] The DPIA decision is made, and a data protection officer appointed
      if it says so (`docs/compliance/dpia-threshold-check.md`).
- [ ] The record of processing activities is filled in, signed and dated
      (`docs/compliance/records-of-processing.md`).
- [ ] Admin rights need two-step login: every admin has set it up, the
      switch under Security is on, and `SECURITY.adminTwoStep` in
      `src/content/legal/privacy.js` is `true` (Step 3).
- [ ] After the deploy: the site works with the security headers (no
      "Content Security Policy" errors in the browser console on the
      homepage, a guide, signup, the member app and the admin panel), and
      https://nriclub.app/.well-known/security.txt opens.

## Testing the database

The security tests run against a local PostgreSQL with a small stand-in for
the Supabase platform:

```
createdb nriclub_test
psql -d nriclub_test -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -1 -d nriclub_test -f "$f" || break
done
python3 supabase/tests/rls_test.py "dbname=nriclub_test"
```

The migrations run in name order, each in one transaction:
`20261012000000_nriclub_schema.sql`, `20261013000000_review_fixes.sql`,
`20261014000000_messages_read_and_hide.sql`,
`20261015000000_places_referrals_travel.sql`,
`20261016000000_city_pages_ambassadors.sql`,
`20261017000000_answers_topics_ambassador_tools.sql`,
`20261018000000_mentoring.sql`, `20261019000000_access_consent.sql`,
`20261020000000_notifications_limits_privacy.sql`,
`20261021000000_moderation_dsa.sql`, `20261022000000_storage_images.sql`,
`20261023000000_admin_access.sql`. The test should end with
"0 failure(s)". To check a one-off file the way the live project gets it,
build a database with the migrations up to the one before it, then run the
file with `psql -v ON_ERROR_STOP=1 -1 -f <file>`: it must succeed once and
refuse a second run, and `pg_dump -s` of the result must equal that of a
database built from all migrations.

Each check runs as a signed-out visitor, a member, a blocked member or an
admin, and confirms what that person can and cannot read or change.

---

## Architecture

```
Browser ──► Vercel (static React app)
   │
   └─HTTPS──► Supabase
               ✦ Auth (email + password, 6-digit email codes)
               ✦ PostgreSQL with row-level security on every table
               ✦ Realtime (chat messages, notifications)
               ✦ Storage (avatars, post and marketplace images)
               ✦ Triggers (profiles on signup, counters, server dates,
                 consent timestamps, photo-link checks)
```

## Troubleshooting

**Every request fails with "permission denied" or returns nothing:** you are
signed out or the session expired; sign in again. Signed-out visitors can't
read anything by design.

**"This account does not have admin access" in the admin panel:** the account
isn't in `public.admins` (Step 3).

**A new member sees "Our team will check your membership before you can
take part" and an empty feed:** their email address or LinkedIn link matched
a member who was rejected or blocked. Admin panel → **Verification** shows
them as **Held for review**, with what they matched and any note on the
earlier decision. Approve them if they're genuine. The hold stays until an
admin decides: sending their details again doesn't end it.

**Every member sees "Before you continue" again:** the database says a new
version of the Terms is current (`private.current_terms_version()`); every
member accepts it once. That's expected after a Terms change. The text the
site shows comes from `src/content/legal/terms.js`; deploy the site with the
new text before (or on the same day as) the migration.

**A page is blank or the browser console shows "Content Security Policy"
errors:** the security headers in `vercel.json` block something. If the
Supabase project changed, put its address in the Content-Security-Policy.
If the homepage script in `vite.config.js` (`HOME_GUARD`) changed, the build
stops and names the new hash to put in `vercel.json`.

**Signup code email not arriving, or "We couldn't create your account":**
without custom SMTP (Step 2.2), Supabase only emails your own team's
addresses, a few an hour. With it, check spam, the email rate limit (Step
2.3) and the email provider's logs.

**Upload fails:** images must be JPEG, PNG, WebP or GIF and at most 5 MB.

**"Please upload the photo here instead of linking to it." when saving a
photo:** the photo's link isn't in this project's Storage. If the project or
its address changed, update `storage_public_url` in `private.app_config`
(Step 1).

**Blank page after deploy:** check the Vercel build log, and that both
`VITE_` variables are set for the Production environment.
