// The separate, explicit consent for information that can show a member's
// ethnic origin, religion or health (Art. 9(2)(a) GDPR). Members give it with
// its own checkbox, never ticked in advance: at signup, and once on the
// Terms screen for members who joined before it existed. The Privacy Policy
// (section 3) quotes the same words, so use this text for the checkbox
// rather than writing another one.
//
// It names every purpose the information is used for (the membership check
// and showing it to members), that NRIClub can't be used without it, and
// how to withdraw it, so the consent is specific and informed (Art. 4(11),
// 7(3) GDPR). If the words change in substance, give them a new
// ART9_CONSENT_VERSION, and change private.current_art9_version() to match
// in a new migration, so the database record shows which wording a member
// agreed to.
//
// Legal review (October 2026): the lawyer's wording, adopted before any
// consent was recorded (docs/compliance/questions-for-the-lawyer.md).
export const ART9_CONSENT_VERSION = "2026-10-19";

export const ART9_CONSENT_TEXT =
  "I agree that NRIClub processes what I share that can show my ethnic origin, religion or health "
  + "(for example that I belong to the Indian community, my hometown, the language or faith groups I join, "
  + "places I recommend and questions I ask) to run my membership: for our team's membership check, "
  + "and so other members can see it as described in the Privacy Policy. "
  + "NRIClub can't be used without this consent. I can withdraw it at any time for the future, "
  + "by deleting the content or my account or by writing to hello@nriclub.app; "
  + "withdrawing it completely ends my membership.";

// How to withdraw it, for where the app shows a member the consent they
// gave (Settings → Your consent), under ART9_CONSENT_TEXT.
export const ART9_WITHDRAW_TEXT =
  "You can withdraw it at any time, for the future: delete the content in question (for example leave a group "
  + "or delete a question), or delete your account under Account Settings. You can also write to hello@nriclub.app; "
  + "as NRIClub can't be used without this consent, we then close your account after you've had the chance to "
  + "download your data.";
