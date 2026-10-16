// The Privacy Policy (Datenschutzerklärung), shown at nriclub.app/privacy,
// in the app's Terms & Policies window and in the signup dialogs. Format:
// src/content/legal/doc.js.
//
// Everything here must be true of what NRIClub actually does. When a feature,
// a provider, a retention job or what members can see changes, change this
// text in the same pull request, and give it a new version and date.
//
// PENDING LEGAL REVIEW: written to be accurate and complete under Art. 13/14
// GDPR, but it has not been reviewed by a lawyer yet (LAUNCH-GUIDE.md,
// docs/compliance/lawyer-questions.md).
import { CONTACT_EMAIL, mail, a, strong } from "./doc.js";
import { IMPRINT, PRIVACY_DETAILS, operatorLines } from "../imprint.js";
import { ART9_CONSENT_TEXT } from "./consent.js";

export const PRIVACY_VERSION = "2026-10-19";
export const PRIVACY_DATE = "19 October 2026";

// What is deleted automatically, and when. null (or false): no clean-up job
// does it yet, and the Policy says the data stays until our team deletes it.
// When a job is live on the database (or, for photo files, the deletion
// code and the scheduled clean-up), put its period here in the same pull
// request, so the Policy states exactly what runs.
export const RETENTION = {
  unconfirmedSignupDays: null, // sign-ups that never confirmed their email address
  unfinishedSignupDays: null, // accounts that never sent their check details
  declinedAccountMonths: null, // accounts our team declined, counted from the decision
  readNoticesMonths: null, // in-app notices the member has read
  closedReportsMonths: null, // reports, counted from when they were closed
  moderationRecordMonths: null, // record of declined and blocked accounts, from the decision
  moderationNoteMonths: null, // the note in that record is cleared after this
  photoFilesDeleted: false, // photo files go with their post, listing, event, profile or account
  photoCleanupHours: null, // files left behind are removed within this many hours
};
const R = RETENTION;
const months = (n) => `${n} month${n === 1 ? "" : "s"}`;

function accountRetention() {
  return [
    "until you delete your account.",
    R.unconfirmedSignupDays && ` A sign-up whose email address is never confirmed is deleted after ${R.unconfirmedSignupDays} days.`,
    R.unfinishedSignupDays && ` An account that never sends its check details is deleted after ${R.unfinishedSignupDays} days.`,
  ].filter(Boolean).join("");
}

