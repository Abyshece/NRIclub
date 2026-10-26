# Data breach runbook (Art. 33 and 34 GDPR)

What to do when personal data may have been exposed, changed, lost or
destroyed without permission: for example a leaked password or key, a
database rule that let the wrong people read data, a lost laptop with an
export, a mistaken email to many members, or a provider telling us about an
incident.

**Who decides:** the owner, who runs NRIClub personally (the controller). Get the lawyer's view when
there is any doubt about notifying, but don't let that stop the 72-hour
clock.

**The clock:** 72 hours from the moment we become aware of a breach (we are
reasonably certain that it happened), weekends included. Notify late rather
than never, and give the reasons for the delay.

## 1. Contain (first hour)

- Stop the cause: change passwords or keys (Supabase: Project Settings →
  API → roll the key; Auth → users → sign out), fix or tighten the database
  rule, take a page offline (Vercel: roll back to an earlier deployment),
  revoke access of a person who shouldn't have it (`DELETE FROM
  public.admins ...`).
- Keep evidence: export the relevant Supabase logs at once (API, Auth and
  database logs only go back about 7 days), take screenshots, note times.
- Don't delete data that shows what happened.

## 2. Assess (within 24 hours)

Write down in `breach-register.md`, as far as known:

- what happened, when it started, when it ended, when we noticed;
- which data (categories: e.g. email addresses, profiles, messages,
  verification notes; special categories such as origin, religion, health);
- whose data (roughly how many members or other people);
- whether anyone actually accessed or used it (logs);
- likely consequences for the people (phishing, embarrassment,
  discrimination, identity misuse, damage to reputation);
- what we did and still do about it.

Then rate the risk to the people concerned:

| Risk | Typical signs | Duty |
|---|---|---|
| Unlikely | Data was encrypted and the key is safe; nobody outside could reach it; trivial data | Record only (Art. 33(5)) |
| Risk | Contact data, profile data or verification notes reachable by unauthorised people | Notify the authority within 72 hours (Art. 33) and record |
| High risk | Special-category data (origin, religion, health), messages, passwords, data that enables fraud or harm, or many people | Also tell the people affected without undue delay (Art. 34) |

## 3. Notify the supervisory authority (Art. 33)

- Authority: the **Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)**,
  Promenade 18, 91522 Ansbach, Germany, www.lda.bayern.de: the authority for
  private controllers in Bavaria, where the owner lives (as in
  `PRIVACY_DETAILS.supervisoryAuthority`, `src/content/imprint.js`). Once a
  company runs NRIClub, it is the authority where the company has its seat:
  change both.
- How: BayLDA's **online form for reporting a data breach** (Art. 33 GDPR,
  "Datenpanne melden"), on its website: https://www.lda.bayern.de/de/datenpanne.html
  (check the link once and note here that it works: **[fill in: date
  checked]**). Use the form rather than email; it asks for everything
  Art. 33(3) needs and gives a reference number.
- Content (Art. 33(3)): the nature of the breach with categories and
  approximate numbers of people and records; the contact (hello@nriclub.app);
  the likely consequences; the measures taken or planned. If not everything
  is known yet, notify what is known and add the rest later (Art. 33(4)).
- If more than 72 hours have passed: say why.
- Keep a copy of what you sent and the reference number in the register.

## 4. Tell the members affected (Art. 34)

Only if the risk is high, unless the data was unreadable (encrypted) or the
risk has been removed. In clear language, by email from hello@ or in the
app, to each person affected (a public notice only if individual messages
would take disproportionate effort). Template:

> Subject: Important: a security problem at NRIClub affected your data
>
> Hello [name],
>
> On [date] we found that [what happened, in one or two sentences]. This
> affected [which of your data]. [What we know about whether anyone used
> it.]
>
> What this can mean for you: [likely consequences, e.g. emails pretending
> to be from NRIClub].
>
> What we have done: [measures].
>
> What you can do: [e.g. change your password if you use it elsewhere; be
> careful with emails asking for codes or payments; we never ask for your
> password].
>
> If you have questions, write to hello@nriclub.app. You can also complain
> to a data protection authority.
>
> [Name], NRIClub

## 5. Processors

Supabase, Vercel and Resend must tell us without undue
delay about a breach on their side (Art. 33(2), in their DPAs). Their
notice starts our own 72 hours once we know that our data is affected.

## 6. Afterwards

- Fix the cause for good and note it in the register.
- Update `toms.md` if a measure changed.
- Check whether the Privacy Policy still describes things correctly.
