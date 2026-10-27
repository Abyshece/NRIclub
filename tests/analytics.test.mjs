// Tests for website analytics: the Edge Function /api/collect (api/collect.js)
// and the browser's helpers (src/analytics.js). No network, no database.
//
//     node --test tests/analytics.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as collect from "../api/collect.js";
import { geoFrom, validatePayload, cleanText, handle } from "../api/collect.js";
import { clip, cleanPath, deviceInfo, readConsent } from "../src/analytics.js";
import { MAX_EVENTS, FUNNEL_STEPS } from "../src/content/analytics.js";

const V = "0b6b1c86-5f4e-4c43-9a43-3d7c9a1f2b10";
const S = "6f1d2a7e-1c2b-4f0e-8a51-22c0e6c1d9a4";
const payload = (events, extra = {}) => ({ consent: true, visitor: V, session: S, device: "mobile", browser: "Chrome", os: "Android", events, ...extra });
const headers = (h) => new Headers(h);

// ---- No IP address ---------------------------------------------------------------

test("the function has no way to shorten or pass on an IP address any more (since 26 October 2026)", () => {
  assert.equal(collect.truncateIp, undefined);
  assert.equal(collect.clientIp, undefined);
});

// ---- Vercel's place headers ------------------------------------------------------

test("country, region and the URI-encoded city", () => {
  assert.deepEqual(geoFrom(headers({ "x-vercel-ip-country": "de", "x-vercel-ip-country-region": "BY", "x-vercel-ip-city": "M%C3%BCnchen" })),
    { country: "DE", region: "BY", city: "München" });
  assert.deepEqual(geoFrom(headers({ "x-vercel-ip-country": "IN", "x-vercel-ip-country-region": "MH", "x-vercel-ip-city": "Navi%20Mumbai" })),
    { country: "IN", region: "MH", city: "Navi Mumbai" });
  assert.deepEqual(geoFrom(headers({ "x-vercel-ip-city": "S%C3%A3o%20Paulo" })), { country: "", region: "", city: "São Paulo" });
});

test("missing or unusable place headers give empty values", () => {
  assert.deepEqual(geoFrom(headers({})), { country: "", region: "", city: "" });
  assert.deepEqual(geoFrom(headers({ "x-vercel-ip-country": "Germany", "x-vercel-ip-country-region": "Bavaria, Germany!" })),
    { country: "", region: "", city: "" });
  // A broken encoding is kept as it came; control characters go.
  assert.equal(geoFrom(headers({ "x-vercel-ip-city": "Bad%E0%A4%A" })).city, "Bad%E0%A4%A");
  assert.equal(geoFrom(headers({ "x-vercel-ip-city": "A%0Ab%00c" })).city, "A b c");
  assert.equal(geoFrom(headers({ "x-vercel-ip-city": encodeURIComponent("x".repeat(150)) })).city.length, 100);
});

// ---- What the browser sends -----------------------------------------------------

test("a good payload passes, with clean values", () => {
  const r = validatePayload(payload([
    { type: "pageview", path: "/city/munich", title: "Indians in Munich · NRIClub", referrer_domain: "google.com", utm_source: "whatsapp", utm_campaign: "munich", at: Date.now() - 1000 },
    { type: "click", path: "/", label: "Join free" },
    { type: "funnel", path: "/", label: "signup_open" },
    { type: "session_end", path: "/guides" },
  ]));
  assert.equal(r.ok, true);
  assert.deepEqual(r.meta, { visitor_id: V, session_id: S, device: "mobile", browser: "Chrome", os: "Android" });
  assert.equal(r.events.length, 4);
  assert.equal(r.events[0].utm_campaign, "munich");
  assert.equal(r.events[1].referrer_domain, "");
  assert.ok(Math.abs(r.events[1].at - Date.now()) < 1000);
});

test("refused without the consent flag", () => {
  assert.equal(validatePayload(payload([{ type: "pageview", path: "/" }], { consent: false })).ok, false);
  assert.equal(validatePayload(payload([{ type: "pageview", path: "/" }], { consent: "true" })).ok, false);
  const { consent: _gone, ...without } = payload([{ type: "pageview", path: "/" }]);
  assert.equal(validatePayload(without).status, 400);
});