function photoFilesText() {
  if (R.photoFilesDeleted) {
    return `Photo files are deleted together with the post, listing, event, profile photo or account they belong to${R.photoCleanupHours ? `; any left behind are removed within ${R.photoCleanupHours} hours` : ""}.`;
  }
  return "Photo files: deleting a post, a listing, an event, your profile photo or your account removes the photo from NRIClub, but the file itself isn't deleted automatically yet and stays at its web address (section 4). Write to us and we delete your photo files.";
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

export function privacyDoc() {
  return {
    title: "Privacy Policy",
    subtitle: `Datenschutzerklärung · Version ${PRIVACY_VERSION} · last updated ${PRIVACY_DATE}`,
    intro: [
      { box: { title: "In short", blocks: [{ ul: [
        "NRIClub is a members-only community for Indians abroad. We use your data to run it for you, and for nothing else.",
        "No advertising, no tracking, no analytics and no cookies. We never sell or rent your data.",
        "Your data is stored in the EU (Ireland).",
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
            ["What", "your email address; your password, which our sign-in provider stores only as a hash (a scrambled form nobody can read back); your name; when you signed up, confirmed your email address and last signed in; your confirmation that you're 18 or older; which version of the Terms of Use you accepted and when; and when you gave the consent in section 3 and in which wording."],
            ["Why", "to create your membership, sign you in and send you sign-in codes and password links."],
            ["Legal basis", "contract. Keeping the record of your confirmations and consent: legal obligation (Art. 7(1) GDPR requires us to be able to show consent)."],
            ["How long", accountRetention()],
          ] },
          { title: "Sign-in sessions", fields: [
            ["What", "for each device you sign in on: a session with your IP address, your browser and device type (user agent) and when it was created and last used."],
            ["Why", "to keep you signed in, let you sign out, and protect your account from misuse."],
            ["Legal basis", "contract, and legitimate interests (keeping accounts secure)."],
            ["How long", "until you sign out on that device, or until you delete your account."],
          ] },
          { title: "The membership check", fields: [
            ["What", "your city and country; your LinkedIn profile link or a short note on how you're connected to the Indian community; if you give one, a member who can vouch for you (if you came through an invite link, we fill in who invited you); our decision, any message we send you, notes our team makes about the check, and the dates. Our team opens the LinkedIn profile you gave us and looks at it: that is information we get from LinkedIn rather than from you."],
            ["Why", "to check that every member is a real person with a genuine connection to the community, so members can trust each other, and to keep out fake accounts, scammers and people we removed before."],
            ["Legal basis", "contract (the check is part of membership under our Terms of Use), and legitimate interests (a safe community of genuine people, for our members and for us)."],
            ["How long", `until you delete your account.${R.declinedAccountMonths ? ` An account our team declined is deleted ${months(R.declinedAccountMonths)} after the decision.` : ""} If we decline or block an account, a minimal record stays ("Record of declined and blocked accounts" below).`],
          ] },
          { title: "Your profile", fields: [
            ["What", "required: your name, city and country. Optional: a photo, your hometown, profession and what you do, how long you've lived abroad, a short bio, what people can ask you about, your LinkedIn link, and whether you offer mentoring or look for a mentor, with your topics. We also show your Verified badge, whether you're a city ambassador, and when you were last active."],
            ["Why", "so members can find, recognise and contact each other."],
            ["Legal basis", "contract; where it can show your origin, religion or health, your explicit consent (section 3)."],
            ["How long", "until you change it or delete your account."],
          ] },
          { title: "What you post and do on NRIClub", fields: [
            ["What", "posts, comments and likes; photos; guides you write and comments on them; questions and answers, including urgent questions, thanks and best answers; events you create and whether you're going; Market listings; places you add or recommend; groups you create, join or ask for; Namaste requests and connections; messages; mentoring times and sessions, with the topic, note and meeting link; ratings and reviews; members you block; your settings (for example who can message you); and the in-app notices we show you."],
            ["Why", "to provide the features you use."],
            ["Legal basis", "contract; where it can show your origin, religion or health, your explicit consent (section 3)."],
            ["How long", `until you delete it or your account, with the exceptions in section 9.${R.readNoticesMonths ? ` In-app notices you've read are deleted after ${months(R.readNoticesMonths)}.` : ""}`],
          ] },
          { title: "Reports, notices of illegal content and moderation", fields: [
            ["What", "reports members send (what was reported, the reason, who reported it); reports of illegal content we receive by email; our decisions and the reasons for them, and the messages we send about them; when you use \"Report a problem\", your description plus your browser type and screen size (the form tells you this)."],
            ["Why", "to deal with reports and illegal content, to tell the people concerned what we decided and why, to be able to show what we did, and to fix problems."],
            ["Legal basis", "legal obligation under the Digital Services Act (Art. 16 to 18 DSA: handling notices, giving reasons for our decisions, informing the police about threats to someone's life or safety); otherwise legitimate interests (a safe community, and being able to defend our decisions)."],
            ["How long", R.closedReportsMonths
              ? `until ${months(R.closedReportsMonths)} after the report is closed. A report you sent is deleted with your account; a report about you stays without the link to your account.`
              : "as long as we need it to deal with the matter and any challenge to our decision. Reports aren't deleted automatically yet: our team deletes them when they're no longer needed. A report you sent is deleted with your account; a report about you stays without the link to your account."],
          ] },
          { title: "Record of declined and blocked accounts", fields: [
            ["What", "if our team declines or blocks an account, we keep a minimal record: a coded form of the account's email address if it confirmed one (and of any address it changes to later), the LinkedIn profile link it had when our team last reviewed it (or, if we never did, when we blocked it), and our decision with its date and any note we made on it. The email address itself isn't kept: the coded form is made with a secret key, so we can only check whether an address we already know matches it."],
            ["Why", "so that someone we declined or blocked can't simply sign up again. When someone signs up, sends their check details or is moved back into review, we compare their email address and LinkedIn link with this record. If they match, our team checks the membership before the person can take part (section 6)."],
            ["Legal basis", "legitimate interests (protecting our members from people we removed)."],
            ["How long", `the record stays when the account is deleted, but its link to the account is removed then. ${R.moderationRecordMonths
              ? `It is deleted ${months(R.moderationRecordMonths)} after the decision${R.moderationNoteMonths ? `, and the note is removed after ${months(R.moderationNoteMonths)}` : ""}.`
              : "There's no fixed deletion date yet: our team deletes a record when it is no longer needed."}`],
          ] },
          { title: "Server and security logs", fields: [
            ["What", "when you use NRIClub, the servers of our providers automatically log each request: IP address, time, the page or data requested, browser and device type, and any error."],
            ["Why", "to deliver the site, find faults, and detect and stop attacks and misuse."],
            ["Legal basis", "legitimate interests (a secure, working service)."],
            ["How long", "Supabase keeps these logs for about 7 days. Vercel keeps them for the short period its service provides, under its own rules."],
          ] },
          { title: "Emails we send you", fields: [
            ["What", "sign-up codes, sign-in codes, password links and email-change confirmations, sent to your email address. Our email service records whether each email was delivered."],
            ["Why", "to run your account. We send no newsletters, no advertising and no notification emails: everything else shows inside NRIClub."],
            ["Legal basis", "contract."],
            ["How long", "the email service keeps its delivery records for a short time, under its own rules."],
          ] },
          { title: "Emails you send us", fields: [
            ["What", "your message, your email address and anything you include, and our reply."],
            ["Why", "to answer you and to deal with requests about your data and reports."],
            ["Legal basis", "contract for questions about your membership; legal obligation for requests under the GDPR and reports under the DSA; otherwise legitimate interests (answering people who write to us)."],
            ["How long", "as long as we need them for the matter. Requests about your rights and reports of illegal content, and our answers, we keep for 3 years after the matter is closed, so we can show we handled them correctly."],
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
        { p: "We use this information only to show it to members as described in section 4. We never use it for advertising and never sell it." },
      ] },

      { id: "visibility", title: "4. Who can see your data", blocks: [
        { entries: [
          { title: "Anyone, without an account", fields: [
            ["What", "nothing about you personally: the public pages contain no member data."],
            ["Photos", "a photo you upload is stored at a long web address that isn't listed anywhere. Anyone who has that exact address can open the photo without signing in, for example if a member copies it."],
          ] },
          { title: "Approved members", fields: [
            ["What", "your profile (section 2, \"Your profile\", including your LinkedIn link if you add it, and when you were last active); your posts, comments and likes; your questions and answers; the events you create and whether you're going; your Market listings; the places you add and recommend; the groups you're in; your Namaste connections; your mentoring offer and open times; the ratings and reviews you write, with your name, and those you receive; and whether you accept messages and Namaste requests."],
          ] },
          { title: "Members waiting for our check", fields: [
            ["What", "until our team has approved them, new members can't see other members, their profiles or what they post. They only see the list of groups and the guides, and they can't contact anyone."],
          ] },
          { title: "Your city group and its ambassadors", fields: [
            ["What", "when you join a city's group, the city's ambassador is told. If you post an urgent question, the city's ambassadors and up to 500 members of your city group get an in-app notice with your name and the question's title."],
          ] },
          { title: "Only the people involved", fields: [
            ["Messages", "only you and the member you write with. Messages are encrypted on the way and stored encrypted by our database provider, but they are not end-to-end encrypted. Our admin tools don't show them, and we don't read them."],
            ["Mentoring sessions", "the topic, note and meeting link of a session: only you and the other member."],
            ["Just you", "your in-app notices, your settings and the members you've blocked."],
          ] },
          { title: "Our team", fields: [
            ["What", "everything approved members see, plus your email address, your check details (LinkedIn link or note, the member who vouched for you, our notes and decisions), reports you send or that concern you, your account status and the record of your confirmations and consent. Not your messages."],
          ] },
          { title: "Our service providers", fields: [
            ["What", "they store and process data for us on our instructions (section 7)."],
          ] },
          { title: "Authorities and courts", fields: [
            ["What", "only where a law obliges us (legal obligation), for example a court order, or when information suggests a crime that threatens someone's life or safety, which we must report to the police (Art. 18 DSA)."],
          ] },
        ] },
      ] },

      { id: "sources", title: "5. Where your data comes from", blocks: [
        { p: "Mostly from you. Some comes from other members: when they invite you or vouch for you, report something, or rate a mentoring session with you. Our team looks at the LinkedIn profile you link to (section 2, \"The membership check\"). Our systems add technical data such as dates and logs." },
      ] },

      { id: "automated", title: "6. No automated decisions", blocks: [
        { p: "We don't make decisions about you based solely on automated processing (Art. 22 GDPR). People on our team decide on every membership, every report and every block." },
        { p: "One step is automatic: if your email address or LinkedIn link matches the record of an account we declined or blocked before (section 2), your account is held until a person on our team has checked it. Some limits also apply automatically, for example one urgent question a day; they only pause an action and decide nothing about you." },
      ] },

      { id: "processors", title: "7. Service providers and transfers outside the EU", blocks: [
        { p: "These providers process data for us, only on our instructions, under a data processing agreement (Auftragsverarbeitungsvertrag, Art. 28 GDPR):" },
        { entries: [
          { title: "Supabase", fields: [
            ["Company", "Supabase Inc., USA."],
            ["What for", "our database, sign-in, photo storage and live updates in the app."],
            ["Where", "Amazon Web Services data centres in Ireland (EU)."],
          ] },
          { title: "Vercel", fields: [
            ["Company", "Vercel Inc., USA."],
            ["What for", "hosting the website and delivering its files through a worldwide network of servers, so a request can be answered by a server outside the EU, including in the USA. It logs requests (section 2, \"Server and security logs\")."],
          ] },
          { title: "Resend", fields: [
            ["Company", "Resend, USA."],
            ["What for", "sending our sign-in and password emails, through Amazon Web Services' email service in Ireland (EU)."],
          ] },
          { title: "Our mailbox", fields: [
            ["Company", mailProvider() || "the provider that hosts our mailbox."],
            ["What for", `receiving and storing the emails you send to ${CONTACT_EMAIL}.`],
          ] },
        ] },
        { p: "Supabase, Vercel and Resend are US companies, and Vercel also answers requests from outside the EU, so personal data can be accessed from or sent to the USA. Where a provider is certified under the EU-US Data Privacy Framework, this relies on the European Commission's adequacy decision of 10 July 2023 (Art. 45 GDPR); otherwise on the EU standard contractual clauses (Standardvertragsklauseln) in the provider's data processing agreement (Art. 46(2)(c) GDPR). You can ask us for a copy of these safeguards." },
        { p: "We don't sell or rent personal data and don't share it with advertisers or data brokers." },
        { p: "Some links take you to other services when you tap them, for example Google Maps, Google Calendar and Google Meet, WhatsApp, LinkedIn, Eventbrite or websites members share. Nothing is loaded from them before you tap. Once you're there, their own privacy policies apply." },
      ] },

      { id: "storage", title: "8. Cookies and storage on your device", blocks: [
        { p: "NRIClub sets no cookies and uses no analytics, advertising or tracking tools. The site's own files, including its fonts, come from our server; member photos come from our database provider. Nothing is loaded from other websites." },
        { p: "To work, the site keeps a few items in your browser's local storage. They are strictly necessary for the service you asked for, so no consent is needed (§ 25(2) No. 2 TDDDG, Germany's Telecommunications Digital Services Data Protection Act). They stay on your device. Only the sign-in items are sent to our servers, to sign you in." },
        { entries: [
          { title: "nriclub_token, nriclub_refresh", fields: [
            ["Purpose", "your sign-in: a short-lived access key and a key to renew it."],
            ["Kept", "until you sign out."],
          ] },
          { title: "nriclub_reset_requested", fields: [
            ["Purpose", "the email address and time when this browser asked for a password-reset link, so that after the reset only this browser fills in the address on the login form."],
            ["Kept", "used for 24 hours; replaced when you ask for another link, otherwise it stays until you clear the site's data."],
          ] },
          { title: "nriclub_invite", fields: [
            ["Purpose", "if you opened a member's invite link: that member's ID and first name, so we can fill in who invited you when you sign up."],
            ["Kept", "until you clear the site's data."],
          ] },
          { title: "nriclub_profile_cache", fields: [
            ["Purpose", "a copy of your profile, written after you change your photo."],
            ["Kept", "until you sign out."],
          ] },
          { title: "nriclub_welcome_…, nriclub_welcome_done_…, nriclub_catchup_…, nriclub_intro_done_…, nriclub_city_group_…, nriclub_profile_card_dismissed_… (each ending in your member ID) and nriclub_festival_… (ending in a date)", fields: [
            ["Purpose", "which welcome messages, tips and cards you've already seen or closed, and when you last saw the catch-up, so they don't show again. They hold no other personal data."],
            ["Kept", "until you clear the site's data (they stay after you sign out)."],
          ] },
        ] },
        { p: "An earlier version of the site stored a cookie-banner choice (nriclub_cookie_consent); the site now deletes it." },
        { p: "You can delete all of these in your browser's settings by clearing the site data for nriclub.app. You'll then be signed out." },
      ] },

      { id: "retention", title: "9. How long we keep data, and deleting your account", blocks: [
        { p: "We keep data only as long as we need it for the purposes in section 2." },
        { ul: [
          [strong("Your account, profile and content"), " stay until you delete them or your account."],
          [strong("Deleting your account"), " (Settings → Delete account) at once deletes your profile and everything linked to it: posts, comments and likes, listings, events and replies to them, questions and answers, guides you wrote, group memberships, Namaste connections, messages and conversations (they also disappear for the other member), mentoring times and sessions, ratings and reviews, in-app notices, settings and the record of your membership check."],
          photoFilesText(),
          [strong("What stays after you delete your account:"), " places you added to a city's list and groups you created, without your name, because other members use them; reports other members made about you, no longer linked to your account; the record in section 2 if we declined or blocked you; copies in our database provider's daily backups, which are overwritten after 7 days; and server logs (section 2)."],
        ] },
      ] },

      { id: "rights", title: "10. Your rights", blocks: [
        { ul: [
          [strong("Access"), " (Art. 15 GDPR): Settings → Download my data gives you a copy of your account's data at once. Anything that isn't in the file, for example notes our team wrote about your membership check, we give you on request."],
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
          { p: [strong("Where we process your data on the basis of legitimate interests (Art. 6(1)(f) GDPR), you can object at any time, on grounds relating to your particular situation."), " This covers the membership check, sign-in sessions as far as they serve security, reports and moderation, the record of declined and blocked accounts, and server and security logs (section 2)."] },
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
        { p: "We protect your data with technical and organisational measures (Art. 32 GDPR), including: encrypted connections (HTTPS) everywhere; storage in the EU, encrypted on our provider's disks; database rules that let each person read and change only what they're allowed to; passwords stored only as hashes; admin tools only for our team; and daily backups. No system is completely secure. If a data breach is likely to put you at high risk, we tell you without undue delay (Art. 34 GDPR)." },
      ] },

      { id: "changes", title: "16. Changes to this policy", blocks: [
        { p: ["We update this policy when NRIClub or the law changes. The version and date are at the top. We tell you about important changes in the app before they apply. Earlier versions are available on request at ", mail("Privacy Policy"), "."] },
      ] },
    ],
  };
}
