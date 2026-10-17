// Texts for reporting content and for telling people about moderation
// decisions, under the EU Digital Services Act (DSA): Art. 16 (notices of
// illegal content: anyone can send one, we confirm receipt and tell the
// sender our decision), Art. 17 (a statement of reasons to the member whose
// content or account we restrict) and Art. 18 (threats to life or safety go
// to the police). The Terms of Use (sections 9 and 10) promise what these
// texts say; keep both in step.
//
// For the public "Report illegal content" page (src/ReportPage.jsx), the
// in-app report dialog (src/member/ReportDialog.jsx), the admin panel's
// decision messages and emails, and the auto-reply of the hello@nriclub.app
// mailbox. Plain data and small functions, no React.
//
// The database writes the in-app messages itself (private.statement_of_reasons
// and private.report_outcome in supabase/migrations/20261021000000_moderation_dsa.sql)
// in the same words as statementOfReasons() and reporterOutcome() below, which
// the admin panel uses to show what the member will read. Change both
// together.
import { CONTACT_EMAIL } from "./doc.js";

// ---------------------------------------------------------------------------
// WHERE TO REPORT
// ---------------------------------------------------------------------------

// The public report page. Every "Report illegal content" link (footers, the
// Terms, the Impressum) points here.
export const REPORT_HREF = "/report";
export const REPORT_LINK_LABEL = "Report illegal content";
export const REPORT_LINK_TEXT = REPORT_LINK_LABEL;

// By email instead, with the four things Art. 16(2) DSA asks for: on the
// report page while the database can't take reports yet, and for anyone who
// prefers email.
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
  emailInstead: "You can also write to us instead:",
  // What the page says once the report is in. ref: its reference code.
  sent: (ref) => `Thank you. We've received your report${ref ? ` (reference ${ref})` : ""}. A person on our team will look at it.`,
  sentNext: `We'll email you from ${CONTACT_EMAIL} to confirm we've received it, and again with our decision and how you can challenge it. Please quote the reference if you write to us about it.`,
  sentAnonymous: "You didn't give an email address, so we can't tell you what we decided. If you'd like to hear back, send another report with your name and email address.",
};

// ---------------------------------------------------------------------------
// FIELDS AND REASONS (public page and in-app dialog)
// ---------------------------------------------------------------------------

export const REPORT_FIELDS = {
  location: { label: "Where is the content?", hint: "A link, or the group, member, title and date.", max: 1000 },
  category: { label: "What is the problem?" },
  explanation: { label: "Why?", hint: "Tell us what the content says or shows and why it is illegal or against our rules.", min: 10, max: 1000 },
  // The public page allows a longer explanation (the database takes 2,000).
  noticeExplanationMax: 2000,
  name: { label: "Your name" },
  email: { label: "Your email address", hint: "We send our decision here." },
  goodFaith: { label: "I believe in good faith that the information in this report is accurate and complete." },
  submit: "Send report",
};

