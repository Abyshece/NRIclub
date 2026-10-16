# The lawyer's advice, and what is still open

A German IT lawyer reviewed the Terms of Use, the Privacy Policy, the Art. 9
consent and the documents in this folder on 16 October 2026 (the questions
sent are in `lawyer-questions.md`). The verdict: "Not ready to publish as
is, but close." The ten must-fix points and the should-fix points that
concern the texts are now in them (list at the end). This file holds:

1. the lawyer's advice to the owner, to act on;
2. what the texts and the code couldn't settle, for the next review;
3. what changed after the review.

## 1. Advice for the owner

**Rollout.** Run `20261019000000_access_consent.sql` straight after the
deploy. Until it runs, what the Privacy Policy (section 4) and the Terms
(section 5) say about members waiting for review isn't true yet.

1. **Name and address before the consents.** A consent is only "informed"
   if the person knows who the controller is (Art. 4(11), Art. 13(1)(a)
   GDPR; EDPB Guidelines 05/2020, para. 64). "NRIClub is run by its founder
   in Germany" identifies nobody. Fill in name and postal address in
   `src/content/imprint.js` **before** the migration runs; otherwise every
   Art. 9 consent collected may have to be asked again. The same gap
   breaches § 5 DDG and § 18(1) MStV now (fine up to EUR 50,000, § 33 DDG;
   consumer associations can sue, § 3a UWG) and leaves the contracting
   party and the withdrawal addressee unnamed. Empty details are acceptable
   for a few days, not for an open launch. A business address where legal
   papers can be served (a c/o or virtual office that really accepts mail)
   is enough; a P.O. box is not.
2. **Breach No. 1** (before 12 October 2026, `breach-register.md`).
   Notify the state data protection authority now, late, with the reasons
   for the delay (Art. 33(1)): the admin credentials were public for
   months, the admin functions could be called with the public key, and
   membership is Art. 9-relevant, so "unlikely to result in a risk" can't
   be argued. Awareness of the password dates from 24 April 2026. Telling
   the members of that time (Art. 34) is likely required too, by email once
   hello@ works. **Today, before anything else:** confirm the old admin
   password has been changed everywhere and that Vercel deployments from
   before 12 October are deleted or protected; otherwise the breach is
   still going on.
