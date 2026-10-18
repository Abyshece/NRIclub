import { findCity } from "./findCity";
import { slug } from "./slug";

// ============================================================================
// WHAT'S ON: Indian events in Germany that OTHER organisers run (temples,
// associations, student groups, promoters), listed for information at
// nriclub.app/whats-on, on the city pages and in the members' Events.
// NRIClub doesn't run, sell or vouch for them: every listing links to the
// organiser's own page, and the pages say so.
//
// The build checks the list (validateWhatsOn, called from vite.config.js) and
// stops with a message on any mistake. Past events are never shown: the build
// leaves them out of the pages it writes, and the browser leaves out any that
// have ended since. Delete them from the list now and then; the build warns
// when some are there.
//
// One item (fields with ? may be left out):
//   {
//     id: "diwali-mela-berlin-2026",   // a-z, 0-9 and dashes, unique: the
//                                      // link nriclub.app/whats-on#<id>
//     title: "Diwali Mela Berlin",
//     category: "festival",            // a key of CATEGORY_LABELS, below
//     start: "2026-11-07",             // YYYY-MM-DD
//     end?: "2026-11-08",              // last day, for events over several days
//     time?: "17:00",                  // as the organiser gives it, e.g. "17:00"
//                                      // or "18:30–23:00" (24-hour clock)
//     city: "Berlin",                  // English or German name: München,
//                                      // Köln, Nürnberg and Frankfurt am Main work
//     venue?: "Urania",                // the hall, temple or club
//     area?: "Schöneberg",             // the district, if it helps
//     organiser: "Indian Association Berlin e.V.",
//     price?: "Free" | "From €15" | "€10, children free",
//     language?: "Hindi and English",
//     summary: "Lights, food stalls and dance on stage.",  // one line, at most
//                                      // 160 characters, our own words
//     url: "https://…",                // the organiser's page or the ticket
//                                      // page (https only)
//   }
//
// Take the facts from the organiser's own page, write the summary in our own
// words, and leave out anything not confirmed (price, time).
// ============================================================================

export const WHATS_ON = [];

// The kinds of event, as their tags read on the page.
export const CATEGORY_LABELS = {
  festival: "Festival",
  music: "Music and dance",
  party: "Parties and club nights",
  comedy: "Comedy",
  film: "Film",
  food: "Food",
  sport: "Sport and cricket",
  spiritual: "Temple and spiritual",
  community: "Community and family",
  talk: "Talks and networking",
  culture: "Art and exhibitions",
};

// The words both the page and the build (vite.config.js) use.
export const WHATS_ON_PATH = "/whats-on";
export const WHATS_ON_TITLE = "What's on for Indians in Germany";
export const WHATS_ON_LEAD = "Diwali and Durga Puja celebrations, Garba nights, concerts, Bollywood nights, comedy and talks: Indian events across Germany, in one list.";
export const WHATS_ON_DESCRIPTION = "Indian events in Germany: Diwali, Navratri and Durga Puja celebrations, concerts, Bollywood nights, comedy and talks in Berlin, Munich, Frankfurt and more.";
export const WHATS_ON_NOTE = "Events run by other organisers, listed for information. NRIClub is not the organiser; details can change, so check the organiser's page before you go.";
export const WHATS_ON_SHORT_NOTE = "Run by other organisers, listed for information. Check the organiser's page before you go.";
export const whatsOnCta = (city) => `Going? Join NRIClub free to meet Indians in ${city || "your city"} who are going too.`;
export const WHATS_ON_SUBMIT = "Running an Indian event in Germany? Send us the link and we'll look at listing it, free.";

const FIELDS = ["id", "title", "category", "start", "end", "time", "city", "venue", "area", "organiser", "price", "language", "summary", "url"];
const REQUIRED = ["id", "title", "category", "start", "city", "organiser", "summary", "url"];
const MAX_SUMMARY = 160;

// "2026-11-07" as a real day, or null ("2026-02-30" isn't one).
const parseDay = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
};

// Today in Germany, as "YYYY-MM-DD": the events are there, so the day turns
// at midnight in Berlin wherever the page is built or opened.
export function todayInGermany(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const get = (type) => parts.find((p) => p.type === type)?.value;
    if (get("year") && get("month") && get("day")) return `${get("year")}-${get("month")}-${get("day")}`;
  } catch (e) {}
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// The day an event is listed under: its first day, or today for one that
// started already and is still on.
const listedDay = (e, today) => (today && e.start < today ? today : e.start);
// "9:00" sorts before "18:00"; no time (or one that isn't a clock time) last.
const timeKey = (e) => {
  const m = /^(\d{1,2})[:.](\d{2})/.exec(e.time || "");
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "99";
};

// The events still to come (or still on) on `today` ("YYYY-MM-DD"), soonest
// first. An event is past once its last day (end, or else start) is before today.
export function upcoming(list = WHATS_ON, today = todayInGermany()) {
  return list
    .filter((e) => (e.end || e.start) >= today)
    .sort((a, b) => listedDay(a, today).localeCompare(listedDay(b, today))
      || timeKey(a).localeCompare(timeKey(b)) || a.title.localeCompare(b.title));
}

// The city as NRIClub names it ("München" -> "Munich"), and its slug, as in
// /city/<slug> and /whats-on?city=<slug>.
export const eventCity = (e) => findCity(e.city) || String(e.city || "").trim();
export const citySlug = (text) => slug(findCity(text) || text);
export const eventCitySlug = (e) => citySlug(e.city);

// The events in one city (by its slug, or any spelling of its name).
export const byCity = (city, list = WHATS_ON) => {
  const key = citySlug(city);
  return key ? list.filter((e) => eventCitySlug(e) === key) : [];
};

