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
    bio: p.bio || "",
    avatar_url: p.avatar_url || "",
    emailVerified: !!p.email_verified,
    // linkedin_verified mirrors verification_status = 'approved': it is the
    // Verified badge, whether the member was approved via LinkedIn or not.
    linkedin_verified: !!p.linkedin_verified,
    verificationStatus: p.verification_status || "incomplete",
    verificationMessage: p.verification_message || "",
    // Private (owner and admins only), used to prefill "Update details".
    verificationNote: p.verification_note || "",
    voucher: p.voucher || "",
    marketingConsent: !!p.marketing_consent,
    status: p.status || "active",
    createdAt: p.created_at || null,
    isNRI: countryCode ? countryCode !== "IN" : yearsAbroad !== "Not lived abroad",
  };
}

export const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "there";

// ---------------------------------------------------------------------------
// Countries
// ---------------------------------------------------------------------------

// ISO 3166-1 alpha-2 codes for places people live (uninhabited territories
// left out). India is handled separately: members in India don't pick one.
const COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO " +
  "FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IO IQ IR IS IT JE JM JO " +
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
// [{ code, name }] sorted by name, India excluded.
export function getCountryOptions() {
  if (!countryOptions) {
    countryOptions = COUNTRY_CODES
      .map((code) => ({ code, name: countryName(code) }))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
  }
  return countryOptions;
}

// The region of the browser language ("de-DE" -> "DE"), if it's one of ours.
export function guessCountryFromBrowser() {
  try {
    const m = /[-_]([A-Za-z]{2})$/.exec(navigator.language || "");
    const code = m ? m[1].toUpperCase() : "";
    return code && code !== "IN" && COUNTRY_CODES.includes(code) ? code : "";
  } catch {
    return "";
  }
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
// LinkedIn
// ---------------------------------------------------------------------------

// Same rule as private.normalize_linkedin() in the database: a personal
// profile link, with or without https://, www., a country subdomain, a
// trailing slash or a query string.
const LINKEDIN_PROFILE = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/in\/([a-z0-9%_.-]{3,100})\/?(?:[?#].*)?$/i;

export const isLinkedinProfile = (value) => LINKEDIN_PROFILE.test((value || "").trim());

// A sentence for the member, or null when the link is a valid profile link.
export function linkedinProblem(value) {
  const v = (value || "").trim();
  if (!v) return "Add your LinkedIn profile link, or choose “I don't have LinkedIn” below.";
  if (LINKEDIN_PROFILE.test(v)) return null;
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
