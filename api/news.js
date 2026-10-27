// ============================================================================
// /news and /news/<slug>: the app (app.html) with the page's link preview
// and its text, for WhatsApp and the other apps that show a card for a
// shared link, and for search engines. Their crawlers may not run
// JavaScript, so the tags and the text come from here; the page people see
// is src/NewsPage.jsx (members get the same in the app). Unlike the shared
// items (api/preview.js), news is ours and public: search engines may list
// it.
//
// A Vercel Edge Function, like api/preview.js. vercel.json sends these two
// addresses here (NEWS_REWRITES in src/content/routes.js: after the admin
// site's rule and with "missing" its host, and before the app's own rule).
//
//   * Fetches the app (/app.html) from the same deployment, and the
//     published posts from the database (public.news_posts, which anyone may
//     read) with the site's public key (VITE_SUPABASE_URL and
//     VITE_SUPABASE_ANON_KEY), so a post shows its own card the minute it is
//     published, without a new deploy.
//   * A post: its title and summary as the card, its address as canonical,
//     and the post's text, sources and the note that it isn't advice in the
//     page (replaced as soon as the app starts). The list: the latest 30
//     posts. Every value is HTML-escaped.
//   * A post that isn't there (never was, taken off, deleted): 404, noindex,
//     with a link to the list (the app shows the list too). When the
//     settings are missing or the database doesn't answer in time: 503 with
//     the app, which loads the news itself (search engines come back later).
//   * Cached for a minute at most, so a post taken off soon disappears. Only
//     if /app.html itself can't be fetched: 503, reload.
// ============================================================================
import { escapeHtml, headTags, injectTags } from "./preview.js";
import { SITE, SITE_IMAGE } from "../src/content/preview.js";
import {
  NEWS_PATH, NEWS_TITLE, NEWS_DESCRIPTION, NEWS_LEAD, NEWS_DISCLAIMER, NEWS_COLUMNS, NEWS_TOPICS,
  cleanNews, isNewsSlug, newsPath, newsBlocks, newsDates, newsDate, newsDay,
} from "../src/content/news.js";

export const config = { runtime: "edge" };

export const ADMIN_HOST = "admin.nriclub.app";
export const CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
const LIST_LIMIT = 30;

