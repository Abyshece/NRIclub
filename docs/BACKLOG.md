# Backlog

Issues found while auditing the code for Phase 1 that are outside its scope
(security and data), and the parts of the Phase 1 review (2026-10-12) and
of the review of its fixes (2026-10-13) that were left for later, grouped by
the phase that will handle them.

## Phase 2: restructure

- `App.jsx` is a single ~6,600-line file with ~1,400 inline styles; split it
  into pages and components with shared styles.
- No URLs per page: sharing an event/post/listing link, the back button and
  search indexing don't work.
- Sessions are handled by hand in `supabaseApi.js` and tokens live in
  `localStorage`; move to `@supabase/supabase-js` session handling.
- Password-reset links use the implicit flow: the sign-in tokens travel in
  the link itself. The site keeps them in memory only, says which account
  the new password is for, ends that session afterwards and fills in the
  login email only if this browser asked for the reset, but anyone can
  still build such a link with their own tokens. Switch to the PKCE flow
  (the link carries a one-time code that only the browser which asked for
  the reset can use) together with the supabase-js move.
- Search/filter values are put into PostgREST query strings without
  encoding (`searchProfiles`, `getMarketItems`, `getDocs`).
- Data is refreshed by polling every 2 s (messages) and 5 s (conversations,
  notifications) on top of realtime.
- Some network calls run during render: the Network view's user fetch, and
  the group member fetch, which loops when a group has no members.
- Errors are often swallowed (`catch (e) {}`) or shown with `alert()`.
- JavaScript bundle is ~520 KB; split by route.

## Phase 3: finish core features

- **Following list** is overwritten with bare ids (`App.jsx` ~2074), so the
  Following tab shows "User" with no avatar.
- The **city** chosen for a help request is never saved (the table has no
  city column).
- **Edit Profile**'s free-text Location can drift from the verified city and
  country; edit city and country there with the Get verified fields, or
  make Location read-only.
- Small glitches: Namaste notifications repeat the sender's name; "From:"
  shows with an empty hometown; nearby members only load after a search;
  notifications for deleted content stay; an admin list row has an empty
  aria-label when a member has no name.
- **Doc likes, event likes/comments and "Clear chat"** only change local
  state.
- **Network** shows at most 20 members.
- **"Mark all read"** in the notifications also marks open Namaste requests
  as read, and read requests are hidden, so they can't be accepted any more
  (the sender's button stays "Sent"). Leave requests out of it, or list
  open requests from `connections` instead of the notifications.
- **Account settings**: name change and password change aren't wired up.
- **Report user** from the chat screen silently fails (`activeConvo` is out of
  scope).
- Profile preview doesn't show the avatar.
- **Privacy settings**: *Profile visibility* and *Online status* aren't
  enforced; every active member sees every profile and everyone shows as
  online.
- Notifications are still written by the client with free text (the
  database now only takes likes and comments on the recipient's own post,
  and Namaste requests); generate them with database triggers instead.
- **Conversations** can't be hidden or deleted by the people in them
  (blocking only hides one in the blocker's browser), and the admin panel
  has no way to remove one. Admins can delete a conversation, with its
  messages, in the SQL editor:
  `DELETE FROM public.conversations WHERE id = '...';`. Add "Delete
  conversation" for members and a remove action in the admin panel.
- The admin panel's **Members** list loads the newest 1,000 members (it says
  when the list is cut, and search and the Blocked filter only cover those);
  add paging and search on the server.
- The admin panel's **Reports** page loads every open report, but only the
  newest 200 handled ones (it says how many there are in all); add paging
  or search on the server for older handled reports.
- Reports store the kind of content in the reason prefix (`[DOC]` …) and bug
  reports share the reports table; add a content type column / bug table.
- `user_settings.marketing_emails` and `profile_private.marketing_consent`
  are no longer used: NRIClub sends no newsletters or notification emails
  (only sign-in emails), signup doesn't ask and Settings has no switch. No
  member had opted in (checked on live, October 2026). Drop both columns
  some day, and never build a mailing list from them: a future newsletter
  needs a new opt-in and a switch in Settings to withdraw it.
  (`user_settings.email_notifications` and `push_notifications` now hold the
  in-app choices "Catch-up when I come back" and "Pop-ups while I'm on
  NRIClub"; rename them if the table is ever reworked.)
- Marketplace photos are a JSON string in `image_url`; event dates are free
  text.

## Phase 5: launch readiness

- Deleting an account doesn't delete the user's uploaded images in Storage
  (their folder is named after the account id).
- Signup reveals whether an email already has an account.
- Rejected and blocked members can still file reports (on purpose, so they
  can report bugs); add a per-member rate limit.
- The client-side rate limiter resets on reload; rely on Supabase Auth limits.
- `hello@nriclub.app` must be a real mailbox
  that someone reads: the site, the Terms and the Privacy Policy send people
  there.
- Members' LinkedIn URLs are visible to all members; consider an option to
  show them only to admins.
- Delete rejected or never-completed applications after a set period (and
  say so in the Privacy Policy).
- Email members about verification decisions (in-app notifications exist;
  email needs SMTP or an Edge Function).
- Members waiting for review (pending) can see and do everything approved
  members can, so new members aren't stuck while they wait (except members
  held for review because they matched a rejected or blocked account).
  Decide whether that stays once sign-ups grow.
- Matching against rejected and blocked accounts happens only at signup
  (email address) and when a member sends their details (email address and
  LinkedIn link), so nobody can try links one by one on their own profile.
  A link changed later (for example after approval, which puts the member
  back in review) isn't matched. Show admins in the review queue whether a
  member's current link matches a moderation record, without telling the
  member. A hold ends only through an admin's decision on the member
  (approving them, or moving them back to unfinished) or the account's
  deletion; sending the details again never ends it.
- The LinkedIn match key (`private.linkedin_slug`, built on
  `private.normalize_linkedin`) is indexed on `profiles`
  (`idx_profiles_linkedin_slug`) and stored in
  `private.moderation_record.linkedin_slug`. A migration that changes either
  function must also run `REINDEX INDEX public.idx_profiles_linkedin_slug`
  and recompute the stored keys, or matching and the review queue's
  duplicate counts go wrong.
- Resuming someone else's unfinished signup: the site now keeps the new
  session in memory until the password is replaced and the earlier visit's
  details are cleared, so nobody is left signed in half-way. The signup
  step only stores the name and country from the signup data, so no
  LinkedIn link, hometown, job, marketing opt-in or 18+/Terms record from
  an earlier visit survives; the site records the marketing choice and the
  18+/Terms tick once the code is confirmed. A resumed signup replaces the
  earlier visit's name and country, and records this visit's choices, both
  before and after it saves the new password. If the tab is closed after
  the code is entered but before the new password is saved, the confirmed
  account still has the earlier visit's password (and, if this visit's
  details weren't saved yet either, its name and country): its owner uses
  "Forgot password?", and Get verified asks her for 18+ and the Terms if
  they weren't recorded. Closing that gap needs the server, e.g. an Edge
  Function that sets the password when the code is confirmed. An owner who
  takes such an account over with "Forgot password?" instead of signing up
  again keeps the earlier visit's name until she changes it (Get verified
  asks her for her country, 18+ and the Terms).
