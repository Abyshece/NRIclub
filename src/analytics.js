// ============================================================================
// Website analytics, only with the visitor's consent (§ 25(1) TDDDG,
// Art. 6(1)(a) GDPR). The privacy banner (ConsentBanner.jsx) asks; until the
// visitor chooses Accept, nothing is sent and nothing is stored for
// analytics. The Privacy Policy (src/content/legal/privacy.js, section 2
// "Website analytics" and section 8) describes all of this: change it with
// this file.
//
// Kept in the browser:
//   nriclub_analytics_consent (local storage, strictly necessary): the
//     choice and its date. Asked again 12 months after Accept, 6 months
//     after Decline (ASK_AGAIN_MONTHS in src/content/analytics.js).
//   nriclub_visitor_id (local storage, only after Accept): a random id, so
//     visits of the same browser count as one visitor. Deleted on Decline.
//   nriclub_analytics_session (session storage, only after Accept): this
//     tab's visit id and when it was last used (a new visit after 30 minutes
//     without anything happening).
//
// Sent after Accept, in small batches to /api/collect on this site
// (api/collect.js), with the visitor and visit ids and the device's size
// class, browser and system family:
//   pageview: the page's path (member, post and other ids become ":id"), its
//     title, and for the first page of a visit the referring site's domain
//     and the utm_source/medium/campaign/content of the link it came from.
//   click: a button's or link's visible text (80 characters; email addresses
//     and long numbers removed), or its data-track name; for links where
//     they go (a path here, or another site's domain). In the members' area
//     (signed in) only data-track names and the text of the site's own menus
//     (inside data-track-ui), since other buttons there can carry members'
//     names: they count as "(button)" or "(link)". Never what's typed into
//     a form, never posts or messages. Nothing inside data-track-off.
//   funnel: the steps of signing up and logging in (trackStep), without any
//     details.
//   session_end: the page the visitor was on when the tab was hidden or
//     closed (the visit's exit page).
// Never anything about the member's account (no member id, no email).
// The admin panel (admin.nriclub.app) never tracks and never shows the banner.
// ============================================================================
import { COLLECT_PATH, MAX_EVENTS, LIMITS, FUNNEL_STEPS, ASK_AGAIN_MONTHS } from "./content/analytics.js";

export const CONSENT_KEY = "nriclub_analytics_consent";
export const VISITOR_KEY = "nriclub_visitor_id";
export const SESSION_KEY = "nriclub_analytics_session";

