# Compliance documents

Records NRIClub's operator must keep under the GDPR and the EU Digital
Services Act, prefilled on 16 October 2026 from the code and the October
2026 audit. They are working documents: fill in the **[fill in]** fields,
date them when you check them, and keep them current.

| File | What it is | Needs from you |
|---|---|---|
| `records-of-processing.md` | Record of processing activities (Art. 30 GDPR, Verzeichnis von Verarbeitungstätigkeiten) | Check it, sign and date |
| `toms.md` | Technical and organisational measures (Art. 32) | Tick the open items as they're done; test a backup restore |
| `breach-runbook.md` | What to do in a data breach (Art. 33, 34); the authority is BayLDA | Check the link to BayLDA's online form once |
| `breach-register.md` | Every breach with facts and decisions (Art. 33(5)); No. 1 is the exposure before 12 October 2026 | Numbers and dates; the notification decision with the lawyer |
| `dpia-threshold-check.md` | Whether a data protection impact assessment and a DPO are needed (Art. 35, § 38 BDSG) | The decision with the lawyer |
| `processor-agreements.md` | Data processing agreements with Supabase, Vercel and Resend (Art. 28); no mailbox provider since 26 October 2026 | File the PDFs, fix provider settings, delete the Gmail copies |
| `moderation-guidelines.md` | How admins handle sign-ups, reports, blocks, appeals and data requests (DSA Art. 14-18, GDPR Art. 12-22) | Read before moderating; give to every new admin |
| `deletion-routine.md` | Retention and deletion: the nightly clean-up jobs that keep the Privacy Policy's periods, what is still by hand, how photo files are deleted, and deleting an account on request | Check the jobs and do the manual part once a month; open the admin panel at least once a week (it deletes unused photo files by itself) |
| `uk-pause.md` | Why NRIClub doesn't target the UK since 26 October 2026, what the site leaves out, and what to do before targeting it again | Appoint a UK representative before lifting the pause |
| `lawyer-questions.md` | The questions sent to the lawyer for the first review (October 2026) | Nothing: kept as the record of what was asked |
| `questions-for-the-lawyer.md` | The lawyer's advice from that review, and what is still open | Act on the advice; take the open points to the next review |

Where the public texts are:

- Terms of Use: `src/content/legal/terms.js` → nriclub.app/terms
- Privacy Policy: `src/content/legal/privacy.js` → nriclub.app/privacy
- The Art. 9 consent wording: `src/content/legal/consent.js`
- Reporting and moderation messages: `src/content/legal/reporting.js`
- Impressum and the details the texts take from it: `src/content/imprint.js`
