// The separate, explicit consent for information that can show a member's
// ethnic origin, religion or health (Art. 9(2)(a) GDPR). Members give it with
// its own checkbox, never ticked in advance: at signup, and on the Terms
// screen for members who joined before it existed or consented to an
// earlier wording. The Privacy Policy (section 3) quotes the same words, so
// use this text for the checkbox rather than writing another one.
//
// It names every purpose the information is used for (the membership check,
// showing it to members, and the previews the member chooses to turn on),
// that NRIClub can't be used without it, and how to withdraw it, so the
// consent is specific and informed (Art. 4(11), 7(3) GDPR). If the words
// change in substance, give them a new ART9_CONSENT_VERSION, and change
// private.current_art9_version() to match in a new migration, so the
// database record shows which wording a member agreed to.
//
// Legal review (October 2026): the lawyer's wording, adopted before any
// consent was recorded (docs/compliance/questions-for-the-lawyer.md).
// 2026-10-26: the examples name city groups only (the language, faith and
// other groups are gone), and the purposes include the previews a member
// chooses to turn on. Members who consented to 2026-10-19 are asked for the
// new wording with the Terms 2026-10-26; their earlier consent still counts
// until then (whether that is enough is question L-1 for the lawyer).
export const ART9_CONSENT_VERSION = "2026-10-26";

export const ART9_CONSENT_TEXT =
  "I agree that NRIClub processes what I share that can show my ethnic origin, religion or health "
  + "(for example that I belong to the Indian community, my hometown, the city group I join, "
  + "places I recommend and questions I ask) to run my membership: for our team's membership check, "
  + "so other members can see it as described in the Privacy Policy, "
  + "and in the previews I choose to turn on for people who aren't members. "
  + "NRIClub can't be used without this consent. I can withdraw it at any time for the future, "
  + "by deleting the content or my account or by writing to hello@nriclub.app; "
  + "withdrawing it completely ends my membership.";

// Every wording, by version, so Settings → Your consent quotes the one the
// member agreed to (profile_private.art9_consent_version). Don't change the
// earlier ones.
export const ART9_CONSENT_TEXT_BY_VERSION = {
  "2026-10-19": "I agree that NRIClub processes what I share that can show my ethnic origin, religion or health "
    + "(for example that I belong to the Indian community, my hometown, the language or faith groups I join, "
    + "places I recommend and questions I ask) to run my membership: for our team's membership check, "
    + "and so other members can see it as described in the Privacy Policy. "
    + "NRIClub can't be used without this consent. I can withdraw it at any time for the future, "
    + "by deleting the content or my account or by writing to hello@nriclub.app; "
    + "withdrawing it completely ends my membership.",
  [ART9_CONSENT_VERSION]: ART9_CONSENT_TEXT,
};

// On the Terms screen, for a member who consented to an earlier wording:
// what changed in it, in a sentence.
export const ART9_CHANGES = "The consent below has new wording: its examples name city groups only, and it now also covers the previews you choose to show to people who aren't members.";

// How to withdraw it, for where the app shows a member the consent they
// gave (Settings → Your consent), under ART9_CONSENT_TEXT.
export const ART9_WITHDRAW_TEXT =
  "You can withdraw it at any time, for the future: delete the content in question (for example delete a question, "
  + "turn off a preview or leave your city group), or delete your account under Account Settings. You can also write "
  + "to hello@nriclub.app; as NRIClub can't be used without this consent, we then close your account after you've had "
  + "the chance to download your data.";
