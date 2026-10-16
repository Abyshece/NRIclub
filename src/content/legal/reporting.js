// Texts for reporting content and for telling people about moderation
// decisions, under the EU Digital Services Act (DSA): Art. 16 (notices of
// illegal content: anyone can send one, we confirm receipt and tell the
// sender our decision), Art. 17 (a statement of reasons to the member whose
// content or account we restrict) and Art. 18 (threats to life or safety go
// to the police). The Terms of Use (sections 9 and 10) promise what these
// texts say; keep both in step.
//
// For the public "Report illegal content" page, the in-app report dialog,
// the admin panel's decision messages and the auto-reply of the
// hello@nriclub.app mailbox. Plain data and small functions, no React.
import { CONTACT_EMAIL } from "./doc.js";

// ---------------------------------------------------------------------------
// WHERE TO REPORT
// ---------------------------------------------------------------------------

// Until the public report page exists, "Report illegal content" links open
// an email to us with the four things Art. 16(2) DSA asks for. When the page
// is built, point REPORT_HREF at it ("/report") and every link follows.
export const REPORT_SUBJECT = "Report illegal content";
export const REPORT_EMAIL_BODY = [
  "Where is the content? (a link, or the group, member, title and date):",
  "",
  "Why do you believe it is illegal or against NRIClub's rules?",
  "",
  "Your name:",
  "",
  "I believe in good faith that the information in this report is accurate and complete.",
].join("\n");
export const REPORT_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(REPORT_SUBJECT)}&body=${encodeURIComponent(REPORT_EMAIL_BODY)}`;
export const REPORT_HREF = REPORT_MAILTO;
export const REPORT_LINK_LABEL = "Report illegal content";
// The footer link's text. While REPORT_HREF opens an email, the address is
// shown too: on a device without a mail app the link does nothing, and
// people must still be able to see where to write (Art. 12 and 16 DSA).
// When the report page exists, use REPORT_LINK_LABEL alone.
export const REPORT_LINK_TEXT = `${REPORT_LINK_LABEL}: ${CONTACT_EMAIL}`;

// ---------------------------------------------------------------------------
// THE PUBLIC REPORT PAGE (anyone, no account needed)
// ---------------------------------------------------------------------------

export const REPORT_PAGE = {
  title: "Report illegal content",
  intro: "Anyone can report content on NRIClub they believe is illegal, whether or not they are a member. A person on our team looks at every report.",
  emergency: "If someone is in immediate danger, call 112 or your local emergency number first.",
  needs: {
    title: "Please tell us",
    items: [
      "where the content is: a link, or the group, member, title and date;",
      "why you believe it is illegal: what it says or shows, and which right or law it breaks;",
      "your name and email address, so we can tell you what we decided;",
      "that your report is accurate and made in good faith.",
    ],
  },
  // Reports about child sexual abuse material may be sent without a name
  // and email address (Art. 16(2)(c) DSA).
  anonymousNote: "If your report is about the sexual abuse of a child, you don't have to give your name or email address.",
  confidentiality: "We don't tell the person you report who you are, unless the law requires it.",
  afterwards: "We confirm that we've received your report, a person on our team looks at it, and we email you our decision and how you can challenge it.",
  membersNote: "Members can also use Report on the item itself in the app.",
};

// ---------------------------------------------------------------------------
// FIELDS AND REASONS (public page and in-app dialog)
// ---------------------------------------------------------------------------

export const REPORT_FIELDS = {
  location: { label: "Where is the content?", hint: "A link, or the group, member, title and date." },
  category: { label: "What is the problem?" },
  explanation: { label: "Why?", hint: "Tell us what the content says or shows and why it is illegal or against our rules.", min: 10, max: 1000 },
  name: { label: "Your name" },
  email: { label: "Your email address", hint: "We send our decision here." },
  goodFaith: { label: "I believe in good faith that the information in this report is accurate and complete." },
  submit: "Send report",
};

// Two groups, so our team can tell illegal content from a breach of the
// house rules. Keys are stored with the report; labels are what people see.
export const REPORT_REASONS = {
  illegal: {
    label: "Illegal",
    reasons: [
      { key: "safety", label: "A threat to someone's life or safety" },
      { key: "violence", label: "Violence, or calls for violence" },
      { key: "hate", label: "Hate speech or insults" },
      { key: "defamation", label: "False claims that harm someone's reputation" },
      { key: "private_images", label: "Private or intimate images, or private information, shared without consent" },
      { key: "copyright", label: "Copyright or another right infringed" },
      { key: "fraud", label: "Fraud or a scam" },
      { key: "illegal_other", label: "Something else that is illegal" },
    ],
  },
  rules: {
    label: "Against our rules",
    reasons: [
      { key: "spam", label: "Spam or advertising" },
      { key: "harassment", label: "Harassment or bullying" },
      { key: "fake_profile", label: "Fake profile or someone pretending to be someone else" },
      { key: "market_rules", label: "Breaks the Market rules (forbidden item, business ad, discrimination)" },
      { key: "other", label: "Something else" },
    ],
  },
};

// A reason's label by its key, e.g. for the admin panel.
export const reportReasonLabel = (key) => {
  for (const group of Object.values(REPORT_REASONS)) {
    const found = group.reasons.find((r) => r.key === key);
    if (found) return `${group.label}: ${found.label}`;
  }
  return key;
};

// ---------------------------------------------------------------------------
// AFTER A REPORT
// ---------------------------------------------------------------------------

// Shown after sending, and as the mailbox's auto-reply (Art. 16(4) DSA).
export const REPORT_RECEIVED = "Thank you. We've received your report. A person on our team will look at it, and we'll tell you what we decided.";
export const REPORT_AUTO_REPLY = [
  "Thank you for writing to NRIClub. We've received your message.",
  "If you reported content you believe is illegal or against our rules, a person on our team will look at it and tell you what we decided and how you can challenge it.",
  "If someone is in immediate danger, call 112 or your local emergency number.",
].join("\n\n");

export const REDRESS_LINE = `Think we got it wrong? Write to ${CONTACT_EMAIL} within 6 months, and a person on our team will look at it again. You can also go to court.`;

// To whoever reported something (Art. 16(5) DSA).
// item: what was reported, e.g. 'the post "Room in Kreuzberg"'.
// removed: whether we removed or restricted it. reason: our reasons, in a
// sentence ("it insults another member", "we found no breach of the law or
// our rules").
export function reporterOutcome({ item, removed, reason }) {
  return `We looked at your report about ${item}: ${removed ? "we removed it" : "we didn't remove it"} because ${reason}. ${REDRESS_LINE}`;
}

// ---------------------------------------------------------------------------
// STATEMENTS OF REASONS (Art. 17 DSA) to the member concerned
// ---------------------------------------------------------------------------

// The house rules and feature rules of the Terms of Use, for the admin
// panel's "which rule" choice. The section numbers are those of the Terms.
export const TERMS_RULES = [
  { key: "illegal", label: "Illegal content (§ 6)" },
  { key: "threats", label: "Threats, harassment or calls for violence (§ 6)" },
  { key: "hate", label: "Insults, hate or discrimination (§ 6)" },
  { key: "privacy", label: "Someone else's private information or images without consent (§ 6)" },
  { key: "sexual", label: "Sexual content or nudity (§ 6)" },
  { key: "spam", label: "Spam, scams or advertising (§ 6)" },
  { key: "impersonation", label: "Pretending to be someone else (§ 6)" },
  { key: "rights", label: "Copyright or other rights (§ 6, § 8)" },
  { key: "false_claims", label: "False claims, fake reviews or recommendations (§ 6, § 7)" },
  { key: "accounts", label: "Fake, extra or shared accounts; collecting members' data (§ 6)" },
  { key: "market", label: "Market rules (§ 7)" },
  { key: "mentoring", label: "Mentoring rules (§ 7)" },
  { key: "real_name", label: "Real name and true details (§ 5)" },
];

const SOURCE = {
  report: "This followed a report from someone else.",
  own: "This followed our own check.",
};

// To the member whose content we removed or whose account we restricted.
// action: "removed" | "warning" | "blocked" | "ended". what: e.g. 'your post
// "Room in Kreuzberg" in Indians in Berlin'. date: as text. ground: "illegal"
// (then law: e.g. "§ 185 StGB (insult)") or "terms" (then rule: a
// TERMS_RULES label). facts: what the content said or did, in a sentence.
// source: "report" | "own". until: for a time-limited block, e.g. "until 1
// December 2026".
export function statementOfReasons({ action, what, date, ground, law, rule, facts, source, until }) {
  const did = {
    removed: `We removed ${what} on ${date}.`,
    warning: `We're writing about ${what}. Please read this warning.`,
    blocked: `We blocked your account on ${date}${until ? `, ${until}` : ", until further notice"}.`,
    ended: `We ended your membership on ${date}.`,
  }[action];
  const why = ground === "illegal"
    ? `Reason: we believe it is illegal under ${law}, because ${facts}.`
    : `Reason: it breaks our Terms of Use, ${rule}, because ${facts}.`;
  const reply = action === "warning"
    ? "If this happens again we may block your account. Please reply within 14 days if you want to tell us your side."
    : "";
  return [did, why, SOURCE[source] || "", "No automated tools were used: a person on our team decided.", reply, REDRESS_LINE,
    action === "blocked" || action === "ended" ? "You can still sign in to download your data and delete your account." : ""]
    .filter(Boolean).join(" ");
}

// Before a block in a case that isn't urgent (Terms of Use, section 10).
export function blockWarning({ what, rule, facts }) {
  return `We're planning to block your account because of ${what}: it breaks our Terms of Use, ${rule}, because ${facts}. `
    + `Please reply to ${CONTACT_EMAIL} within 14 days if you want to tell us your side; a person on our team will read it before we decide.`;
}

// ---------------------------------------------------------------------------
// THREATS TO LIFE OR SAFETY (Art. 18 DSA), for the admin panel
// ---------------------------------------------------------------------------

export const SAFETY_CHECKLIST = [
  "Immediate danger: call 110 (police) or 112 in Germany, or the local emergency number of the member's country.",
  "Otherwise, if the report suggests a crime that threatens someone's life or safety, tell the police without delay: in Germany the Federal Criminal Police Office (Bundeskriminalamt, BKA); for another EU country that country's police; if it's unclear which country, the BKA or Europol.",
  "Keep a copy of the content, the account ID and the times, and note here when you told which authority.",
  "Don't delete the content before you've kept that copy. Keep the copy with the report and delete it with the report (once the report is closed and 12 months old), or when a police matter or legal dispute about it is over (Privacy Policy, section 2).",
];
