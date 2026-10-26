// Tests for the link previews of shared items: the Edge Function behind
// /market/<id>, /events/<id>, /help/<id> and /travel/<id> (api/preview.js)
// and its words and checks (src/content/preview.js). No network, no
// database: the database's side is in supabase/tests/rls_test.py.
//
//     node --test tests/preview.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, headTags, injectTags, handle, CACHE } from "../api/preview.js";
import { previewTarget, cleanPreview, previewLine, answersText, linkPreview, GENERIC_PREVIEW, SITE_IMAGE } from "../src/content/preview.js";
import { PREVIEW_REWRITES, APP_SECTIONS, isAppPath } from "../src/content/routes.js";

const ID = "3f6c1d2e-8b7a-4c5d-9e0f-1a2b3c4d5e6f";
const PHOTO = "https://abc.supabase.co/storage/v1/object/public/marketplace-images/0b6b1c86-5f4e-4c43-9a43-3d7c9a1f2b10/f00d.jpg";
const ENV = { VITE_SUPABASE_URL: "https://abc.supabase.co", VITE_SUPABASE_ANON_KEY: "anon-key" };
// The app's page as the build writes app.html: the site's own link preview.
const SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>NRIClub · One home for NRIs and Indians abroad</title>
  <meta name="description" content="Meet Indians in your city." />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="NRIClub" />
  <meta property="og:title" content="NRIClub · One home for NRIs and Indians abroad" />
  <meta property="og:description" content="Meet Indians in your city." />
  <meta property="og:image" content="https://nriclub.app/og-image.png?v=3" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="NRIClub" />
  <script type="module" crossorigin src="/assets/index-abc.js"></script>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;

// A stand-in for fetch: /app.html from the deployment, and the database's
// answer (a function of the request's body) for public_preview.
function fakeFetch(answer, { shell = SHELL } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/app.html")) return shell === null ? new Response("", { status: 404 }) : new Response(shell);
    if (String(url).includes("/rest/v1/rpc/public_preview")) {
      const r = answer(JSON.parse(init.body));
      if (r instanceof Response) return r;
      return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return { fetchImpl, calls };
}
const request = (path, host = "nriclub.app") => new Request(`https://${host}${path}`, { headers: { host } });
const rpcCalls = (calls) => calls.filter((c) => c.url.includes("/rest/v1/rpc/"));
const meta = (html, key) => {
  const m = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)" />`).exec(html);
  return m ? m[1] : null;
};
const count = (html, needle) => html.split(needle).length - 1;

// ---- Escaping ------------------------------------------------------------------

test("every character that could end an attribute or start a tag is escaped", () => {
  assert.equal(escapeHtml(`a&b<c>d"e'f`), "a&amp;b&lt;c&gt;d&quot;e&#39;f");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(12), "12");
});

test("tags with a member's words can't break out of the attribute or the title", () => {
  for (const attack of [`"><script>alert(1)</script>`, `</title><script>alert(1)</script>`, `' onload='alert(1)`,
    `x" /><meta http-equiv="refresh" content="0;url=https://evil.example">`]) {
    const tags = headTags({ title: attack, description: attack, image: `https://abc.supabase.co/x.jpg?"${attack}`, url: "https://nriclub.app/help/x", pageTitle: attack });
    assert.ok(!tags.includes("<script"), attack);
    assert.ok(!/<\/title>[\s\S]*<\/title>/.test(tags), attack);
    assert.ok(!tags.includes(`"><`), attack);
    assert.equal(count(tags, "<meta "), 12, attack); // nothing added
    assert.equal(count(tags, "<title>"), 1, attack);
    assert.ok(!/<meta http-equiv/.test(tags), attack);
    // Every attribute value ends where it should: name="…" content="…" />.
    for (const line of tags.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("<meta"))) {
      assert.match(line, /^<meta (?:name|property)="[a-z:_]+" content="[^"]*" \/>$/, line);
    }
  }
});

// ---- The page ------------------------------------------------------------------