// Published posts from the database: { posts } (cleanNews each), or null
// when the settings are missing or the database fails or is slow. query:
// PostgREST's filter and order, e.g. "slug=eq.x&limit=1".
export async function fetchNews(query, env = {}, fetchImpl = fetch) {
  const base = String(env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(env.VITE_SUPABASE_ANON_KEY || "").trim();
  if (!/^https?:\/\/[^/]+$/.test(base) || !key) return null;
  try {
    // Supabase's newer publishable keys ("sb_publishable_…") go in apikey
    // only; the older anon key (a JWT) also as the bearer token.
    const auth = key.startsWith("sb_") ? {} : { Authorization: `Bearer ${key}` };
    const res = await fetchImpl(`${base}/rest/v1/news_posts?select=${NEWS_COLUMNS}&${query}`, {
      headers: { apikey: key, Accept: "application/json", ...auth },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? { posts: rows.map(cleanNews).filter(Boolean) } : null;
  } catch {
    return null;
  }
}

const esc = escapeHtml;
const main = (body) => `<main style="max-width:720px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif;color:#37352F;line-height:1.6">${body}`
  + `<p style="font-size:14px;margin-top:32px"><a href="/">NRIClub home</a> · <a href="${NEWS_PATH}">All news</a> · <a href="/guides">NRI guides</a>`
  + ` · <a href="/terms">Terms of Use</a> · <a href="/privacy">Privacy Policy</a> · <a href="/impressum">Impressum</a></p></main>`;
const join = `<p><a href="/">Join NRIClub</a>: a free community for Indians abroad. Our team checks every new member.</p>`;
const item = (p) => `<li><a href="${esc(newsPath(p.slug))}">${esc(p.title)}</a> `
  + `(<time datetime="${esc(newsDay(p.published_at))}">${esc(newsDate(p.published_at))}</time>): ${esc(p.summary)}</li>`;

// A post as plain HTML (the text search engines read).
export function articleHtml(post, more = []) {
  const body = newsBlocks(post.body).map((b) => (b.type === "h" ? `<h2>${esc(b.text)}</h2>`
    : b.type === "ul" ? `<ul>${b.items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : `<p>${esc(b.text)}</p>`)).join("");
  const sources = post.sources.length
    ? `<h2>${post.sources.length === 1 ? "Source" : "Sources"}</h2><ul>${post.sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener noreferrer">${esc(s.name)}</a></li>`).join("")}</ul>`
    : "";
  return main(`<p><a href="${NEWS_PATH}">← All news</a></p>`
    + `<p>${esc(NEWS_TOPICS[post.topic] || "")}${post.city ? ` · ${esc(post.city)}` : ""}</p>`
    + `<h1>${esc(post.title)}</h1><p><strong>${esc(post.summary)}</strong></p><p>${esc(newsDates(post))} · From the NRIClub team</p>`
    + body + sources + `<p><em>${esc(NEWS_DISCLAIMER)}</em></p>` + join
    + (more.length ? `<h2>More news</h2><ul>${more.map(item).join("")}</ul>` : ""));
}

// The list as plain HTML.
export function listHtml(posts) {
  return main(`<h1>${esc(NEWS_TITLE)}</h1><p>${esc(NEWS_LEAD)}</p>`
    + (posts.length ? `<ul>${posts.map(item).join("")}</ul>` : "<p>No news yet. Check back soon.</p>")
    + `<p><em>${esc(NEWS_DISCLAIMER)}</em></p>` + join);
}

const notFoundHtml = () => main(`<h1>This news post isn't here</h1><p>It may have been taken off the site. <a href="${NEWS_PATH}">See the latest news</a>.</p>`);

// The app's page with its <div id="root"></div> holding html (the app
// replaces it as soon as it starts).
const withRoot = (shell, html) => shell.replace('<div id="root"></div>', () => `<div id="root">${html}</div>`);

const isAdminHost = (host) => host === ADMIN_HOST || host.startsWith("admin.");

// The request, with the settings env ({ VITE_SUPABASE_URL,
// VITE_SUPABASE_ANON_KEY }); fetchImpl fetches /app.html and asks the
// database.
export async function handle(request, env = {}, fetchImpl = fetch) {
  const url = new URL(request.url);
  const host = String(request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host)
    .split(",")[0].trim().toLowerCase();
  const proto = String(request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "")).split(",")[0].trim();
  // The card's address: only our own hosts; anything else becomes
  // nriclub.app, so a forged Host header can't end up in a cached card.
  const ownHost = /^(www\.)?nriclub\.app$|^[a-z0-9-]+\.vercel\.app$|^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const origin = ownHost ? `${proto === "http" ? "http" : "https"}://${host}` : SITE;

  let shell = null;
  const shellHeaders = {};
  for (const name of ["cookie", "x-vercel-protection-bypass"]) {
    const value = request.headers.get(name);
    if (value) shellHeaders[name] = value;
  }
  for (let attempt = 0; attempt < 2 && shell === null; attempt += 1) {
    try {
      const res = await fetchImpl(new URL("/app.html", request.url).href, { headers: shellHeaders, signal: AbortSignal.timeout(5000) });
      if (res.ok) shell = await res.text();
    } catch { /* tried again below, once */ }
  }
  if (shell === null) {
    return new Response('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="robots" content="noindex" />'
      + '<title>NRIClub</title></head><body><p>NRIClub couldn\'t load this page. Please reload it.</p></body></html>',
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "5" } });
  }
  const page = (status, body, cache, extra = {}) => new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": cache, ...extra },
  });
  // The admin site never comes here (vercel.json); if it did, it gets the
  // app as it is, and the database isn't asked.
  if (isAdminHost(host)) return page(200, shell, "no-store");

  // Which page: from the rewrite's query (?slug=…), or the address.
  let slug = url.searchParams.get("slug");
  if (slug === null) slug = /^\/news\/([^/]+)\/?$/.exec(url.pathname)?.[1] || "";
  try { slug = decodeURIComponent(slug); } catch { slug = "\u0000"; }
  slug = slug.toLowerCase();
  const unavailable = (path) => page(503, injectTags(shell, headTags({
    title: `${NEWS_TITLE} · NRIClub`, description: NEWS_DESCRIPTION, image: SITE_IMAGE, url: `${origin}${path}`,
    pageTitle: `${NEWS_TITLE} · NRIClub`, robots: "noindex",
  })), "no-store", { "Retry-After": "30" });

  if (!slug) {
    const list = await fetchNews(`order=published_at.desc&limit=${LIST_LIMIT}`, env, fetchImpl);
    if (!list) return unavailable(NEWS_PATH);
    const tags = headTags({
      title: NEWS_TITLE, description: NEWS_DESCRIPTION, image: SITE_IMAGE, url: `${origin}${NEWS_PATH}`,
      pageTitle: `${NEWS_TITLE} · NRIClub`, robots: null, canonical: `${SITE}${NEWS_PATH}`,
    });
    return page(200, withRoot(injectTags(shell, tags), listHtml(list.posts)), CACHE);
  }

  const notFound = () => page(404, withRoot(injectTags(shell, headTags({
    title: NEWS_TITLE, description: NEWS_DESCRIPTION, image: SITE_IMAGE, url: `${origin}${NEWS_PATH}`,
    pageTitle: `News · NRIClub`, robots: "noindex",
  })), notFoundHtml()), CACHE, { "X-Robots-Tag": "noindex" });
  if (!isNewsSlug(slug)) return notFound();
  const [one, latest] = await Promise.all([
    fetchNews(`slug=eq.${slug}&limit=1`, env, fetchImpl),
    fetchNews("order=published_at.desc&limit=4", env, fetchImpl),
  ]);
  if (!one) return unavailable(newsPath(slug));
  const post = one.posts[0];
  if (!post) return notFound();
  const tags = headTags({
    title: post.title, description: post.summary, image: SITE_IMAGE, url: `${origin}${newsPath(post.slug)}`,
    pageTitle: `${post.title} · NRIClub`, robots: null, type: "article", canonical: `${SITE}${newsPath(post.slug)}`,
    published: post.published_at || undefined, modified: post.edited_at || undefined,
  });
  const more = (latest?.posts || []).filter((p) => p.slug !== post.slug).slice(0, 3);
  return page(200, withRoot(injectTags(shell, tags), articleHtml(post, more)), CACHE);
}

// Vercel calls this with the request. The settings are read by name, as
// Vercel's Edge runtime expects.
export default function handler(request) {
  const env = typeof process !== "undefined" && process.env
    ? { VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY }
    : {};
  return handle(request, env);
}
