// ============================================================================
// Shareable public previews: what people without an account see when a
// member shares the link to a Market listing, an event, a question or a
// travel-board trip. The page is src/PreviewPage.jsx, the link preview that
// WhatsApp and other apps show comes from api/preview.js, and the author's
// switch and Share are in src/member/SharePreview.jsx. The database decides
// what a preview holds (public.public_preview,
// supabase/migrations/20261031000000_public_previews.sql): only items whose
// author turned the preview on, while they're live, and never a price, a
// description, a name or contact details.
// ============================================================================

import { HOME_TITLE } from "./slug.js";

export const SITE = "https://nriclub.app";
// The site's own link preview image (public/og-image.png, as in index.html).
export const SITE_IMAGE = `${SITE}/og-image.png?v=3`;
export const SITE_TITLE = HOME_TITLE;

// The kinds of item and the first part of their address: /market/<id>,
// /events/<id>, /help/<id>, /travel/<id> (vercel.json sends these to
// api/preview.js, see src/content/routes.js).
export const PREVIEW_PATHS = { market: "market", event: "events", question: "help", trip: "travel" };
export const PREVIEW_KINDS = Object.keys(PREVIEW_PATHS);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isItemId = (id) => UUID_RE.test(String(id ?? ""));

// "/market/<id>": an item's own address.
export const itemPath = (kind, id) => `/${PREVIEW_PATHS[kind]}/${id}`;

// The item an address points at ({ kind, id }), or null: /market/<id>,
// /events/<id>, /help/<id> or /travel/<id>, with an id that can be one.
export function previewTarget(pathname) {
  const m = /^\/([a-z]+)\/([^/]+)\/?$/.exec(String(pathname || ""));
  if (!m) return null;
  const kind = PREVIEW_KINDS.find((k) => PREVIEW_PATHS[k] === m[1]);
  let id = m[2];
  try { id = decodeURIComponent(id); } catch { return null; }
  return kind && isItemId(id) ? { kind, id: id.toLowerCase() } : null;
}

// A Market listing's kind as its preview says it (the database gives it as
// the preview's label). A housing listing adds its kind of place, as
// HOUSING_KINDS in src/content/housing.js says it: "Housing · WG room".
// The database's private.preview_market_label says the same
// (supabase/tests/rls_test.py compares them).
export const PREVIEW_MARKET_LABELS = {
  Housing: "Housing", Items: "Item for sale", Jobs: "Job", Referrals: "Referral", Vehicles: "Vehicle",
  Services: "Service", Travel: "Travel companion",
};

// Text from the database, as one line: no control characters, single spaces,
// at most max characters.
const line = (value, max) => {
  if (typeof value !== "string") return null;
  const text = [...value.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").replace(/\s+/g, " ").trim()].slice(0, max).join("");
  return text || null;
};

// The preview as the database gives it, checked: { kind, label, city, image,
// day, month, title, answers }, only text (or a count) where it belongs and
// an image only as an https:// link; null for anything else, or for a
// preview of another kind than the address says.
export function cleanPreview(raw, kind) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.kind !== kind || !PREVIEW_KINDS.includes(kind)) return null;
  const label = line(raw.label, 120);
  if (!label) return null;
  let image = typeof raw.image === "string" ? raw.image.trim() : "";
  try {
    const u = new URL(image);
    if (u.protocol !== "https:" || u.username || u.password || image.length > 2048) image = "";
  } catch { image = ""; }
  const answers = Number(raw.answers);
  return {
    kind, label,
    city: line(raw.city, 80),
    image: image || null,
    day: kind === "event" ? line(raw.day, 40) : null,
    month: kind === "trip" ? line(raw.month, 60) : null,
    title: kind === "question" ? line(raw.title, 300) : null,
    answers: kind === "question" && Number.isInteger(answers) && answers >= 0 ? answers : null,
  };
}

// "Housing · WG room · Berlin", "Event · Berlin · Sun 8 Nov 2026",
// "Trip Frankfurt → Delhi · November 2026", "Question · Berlin".
export const previewLine = (p) => [p.label, p.city, p.day || p.month].filter(Boolean).join(" · ");

// "12 answers, join to read them".
export const answersText = (n) => (n === 1 ? "1 answer, join to read it" : n ? `${n} answers, join to read them` : "No answers yet, join to answer it");

// ---- Questions: their categories, and which have no preview ---------------

