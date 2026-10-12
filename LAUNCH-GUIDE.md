# NRIClub Launch Guide

## What's in the repo

| Path | What it is |
|------|-----------|
| `supabase/migrations/20261012000000_nriclub_schema.sql` | The whole database: tables, security policies, triggers, storage buckets, realtime |
| `supabase/seed.sql` | Starter data: city communities and example events |
| `supabase/tests/` | Automated security tests for the database (see "Testing the database") |
| `supabase/oneoff/` | One-time scripts for the existing project (already applied ones are documented there) |
| `src/supabaseApi.js` | API layer: auth, posts, messages, groups, events, marketplace, admin, etc. |
| `src/App.jsx` | The frontend |
| `.env.example` | The environment variables the app needs |

---

## Step 1: Database

**New Supabase project:** open **SQL Editor → New query**, paste the whole of
`supabase/migrations/20261012000000_nriclub_schema.sql`, run it, then do the
same with `supabase/seed.sql`. (With the Supabase CLI: `supabase db push`.)

**The existing NRI+ project** (`uzzkdmybsbwknpsucuvv`) is moved to this schema
with the one-off script in `supabase/oneoff/2026-10-12-phase1-live-reset/`;
see the README there.

## Step 2: Authentication settings

In the Supabase dashboard → **Authentication**:

1. **Sign In / Providers → Email**: email provider ON, *Confirm email* ON,
   *Secure email change* ON, minimum password length **8**.
2. **Email templates**: the signup flow asks for a 6-digit code, so the
   *Confirm signup* and *Magic Link* templates must include `{{ .Token }}`.
3. **Attack protection**: turn on *Leaked password protection*.
4. **URL configuration**: Site URL = your live URL (e.g. `https://nriclub.app`),
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
   custom domain (Step 2.4).

## Step 6: Testing checklist

With two member accounts and one admin account:

- [ ] Sign up → receive the 6-digit code → verify → land on the dashboard with your details filled in
- [ ] Log out → log back in; a wrong password is rejected
- [ ] Create a post, like it from the other account, comment → counts update, notification arrives
- [ ] Send a Namaste request → accept it from the notification
- [ ] Send messages both ways; set *Receive messages* to *Nobody* and check the other account can't message
- [ ] Block a member → neither of you can message the other
- [ ] Join a community, request a new one → it appears in the admin panel under Communities
- [ ] RSVP to an event, post a marketplace listing, a doc and a help request
- [ ] Report a post and file a bug report → both appear in the admin panel
- [ ] Admin panel: a non-admin account is refused; approve a member, approve/reject a community, remove reported content
- [ ] Block a member from the admin panel → they can no longer post
- [ ] Delete an account from Settings → the account can no longer log in
- [ ] Test on a phone

## Testing the database

The security tests run against a local PostgreSQL with a small stand-in for
the Supabase platform:

```
createdb nriclub_test
psql -d nriclub_test -f supabase/tests/supabase_stub.sql
psql -d nriclub_test -f supabase/migrations/20261012000000_nriclub_schema.sql
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
               ✦ Triggers (profiles on signup, counters, consent timestamps)
```

## Troubleshooting

**Every request fails with "permission denied" or returns nothing:** you are
signed out or the session expired; sign in again. Signed-out visitors can't
read anything by design.

**"This account does not have admin access" in the admin panel:** the account
isn't in `public.admins` (Step 3).

**Signup code email not arriving:** check spam. For production, set up custom
SMTP in Supabase → **Authentication → SMTP Settings**; the built-in sender is
heavily rate-limited.

**Upload fails:** images must be JPEG, PNG, WebP or GIF and at most 5 MB.

**Blank page after deploy:** check the Vercel build log, and that both
`VITE_` variables are set for the Production environment.
