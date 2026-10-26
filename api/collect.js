// ============================================================================
// /api/collect: receives the website analytics of visitors who chose
// "Accept" on the privacy banner (src/analytics.js sends them), and stores
// them with public.analytics_ingest (supabase/migrations/20261029000000_analytics.sql).
//
// A Vercel Edge Function. Vercel answers /api/* with its functions before
// the rewrites in vercel.json, so the app's rewrites never catch it.
//
//   * Checks the request: POST from this site only, at most 64 KB and 50
//     events, the consent flag set, a visitor and a visit id (random ids the
//     browser made when the visitor accepted), known kinds of event and steps,
//     and no text longer than its limit (src/content/analytics.js). Anything
//     else gets 400 (413 when too big) and nothing is stored.
//   * Adds what the browser can't know: the approximate place Vercel looks up
//     from the visitor's IP address (country, region, city). The IP address
//     itself isn't passed on or stored, not even shortened (since 26 October
//     2026: data minimisation, Art. 5(1)(c) GDPR).
//   * Sends it all to the database with the service role key. Settings:
//     SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel → Settings →
//     Environment Variables (see LAUNCH-GUIDE.md). Without them the function
//     answers 204 and drops the events, so the site works the same.
//
// Answers 204 (nothing to say) when it worked, and also when the database
// couldn't be reached: the browser never retries, and visitors never wait.
// ============================================================================
import {
  MAX_EVENTS, MAX_BODY_BYTES, LIMITS, EVENT_TYPES, FUNNEL_STEPS, DEVICES, BROWSERS, OSES,
} from "../src/content/analytics.js";

export const config = { runtime: "edge" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = new Set(EVENT_TYPES);
const STEPS = new Set(FUNNEL_STEPS);
// Search engines' crawlers and test tools (they can't accept the banner, but
// a copied request could come from anywhere).
const BOT_RE = /googlebot|bingbot|yandex|baiduspider|duckduckbot|applebot|ahrefs|semrush|crawler|spider|facebookexternalhit|lighthouse/i;

// ---- The approximate place, from Vercel's headers -------------------------

// Text without control characters and broken characters (Postgres refuses
// both), trimmed.
export function cleanText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
const length = (s) => [...s].length;
const cut = (s, n) => [...s].slice(0, n).join("");

// { country, region, city } from Vercel's headers: a two-letter country code,
// the region's code (e.g. "BY" for Bavaria) and the city, which Vercel sends
// URI-encoded ("M%C3%BCnchen"). "" for what's missing or unusable.
export function geoFrom(headers) {
  const country = String(headers.get("x-vercel-ip-country") || "").trim().toUpperCase();
  const region = String(headers.get("x-vercel-ip-country-region") || "").trim().toUpperCase();
  let city = String(headers.get("x-vercel-ip-city") || "");
  try { city = decodeURIComponent(city); } catch { /* keep it as it came */ }
  city = cut(cleanText(city), 100);
  return {
    country: /^[A-Z]{2}$/.test(country) ? country : "",
    region: /^[A-Z0-9-]{1,10}$/.test(region) ? region : "",
    city,
  };
}

// ---- The browser's events --------------------------------------------------

const TEXT_FIELDS = [
  ["path", LIMITS.path], ["title", LIMITS.title], ["label", LIMITS.label], ["target", LIMITS.target],
  ["referrer_domain", LIMITS.referrer_domain], ["utm_source", LIMITS.utm], ["utm_medium", LIMITS.utm],
  ["utm_campaign", LIMITS.utm], ["utm_content", LIMITS.utm],
];

const refuse = (error, status = 400) => ({ ok: false, status, error });

// Checks what the browser sent: { consent: true, visitor, session, device,
// browser, os, events: [{ type, at, path, title, label, target,
// referrer_domain, utm_source, utm_medium, utm_campaign, utm_content }] }.
// Returns { ok: true, meta, events } with clean values, or { ok: false,
// status, error }.
export function validatePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return refuse("not an object");
  if (body.consent !== true) return refuse("no consent");
  const visitor = String(body.visitor ?? "");
  const session = String(body.session ?? "");
  if (!UUID_RE.test(visitor) || !UUID_RE.test(session)) return refuse("visitor and session must be random ids");
  const list = body.events;
  if (!Array.isArray(list) || list.length === 0) return refuse("no events");
  if (list.length > MAX_EVENTS) return refuse(`more than ${MAX_EVENTS} events`, 413);
  const now = Date.now();
  const events = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return refuse("an event isn't an object");
    const type = String(raw.type ?? "");
    if (!TYPES.has(type)) return refuse(`unknown event type: ${cut(type, 30)}`);
    const event = { type };
    for (const [key, max] of TEXT_FIELDS) {
      const value = raw[key];
      if (value != null && typeof value !== "string") return refuse(`${key} must be text`);
      const text = cleanText(value);
      if (length(text) > max) return refuse(`${key} is longer than ${max} characters`);
      event[key] = text;
    }
    if (type === "funnel" && !STEPS.has(event.label)) return refuse(`unknown step: ${cut(event.label, 30)}`);
    // When it happened (milliseconds), within the last hour; else now.
    const at = Number(raw.at);
    event.at = Number.isFinite(at) && at <= now + 60000 && at >= now - 3600000 ? Math.round(Math.min(at, now)) : now;
    events.push(event);
  }
  const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
  return {
    ok: true,
    meta: {
      visitor_id: visitor.toLowerCase(),
      session_id: session.toLowerCase(),
      device: pick(body.device, DEVICES, ""),
      browser: pick(body.browser, BROWSERS, "Other"),
      os: pick(body.os, OSES, "Other"),
    },
    events,
  };
}

