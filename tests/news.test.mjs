// Tests for News: the Edge Function behind /news and /news/<slug>
// (api/news.js) and its words and checks (src/content/news.js). No network,
// no database: the database's side is in supabase/tests/rls_test.py.
//
//     node --test tests/news.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { handle, CACHE } from "../api/news.js";
import {
  cleanNews, newsProblem, newsSlug, newsBlocks, newsDates, newsShareUrl, newsShareText, isNewsSlug, NEWS_TOPICS,
} from "../src/content/news.js";
import { NEWS_REWRITES, APP_SECTIONS, isAppPath } from "../src/content/routes.js";

const ENV = { VITE_SUPABASE_URL: "https://abc.supabase.co", VITE_SUPABASE_ANON_KEY: "anon-key" };
const SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>NRIClub · One home for NRIs and Indians abroad</title>
  <meta name="description" content="Meet Indians in your city." />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="NRIClub · One home for NRIs and Indians abroad" />
  <meta property="og:image" content="https://nriclub.app/og-image.png?v=3" />
  <script type="module" crossorigin src="/assets/index-abc.js"></script>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;

const POST = {
  slug: "blue-card-2027", title: "Blue Card: new salary thresholds for 2027", topic: "visa", city: "",
  summary: "The minimum salaries for the EU Blue Card change on 1 January 2027.",
  body: "From 1 January 2027 the thresholds rise.\n\nWHAT CHANGES\n- the general threshold\n- the shortage threshold",
  sources: [{ name: "BAMF", url: "https://www.bamf.de/blue-card" }],
  published_at: "2026-11-03T09:00:00+00:00", edited_at: null,
};
const OTHER = { ...POST, slug: "oci-camp-munich", title: "OCI camp in Munich", topic: "consulate", city: "Munich", published_at: "2026-11-01T09:00:00+00:00" };

// A stand-in for fetch: /app.html, and the table's answer (a function of the
// PostgREST query) for /rest/v1/news_posts.
function fakeFetch(answer, { shell = SHELL } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/app.html")) return shell === null ? new Response("", { status: 404 }) : new Response(shell);
    if (String(url).includes("/rest/v1/news_posts")) {
      const r = answer(new URL(String(url)).searchParams);
      if (r instanceof Response) return r;
      return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return { fetchImpl, calls };
}
const table = (rows) => (q) => {
  const slug = /^eq\.(.*)$/.exec(q.get("slug") || "")?.[1];
  return slug ? rows.filter((r) => r.slug === slug) : rows;
};
const request = (path, host = "nriclub.app") => new Request(`https://${host}${path}`, { headers: { host } });
const meta = (html, key) => new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)" />`).exec(html)?.[1] ?? null;
const dbCalls = (calls) => calls.filter((c) => c.url.includes("/rest/v1/"));

test("a post: its own card, canonical, indexable, its text in the page, cached a minute", async () => {
  const { fetchImpl, calls } = fakeFetch(table([POST, OTHER]));
  const res = await handle(request("/api/news?slug=blue-card-2027"), ENV, fetchImpl);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), CACHE);
  assert.equal(res.headers.get("X-Robots-Tag"), null);
  assert.equal(meta(html, "robots"), null);
  assert.equal(meta(html, "og:title"), POST.title);
  assert.equal(meta(html, "og:description"), POST.summary);
  assert.equal(meta(html, "og:type"), "article");
  assert.equal(meta(html, "og:url"), "https://nriclub.app/news/blue-card-2027");
  assert.equal(meta(html, "article:published_time"), POST.published_at);
  assert.match(html, /<link rel="canonical" href="https:\/\/nriclub.app\/news\/blue-card-2027" \/>/);
  assert.match(html, /<title>Blue Card: new salary thresholds for 2027 · NRIClub<\/title>/);
  assert.equal(html.split("<title>").length - 1, 1);
  assert.match(html, /<h1>Blue Card: new salary thresholds for 2027<\/h1>/);
  assert.match(html, /<h2>WHAT CHANGES<\/h2><ul><li>the general threshold<\/li><li>the shortage threshold<\/li><\/ul>/);
  assert.match(html, /<a href="https:\/\/www.bamf.de\/blue-card" rel="noopener noreferrer">BAMF<\/a>/);
  assert.match(html, /General information, not legal or tax advice/);
  assert.match(html, /<h2>More news<\/h2><ul><li><a href="\/news\/oci-camp-munich">/);
  assert.match(html, /<script type="module" crossorigin src="\/assets\/index-abc.js"><\/script>/);
  // Only published posts are readable; the query asks for one post by slug and the latest few.
  assert.ok(dbCalls(calls).every((c) => c.init.headers.apikey === "anon-key" && c.init.headers.Authorization === "Bearer anon-key"));
  assert.ok(dbCalls(calls).some((c) => c.url.includes("slug=eq.blue-card-2027")));
});

