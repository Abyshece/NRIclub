# Round 3: admin tools (owner steps)

What this round adds:

- **Decision emails.** Approve, ask for more info, reject or block in the
  admin panel, and the member also gets a short email (Edge Function
  `member-email`).
- **Delete unfinished sign-ups.** Members or Verification → open an account
  that never sent its check details → **Delete account…** (Edge Function
  `admin-delete-signup`).
- **What's on in the admin panel.** Add, change, hide and delete events; they
  show on nriclub.app/whats-on, the city pages and in the members' Events.
- **Inbox.** Mail to hello@nriclub.app in the admin panel: read, archive,
  reply as hello@ (Edge Functions `forward-email`, now storing each email,
  and `admin-inbox-reply`), and "Emails this month" from Resend's counter.
- **Page not found.** Unknown addresses get a friendly page and the status 404.

Everything is in:

| Path | What |
|------|------|
| `supabase/migrations/20261025100000_admin_tools.sql` | The database update (one file, one transaction) |
| `supabase/functions/member-email/index.ts` | Decision emails; `GET ?quota=1` refreshes "Emails this month" |
| `supabase/functions/admin-delete-signup/index.ts` | Deletes an unfinished sign-up |
| `supabase/functions/admin-inbox-reply/index.ts` | Sends a reply from the Inbox |
| `supabase/functions/forward-email/index.ts` | Stores mail to hello@ in the Inbox; the Gmail copy is now optional |
| `vercel.json` | Only the app's own addresses go to the app; the rest get `404.html` (status 404) |

The order below is safe: the site works before the database update and
before the functions are deployed. Until then the panel says what is
missing ("needs the database update of 25 October 2026", "the email couldn't
be sent", "the server function isn't reachable"), and What's on shows the list
in the code.

## 1. Database

Supabase → **SQL Editor → New query** → paste the whole of
`supabase/migrations/20261025100000_admin_tools.sql` → **Run**. It runs as
one transaction, refuses to run before the 2026-10-24 update, and refuses to
run twice. No existing rows change.

## 2. Secrets

Supabase → **Project Settings → Edge Functions → Secrets** (names only here,
never the values):

| Name | Needed by | What |
|------|-----------|------|
| `RESEND_API_KEY` | all four | Already set for `forward-email`. Keep it a **Full access** key: receiving and the "Emails this month" refresh need it. |
| `MAIL_FROM` | `member-email` | The sender of decision emails, e.g. `NRIClub <hello@nriclub.app>` (any address on a domain verified in Resend; `hello@send.nriclub.app` needs `send.nriclub.app` verified first). |
| `RESEND_WEBHOOK_SECRET` | `forward-email` | Already set. |
| `FORWARD_TO` | `forward-email` | Now optional: leave it set to keep the Gmail copies; delete it to keep mail in the admin Inbox only. |
| `FORWARD_FROM` | `forward-email` | Optional, as before. |
| `INBOX_FROM` | `admin-inbox-reply` | Optional; default `NRIClub <hello@nriclub.app>`. |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
provided by Supabase; don't add them.

## 3. Deploy the functions

**With the Supabase CLI** (from the repository folder, logged in with
`supabase login`):

```
supabase functions deploy member-email --project-ref uzzkdmybsbwknpsucuvv
supabase functions deploy admin-delete-signup --project-ref uzzkdmybsbwknpsucuvv
supabase functions deploy admin-inbox-reply --project-ref uzzkdmybsbwknpsucuvv
supabase functions deploy forward-email --no-verify-jwt --project-ref uzzkdmybsbwknpsucuvv
```

**Or in the dashboard:** Edge Functions → **Deploy a new function → Via
editor**, name it exactly as above, paste the file's whole content, deploy.
For `forward-email` (already there) open it → **Code**, replace the content,
deploy; keep **Enforce JWT verification** off for it (Resend has no Supabase
token). Leave it on for the other three.

If the admin panel says an email or reply "couldn't be sent" and the
function's **Logs** show `401 Invalid JWT` from the gateway (projects on the
new JWT signing keys), redeploy those three with `--no-verify-jwt` (or turn
the switch off): each function checks the admin's token itself, through
Supabase Auth and the database, so this is safe.

All four answer only `https://admin.nriclub.app` (CORS); the Content-Security
-Policy already allows `https://uzzkdmybsbwknpsucuvv.supabase.co`, which
includes `/functions/v1/`.

## 4. Site

Merge the branch; Vercel builds and deploys it. The build reads the What's
on events added in the admin panel (with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`, already set in Vercel) into the prerendered pages;
if it can't, it uses the list in the code and carries on. Events added later
show in the browser straight away; redeploy now and then so link previews
have them too.

## 5. Test

1. **Page not found:** open `https://nriclub.app/no-such-page`: "Page not
   found", and in the browser's developer tools (Network) the status 404.
   Check that `/find`, `/groups`, `/events`, `/messages`, `/profile`,
   `/mentors`, `/city/berlin`, `/guides`, `/whats-on`, `/privacy` and
   `/report` still open as before, and that admin.nriclub.app opens.
2. **What's on:** admin.nriclub.app → **What's on → Add event**, with a date
   in the coming weeks. Open nriclub.app/whats-on in a private window: the
   event is listed. Hide it: it disappears (reload). Delete it.
3. **Decision email:** sign up a test account with an address you can read,
   send its details, then in **Verification** ask it for more info. About 7
   seconds later (after the Undo has gone) the email arrives with your message.
   Approve it: a second email. Undo within 6 seconds sends nothing.
   Supabase → Edge Functions → member-email → **Logs** shows any problem.
4. **Delete an unfinished sign-up:** sign up another test account and stop
   before sending its details. **Verification → Incomplete** → open it →
   **Delete account…** → confirm. It disappears; Supabase → Authentication →
   Users no longer has it. Approved, waiting, declined and blocked accounts
   have no such button, and the server refuses them anyway.
5. **Inbox:** send an email to hello@nriclub.app from another address. Within
   a minute it is in **Inbox** (bold, counted in the nav), and in Gmail if
   `FORWARD_TO` is set. Open it, write a reply, **Send reply**: it arrives
   from hello@nriclub.app in the same thread and shows under the message.
   Archive it.
6. **Emails this month:** the box at the top of the Inbox shows Resend's
   count of the month (and of today on the free plan) after the first email
   that went out after the update. Limits are `EMAIL_LIMITS` in
   `src/admin/InboxView.jsx` (3,000 a month, 100 a day: the free plan).

## What the database update adds

- `public.admin_member_email`, `private.member_email_log` (30 days)
- `public.admin_check_signup_delete`, `public.admin_record_signup_delete`
  (service role), `private.is_unfinished_signup`; `private.moderation_action`
  accepts `delete_signup`
- `public.whats_on_events` and `admin_whats_on_events`,
  `admin_save_whats_on_event`, `admin_hide_whats_on_event`,
  `admin_delete_whats_on_event`
- `private.inbox_messages`, `private.inbox_replies`, `public.inbox_store` and
  `public.inbox_record_reply` (service role), `admin_inbox_list`,
  `admin_inbox_get`, `admin_inbox_set`, `admin_inbox_reply_prepare`
- `public.resend_quota_store` (service role), `public.admin_resend_quota`
- `private.daily_cleanup`: as before, plus the Inbox after 12 months and the
  decision-email log after 30 days

The Privacy Policy (version 2026-10-25) already describes all of this; set
`PRIVACY_DATE` in `src/content/legal/privacy.js` to the day it goes live if
that isn't 25 October 2026.
