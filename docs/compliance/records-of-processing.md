# Records of processing activities (Art. 30 GDPR)

*Verzeichnis von Verarbeitungstätigkeiten.* Prefilled on 16 October 2026 from
the code, the database migrations and the October 2026 compliance audit.
Fill in the fields marked **[fill in]**, check every entry once, and update
it whenever a feature, a provider or a retention period changes (the same
pull request that changes the Privacy Policy, `src/content/legal/privacy.js`).

The exemption in Art. 30(5) does not apply: NRIClub processes personal data
regularly, not occasionally, and the data can reveal ethnic origin, religion
and health (Art. 9).

Keep this file, signed and dated, where you can show it to a supervisory
authority on request (Art. 30(4)). A copy in the repository is fine as long
as it holds no secrets.

## Controller

| | |
|---|---|
| Controller (Verantwortlicher) | **[fill in: full name]**, as a private person (later: the company, e.g. NRIClub UG (haftungsbeschränkt)) |
| Address | **[fill in: street, postcode, city, Germany]** |
| Contact | hello@nriclub.app, **[fill in: phone]** |
| Representative in the EU (Art. 27) | Not needed: the controller is established in Germany |
| Data protection officer | None appointed. Depends on the DPIA decision (see `dpia-threshold-check.md`; § 38(1) sentence 2 BDSG) |
| Version of this record | 1, 16 October 2026 (prefilled), **[fill in: date checked and signed]** |

## Recipients that apply to most activities

- **Approved members** (verification_status `approved`, active, 18+, current
  Terms and Art. 9 consent): see other members' content and the profiles of
  approved, active members only (`private.is_listed_member`, migration
  `20261023000000_admin_access.sql`). Waiting, unfinished, declined and
  blocked accounts aren't shown to other members; what they posted before
  stays, shown as "NRIClub member" without name or photo, and their name is
  taken off events they organised. Members waiting for review see only the
  list of groups and the guides (migration
  `20261019000000_access_consent.sql`).
- **Admins** (rows in `public.admins` whose account isn't blocked; once
  "Require two-step login for admin rights" is on, only in sessions signed in
  with the 6-digit code): see everything members see plus the profiles of
  accounts members don't see, email addresses, verification details, notes,
  reports and our decisions. Not private messages, except a single message a
  member reported (shown only with that report). Admins change members'
  content and accounts only through database functions that record what they
  did (`private.moderation_action`; membership decisions in
  `verification_log`).
- **Processors** (Art. 28): Supabase Pte. Ltd., Singapore (database, Auth,
  Storage, Realtime; AWS eu-west-1, Ireland), Vercel Inc., USA (hosting and
  CDN, worldwide edge network), Plus Five Five, Inc. (Resend), USA
  (transactional email via Amazon SES eu-west-1), the hello@nriclub.app
  mailbox provider **[fill in]**. See `processor-agreements.md`.
- **Lawyers and courts** where we need to establish, exercise or defend
  legal claims (Art. 6(1)(f)).
- **Authorities** only where a law obliges (court orders; Art. 18 DSA reports
  of threats to life or safety to the police).

## Third-country transfers (Art. 44 ff.)

Supabase is in Singapore, Vercel and Resend are US companies; Vercel
serves requests from edge locations outside the EU, including the USA. The
safeguard is the standard contractual clauses in each provider's DPA
(Art. 46(2)(c)); the Privacy Policy names it per provider once
`PRIVACY_DETAILS.agreements` says the DPA is in place.

| Provider | DPA | Safeguard used | Checked on |
|---|---|---|---|
| Supabase Pte. Ltd. (Singapore) | Part of the terms of service | SCCs in the DPA (no DPF reliance) | 16 October 2026 (website); **[fill in: signed copy filed]** |
| Vercel Inc. (USA) | Only on Pro and Enterprise plans | SCCs in the DPA | **[fill in: plan, DPA filed]** |
| Plus Five Five, Inc. (Resend, USA) | Part of the terms | SCCs in the DPA; Resend states DPF compliance | 16 October 2026 (website) |
| Mailbox provider | **[fill in]** | **[fill in]** | **[fill in]** |

## Activities

Retention periods marked *(by hand)* are kept with
`deletion-routine.md` until scheduled clean-up jobs exist (then mark them
*(job)*). Everything else is deleted when the member deletes their account
(`delete_my_account()` deletes the `auth.users` row; every table that
references the member cascades, except where noted).