3. **The Art. 9 consent and Art. 7(4).** Making membership depend on it is
   defensible: the special-category data is part of the service itself,
   and no other Art. 9(2) condition fits ((d) needs a body with a
   political, religious or philosophical aim; (e) needs data the person
   made public, which members-only content isn't). Conditions, now met by
   the wording: it covers every purpose, says that membership depends on
   it, and withdrawal stays simple (deleting the account or an email).
4. **Data protection officer and DPIA.** Besides § 38(1) sentence 2 BDSG,
   Art. 37(1)(c) GDPR requires a DPO once the core activity is large-scale
   processing of special-category data; a diaspora network is that. Treat
   "large scale" as reached at a few thousand members across several
   countries. Do the DPIA before opening to the public at scale (the
   1,000-member mark in `dpia-threshold-check.md` is reasonable). Until
   then the Policy correctly says no DPO has been appointed.
5. **UK members.** NRIClub targets UK cities, so UK GDPR applies
   (Art. 3(2)(a)). Without a UK establishment and processing special
   categories, NRIClub needs a UK representative (Art. 27 UK GDPR); the
   "occasional processing" exemption doesn't fit. Check Switzerland (nFADP)
   if Swiss cities are added. India's DPDP Act 2023 isn't fully in force
   yet: keep it on the watch list.
6. **Real names** (§ 19(2) TDDDG). The reasons in Terms section 5 make the
   rule defensible (BGH III ZR 3/21 and 4/21 concerned pre-GDPR contracts).
   The risk is moderate, mainly a reinstatement or injunction claim. If
   complaints arrive, the fallback is a display name with the real name for
   admins only (plan C35).
7. **§ 312(1a) and § 327(3) BGB.** Probably not applicable (data processed
   only to provide the service and meet legal duties). Offering the
   withdrawal right voluntarily is harmless: keep it. While the provider is
   unnamed, the withdrawal information would be defective if § 312g did
   apply (12 months plus 14 days, § 356(3) BGB): one more reason for
   point 1.
8. **Ending memberships and changing the Terms.** 4 weeks' ordinary notice
   is acceptable under § 307 BGB for a free, non-dominant network; no
   reasons needed, but never arbitrary or discriminatory (AGG). Keep the
   hard Terms gate only for a consent the law requires (now in section 14).
9. **Retention periods** (now in the Privacy Policy and kept by hand with
   `deletion-routine.md`): unconfirmed sign-ups 30 days; unfinished sign-ups
   90 days; declined or ended memberships 6 months; read notices 6 months;
   closed reports and evidence copies 12 months; the record of declined and
   blocked accounts 24 months, its note 12 months; requests about rights
   and DSA notices 3 years (the § 195 BGB limitation period); other emails
   12 months. Also consider deleting accounts after 24 months without
   activity, with a warning first (Art. 5(1)(e)): not mandatory, but
   recommended once the network grows.
10. **Processors.** Have each data processing agreement in place before the
    deploy (`processor-agreements.md`). Switch off Supabase's AI options
    (otherwise an AI provider becomes an unlisted sub-processor). Vercel's
    Hobby plan is for non-commercial use only: a contract risk, and on
    Hobby there is no Vercel DPA at all (see 2.4 below). For the mailbox
    choose an EU provider with a DPA, not a forward to a personal Gmail
    account. Until the MX records exist, the DSA points of contact
    (Art. 11, 12), the Impressum email and every rights request fail.
11. **Photos public by URL.** The notice is acceptable briefly. For Market
    housing photos and the files of deleted accounts, the public-by-URL
    design and the missing deletion are a present Art. 17 and Art. 32
    problem: do C1 (delete files with posts and accounts) now and private
    buckets (C19) before growing. Until C1 ships, run the weekly photo
    query in `deletion-routine.md`; the first run removes the files of
    accounts deleted before October (19 of 33 files on 15 October).
12. **Consumer disputes.** The voluntary § 36 VSBG statement is fine. No ODR
    link is needed (the EU ODR platform closed in July 2025). A § 37 VSBG
    notice is still required once a consumer dispute fails (template in
    `moderation-guidelines.md`).

## 2. Still open

### For the owner and the next legal review

1. **Who sees whose profile.** After the migration, approved members can
   still read the profile of every account: waiting, unfinished, declined
   and blocked ones too, and the Find tab lists them. The lawyer finds no
   legal basis for showing declined and unfinished accounts and prefers a
   database change (`private.is_listed_member`: only active, approved
   accounts are shown to other members). That change belongs in a
   migration, outside the legal-texts work. Until it ships, the Privacy
   Policy says honestly that approved members can see a waiting member's
   profile, and a declined or blocked one until it is deleted
   (`VISIBILITY.onlyApprovedListed = false` in
   `src/content/legal/privacy.js`; set it to `true` with the change).
   Open product choice: whether blocked authors' profiles stay visible next
   to their old posts.
2. **Reports: "12 months after closing".** The database stores when a report
   was sent, not when it was closed. The Policy therefore says reports are
   deleted "once they're closed and 12 months old", which can be sooner
   after closing than the lawyer's wording. Confirm, or add a closing date
   to reports (then the routine can count from it).
3. **By hand, once a month.** Until clean-up jobs exist (plan C20), the
   periods are kept by hand: photo files weekly, the rest monthly, so data
   can stay up to a month longer than the period given (the Policy says
   so). Confirm that is acceptable for the interim.
4. **Vercel has no DPA on the Hobby plan.** vercel.com/legal/dpa applies
   only "for Customers who are on Enterprise and Pro plans". The Policy
   names no agreement and no safeguard for Vercel until
   `PRIVACY_DETAILS.agreements.vercel` is set to true. Moving to Pro before
   launch fixes both this and the non-commercial-use limit.
5. **Supabase is a Singapore company.** Supabase's terms name Supabase
   Pte. Ltd., Singapore, as the contracting party (not Supabase Inc., USA,
   as our earlier texts said); its DPA is part of the terms and relies on
   the standard contractual clauses (no DPF). The texts now say so.
   Confirm the transfer wording (Supabase in Singapore; its
   sub-processors are listed in its DPA).
6. **Resend and the Data Privacy Framework.** Resend's DPA states DPF
   compliance; it wasn't checked on dataprivacyframework.gov, so the Policy
   names only the standard contractual clauses, which the DPA includes.
7. **Terms gate.** Section 14 now promises that, for a future change that
   needs no new consent, members who don't accept keep using NRIClub under
   the previous Terms until we end the membership with 4 weeks' notice.
   The code today locks members out until they accept any new version (the
   database checks the version). That is covered for this version, which
   comes with the required Art. 9 consent, but the Terms screen needs a
   "Later" button, and the database a softer check, before the next
   Terms-only change. Also confirm: members still under version 2026-10
   (which has no change clause) must accept the new Terms and give the
   consent together on one screen before they can go on.
8. **The breach awareness date.** Commit bef7d91 (24 April 2026) took the
   password out of the source code but moved it into build settings
   (`VITE_ADMIN_PASS`), which still put it into the site's JavaScript until
   12 October. The lawyer's conclusion (awareness of the published password
   in April) still holds; the register now says 24 April for item (4) and
   asks the founder to confirm.
