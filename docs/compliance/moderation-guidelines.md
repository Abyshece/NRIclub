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
  date. The admin panel records decisions on content and accounts itself
  (below). Keep notes factual; members can ask to see notes about them, and
  "Download my data" gives them the record of our decisions about them
  (without who decided), their own reports, and reports about them without
  who sent them (none about a message they sent).

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

Members report with Report on the item itself: posts, comments, answers,
questions, guides and their comments, events, Market listings, places
(and the recommendations on them), mentoring reviews, profiles, and
messages they received. Anyone, member or not, can use the form at
nriclub.app/report; it gives the sender a reference code (`R-` and 8
letters or digits). Both land in the admin panel under **Reports**, and
every admin gets an in-app notice for a report from the form and for every
safety report. An email to hello@nriclub.app about content is a notice
too: handle it the same way, by hand. The form takes at most 5 reports a
day from one email address, 10 from one internet address and 100 in all;
after that it asks senders to write to hello@ instead.

The admin panel does the recording and the in-app messages; the database
(`supabase/migrations/20261021000000_moderation_dsa.sql`) refuses anything
else. Admins can no longer edit members' rows or delete content directly.

1. **Safety first.** Reports in the category "A threat to someone's life or
   safety" are marked **Safety** and listed first, with the checklist
   (`SAFETY_CHECKLIST` in `src/content/legal/reporting.js`): 110/112 for
   immediate danger; otherwise tell the police without delay, in Germany
   the Bundeskriminalamt; keep a copy of the content, the account ID and
   times first. This is a legal duty (Art. 18 DSA). Write in the report's
   **Note for our team** (admins only) whom you told, when, and their
   reference.
2. **Confirm receipt.** Members who report in the app see the receipt at
   once. For a report from the form, click **Write to the reporter:
   receipt**: your email app opens with the message filled in. Send it as
   hello@nriclub.app through Resend (`docs/EMAIL-SETUP.md`, "Emails the
   panel prepares"; never from Gmail), then click **Mark as sent**. NRIClub
   sends no email itself, so this step is by hand; the panel shows which
   reports still need it. A report without an email address (allowed only
   for reports about the sexual abuse of a child) can't be answered.
3. **Look at the content.** The panel shows what was reported. A reported
   message is shown to admins only, and only that one message. For a
   report from the form, **Look at the linked …** loads the content if the
   report has a nriclub.app link; otherwise find it from the description,
   and ask the sender for the missing details if you can't. For a complaint
   about a person's rights (e.g. a doctor's entry in Places, a photo of
   someone), you may ask the author for their side first.