### 1. Member accounts and sign-in

| | |
|---|---|
| Purpose | Create and run memberships; sign-in with email and password or a 6-digit code; password reset |
| Legal basis | Art. 6(1)(b) (contract); for the session security aspect Art. 6(1)(f) (keeping accounts secure) |
| Data subjects | Members and people who started signing up |
| Data | Email address, bcrypt password hash, name, sign-up/confirmation/last sign-in times, signup metadata (`auth.users.raw_user_meta_data`); sessions with IP address and user agent (`auth.sessions`), refresh tokens |
| Systems | Supabase Auth (`auth.users`, `auth.sessions`, `auth.refresh_tokens`); `public.profiles`, `public.profile_private` |
| Recipients | Admins (email address); Supabase |
| Retention | Until account deletion. Sign-ups never confirmed: 30 days *(by hand)*. Sessions until sign-out on that device or account deletion (no time-box set yet: see Supabase Auth → Sessions) |

### 2. Membership check (verification)

| | |
|---|---|
| Purpose | Check that each member is a real person with a genuine connection to the Indian community; ask for more information; approve or decline; hold sign-ups that match a declined or blocked account |
| Legal basis | Art. 6(1)(b) (the check is part of the membership under the Terms); Art. 6(1)(f) (a safe community of genuine people) |
| Data subjects | Applicants and members |
| Data | City, country, location, LinkedIn profile link or a note, voucher (member who vouches, or the inviter from an invite link), decision, message to the member, admin notes, dates (`profile_private`, `verification_log`, `private.review_hold`, `private.reviewed_link`). Each member's random invite code (`public.invites`, deleted with the account): an invite link carries the code, and at signup the code is looked up to fill in the inviter (`public.resolve_invite`, for signed-in accounts, 30 lookups a day), so the new member sees the inviter's first name and member ID. Admins also look at the LinkedIn profile itself (data from another source, Art. 14) |
| Recipients | Admins; the member sees decisions and messages, not admin notes |
| Retention | Until account deletion. Accounts that never sent their details: 90 days *(by hand)*. Declined accounts, and accounts whose membership we ended: 6 months after the decision *(by hand)* |

### 3. Record of declined and blocked accounts

| | |
|---|---|
| Purpose | Stop people who were declined or blocked from simply signing up again |
| Legal basis | Art. 6(1)(f) (protecting members from people removed before) |
| Data | Keyed SHA-256 hash of the email address (secret `moderation_salt`), LinkedIn profile slug, decision, date, admin note (`private.moderation_record`) |
| Recipients | Admins (shown when a sign-up matches) |
| Retention | Kept after account deletion with the account link removed. Deleted 24 months after the decision, the admin note cleared after 12 months *(by hand)* (periods proposed by the lawyer) |
| Note | Automatic step: a match holds the sign-up until a person decides. No decision is made by the system alone (Art. 22 does not apply) |

### 4. Member profiles and directory

| | |
|---|---|
| Purpose | Let members find, recognise and contact each other |
| Legal basis | Art. 6(1)(b); Art. 9(2)(a) explicit consent for information that can reveal ethnic origin, religion or health |
| Data | Name, photo, city, country, location, hometown, profession, occupation, years abroad, bio, "ask me about", LinkedIn link, mentoring fields, Verified badge, ambassador city, last active time |
| Recipients | Approved members; admins; Supabase (photos in Storage are reachable by anyone who has the exact URL while the buckets are public; new photos have random file names) |
| Retention | Until changed or account deletion. A replaced or removed profile photo's file is deleted at once by the site; files nothing uses any more: within 7 days at most (photo clean-up in the admin panel, daily when an admin opens it; `deletion-routine.md`) |

### 5. Community content and features

| | |
|---|---|
| Purpose | Provide groups, posts, comments, likes, guides (docs) and comments, questions and answers (incl. urgent questions to up to 500 city members), events and RSVPs, Market listings, travel board posts, places and recommendations, Namaste connections, mentoring slots, bookings and reviews, blocks, settings |
| Legal basis | Art. 6(1)(b); Art. 9(2)(a) where content reveals special categories |
| Data | The content itself, photos (re-encoded as JPEG in the browser before upload, which removes EXIF data such as GPS position; random file names), timestamps, author; for Market listings, events, questions and travel board posts, the author's preview switch (`share_preview`, No. 20) |
| Recipients | Approved members (bookings: only mentor and mentee; blocks and settings: only the member); admins. A Market listing, event, question or travel board post whose author turned its preview on: anyone with its link sees the preview only (No. 20) |
| Retention | Until deleted by the member or account deletion. Photo files go with their post, listing or event (deleted by the site), or within 7 days at most when left behind (photo clean-up). Places and groups the member created stay without the creator (`created_by` set to NULL) |

