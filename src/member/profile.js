// Shared helpers for the member side: the camelCase user object the app
// passes around, country names, LinkedIn link checks and readable errors.

// The one place that turns a database profile (api.getMyProfile(): the
// profiles row merged with the member's profile_private row) into the user
// object the screens use.
export function mapProfile(p) {
  if (!p) return null;
  const countryCode = p.country_code || "";
  const yearsAbroad = p.years_abroad || "";
  return {
    id: p.id,
    name: p.name || "",
    email: p.email || "",
    location: p.location || "",
    city: p.city || "",
    countryCode,
    hometown: p.hometown || "",
    profession: p.profession || "",
    occupationStatus: p.occupation_status || "",
    yearsAbroad,
    linkedinUrl: p.linkedin_url || "",
    // Since the 2026-10-20 database update other members see the LinkedIn
    // link only if the member chooses so (Edit profile); before it, always.
    hasLinkedinChoice: Object.prototype.hasOwnProperty.call(p, "linkedin_public"),
    bio: p.bio || "",
    avatar_url: p.avatar_url || "",
    emailVerified: !!p.email_verified,
    // linkedin_verified mirrors verification_status = 'approved': it is the
    // Verified badge, whether the member was approved via LinkedIn or not.
    linkedin_verified: !!p.linkedin_verified,
    ambassadorCity: p.ambassador_city || "",
    askMeAbout: p.ask_me_about || "",
    mentorOpen: !!p.mentor_open,
    mentorAreas: p.mentor_areas || "",
    menteeOpen: !!p.mentee_open,
    menteeNeeds: p.mentee_needs || "",
    // Until the 2026-10-18 database update, profiles have no mentoring.
    hasMentoring: Object.prototype.hasOwnProperty.call(p, "mentor_open"),
    // Until the 2026-10-17 database update, profiles have no topics.
    hasTopics: Object.prototype.hasOwnProperty.call(p, "ask_me_about"),
    verificationStatus: p.verification_status || "incomplete",
    verificationMessage: p.verification_message || "",
    // Private (owner and admins only), used to prefill "Update details".
    verificationNote: p.verification_note || "",
    voucher: p.voucher || "",
    // "18 or older" and Terms acceptance, and which version of the Terms was
    // accepted. Accounts without them, or with another version than the
    // database's current one (api.getCurrentTermsVersion), confirm them in
    // Get verified or on the Terms screen (TermsGate) before the dashboard.
    ageConfirmedAt: p.age_confirmed_at || null,
    termsAcceptedAt: p.terms_accepted_at || null,
    termsVersion: p.terms_version || "",
    // When the member gave the separate consent to processing what can show
    // their origin, religion or health (Art. 9 GDPR). Until the 2026-10-19
    // database update there's no such field (hasArt9Consent false), and
    // nobody is asked for it yet.
    art9ConsentAt: p.art9_consent_at || null,
    hasArt9Consent: Object.prototype.hasOwnProperty.call(p, "art9_consent_at"),
    // "held" (set by the server) while an admin checks the member before
    // they can take part; "" otherwise. It says nothing about why, and the
    // screens say no more than that either.
    reviewFlag: p.review_flag || "",
    status: p.status || "active",
    createdAt: p.created_at || null,
    isNRI: countryCode ? countryCode !== "IN" : yearsAbroad !== "Not lived abroad",
  };
}

export const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "there";

// What the member still has to accept before they can take part:
// { terms: "18 or older" and the current version of the Terms
// (currentVersion, from api.getCurrentTermsVersion; unknown counts as
// accepted, the database checks anyway), art9: the Art. 9 consent, once the
// database records it }.
export function stillToAccept(user, currentVersion) {
  return {
    terms: !user.ageConfirmedAt || !user.termsAcceptedAt || (!!currentVersion && user.termsVersion !== currentVersion),
    art9: !!user.hasArt9Consent && !user.art9ConsentAt,
  };
}

// Members waiting for review (pending, or asked for more information): until
// an admin approves them they see only their own profile, the groups and the
// guides (the database shows them nothing else).
export const isWaitingForReview = (user) =>
  user?.status !== "blocked" && (user?.verificationStatus === "pending" || user?.verificationStatus === "needs_info");

// ---------------------------------------------------------------------------
// Countries
// ---------------------------------------------------------------------------

// ISO 3166-1 alpha-2 codes for places people live (uninhabited territories
// left out).
const COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO " +
  "FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO " +
  "JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP " +
  "MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW " +
  "PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM " +
  "TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

let regionNames = null;
try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch {}

export function countryName(code) {
  if (!code) return "";
  try { return regionNames?.of(code) || code; } catch { return code; }
}

let countryOptions = null;
// [{ code, name }] sorted by name.
export function getCountryOptions() {
  if (!countryOptions) {
    countryOptions = COUNTRY_CODES
      .map((code) => ({ code, name: countryName(code) }))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
  }
  return countryOptions;
}

export const MAJOR_INDIAN_CITIES = [
  "Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Chennai", "Pune", "Kolkata", "Ahmedabad",
  "Gurugram", "Noida", "Kochi", "Jaipur", "Chandigarh", "Indore", "Lucknow",
];

