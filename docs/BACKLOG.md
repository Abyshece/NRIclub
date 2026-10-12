# Backlog

Issues found while auditing the code for Phase 1 that are outside its scope
(security and data), grouped by the phase that will handle them.

## Phase 2: restructure

- `App.jsx` is a single ~6,600-line file with ~1,400 inline styles; split it
  into pages and components with shared styles.
- No URLs per page: sharing an event/post/listing link, the back button and
  search indexing don't work.
- Sessions are handled by hand in `supabaseApi.js` and tokens live in
  `localStorage`; move to `@supabase/supabase-js` session handling.
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
- Newly created **events and help requests** keep a temporary id until
  reload, so RSVP/delete on them fails.
- The **city** chosen for events and help requests is never saved.
- **Doc likes, event likes/comments and "Clear chat"** only change local
  state.
- **Network** shows at most 20 members.
- **Account settings**: name change and password change aren't wired up.
- **Report user** from the chat screen silently fails (`activeConvo` is out of
  scope).
- Profile preview doesn't show the avatar.
- If an image upload fails, the UI falls back to storing a base64/blob URL;
  the database now rejects oversized values, so show an error instead.
- **Privacy settings**: *Profile visibility* and *Online status* aren't
  enforced; every member sees every profile and everyone shows as online.
- Notifications are written by the client with free text; generate them with
  database triggers instead.
- Reports store the kind of content in the reason prefix (`[DOC]` …) and bug
  reports share the reports table; add a content type column / bug table.
- Marketplace photos are a JSON string in `image_url`; event dates are free
  text.
- Admin "Bug Reports": *Resolved* and *Dismiss* do the same thing.

## Phase 5: launch readiness

- Deleting an account doesn't delete the user's uploaded images in Storage.
- Signup reveals whether an email already has an account.
- The client-side rate limiter resets on reload; rely on Supabase Auth limits.
- Terms page says "Last updated: October 2024"; the privacy contact
  `privacy@nriclub.app` must be a real mailbox.
- Members' LinkedIn URLs are visible to all members; consider an option to
  show them only to admins.
- Delete rejected or never-completed applications after a set period (and
  say so in the Privacy Policy).
- Email members about verification decisions (in-app notifications exist;
  email needs SMTP or an Edge Function).
- The Terms of Use text is a plain-language draft and needs legal review.
