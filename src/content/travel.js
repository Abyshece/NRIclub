// ============================================================================
// The travel board ("Flying to or from India"): members match trips between
// their city abroad and India, for a travel companion (for example parents
// flying alone) or to carry documents or a small open item as a favour.
// The board is src/member/TravelBoard.jsx; the database's side is
// supabase/migrations/20261026000000_travel_board.sql.
// ============================================================================

// The version of the rules below. The database records which version each
// member ticked and asks again when it changes: change it together with
// private.travel_rules_version() (in a new migration) whenever the rules
// change. supabase/tests/rls_test.py checks they're the same.
export const TRAVEL_RULES_VERSION = "2026-10-26";

export const CUSTOMS_LINKS = [
  { label: "German customs (zoll.de)", href: "https://www.zoll.de" },
  { label: "Indian customs (cbic.gov.in)", href: "https://www.cbic.gov.in" },
];

// The board's rules, shown on the board and in the checklist a member ticks
// once before their first post or message from the board. The Terms of Use
// (section 7, "Travel board") say the same.
export const TRAVEL_RULES = [
  {
    title: "Documents and small open items only.",
    text: "The traveller sees and checks every item in person before the trip. No sealed parcels, no cash, gold or jewellery, no medicines, no food, and nothing customs restricts.",
    customs: true,
  },
  {
    title: "You're responsible for your luggage.",
    text: "Everything in your luggage is your responsibility at customs. If in doubt, say no.",
  },
  {
    title: "Favours only.",
    text: "No payment of any kind, and no \"courier fees\". Offering or asking for money gets the post removed.",
  },
  {
    title: "Meet in a public place.",
    text: "Hand things over in a public place. Never share passport copies, OTPs or bank details.",
  },
  {
    title: "Report anything suspicious.",
    text: "Use Report on the post or the message. A person on our team looks at every report.",
  },
];

// The two kinds of post (travel_posts.kind).
export const TRAVEL_KINDS = {
  offer: { label: "I'm travelling", badge: "Travelling", helpLabel: "I can help with" },
  request: { label: "I need help", badge: "Needs help", helpLabel: "I need" },
};

// What a traveller can help with, or what a member needs (travel_posts.help).
export const TRAVEL_HELP = {
  companion: { offer: "Travel companion", request: "A companion for someone (e.g. my parents)", short: "Companion" },
  documents: { offer: "Documents", request: "Send or bring documents", short: "Documents" },
  items: { offer: "Small open items", request: "A small open item", short: "Small open items" },
};
export const TRAVEL_HELP_KEYS = ["companion", "documents", "items"];

export const NOTE_LIMIT = 500;
export const WINDOW_DAYS = 120; // a request's earliest and latest date, at most this far apart
export const AHEAD_DAYS = 365; // how far ahead a trip can be

// Suggestions for the city fields (members can type any city): cities
// abroad with many Indians, then cities in India.
export const CITIES_ABROAD = [
  "Frankfurt", "Munich", "Berlin", "Düsseldorf", "Hamburg", "Stuttgart", "Cologne", "Hannover", "Nuremberg",
  "Leipzig", "Dresden", "Bonn", "Karlsruhe", "Mannheim", "Darmstadt", "Aachen", "Heidelberg", "Erlangen",
  "Vienna", "Zurich", "Amsterdam", "Brussels", "Paris", "London", "Dublin", "Milan", "Copenhagen",
  "Stockholm", "Helsinki", "Oslo", "Warsaw", "Prague", "Madrid", "Barcelona", "Lisbon", "Rome",
];
export const CITIES_INDIA = [
  "Delhi", "Mumbai", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Ahmedabad", "Pune", "Kochi",
  "Thiruvananthapuram", "Goa", "Amritsar", "Chandigarh", "Jaipur", "Lucknow", "Kozhikode", "Visakhapatnam",
  "Coimbatore", "Mangaluru", "Nagpur", "Indore", "Bhubaneswar", "Varanasi", "Guwahati", "Tiruchirappalli",
  "Madurai", "Vadodara", "Surat",
];

// Other names of the same city. The database matches routes the same way
// (private.travel_city_key): change both together; supabase/tests/rls_test.py
// compares them.
export const CITY_ALIASES = {
  "new delhi": "delhi",
  bangalore: "bengaluru",
  bombay: "mumbai",
  calcutta: "kolkata",
  madras: "chennai",
  cochin: "kochi",
  trivandrum: "thiruvananthapuram",
  calicut: "kozhikode",
  vizag: "visakhapatnam",
  gurgaon: "gurugram",
  muenchen: "munich",
  munchen: "munich",
  koeln: "cologne",
  koln: "cologne",
  "frankfurt am main": "frankfurt",
  "frankfurt/main": "frankfurt",
  "frankfurt a.m.": "frankfurt",
  dusseldorf: "duesseldorf",
  nuernberg: "nuremberg",
  nurnberg: "nuremberg",
  wien: "vienna",
  zurich: "zuerich",
};

