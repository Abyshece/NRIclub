// ============================================================================
// The site's own addresses: the first part of every path the app answers
// (App.jsx, and Dashboard.jsx's parsePath), besides "/". vercel.json sends
// these to the app (app.html); any other address that isn't a file gets
// 404.html with the status 404, and the app shows "Page not found"
// (NotFoundPage.jsx). The build checks that vercel.json lists exactly these
// (vite.config.js), so add a new page's path here and there together.
//   /find  /groups[/id]  /events[/id]  /help  /docs[/id]  /market[/id]
//   /messages[/id]  /profile  /u/<id>  /post/<id>  /mentoring  /mentors
//   /city/<city>  /guides[/<slug>]  /whats-on  /travel[/<id>]  /ambassador
//   /impressum  /terms[/<version>]  /privacy  /report
// The admin site (admin.nriclub.app) answers every path.
// /api/... belongs to Vercel's functions (api/collect.js, the website
// analytics), which Vercel answers before any rewrite: never make "api" one
// of the app's sections (the build stops if it is).
// ============================================================================

export const APP_SECTIONS = [
  "find", "groups", "events", "help", "docs", "market", "messages", "profile", "u", "post", "mentoring", "mentors",
  "city", "guides", "whats-on", "travel", "ambassador", "impressum", "terms", "privacy", "report",
];

// The rewrite in vercel.json that sends them to the app.
export const APP_REWRITE_SOURCE = `/(${APP_SECTIONS.join("|")})(/.*)?`;

// Whether the app has a page at this path ("/" and the files the homepage is
// served as count too).
export function isAppPath(path) {
  const p = String(path || "/");
  if (p === "/" || p === "" || /^\/(index|app)\.html$/.test(p)) return true;
  const first = p.split("/")[1] || "";
  return APP_SECTIONS.includes(first);
}
