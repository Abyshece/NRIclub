// The Terms of Use (Nutzungsbedingungen), shown at nriclub.app/terms, in the
// app's Terms & Policies window and in the signup and Terms dialogs. Earlier
// versions stay readable at nriclub.app/terms/<version> (TERMS_ARCHIVE).
// Format: src/content/legal/doc.js.
//
// A new version: copy the current one into its own file in this folder, add
// it to TERMS_ARCHIVE, change the text here, and change TERMS_VERSION here,
// in src/member/LegalModals.jsx (the build checks they're the same) and in
// private.current_terms_version() in a new migration. Members accept the new
// version on the Terms screen once the database says it is current.
//
// Written for German and EU consumer, platform and anti-discrimination law,
// and reviewed by a German IT lawyer in October 2026; the changes from that
// review are in. Open points: docs/compliance/questions-for-the-lawyer.md.
import { CONTACT_EMAIL, SITE, mail, a, strong } from "./doc.js";
import { IMPRINT, operatorLines } from "../imprint.js";
import { REPORT_HREF } from "./reporting.js";
import { termsDoc20261010 } from "./terms-2026-10.js";
import { termsDoc20261019 } from "./terms-2026-10-19.js";
import { RETENTION } from "./privacy.js";

export const TERMS_VERSION = "2026-10-23";
export const TERMS_DATE = "23 October 2026";

// Earlier versions, by version, for nriclub.app/terms/<version>.
export const TERMS_ARCHIVE = { "2026-10-19": termsDoc20261019, "2026-10": termsDoc20261010 };
export const PREVIOUS_TERMS_VERSION = "2026-10-19";

// For the Terms screen ("We've updated our Terms"): what changed in this
// version, in a few lines.
export const TERMS_CHANGES = [
  "A section on the new travel board (flying to or from India) replaces \"Travel companions\": favours only, no payment; only documents and small open items, checked in person; you're responsible for your own luggage at customs; and we may remove posts that break these rules (section 7).",
  "You can report travel posts like other content (section 9).",
];
// For members on the previous version, who may answer "Later" (section 14:
// the Terms they accepted still apply): what they need this version for
// (the database checks it: private.has_current_terms).
export const TERMS_NEEDED_FOR = "posting or messaging on the travel board";

// Who the contract is with: the operator from src/content/imprint.js once it
// is filled in.
function providerBlocks() {
  const lines = operatorLines();
  return [
    lines.length
      ? { p: ["NRIClub (nriclub.app) is provided by ", strong(lines[0]), ...lines.slice(1).map((l) => `, ${l}`), ` ("we", "us"). Email: `, mail(), ...(IMPRINT.phone.trim() ? [`, phone: ${IMPRINT.phone.trim()}`] : []), "."] }
      : { p: ["NRIClub (nriclub.app) is provided by its founder, who runs it in Germany (\"we\", \"us\"). Email: ", mail(), "."] },
    { p: "These Terms of Use are the contract between you, as a member, and us for using NRIClub." },
    { p: ["Our ", a("Privacy Policy", "/privacy"), " explains how we handle your data. It is information for you, not part of this contract."] },
  ];
}

// The provider as the addressee of a withdrawal.
const withdrawalAddressee = () => {
  const lines = operatorLines();
  return lines.length ? `${lines.join(", ")}, email ${CONTACT_EMAIL}` : `the provider named in section 1, email ${CONTACT_EMAIL}`;
};

