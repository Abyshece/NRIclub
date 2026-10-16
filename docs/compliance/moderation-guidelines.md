# Moderation guidelines for admins

How NRIClub's admins handle sign-ups, reports, notices of illegal content,
blocks, appeals and requests about personal data. The Terms of Use
(sections 5, 9 and 10) promise members exactly this, and the EU Digital
Services Act (DSA, Art. 14 to 18) and the GDPR require it. Message texts to
reuse are in `src/content/legal/reporting.js`.

## Before someone becomes an admin

- A signed confidentiality and instruction note: they process members' data
  only for moderation, only as these guidelines say, and keep it
  confidential, also after they stop (Art. 29 and 32(4) GDPR).
- Two-step verification on their email account, and two-step login for
  NRIClub (admin panel → Security: set it up with an authenticator app
  before the first moderation; once "Require two-step login for admin
  rights" is on, the admin login asks them to set it up).
- Added with `INSERT INTO public.admins ...`; removed the day they stop.
- The admin panel is only at admin.nriclub.app.

## Principles

- **A person decides.** Never act on an automatic signal alone. The only
  automatic step is the sign-up hold on a match with a declined or blocked
  account; it only means "look at this one".
- **Careful, objective, proportionate** (Art. 14(4) DSA): the mildest step
  that solves the problem. Consider the rights of everyone involved,
  including freedom of expression.
- **Equal treatment** (AGG): origin, nationality, religion, caste, sex,
  sexual identity, disability or age never decide anything. Don't mention
  them in a decision or a note.
- **Write it down:** what you decided, the rule or law, the facts, the
  date. Keep notes factual; members can ask to see notes about them.

## Sign-ups (membership check)

1. Look at the LinkedIn profile or the note, and the voucher if any.
2. **Approve** a real person with a genuine connection to the Indian
   community abroad (family, work, study, friends or interest all count).
3. If you can't tell yet: **Ask for more information**, saying what you
   need.
4. **Decline** only sign-ups that are fake, can't be checked after asking,
   are a second account, are spam, or come from someone removed before for
   a serious breach. Give the reason in the message to the member.
5. **Held for review** (matched a declined or blocked account): read the
   earlier decision and note, then decide as above. A person can change.

## Reports and notices

Members report with the flag in the app; anyone can email hello@nriclub.app
(the footer's "Report illegal content" link opens a prefilled email).

1. **Safety first.** Anything suggesting a threat to someone's life or
   safety goes to the top: follow `SAFETY_CHECKLIST` in
   `src/content/legal/reporting.js` (110/112 for immediate danger; otherwise
   tell the police without delay, in Germany the Bundeskriminalamt; keep a
   copy of the content, the account ID and times first). This is a legal
   duty (Art. 18 DSA).
2. **Confirm receipt** of an emailed notice (the mailbox's auto-reply does
   this; otherwise reply briefly).
3. **Look at the content** and decide whether it is illegal (which law?) or
   breaks the Terms (which section?), or neither. If a notice is unclear,
   ask the sender for the missing details (where, why illegal). For a
   complaint about a person's rights (e.g. a doctor's entry in Places, a
   photo of someone), you may ask the author for their side first.
4. **Act:** remove the content, warn, or (see Blocks) block. Act quickly
   once you know of illegal content: that is what keeps NRIClub from being
   liable for it (Art. 6 DSA).
5. **Tell the author** (statement of reasons, Art. 17 DSA): what you did and
   for how long, the rule or law, the facts, whether it followed a report
   or your own check, that a person decided, and how to challenge it. Use
   `statementOfReasons()` in `reporting.js`. Until the admin panel sends
   these itself, send the text by email from hello@ (the Privacy Policy
   tells members our team emails them about this); a message in NRIClub
   as well is fine.
6. **Tell the reporter** the outcome (Art. 16(5) DSA): `reporterOutcome()`.
7. **Record** the decision (until the admin panel logs it: in a simple
   moderation log next to this file, with date, item, decision, rule,
   reporter informed, author informed).
8. **Evidence copies:** keep a copy of reported content (e.g. a screenshot,
   with the account and time) only where you need it as evidence, store it
   with the moderation log entry for that report, and delete it when the
   report is deleted (`deletion-routine.md`), or when a police matter or
   legal dispute about it is over. The Privacy Policy (sections 2 and 9)
   tells members so.

Aim to decide within a few days, and on safety reports within hours.

## Blocks

- **Not urgent:** first warn with the reason and the rule and give 14 days
  to reply (`blockWarning()`). Read the reply, then decide.
- **Urgent** (threats, violence, fraud, clearly illegal content, danger to
  someone): block straight away, and send the statement of reasons at the
  same time.
- A blocked member can still download their data and delete their account.
- Blocking a mentor cancels their booked sessions and tells the mentees;
  say so in the statement of reasons.
- **Ending a membership** (instead of a block) needs an important reason
  (§ 314 BGB), normally after a warning. Otherwise use 4 weeks' notice
  (Terms, section 12). Tell the member by email (a notice only in the app
  may never reach them), block the account, and note in the moderation log
  that the membership ended. The account is deleted 6 months after the
  decision unless the member deletes it first (`deletion-routine.md`,
  step 3).

## Appeals

A member may ask within 6 months to have a decision looked at again. A
person looks at it again, if possible not the same admin, and answers with
the result and the reasons. If you got it wrong: restore the content or
unblock, and say so.

## Requests about personal data (Art. 12 to 22 GDPR)

Answer within **one month** of receipt (Art. 12(3)); for a complex request
up to two more months, but tell the person within the first month and say
why. Log each request: date received, who, what, deadline, date answered.

- **Check who is asking:** answer from the address the account uses, or ask
  them to write from it. Don't send data to another address.
- **Access (Art. 15):** point them to Settings → Download my data, and send
  what isn't in that file: admin notes about them (`verification_log.admin_note`),
  the record of declined and blocked accounts if one exists, reports about
  them (without the reporter's identity, Art. 15(4)). Also the purposes,
  recipients and retention (point to the Privacy Policy).
- **Correction (Art. 16):** they can edit their profile; change the email
  address for them if they can't.
- **Erasure (Art. 17):** they can delete their account in Settings; if they
  can't, do it for them. Tell them what stays (Privacy Policy, section 9).
- **Restriction (Art. 18) and objection (Art. 21):** weigh their reasons;
  stop the processing unless there are compelling grounds; answer with
  reasons.
- **Withdrawal of the Art. 9 consent:** explain that membership depends on
  it; close the account if they confirm, after offering the download.
- Keep the request and the answer for 3 years (proof of compliance).

## Orders from authorities (Art. 9 and 10 DSA)

An order to act against illegal content or to give information about a
member: confirm receipt to the authority without delay, carry it out, tell
the authority what you did and when, and tell the member concerned unless
the order says not to. Record it.

## Consumer disputes (§ 37 VSBG)

If a dispute with a member who is a consumer can't be settled, tell them in
writing (email is fine): "We couldn't settle this. The competent consumer
arbitration body is the Universalschlichtungsstelle des Bundes, Zentrum für
Schlichtung e.V., Straßburger Straße 8, 77694 Kehl am Rhein,
www.verbraucher-schlichter.de. We are not willing to take part in a
dispute resolution procedure before it." (Matches the Terms, section 17.)