const SESSION_IDLE_MS = 30 * 60 * 1000;
const SEND_AFTER_MS = 4000;
const SEND_AT = 20; // events waiting: send at once
const QUEUE_MAX = 200;
// A page's title is set as it draws (e.g. CityPage), just after the address
// changes: the page view waits for it.
const PAGEVIEW_DELAY_MS = 350;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Paths whose second part names a public page (/city/munich, /guides/oci,
// /terms/2026-10-19); in all others it's an id, which becomes ":id".
const NAMED_PAGES = new Set(["city", "guides", "terms"]);
const CLICKABLE = 'a[href], button, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [data-track]';

// When storage can't be used (blocked, private mode): this page load only.
const memory = { consent: null, unstored: false, visitor: null, session: null };

let started = false;
let area = "member"; // "public" (signed out), "member" (signed in) or "off" (admin)
let consent = null; // { choice, at } or null (not asked yet, or asked too long ago)
let reopened = false; // "Privacy settings" opened the banner
let opener = null; // what had focus then
let snapshot = { visible: false, choice: null, at: null, reopened: false, visitor: null };
const listeners = new Set();
let queue = [];
let sendTimer = null;
let pageTimer = null;
let lastRawPath = null;
let activitySinceEnd = false;
// Where this page load came from: kept in memory only, for the first page
// view after Accept (the address loses its query as the app starts).
let landing = null;
let landingUsed = false;

// ---- Text and addresses ------------------------------------------------------

// Text as it may be sent: one line, without email addresses and phone-like
// numbers (9 digits or more; a date such as 2026-10-19 stays), at most max
// characters.
export function clip(value, max) {
  const s = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
    .replace(/\+?\d[\d\s()./-]{6,}\d/g, (m) => (m.replace(/\D/g, "").length >= 9 ? "[number]" : m))
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(s).slice(0, max).join("");
}

// A page's path as it's recorded: "/", "/guides", "/city/munich", and for
// other pages with an id "/u/:id", "/messages/:id".
export function cleanPath(pathname) {
  let p = String(pathname || "/").split(/[?#]/)[0];
  try { p = decodeURIComponent(p); } catch { /* as it is */ }
  const parts = p.split("/").filter(Boolean);
  if (!parts.length) return "/";
  const first = clip(parts[0], 60).toLowerCase();
  if (parts.length === 1) return `/${first}`;
  if (NAMED_PAGES.has(first)) return clip(`/${first}/${clip(parts[1], 100).toLowerCase()}`, LIMITS.path);
  return `/${first}/:id`;
}

const hostOf = (url) => {
  try {
    const u = new URL(url);
    return u.host ? u.hostname.replace(/^www\./, "").toLowerCase() : "";
  } catch {
    return "";
  }
};

// Where a link goes: a path on this site (with a short #section), another
// site's domain, or "mailto".
function linkTarget(a) {
  try {
    const u = new URL(a.getAttribute("href") || "", window.location.href);
    if (u.protocol === "mailto:" || u.protocol === "tel:") return u.protocol.slice(0, -1);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    if (u.origin === window.location.origin) {
      const hash = /^#[a-z0-9-]{1,40}$/i.test(u.hash) ? u.hash : "";
      return clip(cleanPath(u.pathname) + hash, LIMITS.target);
    }
    return clip(u.hostname.replace(/^www\./, ""), LIMITS.target);
  } catch {
    return "";
  }
}

// The name of what was clicked (see the top of this file).
function labelOf(el) {
  const own = el.getAttribute("data-track");
  if (own) return clip(own, LIMITS.label);
  const kind = el.tagName === "A" ? "(link)" : "(button)";
  // In the members' area only the site's own menus (marked data-track-ui)
  // give their buttons' text: elsewhere it can be a member's name or post.
  if (area !== "public" && !el.closest("[data-track-ui]")) return kind;
  const text = el.getAttribute("aria-label") || el.innerText || el.textContent || el.getAttribute("title") || "";
  return clip(text, LIMITS.label) || kind;
}

// The device's size class and the browser's and system's family; nothing finer.
export function deviceInfo(nav = navigator, scr = window.screen) {
  const ua = String(nav.userAgent || "");
  const touch = Number(nav.maxTouchPoints) || 0;
  const touchMac = /Macintosh/.test(ua) && touch > 1;
  const short = Math.min(scr?.width || window.innerWidth, scr?.height || window.innerHeight);
  let device = "desktop";
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || touchMac || (/Android/i.test(ua) && !/Mobile/i.test(ua))) device = "tablet";
  else if (/Mobi|iPhone|iPod|Android|IEMobile|Opera Mini/i.test(ua) || short < 600) device = "mobile";
  else if (touch > 0 && short <= 1100) device = "tablet";
  const browser = /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Edg(?:e|A|iOS)?\//.test(ua) ? "Edge"
      : /OPR\/|Opera/.test(ua) ? "Opera"
        : /Firefox|FxiOS/.test(ua) ? "Firefox"
          : /Chrome|CriOS|Chromium/.test(ua) ? "Chrome"
            : /Safari/.test(ua) ? "Safari" : "Other";
  const os = /iPhone|iPad|iPod/.test(ua) || touchMac ? "iOS"
    : /Android/.test(ua) ? "Android"
      : /CrOS/.test(ua) ? "ChromeOS"
        : /Windows/.test(ua) ? "Windows"
          : /Mac OS X|Macintosh/.test(ua) ? "macOS"
            : /Linux/.test(ua) ? "Linux" : "Other";
  return { device, browser, os };
}

// ---- The choice --------------------------------------------------------------

const addMonths = (ms, n) => {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + n);
  return d.getTime();
};

// The visitor's choice while it counts: { choice: "accepted" | "declined",
// at }, or null when there's none, or it's older than ASK_AGAIN_MONTHS.
export function readConsent(now = Date.now()) {
  let value = null;
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    // Nothing stored: no choice (also when another tab cleared the site's
    // data), unless this page load couldn't store the one made here.
    value = raw ? JSON.parse(raw) : memory.unstored ? memory.consent : null;
  } catch {
    value = memory.consent;
  }
  const months = ASK_AGAIN_MONTHS[value?.choice];
  const at = Date.parse(value?.at);
  if (!months || !Number.isFinite(at) || at > now + 86400000 || addMonths(at, months) <= now) return null;
  return { choice: value.choice, at: new Date(at).toISOString() };
}

const tracking = () => started && area !== "off" && consent?.choice === "accepted";

function storedVisitorId() {
  try {
    const id = localStorage.getItem(VISITOR_KEY);
    if (id !== null) return UUID_RE.test(id) ? id : null;
  } catch { /* below */ }
  return memory.visitor;
}

