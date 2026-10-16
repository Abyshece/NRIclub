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
include the EU standard contractual clauses.

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

- [ ] Plan: the Hobby plan is for non-commercial use only. Move the project
      to Pro if NRIClub is run on a business basis. **Plan: [fill in]**
- [ ] DPA: vercel.com/legal/dpa says it applies "for Customers who are on
      Enterprise and Pro plans". On Hobby there is no DPA, and the Privacy
      Policy doesn't claim one. Once on Pro: download the DPA, file it, and
      set `vercel: true` in `PRIVACY_DETAILS.agreements`. **Done on: [fill in]**
- [ ] Transfer safeguard (Vercel Inc., USA, worldwide edge network): the
      standard contractual clauses in the DPA (2021 SCCs). **Checked on: [fill in]**
- [ ] Log retention for your plan (Vercel's docs, October 2026: 1 hour on
      Hobby, 1 day on Pro, longer only with Observability Plus): put it in
      `PRIVACY_DETAILS.vercelLogRetention`. **[fill in]**
- [ ] Deployment Protection for preview and old deployments, or delete the
      deployments from before 12 October 2026 (`breach-register.md`).

## Resend (sign-in and password emails, through Amazon SES in Ireland)

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

## The hello@nriclub.app mailbox (not set up yet)

- [ ] Choose a provider with an EU data region that signs a DPA (for
      example mailbox.org, IONOS, Zoho EU, Google Workspace). Don't forward
      to a personal Gmail account: consumer Gmail has no DPA.
- [ ] DPA signed in the provider's customer area, and `mailbox: true` in
      `PRIVACY_DETAILS.agreements`. **Signed on: [fill in]**
- [ ] Put the provider's name and country in `PRIVACY_DETAILS.mailProvider`
      in `src/content/imprint.js` and deploy: the Privacy Policy names it.
- [ ] DNS (Vercel): the provider's MX records, SPF
      (`v=spf1 include:<provider> ~all`, later `-all`), DKIM, and
      `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:hello@nriclub.app` for one
      or two weeks, then `p=quarantine`, then `p=reject`. Leave the
      send.nriclub.app records for Resend as they are.
- [ ] Auto-reply confirming receipt (text: `REPORT_AUTO_REPLY` in
      `src/content/legal/reporting.js`); it also confirms DSA notices
      (Art. 16(4) DSA).
- [ ] Set hello@nriclub.app as the reply-to address in the Supabase Auth
      email templates and in Resend.

## Not processors for member data (no DPA needed), but secure them

- GitHub (code only; the repository must never contain member data or
  secrets), the domain registrar, the founder's own email account: turn on
  two-step verification for each.
- AI tools: only with access to production data under commercial terms
  that include a DPA, and avoid querying personal data.

## Review

Check this list once a year and whenever a provider is added or changed.
**Last checked: [fill in]**
