# Breach register (Art. 33(5) GDPR)

Every personal data breach goes here, whether or not it was notified: the
facts, the effects and what was done (Art. 33(5)). How to handle a breach:
`breach-runbook.md`. Keep this file up to date and keep it as long as
NRIClub runs.

---

## No. 1: Open admin functions and database rules, and a published admin password, before 12 October 2026

**Status:** recorded 16 October 2026 (prefilled from the repository and the
October 2026 audit). **Decision on notification: open, for the founder with
the lawyer** (see below).

### Facts

| | |
|---|---|
| Period | From the first deployment of the site on this Supabase project (the repository starts on 12 April 2026; the oldest live sign-in session dates from 19 April 2026) until the Phase 1 reset on **12 October 2026**. **[fill in: date of the first public deployment, from Vercel]** |
| When we became aware | Items (1) to (3): **12 October 2026**, when the Phase 1 review documented them (`supabase/oneoff/2026-10-12-phase1-live-reset/README.md`, "Why"). Item (4), the published admin password: **24 April 2026**, the lawyer's advice, because commit bef7d91 on that day took the password out of the source code, which suggests the founder knew then that it was in the public repository. **[confirm, or correct with the reason]** |
| What was wrong | (1) Database functions `admin_get_profiles` (read every profile), `admin_delete_content` (delete any row in any table) and `admin_update_user` could be called by anyone with the public anon key, which is in the site's JavaScript. (2) Database policies let signed-out visitors delete posts, groups, events and Marketplace listings, and read all reports. (3) Storage had public read and list policies, so the files in the buckets could be listed and downloaded. (4) The site built the admin email and password (`VITE_ADMIN_EMAIL`, `VITE_ADMIN_PASS`) into the JavaScript every visitor downloaded, and the password is in the public git history (commits before 24 April 2026). Old Vercel deployments may still serve that JavaScript |
| Kind of breach | Confidentiality (profiles, reports and files readable by unauthorised people); integrity and availability (content could be deleted or changed by anyone) |
| Data concerned | Every member profile as stored then **[fill in the fields the old `profiles` table held: name, email address?, location, hometown, profession, LinkedIn link, photo …]**; report texts; uploaded photos. Membership itself can indicate Indian origin (Art. 9 relevance). Members' passwords were not exposed (they are in Supabase Auth, which these functions didn't read) **[confirm]** |
| People concerned | Members and people who had signed up at the time. **[fill in: number. The `phase1_backup` copy has been dropped; estimate from the accounts in `auth.users` on 12 October plus accounts deleted before. On 15 October live had 4 member profiles and Storage held files in 4 folders of accounts that no longer exist]** |
| Evidence of access | None known. Supabase keeps API logs for about 7 days, so the period can't be checked. **[fill in anything else known, e.g. content that disappeared]** |
| Likely consequences | Members' profile data and membership known to unknown people; risk of phishing and of misuse of the admin account while its password was public; content could have been deleted or changed |

### What was done

| Date | Measure |
|---|---|
| 24 April 2026 | Hard-coded admin password removed from the source code (commit bef7d91); it stays in the git history. The commit moved it into build settings (`VITE_ADMIN_EMAIL`, `VITE_ADMIN_PASS`), which still put it into the site's JavaScript until 12 October 2026 |
| 12 October 2026 | Phase 1 reset: new schema with row-level security on every table, the open admin functions removed, admin rights only through `public.admins` checked by the database, signed-out visitors can read no table, old storage policies dropped |
| 13 October 2026 | Review fixes applied (`supabase/oneoff/2026-10-13-review-fixes/`) |
| **[fill in]** | Admin password changed everywhere it or a variant was used; two-step verification on the admin's email, Supabase, GitHub, Vercel accounts |
| **[fill in]** | Vercel deployments from before 12 October 2026 deleted, or Deployment Protection switched on for them |
| **[fill in]** | Repository made private, or the admin email removed from `supabase/oneoff/2026-10-12-phase1-live-reset/README.md` and `3_restore_and_admin.sql` (the history stays public) |
| **[fill in]** | `phase1_backup` schema dropped (due by 11 November 2026) |

### Decision on notification

*To be decided by the founder with the lawyer, and the reasons written here.*

- **Supervisory authority (Art. 33(1)):** notification is required unless
  the breach is unlikely to result in a risk to people's rights and
  freedoms. Points to weigh: the exposure lasted about six months and only
  needed the public key; profile data can indicate origin; on the other
  hand there were few members, there is no sign of access, and no member
  passwords were exposed. The 72 hours have passed (awareness on 24 April
  for the password, 12 October for the rest), so a notification now must
  explain the delay (Art. 33(1)).
- **The lawyer's advice (October 2026):** notify the state data protection
  authority now, late, with the reasons for the delay: with the admin
  credentials public for months, admin functions callable with the public
  key and Art. 9-relevant membership, "unlikely to result in a risk" can't
  be argued. Telling the members of that time (Art. 34) is likely required
  too, by email once hello@ works. First, today: confirm the old admin
  password is changed everywhere and that Vercel deployments from before 12
  October are deleted or protected; otherwise the breach is still ongoing.
- **Members (Art. 34):** only if the risk is high. If yes, tell the members
  of that time once hello@nriclub.app works (template in
  `breach-runbook.md`).

| | |
|---|---|
| Authority notified? | **[yes / no]**, date, reference number, reasons |
| Members told? | **[yes / no]**, date, how, reasons |
| Decided by, date | **[fill in]** |

### Related observations from the October 2026 audit (assess separately)

- Photos of accounts deleted before October 2026 were still downloadable
  from public Storage URLs (19 of 33 files on 15 October), and two post
  images still carried GPS coordinates in their EXIF data. This is an
  erasure and minimisation gap rather than a breach, but decide whether
  any of it should be recorded here.
- Until migration `20261019000000_access_consent.sql`, members waiting for
  review could read every profile. That was the intended design at the
  time, not unauthorised access, but it is why the change was made.