// "Indians in Berlin" -> "Berlin"
export function cityFromGroupName(name) {
  const m = /^Indians in (.+)$/i.exec((name || "").trim());
  return m ? m[1].trim() : "";
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

// Same rule as private.is_reserved_name() in the database (since the
// 2026-10-20 update): names that sound like the NRIClub team, "NRIClub" (also
// "N.R.I. Club") or the words admin, support, moderator, team, official,
// staff... on their own, also in look-alike letters. The database turns such
// a name at signup into an empty one, so the signup form says so first.
export const RESERVED_NAME_MESSAGE = "Please use your own name. Names like NRIClub, Admin, Support or Team are kept for the NRIClub team.";
export function isReservedName(name) {
  const n = String(name || "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\u061C\uFEFF\u00AD\u034F\u115F\u1160\u17B4\u17B5\u180E\u3164\uFFA0]/g, "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return /(^|[^\p{L}])n[^\p{L}]*r[^\p{L}]*i[^\p{L}]*c[^\p{L}]*l[^\p{L}]*u[^\p{L}]*b/iu.test(n)
    || /(^|[^\p{L}\p{N}_])(admins?|administrators?|support|moderators?|moderation|team|official|staff|helpdesk)(?![\p{L}\p{N}_])/iu.test(n);
}

// ---------------------------------------------------------------------------
// LinkedIn
// ---------------------------------------------------------------------------

// Same rule as private.normalize_linkedin() in the database: a personal
// profile link, with or without https://, www., a country subdomain, a
// trailing slash or a query string. The name can't hold an escape of a
// control character, a space, / ? # or % itself, nor a % that doesn't start
// an escape (LINKEDIN_BAD_ESCAPE).
const LINKEDIN_PROFILE = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/in\/([a-z0-9%_.-]{3,100})\/?(?:[?#].*)?$/i;
const LINKEDIN_BAD_ESCAPE = /%(?![0-9a-f]{2})|%(?:[01][0-9a-f]|2[035f]|3f|7f)/i;
const matchesLinkedinProfile = (v) => {
  const m = LINKEDIN_PROFILE.exec(v);
  return !!m && !LINKEDIN_BAD_ESCAPE.test(m[1]);
};

export const isLinkedinProfile = (value) => matchesLinkedinProfile((value || "").trim());

// A sentence for the member, or null when the link is a valid profile link.
export function linkedinProblem(value) {
  const v = (value || "").trim();
  if (!v) return "Add your LinkedIn profile link, or choose “I don't have LinkedIn” below.";
  if (matchesLinkedinProfile(v)) return null;
  if (/lnkd\.in/i.test(v)) {
    return "Short lnkd.in links don't work. Open your profile on LinkedIn and copy the full link (linkedin.com/in/…).";
  }
  if (/linkedin\.[a-z.]+\/(company|school|showcase|groups?|pages)\b/i.test(v)) {
    return "That's a company or school page. Use your personal profile link (linkedin.com/in/your-name).";
  }
  if (/linkedin\./i.test(v)) {
    return "That doesn't look like a LinkedIn profile link. It should look like linkedin.com/in/your-name.";
  }
  return "Please use your LinkedIn profile link (linkedin.com/in/your-name), not another website.";
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export function isNetworkError(err) {
  return err instanceof TypeError || /failed to fetch|networkerror|load failed|network request failed/i.test(err?.message || "");
}

export const NETWORK_MESSAGE = "We couldn't reach NRIClub. Check your connection and try again.";

// Our RPCs raise P0001 errors whose "message" is written for the member;
// supabaseApi throws the raw PostgREST JSON as the error message.
export function apiErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  if (isNetworkError(err)) return NETWORK_MESSAGE;
  // Written for members by the site itself (e.g. "This photo couldn't be read.").
  if (err?.userMessage) return err.userMessage;
  try {
    const body = JSON.parse(err?.message || "");
    if (body && body.code === "P0001" && body.message) return body.message;
  } catch {}
  return fallback;
}

// Auth errors from Supabase (signup, login, codes) in plain words.
export function authErrorMessage(err) {
  const raw = err?.message || "";
  const msg = raw.toLowerCase();
  if (isNetworkError(err)) return NETWORK_MESSAGE;
  const wait = /after (\d+) seconds?/i.exec(raw);
  if (wait) return `For security, please wait ${wait[1]} seconds and try again.`;
  if (msg.includes("rate limit") || msg.includes("too many")) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  // Supabase refuses a "new" password that is the current one ("New password
  // should be different from the old password.", same_password); checked
  // before the general password rule below, which it would also match.
  if (msg.includes("same_password") || msg.includes("different from the old password")) {
    return "That's already your password. Choose a different one.";
  }
  if (msg.includes("weak") || msg.includes("pwned") || msg.includes("easy to guess")) {
    return "That password is too easy to guess. Please choose a different one.";
  }
  if (msg.includes("password should") || msg.includes("password must")) {
    return "Please choose a password with at least 8 characters.";
  }
  if (msg.includes("signups not allowed") || msg.includes("signup is disabled")) {
    return "New signups are paused right now. Please try again later.";
  }
  if (msg.includes("validate email") || msg.includes("invalid format") || (msg.includes("email address") && msg.includes("invalid"))) {
    return "That email address doesn't look right. Please check it.";
  }
  return null;
}

// Supabase answers a signup for an email that already has an account with a
// user that has no identities (it doesn't say "exists", so it can't be used
// to find accounts). The response is the user itself when no session is
// returned, or { user } otherwise.
export function isExistingAccountResponse(result) {
  const u = result?.user ?? result;
  return !!u && Array.isArray(u.identities) && u.identities.length === 0;
}

export function isExistingAccountError(err) {
  const msg = (err?.message || "").toLowerCase();
  return msg.includes("already") || msg.includes("exists") || msg.includes("registered");
}
