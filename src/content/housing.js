// ============================================================================
// Find a place: housing in the Market, searched by city and dates, and
// "Looking for a place" posts that hear about matching listings. The panel is
// src/member/HousingSearch.jsx; the database's side is
// supabase/migrations/20261030000000_housing_search.sql.
//
// No search, filter or form field asks about gender, religion, caste,
// origin, nationality, language, diet or anything like it (German General
// Equal Treatment Act, AGG): keep it that way, including in the hints.
// ============================================================================

// The kinds of place (housing_listings.kind, housing_wanted.kinds), in the
// order the site shows them. The database has the same keys
// (private.housing_kinds()); supabase/tests/rls_test.py checks they match.
export const HOUSING_KINDS = {
  wg_room: { label: "WG room", hint: "A room in a shared flat", a: "a WG room" },
  sublet: { label: "Sublet", hint: "Zwischenmiete: someone's place while they're away", a: "a sublet" },
  flat: { label: "Whole flat", hint: "A flat just for you", a: "a whole flat" },
  short_stay: { label: "Short stay", hint: "A few days or weeks", a: "a short stay" },
  house: { label: "House", hint: "A whole house", a: "a house" },
};
export const HOUSING_KIND_KEYS = Object.keys(HOUSING_KINDS);

// The database's limits per member (private.housing_rate_limit and
// public.housing_status; the test compares them): listings and looking
// posts a day and in 30 days, and changes to a listing's details a day.
export const LIMITS = {
  listing: { day: 5, month: 10 },
  looking: { day: 3, month: 5 },
  change: { day: 10 },
};

export const FLEX_DAYS = 7; // "flexible ±1 week"
export const OPEN_ENDED_DAYS = 60; // an open-ended listing, or a looking post without an end date, is shown this long
export const KEEP_EXPIRED_DAYS = 30; // and deleted this long after it expired
export const AHEAD_DAYS = 365; // how far ahead the dates can be
export const NOTE_LIMIT = 500;
export const MAX_RENT = 20000;
export const MAX_DEPOSIT = 100000;
export const MAX_SIZE = 2000;

// Shown above the listings, in each listing and in the form.
export const SAFETY_TITLE = "Stay safe";
export const SAFETY_POINTS = [
  "Never pay a deposit or rent before you've seen the place (in person, or by video with the landlord) and signed a contract.",
  "Never pay by Western Union, crypto or gift cards.",
  "Report a listing that seems wrong.",
];
export const SAFETY_TEXT = SAFETY_POINTS.join(" ");

export const COPY = {
  title: "Find a place",
  intro: "Search for a room, a sublet or a flat by city and dates. Or tell members what you're looking for, and we'll let you know when a matching place is posted.",
  comingSoon: "Searching housing by city and dates isn't available yet. Please check back in a few days. You can still browse and post housing listings below.",
  loadError: "The housing search couldn't be loaded. Please try again.",
  descHint: "Describe the place: the rooms, the area, transport, and what the rent includes.",
  lookingNoteHint: "e.g. Starting a new job in March. Looking for a quiet room near the S-Bahn.",
  lookingExplain: `We'll send you a notification when someone posts a place in your city that fits your dates, give or take a week. Your post is only shown to members whose listing matches it. It ends after your last date, or after ${OPEN_ENDED_DAYS} days if you don't give one.`,
  matchesExplain: "Members whose \"Looking for a place\" post fits your listing. Only you see this list.",
  anmeldungHint: "You can register your address there (Anmeldung).",
  // Under the description of a housing listing and the note of a "Looking
  // for a place" post (Terms of Use, section 7).
  aggNote: "No requirements about gender, origin, religion, disability, age or sexual identity (Germany's General Equal Treatment Act, AGG).",
  noResults: "No places match your search yet.",
  noResultsTip: "Try other dates, turn on \"flexible ±1 week\", or post what you're looking for and we'll let you know.",
};

// ---------------------------------------------------------------------------
// DATES AND MONEY
// ---------------------------------------------------------------------------

// Dates are "YYYY-MM-DD" strings (as the date inputs and the database give
// them). addDays works on the calendar date, whatever the time zone.
export function addDays(day, n) {
  const [y, m, d] = String(day).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

const dayText = (day, withYear = true) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
  day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC",
});

// "1 Mar 2027", "1–31 Mar 2027", "1 Mar – 31 May 2027", "1 Dec 2026 – 28 Feb 2027".
export function rangeText(from, until) {
  if (!from) return "";
  if (!until || until === from) return dayText(from);
  const sameYear = from.slice(0, 4) === until.slice(0, 4);
  if (sameYear && from.slice(0, 7) === until.slice(0, 7)) return `${Number(from.slice(8))}–${dayText(until)}`;
  return `${dayText(from, !sameYear)} – ${dayText(until)}`;
}
export const shortDay = (day) => (day ? dayText(day) : "");

// When a place is free: "Free from 1 Mar 2027, open-ended" or "Free 1 Mar – 31 May 2027".
export const availability = (from, until) => (until ? `Free ${rangeText(from, until)}` : `Free from ${dayText(from)}, open-ended`);

// "€1,250".
export const money = (n) => `€${Number(n || 0).toLocaleString("en-GB")}`;

// ---------------------------------------------------------------------------
// WORDS FOR A LISTING, A SEARCH RESULT AND A LOOKING POST
// ---------------------------------------------------------------------------

export const kindLabel = (k) => HOUSING_KINDS[k]?.label || "Place";