function newId() {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch { /* below */ }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// This browser's visitor id, made the first time (only while tracking).
function visitorId() {
  let id = storedVisitorId();
  if (!id) {
    id = newId();
    memory.visitor = id;
    try { localStorage.setItem(VISITOR_KEY, id); } catch { /* memory only */ }
  }
  return id;
}

// This tab's visit id. create: start a new visit when there's none or the
// last one has been idle for 30 minutes; otherwise null then. fresh: a new
// visit started now.
function visit(now, create = true) {
  let s = null;
  try { s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch { s = memory.session; }
  if (!s) s = memory.session;
  const current = s && UUID_RE.test(String(s.id)) && now - Number(s.last) < SESSION_IDLE_MS && now >= Number(s.last) - 60000;
  if (!current && !create) return null;
  const next = current ? { id: s.id, last: now } : { id: newId(), last: now };
  memory.session = next;
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch { /* memory only */ }
  return { id: next.id, fresh: !current };
}

// Deletes the visitor and visit ids from this browser.
function forgetIds() {
  memory.visitor = null;
  memory.session = null;
  try { localStorage.removeItem(VISITOR_KEY); } catch { /* nothing kept */ }
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* nothing kept */ }
}

// ---- Recording and sending -------------------------------------------------------

const here = () => cleanPath(window.location.pathname);

function record(event) {
  if (!tracking()) return;
  const now = Date.now();
  const v = visit(now, event.type !== "session_end");
  if (!v) return; // the end of a visit that already timed out
  // A new visit always starts with the page it's on.
  if (v.fresh && event.type !== "pageview") {
    queue.push({ type: "pageview", path: here(), title: clip(document.title, LIMITS.title), at: now, s: v.id });
  }
  queue.push({ ...event, at: now, s: v.id });
  if (event.type !== "session_end") activitySinceEnd = true;
  if (queue.length > QUEUE_MAX) queue = queue.slice(-QUEUE_MAX);
  if (queue.length >= SEND_AT) send();
  else if (!sendTimer) sendTimer = setTimeout(() => send(), SEND_AFTER_MS);
}

// Sends what's waiting, one request per visit and per 50 events. beacon: the
// page is being hidden or closed (navigator.sendBeacon survives that).
function send(beacon = false) {
  clearTimeout(sendTimer);
  sendTimer = null;
  if (!queue.length) return;
  if (!tracking()) { queue = []; return; }
  const visitor = visitorId();
  const device = deviceInfo();
  while (queue.length) {
    const s = queue[0].s;
    let n = 0;
    while (n < queue.length && n < MAX_EVENTS && queue[n].s === s) n++;
    const events = queue.splice(0, n).map(({ s: _s, ...e }) => e);
    const body = JSON.stringify({ consent: true, visitor, session: s, ...device, events });
    let sent = false;
    if (beacon && navigator.sendBeacon) {
      try { sent = navigator.sendBeacon(COLLECT_PATH, new Blob([body], { type: "text/plain;charset=UTF-8" })); } catch { sent = false; }
    }
    if (!sent) {
      try {
        fetch(COLLECT_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "omit" })
          .catch(() => {});
      } catch { /* dropped */ }
    }
  }
}

function pageview() {
  clearTimeout(pageTimer);
  pageTimer = null;
  if (!tracking()) return;
  const event = { type: "pageview", path: here(), title: clip(document.title, LIMITS.title) };
  if (landing && !landingUsed) {
    landingUsed = true;
    const ref = hostOf(landing.referrer);
    if (ref && ref !== window.location.hostname.replace(/^www\./, "").toLowerCase()) event.referrer_domain = clip(ref, LIMITS.referrer_domain);
    try {
      const q = new URLSearchParams(landing.search);
      for (const k of ["source", "medium", "campaign", "content"]) {
        const v = clip(q.get(`utm_${k}`), LIMITS.utm);
        if (v) event[`utm_${k}`] = v;
      }
    } catch { /* no campaign */ }
  }
  record(event);
}

function schedulePageview() {
  clearTimeout(pageTimer);
  pageTimer = setTimeout(pageview, PAGEVIEW_DELAY_MS);
}

function onRoute() {
  const raw = window.location.pathname;
  if (raw === lastRawPath) return;
  lastRawPath = raw;
  if (tracking()) schedulePageview();
}

// The tab is hidden or closed: the page view still waiting, the end of the
// visit (its last page), and everything waiting goes out now.
function onHide() {
  if (!tracking()) return;
  if (pageTimer) pageview();
  if (activitySinceEnd) {
    record({ type: "session_end", path: here() });
    activitySinceEnd = false;
  }
  send(true);
}

