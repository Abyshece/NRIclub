// The Privacy Policy (Datenschutzerklärung), shown at nriclub.app/privacy,
// in the app's Terms & Policies window and in the signup dialogs. Format:
// src/content/legal/doc.js.
//
// Everything here must be true of what NRIClub actually does. When a feature,
// a provider, a retention job or what members can see changes, change this
// text in the same pull request, and give it a new version and date.
//
// Reviewed by a German IT lawyer in October 2026; the changes from that
// review are in. Open points: docs/compliance/questions-for-the-lawyer.md.
import { CONTACT_EMAIL, mail, a, strong } from "./doc.js";
import { IMPRINT, PRIVACY_DETAILS, operatorLines } from "../imprint.js";
import { ART9_CONSENT_TEXT } from "./consent.js";

export const PRIVACY_VERSION = "2026-10-24";
export const PRIVACY_DATE = "24 October 2026";

// How long data is kept: the periods this Policy promises. Until clean-up
// jobs run on the database (plan C20), our team deletes by hand once a month
// with the queries in docs/compliance/deletion-routine.md, and byHand says
// so in section 9. When the jobs are live, set byHand to false in the same
// pull request, and keep the periods here equal to the jobs'.
export const RETENTION = {
  byHand: true,
  unconfirmedSignupDays: 30, // sign-ups that never confirmed their email address
  unfinishedSignupDays: 90, // accounts that never sent their check details
  endedAccountMonths: 6, // accounts our team declined, or whose membership we ended, from the decision
  readNoticesMonths: 6, // in-app notices the member has read
  closedReportsMonths: 12, // closed reports (and evidence kept with them), from when they were sent
  closedNoticesMonths: 12, // reports from nriclub.app/report once closed, from when they were sent
  noticeLimitHours: 24, // the coded email and internet addresses behind the daily report limits
  ambassadorDecidedMonths: 6, // applications to be a city ambassador, from our decision (accepted or declined)
  ambassadorUndecidedMonths: 12, // applications we haven't decided on, from when they were sent
  ambassadorLimitHours: 24, // the coded email and internet addresses behind the daily application limits
  moderationActionMonths: 24, // the record of our team's decisions on content and accounts
  moderationCopyMonths: 6, // the copy of removed content in that record
  moderationRecordMonths: 24, // record of declined and blocked accounts, from the decision
  moderationNoteMonths: 12, // the note in that record is cleared after this
  requestEmailYears: 3, // emails about rights and reports of illegal content, after the matter is closed
  otherEmailMonths: 12, // all other emails, after the matter is closed
  inboxMonths: 12, // emails to hello@ in the admin panel's inbox, after they arrived (private.daily_cleanup)
  travelPostDays: 30, // travel board posts, after their last date (private.daily_cleanup)
  travelLimitDays: 30, // when a member posted on the travel board, for its limits (private.rate_log)
  profileReminderMonths: 12, // the note of which profile reminder went to whom (private.profile_reminders_cleanup)
  // Photo files: true since the site deletes them with their post, listing,
  // event or profile photo and with the account (plan C1), and the photo
  // clean-up in the admin panel (src/admin/PhotoCleanup.jsx) deletes what is
  // left behind: once a day when an admin opens the panel, and at least
  // every photoCleanupDays days (docs/compliance/deletion-routine.md). If
  // it were ever false again: deleted by hand within photoFilesByHandDays.
  photoFilesDeleted: true,
  photoCleanupDays: 7,
  photoFilesByHandDays: 7,
};
const R = RETENTION;
const months = (n) => `${n} month${n === 1 ? "" : "s"}`;

// Who members can see. onlyApprovedListed: true since the database shows
// other members only approved, active accounts (the profiles policy with
// private.is_listed_member, supabase/migrations/20261023000000_admin_access.sql);
// false would say that approved members can read the profile of every
// account (members waiting for our check, unfinished, declined and blocked
// accounts included), as before that update.
export const VISIBILITY = {
  onlyApprovedListed: true,
};

// How the admin tools are protected. adminTwoStep: true once "Require
// two-step login for admin rights" is switched on in the admin panel
// (Security); while it is off, section 15 doesn't claim it.
export const SECURITY = {
  adminTwoStep: false,
};

function accountRetention() {
  return [
    "until you delete your account.",
    R.unconfirmedSignupDays && ` A sign-up whose email address is never confirmed is deleted after ${R.unconfirmedSignupDays} days.`,
    R.unfinishedSignupDays && ` An account that never sends its check details is deleted after ${R.unfinishedSignupDays} days.`,
    " Our team may delete such a sign-up sooner, by hand; this is recorded like our other decisions, without the account's details.",
  ].filter(Boolean).join("");
}

export function photoFilesText() {
  if (R.photoFilesDeleted) {
    return [strong("Photo files"), ` are deleted when you delete the post, listing or event they belong to, or replace or remove your profile photo. Deleting your account deletes all your photo files first. Files left behind, for example of content our team removed, are deleted automatically within a few days (at most ${R.photoCleanupDays}).`];
  }
  return `Photo files: when you delete a post, a listing, an event, your profile photo or your account, we delete its photo files too, by hand within ${R.photoFilesByHandDays} days for now. Until then the file still opens for anyone who has its exact web address (section 4).`;
}

