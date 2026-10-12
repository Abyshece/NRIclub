// Small, pure helpers for the admin panel: names, places, times, errors and
// the automatic verification checks.

export const HOUR = 3600000;
export const DAY = 24 * HOUR;

let regionNames = null;
try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch { regionNames = null; }

export function countryName(code) {
  if (!code) return "";
  try { return regionNames?.of(String(code).toUpperCase()) || code; } catch { return code; }
}

// "Berlin, Germany", falling back to the free-text location.
export function placeLabel(m) {
  if (!m) return "";
  const country = countryName(m.country_code);
  if (m.city && country) return `${m.city}, ${country}`;
  return m.city || m.location || country || "";
}

export function msSince(ts) {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  return Number.isNaN(t) ? null : Math.max(0, Date.now() - t);
}

// "5m", "2h", "3d", "4mo", "2y"
export function shortDuration(ms) {
  if (ms == null) return "—";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 60) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

export function ago(ts) {
  const ms = msSince(ts);
  if (ms == null) return "";
  if (ms < 60000) return "just now";
  return `${shortDuration(ms)} ago`;
}

export function formatDate(ts, { time = false } = {}) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  const opts = { day: "numeric", month: "short", year: "numeric" };
  if (time) Object.assign(opts, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString("en-GB", opts);
}

// When a member started waiting for the current state.
export function waitingSince(m) {
  if (!m) return null;
  if (m.verification_status === "pending") return m.submitted_at || m.created_at;
  if (m.verification_status === "incomplete") return m.created_at;
  return m.reviewed_at || m.submitted_at || m.created_at;
}

export function isOverdue(m) {
  if (!m || m.verification_status !== "pending") return false;
  const ms = msSince(waitingSince(m));
  return ms != null && ms > DAY;
}

// "Diana D" for toasts.
export function shortName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "this member";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}`;
}

export function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "this member";
}

// Errors from supabaseApi are Error(text) where text is often raw PostgREST
// JSON. Our RPCs raise P0001 with a sentence meant for people.
export function friendlyError(e) {
  const raw = String((e && e.message) || e || "").trim();
  let obj = null;
  try { obj = JSON.parse(raw); } catch { obj = null; }
  if (obj && typeof obj === "object") {
    if (obj.code === "42501") return "This account doesn't have admin access any more. Sign out and sign in again.";
    if (obj.code === "PGRST301" || /jwt/i.test(obj.message || "")) return "Your session has expired. Sign out and sign in again.";
    if (obj.message) return obj.message;
  }
  if (/failed to fetch|networkerror|load failed/i.test(raw)) return "Couldn't reach the server. Check your connection and try again.";
  return raw || "Something went wrong. Please try again.";
}

// Same pattern as private.normalize_linkedin() in the database.
const LINKEDIN_RE = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/in\/([a-z0-9%_.-]{3,100})\/?(?:[?#].*)?$/i;

export function linkedinSlug(url) {
  const m = LINKEDIN_RE.exec(String(url || "").trim());
  return m ? m[1] : null;
}

export function linkedinHref(url) {
  const slug = linkedinSlug(url);
  if (slug) return `https://www.linkedin.com/in/${slug}`;
  const u = String(url || "").trim();
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

const fold = (s) => String(s || "")
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "");

// Does the LinkedIn slug contain the member's first or last name?
// Case-insensitive, ignoring accents and punctuation.
export function nameMatchesSlug(name, slug) {
  if (!slug) return false;
  let decoded = slug;
  try { decoded = decodeURIComponent(slug); } catch { decoded = slug; }
  const s = fold(decoded);
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!s || parts.length === 0) return false;
  const candidates = [fold(parts[0]), fold(parts[parts.length - 1])];
  return candidates.some((p) => p.length >= 2 && s.includes(p));
}

// ok: true = ✓, false = ⚠, null = neutral note. Unknown values (undefined,
// when the full record hasn't loaded) are left out.
export function verificationChecks(m) {
  const checks = [];
  if (!m) return checks;
  const hasLinkedin = !!String(m.linkedin_url || "").trim();
  const slug = linkedinSlug(m.linkedin_url);
  const note = String(m.verification_note || "").trim();

  if (hasLinkedin) {
    checks.push(slug
      ? { key: "link", ok: true, label: "LinkedIn link is a valid profile" }
      : { key: "link", ok: false, label: "LinkedIn link doesn't look like a profile" });
    if (slug) {
      const match = nameMatchesSlug(m.name, slug);
      checks.push(match
        ? { key: "name", ok: true, label: "LinkedIn name matches" }
        : { key: "name", ok: false, label: "LinkedIn name doesn't match", detail: `/in/${slug}` });
    }
    if (m.same_linkedin_count !== undefined) {
      const n = Number(m.same_linkedin_count) || 0;
      checks.push(n === 0
        ? { key: "dupe", ok: true, label: "No other account uses this LinkedIn" }
        : { key: "dupe", ok: false, label: `Used by ${n} other account${n === 1 ? "" : "s"}` });
    }
  } else if (m.verification_note !== undefined) {
    checks.push(note.length >= 20
      ? { key: "link", ok: true, label: "No LinkedIn — explanation provided" }
      : { key: "link", ok: false, label: "No LinkedIn and no explanation yet" });
  }

  checks.push(m.email_verified
    ? { key: "email", ok: true, label: "Email verified" }
    : { key: "email", ok: false, label: "Email not verified" });

  if (m.age_confirmed_at !== undefined || m.terms_accepted_at !== undefined) {
    const age = !!m.age_confirmed_at;
    const terms = !!m.terms_accepted_at;
    checks.push(age && terms
      ? { key: "terms", ok: true, label: "18+ and Terms accepted" }
      : { key: "terms", ok: false, label: !age && !terms ? "18+ and Terms not confirmed" : !age ? "18+ not confirmed" : "Terms not accepted" });
  }

  if (m.verification_status === "pending") {
    const ms = msSince(waitingSince(m));
    if (ms != null) {
      checks.push(ms > DAY
        ? { key: "wait", ok: false, label: `Waiting ${shortDuration(ms)}`, detail: "over 24 hours" }
        : { key: "wait", ok: true, label: `Waiting ${shortDuration(ms)}` });
    }
  }

  const prev = Number(m.previous_decisions) || 0;
  if (prev > 0) {
    checks.push({ key: "prev", ok: null, label: `Previously reviewed ${prev} time${prev === 1 ? "" : "s"}` });
  }
  return checks;
}

export const VERIFICATION_LABELS = {
  pending: "Pending",
  needs_info: "Needs info",
  incomplete: "Incomplete",
  rejected: "Rejected",
  approved: "Approved",
};

export const VERIFICATION_TONES = {
  pending: "orange",
  needs_info: "yellow",
  incomplete: "gray",
  rejected: "red",
  approved: "green",
};
