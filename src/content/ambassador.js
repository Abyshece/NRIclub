// The ambassador panel (/ambassador, src/member/AmbassadorPanel.jsx): the
// agreement a city ambassador accepts once per version before they use it,
// the ambassador guidelines, and the words of the welcome message and the
// print toolkit. The database's side is
// supabase/migrations/20261027000000_ambassador_panel.sql. (Applications to
// be an ambassador are in ./ambassadors.js.)
//
// The agreement is between NRIClub and the ambassador only: it isn't part of
// the Terms of Use, which members accept and which still apply to the
// ambassador as a member.
import { CONTACT_EMAIL } from "./legal/doc.js";
import { slug } from "./slug.js";

// The version of the agreement below. The database records which version
// each ambassador accepted and asks again when it changes: change it
// together with private.ambassador_agreement_version() (in a new migration)
// whenever the agreement changes. supabase/tests/rls_test.py checks they're
// the same.
export const AMBASSADOR_AGREEMENT_VERSION = "2026-10-27";

export const AMBASSADOR_AGREEMENT = {
  title: "The ambassador agreement",
  intro: "Before you use the panel, please read this short agreement between you and NRIClub. It's separate from our Terms of Use, which still apply to you as a member.",
  points: [
    {
      title: "A volunteer role.",
      text: "Being a city ambassador is voluntary and unpaid. It isn't a job, and NRIClub doesn't pay you or cover your costs unless we agree it with you in writing first.",
    },
    {
      title: "What you do for NRIClub.",
      text: "You act for NRIClub only in the tasks in this panel: welcoming newcomers, pointing members to open questions, looking after your city's group (its description and starter post), hosting meetups and flagging problems to our team. Don't make promises or speak for NRIClub beyond that.",
    },
    {
      title: "Members' data stays confidential.",
      text: "What you see in the panel about members (who joined, their names and photos, their questions) is confidential. Use it only for these tasks, on NRIClub. Don't copy or export it, don't contact members outside NRIClub with it, don't use it for anything commercial, and don't share it with anyone.",
    },
    {
      title: "Follow the guidelines.",
      text: "Follow our moderation guidelines and the ambassador guidelines in this panel.",
    },
    {
      title: "Flag it, don't judge it.",
      text: "Never remove, hide or judge members' content yourself, and don't tell members they broke a rule. If something looks wrong, use Flag to the team: a person on our team decides.",
    },
    {
      title: "Your meetups.",
      text: "Meetups you host are your own events, as for any member: you organise them and you're responsible for them, and they follow our Terms of Use. The mark \"Hosted by the city ambassador\" tells members who you are; it doesn't make NRIClub the organiser.",
    },
    {
      title: "Ending the role.",
      text: "We can end the role at any time, and you can step down at any time, in this panel. The agreement then ends, but what it says about members' data still applies.",
    },
  ],
  confirm: "I have read the ambassador agreement and I agree to it.",
  submit: "Agree and open the panel",
};

// Short, in step with "Communities and ambassadors" in
// docs/compliance/moderation-guidelines.md.
export const AMBASSADOR_GUIDELINES = [
  "Welcome newcomers within a few days, with a friendly message in your own words. One message is enough: don't follow up if they don't answer.",
  "Answer questions you know about, or point the asker to a guide. Don't give legal, tax or medical advice as NRIClub.",
  "Keep the group's description and starter post short, current and useful for someone new.",
  "Host meetups in public places that are easy to reach, and say clearly what they cost, if anything.",
  "Treat every member the same, whatever their origin, religion, caste, sex or age.",
  "Never remove, hide or judge content yourself. Flag it to the team: a person on our team decides and tells the people concerned.",
  "Keep what you see in the panel to yourself, and contact members only on NRIClub.",
  "If someone is in danger, call the emergency number (112 in the EU) first, then flag it to the team.",
];

// The welcome message the panel puts in the box, for the ambassador to
// change before sending.
export const welcomeMessage = ({ firstName, city }) =>
  `Hi ${firstName || "there"}, welcome to NRIClub ${city}! I'm the city's ambassador. If you have a question about settling in, ask in our city group or message me here. Hope to see you at a meetup soon.`;

// The mark on an event its organiser, the city's ambassador, hosts.
export const HOSTED_LABEL = "Hosted by the city ambassador";
// The title "Create a meetup" suggests.
export const MEETUP_TITLE = "Chai meetup";

// The group's description, as the database allows it.
export const GROUP_DESCRIPTION = { min: 10, max: 1000 };

// The poster and the stickers: the line, and the city page they point to
// (the QR code), marked as coming from an ambassador.
export const posterLine = (city) => `Indians in ${city}? Join your city's group.`;
export const cityJoinUrl = (city) => `https://nriclub.app/city/${slug(city)}?ref=ambassador`;
export const cityJoinText = (city) => `nriclub.app/city/${slug(city)}`;
export const AMBASSADOR_QUESTIONS = `Questions? ${CONTACT_EMAIL}`;