// "WG room or Sublet", "WG room, Sublet or Whole flat".
export function kindsText(kinds) {
  const labels = HOUSING_KIND_KEYS.filter((k) => (kinds || []).includes(k)).map(kindLabel);
  if (labels.length <= 1) return labels[0] || "Any place";
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

// How a search result fits the member's dates (public.search_housing's fit,
// free_days and free_from/free_until; wantedDays: the length of their dates,
// null without an end date).
export function fitLabel(r, wantedDays) {
  if (!r?.fit) return "";
  if (r.fit === "full") return "Free for all your dates";
  if (r.fit === "flexible") return "Within a week of your dates";
  if (wantedDays && r.free_days != null) return `Free ${r.free_days} of your ${wantedDays} days`;
  if (r.free_until) return r.free_from && r.free_from !== r.available_from ? `Free until ${dayText(r.free_until)}` : `Free ${rangeText(r.free_from, r.free_until)}`;
  return `Free from ${dayText(r.free_from || r.available_from)}`;
}

// A looking post in one line: "WG room or Sublet in Munich · 1 Mar – 31 May 2027 · up to €700 warm".
export function lookingSummary(w) {
  const dates = w.date_to ? rangeText(w.date_from, w.date_to) : `from ${dayText(w.date_from)}, no end date`;
  return [`${kindsText(w.kinds)} in ${w.city}`, dates, w.max_rent ? `up to ${money(w.max_rent)} warm` : ""]
    .filter(Boolean).join(" · ");
}

// What a looking post still does: "Active until 31 May 2027", "Turned off", "Ended on 31 May 2027".
export function lookingState(w, today) {
  if (w.expires_on < today) return { key: "expired", text: `Ended on ${dayText(w.expires_on)}` };
  if (!w.active) return { key: "off", text: "Turned off: no notifications" };
  return { key: "active", text: `Active until ${dayText(w.expires_on)}` };
}

// When a listing of the member's stops being shown.
export function listingState(h, today) {
  if (!h) return null;
  if (h.expires_on < today) return { key: "expired", text: `Expired on ${dayText(h.expires_on)}. Members don't see it any more.` };
  const left = daysBetween(today, h.expires_on);
  return { key: left <= 7 ? "soon" : "shown", text: left === 0 ? "Shown until today" : `Shown until ${dayText(h.expires_on)}` };
}

// The first message to a looking member, about the owner's listing (the
// "[MARKETPLACE: ...]" tag shows it in Messages, as for any listing).
export const marketTag = (title) => `[MARKETPLACE: ${String(title || "").replace(/[[\]]/g, "")}] `;

// ---------------------------------------------------------------------------
// CHECKS BEFORE SAVING (the database checks the same and has the last word)
// ---------------------------------------------------------------------------

const wholeNumber = (v) => /^\d+$/.test(String(v ?? "").trim());

// The details of a listing. f: { kind, city, from, until, openEnded, rent,
// deposit, size }. A listing being edited keeps a "from" date that has
// passed (initialFrom).
export function listingProblem(f, today, initialFrom = null) {
  if (!f.kind || !HOUSING_KINDS[f.kind]) return "Please choose what kind of place it is.";
  if (!String(f.city || "").trim()) return "Please choose the city the place is in.";
  if (!f.from) return "Please choose the day the place is free from.";
  if (!f.openEnded && !f.until) return "Please choose the day it's free until, or tick \"open-ended\".";
  if (!f.openEnded && f.until < f.from) return "The \"until\" date is before the \"from\" date. Please check the dates.";
  if ((f.from < today && f.from !== initialFrom) || (!f.openEnded && f.until < today)) return "That date has passed. Please choose today or a later date.";
  const last = addDays(today, AHEAD_DAYS);
  if (f.from > last || (!f.openEnded && f.until > last)) return "Please choose dates within the next 12 months. If the place is free for longer, tick \"open-ended\".";
  if (!wholeNumber(f.rent) || Number(f.rent) < 1 || Number(f.rent) > MAX_RENT) return "Please give the warm rent per month in euros (a whole number).";
  if (!wholeNumber(f.deposit) || Number(f.deposit) > MAX_DEPOSIT) return "Please give the deposit in euros (0 if there is none).";
  if (String(f.size ?? "").trim() && (!wholeNumber(f.size) || Number(f.size) < 1 || Number(f.size) > MAX_SIZE)) return "Please give the size in m² as a whole number, or leave it empty.";
  return "";
}

// A looking post. f: { kinds, city, from, until, rent, note }.
export function lookingProblem(f, today, initialFrom = null) {
  if (!(f.kinds || []).length) return "Please choose at least one kind of place.";
  const city = String(f.city || "").replace(/\s+/g, " ").trim();
  if (!city) return "Please say which city you're looking in.";
  if (city.length < 2 || city.length > 60 || !/^\p{L}/u.test(city) || /[0-9!"#$%&*+:;<=>?@[\\\]^_`{|}~]/.test(city) || /\.\p{L}{2}/u.test(city)) {
    return "Please write the city's name in letters (2 to 60 characters, no numbers).";
  }
  if (!f.from) return "Please choose the day you need the place from.";
  if (f.until && f.until < f.from) return "The \"until\" date is before the \"from\" date. Please check the dates.";
  if ((f.from < today && f.from !== initialFrom) || (f.until && f.until < today)) return "That date has passed. Please choose today or a later date.";
  const last = addDays(today, AHEAD_DAYS);
  if (f.from > last || (f.until && f.until > last)) return "Please choose dates within the next 12 months.";
  if (String(f.rent ?? "").trim() && (!wholeNumber(f.rent) || Number(f.rent) < 1 || Number(f.rent) > MAX_RENT)) return "Please give the highest warm rent in euros as a whole number, or leave it empty.";
  if ((f.note || "").length > NOTE_LIMIT) return `Please keep the note to ${NOTE_LIMIT} characters.`;
  return "";
}