test("the list: the latest posts, the news card, canonical /news", async () => {
  const { fetchImpl } = fakeFetch(table([POST, OTHER]));
  const res = await handle(request("/api/news"), ENV, fetchImpl);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.equal(meta(html, "og:title"), "News for Indians in Germany");
  assert.equal(meta(html, "robots"), null);
  assert.match(html, /<link rel="canonical" href="https:\/\/nriclub.app\/news" \/>/);
  assert.match(html, /<li><a href="\/news\/blue-card-2027">Blue Card: new salary thresholds for 2027<\/a>/);
  assert.match(html, /<li><a href="\/news\/oci-camp-munich">OCI camp in Munich<\/a>/);
});

test("a post that isn't there: 404, noindex, the way to the list", async () => {
  const { fetchImpl } = fakeFetch(table([POST]));
  for (const path of ["/api/news?slug=no-such-post", "/api/news?slug=Bad%20Slug", "/api/news?slug=%E0%A4%A"]) {
    const res = await handle(request(path), ENV, fetchImpl);
    const html = await res.text();
    assert.equal(res.status, 404, path);
    assert.equal(meta(html, "robots"), "noindex");
    assert.equal(res.headers.get("X-Robots-Tag"), "noindex");
    assert.match(html, /This news post isn't here/);
  }
});

test("an address that can't be a post never reaches the database", async () => {
  const { fetchImpl, calls } = fakeFetch(table([POST]));
  await handle(request("/api/news?slug=..%2F..%2Fadmin"), ENV, fetchImpl);
  await handle(request("/api/news?slug=a"), ENV, fetchImpl);
  assert.equal(dbCalls(calls).length, 0);
});

test("the database down, slow or not set up: 503 with the app, not cached, noindex", async () => {
  for (const [env, answer] of [[{}, () => []], [ENV, () => new Response("{}", { status: 500 })], [ENV, () => ({ not: "a list" })]]) {
    const { fetchImpl } = fakeFetch(answer);
    for (const path of ["/api/news", "/api/news?slug=blue-card-2027"]) {
      const res = await handle(request(path), env, fetchImpl);
      const html = await res.text();
      assert.equal(res.status, 503, path);
      assert.equal(res.headers.get("Cache-Control"), "no-store");
      assert.equal(meta(html, "robots"), "noindex");
      assert.match(html, /<div id="root"><\/div>/);
    }
  }
});

test("the post comes from the address when the rewrite gives no query", async () => {
  const { fetchImpl } = fakeFetch(table([POST]));
  const html = await (await handle(request("/news/blue-card-2027"), ENV, fetchImpl)).text();
  assert.equal(meta(html, "og:title"), POST.title);
});

test("the admin site gets the app as it is; a forged host never ends up in the card", async () => {
  const a = fakeFetch(table([POST]));
  const res = await handle(request("/api/news?slug=blue-card-2027", "admin.nriclub.app"), ENV, a.fetchImpl);
  assert.equal(await res.text(), SHELL);
  assert.equal(dbCalls(a.calls).length, 0);
  const b = fakeFetch(table([POST]));
  const html = await (await handle(request("/api/news?slug=blue-card-2027", "evil.example"), ENV, b.fetchImpl)).text();
  assert.equal(meta(html, "og:url"), "https://nriclub.app/news/blue-card-2027");
});

test("words from the database are escaped, and a source that isn't https:// is left out", async () => {
  const attack = `"><script>alert(1)</script>`;
  const { fetchImpl } = fakeFetch(table([{ ...POST, title: `Title ${attack}`, summary: `Summary ${attack} long enough`, body: attack,
    sources: [{ name: attack, url: "javascript:alert(1)" }, { name: "OK", url: "https://ok.example" }] }]));
  const html = await (await handle(request("/api/news?slug=blue-card-2027"), ENV, fetchImpl)).text();
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(!html.includes("javascript:"));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<a href="https:\/\/ok.example" rel="noopener noreferrer">OK<\/a>/);
});