- Someone who signs up, leaves at the code screen and later confirms the
  address from the log-in page ("Send me a new code") ends with marketing
  off even if they ticked it: only the signup screen knows the choice. They
  can switch it on in Settings.
- An admin can only reject or block an unconfirmed, unfinished signup, not
  delete it. If the address really belongs to someone else, its owner who
  later signs up lands in that account and sees "We couldn't verify your
  membership" (no email record was kept, so after she deletes the account
  from that screen her new signup isn't held). Let admins delete
  unconfirmed signups instead (needs an Edge Function with the service key).
- Vercel wasn't part of the Phase 1 review: check its settings, old preview
  deployments, and whether Vercel Analytics needs the cookie banner's
  consent. Add security headers, including a Content-Security-Policy whose
  `img-src` allows only the site and the project's Storage (the database
  already refuses outside photo links for new posts, profiles, events and
  listings, but older rows may still have them).
- Test in Safari (including on iPhone) and Firefox, and with a screen
  reader; the reviews used Chromium only. Include going Back to the site
  after signing out (pages the browser restores from its cache).
- Check on the live project what the reviews could only test against a
  local stand-in for Supabase Auth: a "Set a new password" page left open
  for more than an hour still saves the new password (Supabase answers with
  403 `bad_jwt` once the link's session expires, and the site then renews
  it), and that a member who changes their email address (with *Secure
  email change* on) has the new address in the admin panel once they
  confirm it.
- **Legal review** before inviting the public:
  - The Terms of Use text is a plain-language draft.
  - Consent at signup: accepting the Terms (at signup, in Get verified or on
    the Terms screen) also stores `gdpr_consent = true` and a consent date,
    but no separate consent is asked, while the Privacy Policy names consent
    (Art. 6(1)(a)) as a legal basis.
    Either rely on the contract (Art. 6(1)(b)) plus `terms_accepted_at` and
    stop recording `gdpr_consent` from the Terms tick, or add a real,
    unticked consent box, and align the Privacy Policy. Not changed in the
    code yet.
  - The moderation record kept when a member is rejected or blocked, also
    after they delete their account (`private.moderation_record`, described
    in the Privacy Policy, section 5). It holds a keyed hash of the email
    address, only if the account confirmed it (SHA-256 with a secret key,
    `moderation_salt` in `private.app_config`): it can't be turned back
    into the address, but anyone with the key, such as someone with full
    database access, can check whether an address they already know
    matches, so it is still personal data. It also holds the LinkedIn
    profile name from the link the account had at the admin's last review
    of its details (when it was last approved, asked for more information
    or rejected; for a block before any review, the link it had when
    blocked, which the admin screens show), the decision, its
    date and the admin's note. The account id is removed when the account is deleted.
    It's checked when someone signs up (email address), sends their
    verification details (email address and LinkedIn link) or is moved back
    into review by an admin. Confirm the legal basis (legitimate interest,
    Art. 6(1)(f)) and that a keyed hash is enough, set a retention period
    with a clean-up job, and decide whether the admin's note may be kept.
  - Right of access: "Download my data" has the member's own data,
    including their verification history with the messages they were sent
    and the notes their own changes left (such as their name and LinkedIn
    before a change), but not the notes admins wrote about them nor their
    moderation record. The Privacy Policy (section 4) says those are
    available on request from `hello@nriclub.app`, and such a request
    must be answered within a month. Confirm that's enough, or add admins'
    notes to the export with other people's names removed.
  - If the Terms change after the review, give them a new version in both
    places, which must always match: `TERMS_VERSION` in
    `src/member/LegalModals.jsx` and `private.current_terms_version()` in
    the database (in a new migration). Apply the migration, then deploy the
    site straight away: from the migration on, every member has to accept
    the new version before they can take part again, and only the new site
    can ask them (the "Before you continue" screen). Accepting records the
    new version and the date.