### 6. Private messages

| | |
|---|---|
| Purpose | Let two members write to each other |
| Legal basis | Art. 6(1)(b) |
| Data | Messages, conversation previews (500 characters), read state, hidden conversations |
| Recipients | Only the two participants (database policy); admins have no access through the app |
| Retention | Until account deletion of either participant (the conversation is deleted for both) |

### 7. In-app notices

| | |
|---|---|
| Purpose | Tell members about likes, comments, Namaste, answers, events, bookings, verification results, urgent questions in their city, members joining (ambassadors), matching travel posts (`travel_match`) and housing listings (`housing_match`, No. 19); statements of reasons and warnings (type `moderation`), outcomes of reports they sent (`report`), and for admins new reports from the form, safety reports and new applications to be a city ambassador (`alert`) |
| Legal basis | Art. 6(1)(b); Art. 6(1)(c) with Art. 16(5) and 17 DSA for statements of reasons and report outcomes |
| Data | Recipient, actor, short text, reference, read state (`public.notifications`) |
| Profile reminders | Our team's reminders about missing profile details (type `profile`, Art. 6(1)(f): helping members recognise and find each other), at most one a week per member; a note of which reminder went to whom, from which admin and when (`private.profile_reminders`), deleted after 12 months (automatic) |
| Recipients | The recipient only |
| Retention | Until account deletion; read notices after 6 months *(by hand)* |

### 8. Terms acceptance and Art. 9 consent records

| | |
|---|---|
| Purpose | Prove which Terms version a member accepted and that they gave the explicit Art. 9 consent, with its wording version |
| Legal basis | Art. 9 consent record: Art. 6(1)(c) with Art. 7(1) (demonstrating consent). Age confirmation and Terms acceptance: Art. 6(1)(f) (being able to prove the contract and its terms) |
| Data | `profile_private.age_confirmed_at`, `terms_accepted_at`, `terms_version`, `art9_consent_at`, `art9_consent_version`; history in `public.terms_acceptances` |
| Recipients | The member (in "Download my data"); admins |
| Retention | Until account deletion |

### 9. Reports, notices of illegal content and moderation

| | |
|---|---|
| Purpose | Handle reports from members and notices from anyone (Art. 16 DSA), decide, give statements of reasons (Art. 17), inform the reporter (Art. 16(5)), escalate threats to life or safety (Art. 18), handle bug reports and ideas |
| Legal basis | Art. 6(1)(c) with Art. 16-18 DSA; otherwise Art. 6(1)(f) (a safe community; defending decisions) |
| Data | In-app reports: reporter, reported member or content, kind, reason category, the reporter's explanation, good-faith confirmation (`public.reports`; the reason line also names the item). Reports from the form at nriclub.app/report: where, category, explanation, name and email of the sender (may be empty for child sexual abuse material), reference code, decision and when the receipt and decision emails were sent (`private.notices`); keyed SHA-256 hashes of the sender's email and IP address (for IPv6, its /64 network) for the daily limits (`private.notice_log`). Decisions: admin, action, rule or law, facts, urgency, source, the reports answered, a copy of removed content (text; of photos only the file path), the statement sent (`private.moderation_action`); block reason on the account (`profile_private.block_reason/block_rule/blocked_at`); admins' notes on reports (`private.report_note`). Evidence copies where needed; bug reports with user agent and screen size; emails to hello@ |
| Recipients | Admins; the affected member (statement of reasons, in the app) and the reporter (outcome: in the app, or by email from hello@ for the form); police where Art. 18 applies. A reported message is shown to admins (only that message) |
| Retention | Closed reports and closed reports from the form, with evidence copies, once 12 months old, unless held for a legal dispute or police matter (`private.report_hold`, `notices.hold_reason`). Limit hashes: 1 day. Decisions: 24 months, the copy of removed content 6 months (unless held). Feedback (bug reports, ideas) is deleted with the sender's account; other reports stay without the link to the reporter. Reports and decisions about a deleted member stay without the link to the member (their text can still name them). Run by `private.daily_cleanup()` *(by hand until it is scheduled)* |

