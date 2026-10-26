# Processor agreements checklist (Art. 28 GDPR)

*Auftragsverarbeitungsverträge (AVV).* Every company that processes members'
data for NRIClub needs a data processing agreement (DPA) with NRIClub. File
each signed or accepted DPA (PDF, with the date) together with this list,
and note the transfer safeguard in `records-of-processing.md` and, if it
changes, in the Privacy Policy (section 7, `src/content/legal/privacy.js`).

Menu names below were right as of October 2026; providers move them.

The Privacy Policy says a provider works under a data processing agreement,
and names the transfer safeguard in it, only where
`PRIVACY_DETAILS.agreements` in `src/content/imprint.js` says so. Keep that
in step with this list. Checked on the providers' websites on 16 October
2026: Supabase's and Resend's agreements are part of their terms of
service; Vercel's applies only on its Pro and Enterprise plans; all three
include the EU standard contractual clauses. Updated on 26 October 2026:
Vercel is on Pro with its DPA accepted, and there is no mailbox provider
(no Google or Gmail): mail to hello@ goes from Resend to our database.

## Supabase (database, sign-in, photo storage, live updates)

- [ ] Contracting company: Supabase Pte. Ltd., Singapore (supabase.com/terms,
      section 1(j); Supabase, Inc., USA, only if you bought through AWS
      Marketplace). Check it in your organisation's billing details.
- [x] DPA: supabase.com/legal/dpa "supplements and forms part of the
      Supabase Terms of Service", so it applies since you accepted them.
      For your files, download a signed copy: Supabase dashboard → your
      organisation → Settings → Legal Documents. **Downloaded on: [fill in]**
- [x] Transfer safeguard: the standard contractual clauses in the DPA
      (Singapore has no EU adequacy decision; the DPA doesn't rely on the
      Data Privacy Framework).
- [ ] Sub-processors: note the link to Supabase's sub-processor list and
      subscribe to changes if offered.
- [ ] Organisation settings: switch off the AI options that send schema or
      logs to an AI provider (audit: `AI_SQL_GENERATOR_OPT_IN`,
      `AI_LOG_GENERATOR_OPT_IN` were on), or list that provider as a
      sub-processor. **Done on: [fill in]**
- [ ] Region: project `uzzkdmybsbwknpsucuvv` in eu-west-1 (Ireland). Keep it.
- [ ] Plan: Pro (daily backups kept 7 days, logs about 7 days). Note any change here and in the Privacy Policy.

## Vercel (website hosting and delivery)

- [x] Plan: Pro (the Hobby plan is for non-commercial use only). Keep it on
      Pro: on Hobby there is no DPA.
- [x] DPA: vercel.com/legal/dpa applies "for Customers who are on
      Enterprise and Pro plans"; accepted (as the owner states, 26 October
      2026), and `vercel: true` in `PRIVACY_DETAILS.agreements`. Download
      it for your files. **Downloaded on: [fill in]**
- [x] Transfer safeguard (Vercel Inc., USA, worldwide edge network): the
      standard contractual clauses in the DPA (2021 SCCs); the Privacy
      Policy names them.
- [x] Log retention on Pro: 1 day (Vercel's docs, October 2026; longer only
      with Observability Plus), in `PRIVACY_DETAILS.vercelLogRetention`.
- [ ] Deployment Protection for preview and old deployments, or delete the
      deployments from before 12 October 2026 (`breach-register.md`).

## Resend (sending emails through Amazon SES in Ireland; receiving hello@ mail)

- [x] Company: Plus Five Five, Inc. (Resend), 2261 Market Street #5039,
      San Francisco, USA (resend.com/legal/dpa).
- [x] DPA: resend.com/legal/dpa "shall become legally binding upon Customer
      entering into the Agreement", so it applies since you accepted
      Resend's terms. Download it for your files. **Downloaded on: [fill in]**
- [x] Transfer safeguard: the EU standard contractual clauses in the DPA;
      Resend also states it complies with the EU-US Data Privacy Framework
      (check "Plus Five Five" on dataprivacyframework.gov if you want to
      name it too). **Checked on: [fill in]**
- [ ] Domain send.nriclub.app: switch **off** open and click tracking, so
      password links aren't rewritten through Resend. **Done on: [fill in]**
- [x] Retention: Resend keeps each email (address, subject, content) and its
      delivery status for 30 days on every self-serve plan (resend.com/pricing,
      October 2026); the Privacy Policy says so.
- [x] Receiving: Resend receives the mail to hello@nriclub.app (MX of
      nriclub.app) and calls the Edge Function `forward-email`, which keeps
      it in our database (the admin panel's Inbox). The same DPA covers it.
- [ ] How long Resend keeps received emails and their attachments
      (Emails → Receiving): check Resend's documentation and note it here.
      If it is longer than the Inbox's 12 months, delete them in Resend
      by hand. **[fill in]**

## No mailbox provider (since 26 October 2026)

Mail to hello@nriclub.app goes from Resend to our database only (the admin
panel's Inbox, `docs/EMAIL-SETUP.md`). There is no Google, Gmail or other
mailbox provider: until 26 October 2026 a copy went to the founder's
personal Gmail, which has no DPA. That forwarding is gone from the code.

- [ ] Delete the `FORWARD_TO` (and `FORWARD_FROM`) secret in Supabase →
      Edge Functions → Secrets. **Done on: [fill in]**
- [ ] In Gmail, remove "Send mail as hello@nriclub.app" (Settings →
      Accounts and Import), and delete the forwarded copies (search
      `subject:[hello@]`), also from Bin. **Done on: [fill in]**
- [ ] Emails the admin panel prepares go from a mail app on your computer
      through Resend's SMTP server, not through Gmail (`docs/EMAIL-SETUP.md`,
      "Emails the panel prepares").
- [x] `PRIVACY_DETAILS.mailProvider` is empty and `mailbox: false`: the
      Privacy Policy has no mailbox entry and names Resend and Supabase.
- [ ] Auto-reply confirming receipt (text: `REPORT_AUTO_REPLY` in
      `src/content/legal/reporting.js`; it also confirms DSA notices,
      Art. 16(4) DSA): not possible without a mailbox. The report form at
      nriclub.app/report gives a reference code at once; for notices by
      email, send the receipt from the Inbox.

If NRIClub uses a mailbox again, choose an EU provider (or Google
Workspace) that signs a DPA, put its name in `PRIVACY_DETAILS.mailProvider`,
set `mailbox: true`, and add it to this list and `records-of-processing.md`.

## Not processors for member data (no DPA needed), but secure them

- GitHub (code only; the repository must never contain member data or
  secrets), the domain registrar, the owner's own email account (which
  must not hold NRIClub mail): turn on two-step verification for each.
- AI tools: only with access to production data under commercial terms
  that include a DPA, and avoid querying personal data.

## Review

Check this list once a year and whenever a provider is added or changed.
**Last checked: [fill in]**
