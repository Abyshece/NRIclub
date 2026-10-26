# Technical and organisational measures (Art. 32 GDPR)

*Technische und organisatorische Maßnahmen (TOMs).* What protects NRIClub's
personal data today (16 October 2026, updated 26 October 2026), described
as it is, with the gaps that are still open. Update the "Status" column when something changes, and
review the whole document at least once a year.

NRIClub is a static React site (Vercel) talking to Supabase (PostgreSQL with
PostgREST, Auth, Storage and Realtime) in the AWS region eu-west-1 (Ireland).
There is no server of our own.

## 1. Confidentiality (Art. 32(1)(b))

| Measure | How | Status |
|---|---|---|
| Physical access to servers | Only the providers' data centres (AWS via Supabase, Vercel). Their certifications (e.g. SOC 2 reports) are available from them on request | In place (provider) |
| Sign-in | Supabase Auth: email and password (minimum 8 characters, stored as bcrypt hashes), email confirmation with a 6-digit code, password reset by email link | In place |
| Sessions | Short-lived access tokens with refresh tokens; sign-out revokes the refresh token on the server; a session that ends in one tab ends in all tabs; Settings → Account → "Sign out of all devices" ends every session of the account (an access token another device already holds keeps working until it expires, within the hour; a reload there signs out at once) | In place. Tokens are kept in the browser's localStorage, so the Content-Security-Policy (below) matters |
| Who can read what | Row-level security on every table. Signed-out visitors can read no table (only the public city counts and guides). Members waiting for review see no other members. Approved members see what the Privacy Policy, section 4, lists, and only the profiles of approved, active members (`private.is_listed_member`): accounts waiting for review, unfinished, declined or blocked aren't shown, and what they posted shows without their name. Messages only for their two participants. Admin-only data in `profile_private`, `verification_log`, `reports`; internal data in the `private` schema, which the API doesn't expose | In place (migrations up to `20261023000000_admin_access.sql`) |
| Server functions | `SECURITY DEFINER` functions run with `search_path = ''`, check the caller themselves, and have explicit grants (`REVOKE ALL ... FROM PUBLIC`) | In place |
| Protected columns | Triggers (`private.protect_columns`) stop members from setting server-owned fields (verification status, Terms and consent dates, badges, counters) | In place |
| Admin access | Admins sign in with their normal account on admin.nriclub.app only (the main site sends `#admin` there), so the admin session never shares browser storage with the pages that show members' posts. The database gives admin rights (`private.is_admin`) only to accounts in `public.admins` that aren't blocked, and, once "Require two-step login for admin rights" is on (admin panel → Security; `private.app_settings`), only to sessions signed in with a 6-digit code from an authenticator app (Supabase Auth TOTP, `aal2`). The switch changes only from such a session. While it is on, an admin who hasn't set up two-step login yet is asked to set it up at the login, with the password alone (so nobody is locked out): every admin sets it up before the switch goes on. A password reset for an account with two-step login asks for the code too. An admin can't block their own account. Only one admin today. **The "Admin panel" button** on the members' site (Edge Function `admin-handoff`) opens admin.nriclub.app already signed in: only for an account in `public.admins` that isn't blocked (the database checks, as the caller), with a one-time sign-in code that is never emailed, passed after the `#` (never reaches a server or log), removed from the address bar at once and traded for the admin site's own session; it works once and expires. The two sites keep separate sessions, and with two-step login required the admin site still asks for the 6-digit code | In place (`20261023000000_admin_access.sql`). **Open:** the founder sets up two-step login and turns the switch on (`LAUNCH-GUIDE` / rollout notes); then set `SECURITY.adminTwoStep` in `src/content/legal/privacy.js` to `true`. If every admin loses their app and key: `UPDATE private.app_settings SET value = 'false' WHERE key = 'admin_mfa_required';` in the Supabase SQL editor, and remove the factor under Authentication → Users |
| Photos | The browser re-encodes every photo as a JPEG before upload (removes EXIF data such as GPS position) and names it `<member id>/<random UUID>.jpg`. Buckets accept only JPEG, PNG and WebP, up to 2 MB (profile photos) or 4 MB; uploads only into the member's own folder. Buckets are public: a photo opens for anyone with its exact URL. The site deletes a member's files with their post, listing, event, replaced or removed profile photo and account; files nothing uses any more are deleted by the photo clean-up in the admin panel (daily when an admin opens it), and the database lets an admin delete only files nothing uses (`deletion-routine.md`). Invite links carry a random code, not the member ID (the name of their photo folder) | In place (`20261022000000_storage_images.sql`). **Open:** private buckets with signed URLs |
| Retention | Photo files nothing uses: the admin panel's daily clean-up (within 7 days). The rest: nightly pg_cron jobs `nriclub-daily-cleanup`, `nriclub-profile-reminders-cleanup`, `nriclub-analytics-cleanup`, `nriclub-housing-cleanup` and, since the 2026-11-02 update, `nriclub-retention-cleanup` (urgent-question log 2 days, every notice 12 months). By hand once a month: accounts whose membership we ended, and copies of emails kept longer than the Inbox (`deletion-routine.md`) | In place. The first four jobs confirmed scheduled on live (26 October 2026), so `RETENTION.byHand` is false. **Check:** the fifth after the 2026-11-02 update (`cron.job`) |
| Pseudonymisation | The record of declined and blocked accounts keeps only a keyed SHA-256 hash of the email address (secret key `moderation_salt`, never in the code) | In place |
| Encryption in transit | HTTPS everywhere; HSTS with subdomains (vercel.json) | In place |
| Encryption at rest | Provided by Supabase/AWS for the database, Storage and backups | In place (provider) |
| Browser protections | Content-Security-Policy allowing only the site's own scripts, Supabase connections and images; no framing; nosniff; strict referrer; camera, microphone, location, payment and USB off (vercel.json) | In place from the deploy after 16 October 2026 |
| No third parties in the browser | No cookies, no ads, no other companies' trackers, self-hosted fonts; external sites only on click. Our own website analytics only after consent on the privacy banner, no IP address stored (since the 2026-11-02 update; before it, shortened), single visits shown to admins to the hour, not linked to accounts, kept 6 months (records of processing No. 18) | In place |
| Secrets | Only the public anon key is in the site; the service-role key is never in the code or in `VITE_` variables | In place. Note: an old admin password is in the public git history (see `breach-register.md`); it must be treated as known |

