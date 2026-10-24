// ============================================================================
// Website analytics: the names and limits the browser (src/analytics.js), the
// collecting function (api/collect.js), the database
// (supabase/migrations/20261029000000_analytics.sql) and the admin panel
// (src/admin/AnalyticsView.jsx) share. Plain data, no browser code: the
// function and the tests import it too.
//
// Analytics run only for visitors who chose "Accept" on the privacy banner
// (src/ConsentBanner.jsx). Nothing is sent and nothing is stored in the
// browser for analytics before that (§ 25 TDDDG, Art. 6(1)(a) GDPR).
// ============================================================================

// Where the browser sends its events (a Vercel Edge Function, same site).
export const COLLECT_PATH = "/api/collect";

// What one request may carry, and how long each text may be (in characters).
export const MAX_EVENTS = 50;
export const MAX_BODY_BYTES = 64 * 1024;
export const LIMITS = {
  path: 200,
  title: 120,
  label: 80,
  target: 200,
  referrer_domain: 100,
  utm: 100,
};

// The kinds of event: a page opened, a button or link clicked, a step in
// signing up or logging in, and the end of a visit (its last page).
export const EVENT_TYPES = ["pageview", "click", "funnel", "session_end"];

// The steps of signing up, in order, and of logging in. Each is sent once it
// happens, with no details (never the email address or anything typed).
export const SIGNUP_STEPS = [
  { key: "signup_open", label: "Opened sign-up" },
  { key: "signup_email", label: "Entered an email address" },
  { key: "signup_code_sent", label: "Code sent" },
  { key: "signup_code_ok", label: "Code confirmed" },
  { key: "signup_password", label: "Password set, account ready" },
  { key: "details_open", label: "Opened the check details step" },
  { key: "details_sent", label: "Sent check details" },
];
export const LOGIN_STEPS = [
  { key: "login_start", label: "Opened log in" },
  { key: "login_ok", label: "Logged in" },
];
export const FUNNEL_STEPS = [...SIGNUP_STEPS, ...LOGIN_STEPS].map((s) => s.key);

// Device: only these families and size classes, nothing finer.
export const DEVICES = ["mobile", "tablet", "desktop"];
export const BROWSERS = ["Chrome", "Safari", "Firefox", "Edge", "Opera", "Samsung Internet", "Other"];
export const OSES = ["iOS", "Android", "Windows", "macOS", "Linux", "ChromeOS", "Other"];

// How long the choice on the banner counts before we ask again.
export const ASK_AGAIN_MONTHS = { accepted: 12, declined: 6 };

// How long the raw events are kept (private.analytics_cleanup).
export const KEEP_MONTHS = 6;