test("refused: not an object, bad ids, no events, too many events", () => {
  for (const bad of [null, [], "x", 5]) assert.equal(validatePayload(bad).ok, false);
  assert.equal(validatePayload(payload([{ type: "pageview" }], { visitor: "alice@example.com" })).ok, false);
  assert.equal(validatePayload(payload([{ type: "pageview" }], { session: 12 })).ok, false);
  assert.equal(validatePayload(payload([])).ok, false);
  assert.equal(validatePayload(payload({ type: "pageview" })).ok, false);
  const many = validatePayload(payload(Array(MAX_EVENTS + 1).fill({ type: "pageview", path: "/" })));
  assert.equal(many.ok, false);
  assert.equal(many.status, 413);
  assert.equal(validatePayload(payload(Array(MAX_EVENTS).fill({ type: "pageview", path: "/" }))).ok, true);
});

test("refused: unknown kinds of event and steps, texts too long or not text", () => {
  assert.equal(validatePayload(payload([{ type: "keystroke", path: "/" }])).ok, false);
  assert.equal(validatePayload(payload([{ type: "funnel", label: "typed_email:a@b.com" }])).ok, false);
  for (const step of FUNNEL_STEPS) assert.equal(validatePayload(payload([{ type: "funnel", label: step }])).ok, true, step);
  assert.equal(validatePayload(payload([{ type: "click", label: "x".repeat(81) }])).ok, false);
  assert.equal(validatePayload(payload([{ type: "click", label: "x".repeat(80) }])).ok, true);
  // Characters, not UTF-16 units: 80 emoji are 80 characters.
  assert.equal(validatePayload(payload([{ type: "click", label: "🙏".repeat(80) }])).ok, true);
  assert.equal(validatePayload(payload([{ type: "pageview", path: "/" + "p".repeat(200) }])).ok, false);
  assert.equal(validatePayload(payload([{ type: "pageview", utm_source: "u".repeat(101) }])).ok, false);
  assert.equal(validatePayload(payload([{ type: "pageview", path: ["/"] }])).ok, false);
  assert.equal(validatePayload(payload([{ type: "pageview", title: { x: 1 } }])).ok, false);
});

test("texts lose control characters and broken characters (Postgres refuses both)", () => {
  assert.equal(cleanText("a\u0000b\nc"), "a b c");
  assert.equal(cleanText("ok\uD800"), "ok");
  assert.equal(cleanText("🙏"), "🙏");
  const r = validatePayload(payload([{ type: "click", label: "Join\u0000 free\uDC00" }]));
  assert.equal(r.events[0].label, "Join free");
});

test("times: the last hour only, otherwise now", () => {
  const now = Date.now();
  const r = validatePayload(payload([
    { type: "pageview", at: now - 5 * 60000 }, { type: "pageview", at: now - 2 * 3600000 },
    { type: "pageview", at: now + 3600000 }, { type: "pageview", at: "soon" },
  ]));
  assert.ok(Math.abs(r.events[0].at - (now - 5 * 60000)) < 5);
  for (const e of r.events.slice(1)) assert.ok(Math.abs(e.at - now) < 1000);
});

test("device, browser and system: known names only", () => {
  const r = validatePayload(payload([{ type: "pageview" }], { device: "smart fridge", browser: "Netscape 4", os: "Plan 9" }));
  assert.deepEqual(r.meta, { visitor_id: V, session_id: S, device: "", browser: "Other", os: "Other" });
});

// ---- The request ---------------------------------------------------------------------

const ENV = { SUPABASE_URL: "https://example.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "eyJ.service.role" };
const request = (body, h = {}, method = "POST") => new Request("https://nriclub.app/api/collect", {
  method,
  headers: { "content-type": "application/json", origin: "https://nriclub.app", host: "nriclub.app", "x-real-ip": "203.0.113.42",
    "x-vercel-ip-country": "DE", "x-vercel-ip-country-region": "BE", "x-vercel-ip-city": "Berlin", "user-agent": "Mozilla/5.0", ...h },
  body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
});

async function withFetch(fake, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return fake(url, init); };
  try { await fn(calls); } finally { globalThis.fetch = real; }
}