## 2. Integrity (Art. 32(1)(b))

| Measure | How | Status |
|---|---|---|
| Input limits | Length and format checks in the database (CHECK constraints), photo links must point into the member's own Storage folder (`check_image_url`), links limited to http(s) | In place |
| Change history | Verification decisions with actor and time (`verification_log`); Terms and consent acceptances (`terms_acceptances`); every moderation decision (who removed, warned, blocked or unblocked what, on which rule, why, whether a report led to it, the statement sent) in `private.moderation_action`, written only by the admin functions | In place (`20261021000000_moderation_dsa.sql`) |
| Rate limits | In the database for every member (`private.rate_limit`): messages (30 a minute, 500 a day), new conversations (20 a day), Namaste requests (50 a day), comments and answers (60 an hour), posts, events, listings, guides and questions (20 a day each), groups (5 a day), places (20 a day), reports (20 a day); one urgent question a day and booking limits; the public report form 5 a day per email address, 10 per internet address and 100 in all (`submit_notice`); invite code lookups 30 a day. In the site for logins (`src/rateLimiter.js`) | In place (`20261020000000_notifications_limits_privacy.sql`, `20261021000000_moderation_dsa.sql`, `20261022000000_storage_images.sql`) |

## 3. Availability and resilience (Art. 32(1)(b), (c))

| Measure | How | Status |
|---|---|---|
| Backups | Supabase daily backups, kept 7 days (Pro plan) | In place. **To do:** test a restore once (into a new project) and note the date here |
| Hosting | Vercel's CDN serves the static site from many locations | In place |
| Monitoring | Supabase and Vercel dashboards; the admin panel's feedback list for bug reports | Basic |

## 4. Testing and evaluation (Art. 32(1)(d))

| Measure | How | Status |
|---|---|---|
| Database security tests | `supabase/tests/rls_test.py` checks, for signed-out visitors, members waiting for review, approved members, blocked members and admins, what they can and can't read and change. Run after every migration | In place |
| Reviews | Changes go through pull requests with review; compliance and security audits (October 2026) | In place |
| Dependencies | `npm audit` before releases; production dependencies had no known vulnerabilities in October 2026 | In place |
| Header check | After each deploy that touches vercel.json, open the site and check the browser console for CSP errors | To do on each such deploy |

## 5. Organisation

| Measure | How | Status |
|---|---|---|
| People with access | Only the owner has admin access, Supabase, Vercel, Resend and GitHub accounts | In place |
| New admins | Before adding anyone to `public.admins`: a signed confidentiality and instruction note (Art. 29, 32(4)), a second factor on their accounts, removal when they leave | Rule (see `moderation-guidelines.md`) |
| Two-factor sign-in on provider accounts | Supabase, GitHub, Vercel, Resend, the domain registrar, the owner's own email account | **To do / check** |
| Processors | Data processing agreements with every processor: Supabase, Vercel (Pro), Resend; no mailbox provider, nothing forwarded to Gmail since 26 October 2026 | In place (`processor-agreements.md`; file the copies) |
| Breaches | Runbook and register | `breach-runbook.md`, `breach-register.md` |
| Data-subject requests | Request log with the date received and the one-month deadline; requests arrive in the admin Inbox and are answered from there | **To do:** set up the log (`moderation-guidelines.md`) |
| Production data and AI tools | Read production data only where needed, and with AI tools only under commercial terms with a data processing agreement | Rule |
| Privacy by default | New features: members-only by default; anything public, any new provider, cookie or analytics needs a Privacy Policy update first | Rule |