// The categories of a question in Ask (the form in src/Dashboard.jsx).
export const QUESTION_CATEGORIES = ["General", "Housing", "Health", "Legal/Visa", "Education", "Jobs", "Travel", "Money & tax", "Family"];
// A question's title in these can show someone's health or origin (Art. 9
// GDPR), so they get no preview: no switch, and the database gives none
// (private.question_preview_allowed). Like the database, any category naming
// health, legal matters or visas counts (supabase/tests/rls_test.py
// compares them).
export const NO_PREVIEW_CATEGORIES = ["Health", "Legal/Visa"];
export const questionPreviewAllowed = (category) => !/(health|legal|visa)/i.test(String(category ?? ""));

// ---- The author's switch, in each post form and on their own items -------

export const SWITCH_LABEL = "Show a preview to people who aren't members yet";
export const SWITCH_HELP = {
  market: "People who open the link without an account see the photo, the kind (e.g. Housing · WG room) and the city. Never the price, description or your name.",
  event: "People who open the link without an account see the photo, the city and the day. Never the price, description, time, place or your name.",
  question: "People who open the link without an account see the title, your city and how many answers it has. Never the description, the answers or your name.",
  trip: "People who open the link without an account see the route and the month. Never the dates, flight, note or your name.",
};
// A line of its own under a question's switch and in its "Turn on the
// preview?": a question's title can say more about the asker than they mean
// to show.
export const PREVIEW_WARNING = {
  question: "The title will be visible to anyone with the link. Don't turn this on if it shows your health, religion or origin.",
};

// ---- Share ---------------------------------------------------------------

// When the author shares their own item while its preview is off (with
// PREVIEW_WARNING under it, for a question).
export const CONFIRM_TITLE = "Share the link";
export const CONFIRM_TEXT = {
  market: "People without an account will see the photo, kind and city. Turn on the preview?",
  event: "People without an account will see the photo, city and day. Turn on the preview?",
  question: "People without an account will see the title, city and number of answers. Turn on the preview?",
  trip: "People without an account will see the route and month. Turn on the preview?",
};
export const TURN_ON_AND_SHARE = "Turn on and share";
export const MEMBERS_ONLY = "Share for members only";
export const SHARE = "Share";
export const LINK_COPIED = "Link copied";
export const PREVIEW_FAILED = "The preview couldn't be turned on. The link still works for members.";
export const SWITCH_FAILED = "That didn't work. Please try again.";

// ---- The preview page (src/PreviewPage.jsx) -------------------------------

export const PAGE = {
  eyebrow: "Shared on NRIClub",
  neutralTitle: "This is on NRIClub, for members.",
  neutralText: "Join free to see it.",
  join: "Join free",
  login: "Log in",
  joinNote: "Join free. Once a person on our team has checked your account (usually within a day), you'll see everything.",
  loading: "Loading…",
  photo: "Photo",
};
// The browser tab's title on the preview page: never a member's words (a
// page's title is what website analytics record). A Market listing's kind is
// the site's own words.
export const pageTitle = (p) => (!p ? SITE_TITLE : p.kind === "market" ? `${p.label} · NRIClub`
  : { event: "An event on NRIClub", question: "A question on NRIClub", trip: "A trip on NRIClub" }[p.kind] || SITE_TITLE);

// ---- The link preview (api/preview.js) -----------------------------------

// The title, description and image apps show for a shared link: the item's
// preview, or the same words for every link without one (a private item and
// one that isn't there look alike).
export const GENERIC_PREVIEW = {
  title: SITE_TITLE,
  description: "This is on NRIClub, for members. Join free to see it.",
  image: SITE_IMAGE,
};
const DESCRIPTIONS = {
  market: "Join NRIClub free to see the details and contact the member.",
  event: "Join NRIClub free to see the time, the place and who's going.",
  trip: "Join NRIClub free to see the details and message the member.",
};
export function linkPreview(p) {
  if (!p) return GENERIC_PREVIEW;
  if (p.kind === "question") {
    const where = ["Question", p.city].filter(Boolean).join(" · ");
    const answers = p.answers === 1 ? "1 answer: join NRIClub free to read it."
      : p.answers ? `${p.answers} answers: join NRIClub free to read them.` : "Join NRIClub free to answer it.";
    return { title: p.title || "A question on NRIClub", description: `${where}. ${answers}`, image: SITE_IMAGE };
  }
  return { title: `${previewLine(p)}, on NRIClub`, description: DESCRIPTIONS[p.kind], image: p.image || SITE_IMAGE };
}
