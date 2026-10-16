// The separate, explicit consent for information that can show a member's
// ethnic origin, religion or health (Art. 9(2)(a) GDPR). Members give it with
// its own checkbox, never ticked in advance: at signup, and once on the
// Terms screen for members who joined before it existed. The Privacy Policy
// (section 4) quotes the same words, so use this text for the checkbox
// rather than writing another one.
//
// PENDING LEGAL REVIEW: the wording, and whether membership may depend on
// this consent (Art. 7(4) GDPR), are for the lawyer to confirm. If the words
// change in substance, give them a new ART9_CONSENT_VERSION so the database
// record shows which wording a member agreed to.
export const ART9_CONSENT_VERSION = "2026-10-19";

export const ART9_CONSENT_TEXT =
  "I agree that NRIClub processes what I share that can show my ethnic origin, religion or health "
  + "(for example that I belong to the Indian community, my hometown, the language or faith groups I join, "
  + "places I recommend and questions I ask) so other members can see it as described in the Privacy Policy. "
  + "I can withdraw this at any time by deleting the content or my account.";