4. **Decide.** Is it illegal (which law?), against the Terms (which
   section?), or neither? Then choose:
   - **Remove…** (content), **Warn author…**, or for a profile **Block…**,
     **Warn…**, **Remove photo…**, **Remove bio…**. A single recommendation
     on a place is removed from the list under the place.
   - **Dismiss…** (a member's report) or **Keep it…** (a report from the
     form): "we keep it" with the reason, or "it's already gone" (e.g. the
     member deleted it). Undo of Dismiss is possible for a few seconds. If
     you removed something after a member's report and it was also reported
     on the form, close that report with "it's already gone" (e.g. "we
     removed it after another report"), so the sender isn't told we kept it.

   Every decision asks for the ground (illegal or against our Terms), the
   law or rule, and the facts in one sentence that finishes "…because …"
   (e.g. "it calls another member an idiot"). The dialog shows the
   statement the member will read. You can't act on your own account or
   content, or on another admin's.
5. **What the database then does:** it records the decision
   (`private.moderation_action`: who decided, what, the rule, the facts,
   whether a report led to it, a copy of what was removed), sends the member
   concerned the statement of reasons in NRIClub (Art. 17 DSA), closes every
   open report about the same item and tells each member who reported it
   the outcome in NRIClub (Art. 16(5) DSA).
6. **Tell the sender of a report from the form** the decision: click
   **Write to the reporter: decision** (filled in from what you decided),
   send it from hello@nriclub.app, then **Mark as sent**. This is the
   second step by hand.
7. **Photos:** removing a post, listing, event or profile photo removes it
   from NRIClub, but not the photo file in Storage. Those files go with the
   weekly routine in `deletion-routine.md` (or the clean-up job, once it
   runs).
8. **Evidence copies:** the record keeps a copy of removed content for 6
   months by itself: its text, and of a photo only the file's name (the
   file itself is deleted, step 7). If you need a photo as evidence, save
   it before you remove it. Keep any other copy (e.g. a screenshot, with the
   account and time) only where you need it as evidence, store it with the
   note on that report, and delete it when the report is deleted
   (`deletion-routine.md`), or when a police matter or legal dispute about
   it is over. If a report or a report from the form is part of an open
   legal dispute or police matter, mark it in the SQL Editor so the
   clean-up keeps it: `INSERT INTO private.report_hold (report_id, reason)
   ...` for a member's report, `UPDATE private.notices SET hold_reason =
   '...' WHERE reference = 'R-...'` for one from the form. The Privacy
   Policy (sections 2 and 9) tells members so.

Aim to decide within a few days, and on safety reports within hours.

**Before the database update of 21 October 2026 is in**, the panel says so
at the top of Reports: decisions aren't recorded and members aren't told in
the app. Then send the statement of reasons (`statementOfReasons()` in
`reporting.js`) and the outcome to the reporter (`reporterOutcome()`) by
email from hello@, and keep a simple moderation log next to this file
(date, item, decision, rule, reporter told, author told). Warnings and
reports from the form need the update.

## Blocks

- **Not urgent:** first warn (**Warn…** in Members, in a member's panel or
  on a report). The member gets the warning in NRIClub with 14 days to
  reply. Read the reply (it comes to hello@), then decide. The panel only
  blocks once the last warning is at least 14 days old.
- **Urgent** (threats, violence, fraud, clearly illegal content, danger to
  someone): **Block…** and choose that serious reason; the statement of
  reasons goes out at the same time. The reason is recorded.
- The blocked member sees the reason (the rule and the facts) when they
  sign in, with how to challenge it. They can still download their data and
  delete their account.
- Blocking a mentor cancels their upcoming sessions and tells the members
  who booked; so does declining an approved mentor's membership. The panel
  says how many sessions before you confirm. Undo of a block is offered only
  if no sessions, open mentoring times or ambassador role were lost with it
  (a block ends the ambassador role; make them ambassador again by hand).
- **Unblock account** in Members tells the member in NRIClub.
- **Ending a membership** (instead of a block) needs an important reason
  (§ 314 BGB), normally after a warning. Otherwise use 4 weeks' notice
  (Terms, section 12). Tell the member by email (a notice only in the app
  may never reach them), block the account, and note in the block's facts
  that the membership ended. The account is deleted 6 months after the
  decision unless the member deletes it first (`deletion-routine.md`,
  step 3).

## Communities and ambassadors

Approving, declining (with an optional reason) and deleting a community
(with a reason) tell the member who asked for it, and are recorded, as are
changes to who is a city's ambassador. Undo of an approval works only while
nobody has joined or posted. Deleting a community removes its members from
it; its posts stay in the feed, without the community.

City ambassadors are volunteers. Before they use the ambassador panel they
accept the ambassador agreement (unpaid; they act for NRIClub only in the
panel's tasks; members' data they see there stays confidential and is used
only on NRIClub; they follow these guidelines; they never remove or judge
content themselves; we can end the role and they can step down at any
time). In the panel they welcome newcomers, change their city group's
description and starter post, mark their own meetups "Hosted by the city
ambassador" and flag things in their city to us. They can't remove, hide
or block anything.

- **Flags from ambassadors** are reports like any other: decide them as
  above, on the facts, not because an ambassador sent them. Reports shows
  them first after safety reports, labelled "From the ambassador of
  <city>", and every admin gets an in-app notice.
- **Ambassadors** (admin panel → Ambassadors) shows each ambassador, the
  agreement they accepted and what they did (the description before and
  after, pins, meetups, flags, stepping down). If an ambassador misuses the
  role, end it under Members (`admin_set_ambassador` with no city), and
  warn or block as for any member if the Terms were broken. An ambassador
  who steps down loses the role at once; every admin is told.
- The guidelines ambassadors see in the panel are in
  `src/content/ambassador.js`; keep them in step with this section.

## Appeals

A member may ask within 6 months to have a decision looked at again. A
person looks at it again, if possible not the same admin, and answers with
the result and the reasons. If you got it wrong: unblock (Members), or for
removed content tell the member they can post it again (the record keeps a
copy of it for 6 months, `private.moderation_action.snapshot`, if they need
the text), and say so.

## Requests about personal data (Art. 12 to 22 GDPR)

Answer within **one month** of receipt (Art. 12(3)); for a complex request
up to two more months, but tell the person within the first month and say
why. Log each request: date received, who, what, deadline, date answered.

- **Check who is asking:** answer from the address the account uses, or ask
  them to write from it. Don't send data to another address.
- **Access (Art. 15):** point them to Settings → Download my data, and send
  what isn't in that file: admin notes about them (`verification_log.admin_note`),
  the record of declined and blocked accounts if one exists, reports about
  them (without the reporter's identity, Art. 15(4)). Never reports about a
  message they sent: only the member they wrote to can report one, so it
  would say who did (the file leaves those out too). Also the purposes,
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
