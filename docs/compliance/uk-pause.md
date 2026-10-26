# The UK is paused (since 26 October 2026)

## Why

A service outside the UK that offers itself to people in the UK falls under
the UK GDPR (Art. 3(2)(a)). Such a service needs a representative in the UK
(Art. 27 UK GDPR); the "occasional processing" exemption doesn't fit
NRIClub, because membership can reveal ethnic origin and religion. The
lawyer said so in the first review (`questions-for-the-lawyer.md`, advice
point 5). NRIClub has no UK representative yet, so the owner decided to stop
targeting the UK until it has one.

## What the site does now

- **Homepage:** no UK city in the popular cities, the city search or the
  map (`POPULAR_CITIES` in `src/content/home.js`; the list from the database
  is filtered in `src/LandingPage.jsx`).
- **City pages and the sitemap:** the build writes no page for a UK city and
  leaves them out of `sitemap.xml` (`CITIES` in `src/content/cities.js`
  leaves out everything in `UK_CITIES`; `vite.config.js` builds from
  `CITIES`). An old link such as nriclub.app/city/london shows only "NRIClub
  isn't open in London at the moment", with a sign-in note for existing
  members (`src/CityPage.jsx`).
- **Country choice:** "United Kingdom" isn't offered at sign-up, in Get
  verified or in Edit profile (`PAUSED_COUNTRIES` in `src/member/profile.js`).
  A member who chose it before keeps it until they change it.
- **City suggestions for members:** Get verified and the housing search
  don't suggest UK cities. Members can still type any city. The travel
  board still suggests London as a place to fly to or from: that is a
  route, not an offer to people living there.
- **What stays:** the UK city groups in the database and their members. The
  groups are members-only; nothing public links to them.

`UK_CITIES` also holds `UK_CITIES_UNSURE`: group names that are as likely
to mean a place outside the UK (Cambridge, Chesterfield, East London,
Halifax, Kingston, Morley, Newport, Richmond, Southport, Windsor). They are
paused to be safe. Once you know a group is for a city outside the UK (for
example Windsor in Canada or East London in South Africa), take its name out
of `UK_CITIES_UNSURE` and it is public again.

The pause stops NRIClub offering itself to people in the UK. Members who
already live there and keep using NRIClub may still bring the UK GDPR in:
take that to the next legal review.

## Before targeting the UK again

1. **Appoint a UK representative** (Art. 27 UK GDPR) in writing: a person
   or company established in the UK that people and the ICO can contact
   about NRIClub's processing. Several firms offer this as a service.
2. **Name it in the Privacy Policy** (`src/content/legal/privacy.js`,
   section 1 with the controller): the representative's name, UK address
   and email.
3. **Name the ICO** (Information Commissioner's Office, ico.org.uk) in
   section 12 ("Complaints") as the authority people in the UK can
   complain to, besides the German one.
4. **Check the transfer wording** in section 7: the UK has its own rules for
   transfers out of the UK (the International Data Transfer Agreement or the
   UK Addendum to the standard contractual clauses). Ask the lawyer whether
   each provider's agreement covers them.
5. **Update the records:** `records-of-processing.md` (the representative,
   UK members as data subjects), `processor-agreements.md` (the UK transfer
   terms) and `breach-runbook.md` (a breach that affects UK members goes to
   the ICO too, within 72 hours).
6. **Publish** the Privacy Policy as a new version (date it the day it goes
   live), then lift the pause in the code: empty `UK_CITIES` in
   `src/content/cities.js` and `PAUSED_COUNTRIES` in `src/member/profile.js`,
   and put "GB" back into `COMMON_COUNTRIES` in `src/member/GetVerified.jsx`
   and `src/Dashboard.jsx` if it should be shown first. London goes back into
   `POPULAR_CITIES` and the homepage map if you want it there.