9. **Dates.** `TERMS_DATE` and `PRIVACY_DATE` say "19 October 2026". Set
   both to the day of the deploy (the lawyer's advice). The version strings
   stay `2026-10-19`.
10. **"Ended" memberships.** The database knows "blocked", not "ended". The
    Policy promises deletion 6 months after we end a membership; the
    routine lists blocked accounts older than 6 months and the admin
    deletes the ones whose membership ended (`deletion-routine.md`,
    step 3). A separate status would make this exact.

### In the code, outside the legal texts (the texts allow for them)

- **Photo files deleted with their post or account** (plan C1), then
  `RETENTION.photoFilesDeleted = true`.
- **Clean-up jobs** (plan C20), then `RETENTION.byHand = false`.
- **City pages** (plan C17): the page shows member counts only from 5, but
  the public API returns any count (live: Forchheim 1), which with Art. 9
  can reveal one person's membership. The Policy's sentence is about the
  page; the API should return nothing below 5.
- **Report text keeps the reported member's name** (`[USER] <name> — ...`):
  optional, blank it when the reported account is deleted. The Policy
  says the name can stay.
- **Settings → Your consent** (`src/Dashboard.jsx`): show
  `ART9_CONSENT_TEXT` and `ART9_WITHDRAW_TEXT` (both in
  `src/content/legal/consent.js`, re-exported by `LegalModals.jsx`) instead
  of its own summary, which leaves out the membership check and the email
  route. `ART9_ERROR` in `src/member/Consent.jsx` also describes the
  consent as only "to show what you share to other members".
- **The Terms link on the signup form** (`src/member/Consent.jsx`) points
  at /terms; a plain click opens the dialog, which now shows the version
  the database will record, but opening the link in a new tab shows the
  current version even before the migration. Use `termsPath(version)`.
- **Notes where reviews and advice appear** (§ 5b(3) UWG, RDG/StBerG),
  wording from the lawyer:
  - under mentor ratings: "Ratings come from members who booked a session
    with this mentor, one per session, after its time. We don't check that
    the session took place.";
  - under place recommendation counts: "Recommendations come from members.
    We don't check that they were customers, and nobody is paid for them.";
  - in the booking dialog and the Legal/Visa question category: "Members
    share their own experience. That isn't legal, visa or tax advice; for
    your own case see a lawyer or tax adviser.";
  - rename the mentoring topic "Visas & residence" to "Moving & visa
    experiences".
- **nriclub_invite** (plan C30): delete it after sign-up or after 30 days;
  then the Policy (section 8) says "Kept: until you sign up, at most 30
  days".
- **Report page** (plan C6): then `REPORT_HREF = "/report"` and
  `REPORT_LINK_TEXT = REPORT_LINK_LABEL` in `src/content/legal/reporting.js`,
  and Terms section 9 names the page.

## 3. What changed after the review

- **Art. 9 consent** (`consent.js`): names the membership check as well as
  showing members, says NRIClub can't be used without it, and how to
  withdraw (also by email). Changed before any consent was recorded, so
  the version stays 2026-10-19.
- **Privacy Policy** (`privacy.js`):
  - section 2: the Art. 9 consent also as a basis for the membership check;
    the LinkedIn data looked at; legal bases for the consent record
    (Art. 6(1)(c) with 7(1)) and for the age and Terms record (legitimate
    interests); fixed periods for every kind of data; reports keep the
    reported name and evidence copies; every kind of email our team sends;
    Resend keeps emails for 30 days; Vercel's log period;
  - section 3: the purposes match the consent;
  - section 4: what waiting, declined and blocked members' profiles show
    (switch `VISIBILITY`); lawyers and courts for legal claims;
  - section 5: non-members (people who report, businesses in Places);
  - section 7: Supabase Pte. Ltd. (Singapore), Plus Five Five, Inc.
    (Resend); a data processing agreement and its safeguard named per
    provider, only where one is in place;
  - section 9: photo files deleted by hand within 7 days; what stays;
    deletions by hand until jobs exist;
  - section 11: the right to object covers "in particular" these, emails
    and Places included.
- **Terms of Use** (`terms.js`): version line ("published", "applies to you
  from when you accept it"); section 3 consent purposes; section 5 "we
  usually ask first", deletion of declined accounts, and a new check (and
  no taking part meanwhile) after a change of name or LinkedIn link; section 8 photo
  files within 7 days; section 9 which items have Report, and no name
  needed for child sexual abuse reports; section 12 notice by email;
  section 13 email 2 weeks before a change for the worse; section 14 the
  previous Terms keep applying unless a legal consent is needed;
  section 16 no limit where the law forbids one (Art. 82 GDPR, Art. 54
  DSA).
- **Version 2026-10** (`terms-2026-10.js`): "still applies to members who
  haven't accepted the current version yet".
- **The Terms dialog** at signup, Get verified and the Terms screen shows
  the version the database will record (2026-10 until the migration runs).
- **Footers** show hello@nriclub.app as text, for contact and for reports.
- **Records:** `deletion-routine.md` (new), `records-of-processing.md`,
  `processor-agreements.md`, `breach-register.md`, `moderation-guidelines.md`,
  `toms.md`, `dpia-threshold-check.md`, and the signup email text in
  `LAUNCH-GUIDE.md` (step 2.4).
