# Backlog

Issues found while auditing the code for Phase 1 that are outside its scope
(security and data), and the parts of the Phase 1 review (2026-10-12) that
were left for later, grouped by the phase that will handle them.

## Phase 2: restructure

- `App.jsx` is a single ~6,600-line file with ~1,400 inline styles; split it
  into pages and components with shared styles.
- No URLs per page: sharing an event/post/listing link, the back button and
  search indexing don't work.
- Sessions are handled by hand in `supabaseApi.js` and tokens live in
  `localStorage`; move to `@supabase/supabase-js` session handling.
- Password-reset links use the implicit flow: the sign-in tokens travel in
  the link itself. The site keeps them in memory only, says which account
  the new password is for and ends that session afterwards, but anyone can
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
- Reports store the kind of content in the reason prefix (`[DOC]` …) and bug
  reports share the reports table; add a content type column / bug table.
- Marketplace photos are a JSON string in `image_url`; event dates are free
  text.

## Phase 5: launch readiness

- Deleting an account doesn't delete the user's uploaded images in Storage.
- Signup reveals whether an email already has an account.
- Rejected and blocked members can still file reports (on purpose, so they
  can report bugs); add a per-member rate limit.
- The client-side rate limiter resets on reload; rely on Supabase Auth limits.
- `support@nriclub.app` and `privacy@nriclub.app` must be real mailboxes
  that someone reads: the site, the Terms and the Privacy Policy send people
  there.
- Members' LinkedIn URLs are visible to all members; consider an option to
  show them only to admins.
- Delete rejected or never-completed applications after a set period (and
  say so in the Privacy Policy).
- Email members about verification decisions (in-app notifications exist;
  email needs SMTP or an Edge Function).
- Members waiting for review (pending) can see and do everything approved
  members can, so new members aren't stuck while they wait. Decide whether
  that stays once sign-ups grow.
- Vercel wasn't part of the Phase 1 review: check its settings, old preview
  deployments, and whether Vercel Analytics needs the cookie banner's
  consent. Add security headers, including a Content-Security-Policy whose
  `img-src` allows only the site and the project's Storage (the database
  already refuses outside photo links for new posts, profiles, events and
  listings, but older rows may still have them).
- Test in Safari (including on iPhone) and Firefox, and with a screen
  reader; the Phase 1 review used Chromium only.
- **Legal review** before inviting the public:
  - The Terms of Use text is a plain-language draft.
  - Consent at signup: every signup is stored with `gdpr_consent = true`
    and a consent date from the Terms tick, but no separate consent is asked,
    while the Privacy Policy names consent (Art. 6(1)(a)) as a legal basis.
    Either rely on the contract (Art. 6(1)(b)) plus `terms_accepted_at` and
    stop recording `gdpr_consent` from the Terms tick, or add a real,
    unticked consent box, and align the Privacy Policy. Not changed in the
    code yet.
  - The moderation record kept after a rejected or blocked member deletes
    their account (`private.moderation_record`: hashed email, LinkedIn link,
    decision, admin's note): confirm the legal basis (legitimate interest,
    Art. 6(1)(f)), set a retention period with a clean-up job, and decide
    whether the admin's note may be kept.
