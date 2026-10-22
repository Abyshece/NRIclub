# hello@nriclub.app: receive in Gmail, reply as hello@

Mail to `hello@nriclub.app` is received by **Resend**. The Edge Function
`forward-email` (`supabase/functions/forward-email/index.ts`, deployed
without JWT checks; it checks Resend's webhook signature instead) keeps each
email in the admin panel's **Inbox** (from the 2026-10-25 update, see
`docs/DEPLOY-ROUND3.md`) and forwards a copy to the founder's Gmail if
`FORWARD_TO` is set. Replies go out from the admin panel (Edge Function
`admin-inbox-reply`), or from Gmail as `hello@nriclub.app` through Resend's
SMTP server (section 3).

## 1. Domain and receiving in Resend

1. Resend → **Domains → Add domain** → `nriclub.app`, region **EU (Ireland)**.
2. Vercel → Domains → nriclub.app → **DNS Records**: add the DKIM (TXT) and
   SPF records Resend shows.
3. Resend → the domain → switch on **Receiving**; add the **MX** record it
   shows in Vercel: name `@`, the value exactly as shown, priority `10`.
4. Vercel: TXT `_dmarc` → `v=DMARC1; p=quarantine; rua=mailto:hello@nriclub.app`.
5. Resend: **Verify**, until the domain and receiving are both *Verified*.

## 2. Forwarding to Gmail

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
   - `FORWARD_TO` = the Gmail address the copies go to (optional since the
     admin Inbox: without it, mail is kept in the admin panel only)
4. Test: from another address, send an email to `hello@nriclub.app`. Within
   a minute it arrives in Gmail with the subject starting `[hello@]`, and,
   after the 2026-10-25 update, in the admin panel's **Inbox**.
   If not: Supabase → Edge Functions → forward-email → **Logs**, and
   Resend → Webhooks → the webhook's deliveries.

The admin Inbox keeps each email (its text; attachments only by name and
size) and our replies from the panel for 12 months after it arrived, then
the daily clean-up deletes them. Storing and forwarding work independently:
if one fails, the other still happens. The Inbox also shows "Emails this
month" from Resend's own counter: sign-in codes count too, and the free plan
allows 3,000 a month and 100 a day.

## 3. Replying as hello@nriclub.app from Gmail

1. Resend → **API Keys → Create** → name `gmail-smtp`, permission
   **Sending access**, domain `nriclub.app`. Copy the key.
2. Gmail (on a computer) → ⚙ → **See all settings → Accounts and Import →
   Send mail as → Add another email address**:
   - Name `NRIClub`, address `hello@nriclub.app`, untick "Treat as an alias".
   - SMTP server `smtp.resend.com`, port `465`, username `resend`,
     password = the key from step 1, **Secured connection using SSL**.
   - Gmail sends a confirmation email to hello@nriclub.app: it is forwarded
     to Gmail; click the link in it.
3. In the same settings, choose **"Reply from the same address the message
   was sent to"**. Forwarded emails have the sender as Reply-To, so
   pressing Reply answers the sender; check the From line shows
   `hello@nriclub.app` before sending.

## Data protection

The Privacy Policy (section 7, "Our mailbox") names Resend and Google.
Resend's data processing agreement is part of its terms. A private Gmail
account has no data processing agreement; once NRIClub has a company,
move the inbox to Google Workspace (which has one) or an EU mailbox
provider and update `PRIVACY_DETAILS.mailProvider` in `src/content/imprint.js`.