test("the site's own title and link preview are replaced, the rest of the page is kept", () => {
  const html = injectTags(SHELL, headTags({ title: "Event · Augsburg", description: "D", image: SITE_IMAGE, url: "https://nriclub.app/events/x" }));
  assert.equal(count(html, "<title>"), 1);
  assert.equal(count(html, 'property="og:title"'), 1);
  assert.equal(count(html, 'name="twitter:title"'), 1);
  assert.equal(count(html, 'name="description"'), 1);
  assert.equal(meta(html, "og:title"), "Event · Augsburg");
  assert.equal(meta(html, "robots"), "noindex");
  assert.ok(html.includes('<script type="module" crossorigin src="/assets/index-abc.js"></script>'));
  assert.ok(html.includes('<div id="root"></div>'));
  assert.ok(html.indexOf("og:title") < html.indexOf("</head>"));
  assert.equal(injectTags("<p>no head</p>", "<title>x</title>"), "<p>no head</p>");
});

test("a listing with a preview: its kind, city and photo, noindex, cached a minute, 200 with the app", async () => {
  const { fetchImpl, calls } = fakeFetch(() => ({ kind: "market", label: "Housing · WG room", city: "Berlin", image: PHOTO }));
  const res = await handle(request(`/api/preview?kind=market&id=${ID}`), ENV, fetchImpl);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), CACHE);
  assert.match(CACHE, /s-maxage=60/);
  assert.equal(res.headers.get("x-robots-tag"), "noindex");
  assert.equal(meta(html, "og:title"), "Housing · WG room · Berlin, on NRIClub");
  assert.equal(meta(html, "og:description"), "Join NRIClub free to see the details and contact the member.");
  assert.equal(meta(html, "og:image"), PHOTO);
  assert.equal(meta(html, "twitter:image"), PHOTO);
  assert.equal(meta(html, "og:url"), `https://nriclub.app/market/${ID}`);
  assert.equal(meta(html, "og:type"), "website");
  assert.equal(meta(html, "twitter:card"), "summary_large_image");
  assert.equal(meta(html, "robots"), "noindex");
  // The tab's title stays the site's (website analytics record it): never a member's words.
  assert.match(html, /<title>NRIClub · One home for NRIs and Indians abroad<\/title>/);
  // The database was asked once, with the public key, for exactly this item.
  const rpc = rpcCalls(calls);
  assert.equal(rpc.length, 1);
  assert.equal(rpc[0].url, "https://abc.supabase.co/rest/v1/rpc/public_preview");
  assert.deepEqual(JSON.parse(rpc[0].init.body), { p_kind: "market", p_id: ID });
  assert.equal(rpc[0].init.headers.apikey, "anon-key");
  assert.equal(rpc[0].init.headers.Authorization, "Bearer anon-key");
  assert.equal(calls[0].url, "https://nriclub.app/app.html");
});

test("each kind's words; a question's title is its link preview's title", async () => {
  const cases = [
    ["event", { kind: "event", label: "Event", city: "Berlin", day: "Sun 8 Nov 2026", image: null },
      "Event · Berlin · Sun 8 Nov 2026, on NRIClub", SITE_IMAGE, `/events/${ID}`],
    ["question", { kind: "question", label: "Question", city: "Berlin", image: null, title: "Best dentist near Mitte?", answers: 12 },
      "Best dentist near Mitte?", SITE_IMAGE, `/help/${ID}`],
    ["trip", { kind: "trip", label: "Trip Frankfurt → Delhi", city: null, image: null, month: "November 2026" },
      "Trip Frankfurt → Delhi · November 2026, on NRIClub", SITE_IMAGE, `/travel/${ID}`],
  ];
  for (const [kind, answer, title, image, path] of cases) {
    const { fetchImpl } = fakeFetch(() => answer);
    const html = await (await handle(request(`/api/preview?kind=${kind}&id=${ID}`), ENV, fetchImpl)).text();
    assert.equal(meta(html, "og:title"), title, kind);
    assert.equal(meta(html, "og:image"), image, kind);
    assert.equal(meta(html, "og:url"), `https://nriclub.app${path}`, kind);
  }
  const { fetchImpl } = fakeFetch(() => cases[1][1]);
  const html = await (await handle(request(`/api/preview?kind=question&id=${ID}`), ENV, fetchImpl)).text();
  assert.equal(meta(html, "og:description"), "Question · Berlin. 12 answers: join NRIClub free to read them.");
});

