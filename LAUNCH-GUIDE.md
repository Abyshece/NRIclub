# NRIClub Launch Guide

## What's in the repo

| Path | What it is |
|------|-----------|
| `supabase/migrations/20261012000000_nriclub_schema.sql` | The whole database: tables, security policies, triggers, storage buckets, realtime |
| `supabase/migrations/20261013000000_review_fixes.sql` | Fixes from the Phase 1 review, applied after the schema above |
| `supabase/seed.sql` | Starter data for a new project: the city communities, with no members (no example events) |
| `supabase/tests/` | Automated security tests for the database (see "Testing the database") |
| `supabase/oneoff/` | One-time scripts for the existing project (already applied ones are documented there) |
| `src/supabaseApi.js` | API layer: auth, posts, messages, groups, events, marketplace, admin, etc. |
| `src/App.jsx` | The frontend |
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
   - Choose an email provider (for example Resend, Postmark, Brevo or Amazon
     SES), verify the `nriclub.app` domain with it (it gives you DNS records
     to add where the domain is registered), and enter its SMTP host, port,
     user name and password here.
   - Sender address e.g. `no-reply@nriclub.app`, sender name `NRIClub`.
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

## Step 6: Testing checklist

With two member accounts and one admin account:

- [ ] Sign up with an address that isn't on your Supabase team → the 6-digit code arrives (custom SMTP works)
- [ ] Sign up → receive the 6-digit code → it fills in and submits by itself → **Get verified** (city + LinkedIn, or "I don't have LinkedIn") → dashboard with the "we're reviewing your profile" banner
- [ ] Admin panel → **Verification**: open the new member, check the LinkedIn link, **Ask for more info** → the member sees the message and updates their details → **Approve** → the member's banner disappears and the Verified badge shows
- [ ] Reject a test member with a reason → they see the "We couldn't verify your membership" screen and can't post or see other members
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
- [ ] `support@nriclub.app` and `privacy@nriclub.app` are real mailboxes that
      someone reads (the site, the Terms and the Privacy Policy send people
      there).
- [ ] The Terms of Use and Privacy Policy have had their legal review
      (`docs/BACKLOG.md`, Phase 5).

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
