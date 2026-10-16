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
  Terms and Art. 9 consent): see other members' profiles and content. Members
  waiting for review see only the list of groups and the guides (migration
  `20261019000000_access_consent.sql`). Approved members can still see the
  profiles of waiting, unfinished, declined and blocked accounts until the
  profiles policy shows only approved, active ones (`VISIBILITY` in
  `src/content/legal/privacy.js`; the lawyer finds no legal basis for showing
  declined and unfinished accounts).
- **Admins** (rows in `public.admins`): see everything members see plus email
  addresses, verification details, notes, reports and our decisions. Not
  private messages, except a single message a member reported (shown only
  with that report). Admins write only through database functions that
  record what they did (`private.moderation_action`).
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
| Data | City, country, location, LinkedIn profile link or a note, voucher (member who vouches, or the inviter from an invite link), decision, message to the member, admin notes, dates (`profile_private`, `verification_log`, `private.review_hold`, `private.reviewed_link`). Admins also look at the LinkedIn profile itself (data from another source, Art. 14) |
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
| Recipients | Approved members; admins; Supabase (photos in Storage are reachable by anyone who has the exact URL while the buckets are public) |
| Retention | Until changed or account deletion. Photo files nothing uses any more: within 7 days *(by hand, weekly)* |

### 5. Community content and features

| | |
|---|---|
| Purpose | Provide groups, posts, comments, likes, guides (docs) and comments, questions and answers (incl. urgent questions to up to 500 city members), events and RSVPs, Market listings, places and recommendations, Namaste connections, mentoring slots, bookings and reviews, blocks, settings |
| Legal basis | Art. 6(1)(b); Art. 9(2)(a) where content reveals special categories |
| Data | The content itself, photos, timestamps, author |
| Recipients | Approved members (bookings: only mentor and mentee; blocks and settings: only the member); admins |
| Retention | Until deleted by the member or account deletion. Places and groups the member created stay without the creator (`created_by` set to NULL) |

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
| Purpose | Tell members about likes, comments, Namaste, answers, events, bookings, verification results, urgent questions in their city, members joining (ambassadors); statements of reasons and warnings (type `moderation`), outcomes of reports they sent (`report`), and for admins new reports from the form and safety reports (`alert`) |
| Legal basis | Art. 6(1)(b); Art. 6(1)(c) with Art. 16(5) and 17 DSA for statements of reasons and report outcomes |
| Data | Recipient, actor, short text, reference, read state (`public.notifications`) |
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
| Data | In-app reports: reporter, reported member or content, kind, reason category, the reporter's explanation, good-faith confirmation (`public.reports`; the reason line also names the item). Reports from the form at nriclub.app/report: where, category, explanation, name and email of the sender (may be empty for child sexual abuse material), reference code, decision and when the receipt and decision emails were sent (`private.notices`); keyed SHA-256 hashes of the sender's email and IP address (for IPv6, its /64 network) for the daily limits (`private.notice_log`). Decisions: admin, action, rule or law, facts, urgency, source, the reports answered, a copy of removed content, the statement sent (`private.moderation_action`); block reason on the account (`profile_private.block_reason/block_rule/blocked_at`); admins' notes on reports (`private.report_note`). Evidence copies where needed; bug reports with user agent and screen size; emails to hello@ |
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
| Data | `nriclub_token`, `nriclub_refresh`, `nriclub_reset_requested`, `nriclub_invite`, `nriclub_profile_cache`, per-member flags (list in the Privacy Policy, section 8). No cookies, no analytics |
| Retention | See the Privacy Policy, section 8 |

### 15. Compliance records

| | |
|---|---|
| Purpose | Accountability (Art. 5(2)): this record, the breach register (Art. 33(5)), the request log, DPAs |
| Legal basis | Art. 6(1)(c) |
| Retention | As long as NRIClub runs, plus 3 years **[confirm with the lawyer]** |

## Technical and organisational measures

See `toms.md` (Art. 30(1)(g), Art. 32).