function onClick(e) {
  const t = e.target instanceof Element ? e.target : e.target?.parentElement;
  if (!t?.closest) return;
  // "Privacy settings" links in texts (the Privacy Policy): open the banner.
  const settings = t.closest('a[href$="#privacy-settings"]');
  if (settings) {
    e.preventDefault();
    openPrivacySettings(settings);
    return;
  }
  if (!tracking()) return;
  const el = t.closest(CLICKABLE);
  if (!el || el.closest('[data-track-off], [contenteditable=""], [contenteditable="true"]')) return;
  record({ type: "click", path: here(), label: labelOf(el), target: el.tagName === "A" ? linkTarget(el) : "" });
}

// Tracking starts (after Accept, or at start-up with an earlier Accept).
function begin() {
  visitorId();
  lastRawPath = window.location.pathname;
  schedulePageview();
}

// Tracking stops at once: nothing waiting is sent, the ids are deleted.
function stop() {
  clearTimeout(sendTimer);
  clearTimeout(pageTimer);
  sendTimer = null;
  pageTimer = null;
  queue = [];
  activitySinceEnd = false;
  forgetIds();
}

// ---- The banner's state ---------------------------------------------------------

function changed() {
  snapshot = {
    visible: started && area !== "off" && (reopened || !consent),
    choice: consent?.choice || null,
    at: consent?.at || null,
    reopened,
    visitor: consent?.choice === "accepted" ? storedVisitorId() : null,
  };
  listeners.forEach((fn) => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const getSnapshot = () => snapshot;

// One count of Accept or Decline in the database, with nothing about who
// chose: the public key only (never a member's session), no cookies, no
// referrer.
function countChoice(choice) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  try {
    fetch(`${url}/rest/v1/rpc/analytics_consent_count`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_choice: choice }),
      keepalive: true,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    }).catch(() => {});
  } catch { /* not counted */ }
}

// ---- What the site calls ------------------------------------------------------------

// Starts it all, once, as the site loads (not on the admin site): reads the
// choice, and tracks if it was Accept.
export function startAnalytics() {
  if (started || typeof window === "undefined") return;
  started = true;
  landing = { search: window.location.search, referrer: document.referrer };
  lastRawPath = window.location.pathname;
  consent = readConsent();
  // No choice that still counts: no ids either.
  if (consent?.choice !== "accepted") forgetIds();
  for (const name of ["pushState", "replaceState"]) {
    const original = window.history[name];
    if (typeof original !== "function") continue;
    window.history[name] = function patched(...args) {
      const result = original.apply(this, args);
      try { onRoute(); } catch { /* never in the way */ }
      return result;
    };
  }
  window.addEventListener("popstate", onRoute);
  document.addEventListener("click", onClick, true);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") onHide(); });
  window.addEventListener("pagehide", onHide);
  // Another tab chose (or withdrew): this one follows at once.
  window.addEventListener("storage", (e) => {
    if (e.key !== null && e.key !== CONSENT_KEY) return;
    const was = tracking();
    consent = readConsent();
    if (was && !tracking()) stop();
    else if (!was && tracking()) begin();
    changed();
  });
  if (tracking()) begin();
  changed();
}

// Where the visitor is: "public" (signed out), "member" (signed in: only
// data-track names for clicks) or "off" (the admin panel: no tracking, no
// banner).
export function setTrackingArea(next) {
  if (next === area || !["public", "member", "off"].includes(next)) return;
  const was = tracking();
  area = next;
  if (was && !tracking()) send();
  else if (!was && tracking()) begin();
  changed();
}

// The visitor chose on the banner.
export function chooseConsent(choice) {
  if (choice !== "accepted" && choice !== "declined") return;
  const was = tracking();
  const value = { choice, at: new Date().toISOString() };
  memory.consent = value;
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(value));
    memory.unstored = false;
  } catch {
    memory.unstored = true; // this page load only
  }
  consent = readConsent() || value;
  reopened = false;
  countChoice(choice);
  if (choice === "declined") stop();
  else if (!was && tracking()) begin();
  changed();
  returnFocus();
}

// "Privacy settings": shows the banner again, with the current choice.
export function openPrivacySettings(from = null) {
  if (!started) return;
  opener = from || document.activeElement;
  reopened = true;
  changed();
}

// Closes the banner opened from "Privacy settings", choice unchanged.
export function closePrivacySettings() {
  if (!reopened) return;
  reopened = false;
  changed();
  returnFocus();
}

function returnFocus() {
  const el = opener;
  opener = null;
  if (el && el.isConnected && typeof el.focus === "function") {
    try { el.focus({ preventScroll: true }); } catch { /* fine */ }
  }
}

// A step of signing up or logging in (FUNNEL_STEPS), sent only after Accept.
export function trackStep(step) {
  if (!FUNNEL_STEPS.includes(step)) return;
  record({ type: "funnel", path: here(), label: step });
}