test("stores the events with the place and no IP address, and answers 204", async () => {
  await withFetch(async () => new Response(null, { status: 200 }), async (calls) => {
    const res = await handle(request(payload([{ type: "pageview", path: "/" }]), {
      "x-forwarded-for": "198.51.100.7, 10.0.0.1", "x-vercel-forwarded-for": "198.51.100.7" }), ENV);
    assert.equal(res.status, 204);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/analytics_ingest");
    assert.equal(calls[0].init.headers.apikey, ENV.SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`);
    const body = JSON.parse(calls[0].init.body);
    assert.deepEqual(body.p_meta, { visitor_id: V, session_id: S, device: "mobile", browser: "Chrome", os: "Android",
      country: "DE", region: "BE", city: "Berlin" });
    assert.equal(body.p_events[0].path, "/");
    const sent = JSON.stringify(body);
    for (const part of ["203.0.113", "198.51.100", "10.0.0"]) {
      assert.ok(!sent.includes(part), `no IP address, not even shortened, is passed on (${part})`);
    }
  });
});

test("a newer secret key goes in apikey only", async () => {
  await withFetch(async () => new Response(null, { status: 200 }), async (calls) => {
    await handle(request(payload([{ type: "pageview", path: "/" }])), { ...ENV, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_abc" });
    assert.equal(calls[0].init.headers.apikey, "sb_secret_abc");
    assert.equal(calls[0].init.headers.Authorization, undefined);
  });
});

test("without the settings in Vercel: 204, nothing sent", async () => {
  await withFetch(async () => { throw new Error("must not be called"); }, async (calls) => {
    assert.equal((await handle(request(payload([{ type: "pageview", path: "/" }])), {})).status, 204);
    assert.equal((await handle(request(payload([{ type: "pageview", path: "/" }])), { SUPABASE_URL: "https://x.supabase.co" })).status, 204);
    assert.equal(calls.length, 0);
  });
});

test("the database unreachable: still 204", async () => {
  await withFetch(async () => { throw new Error("offline"); }, async () => {
    assert.equal((await handle(request(payload([{ type: "pageview", path: "/" }])), ENV)).status, 204);
  });
});

test("refused requests store nothing", async () => {
  await withFetch(async () => { throw new Error("must not be called"); }, async (calls) => {
    assert.equal((await handle(request(null, {}, "GET"), ENV)).status, 405);
    assert.equal((await handle(request(payload([{ type: "pageview" }]), { origin: "https://evil.example" }), ENV)).status, 403);
    assert.equal((await handle(request("{not json"), ENV)).status, 400);
    assert.equal((await handle(request(payload([{ type: "pageview" }], { consent: false })), ENV)).status, 400);
    assert.equal((await handle(request(payload([{ type: "pageview", label: "x".repeat(70000) }])), ENV)).status, 413);
    assert.equal((await handle(request(payload(Array(51).fill({ type: "pageview" }))), ENV)).status, 413);
    // Search engines' crawlers: accepted quietly, not stored.
    assert.equal((await handle(request(payload([{ type: "pageview" }]), { "user-agent": "Googlebot/2.1" }), ENV)).status, 204);
    assert.equal(calls.length, 0);
  });
});

test("a request without an Origin header (not from another site's page) is taken", async () => {
  await withFetch(async () => new Response(null, { status: 200 }), async (calls) => {
    const r = new Request("https://nriclub.app/api/collect", { method: "POST", headers: { host: "nriclub.app" }, body: JSON.stringify(payload([{ type: "pageview" }])) });
    assert.equal((await handle(r, ENV)).status, 204);
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(calls[0].init.body).p_meta, { visitor_id: V, session_id: S, device: "mobile", browser: "Chrome",
      os: "Android", country: "", region: "", city: "" });
  });
});

// ---- The browser's helpers (src/analytics.js) ----------------------------------------

test("labels: one line, no email addresses or phone numbers, 80 characters", () => {
  assert.equal(clip("  Join\n  free  ", 80), "Join free");
  assert.equal(clip("Write to priya.sharma@example.com now", 80), "Write to [email] now");
  assert.equal(clip("Call +49 151 23456789", 80), "Call [number]");
  assert.equal(clip("All 24 guides", 80), "All 24 guides");
  assert.equal(clip("Ring 0151 2345678 or 030-1234", 80), "Ring [number] or 030-1234");
  assert.equal(clip("Terms of 2026-10-19", 80), "Terms of 2026-10-19");
  assert.equal(clip("🙏".repeat(100), 80), "🙏".repeat(80));
});

test("paths: ids become :id, public pages keep their names", () => {
  assert.equal(cleanPath("/"), "/");
  assert.equal(cleanPath(""), "/");
  assert.equal(cleanPath("/guides"), "/guides");
  assert.equal(cleanPath("/guides/oci-card"), "/guides/oci-card");
  assert.equal(cleanPath("/city/M%C3%BCnchen"), "/city/münchen");
  assert.equal(cleanPath("/terms/2026-10-19"), "/terms/2026-10-19");
  assert.equal(cleanPath("/news/blue-card-salary-2027"), "/news/blue-card-salary-2027");
  assert.equal(cleanPath("/u/00000000-0000-0000-0000-00000000000a"), "/u/:id");
  assert.equal(cleanPath("/messages/abc/def"), "/messages/:id");
  assert.equal(cleanPath("/post/123?x=1#y"), "/post/:id");
  assert.equal(cleanPath("/Whats-On/"), "/whats-on");
  assert.equal(cleanPath("/%E0%A4%A"), "/%e0%a4%a");
});

test("device: size class, browser and system family", () => {
  const ua = (s) => ({ userAgent: s, maxTouchPoints: 0 });
  assert.deepEqual(deviceInfo(ua("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"), { width: 390, height: 844 }),
    { device: "mobile", browser: "Safari", os: "iOS" });
  assert.deepEqual(deviceInfo(ua("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"), { width: 412, height: 915 }),
    { device: "mobile", browser: "Chrome", os: "Android" });
  assert.deepEqual(deviceInfo(ua("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"), { width: 800, height: 1280 }),
    { device: "tablet", browser: "Chrome", os: "Android" });
  assert.deepEqual(deviceInfo(ua("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0"), { width: 1920, height: 1080 }),
    { device: "desktop", browser: "Edge", os: "Windows" });
  assert.deepEqual(deviceInfo(ua("Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0"), { width: 1512, height: 982 }),
    { device: "desktop", browser: "Firefox", os: "macOS" });
  assert.deepEqual(deviceInfo({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", maxTouchPoints: 5 }, { width: 820, height: 1180 }),
    { device: "tablet", browser: "Safari", os: "iOS" });
  assert.deepEqual(deviceInfo(ua("Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0 Mobile Safari/537.36"), { width: 360, height: 780 }),
    { device: "mobile", browser: "Samsung Internet", os: "Android" });
});

test("the choice counts 12 months after Accept and 6 after Decline", () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  try {
    const at = Date.parse("2026-01-15T10:00:00Z");
    store.set("nriclub_analytics_consent", JSON.stringify({ choice: "accepted", at: new Date(at).toISOString() }));
    assert.equal(readConsent(Date.parse("2026-12-15T10:00:00Z"))?.choice, "accepted");
    assert.equal(readConsent(Date.parse("2027-01-16T10:00:00Z")), null);
    store.set("nriclub_analytics_consent", JSON.stringify({ choice: "declined", at: new Date(at).toISOString() }));
    assert.equal(readConsent(Date.parse("2026-07-14T10:00:00Z"))?.choice, "declined");
    assert.equal(readConsent(Date.parse("2026-07-16T10:00:00Z")), null);
    store.set("nriclub_analytics_consent", JSON.stringify({ choice: "yes please", at: new Date(at).toISOString() }));
    assert.equal(readConsent(at), null);
    store.set("nriclub_analytics_consent", "{broken");
    assert.equal(readConsent(at), null);
  } finally {
    delete globalThis.localStorage;
  }
});
