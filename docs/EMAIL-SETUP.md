# hello@nriclub.app: receive in the admin Inbox, reply from the panel

Mail to `hello@nriclub.app` is received by **Resend**. The Edge Function
`forward-email` (`supabase/functions/forward-email/index.ts`, deployed
without JWT checks; it checks Resend's webhook signature instead) keeps each
email in the admin panel's **Inbox** (from the 2026-10-25 update, see
`docs/DEPLOY-ROUND3.md`). Replies go out from the admin panel (Edge Function
`admin-inbox-reply`), as `hello@nriclub.app`.

Since 26 October 2026 nothing is forwarded to Gmail: a private Gmail
account has no data processing agreement (Art. 28 GDPR). The function keeps
its old name because Resend's webhook calls it by that address.

## 1. Domain and receiving in Resend

1. Resend → **Domains → Add domain** → `nriclub.app`, region **EU (Ireland)**.
2. Vercel → Domains → nriclub.app → **DNS Records**: add the DKIM (TXT) and
   SPF records Resend shows.
3. Resend → the domain → switch on **Receiving**; add the **MX** record it
   shows in Vercel: name `@`, the value exactly as shown, priority `10`.
4. Vercel: TXT `_dmarc` → `v=DMARC1; p=quarantine; rua=mailto:hello@nriclub.app`.
5. Resend: **Verify**, until the domain and receiving are both *Verified*.

## 2. Into the admin Inbox

1. Resend → **API Keys → Create** → name `forward-email`, permission
   **Full access** (it must read received emails). Copy the key.
2. Resend → **Webhooks → Add webhook**:
   - URL: `https://uzzkdmybsbwknpsucuvv.supabase.co/functions/v1/forward-email`
   - Event: **email.received** only.
   - Save, open it and copy the **Signing secret** (`whsec_…`).
3. Supabase → **Edge Functions → Secrets** (Project Settings → Edge
   Functions), add:
   - `RESEND_API_KEY` = the key from step 1
   - `RESEND_WEBHOOK_SECRET` = the signing secret from step 2

   `FORWARD_TO` and `FORWARD_FROM` aren't used any more: if they are there,
   delete them.
4. Test: from another address, send an email to `hello@nriclub.app`. Within
   a minute it is in the admin panel's **Inbox**. If not: Supabase → Edge
   Functions → forward-email → **Logs**, and Resend → Webhooks → the
   webhook's deliveries. If storing fails, the function answers with an
   error, Resend tries again later, and the email stays in Resend under
   **Emails → Receiving** meanwhile.

The admin Inbox keeps each email (its text; attachments only by name and
size, the files stay in Resend) and our replies from the panel for 12
months after it arrived, then the daily clean-up deletes them. The Inbox
also shows "Emails this month" from Resend's own counter: sign-in codes
count too, and the free plan allows 3,000 a month and 100 a day.

## 3. Replying

Open the email in the admin panel's **Inbox**, write the reply and press
**Send reply**. It goes out from `hello@nriclub.app` through Resend and is
kept with the email. Don't answer from a private mailbox.

### Emails the panel prepares

A few emails aren't replies to an Inbox email: the receipt and the decision
for a report sent with the form at nriclub.app/report (Reports), and the
answer to an application to be a city ambassador (Ambassadors). The panel
opens them, filled in, in your computer's mail app. Send them as
`hello@nriclub.app` through Resend, not from Gmail:

1. Resend → **API Keys → Create** → name `mail-app`, permission **Sending
   access**, domain `nriclub.app`. Copy the key. (Delete the old
   `gmail-smtp` key if there is one: Gmail doesn't send for NRIClub any
   more.)
2. In a mail app on your own computer (for example Thunderbird), add an
   account with only the outgoing server: name `NRIClub`, address
   `hello@nriclub.app`, SMTP server `smtp.resend.com`, port `465`, SSL/TLS,
   username `resend`, password = the key from step 1. No incoming server:
   replies arrive in the admin Inbox.
3. Make that app your computer's default for email links, so the panel's
   "Write to the reporter" and "Reply by email" open it.

Sent copies stay in that app on your computer only. Delete them with the
same periods as the Inbox: 12 months, or 3 years for requests about rights
and DSA notices (`compliance/deletion-routine.md`).

## Data protection

The Privacy Policy (section 7) names Resend for sending and receiving mail;
received mail is kept in our database at Supabase. Resend's and Supabase's
data processing agreements are part of their terms
(`compliance/processor-agreements.md`). There is no separate mailbox
provider: `PRIVACY_DETAILS.mailProvider` in `src/content/imprint.js` is
empty, and `agreements.mailbox` is false. If NRIClub ever uses a mailbox
again (an EU provider or Google Workspace, with a data processing
agreement), fill in both and the Policy names it.
