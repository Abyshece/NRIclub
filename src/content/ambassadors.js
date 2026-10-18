// City ambassadors: the application form's words and choices (the site,
// src/AmbassadorApply.jsx) and our team's reply email (the admin panel,
// src/admin/AmbassadorsView.jsx). The database keeps the same choices
// (private.ambassador_hours, supabase/migrations/20261024000000_ambassador_applications.sql)
// and the same limits (lengths, statuses).
import { CONTACT_EMAIL } from "./legal/doc.js";

// How much time an applicant can give (key: as the database stores it).
export const AMBASSADOR_HOURS = [
  { key: "under_1", label: "Less than an hour a week" },
  { key: "1_2", label: "1 to 2 hours a week" },
  { key: "3_5", label: "3 to 5 hours a week" },
  { key: "over_5", label: "More than 5 hours a week" },
];
export const hoursLabel = (key) => AMBASSADOR_HOURS.find((h) => h.key === key)?.label || key || "";

export const AMBASSADOR_LIMITS = {
  name: 200,
  email: 254,
  city: 60,
  organisation: 200,
  linkedin: 200,
  motivationMin: 20,
  motivationMax: 1000,
};

export const AMBASSADOR_FORM = {
  title: "Become a city ambassador",
  intro: "Ambassadors welcome Indians who are new to their city, share NRIClub at their university or workplace, and get people together now and then, for chai, a walk or a festival. It can take as little as an hour or two a month. Tell us a little about yourself and a person on our team will write to you.",
  fields: {
    name: "Your name",
    email: "Your email address",
    emailHint: "We'll write to you here about your application.",
    signedIn: "From your NRIClub account.",
    city: "City",
    cityHint: "The city where you'd be ambassador.",
    country: "Country",
    organisation: "University or employer",
    organisationHint: "Where you study or work, so we know who you could reach.",
    linkedin: "LinkedIn profile",
    linkedinHint: "Helps us get to know you, e.g. linkedin.com/in/your-name",
    motivation: "Why would you like to be an ambassador?",
    motivationHint: "A few sentences: how long you've lived there, what you'd like to do, people or groups you know.",
    hours: "How much time could you give?",
  },
  submit: "Send application",
  privacy: "We use these details only to look at your application and to write to you about it. Only our team sees them.",
  privacyLink: "How we handle them",
  privacyHref: "/privacy#ambassadors",
  sentTitle: "Thank you, your application is in",
  sent: (email) => `A person on our team will read it and write to you at ${email}, usually within a week.`,
  sentMember: "If we agree, you'll see the ambassador badge on your profile and your city's group.",
  sentJoin: "Not a member yet? Join NRIClub for free in the meantime: ambassadors are members our team has checked.",
  byEmailTitle: "Please send it by email",
  byEmail: `Applications can't be sent from here just yet. Your email app opens with your application filled in: send it to ${CONTACT_EMAIL}, and a person on our team will write back.`,
};

export const mailtoLink = (to, { subject, body }) =>
  `mailto:${encodeURIComponent(to || "").replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

// The application as an email to us, for when the database can't take it
// yet (before the 2026-10-24 update).
export function applicationEmail(a) {
  return mailtoLink(CONTACT_EMAIL, {
    subject: `I'd like to be a city ambassador${a.city ? ` in ${a.city}` : ""}`,
    body: [
      `Name: ${a.name || ""}`,
      `City: ${a.city || ""}${a.country ? `, ${a.country}` : ""}`,
      `University or employer: ${a.organisation || ""}`,
      `LinkedIn: ${a.linkedinUrl || ""}`,
      `Time I could give: ${hoursLabel(a.hoursPerWeek)}`,
      "",
      `Why I'd like to be an ambassador: ${a.motivation || ""}`,
    ].join("\n"),
  });
}

// Our team's reply from hello@nriclub.app, prefilled in the admin panel.
// name: the applicant's first name.
export function ambassadorReplyEmail({ ref, name, city }) {
  return {
    subject: `Your NRIClub ambassador application ${ref}`,
    body: [
      `Hello${name ? ` ${name}` : ""},`,
      `Thank you for applying to be NRIClub's ambassador in ${city} (reference ${ref}). We'd love to hear a bit more. When would suit you for a short call?`,
      "The NRIClub team",
    ].join("\n\n"),
  };
}

export const APPLICATION_STATUS = {
  new: { label: "New", tone: "orange" },
  contacted: { label: "Contacted", tone: "blue" },
  accepted: { label: "Accepted", tone: "green" },
  declined: { label: "Declined", tone: "gray" },
};