### 10. Transactional email

| | |
|---|---|
| Purpose | Sign-up and sign-in codes, password links, email-change confirmations; emails from our team about the membership (check decisions, changes to the Terms or the service, termination, breach notices; statements of reasons, warnings and report outcomes go in the app and may also be emailed); receipt and decision emails to senders of reports from the form at nriclub.app/report (sent by hand from hello@, prefilled by the admin panel) |
| Legal basis | Art. 6(1)(b); Art. 6(1)(c) with Art. 16(5), 17 DSA and Art. 34 GDPR |
| Data | Email address, subject and content (incl. code or link), delivery events |
| Recipients | Resend (Amazon SES eu-west-1) as processor of Supabase Auth's custom SMTP; the mailbox provider for our team's emails |
| Retention | Resend: 30 days (all self-serve plans). Our team's emails: like No. 13 |
| Note | No newsletters, no marketing, no automatic notification emails. Open and click tracking must stay off for send.nriclub.app |

### 11. Hosting and server logs

| | |
|---|---|
| Purpose | Deliver the website and API; find faults; detect attacks |
| Legal basis | Art. 6(1)(f) (a secure, working service) |
| Data | IP address, time, URL or API query, user agent, status |
| Recipients | Vercel (edge and request logs), Supabase (API, Auth, database logs) |
| Retention | Supabase about 7 days (Pro plan); Vercel 1 hour (Hobby) or 1 day (Pro) **[fill in: your plan]** |

### 12. Backups

| | |
|---|---|
| Purpose | Restore the database after a failure |
| Legal basis | Art. 6(1)(f); Art. 32(1)(c) |
| Data | Full database copies |
| Recipients | Supabase |
| Retention | Daily backups, kept 7 days (Pro plan) |

### 13. Emails to hello@nriclub.app

| | |
|---|---|
| Purpose | Answer questions; handle data-subject requests (Art. 12-22), notices of illegal content, authority orders, complaints, redress requests |
| Legal basis | Art. 6(1)(b), 6(1)(c) (GDPR and DSA duties), 6(1)(f) |
| Data | Sender, content, attachments, replies; the request log |
| Recipients | The mailbox provider **[fill in]** |
| Retention | Requests about rights and DSA notices with the answers: 3 years after closing (proof of compliance; the lawyer ties it to the § 195 BGB limitation period). Other emails: 12 months after closing *(by hand)* |

### 14. Device storage

