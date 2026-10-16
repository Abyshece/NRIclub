# Technical and organisational measures (Art. 32 GDPR)

*Technische und organisatorische Maßnahmen (TOMs).* What protects NRIClub's
personal data today (16 October 2026), described as it is, with the gaps
that are still open. Update the "Status" column when something changes, and
review the whole document at least once a year.

NRIClub is a static React site (Vercel) talking to Supabase (PostgreSQL with
PostgREST, Auth, Storage and Realtime) in the AWS region eu-west-1 (Ireland).
There is no server of our own.

## 1. Confidentiality (Art. 32(1)(b))

| Measure | How | Status |
|---|---|---|
| Physical access to servers | Only the providers' data centres (AWS via Supabase, Vercel). Their certifications (e.g. SOC 2 reports) are available from them on request | In place (provider) |
| Sign-in | Supabase Auth: email and password (minimum 8 characters, stored as bcrypt hashes), email confirmation with a 6-digit code, password reset by email link | In place |
| Sessions | Short-lived access tokens with refresh tokens; sign-out revokes the refresh token on the server; a session that ends in one tab ends in all tabs | In place. Tokens are kept in the browser's localStorage, so the Content-Security-Policy (below) matters |
| Who can read what | Row-level security on every table. Signed-out visitors can read no table (only the public city counts and guides). Members waiting for review see no other members. Approved members see what the Privacy Policy, section 4, lists. Messages only for their two participants. Admin-only data in `profile_private`, `verification_log`, `reports`; internal data in the `private` schema, which the API doesn't expose | In place (migrations up to `20261019000000_access_consent.sql`) |
| Server functions | `SECURITY DEFINER` functions run with `search_path = ''`, check the caller themselves, and have explicit grants (`REVOKE ALL ... FROM PUBLIC`) | In place |
| Protected columns | Triggers (`private.protect_columns`) stop members from setting server-owned fields (verification status, Terms and consent dates, badges, counters) | In place |
| Admin access | Admins sign in with their normal account; the database checks `public.admins`. Only one admin today | In place. **Open:** a second factor (TOTP) for admins enforced in the database, and admins only on admin.nriclub.app |
| Photos | The browser re-encodes every photo as a JPEG before upload (removes EXIF data such as GPS position) and names it `<member id>/<random UUID>.jpg`. Buckets accept only JPEG, PNG and WebP, up to 2 MB (profile photos) or 4 MB; uploads only into the member's own folder. Buckets are public: a photo opens for anyone with its exact URL. The site deletes a member's files with their post, listing, event, replaced or removed profile photo and account; files nothing uses any more are deleted by the photo clean-up in the admin panel (daily when an admin opens it), and the database lets an admin delete only files nothing uses (`deletion-routine.md`). Invite links carry a random code, not the member ID (the name of their photo folder) | In place (`20261022000000_storage_images.sql`). **Open:** private buckets with signed URLs |
| Retention | The periods in the Privacy Policy are kept by hand once a month until clean-up jobs exist (`deletion-routine.md`) | **Open:** scheduled clean-up jobs |
| Pseudonymisation | The record of declined and blocked accounts keeps only a keyed SHA-256 hash of the email address (secret key `moderation_salt`, never in the code) | In place |
| Encryption in transit | HTTPS everywhere; HSTS with subdomains (vercel.json) | In place |
| Encryption at rest | Provided by Supabase/AWS for the database, Storage and backups | In place (provider) |
| Browser protections | Content-Security-Policy allowing only the site's own scripts, Supabase connections and images; no framing; nosniff; strict referrer; camera, microphone, location, payment and USB off (vercel.json) | In place from the deploy after 16 October 2026 |
| No third parties in the browser | No cookies, no analytics, no ads, self-hosted fonts; external sites only on click | In place |
| Secrets | Only the public anon key is in the site; the service-role key is never in the code or in `VITE_` variables | In place. Note: an old admin password is in the public git history (see `breach-register.md`); it must be treated as known |

## 2. Integrity (Art. 32(1)(b))

| Measure | How | Status |
|---|---|---|
| Input limits | Length and format checks in the database (CHECK constraints), photo links must point into the member's own Storage folder (`check_image_url`), links limited to http(s) | In place |
| Change history | Verification decisions with actor and time (`verification_log`); Terms and consent acceptances (`terms_acceptances`) | In place. **Open:** a log of every moderation action (who removed or blocked what, why) |
| Rate limits | In the site for logins and some actions (`src/rateLimiter.js`); one urgent question a day and booking limits in the database | Partly. **Open:** server-side limits on messages, Namaste requests, posts and reports |

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
| People with access | Only the founder has admin access, Supabase, Vercel, Resend and GitHub accounts | In place |
| New admins | Before adding anyone to `public.admins`: a signed confidentiality and instruction note (Art. 29, 32(4)), a second factor on their accounts, removal when they leave | Rule (see `moderation-guidelines.md`) |
| Two-factor sign-in on provider accounts | Gmail, Supabase, GitHub, Vercel, Resend, the domain registrar | **To do / check** |
| Processors | Data processing agreements with every processor | **To do** (`processor-agreements.md`) |
| Breaches | Runbook and register | `breach-runbook.md`, `breach-register.md` |
| Data-subject requests | Request log with the date received and the one-month deadline; answers from hello@ | **To do:** set up the log when the mailbox works |
| Production data and AI tools | Read production data only where needed, and with AI tools only under commercial terms with a data processing agreement | Rule |
| Privacy by default | New features: members-only by default; anything public, any new provider, cookie or analytics needs a Privacy Policy update first | Rule |
