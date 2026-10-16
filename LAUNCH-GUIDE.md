# NRIClub Launch Guide

## What's in the repo

| Path | What it is |
|------|-----------|
| `supabase/migrations/20261012000000_nriclub_schema.sql` | The whole database: tables, security policies, triggers, storage buckets, realtime |
| `supabase/migrations/20261013000000_review_fixes.sql` | Fixes from the Phase 1 review and from the review of those fixes, applied after the schema above |
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
same with `supabase/migrations/20261013000000_review_fixes.sql`, then with
`supabase/seed.sql`. (With the Supabase CLI, `supabase db push` applies the
two migrations; run the seed as above.) The seed is only for a new project.

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
the migration goes on before the pull request that needs it is merged.

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

The admin panel is at `https://admin.nriclub.app` (any `admin.` host) or
`<your site>/#admin`.

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
  the day this version went live. When you change a text, set its date to
  the day the change goes live.
- **Deleting old data:** the Privacy Policy promises retention periods
  that, for now, you keep by hand once a month
  (`docs/compliance/deletion-routine.md`). Photo files nothing uses any
  more are deleted by the admin panel itself, once a day when an admin
  opens it: open it at least once a week. The periods are in `RETENTION`
  in `privacy.js`; change both together.
- **Who members see:** `VISIBILITY.onlyApprovedListed` in `privacy.js`
  says whether other members see only approved accounts' profiles. It is
  `false` while approved members can still see the profile of an account
  that is waiting, unfinished, declined or blocked; set it to `true` in the
  same pull request as the database change that hides those.
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
- [ ] Report a post and file a bug report → both appear in the admin panel; **Dismiss** the report → it moves to *Handled*; **Resolve** the bug report → it moves to *Resolved*
- [ ] Admin panel: a non-admin account is refused; approve a member, approve/reject a community, remove reported content
- [ ] Block a member from the admin panel → they can no longer post or see other members
- [ ] Settings → **Download My Data** → the file has your profile, settings, posts and verification history
- [ ] Delete an account from Settings → the account can no longer log in
- [ ] Test on a phone

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
psql -d nriclub_test -f supabase/migrations/20261012000000_nriclub_schema.sql
psql -d nriclub_test -f supabase/migrations/20261013000000_review_fixes.sql
python3 supabase/tests/rls_test.py "dbname=nriclub_test"
```

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