test("without the app's page: 503, not cached", async () => {
  const { fetchImpl } = fakeFetch(table([POST]), { shell: null });
  const res = await handle(request("/api/news"), ENV, fetchImpl);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("a post from the database is checked: only its fields, a known topic, https sources, at most 3", () => {
  assert.equal(cleanNews(null), null);
  assert.equal(cleanNews({ ...POST, slug: "Bad Slug" }), null);
  assert.equal(cleanNews({ ...POST, title: "  " }), null);
  const c = cleanNews({ ...POST, extra: "x", topic: "nope", sources: [...Array(5)].map((_, i) => ({ name: `S${i}`, url: "https://x.example" })) });
  assert.equal(c.extra, undefined);
  assert.equal(c.topic, "community");
  assert.equal(c.sources.length, 3);
  assert.deepEqual(Object.keys(c).sort(), ["body", "city", "edited_at", "published_at", "slug", "sources", "summary", "title", "topic"]);
});

test("the admin form's rules", () => {
  const ok = { slug: "abc", title: "Title", topic: "visa", summary: "A summary long enough.", body: "Text", sources: [{ name: "BAMF", url: "https://bamf.de" }] };
  assert.equal(newsProblem(ok), "");
  assert.match(newsProblem({ ...ok, slug: "a--b" }), /address/);
  assert.match(newsProblem({ ...ok, title: "Hi" }), /between 5 and 120/);
  assert.match(newsProblem({ ...ok, summary: "short" }), /between 20 and 220/);
  assert.match(newsProblem({ ...ok, sources: [] }), /at least one source/);
  assert.match(newsProblem({ ...ok, sources: [{ name: "BAMF", url: "http://bamf.de" }] }), /https/);
  assert.match(newsProblem({ ...ok, sources: [{ name: "", url: "https://bamf.de" }] }), /name/);
  assert.match(newsProblem({ ...ok, topic: "politics" }), /topic/);
});

test("addresses, text, dates and sharing", () => {
  assert.equal(newsSlug("Blue Card: new salary thresholds for 2027!"), "blue-card-new-salary-thresholds-for-2027");
  assert.ok(isNewsSlug(newsSlug("x".repeat(30) + " " + "y".repeat(60))));
  assert.deepEqual(newsBlocks("Intro.\n\nWHO\n- one\n* two\n• three").map((b) => b.type), ["p", "h", "ul"]);
  assert.equal(newsBlocks("- one\n* two\n• three")[0].items.length, 3);
  assert.equal(newsDates(POST), "Published 3 November 2026");
  assert.equal(newsDates({ ...POST, edited_at: "2026-11-03T15:00:00+00:00" }), "Published 3 November 2026");
  assert.equal(newsDates({ ...POST, edited_at: "2026-11-05T10:00:00+00:00" }), "Published 3 November 2026 · Updated 5 November 2026");
  assert.equal(newsShareUrl(POST), "https://nriclub.app/news/blue-card-2027?utm_source=whatsapp&utm_medium=share&utm_campaign=news&utm_content=blue-card-2027");
  assert.ok(newsShareText(POST).startsWith(`${POST.title}\n\n${POST.summary}\n\nhttps://nriclub.app/news/blue-card-2027?`));
  assert.ok(Object.keys(NEWS_TOPICS).length >= 6);
});

test("the rewrites: /news and /news/<slug> to the function, never on the admin site; the app has the page too", () => {
  assert.deepEqual(NEWS_REWRITES.map((r) => [r.source, r.destination]), [["/news", "/api/news"], ["/news/:slug", "/api/news?slug=:slug"]]);
  assert.ok(NEWS_REWRITES.every((r) => r.missing[0].value === "admin.nriclub.app"));
  assert.ok(APP_SECTIONS.includes("news"));
  assert.ok(isAppPath("/news") && isAppPath("/news/blue-card-2027"));
});