// Two groups, so our team can tell illegal content from a breach of the
// house rules. Keys are stored with the report (reports.category,
// private.notices.category; private.report_categories() in the database
// lists the same keys); labels are what people see.
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
      { key: "child_abuse", label: "Sexual abuse of a child" },
      { key: "illegal_other", label: "Something else that is illegal" },
    ],
  },
  rules: {
    label: "Against our rules",
    reasons: [
      { key: "spam", label: "Spam or advertising" },
      { key: "harassment", label: "Harassment or bullying" },
      { key: "fake_profile", label: "Fake profile or someone pretending to be someone else" },
      { key: "fake_reviews", label: "Fake or paid reviews or recommendations" },
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

// What can be reported in the app (reports.content_type), as the dialog
// and the admin panel call it.
export const REPORT_KINDS = {
  post: "post",
  comment: "comment",
  answer: "answer",
  doc: "guide",
  doc_comment: "comment on a guide",
  event: "event",
  help: "question",
  market: "Market listing",
  review: "mentoring review",
  place: "place",
  message: "message",
  profile: "profile",
};

// ---------------------------------------------------------------------------
// AFTER A REPORT
// ---------------------------------------------------------------------------

// Shown after sending in the app, and as the mailbox's auto-reply (Art.
// 16(4) DSA).
export const REPORT_RECEIVED = "Thank you. We've received your report. A person on our team will look at it, and we'll tell you here in NRIClub what we decided.";
export const REPORT_AUTO_REPLY = [
  "Thank you for writing to NRIClub. We've received your message.",
  "If you reported content you believe is illegal or against our rules, a person on our team will look at it and tell you what we decided and how you can challenge it.",
  "If someone is in immediate danger, call 112 or your local emergency number.",
].join("\n\n");

export const REDRESS_LINE = `Think we got it wrong? Write to ${CONTACT_EMAIL} within 6 months, and a person on our team will look at it again. You can also go to court.`;

// To whoever reported something (Art. 16(5) DSA), as the database writes it
// (private.report_outcome). item: what was reported, e.g. 'the post "Room
// in Kreuzberg"'. outcome: "removed" | "blocked" | "warned" | "kept" |
// "gone" (no longer there). reason finishes "because ...", e.g. "it insults
// another member".
export function reporterOutcome({ item, outcome, reason }) {
  const what = {
    removed: `we removed it because ${reason}.`,
    blocked: `we blocked the account because ${reason}.`,
    warned: `we warned the member because ${reason}, and didn't remove anything.`,
    gone: `it's no longer on NRIClub (${reason}).`,
  }[outcome] || `we kept it because ${reason}.`;
  return `We looked at your report about ${item}: ${what} ${REDRESS_LINE}`;
}

// The emails to someone who reported content on the public page (the app
// sends no emails: our team sends these from hello@nriclub.app, the admin
// panel prefills them). ref: the report's reference code.
export function noticeReceiptEmail({ ref, name }) {
  return {
    subject: `Your report ${ref}`,
    body: [
      `Hello${name ? ` ${name}` : ""},`,
      `Thank you for your report to NRIClub. We've received it (reference ${ref}). A person on our team will look at it, and we'll write to you again with our decision and how you can challenge it.`,
      "If someone is in immediate danger, call 112 or your local emergency number.",
      "The NRIClub team",
    ].join("\n\n"),
  };
}

// item: e.g. 'the post you reported'. outcome and reason as for
// reporterOutcome.
export function noticeDecisionEmail({ ref, name, item = "the content you reported", outcome, reason }) {
  return {
    subject: `Our decision on your report ${ref}`,
    body: [
      `Hello${name ? ` ${name}` : ""},`,
      reporterOutcome({ item, outcome, reason }),
      "A person on our team made this decision; no automated tools were used.",
      "The NRIClub team",
    ].join("\n\n"),
  };
}

// A mailto: link with a subject and a body. The address is encoded too
// (only "@" stays as it is): an address typed on the report form can't add
// a "?cc=" or "&body=" of its own to the email our team sends.
export const mailtoLink = (to, { subject, body }) =>
  `mailto:${encodeURIComponent(to || "").replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

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

// The serious cases in which we block straight away, without a warning
// first (Terms of Use, section 10). Keys as the database stores them.
export const URGENT_REASONS = [
  { key: "threat", label: "threats" },
  { key: "violence", label: "violence" },
  { key: "fraud", label: "fraud" },
  { key: "illegal", label: "clearly illegal content" },
  { key: "danger", label: "danger to someone" },
];

const SOURCE = {
  report: "This followed a report from someone else.",
  notice: "This followed a report from someone else.",
  own: "This followed our own check.",
  own_initiative: "This followed our own check.",
};

// "21 October 2026" (as the database writes dates, German time).
export const longDate = (d = new Date()) => {
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" }).format(d);
  } catch {
    return d.toDateString();
  }
};

// To the member whose content we removed or whose account we restricted, as
// the database writes it (private.statement_of_reasons). action:
// "removed" | "warning" | "blocked" | "unblocked". what: e.g. 'your post
// "Room in Kreuzberg"' ("how you use NRIClub" for a warning about the
// account). date: as text. ground: "illegal" (then law: e.g. "§ 185 StGB
// (insult)") or "terms" (then rule: a TERMS_RULES label). facts: what it
// said or did, finishing "because ...". source: "report" | "notice" |
// "own". urgent: for a block without a warning first, an URGENT_REASONS key.
// sessions: mentoring sessions a block cancelled.
export function statementOfReasons({ action, what, date = longDate(), ground, law, rule, facts, source, urgent, sessions = 0 }) {
  if (action === "unblocked") return `We unblocked your account on ${date}. You can use NRIClub again.`;
  const clean = String(facts || "").replace(/\s+/g, " ").trim().replace(/[.!\s]+$/, "");
  const did = {
    removed: `We removed ${what} on ${date}.`,
    warning: `We're writing about ${what}. Please read this warning.`,
    blocked: `We blocked your account on ${date}, until further notice.`,
  }[action];
  const why = ground === "illegal"
    ? `Reason: we believe it is illegal under ${law || rule}, because ${clean}.`
    : `Reason: it breaks our Terms of Use, ${rule}, because ${clean}.`;
  const urgentLabel = URGENT_REASONS.find((u) => u.key === urgent)?.label;
  return [
    did,
    why,
    action === "blocked" && urgentLabel ? `Because this is a serious case (${urgentLabel}), we blocked your account straight away, without a warning first.` : "",
    SOURCE[source] || SOURCE.own,
    "No automated tools were used: a person on our team decided.",
    action === "warning" ? `If this happens again we may block your account. Please reply to ${CONTACT_EMAIL} within 14 days if you want to tell us your side.` : "",
    action === "blocked" && sessions > 0
      ? (sessions === 1 ? "Your booked mentoring session was cancelled, and the member who booked it was told."
        : `Your ${sessions} booked mentoring sessions were cancelled, and the members who booked them were told.`) : "",
    REDRESS_LINE,
    action === "blocked" ? "You can still sign in to download your data and delete your account." : "",
  ].filter(Boolean).join(" ");
}

// Before a block in a case that isn't urgent (Terms of Use, section 10):
// the warning above (statementOfReasons with action "warning") says the
// same, in the app.
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