| | |
|---|---|
| Purpose | Keep the member signed in; remember dismissed tips and an invite |
| Legal basis | § 25(2) No. 2 TDDDG (strictly necessary, no consent); Art. 6(1)(b) |
| Data | `nriclub_token`, `nriclub_refresh`, `nriclub_reset_requested` (at most 24 hours), `nriclub_invite` (session storage, until the check details are sent; Get verified sends its code to `public.resolve_invite` to fill in the inviter), per-member flags (removed when the account is deleted in that browser); list in the Privacy Policy, section 8. `nriclub_profile_cache` and `nriclub_cookie_consent` are no longer written, and the site deletes them. `nriclub_analytics_consent` (the privacy banner's choice and date: strictly necessary to respect it). No cookies. The analytics items (`nriclub_visitor_id`, `nriclub_analytics_session`) need consent: No. 18 |
| Retention | See the Privacy Policy, section 8 |

### 15. Compliance records

| | |
|---|---|
| Purpose | Accountability (Art. 5(2)): this record, the breach register (Art. 33(5)), the request log, DPAs |
| Legal basis | Art. 6(1)(c) |
| Retention | As long as NRIClub runs, plus 3 years **[confirm with the lawyer]** |

### 16. Applications to be a city ambassador

Since 18 October 2026 (site) and the database update
`20261024000000_ambassador_applications.sql`; before it, applications came
by email (No. 13).

| | |
|---|---|
| Purpose | Look at applications to be a volunteer city ambassador (welcoming newcomers, sharing NRIClub at universities and workplaces, local meetups), write to the applicants, and make accepted members the ambassador for their city |
| Legal basis | Art. 6(1)(b) (steps at the applicant's request before agreeing on the volunteer role); Art. 6(1)(f) for keeping decided applications for a while (knowing whom we spoke to, answering questions about a decision) and for the daily limits on the form (protecting it from misuse) |
| Data subjects | Members and non-members who apply |
| Data | Name, email address, city, country, optional university or employer and LinkedIn link, motivation, time they could give, reference code, status (new, contacted, accepted, declined), deciding admin and date, admins' note; for members who were signed in, the link to the account (`private.ambassador_applications`). Keyed SHA-256 hashes of the email address and of the IP address (IPv6 by its /64) for the daily limits: 3 a day per email address, 10 per IP address, 50 in all (`private.ambassador_application_log`); a visitor told that an address has already applied uses up one of these too, so the form can't be used to test addresses. Accepting a member who is approved sets `profiles.ambassador_city`, recorded in `private.moderation_action` (No. 9) |
| Recipients | Admins only (admin panel → Ambassadors; an in-app `alert` notice per new application with the city and reference only, not the applicant's name, No. 7); the applicant's own applications in "Download my data" (without the note). Replies go by email from hello@ (No. 13) |
| Retention | 6 months after the decision (accepted or declined); undecided ones 12 months after they were sent; limit hashes 1 day. Not deleted with the account: the link to it is removed, and the application stays for these periods. Run by `private.daily_cleanup()` *(by hand until it is scheduled)* |

### 17. City ambassadors' panel

Since the database update `20261027000000_ambassador_panel.sql` (the site
shows "Coming soon" before it).

| | |
|---|---|
| Purpose | Let volunteer city ambassadors welcome newcomers to their city group, point to open questions, look after the group's description and starter post, mark their meetups and flag problems to our team; let our team oversee the role |
| Legal basis | The ambassador's own data: Art. 6(1)(b) (the ambassador agreement, accepted in the panel, versioned). Newcomers shown in the panel, welcomes and the log: Art. 6(1)(f) (welcoming new members; overseeing a role that acts for NRIClub) |
| Data subjects | City ambassadors; members of the city group who joined in the last 30 days; askers of open questions from the city |
| Data | When and which version of the agreement was accepted (`private.ambassador_agreement_ack`); newcomers marked as welcomed, by whom and when (`private.ambassador_welcomes`); the log of the ambassador's actions with the city and details, e.g. the group description before and after (`private.ambassador_log`); `events.ambassador_hosted`; `reports.ambassador_city` on flags (a report like any other, No. 7/8). The panel shows newcomers' id, name, photo and join date only, as members already see them, without blocked pairs or accounts not shown to members |
| Recipients | The welcomes: the ambassador who made them and admins. The agreement record and the log: admins only (admin panel → Ambassadors, `public.admin_ambassador_activity`), and the ambassador in "Download my data". Every admin gets an in-app `alert` for a flag and when an ambassador steps down |
| Retention | Log and welcomes: 12 months after each entry; all three deleted with the ambassador's account, welcomes also with the welcomed member's account; the agreement record otherwise until the account is deleted. Run by `private.daily_cleanup()` *(by hand until it is scheduled)* |

### 18. Website analytics (with consent)

Since the site update with the privacy banner and the database update
`20261029000000_analytics.sql` (Privacy Policy 2026-10-24).

| | |
|---|---|
| Purpose | Improve the site: which pages and features are used, where visitors come from (referrers, campaign links), where sign-up loses people |
| Legal basis | Art. 6(1)(a) GDPR and § 25(1) TDDDG (consent on the privacy banner: Accept and Decline equally prominent, nothing preselected; asked again after 12 months (Accept) or 6 months (Decline); withdrawn with "Privacy settings", which stops it at once and deletes the visitor ID). The choice and its date stay in the visitor's browser; the browser sends nothing before Accept, and `/api/collect` refuses requests without the consent flag |
| Data subjects | Visitors of nriclub.app and members using the app, in browsers where Accept was chosen |
| Data | Random visitor ID and visit ID; page paths (ids replaced by ":id") and titles; clicked buttons' and links' visible text (80 characters; in the members' area only the site's menu names) and link targets; sign-up and log-in steps reached (no values); exit page; first page's referrer domain and utm_source/medium/campaign/content; IP address shortened by `/api/collect` before storing (IPv4 /24, IPv6 /48); country, region and city from Vercel's IP lookup; device class (mobile, tablet, desktop), browser and system family (`private.analytics_events`). Daily counts of Accept and Decline without any identifier (`private.analytics_consent_counts`). Not linked to accounts (no member ID, name or email) |
| Recipients | Admins (admin panel → Analytics: totals and single visits). Processors: Vercel (Edge Function `/api/collect`, IP lookup; transfer safeguard as for No. 11), Supabase (storage) |
| Retention | Events: 6 months (`private.analytics_cleanup()`, nightly pg_cron job `nriclub-analytics-cleanup`). Consent counts: kept (no personal data). Visitor ID in the browser: until Decline or the site's data is cleared |
| Note | Data-subject requests: the data can only be found with the visitor ID (shown in Privacy settings while analytics are on); `DELETE FROM private.analytics_events WHERE visitor_id = '…'` |

### 19. Housing search ("Find a place")

Since the database update `20261030000000_housing_search.sql` (Privacy
Policy 2026-10-24; the site shows "Coming soon" before it).

| | |
|---|---|
| Purpose | Let members find a room, sublet or flat by city and dates, and tell members who are looking for a place about matching listings |
| Legal basis | Art. 6(1)(b); Art. 9(2)(a) where content reveals special categories. The limits: Art. 6(1)(f) (keeping the Market free of misuse) |
| Data subjects | Members who post housing listings or "Looking for a place" posts |
| Data | Housing details of a Market listing: kind of place, city, available from and until (or open-ended), warm rent, deposit, size, furnished, Anmeldung possible, when it expires or was renewed (`public.housing_listings`; the listing itself in `public.marketplace`, No. 5). Looking posts: kinds of place, city, dates, highest rent, furnished or Anmeldung needed, note, on/off (`public.housing_wanted`). When a member posted either or changed a listing's details, for the limits (`private.housing_post_log`). Matching notices (type `housing_match`, No. 7). Search terms aren't stored. No fields or filters for gender, religion, caste, origin, nationality, language or diet (AGG) |
| Recipients | Listing details: approved members and admins; with the listing's preview on, anyone with its link sees the kind of place and city only (No. 20). Looking posts: the author, admins, and the authors of listings they match (`public.housing_matches`, with name and photo). In "Download my data" |
| Retention | Listings: shown until their "until" date, or 60 days after posting or renewal if open-ended; deleted 30 days after that (with their Market listing and matching notices) unless renewed. Looking posts: until their end date, or 60 days without one; deleted 30 days after. Limit counts: 30 days. All deleted with the account. Run by `private.housing_cleanup()` (nightly pg_cron job `nriclub-housing-cleanup`) |

### 20. Previews of shared items (public link previews)

Since the database update `20261031000000_public_previews.sql` and the
Edge Function `api/preview.js` (Privacy Policy 2026-10-26, "Previews of
what you share"; before the update every shared link shows "for members").

| | |
|---|---|
| Purpose | Let a member show a Market listing, event, question or travel board post they posted to people who aren't members yet (e.g. in a WhatsApp group), with a link card, and invite them to join |
| Legal basis | Art. 6(1)(b): the author's own choice, per item, as part of the service; off by default (Art. 25(2)), existing items stay members-only. A question's title can reveal special categories: Art. 9(2)(a), the consent of No. 8 |
| Data subjects | Members who turn a preview on |
| Data | `share_preview` on `public.marketplace`, `public.events`, `public.help_requests`, `public.travel_posts` (set by the author only: the tables' UPDATE policies; admins don't change it, removing the item ends it). What `public.public_preview` gives anyone: Market listing: first photo, kind (e.g. "Housing · WG room"), city; event: photo, "Event", city, day; question: title, city, number of answers; trip: route, month. Never the author's name or photo, price, rent, deposit, description, time, place, flight, note, exact dates, answers, contact details or address. A city only from a city field, or where a part of a listing's free-text location exactly matches an approved city group. Photos only from our Storage buckets, the author's own folder. Only while the item is live and its author is approved and not blocked; otherwise nothing, the same answer as for an item that doesn't exist |
| Recipients | Anyone with the link, and the apps it's shared in (their crawlers fetch the card). Vercel (Edge Function `/api/preview`, which fetches the preview with the site's public key and caches the page for at most 60 seconds; transfer safeguard as for No. 11). Pages are `noindex`, not linked from public pages or the sitemap |
| Retention | Not stored separately: the preview is read from the item each time. It ends when the author turns it off (within 60 seconds), when the item ends, is deleted or removed, or while the author isn't approved or is blocked. Copies the apps made of a card are outside our control. The switch is in "Download my data" (with the items) and goes with the item |

## Technical and organisational measures

See `toms.md` (Art. 30(1)(g), Art. 32).