export function termsDoc(version = TERMS_VERSION) {
  if (version && version !== TERMS_VERSION && TERMS_ARCHIVE[version]) return TERMS_ARCHIVE[version]();
  return {
    title: "Terms of Use",
    subtitle: `Nutzungsbedingungen · Version ${TERMS_VERSION} · published ${TERMS_DATE} · applies to you from when you accept it`,
    intro: [],
    sections: [
      { id: "provider", title: "1. Who we are", blocks: providerBlocks() },

      // For the next version: since 24 October 2026 there are only city
      // groups (language, interest and university groups were removed), so
      // "groups for cities, languages, interests and universities" becomes
      // "a group for each city". Changing the text needs a new version.
      { id: "service", title: "2. What NRIClub is", blocks: [
        { p: "NRIClub is an online community for Indians abroad and people connected with the Indian community. Members can join groups for cities, languages, interests and universities; post and comment; ask and answer questions; organise and join events; offer and find things in the Market; recommend places; connect with each other (Namaste) and send messages; offer or book free mentoring; and read our guides." },
        { p: "NRIClub is free. There are no fees, no paid features and no advertising." },
        { p: "We work to keep NRIClub available and working well, but we can't promise that it will always be available without interruption, for example during maintenance or updates or because of faults outside our control." },
      ] },

      { id: "joining", title: "3. How you join", blocks: [
        { ol: [
          "You enter your full name, your email address and a password.",
          "You confirm that you're 18 or older and accept these Terms. With a separate checkbox you agree that we may process what you share that can show your ethnic origin, religion or health, for our membership check and to show it to members, as the Privacy Policy explains. Neither box is ticked in advance.",
          "You continue, and we email you a 6-digit code. When you enter it, your account is created: that is when the contract between you and us is made.",
          "You tell us your city and country and give us your LinkedIn profile link or a short note on how you're connected to the community, so our team can check your membership (section 5).",
        ] },
        { p: "Until you continue in step 3, you can correct anything you typed in the form. Afterwards you can change your details in your profile and settings." },
        { p: ["The contract language is English. We store which version of these Terms you accepted and when. You can read, print or save the current version at any time at ", a("nriclub.app/terms", "/terms"), ", and every earlier version stays available there too (section 19)."] },
      ] },

      { id: "eligibility", title: "4. Who can join", blocks: [
        { p: "NRIClub is for adults, 18 or over, who have a genuine connection to the Indian community abroad: because they are part of it, or through family, work, study, friends or interest. Origin, nationality, religion, caste, sex, sexual identity or disability never decide whether you can join." },
        { p: "Each person may have one personal account. Accounts for businesses, organisations or several people aren't possible." },
        { p: "If we ended your membership before because of a serious breach of these Terms, you may only join again if we agree." },
      ] },

      { id: "account", title: "5. Your account and our membership check", blocks: [
        { ul: [
          "Use your real name, the one people know you by (for example as on LinkedIn). Members meet in person, rent rooms, travel together and help each other find work, so they need to know who they're dealing with. That's why NRIClub doesn't offer pseudonyms.",
          ["Keep your details true and up to date, and your password secret. If you think someone else has used your account, tell us at ", mail("My account"), "."],
          "Our team checks every new member: we look at the LinkedIn profile or the note you gave us, and at the member who vouches for you, if you name one. Until we've approved you, you can complete your profile, read the guides and see which groups exist, but you can't see other members or what they post, post anything yourself or contact anyone.",
          "Your name and LinkedIn link are what our team checked. If you change either after we've approved you, we check your membership again, and until then you can't take part, as before your first approval.",
          "We approve real people with a genuine connection to the community (section 4). We decline sign-ups that are fake, can't be checked, are a second account or spam, or come from someone we removed before for a serious breach of these Terms. We never decide because of someone's origin, nationality, religion, sex or any other personal characteristic.",
          `If we can't approve you yet, we usually ask you for more information first. If we decline your sign-up, we tell you why, and your membership ends. You can then still download your data and delete your account; otherwise we delete the account ${RETENTION.endedAccountMonths} months after our decision.`,
          "If your email address or LinkedIn link matches an account we declined or blocked before, your account is held automatically until a person on our team has checked it.",
          "The Verified badge means that our team has reviewed the LinkedIn link or note the member gave us. It doesn't confirm who they are or that they can be trusted. Take the usual care before you pay, rent, travel with or meet someone.",
        ] },
      ] },

      { id: "rules", title: "6. House rules", blocks: [
        { p: "Treat other members with respect. Don't post, send or do anything that:" },
        { ul: [
          "is illegal, or links to illegal content;",
          "threatens, harasses, bullies or stalks anyone, or calls for violence;",
          "insults or demeans people, or discriminates against them because of their origin, caste, nationality, religion, sex, sexual identity, disability, age or a similar characteristic;",
          "shares someone else's private information (such as their address, phone number, documents or private messages) or photos and videos of them without their consent;",
          "contains sexual content or nudity, or anything harmful to minors;",
          "is spam, chain messages or advertising nobody asked for, a pyramid or multi-level-marketing scheme, a scam or phishing, or asks members for money or personal data under false pretences;",
          "pretends to be someone else, including NRIClub, our team or an ambassador;",
          "infringes copyright or other people's rights (section 8);",
          "spreads false claims about other people, or fake reviews or recommendations.",
        ] },
        { p: "Also don't: create fake or extra accounts or let others use yours; collect other members' data (for example by copying profiles or using bots or scrapers) or use it for advertising; or try to get around our security, our limits or another member's block." },
      ] },

      { id: "features", title: "7. Rules for features", blocks: [
        { h: "Market" },
        { ul: [
          "The Market is for members' own private offers: your own things, a room or home you let yourself, a job or referral at your own employer. No business or agency ads and no paid promotion.",
          "Not allowed: weapons; drugs; prescription medicines; alcohol and tobacco; counterfeit or stolen goods; identity documents; SIM cards, bank accounts or other accounts; currency exchange or money-transfer services (such as hawala); and anything else that is illegal to sell or offer.",
          "Housing and job posts must not exclude anyone because of ethnic origin, religion or belief, sex, disability, age or sexual identity (Germany's General Equal Treatment Act, AGG), except where the law allows it, for example when you choose a flatmate for the home you live in yourself.",
          "Deals are between the members involved. NRIClub isn't a party to them and doesn't check items, offers or payments. Never pay in advance to someone you don't know, and meet in a public place.",
        ] },
        { h: "Jobs and referrals" },
        { p: "Offer referrals only at your own employer, and never ask for or pay a fee for a referral." },
        { h: "Travel board (flying to or from India)" },
        { ul: [
          "The travel board helps members find a travel companion, or a member who can carry documents or a small open item, as a favour. Only approved members can post or reply there, and you agree to the board's rules once before your first post or message.",
          "Favours only: no payment of any kind, including \"courier fees\". Offering or asking for money isn't allowed.",
          "Only documents and small open items that the traveller sees and checks in person before the trip. No sealed parcels, cash, gold or jewellery, medicines, food, or anything customs restricts.",
          "You are responsible for everything in your own luggage at customs, in every country on the way. Check the customs rules before you agree, and if in doubt, say no.",
          "Meet in a public place to hand things over. Never share passport copies, OTPs or bank details.",
          `We may remove posts that break these rules (section 10). A post leaves the board after its last date and is deleted ${RETENTION.travelPostDays} days after that date.`,
        ] },
        { h: "Events and meetups" },
        { p: "Events are organised by members, not by NRIClub, and the organiser is responsible for them. Take the usual care when you meet people you don't know." },
        { h: "Mentoring" },
        { ul: [
          "Mentoring is free: mentors must not ask for money or anything else in return. Only approved members can offer mentoring.",
          "Mentors share their own experience. That isn't legal, visa, tax, financial or medical advice. Don't give or ask for an assessment of someone's individual legal case, visa application or tax return; for that, see a lawyer (Rechtsanwalt), a tax adviser (Steuerberater) or a wage-tax help association (Lohnsteuerhilfeverein).",
          "You can have up to 3 upcoming sessions at a time, only 1 of them with the same mentor, and book up to 6 sessions a day.",
          "Ratings: a member who booked a session can rate it once, after its time. We don't check that the session actually took place. Rate only your own experience of the session.",
        ] },
        { h: "Questions and answers" },
        { ul: [
          "Answers come from members and share their experience; they aren't professional advice (see Mentoring).",
          "NRIClub is not an emergency service. If someone is in danger, call 112 or your local emergency number first.",
          "Your name and your question are visible to all approved members. An urgent question also goes as an in-app notice to your city's ambassadors and up to 500 members of your city's group. You can post one urgent question a day.",
        ] },
        { h: "Places and recommendations" },
        { ul: [
          "Add and recommend only places you know yourself. No paid, fake or swapped recommendations, and none for your own business.",
          "Recommendations come from members. We don't check that they were customers, and nobody is paid for them.",
          ["Businesses and professionals listed can ask us to correct or remove their entry at ", mail("Places entry"), "."],
        ] },
        { h: "Guides" },
        { p: "Our guides give general information, not legal or tax advice. Rules change, so check official sources before you act." },
        { h: "Messages" },
        { p: "Don't send messages nobody asked for to many members, and respect other members' settings for messages and Namaste requests." },
      ] },

      { id: "content", title: "8. Your content", blocks: [
        { ul: [
          "You keep all rights to what you post.",
          "Post only what you're allowed to: your own texts and photos, or ones you have permission to use. Don't copy articles, guides or photos from elsewhere; link to them instead. Before you post a photo or video in which other people can be recognised, get their consent.",
          "So that we can run NRIClub, you give us a free, non-exclusive right, limited to running NRIClub, to store your content (including in backups), copy it, make smaller versions of photos, and show it to members where the feature you used shows it (for example in a group, in questions or in the Market). We use it for nothing else.",
          `This right ends when you delete the content or your account. The exceptions: places you added to a city's list and groups you created stay, without your name, because other members use and add to them (you can ask us to remove a place you added); content we must keep because of a report or a legal dispute stays for that purpose only; ${RETENTION.photoFilesDeleted ? `photo files left behind are deleted within ${RETENTION.photoCleanupDays} days; ` : `photo files are deleted within ${RETENTION.photoFilesByHandDays} days; `}and backup copies are overwritten within 7 days.`,
          "A photo you upload is stored at a long web address that isn't listed anywhere. Anyone who has that exact address can open the photo without signing in, so only post photos you're comfortable with on that basis.",
        ] },
      ] },

      { id: "reporting", title: "9. Reporting content", blocks: [
        { p: "Anyone, member or not, can tell us about content on NRIClub they believe is illegal or against these Terms:" },
        { ul: [
          "Members: use Report on the item itself: a post, comment, answer, question, guide or comment on a guide, event, Market listing, travel post, place, mentoring review, profile, or a message you received.",
          ["Everyone: use the form at ", a("nriclub.app/report", REPORT_HREF), ", or write to ", mail("Report illegal content"), "."],
        ] },
        { p: "Please tell us: where the content is (a link, or the group, member, title and date); why you believe it is illegal or against our rules; your name and email address (not needed if your report is about the sexual abuse of a child); and that your report is accurate and complete to the best of your knowledge." },
        { p: "We confirm that we've received your report, a person on our team looks at it, and we tell you our decision and how you can challenge it: in NRIClub if you reported in the app, otherwise by email. We don't tell the person you reported who you are, unless the law requires it." },
        { p: "If someone's life or safety is in danger, call 112 or your local emergency number first." },
      ] },

      { id: "moderation", title: "10. How we moderate", blocks: [
        { ul: [
          "A person on our team looks at every report and makes every decision. We don't use automated moderation. The only automatic steps are the hold on sign-ups in section 5 and the limits in section 11.",
          "We act when content is illegal or breaks these Terms, or when an account puts other members at risk. Depending on how serious it is, we may remove content, warn you, limit what you can do, block your account for a time or until further notice, or end your membership (section 12).",
          "We decide carefully, objectively and in proportion, and consider the rights of everyone involved, including freedom of expression.",
          "When we remove your content, warn you or restrict your account, we tell you in NRIClub what we did and for how long, the rule or law it is based on, the facts, whether it followed a report or our own check, and how you can challenge it. If your account is blocked, you see the reason when you sign in.",
          "Before we block your account, we tell you why and give you 14 days to reply. In serious cases (threats, violence, fraud, clearly illegal content, or danger to someone) we block straight away and tell you why at the same time.",
          "Whoever reported the content hears our decision.",
          "If a mentor's account is blocked, or our team doesn't approve their membership, their booked sessions are cancelled and the members who booked them are told.",
          ["Think we got it wrong? Write to ", mail("Please review a decision"), " within 6 months of our decision. A person will look at it again and tell you the result. You can also go to court at any time."],
          "If information suggests a crime that threatens someone's life or safety, we tell the police (Art. 18 of the EU Digital Services Act).",
        ] },
      ] },

      { id: "limits", title: "11. Limits", blocks: [
        { p: "To keep NRIClub useful and free of spam, some things are limited:" },
        { ul: [
          "one urgent question a day;",
          "the mentoring limits in section 7; only approved members can offer mentoring;",
          "repeated sign-in attempts.",
        ] },
        { p: "We may also limit how often other actions, such as messages or Namaste requests, can be done in a short time, to stop spam. If you reach a limit, wait a little and try again." },
        { p: "You decide who can send you messages and Namaste requests, and you can block other members." },
      ] },

      { id: "ending", title: "12. Ending your membership", blocks: [
        { ul: [
          "You can end your membership at any time, without notice: Settings → Delete account. The Privacy Policy explains what is deleted and what stays. Download your data first if you want a copy.",
          "We can end your membership with 4 weeks' notice, for example if we close NRIClub. We tell you by email.",
          "We can end it without notice for an important reason (§ 314 of the German Civil Code, BGB), in particular a serious or repeated breach of these Terms, usually after a warning (section 10).",
          "If we can't approve your membership, it ends as described in section 5.",
          `If we end your membership, you can still sign in to download your data and delete your account, until we delete the account ${RETENTION.endedAccountMonths} months after our decision (Privacy Policy, section 2).`,
        ] },
      ] },

      { id: "service-changes", title: "13. Changes to NRIClub", blocks: [
        { p: "We may change, add or remove features if there is a good reason: new or better features, security, legal or technical requirements, little use, or costs out of proportion. Changes cost you nothing. We tell you in NRIClub in good time about changes that affect you." },
        { p: "If a change makes NRIClub more than slightly worse for you, we tell you about it by email at least 2 weeks before it takes effect. You can then end your membership free of charge within 30 days of the change, or of when we told you about it if that was later (§ 327r of the German Civil Code, BGB). You can delete your account at any time anyway." },
      ] },

      { id: "changes", title: "14. Changes to these Terms", blocks: [
        { p: "We may change these Terms for good reasons, such as new features, changes in the law or court decisions. We tell you at least 2 weeks before new Terms apply, in NRIClub and by email, with a summary of what changes and the new text." },
        { p: "New Terms apply to you only once you accept them in NRIClub; your silence never counts as acceptance. If you don't accept them, the previous Terms keep applying until we end your membership with 4 weeks' notice (section 12); until then NRIClub asks you each time you open it. Only where the law requires a consent before we may go on (such as the consent in section 3 of the Privacy Policy) can you not use NRIClub until you give it; you can still sign in, download your data and delete your account. Every version stays available at nriclub.app/terms." },
      ] },

      { id: "withdrawal", title: "15. Your right of withdrawal", blocks: [
        { p: "If you are a consumer, you have the following right of withdrawal (Widerrufsrecht):" },
        { box: { title: "Right of withdrawal", blocks: [
          { p: "You have the right to withdraw from this contract within 14 days without giving any reason. The withdrawal period will expire after 14 days from the day the contract is concluded (when you enter the code from our email, section 3)." },
          { p: `To exercise the right of withdrawal, you must inform us (${withdrawalAddressee()}) of your decision to withdraw from this contract by an unequivocal statement (for example an email or a letter sent by post). You may use the model withdrawal form below, but it is not obligatory. Deleting your account (Settings → Delete account) also counts as withdrawal.` },
          { p: "To meet the withdrawal deadline, it is sufficient for you to send your communication concerning your exercise of the right of withdrawal before the withdrawal period has expired." },
          { h: "Effects of withdrawal" },
          { p: "If you withdraw from this contract, we end your membership and delete your account. As NRIClub is free, there are no payments to reimburse and nothing for you to pay." },
        ] } },
        { box: { title: "Model withdrawal form", blocks: [
          { p: "(Complete and return this form only if you wish to withdraw from the contract.)" },
          { ul: [
            `To: ${withdrawalAddressee()}`,
            "I/We (*) hereby give notice that I/We (*) withdraw from my/our (*) contract for the provision of the following service: membership of NRIClub",
            "Concluded on (*): ________",
            "Name of consumer(s): ________",
            "Address of consumer(s): ________",
            "Email address used for NRIClub: ________",
            "Signature of consumer(s) (only if this form is sent on paper): ________",
            "Date: ________",
          ] },
          { p: "(*) Delete as appropriate." },
        ] } },
      ] },

      { id: "liability", title: "16. Liability", blocks: [
        { ul: [
          "We are liable without limitation for damage we cause intentionally or through gross negligence, for injury to life, body or health, where we have given a guarantee, and wherever the law doesn't allow liability to be limited, in particular under the German Product Liability Act (Produkthaftungsgesetz), Art. 82 of the GDPR and Art. 54 of the EU Digital Services Act.",
          "For slight negligence we are liable only if we breach an essential obligation, that is, one that makes it possible to carry out this contract at all and on which you may normally rely; and then only for the foreseeable damage typical for this kind of contract. Otherwise we are not liable for slight negligence.",
          "These rules also apply to the people who work for us.",
          "NRIClub isn't a party to what members agree among themselves, such as Market deals, rooms, jobs, events, travel or mentoring sessions. Our liability under the first two points stays as it is.",
          "For content that members post, we are responsible as the law provides for hosting services: we act once we know of illegal content (Art. 6 of the EU Digital Services Act).",
        ] },
      ] },

      { id: "law", title: "17. Applicable law and disputes", blocks: [
        { ul: [
          "German law applies. If you are a consumer and live in another country, you keep the protection of the mandatory consumer law of that country (Art. 6(2) of the Rome I Regulation).",
          "There is no arbitration: you can go to the courts that are competent under the law.",
          "Consumer dispute resolution: we are not obliged and not willing to take part in dispute resolution proceedings before a consumer arbitration board (Verbraucherschlichtungsstelle, § 36 VSBG). Please write to us first: we'll try to sort it out.",
        ] },
      ] },

      { id: "contact", title: "18. Contact and points of contact", blocks: [
        { p: ["Questions, reports and anything else: ", mail(), "."] },
        { p: ["Points of contact under the EU Digital Services Act, for authorities (Art. 11 DSA) and for members and anyone else (Art. 12 DSA): ", mail("Digital Services Act"), ". You can write to us in English or German. A person on our team reads and answers every message."] },
      ] },

      { id: "versions", title: "19. Earlier versions", blocks: [
        { ul: [
          [a(`Version ${PREVIOUS_TERMS_VERSION}`, `/terms/${PREVIOUS_TERMS_VERSION}`), " (17 October 2026)"],
          [a("Version 2026-10", "/terms/2026-10"), " (October 2026)"],
        ] },
      ] },
    ],
  };
}

export const termsPath = (version) => (version && version !== TERMS_VERSION && TERMS_ARCHIVE[version] ? `/terms/${version}` : "/terms");

// The Terms a member is about to accept (signup, Get verified, the Terms
// screen): the version the database will record. Until the database knows
// the current version (for 2026-10-23, the travel board's database update),
// that is still the earlier one, shown without the "earlier version" note,
// so a member never accepts one version while reading another.
export function termsDocToAccept(version) {
  if (!version || version === TERMS_VERSION || !TERMS_ARCHIVE[version]) return termsDoc();
  return { ...TERMS_ARCHIVE[version](), subtitle: `Version ${version}`, intro: [] };
}
export const TERMS_URL = `${SITE}/terms`;
