// ============================================================================
// /market/<id>, /events/<id>, /help/<id> and /travel/<id>: the app
// (app.html) with the link preview of that item in its <head> (Open Graph
// tags), for WhatsApp and the other apps that show a card for a shared link.
// Their crawlers don't run JavaScript, so the tags come from here; the page
// people see is src/PreviewPage.jsx (signed out) or the app (members).
//
// A Vercel Edge Function, like api/collect.js. vercel.json sends these four
// addresses here (PREVIEW_REWRITES in src/content/routes.js: after the
// admin site's rule and with "missing" its host, so the admin site never
// comes here, and before the app's own rule).
//
//   * Fetches the app (/app.html) from the same deployment, and the item's
//     preview from the database: public.public_preview, which anyone may
//     call, with the site's public key (VITE_SUPABASE_URL and
//     VITE_SUPABASE_ANON_KEY, the settings the site is built with; Vercel
//     gives functions the project's settings too).
//   * Replaces the site's own link preview with the item's: its title (e.g.
//     "Housing · WG room · Berlin, on NRIClub"; a question's title), a line
//     of description, its photo (or the site's image) and its address. Every
//     value is HTML-escaped: titles are members' words. The page's own
//     <title> stays the site's (it's what website analytics record).
//   * An item without a preview (switched off, not there, ended, removed:
//     the database doesn't say which) gets the same words as any other, and
//     so does every request when the settings are missing or the database
//     doesn't answer in time. Every item page says noindex: previews are for
//     people who have the link, not for search engines.
//   * Answers 200 with the app for every request, so members get the app as
//     before. Cached for a minute at most, so a preview its author switched
//     off soon disappears. Only if /app.html itself can't be fetched: 503,
//     reload.
// ============================================================================
import {
  PREVIEW_KINDS, PREVIEW_PATHS, isItemId, itemPath, cleanPreview, linkPreview, previewTarget, SITE_IMAGE, SITE_TITLE,
} from "../src/content/preview.js";

export const config = { runtime: "edge" };

export const ADMIN_HOST = "admin.nriclub.app";
export const CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=60";
const SITE_IMAGE_ALT = "The NRIClub logo, a black lion's head, and the words: One home for Indians abroad.";

// Text for an HTML attribute or element: & < > " ' as entities.
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// The <head> tags of a page: { title, description, image, url } for the
// link preview; pageTitle for the browser's tab (the site's own: a page's
// title is what website analytics record, and never a member's words).
export function headTags({ title, description, image, url, pageTitle = SITE_TITLE }) {
  const meta = (attr, key, value) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;
  return [
    `<title>${escapeHtml(pageTitle)}</title>`,
    meta("name", "description", description),
    meta("name", "robots", "noindex"),
    meta("property", "og:type", "website"),
    meta("property", "og:site_name", "NRIClub"),
    meta("property", "og:title", title),
    meta("property", "og:description", description),
    meta("property", "og:url", url),
    meta("property", "og:image", image),
    ...(image === SITE_IMAGE ? [meta("property", "og:image:width", "1200"), meta("property", "og:image:height", "630"),
      meta("property", "og:image:alt", SITE_IMAGE_ALT)] : []),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", title),
    meta("name", "twitter:description", description),
    meta("name", "twitter:image", image),
  ].join("\n  ");
}

// The app's page with its own title, description, link preview, robots
// and canonical tags taken out of <head>, and these tags in their place.
export function injectTags(shell, tags) {
  const end = shell.search(/<\/head>/i);
  if (end < 0) return shell;
  const head = shell.slice(0, end)
    .replace(/<title>[\s\S]*?<\/title>\s*/gi, "")
    .replace(/<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*|description|robots)"[^>]*>\s*/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "")
    .replace(/\s*$/, "\n  ");
  return `${head}${tags}\n</head>${shell.slice(end + "</head>".length)}`;
}

// The item's preview from the database (cleanPreview), or null: also when
// the settings are missing, for an unknown kind or an id that can't be one
// (the database isn't asked then), and when the database fails or is slow.
export async function fetchPreview(kind, id, env = {}, fetchImpl = fetch) {
  const base = String(env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(env.VITE_SUPABASE_ANON_KEY || "").trim();
  if (!/^https?:\/\/[^/]+$/.test(base) || !key || !PREVIEW_KINDS.includes(kind) || !isItemId(id)) return null;
  try {
    // Supabase's newer publishable keys ("sb_publishable_…") go in apikey
    // only; the older anon key (a JWT) also as the bearer token.
    const auth = key.startsWith("sb_") ? {} : { Authorization: `Bearer ${key}` };
    const res = await fetchImpl(`${base}/rest/v1/rpc/public_preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, ...auth },
      body: JSON.stringify({ p_kind: kind, p_id: id }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return cleanPreview(await res.json(), kind);
  } catch {
    return null;
  }
}

const isAdminHost = (host) => host === ADMIN_HOST || host.startsWith("admin.");

// The request, with the settings env ({ VITE_SUPABASE_URL,
// VITE_SUPABASE_ANON_KEY }); fetchImpl fetches /app.html and asks the
// database.
export async function handle(request, env = {}, fetchImpl = fetch) {
  const url = new URL(request.url);
  const host = String(request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host)
    .split(",")[0].trim().toLowerCase();
  const proto = String(request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "")).split(",")[0].trim();
  const origin = `${proto === "http" ? "http" : "https"}://${host}`;

  // The app's page, as the deployment serves it (with the visitor's cookies,
  // so a preview deployment's protection lets it through; nriclub.app sets
  // none of its own).
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
  const page = (body, cache) => new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": cache, "X-Robots-Tag": "noindex" },
  });
  // The admin site never comes here (vercel.json); if it did, it gets the
  // app as it is, and the database isn't asked.
  if (isAdminHost(host)) return page(shell, "no-store");

  // Which item: from the rewrite's query (?kind=…&id=…), or the address.
  let kind = url.searchParams.get("kind");
  let id = url.searchParams.get("id");
  if (!kind && !id) ({ kind, id } = previewTarget(url.pathname) || {});
  id = String(id || "").toLowerCase();
  const known = PREVIEW_KINDS.includes(kind) && isItemId(id);
  const preview = known ? await fetchPreview(kind, id, env, fetchImpl) : null;
  const words = linkPreview(preview);
  const tags = headTags({ ...words, url: known ? `${origin}${itemPath(kind, id)}` : `${origin}/${PREVIEW_PATHS[kind] || ""}` });
  return page(injectTags(shell, tags), CACHE);
}

// Vercel calls this with the request. The settings are read by name, as
// Vercel's Edge runtime expects.
export default function handler(request) {
  const env = typeof process !== "undefined" && process.env
    ? { VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY }
    : {};
  return handle(request, env);
}