// ---- The request -----------------------------------------------------------

// The body as text, or null if it's bigger than max bytes.
async function readBody(request, max) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      try { await reader.cancel(); } catch { /* already closed */ }
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

// Whether the request comes from a page of this site (browsers send Origin
// with every POST; a request without one isn't from a page of another site).
function fromThisSite(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const answer = (status, extra = {}) => new Response(null, { status, headers: { "Cache-Control": "no-store", ...extra } });

// The request, with the settings env ({ SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY }).
export async function handle(request, env = {}) {
  if (request.method !== "POST") return answer(405, { Allow: "POST" });
  if (!fromThisSite(request)) return answer(403);
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return answer(413);
  const text = await readBody(request, MAX_BODY_BYTES).catch(() => null);
  if (text === null) return answer(413);
  let body;
  try { body = JSON.parse(text); } catch { return answer(400); }
  const checked = validatePayload(body);
  if (!checked.ok) return answer(checked.status);
  if (BOT_RE.test(request.headers.get("user-agent") || "")) return answer(204);

  const url = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return answer(204);
  const meta = { ...checked.meta, ...geoFrom(request.headers) };
  try {
    // Supabase's newer secret keys ("sb_secret_…") go in apikey only; the
    // older service_role key (a JWT) also as the bearer token.
    const auth = key.startsWith("sb_") ? {} : { Authorization: `Bearer ${key}` };
    const res = await fetch(`${url}/rest/v1/rpc/analytics_ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, ...auth },
      body: JSON.stringify({ p_events: checked.events, p_meta: meta }),
      signal: AbortSignal.timeout(5000),
    });
    // For Vercel's function logs (a wrong key, or the SQL not run yet);
    // nothing about the visitor.
    if (!res.ok) console.warn(`analytics: the database answered ${res.status}`);
  } catch { /* dropped: analytics never get in a visitor's way */ }
  return answer(204);
}

// Vercel calls this with the request (and a context, not needed here). The
// settings are read by name, as Vercel's Edge runtime expects.
export default function handler(request) {
  const env = typeof process !== "undefined" && process.env
    ? { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY }
    : {};
  return handle(request, env);
}