// The cities that have events, with the most events first: [{ slug, name, count }].
export function citiesOf(list) {
  const map = new Map();
  for (const e of list) {
    const key = eventCitySlug(e);
    const row = map.get(key) || { slug: key, name: eventCity(e), count: 0 };
    row.count += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Dates in words, the same at build time and in every browser.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// { month: "Nov", day: 7, weekday: "Sat" } for the date badge.
export function dayParts(iso) {
  const d = parseDay(iso);
  return d ? { month: MONTHS[d.getUTCMonth()], day: d.getUTCDate(), weekday: WEEKDAYS[d.getUTCDay()] } : { month: "", day: "", weekday: "" };
}
const dayText = (iso) => {
  const p = dayParts(iso);
  return p.day ? `${p.weekday} ${p.day} ${p.month}` : iso;
};

// "Sat 7 Nov, 17:00" or "Fri 30 Oct – Sun 1 Nov".
export function whenText(e) {
  const days = e.end && e.end !== e.start ? `${dayText(e.start)} – ${dayText(e.end)}` : dayText(e.start);
  return e.time ? `${days}, ${e.time}` : days;
}

// "Berlin · Urania, Schöneberg"
export const placeText = (e) => [eventCity(e), [e.venue, e.area].filter(Boolean).join(", ")].filter(Boolean).join(" · ");

// The events by month ("November 2026"), in order, for the list's headings.
export function groupByMonth(list, today = todayInGermany()) {
  const groups = [];
  for (const e of list) {
    const d = parseDay(listedDay(e, today));
    const key = d ? `${d.getUTCFullYear()}-${d.getUTCMonth()}` : "?";
    const label = d ? `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}` : "Later";
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.events.push(e);
    else groups.push({ key, label, events: [e] });
  }
  return groups;
}

// True when the event started before today and is still on.
export const isOnNow = (e, today = todayInGermany()) => e.start < today && (e.end || e.start) >= today;

// The text a WhatsApp share starts with, then the event's own link.
export const whatsOnShareText = (e, site = "https://nriclub.app") =>
  `${e.title}: ${whenText(e)} in ${eventCity(e)}. Found on NRIClub's list of Indian events in Germany: ${site}${WHATS_ON_PATH}#${e.id}`;

const isHttps = (u) => {
  try { return new URL(u).protocol === "https:" && /^https:\/\//i.test(u); } catch (e) { return false; }
};
export const safeUrl = (u) => (isHttps(u) ? u : "");

// Throws with every mistake in the list (run by the build).
export function validateWhatsOn(list = WHATS_ON) {
  const problems = [];
  if (!Array.isArray(list)) throw new Error("src/content/whatson.js: WHATS_ON must be a list ([ ... ]).");
  const seen = new Set();
  list.forEach((e, i) => {
    const name = `WHATS_ON[${i}]${e && typeof e.id === "string" && e.id ? ` (${e.id})` : ""}`;
    const bad = (msg) => problems.push(`${name}: ${msg}`);
    if (!e || typeof e !== "object" || Array.isArray(e)) { bad("must be an object { id, title, ... }"); return; }
    for (const key of Object.keys(e)) {
      if (!FIELDS.includes(key)) bad(`unknown field "${key}"${key === "organizer" ? ' (spelled "organiser" here)' : ""}; the fields are ${FIELDS.join(", ")}`);
    }
    for (const key of FIELDS) {
      if (e[key] !== undefined && (typeof e[key] !== "string" || !e[key].trim())) bad(`"${key}" must be text, not empty (or leave the field out)`);
    }
    for (const key of REQUIRED) {
      if (e[key] === undefined) bad(`"${key}" is missing`);
    }
    if (typeof e.id === "string" && e.id) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.id)) bad('"id" may have only a-z, 0-9 and single dashes, e.g. "diwali-mela-berlin-2026"');
      if (seen.has(e.id)) bad(`"id" "${e.id}" is used twice`);
      seen.add(e.id);
    }
    if (typeof e.category === "string" && e.category && !CATEGORY_LABELS[e.category]) bad(`"category" "${e.category}" isn't one of ${Object.keys(CATEGORY_LABELS).join(", ")}`);
    if (typeof e.start === "string" && e.start && !parseDay(e.start)) bad(`"start" "${e.start}" isn't a real date as YYYY-MM-DD`);
    if (typeof e.end === "string" && e.end) {
      if (!parseDay(e.end)) bad(`"end" "${e.end}" isn't a real date as YYYY-MM-DD`);
      else if (parseDay(e.start) && e.end < e.start) bad(`"end" ${e.end} is before "start" ${e.start}`);
    }
    if (typeof e.url === "string" && e.url && !isHttps(e.url)) bad(`"url" must be a full https:// address, not "${e.url}"`);
    if (typeof e.summary === "string" && e.summary.length > MAX_SUMMARY) bad(`"summary" has ${e.summary.length} characters; keep it to ${MAX_SUMMARY}`);
    if (typeof e.title === "string" && e.title.length > 120) bad(`"title" has ${e.title.length} characters; keep it to 120`);
    if (typeof e.time === "string" && e.time.length > 40) bad('"time" is too long; give it as e.g. "18:00" or "18:30–23:00"');
    if (typeof e.city === "string" && e.city && !citySlug(e.city)) bad(`"city" "${e.city}" has no letters`);
  });
  if (problems.length) {
    throw new Error(`src/content/whatson.js has ${problems.length} mistake${problems.length === 1 ? "" : "s"}:\n  - ${problems.join("\n  - ")}`);
  }
  return true;
}
