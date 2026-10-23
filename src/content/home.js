// The homepage's words that the build also writes into index.html (see
// vite.config.js), so the page has its text before the app starts. Change
// them here and both stay the same.

export const HOME_PILL = "For NRIs and every Indian abroad";
export const HOME_LEAD = "Ask anything, find a room or a job referral, discover desi groceries and doctors, and celebrate Diwali with Indians in your city.";

// Said next to every Join button. New members can use NRIClub while their
// check is pending, so it's "checks every new member", not "every member is
// verified"; and nothing on NRIClub asks for a phone number.
export const TRUST_LINE = "Free · Our team checks every new member · Your phone number stays private";

// The city buttons under "Find your city's group": big cities around the
// world (a city with 5 or more members moves to the front).
export const POPULAR_CITIES = ["London", "Toronto", "New York City", "Dubai", "Singapore", "Sydney", "San Francisco", "Melbourne", "Doha", "Frankfurt", "Berlin", "Auckland"];

// Under the city buttons: the way to What's on (Indian events in Germany by
// other organisers, /whats-on). The second part is the link.
export const WHATS_ON_TEASER = ["Living in Germany?", "See what's on: Diwali, Garba nights, concerts and more →"];

// The guides listed on the homepage (by slug, from essentials.js).
export const FEATURED_GUIDES = [
  "your-first-weeks-abroad-a-checklist",
  "renewing-your-indian-passport-abroad",
  "oci-card-the-basics",
  "nre-nro-and-fcnr-accounts-explained",
  "parents-visiting-you-abroad",
  "sending-money-home-getting-a-good-deal",
];

// Who runs NRIClub, for "Who's behind NRIClub". While it's null the block
// says only that NRIClub is independent and how to reach us. Fill it in to
// add the founder's line, e.g. { name: "Asha Rao", city: "Berlin", since: 2016 }.
export const FOUNDER = null;

export const SHARE_TEXT = "NRIClub: a free community for Indians abroad, with city groups around the world and free guides on passports, OCI, NRE/NRO accounts and taxes. Our team checks every new member. https://nriclub.app";

// "Our mission" on the homepage (MissionSection.jsx, #mission). The 35
// million: India's Ministry of External Affairs counts about 35 million
// NRIs and people of Indian origin.
export const MISSION = {
  title: "Every Indian abroad, one community.",
  lead: "More than 35 million Indians and people of Indian origin live outside India. Today we're split across thousands of chat groups: many go quiet, links stop working, and last year's best answer is lost in the scroll. Our goal is one place where every Indian abroad can find their city, get help from people who've been there, and pass it on.",
  goals: [
    { title: "Connect every NRI", text: "One account for every city where Indians live. When you move, your community moves with you." },
    { title: "Real people, a safe space", text: "A person on our team checks every new member, and your phone number stays private." },
    { title: "Help that lasts", text: "Answers, guides and mentors stay for the next person, instead of scrolling away in a chat." },
    { title: "Run with the community", text: "City ambassadors, local meetups and members helping members. Independent: not an agency, a political group or a government office." },
  ],
  // Where we're going: a plan, so it says what we're doing now and next.
  path: [
    { when: "Now", text: "Germany first: city groups, What's on and our first city ambassadors." },
    { when: "Next", text: "Cities across Europe." },
    { when: "Our goal", text: "Every city in the world where Indians live." },
  ],
};