// A city's name written plainly: the part before a comma, without case,
// extra spaces or a part in brackets, with ä, ö, ü and ß written out.
const plainCity = (name) => String(name || "").split(",")[0].toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/\s*\(.*\)\s*$/, "").replace(/\s+/g, " ").trim();

// A city's name for matching: written plainly, with the other names above
// made one ("New Delhi, India" and "Delhi" match).
export function cityKey(name) {
  const k = plainCity(name);
  return CITY_ALIASES[k] || k;
}

// Whether a city typed into a filter (perhaps only its start) is the city
// with this key: "Frankfurt am Main", "Münch" and "Bangal" all count.
export function cityFits(typed, key) {
  const t = plainCity(typed);
  if (!t) return true;
  const names = [key, ...Object.keys(CITY_ALIASES).filter((a) => CITY_ALIASES[a] === key)];
  return cityKey(typed) === key || names.some((n) => n.startsWith(t));
}

// A city as the database takes it (private.travel_city_ok): 2 to 60
// characters, starting with a letter, without digits or symbols other than
// . , ' ’ ( ) / -, and nothing like a web address (a dot followed by two
// letters).
export function cityProblem(name) {
  const s = String(name || "").replace(/\s+/g, " ").trim();
  if (!s) return "Please fill in the city.";
  if (s.length < 2 || s.length > 60 || !/^\p{L}/u.test(s) || /[0-9!"#$%&*+:;<=>?@[\\\]^_`{|}~]/.test(s) || /\.\p{L}{2}/u.test(s)) {
    return "Please write the city's name in letters (2 to 60 characters, no numbers).";
  }
  return "";
}

// A flight number as the database takes it, in capitals ("LH 760").
export const FLIGHT_PATTERN = /^[A-Z0-9]{2,3} ?[0-9]{1,4}[A-Z]?$/;
export const cleanFlight = (s) => String(s || "").replace(/\s+/g, " ").trim().toUpperCase();

// Dates are "YYYY-MM-DD" strings (as the date inputs and the database give
// them). addDays works on the calendar date, whatever the time zone.
export function addDays(day, n) {
  const [y, m, d] = String(day).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

const monthShort = (day, withYear) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
  day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC",
});

// "Sat 12 Dec 2026" for one day; "10–20 Dec 2026" or "28 Dec 2026 – 5 Jan
// 2027" for a window.
export function tripDates(from, to) {
  if (!from) return "";
  if (!to || to === from) {
    return new Date(`${from}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  }
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  if (sameYear && from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))}–${monthShort(to, true)}`;
  return sameYear ? `${monthShort(from, false)} – ${monthShort(to, true)}` : `${monthShort(from, true)} – ${monthShort(to, true)}`;
}

// The route in a few words, for a message and a report: "Frankfurt → Delhi, 12 Dec".
export const tripTitle = (p) => `${p.from_city} → ${p.to_city}, ${p.date_from === p.date_to ? monthShort(p.date_from, false) : `${monthShort(p.date_from, false)}–${monthShort(p.date_to, false)}`}`;

// Two posts match: one of each kind, the same route, dates that overlap and
// help in common (as private.notify_travel_matches in the database).
export function isMatch(a, b) {
  return a.kind !== b.kind && a.user_id !== b.user_id
    && (a.from_key || cityKey(a.from_city)) === (b.from_key || cityKey(b.from_city))
    && (a.to_key || cityKey(a.to_city)) === (b.to_key || cityKey(b.to_city))
    && a.date_from <= b.date_to && b.date_from <= a.date_to
    && (a.help || []).some((h) => (b.help || []).includes(h));
}

// The next 12 months from a day ("YYYY-MM-DD"): [{ value: "2026-12", label: "December 2026" }].
export function nextMonths(today, count = 12) {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return { value: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) };
  });
}

// Whether a post's dates touch a month ("YYYY-MM").
export const inMonth = (p, month) => p.date_from.slice(0, 7) <= month && p.date_to.slice(0, 7) >= month;

// The tag in front of the first message to a post's author, so the chat
// shows which trip it's about (as "[MARKETPLACE: ...]" for the Market).
export const travelTag = (p) => `[TRAVEL: ${tripTitle(p).replace(/[[\]]/g, "")}] `;