test("no preview: the same generic page whether the item is private, missing or the database fails", async () => {
  const pages = [];
  for (const answer of [() => null, () => new Response('{"code":"500"}', { status: 500 }), () => new Response("not json"),
    () => ({ kind: "event", label: "Event" }), () => ({ kind: "market" }), () => []]) {
    const { fetchImpl } = fakeFetch(answer);
    const res = await handle(request(`/api/preview?kind=market&id=${ID}`), ENV, fetchImpl);
    assert.equal(res.status, 200);
    pages.push(await res.text());
  }
  for (const html of pages) assert.equal(html, pages[0]);
  assert.equal(meta(pages[0], "og:title"), GENERIC_PREVIEW.title);
  assert.equal(meta(pages[0], "og:description"), "This is on NRIClub, for members. Join free to see it.");
  assert.equal(meta(pages[0], "og:image"), SITE_IMAGE);
  assert.equal(meta(pages[0], "og:url"), `https://nriclub.app/market/${ID}`);
  assert.equal(meta(pages[0], "robots"), "noindex");
});

test("the database isn't asked without the settings, for an unknown kind or for an id that can't be one", async () => {
  for (const [path, env] of [[`/api/preview?kind=market&id=${ID}`, {}],
    [`/api/preview?kind=market&id=${ID}`, { VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "k" }],
    [`/api/preview?kind=post&id=${ID}`, ENV], ["/api/preview?kind=market&id=new", ENV],
    [`/api/preview?kind=market&id=${ID}'or'1'='1`, ENV], ["/api/preview", ENV]]) {
    const { fetchImpl, calls } = fakeFetch(() => { throw new Error("asked"); });
    const res = await handle(request(path), env, fetchImpl);
    assert.equal(res.status, 200, path);
    assert.equal(rpcCalls(calls).length, 0, path);
    assert.equal(meta(await res.text(), "og:title"), GENERIC_PREVIEW.title, path);
  }
});

test("the admin site gets the app as it is, and the database is never asked", async () => {
  for (const host of ["admin.nriclub.app", "ADMIN.nriclub.app"]) {
    const { fetchImpl, calls } = fakeFetch(() => { throw new Error("asked"); });
    const res = await handle(request(`/api/preview?kind=market&id=${ID}`, host), ENV, fetchImpl);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), SHELL);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(rpcCalls(calls).length, 0);
  }
});

test("the item comes from the address when the rewrite gives no query", async () => {
  const { fetchImpl, calls } = fakeFetch(() => ({ kind: "trip", label: "Trip Frankfurt → Delhi", city: null, image: null, month: "November 2026" }));
  const html = await (await handle(request(`/travel/${ID.toUpperCase()}`), ENV, fetchImpl)).text();
  assert.deepEqual(JSON.parse(rpcCalls(calls)[0].init.body), { p_kind: "trip", p_id: ID });
  assert.equal(meta(html, "og:url"), `https://nriclub.app/travel/${ID}`);
});

test("a preview's words from the database are escaped, and an image that isn't https:// is never used", async () => {
  const attack = `</title><script>alert("x")</script>`;
  const { fetchImpl } = fakeFetch(() => ({ kind: "question", label: "Question", city: `"><img src=x onerror=alert(1)>`,
    image: null, title: attack, answers: 1 }));
  const html = await (await handle(request(`/api/preview?kind=question&id=${ID}`), ENV, fetchImpl)).text();
  assert.ok(!html.includes("<script>alert"));
  assert.ok(!html.includes("<img src=x"));
  assert.equal(count(html, "</title>"), 1);
  assert.equal(meta(html, "og:title"), "&lt;/title&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  assert.ok(!html.includes("<title>&lt;"));
  for (const image of ["javascript:alert(1)", "data:image/png;base64,AAAA", "http://abc.supabase.co/x.jpg", "//evil.example/x.jpg",
    "https://user:pw@abc.supabase.co/x.jpg", 42]) {
    const f = fakeFetch(() => ({ kind: "market", label: "Item for sale", city: "Berlin", image }));
    const page = await (await handle(request(`/api/preview?kind=market&id=${ID}`), ENV, f.fetchImpl)).text();
    assert.equal(meta(page, "og:image"), SITE_IMAGE, String(image));
  }
});

test("a newer publishable key goes in apikey only", async () => {
  const { fetchImpl, calls } = fakeFetch(() => null);
  await handle(request(`/api/preview?kind=event&id=${ID}`), { ...ENV, VITE_SUPABASE_ANON_KEY: "sb_publishable_abc" }, fetchImpl);
  const rpc = rpcCalls(calls)[0];
  assert.equal(rpc.init.headers.apikey, "sb_publishable_abc");
  assert.equal(rpc.init.headers.Authorization, undefined);
});

test("without the app's page: 503, not cached", async () => {
  const { fetchImpl } = fakeFetch(() => null, { shell: null });
  const res = await handle(request(`/api/preview?kind=event&id=${ID}`), ENV, fetchImpl);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("cache-control"), "no-store");
});

