// ============================================================================
// The site's own addresses: the first part of every path the app answers
// (App.jsx, and Dashboard.jsx's parsePath), besides "/". vercel.json sends
// these to the app (app.html); any other address that isn't a file gets
// 404.html with the status 404, and the app shows "Page not found"
// (NotFoundPage.jsx). The build checks that vercel.json lists exactly these
// (vite.config.js), so add a new page's path here and there together.
//   /find  /groups[/id]  /events[/id]  /help[/id]  /docs[/id]  /market[/id]
//   /messages[/id]  /profile  /u/<id>  /post/<id>  /mentoring  /mentors
//   /city/<city>  /guides[/<slug>]  /whats-on  /travel[/<id>]  /ambassador
//   /impressum  /terms[/<version>]  /privacy  /report
// The admin site (admin.nriclub.app) answers every path.
// /api/... belongs to Vercel's functions (api/collect.js, the website
// analytics; api/preview.js, the link previews), which Vercel answers before
// any rewrite: never make "api" one of the app's sections (the build stops
// if it is).
// A single Market listing, event, question or trip (/market/<id>,
// /events/<id>, /help/<id>, /travel/<id>) goes to api/preview.js instead,
// which answers with the app plus that item's link preview
// (PREVIEW_REWRITES, below; the build checks vercel.json has them, in their
// place: after the admin site's rule, before the app's).
// ============================================================================

import { PREVIEW_KINDS, PREVIEW_PATHS } from "./preview.js";

export const APP_SECTIONS = [
  "find", "groups", "events", "help", "docs", "market", "messages", "profile", "u", "post", "mentoring", "mentors",
  "city", "guides", "whats-on", "travel", "ambassador", "impressum", "terms", "privacy", "report",
];

// The rewrite in vercel.json that sends them to the app.
export const APP_REWRITE_SOURCE = `/(${APP_SECTIONS.join("|")})(/.*)?`;

// The rewrites in vercel.json that send one item's address to
// api/preview.js, never on the admin site.
export const ADMIN_HOST = "admin.nriclub.app";
export const PREVIEW_FUNCTION = "/api/preview";
export const PREVIEW_REWRITES = PREVIEW_KINDS.map((kind) => ({
  source: `/${PREVIEW_PATHS[kind]}/:id`,
  missing: [{ type: "host", value: ADMIN_HOST }],
  destination: `${PREVIEW_FUNCTION}?kind=${kind}&id=:id`,
}));

// Whether the app has a page at this path ("/" and the files the homepage is
// served as count too).
export function isAppPath(path) {
  const p = String(path || "/");
  if (p === "/" || p === "" || /^\/(index|app)\.html$/.test(p)) return true;
  const first = p.split("/")[1] || "";
  return APP_SECTIONS.includes(first);
}
