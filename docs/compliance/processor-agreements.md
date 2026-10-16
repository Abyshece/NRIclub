# Processor agreements checklist (Art. 28 GDPR)

*Auftragsverarbeitungsverträge (AVV).* Every company that processes members'
data for NRIClub needs a data processing agreement (DPA) with NRIClub. File
each signed or accepted DPA (PDF, with the date) together with this list,
and note the transfer safeguard in `records-of-processing.md` and, if it
changes, in the Privacy Policy (section 7, `src/content/legal/privacy.js`).

Menu names below were right as of October 2026; providers move them.

## Supabase (database, sign-in, photo storage, live updates)

- [ ] DPA: Supabase dashboard → your organisation → Settings → Legal
      Documents (Data Processing Addendum). Accept or request it there and
      download the PDF. **Signed on: [fill in]**
- [ ] Transfer safeguard: check "Supabase" on dataprivacyframework.gov; if
      not listed, the standard contractual clauses in the DPA apply. **Result: [fill in]**
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
- [ ] DPA: vercel.com/legal/dpa (it may apply automatically through the
      terms of your plan; download and file the version that applies).
      **Accepted on: [fill in]**
- [ ] Transfer safeguard (US company, worldwide edge network): DPF
      certification or SCCs. **Result: [fill in]**
- [ ] Log retention for your plan: **[fill in]**, and put it in the Privacy
      Policy (section 2, "Server and security logs").
- [ ] Deployment Protection for preview and old deployments, or delete the
      deployments from before 12 October 2026 (`breach-register.md`).

## Resend (sign-in and password emails, through Amazon SES in Ireland)

- [ ] DPA: Resend dashboard → Settings (legal / DPA), or resend.com/legal.
      **Accepted on: [fill in]**
- [ ] Transfer safeguard (US company): DPF certification or SCCs.
      **Result: [fill in]**
- [ ] Domain send.nriclub.app: switch **off** open and click tracking, so
      password links aren't rewritten through Resend. **Done on: [fill in]**
- [ ] Log retention: **[fill in]**

## The hello@nriclub.app mailbox (not set up yet)

- [ ] Choose a provider with an EU data region that signs a DPA (for
      example mailbox.org, IONOS, Zoho EU, Google Workspace). Don't forward
      to a personal Gmail account: consumer Gmail has no DPA.
- [ ] DPA signed in the provider's customer area. **Signed on: [fill in]**
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