// Who is responsible: from src/content/imprint.js once it is filled in.
function controllerBlocks() {
  const lines = operatorLines();
  const blocks = lines.length
    ? [
      { p: "The controller (Verantwortlicher) for your data under the General Data Protection Regulation (GDPR) is:" },
      { p: [strong(lines[0]), ...lines.slice(1).map((l) => `, ${l}`)] },
      { p: ["Email: ", mail(), ...(IMPRINT.phone.trim() ? [`, phone: ${IMPRINT.phone.trim()}`] : [])] },
    ]
    : [
      { p: ["NRIClub is run by its founder in Germany, who is the controller (Verantwortlicher) for your data under the General Data Protection Regulation (GDPR). You can reach us at ", mail(), "."] },
    ];
  return blocks.concat([
    { p: "In this policy, \"we\" and \"our team\" mean the people who run NRIClub. Only our team can use NRIClub's admin tools." },
    { p: ["We have not appointed a data protection officer (Datenschutzbeauftragter). Please send any question about your data to ", mail("Privacy"), "."] },
  ]);
}

function complaintBlocks() {
  const name = PRIVACY_DETAILS.supervisoryAuthority.trim();
  const url = PRIVACY_DETAILS.supervisoryAuthorityUrl.trim();
  return [
    { p: "You have the right to complain to a data protection supervisory authority (Aufsichtsbehörde, Art. 77 GDPR), in particular in the EU country where you live or work, or where you think your rights were breached. You don't have to write to us first, although we'd be glad if you did." },
    name
      ? { p: ["The authority responsible for us is: ", name, ...(url ? [", ", a(url.replace(/^https?:\/\//, "").replace(/\/$/, ""), url)] : []), "."] }
      : { p: "The authority responsible for us is the data protection authority of the German federal state (Bundesland) in which NRIClub's founder lives." },
    { p: ["The European Data Protection Board lists every authority in the EU: ", a("edpb.europa.eu", "https://www.edpb.europa.eu/about-edpb/about-edpb/members_en"), "."] },
  ];
}

const mailProvider = () => PRIVACY_DETAILS.mailProvider.trim();
const hasAgreement = (provider) => !!(PRIVACY_DETAILS.agreements || {})[provider];

// A provider's entry in section 7: its fields, plus the data processing
// agreement and the transfer safeguard in it once that agreement is in
// place (PRIVACY_DETAILS.agreements). The safeguard: each of these
// providers' agreements includes the EU standard contractual clauses
// (checked October 2026).
function provider(key, title, fields, abroad = true) {
  const agreement = hasAgreement(key)
    ? [["Agreement", "a data processing agreement (Auftragsverarbeitungsvertrag, Art. 28 GDPR): it processes data only on our instructions."]]
    : [];
  const safeguard = abroad && hasAgreement(key)
    ? [["Safeguard", "the EU standard contractual clauses (Standardvertragsklauseln, Art. 46(2)(c) GDPR) in that agreement."]]
    : [];
  return { title, fields: [...fields, ...agreement, ...safeguard] };
}

export function privacyDoc() {
  const vercelLogs = PRIVACY_DETAILS.vercelLogRetention.trim() || "up to 1 day";
  return {
    title: "Privacy Policy",
    subtitle: `Datenschutzerklärung · Version ${PRIVACY_VERSION} · last updated ${PRIVACY_DATE}`,
    intro: [
      { box: { title: "In short", blocks: [{ ul: [
        "NRIClub is a members-only community for Indians abroad. We use your data to run it for you, and for nothing else.",
        "No advertising, no tracking, no analytics and no cookies. We never sell or rent your data.",
        "Our database, with your profile, content and messages, is in the EU (Ireland).",
        "Only members our team has approved can see your profile and what you post (a photo also opens for anyone who has its exact web address, see section 4). Our admin tools don't show your messages.",
        "You can download your data or delete your account at any time in Settings.",
        ["Questions? Write to ", mail("Privacy"), "."],
      ] }] } },
    ],
    sections: [
      { id: "controller", title: "1. Who is responsible for your data", blocks: controllerBlocks() },

      { id: "purposes", title: "2. What we process, why, and for how long", blocks: [
        { p: "For each kind of data below we say why we use it, the legal basis that allows it and how long we keep it. The legal bases are:" },
        { ul: [
          [strong("Contract"), " (Art. 6(1)(b) GDPR): what we need to provide your membership under our Terms of Use."],
          [strong("Legal obligation"), " (Art. 6(1)(c) GDPR): what a law requires of us, in particular the EU Digital Services Act (DSA) for reports of illegal content, and the GDPR itself, for example to show which consents you gave."],
          [strong("Legitimate interests"), " (berechtigte Interessen, Art. 6(1)(f) GDPR): where we name the interest each time. You can object to this processing (section 11)."],
          [strong("Explicit consent"), " (ausdrückliche Einwilligung, Art. 9(2)(a) GDPR): for information that can show your ethnic origin, religion or health (section 3)."],
        ] },
        { entries: [
          { title: "Your account", fields: [
            ["What", "your email address; your password, which our sign-in provider stores only as a hash (a scrambled form nobody can read back); your name; when you signed up, confirmed your email address, last signed in and last opened NRIClub (only you and our team see this); your confirmation that you're 18 or older; which version of the Terms of Use you accepted and when; and when you gave the consent in section 3 and in which wording."],
            ["Why", "to create your membership, sign you in and send you sign-in codes and password links."],
            ["Legal basis", "contract. Keeping the record of your consent in section 3: legal obligation (Art. 6(1)(c) with Art. 7(1) GDPR, which requires us to be able to show consent). Keeping the record of your age confirmation and of which Terms you accepted: legitimate interests (being able to prove our contract and its terms)."],
            ["How long", accountRetention()],
          ] },
          { title: "Sign-in sessions", fields: [
            ["What", "for each device you sign in on: a session with your IP address, your browser and device type (user agent) and when it was created and last used."],
            ["Why", "to keep you signed in, let you sign out, and protect your account from misuse."],
            ["Legal basis", "contract, and legitimate interests (keeping accounts secure)."],
            ["How long", "until you sign out on that device, or until you delete your account. Settings → Account → \"Sign out of all devices\" ends all your sessions at once."],
          ] },
          { title: "The membership check", fields: [
            ["What", "your city and country; your LinkedIn profile link or a short note on how you're connected to the Indian community; if you give one, a member who can vouch for you (if you came through an invite link, we fill in who invited you); our decision, any message we send you, notes our team makes about the check, and the dates. Our team opens the LinkedIn profile you gave us and looks at it (the name, photo, jobs and education shown there): that is information we get from LinkedIn rather than from you. If you change your name or LinkedIn link after we've approved you, we check again."],
            ["Why", "to check that every member is a real person with a genuine connection to the community, so members can trust each other, and to keep out fake accounts, scammers and people we removed before."],
            ["Legal basis", "contract (the check is part of membership under our Terms of Use), and legitimate interests (a safe community of genuine people, for our members and for us); where it can show your origin, religion or health, your explicit consent (section 3)."],
            ["How long", `until you delete your account. An account our team declined, or whose membership we ended, is deleted ${months(R.endedAccountMonths)} after our decision if you haven't deleted it yourself. If we decline or block an account, a minimal record stays ("Record of declined and blocked accounts" below).`],
          ] },
          { title: "Your profile", fields: [
            ["What", "required: your name, city and country. Optional: a photo, your hometown, profession and what you do, how long you've lived abroad, a short bio, what people can ask you about, your LinkedIn link, and whether you offer mentoring or look for a mentor, with your topics. We also show your Verified badge and whether you're a city ambassador."],
            ["Why", "so members can find, recognise and contact each other."],
            ["Legal basis", "contract; where it can show your origin, religion or health, your explicit consent (section 3)."],
            ["How long", "until you change it or delete your account."],
            ["Reminders", `our team may send you a reminder in the app about profile details you haven't added yet, at most once a week (legitimate interests: helping members recognise and find each other). We keep a note of which reminder we sent you and when for ${months(R.profileReminderMonths)}.`],
          ] },
          { title: "What you post and do on NRIClub", fields: [
            ["What", "posts, comments and likes; photos (before uploading one, the site makes it smaller and saves it again, which removes hidden details such as where and when it was taken); guides you write and comments on them; questions and answers, including urgent questions, thanks and best answers; events you create and whether you're going; Market listings; places you add or recommend; groups you create, join or ask for; Namaste requests and connections; your invite code, if you open \"Invite a friend\"; messages; mentoring times and sessions, with the topic, note and meeting link; ratings and reviews; members you block; your settings (for example who can message you); and the in-app notices we show you."],
            ["Why", "to provide the features you use."],
            ["Legal basis", "contract; where it can show your origin, religion or health, your explicit consent (section 3)."],
            ["How long", `until you delete it or your account, with the exceptions in section 9. In-app notices you've read are deleted after ${months(R.readNoticesMonths)}.`],
          ] },
          { id: "travel", title: "The travel board (flying to or from India)", fields: [
            ["What", `if you use the travel board: your posts, each with the city you fly from and the city you fly to, the date of your flight or the earliest and latest dates that suit you, your flight number if you give one, what you can help with or what you need (a travel companion, documents or a small open item) and your note; when you agreed to the board's rules, and which version of them; and, so we can limit how many trips each member posts, when you posted (kept ${R.travelLimitDays} days). A message you send from the board is an ordinary message ("Messages" in section 4) that starts with the trip it's about.`],
            ["Why", "so members flying the same way can find each other and help each other, and to tell you about matching trips. When a member posts a trip on the same route as one of yours, with dates that overlap and help in common, up to 20 members with a matching post get an in-app notice with that member's name, the route, the dates and the help. Members who blocked each other aren't told about each other's trips."],
            ["Legal basis", "contract; where it can show your origin, religion or health, your explicit consent (section 3). The record that you agreed to the rules, and the limit: legitimate interests (keeping the board safe and free of misuse)."],
            ["Who sees it", "approved members, until the post's last date has passed, but not members you blocked or who blocked you; and our team. Your dates and flight number show where you'll be and when, so share only what you're comfortable with."],
            ["How long", `until you delete the post. A post leaves the board after its last date and is deleted automatically ${R.travelPostDays} days after that date, with the notices about it. The record that you agreed to the rules is kept until you delete your account.`],
          ] },
          { title: "Reports, notices of illegal content and moderation", fields: [
            ["What", "reports members send in the app (what was reported, the reason, their explanation, who reported it); reports sent with the form at nriclub.app/report (where the content is, the reason and explanation, the sender's name and email address, and the reference code we give the report) or by email; to limit how many reports can be sent, a coded form of the email address and the internet address (IP address) a report on the form came from, made with a secret key; where we need it as evidence, a copy of the reported content (for example a screenshot) with the account and the time; our decisions and the reasons for them (the rule or law, the facts, whether a report led to them, who on our team decided), a copy of what we removed (its text; of a photo, only the file's name), and the messages we send about them; when you use \"Report a problem\", your description plus your browser type and screen size (the form tells you this)."],
            ["Why", "to deal with reports and illegal content, to tell the people concerned what we decided and why, to be able to show what we did, and to fix problems."],
            ["Legal basis", "legal obligation under the Digital Services Act (Art. 16 to 18 DSA: handling notices, giving reasons for our decisions, informing the police about threats to someone's life or safety); otherwise legitimate interests (a safe community, and being able to defend our decisions)."],
            ["How long", `reports, and anything we kept with them, are deleted once they're closed and ${months(R.closedReportsMonths)} old (reports from the form: ${months(R.closedNoticesMonths)}), unless a legal dispute or a police matter about them is still open. A copy kept as evidence is deleted with the report, or when that legal dispute or police matter is over. The coded addresses behind the report limits are deleted after ${R.noticeLimitHours} hours. The record of our decisions is deleted ${months(R.moderationActionMonths)} after the decision, and the copy of removed content in it after ${months(R.moderationCopyMonths)}, unless a legal dispute or a police matter about it is still open. \"Report a problem\" messages and ideas you sent are deleted with your account. A report you sent about content or a member stays after you delete your account, without the link to your account, so our team can finish dealing with it. A report about you or your content, and the record of our decisions about it, stay after you delete your account, without the link to your account, but their text can still contain your name or the title of what was reported.`],
          ] },
          { title: "Record of declined and blocked accounts", fields: [
            ["What", "if our team declines or blocks an account, we keep a minimal record: a coded form of the account's email address if it confirmed one (and of any address it changes to later), the LinkedIn profile link it had when our team last reviewed it (or, if we never did, when we blocked it), and our decision with its date and any note we made on it. The email address itself isn't kept: the coded form is made with a secret key, so we can only check whether an address we already know matches it."],
            ["Why", "so that someone we declined or blocked can't simply sign up again. When someone signs up, sends their check details or is moved back into review, we compare their email address and LinkedIn link with this record. If they match, our team checks the membership before the person can take part (section 6)."],
            ["Legal basis", "legitimate interests (protecting our members from people we removed)."],
            ["How long", `the record stays when the account is deleted, but its link to the account is removed then. The record is deleted ${months(R.moderationRecordMonths)} after our decision; the note in it after ${months(R.moderationNoteMonths)}.`],
          ] },
          { id: "ambassadors", title: "Applications to be a city ambassador", fields: [
            ["What", "if you apply to be a city ambassador, on our website or in the app: your name and email address (if you're signed in, those of your account, and a link to your account), the city and country, your university or employer and your LinkedIn profile link if you give them, why you'd like to be an ambassador and how much time you could give; the reference code we give your application, its status (new, contacted, accepted or declined), when and by whom on our team it was decided, and our team's notes on it. To limit how many applications can be sent, a coded form of the email address and of the internet address it was sent from."],
            ["Why", "to look at your application, to write to you about it and, if we agree, to make you the ambassador for your city (members then see it on your profile and in your city's group, section 4)."],
            ["Legal basis", "steps you ask us to take before we agree with you on the volunteer role (Art. 6(1)(b) GDPR). Keeping your application for a while after our decision, and the daily limits on the form: legitimate interests (knowing whom we've spoken to and being able to answer questions about our decision; protecting the form from misuse)."],
            ["Who sees it", "only our team. Other members don't see your application."],
            ["How long", `an application we've decided on (accepted or declined) is deleted ${months(R.ambassadorDecidedMonths)} after our decision; one we haven't decided on, ${months(R.ambassadorUndecidedMonths)} after you sent it. The coded addresses behind the daily limits are deleted after ${R.ambassadorLimitHours} hours. Deleting your account doesn't delete an application you sent: it stays, no longer linked to the account, for these periods (write to us to have it deleted sooner). Emails about it are kept like the other emails you send us (below).`],
          ] },
          { title: "Server and security logs", fields: [
            ["What", "when you use NRIClub, the servers of our providers automatically log each request: IP address, time, the page or data requested, browser and device type, and any error."],
            ["Why", "to deliver the site, find faults, and detect and stop attacks and misuse."],
            ["Legal basis", "legitimate interests (a secure, working service)."],
            ["How long", `Supabase keeps these logs for about 7 days, Vercel for ${vercelLogs}.`],
          ] },
          { title: "Emails we send you", fields: [
            // Resend keeps each email for 30 days on all its plans
            // (resend.com/pricing, October 2026).
            ["What", "from our sign-in system: sign-up codes, sign-in codes, password links and email-change confirmations. Our email service keeps each of these emails (your address, the subject and the content, including the code or link) and whether it was delivered. From our team: messages about your membership: decisions on your membership check (approved, more information needed, not approved) and a block of your account, each with what the app also tells you, notice of changes to the Terms of Use or to NRIClub, the end of your membership and, if it ever happened, a data breach that affects you; and, to whoever reports content with the form at nriclub.app/report, confirmation that we received it and our decision. Moderation decisions with their reasons, warnings and the outcome of a report you sent in the app come as in-app notices; we may also email them."],
            ["Why", "to run your account and to give you information our Terms of Use or the law require. We send no newsletters, no advertising and no automatic notification emails: everything else shows inside NRIClub."],
            ["Legal basis", "contract; legal obligation for statements of reasons and report outcomes (Art. 16(5) and 17 DSA) and breach notices (Art. 34 GDPR)."],
            ["How long", "our email service keeps each email it sends for 30 days. Copies of what our team sends are kept like the emails you send us (below). Which decision emails we sent (the account, the decision and when; not the text) we note for 30 days, so none goes out twice."],
          ] },
          { title: "Emails you send us", fields: [
            ["What", "your message, your email address and anything you include, and our reply."],
            ["Why", "to answer you and to deal with requests about your data and reports."],
            ["Legal basis", "contract for questions about your membership; legal obligation for requests under the GDPR and reports under the DSA; otherwise legitimate interests (answering people who write to us)."],
            ["How long", `requests about your rights and reports of illegal content, and our answers, we keep for ${R.requestEmailYears} years after the matter is closed, so we can show we handled them correctly. Other emails, and our replies, we delete ${months(R.otherEmailMonths)} after the matter is closed. Emails to ${CONTACT_EMAIL} also show in our admin panel's inbox, with the replies we send from there (attachments only by name and size); there they are deleted automatically ${months(R.inboxMonths)} after they arrived.`],
          ] },
        ] },
        { p: "Our public pages (the homepage, the city pages and the guides) contain no personal data. A city page shows how many members its group has only once there are at least 5." },
      ] },

      { id: "sensitive", title: "3. Information that can show your origin, religion or health", blocks: [
        { p: "NRIClub is a community for Indians abroad. Being a member, and some of what you share, can show your ethnic origin, your religion or your health. For example: that you belong to the Indian community; your hometown; the language, faith or support groups you join; temples you recommend; the festivals and events you go to; questions you ask under Health or Legal/Visa." },
        { p: "The GDPR treats this as special categories of personal data (Art. 9 GDPR). We process it only with your explicit consent (Art. 9(2)(a) GDPR), which you give with its own checkbox when you sign up, or once on the \"Before you continue\" screen if you joined before we asked for it. It is never ticked in advance. The checkbox says:" },
        { box: { blocks: [{ p: `"${ART9_CONSENT_TEXT}"` }] } },
        { p: "We store when you gave it and which wording you agreed to. Without this consent you can't be a member, because membership itself shows a connection to the Indian community." },
        { p: ["You can withdraw your consent at any time, for the future: delete the content in question (for example leave a group or delete a question), or delete your account, which withdraws it completely. You can also write to us at ", mail("Withdraw consent"), "; as membership depends on this consent, we then close your account, and you can download your data first. Withdrawing doesn't make what we did before it unlawful (Art. 7(3) GDPR)."] },
        { p: "We use this information only to run your membership: for our team's membership check (section 2), to show it to members as described in section 4, and to deal with reports about it. We never use it for advertising and never sell it." },
      ] },

      { id: "visibility", title: "4. Who can see your data", blocks: [
        { entries: [
          { title: "Anyone, without an account", fields: [
            ["What", "nothing about you personally: the public pages contain no member data."],
            ["Photos", "a photo you upload is stored at a long web address that isn't listed anywhere. New photos get an address with a random code, which can't be guessed. Anyone who has a photo's exact address can open it without signing in, for example if a member copies it."],
          ] },
          { title: "Approved members", fields: [
            ["What", "your profile (section 2, \"Your profile\"; for your LinkedIn link, see below); your posts, comments and likes; your questions and answers; the events you create and whether you're going; your Market listings; your travel board posts until their last date (not members you blocked or who blocked you; section 2, \"The travel board\"); the places you add (not which places you recommend: members see only how many members recommend a place); the groups you're in; your Namaste connections; your mentoring offer and open times; the ratings and reviews you write, with your name, and those you receive; and whether you accept messages and Namaste requests."],
            ["If your membership ends", VISIBILITY.onlyApprovedListed
              ? "if we decline your sign-up or block your account, or while our team checks your profile again (for example after you change your name), other members don't see your profile. What you posted before stays until you or we delete it, but without your name or photo: it shows as \"NRIClub member\", and your name is taken off events you organised."
              : "if we decline your sign-up or block your account, approved members can still see your profile until the account is deleted (section 2, \"The membership check\")."],
          ] },
          { title: "Your LinkedIn link", fields: [
            ["Who sees it", "our team always does, to check members. Other approved members see it when \"Show my LinkedIn link to\" in Edit profile says \"All members\", not when it says \"Only the NRIClub team\" (new members start with this). You can change it at any time."],
          ] },
          { title: "Members waiting for our check", fields: [
            ["What", `until our team has approved them, new members can't see other members, their profiles or what they post. They only see the list of groups and the guides, and they can't contact anyone. ${VISIBILITY.onlyApprovedListed
              ? "Until our team has approved you, other members can't see your profile either."
              : "While you wait for our check, approved members can already see your profile (name, photo, city and what else you filled in), but not your check details."}`],
          ] },
          { title: "Your city group and its ambassadors", fields: [
            ["What", "when you join a city's group, the city's ambassador is told. If you post an urgent question, the city's ambassadors and up to 500 members of your city group get an in-app notice with your name and the question's title."],
          ] },
          { title: "Only the people involved", fields: [
            ["Messages", "only you and the member you write with. Messages are encrypted on the way and stored encrypted by our database provider, but they are not end-to-end encrypted. Our admin tools don't show them, and we don't read them, with one exception: if the member you write with reports one of your messages to us, our team sees that one message to decide on the report."],
            ["Mentoring sessions", "the topic, note and meeting link of a session: only you and the other member."],
            ["Just you", "your in-app notices, your settings and the members you've blocked."],
            ["Your invite link", "it carries a random code, not your member ID. Someone who signs up through it sees your first name and member ID in the details they send for our check, where we fill in who invited them."],
          ] },
          { title: "Our team", fields: [
            ["What", `everything approved members see${VISIBILITY.onlyApprovedListed ? " (your profile also while other members don't see it)" : ""}, plus your email address, your check details (LinkedIn link or note, the member who vouched for you, our notes and decisions), reports you send or that concern you, our decisions about your content and account, your account status, the record of your confirmations and consent, and an application to be a city ambassador if you send one. Not your messages, except one reported to us (above).`],
          ] },
          { title: "Our service providers", fields: [
            ["What", "they store and process data for us (section 7)."],
          ] },
          { title: "Authorities and courts", fields: [
            ["What", "only where a law obliges us (legal obligation), for example a court order, or when information suggests a crime that threatens someone's life or safety, which we must report to the police (Art. 18 DSA); and, if we need to establish, exercise or defend legal claims, our lawyers and the courts (legitimate interests)."],
          ] },
        ] },
      ] },

      { id: "sources", title: "5. Where your data comes from", blocks: [
        { p: "Mostly from you. Some comes from other members: when they invite you or vouch for you, report something, or rate a mentoring session with you. Our team looks at the LinkedIn profile you link to (section 2, \"The membership check\"). Our systems add technical data such as dates and logs." },
        { p: ["If you're not a member: when you report content to us or apply to be a city ambassador, we process what you send us (section 2). If you run a business or practice that a member added to Places, we show its name and the details the member entered, because members recommend places to each other (legitimate interests). You can ask us to correct or remove it, or object, at ", mail("Places entry"), "."] },
      ] },

      { id: "automated", title: "6. No automated decisions", blocks: [
        { p: "We don't make decisions about you based solely on automated processing (Art. 22 GDPR). People on our team decide on every membership, every report and every block." },
        { p: "One step is automatic: if your email address or LinkedIn link matches the record of an account we declined or blocked before (section 2), your account is held until a person on our team has checked it. Some limits also apply automatically, for example one urgent question a day; they only pause an action and decide nothing about you." },
      ] },

      { id: "processors", title: "7. Service providers and transfers outside the EU", blocks: [
        { p: "These providers process data for us:" },
        { entries: [
          provider("supabase", "Supabase", [
            ["Company", "Supabase Pte. Ltd., Singapore."],
            ["What for", "our database, sign-in, photo storage and live updates in the app, and the small server programs (\"Edge Functions\") that send our team's emails and keep the emails to hello@nriclub.app in our admin panel. These programs run on the server nearest to whoever uses them, which can be outside the EU; they keep nothing themselves."],
            ["Where", "Amazon Web Services data centres in Ireland (EU)."],
          ]),
          provider("vercel", "Vercel", [
            ["Company", "Vercel Inc., USA."],
            ["What for", "hosting the website and delivering its files through a worldwide network of servers, so a request can be answered by a server outside the EU, including in the USA. It logs requests (section 2, \"Server and security logs\")."],
          ]),
          provider("resend", "Resend", [
            ["Company", "Plus Five Five, Inc. (Resend), USA."],
            ["What for", "sending our sign-in and password emails and our team's emails (decisions about your membership, replies to your emails), through Amazon Web Services' email service in Ireland (EU); receiving the emails sent to us (\"Our mailbox\", below)."],
          ]),
          provider("mailbox", "Our mailbox", [
            ["Company", mailProvider() || "the provider that hosts our mailbox."],
            ["What for", `receiving the emails you send to ${CONTACT_EMAIL}, forwarding them to the inbox our team reads, and sending our replies.`],
            ["Where", "Resend uses Amazon Web Services in the USA and the EU; Google's servers can be anywhere in the world, including the USA."],
            ["Safeguard", "for Resend, the EU standard contractual clauses in its data processing agreement (Art. 46(2)(c) GDPR); Google LLC is certified under the EU–US Data Privacy Framework (adequacy decision, Art. 45 GDPR)."],
          ]),
        ] },
        { p: "Supabase is a company in Singapore, Vercel, Resend and Google are companies in the USA, and Vercel also answers requests from outside the EU, so personal data can be accessed from or sent to countries outside the EU. For each provider, the safeguard for this is named above. You can ask us for a copy of these safeguards." },
        { p: "We don't sell or rent personal data and don't share it with advertisers or data brokers." },
        { p: "Some links take you to other services when you tap them, for example Google Maps, Google Calendar and Google Meet, WhatsApp, LinkedIn, Eventbrite or websites members share. Nothing is loaded from them before you tap. Once you're there, their own privacy policies apply." },
      ] },

      { id: "storage", title: "8. Cookies and storage on your device", blocks: [
        { p: "NRIClub sets no cookies and uses no analytics, advertising or tracking tools. The site's own files, including its fonts, come from our server; member photos come from our database provider. Nothing is loaded from other websites." },
        { p: "To work, the site keeps a few items in your browser's storage (local storage, and session storage for signing up and the invite). They are strictly necessary for the service you asked for, so no consent is needed (§ 25(2) No. 2 TDDDG, Germany's Telecommunications Digital Services Data Protection Act). They stay on your device, with two exceptions: the sign-in items are sent to our servers to sign you in, and the invite code to look up who invited you." },
        { entries: [
          { title: "nriclub_token, nriclub_refresh", fields: [
            ["Purpose", "your sign-in: a short-lived access key and a key to renew it."],
            ["Kept", "until you sign out."],
          ] },
          { title: "nriclub_reset_requested", fields: [
            ["Purpose", "the email address and time when this browser asked for a password-reset link, so that after the reset only this browser fills in the address on the login form."],
            ["Kept", "until you've set the new password, at most 24 hours (it's deleted the next time you open NRIClub after that)."],
          ] },
          { title: "nriclub_signup", fields: [
            ["Purpose", "while you sign up and we wait for the 6-digit code from your email: the email address and name you typed and where you are in signing up, so the code step is still there if the page reloads. Not your password."],
            ["Kept", "in session storage, only in that browser tab: until you've signed up, leave the signup page or close the tab, and at most an hour."],
          ] },
          { title: "nriclub_invite", fields: [
            ["Purpose", "if you opened a member's invite link: the invite code from the link (on older links: that member's ID and first name). When you fill in your details for our check, the site sends the code to our servers to look up who invited you, and tells our team when you send the details."],
            ["Kept", "in session storage, only in that browser tab: until you send those details, or close the tab."],
          ] },
          { title: "nriclub_welcome_…, nriclub_welcome_done_…, nriclub_catchup_…, nriclub_intro_done_…, nriclub_city_group_…, nriclub_profile_card_dismissed_… (each ending in your member ID) and nriclub_festival_… (ending in a date)", fields: [
            ["Purpose", "which welcome messages, tips and cards you've already seen or closed, and when you last saw the catch-up, so they don't show again. They hold no other personal data."],
            ["Kept", "until you clear the site's data, or delete your account in this browser (they stay after you sign out, so the same messages don't show again next time)."],
          ] },
        ] },
        { p: "Earlier versions of the site stored a cookie-banner choice (nriclub_cookie_consent) and a copy of your profile (nriclub_profile_cache); the site now deletes them." },
        { p: "You can delete all of these in your browser's settings by clearing the site data for nriclub.app. You'll then be signed out." },
      ] },

      { id: "retention", title: "9. How long we keep data, and deleting your account", blocks: [
        { p: "We keep data only as long as we need it for the purposes in section 2, and for the periods given there." },
        { ul: [
          [strong("Your account, profile and content"), " stay until you delete them or your account, or until we delete an account as section 2 says (a sign-up never confirmed, an account that never sent its check details, or one we declined or whose membership we ended)."],
          [strong("Deleting your account"), " (Settings → Delete account) at once deletes your profile and everything linked to it: posts, comments and likes, listings, travel board posts and your agreement to the board's rules, the events you created and your replies to events, questions and answers, guides you wrote, group memberships, Namaste connections, messages and conversations (they also disappear for the other member), mentoring times and sessions, ratings and reviews, in-app notices, settings and the record of your membership check."],
          photoFilesText(),
          [strong("What stays after you delete your account:"), " places you added to a city's list and groups you created, without your name, because other members use them; reports you sent about content or members, and reports other members made about you, no longer linked to your account (their text can still contain your name); the record of our decisions about your content and account, no longer linked to it; copies of reported content we keep as evidence (section 2); the record in section 2 if we declined or blocked you; an application to be a city ambassador, no longer linked to your account, until it is deleted (section 2); emails you sent us (section 2); copies in our database provider's daily backups, which are overwritten after 7 days; and server logs (section 2)."],
          ...(R.byHand ? [`Until these deletions run automatically, our team carries them out by hand${R.photoFilesDeleted ? " once a month" : ": photo files every week, everything else once a month"}, so data can stay up to a month longer than the period given.`] : []),
        ] },
      ] },

      { id: "rights", title: "10. Your rights", blocks: [
        { ul: [
          [strong("Access"), " (Art. 15 GDPR): Settings → Download my data gives you a copy of your account's data at once. Anything that isn't in the file, for example notes our team wrote about your membership check, we give you on request. To protect members who report content, we don't say who reported you, and we leave out reports about messages you sent, since only the member you wrote to can report a message (Art. 15(4) GDPR). If we remove a message of yours, we tell you why."],
          [strong("Correction"), " (Art. 16): change your profile in the app. To change your email address, write to us."],
          [strong("Erasure"), " (Art. 17): delete content in the app, or your whole account in Settings, or ask us."],
          [strong("Restriction"), " (Art. 18): ask us to limit how we use your data while, for example, we check whether it is correct."],
          [strong("Data portability"), " (Art. 20): the download is a machine-readable file (JSON)."],
          [strong("Withdrawing consent"), " (Art. 7(3)): section 3."],
          [strong("Objection"), " (Art. 21): section 11."],
          [strong("Complaint"), " to a supervisory authority (Art. 77): section 12."],
        ] },
        { p: ["For anything you can't do in the app, write to ", mail("My data"), ". It's free. We answer within one month (Art. 12(3) GDPR); if a request is complex, we may take up to two more months and tell you why. We may ask you to confirm a request from your account's email address, so we don't give your data to someone else."] },
      ] },

      { id: "object", title: "11. Your right to object", blocks: [
        { box: { title: "Right to object (Widerspruchsrecht, Art. 21 GDPR)", blocks: [
          { p: [strong("Where we process your data on the basis of legitimate interests (Art. 6(1)(f) GDPR), you can object at any time, on grounds relating to your particular situation."), " This covers in particular the membership check, sign-in sessions as far as they serve security, the record of your age confirmation and of which Terms you accepted, reports and moderation, the record of declined and blocked accounts, keeping applications to be a city ambassador after our decision and the limits on that form, places members add about businesses and practices (section 5), server and security logs, and emails we answer on that basis (section 2)."] },
          { p: "If you object, we stop unless we can show compelling legitimate grounds that override your interests, rights and freedoms, or we need the data to establish, exercise or defend legal claims." },
          { p: ["To object, write to ", mail("Objection"), "."] },
        ] } },
      ] },

      { id: "complaint", title: "12. Complaints", blocks: complaintBlocks() },

      { id: "required", title: "13. What you have to give us", blocks: [
        { p: "To sign up: your name, email address and a password, your confirmation that you're 18 or older, your acceptance of the Terms of Use and the consent in section 3. For the membership check: your city and country, and a LinkedIn link or a short note. Everything else is optional." },
        { p: "No law requires you to give us any of this, but without the required information we can't make or continue the membership contract." },
      ] },

      { id: "age", title: "14. Age", blocks: [
        { p: "NRIClub is only for people aged 18 or over. If we learn that a member is under 18, we delete the account." },
      ] },

      { id: "security", title: "15. Security", blocks: [
        { p: `We protect your data with technical and organisational measures (Art. 32 GDPR), including: encrypted connections (HTTPS) everywhere; storage in the EU, encrypted on our provider's disks; database rules that let each person read and change only what they're allowed to; passwords stored only as hashes; admin tools only for our team, on their own web address${SECURITY.adminTwoStep ? " and with two-step login (a code from an authenticator app)" : ""}; and daily backups. No system is completely secure. If a data breach is likely to put you at high risk, we tell you without undue delay (Art. 34 GDPR).` },
      ] },

      { id: "changes", title: "16. Changes to this policy", blocks: [
        { p: ["We update this policy when NRIClub or the law changes. The version and date are at the top. We tell you about important changes in the app before they apply. Earlier versions are available on request at ", mail("Privacy Policy"), "."] },
      ] },
    ],
  };
}