// ---- Words and checks ----------------------------------------------------------------

test("which item an address points at", () => {
  assert.deepEqual(previewTarget(`/market/${ID}`), { kind: "market", id: ID });
  assert.deepEqual(previewTarget(`/events/${ID}/`), { kind: "event", id: ID });
  assert.deepEqual(previewTarget(`/help/${ID}`), { kind: "question", id: ID });
  assert.deepEqual(previewTarget(`/travel/${ID.toUpperCase()}`), { kind: "trip", id: ID });
  for (const path of ["/market", "/market/", "/market/new", `/docs/${ID}`, `/market/${ID}/x`, `/marketx/${ID}`, "/", "", null]) {
    assert.equal(previewTarget(path), null, String(path));
  }
});

test("a preview from the database is checked: only its kind's keys, text where text belongs", () => {
  assert.equal(cleanPreview(null, "market"), null);
  assert.equal(cleanPreview({ kind: "event", label: "Event" }, "market"), null);
  assert.equal(cleanPreview({ kind: "market", label: "  " }, "market"), null);
  assert.deepEqual(cleanPreview({ kind: "market", label: "Item for sale", city: " Berlin\n", image: PHOTO, title: "secret", price: "€5" }, "market"),
    { kind: "market", label: "Item for sale", city: "Berlin", image: PHOTO, day: null, month: null, title: null, answers: null });
  assert.equal(cleanPreview({ kind: "question", label: "Question", title: "Q", answers: "lots" }, "question").answers, null);
  assert.equal(cleanPreview({ kind: "question", label: "Question", title: "Q", answers: 3 }, "question").answers, 3);
});

test("the line and the answers in words", () => {
  assert.equal(previewLine({ label: "Housing · WG room", city: "Berlin" }), "Housing · WG room · Berlin");
  assert.equal(previewLine({ label: "Event", city: null, day: "Sun 8 Nov 2026" }), "Event · Sun 8 Nov 2026");
  assert.equal(previewLine({ label: "Trip Frankfurt → Delhi", month: "November 2026" }), "Trip Frankfurt → Delhi · November 2026");
  assert.equal(answersText(12), "12 answers, join to read them");
  assert.equal(answersText(1), "1 answer, join to read it");
  assert.equal(answersText(0), "No answers yet, join to answer it");
  assert.deepEqual(linkPreview(null), GENERIC_PREVIEW);
});

test("the rewrites to the function: one per kind, never on the admin site, and their pages stay the app's", () => {
  assert.deepEqual(PREVIEW_REWRITES.map((r) => [r.source, r.destination]), [
    ["/market/:id", "/api/preview?kind=market&id=:id"], ["/events/:id", "/api/preview?kind=event&id=:id"],
    ["/help/:id", "/api/preview?kind=question&id=:id"], ["/travel/:id", "/api/preview?kind=trip&id=:id"]]);
  for (const r of PREVIEW_REWRITES) {
    assert.deepEqual(r.missing, [{ type: "host", value: "admin.nriclub.app" }]);
    assert.ok(APP_SECTIONS.includes(r.source.split("/")[1]));
    assert.ok(isAppPath(r.source.replace(":id", ID)));
  }
  assert.ok(!APP_SECTIONS.includes("api"));
});
