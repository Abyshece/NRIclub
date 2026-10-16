# Questions for the lawyer

*First review done in October 2026. The lawyer's advice, what changed and
what is still open are in `questions-for-the-lawyer.md`; this file stays as
the record of what was asked.*

For a German lawyer specialised in IT and data protection law (IT-Recht /
Datenschutzrecht), before NRIClub invites the public. Send with this list:
the Terms of Use (nriclub.app/terms, `src/content/legal/terms.js`), the
Privacy Policy (nriclub.app/privacy, `src/content/legal/privacy.js`), the
signup and Terms screens (or screenshots), and the documents in this folder.

Software can't settle these points; each answer may change a text, a
setting or code. After the review, publish the changed Terms as a new
version (see `LAUNCH-GUIDE.md`, "Legal texts").

## Data protection (GDPR, BDSG, TDDDG)

1. **Art. 9 consent.** Membership of a network for Indians abroad and much
   of what members share can reveal ethnic origin, religion or health. We
   ask a separate, unticked explicit consent (Art. 9(2)(a)) at signup and
   once from existing members (text: `src/content/legal/consent.js`). Is
   that the right basis, is the wording right, and does it hold under
   Art. 7(4) when membership depends on it? Is withdrawal "by deleting the
   content or the account" enough?
2. **Legal bases.** Are the bases per purpose in the Privacy Policy
   (section 2) right, in particular Art. 6(1)(c) with Art. 7(1) for keeping
   the consent and Terms records, and Art. 6(1)(f) for the membership check
   and the record of declined and blocked accounts?
3. **Record of declined and blocked accounts** (`private.moderation_record`):
   legal basis, retention period, whether the admin's note may be kept,
   and whether a keyed hash of the email address is enough.
4. **Right of access.** Must admin notes and that record be in "Download my
   data", or is "on request" enough?
5. **Retention periods.** Please confirm or change the periods the Privacy
   Policy states, and the 3 years for emails about rights requests and DSA
   notices.
6. **DPIA and DPO.** Is a DPIA required (`dpia-threshold-check.md`), and
   with it a data protection officer (§ 38(1) sentence 2 BDSG)?
7. **Supervisory authority.** Is it enough to describe the competent
   authority until the founder's address is published, or must it be named?
8. **Photos.** Photos are public files reachable by anyone with the exact
   URL (unlisted). Is the notice in the Policy and Terms enough until the
   buckets are private (Art. 25(2), 32)?
9. **Visibility defaults.** Members see each other's LinkedIn link (if
   given) and "last active" time. Acceptable by default, or opt-in only?
10. **US transfers.** Supabase, Vercel and Resend are US companies; we rely
    on the DPF or SCCs. Anything to add (e.g. a transfer impact assessment)?
11. **Breach of 2026.** `breach-register.md`, No. 1: notify the authority
    now (late), tell the members of that time, or record only?
12. **Real names.** The Terms require real names and explain why
    (members meet, rent rooms, travel together). Does that hold under
    § 19(2) TDDDG, or must we offer display names?
13. **Laws outside the EU.** Members live in the UK, India (DPDP Act 2023),
    the Gulf, North America. Anything we must do for them now?

## Contract and consumer law (BGB, EGBGB, UWG, VSBG)

14. **Withdrawal right.** Does § 312(1a) BGB apply to this free service
    (members provide data)? The Terms include withdrawal information and
    the model form to be safe. If it applies, is the confirmation in the
    signup email needed (§ 312f(2)), and is our text right?
15. **Provider's notice period.** The Terms let us end a membership with 4
    weeks' notice, or without notice for an important reason (§ 314 BGB).
    Is 4 weeks right, and do we need reasons for ordinary termination?
16. **Changes to the Terms.** New Terms apply only once accepted; until
    then the member can only sign in, download their data and delete their
    account. Is that gate acceptable (§ 307 BGB), or must members keep full
    use until we terminate with notice?
17. **Changes to the service** (§ 327r BGB): is our clause enough?
18. **Liability clause** (§ 309 No. 7, § 307 BGB): is it valid as written?
    Can we rely on the milder liability for free services?
19. **Moderation clauses** (BGH III ZR 179/20 and 192/20; Art. 14 DSA): do
    sections 5 and 10 meet the requirements (notice, reasons, hearing
    before a block, re-decision)?
20. **Consumer dispute resolution.** The Terms and the Impressum say we are
    not willing to take part (§ 36 VSBG statement given voluntarily). Keep
    it?
21. **Reviews and ratings** (§ 5b(3) UWG): are our statements on how mentor
    ratings and place recommendations come about enough?

## Platform law (DDG, MStV, DSA, AGG, RDG, StBerG)

22. **Impressum.** Does § 5 DDG apply in full now (free service, run by a
    private person with a company planned)? Who is responsible under
    § 18(2) MStV for the guides?
23. **DSA status.** Is NRIClub an online platform, and does the
    micro-enterprise exemption apply as we assume (only Art. 11, 12, 14,
    16, 17, 18 and 24(3))?
24. **Equal treatment (AGG).** Is the eligibility wording ("a genuine
    connection to the Indian community ... origin, nationality, religion
    ... never decide") compatible with §§ 19 and 2(1) No. 8 AGG? What
    should our practice for declining sign-ups be?
25. **Housing and job posts.** Is the Market rule with the exception for a
    flatmate in one's own home right (§ 19(5) AGG)?
26. **Legal and tax advice.** Mentoring and questions cover visas, tax and
    moving. Are the limits in the Terms (section 7) enough under § 6(2)
    RDG and §§ 2, 5 StBerG? Should we change topics such as "Visas &
    residence"?
27. **Final wording** of the Privacy Policy and the Terms.
