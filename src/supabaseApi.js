// ============================================================================
// supabaseApi.js - Complete Supabase API layer for NRIclub
// ============================================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const TOKEN_KEY = "nriclub_token";
const REFRESH_KEY = "nriclub_refresh";

let accessToken = null;
let currentUser = null;
// Goes up whenever this tab's session changes hands (sign-in, sign-out, or
// the session ending by itself). A token refresh that finishes under a newer
// generation keeps nothing, so signing out during a refresh sticks.
let sessionGeneration = 0;
// A session this tab keeps in memory only (verifyOtp with persist: false,
// while signup finishes setting the account up): { refreshToken }. Requests
// use it, but a reload or another tab never sees it until adoptSession()
// saves it. null when this tab's session, if any, is the stored one.
let memorySession = null;

// Builds from before the NRIclub rename kept the session under indin_* keys,
// and an old signup fallback cached the plain password in indin_profile_cache.
// Move the cookie choice over, sign the old session out and drop the rest.
// Runs at import so it happens before anything reads storage.
(function clearLegacyStorage() {
  try {
    const legacyToken = localStorage.getItem("indin_token");
    const consent = localStorage.getItem("indin_cookie_consent");
    if (consent && !localStorage.getItem("nriclub_cookie_consent")) {
      localStorage.setItem("nriclub_cookie_consent", consent);
    }
    ["indin_token", "indin_refresh", "indin_profile_cache", "indin_admin", "indin_cookie_consent"]
      .forEach((key) => localStorage.removeItem(key));
    if (legacyToken) {
      fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${legacyToken}` },
      }).catch(() => {});
    }
  } catch {}
})();

// The app registers this to leave the signed-in screens when the session ends
// on its own (revoked or expired, or another tab signed in as someone else).
let sessionEndedHandler = null;
export function onSessionEnded(handler) { sessionEndedHandler = handler; }

function endSession({ clearStorage }) {
  const hadUser = !!currentUser;
  sessionGeneration += 1;
  accessToken = null;
  currentUser = null;
  memorySession = null;
  if (clearStorage) clearStoredSession();
  if (hadUser && sessionEndedHandler) sessionEndedHandler();
}

function clearStoredSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {}
}

// A new session for this tab (and every other tab: storage is shared). A
// reset link that was left unfinished is dropped, so updatePassword can't
// reach that account any more. persist: false keeps it in this tab's memory
// only (see memorySession).
function saveSession(data, { persist = true } = {}) {
  if (recovery) cancelRecovery();
  sessionGeneration += 1;
  accessToken = data.access_token;
  currentUser = data.user;
  if (!persist) {
    memorySession = { refreshToken: data.refresh_token || null };
    return;
  }
  memorySession = null;
  localStorage.setItem(TOKEN_KEY, data.access_token);
  if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
  else localStorage.removeItem(REFRESH_KEY);
}

function storedToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

// Whether this browser keeps a session (it may have expired: getSession()
// checks). Without one, the app can show the landing page straight away.
// index.html's start-up script reads the same key (see vite.config.js).
export function hasStoredSession() { return !!storedToken(); }

function storedRefreshToken() {
  try { return localStorage.getItem(REFRESH_KEY); } catch { return null; }
}

// The claims inside an access token (a JWT), or {}.
function tokenClaims(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)) || {};
  } catch {
    return {};
  }
}

// The user id inside an access token, or null.
function tokenUserId(token) {
  return tokenClaims(token).sub || null;
}

// The Supabase Auth session an access token belongs to (it stays the same
// across refreshes), or null.
function tokenSessionId(token) {
  return tokenClaims(token).session_id || null;
}

// Ends a session on the server (this browser only). keepalive lets it finish
// even if the page reloads or closes straight after.
function logoutOnServer(token) {
  if (!token) return;
  fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
    method: "POST",
    keepalive: true,
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

// Another tab signed out, or signed in as someone else: this tab's session is
// over too. The same member's refreshed token is simply picked up. A session
// kept in memory was never in storage, so other tabs can't end it.
try {
  window.addEventListener("storage", (e) => {
    if (e.storageArea !== localStorage || (e.key !== null && e.key !== TOKEN_KEY)) return;
    if (!currentUser || memorySession) return;
    const token = storedToken();
    if (token && tokenUserId(token) === currentUser.id) {
      accessToken = token;
      return;
    }
    endSession({ clearStorage: false });
  });
} catch {}

function headers(extra = {}) {
  const h = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
    ...extra,
  };
  return h;
}

// Returns the response if it succeeded; throws with the error body otherwise.
async function restRequest(method, path, body = null, extraHeaders = {}) {
  const send = () => fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: headers(extraHeaders),
    body: body ? JSON.stringify(body) : undefined,
  });
  let res = await send();
  // Access tokens expire after an hour; refresh once and retry.
  if (res.status === 401 && accessToken && await refreshSession()) {
    res = await send();
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Request failed (${res.status})`);
  }
  return res;
}

async function restCall(method, path, body = null, extraHeaders = {}) {
  const res = await restRequest(method, path, body, extraHeaders);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// The total a request sent with "Prefer: count=exact" matched, from the
// Content-Range header ("0-999/1108"), or null if the server didn't say.
function totalFrom(res) {
  const m = /\/(\d+)$/.exec(res.headers.get("Content-Range") || "");
  return m ? Number(m[1]) : null;
}

// ============================================================================
// AUTH
// ============================================================================

export async function signUp(email, password, metadata = {}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password, data: metadata }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Signup failed");
  // Supabase answers an address that already has an account with a user
  // that has no identities instead of an error (the user object is
  // top-level when email confirmation is on). That answer is returned as it
  // is: the signup page then shows the same next step as for a new address
  // (profile.js, isExistingAccountResponse), so it never says who is a member.
  return data;
}

// persist: false keeps the session in this tab's memory only, as for
// verifyOtp.
export async function signIn(email, password, { persist = true } = {}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Login failed");
  saveSession(data, { persist });
  return data;
}

// Signs out this browser only; other devices stay signed in. The tab is
// signed out at once; the server is told in the background, so callers never
// wait on the network. A session kept in memory was never stored, so storage
// (and a session other tabs may keep there) is left alone.
export async function signOut() {
  const inMemoryOnly = !!memorySession;
  const token = accessToken || (inMemoryOnly ? null : storedToken());
  const refreshing = refreshInFlight;
  sessionGeneration += 1;
  accessToken = null;
  currentUser = null;
  memorySession = null;
  if (!inMemoryOnly) clearStoredSession();
  unsubscribeFromMessages();
  endServerSession(token, refreshing);
}

// Signs out every device and browser this member is signed in on, this one
// included (Settings → Account): Supabase Auth ends all their sessions, so
// no device can renew its sign-in (an access token another device already
// has still reads the database until it expires, within the hour; a reload
// there signs out at once). Throws if that can't be confirmed (e.g.
// no connection); then nothing is signed out here either, so the member can
// try again.
export async function signOutEverywhere() {
  const send = () => fetch(`${SUPABASE_URL}/auth/v1/logout?scope=global`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!accessToken) throw new Error("Not logged in");
  let res = await send();
  if ((res.status === 401 || res.status === 403) && await refreshSession()) res = await send();
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.msg || data.message || `Couldn't sign out everywhere (${res.status}).`);
  }
  await signOut();
}

// Saves the session verifyOtp (or signIn) kept in memory with persist: false,
// once signup has finished setting the account up: from now on it lasts
// across reloads and other tabs share it. Rejects if that session has ended
// in the meantime.
export async function adoptSession() {
  if (!memorySession) {
    if (currentUser && accessToken) return true; // already saved
    throw new Error("Your session has ended. Please log in.");
  }
  localStorage.setItem(TOKEN_KEY, accessToken);
  if (memorySession.refreshToken) localStorage.setItem(REFRESH_KEY, memorySession.refreshToken);
  else localStorage.removeItem(REFRESH_KEY);
  memorySession = null;
  return true;
}

// Drops a session kept in memory (persist: false) that signup couldn't
// finish: it's signed out on the server (in the background) and forgotten,
// so nothing half-done stays signed in. It was never stored, so a reload
// starts signed out. A session that was already saved is signed out as usual.
export async function discardSession() {
  if (!memorySession && !accessToken) return;
  return signOut();
}

async function endServerSession(token, refreshing) {
  logoutOnServer(token);
  // A refresh still running renews the session with a newer token (the old
  // one has usually just expired): sign that one out too once it arrives.
  const result = refreshing && await refreshing.catch(() => null);
  const renewed = result?.tokens?.access_token;
  if (renewed && renewed !== token) logoutOnServer(renewed);
}

// Which address this browser last asked a reset link for, and when:
// { email, at }. Only then may the login form be filled in with the address
// a reset link was for; a link someone else made must not fill in theirs.
// Kept for 24 hours at most (removed as the site loads after that), and
// removed once the new password is set (forgetResetRequest).
const RESET_REQUEST_KEY = "nriclub_reset_requested";
const RESET_REQUEST_MS = 24 * 60 * 60 * 1000;

(function dropOldResetRequest() {
  try {
    const raw = localStorage.getItem(RESET_REQUEST_KEY);
    if (raw === null) return;
    const age = Date.now() - Number(JSON.parse(raw)?.at);
    if (!(age >= 0 && age < RESET_REQUEST_MS)) localStorage.removeItem(RESET_REQUEST_KEY);
  } catch {
    try { localStorage.removeItem(RESET_REQUEST_KEY); } catch {}
  }
})();

export function forgetResetRequest() {
  try { localStorage.removeItem(RESET_REQUEST_KEY); } catch {}
}

export async function resetPassword(email) {
  const redirectTo = encodeURIComponent(window.location.origin + window.location.pathname);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${redirectTo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.msg || "Failed to send reset email");
  }
  try {
    localStorage.setItem(RESET_REQUEST_KEY, JSON.stringify({ email: String(email).trim().toLowerCase(), at: Date.now() }));
  } catch {}
  return true;
}

// True if this browser asked for a reset link for email (any case) in the
// last 24 hours.
export function resetWasRequestedFor(email) {
  try {
    const asked = JSON.parse(localStorage.getItem(RESET_REQUEST_KEY) || "null");
    const age = Date.now() - Number(asked?.at);
    return !!email && typeof asked?.email === "string" && asked.email === String(email).trim().toLowerCase()
      && age >= 0 && age < RESET_REQUEST_MS;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------
// Links from auth emails
// ----------------------------------------------------------------------------

// Supabase sends people back to the site with auth data in the URL: a session
// in the hash (#access_token=...&type=recovery for a password reset, or
// type=signup, magiclink...), an error (#error=access_denied&error_code=
// otp_expired&error_description=..., in the hash or the query), or a ?code=.
// None of it may stay in the address bar, the history or a copied link.
const AUTH_HASH_KEYS = ["access_token", "refresh_token", "expires_at", "expires_in", "token_type", "type",
  "provider_token", "provider_refresh_token", "error", "error_code", "error_description", "message"];
const AUTH_QUERY_KEYS = ["code", "token_hash", "error", "error_code", "error_description"];

let authRedirect = null;
// The password-reset link's session. It lives only here, in memory: it never
// goes to storage and never replaces the session this browser already has,
// so a crafted reset link can't sign anyone in to someone else's account.
let recovery = null; // { accessToken, refreshToken }

// What the page was opened with, read once (at startup, below) and the same
// answer every time after. App.jsx calls this first, before the admin route:
//   { kind: "recovery" }  a password-reset link: show the reset page, which
//                         uses getRecoveryUser, updatePassword and cancelRecovery.
//   { kind: "expired" }   an auth link that has expired, was already used or
//                         is invalid: say so and offer a new one.
//   { kind: "other" }     any other auth link (e.g. a signup confirmation);
//                         nothing was signed in.
//   { kind: null }        no auth data in the URL.
export function takeAuthRedirect() {
  if (!authRedirect) authRedirect = readAuthRedirect();
  return authRedirect;
}

function readAuthRedirect() {
  let hash, query;
  try {
    hash = new URLSearchParams(window.location.hash.slice(1));
    query = new URLSearchParams(window.location.search);
  } catch {
    return { kind: null };
  }
  const hashIsAuth = AUTH_HASH_KEYS.some((k) => hash.has(k));
  const queryKeys = AUTH_QUERY_KEYS.filter((k) => query.has(k));
  if (!hashIsAuth && !queryKeys.length) return { kind: null };

  const value = (k) => (hashIsAuth && hash.get(k)) || query.get(k) || "";
  let kind = "other";
  if (value("error") || value("error_code") || value("error_description")) {
    kind = "expired";
  } else if (hashIsAuth && hash.get("type") === "recovery") {
    if (hash.get("access_token")) {
      recovery = { accessToken: hash.get("access_token"), refreshToken: hash.get("refresh_token") || null };
      kind = "recovery";
    } else {
      kind = "expired";
    }
  }

  // Remove the auth data and keep everything else (e.g. #admin, ?utm_...).
  queryKeys.forEach((k) => query.delete(k));
  if (queryKeys.length) query.delete("type");
  const search = query.toString();
  try {
    window.history.replaceState(null, "", window.location.pathname + (search ? `?${search}` : "") + (hashIsAuth ? "" : window.location.hash));
  } catch {}
  return { kind };
}

// Clean the URL as soon as the site loads.
try { takeAuthRedirect(); } catch {}

// Older name, kept for existing callers: true when the page was opened from a
// password-reset link. Prefer takeAuthRedirect(), which also reports expired
// links.
export function takeRecoverySession() {
  return takeAuthRedirect().kind === "recovery" && !!recovery;
}

const EXPIRED_LINK_MESSAGE = "This link has expired or has already been used. Please request a new one.";

// err.expired tells the reset page to show the "request a new link" state.
function expiredLinkError() {
  const err = new Error(EXPIRED_LINK_MESSAGE);
  err.expired = true;
  return err;
}

// The access token was refused as expired or invalid: 401, or (as Supabase
// Auth answers an expired token) 403 with error_code "bad_jwt". Not when
// the session is fine but wasn't signed in with the 6-digit code
// (insufficient_aal, e.g. a new password for an account with two-step login).
function isRefusedToken(res, data) {
  if (data.error_code === "insufficient_aal") return false;
  return res.status === 401 || data.error_code === "bad_jwt" || /\bbad_jwt\b|invalid jwt/i.test(data.msg || data.message || "");
}

// An Auth API error for the caller: Supabase Auth's message, and its
// error_code as err.code (e.g. "insufficient_aal").
function authError(data, fallback) {
  const err = new Error(data.msg || data.error_description || data.message || fallback);
  err.code = data.error_code || "";
  return err;
}

// An Auth API call made with the reset link's session. Renews that session
// (in memory) if the page was left open past the hour; the link has expired
// only if its token is still refused after that. signal can cut the call
// short (updatePassword's time limit).
async function recoveryRequest(method, path, body = null, fallback = "Something went wrong. Please try again.", signal = undefined) {
  if (!recovery) throw expiredLinkError();
  const send = async () => {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${recovery.accessToken}` },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    return { res, data: await res.json().catch(() => ({})) };
  };
  let { res, data } = await send();
  if (isRefusedToken(res, data) && await renewRecovery(signal)) ({ res, data } = await send());
  if (isRefusedToken(res, data) || ["session_not_found", "user_not_found"].includes(data.error_code)) {
    recovery = null;
    throw expiredLinkError();
  }
  if (!res.ok) throw authError(data, fallback);
  return data;
}

// Swaps the link's refresh token for a new session, in memory. false when
// the refresh token no longer works (the link has expired); a network error
// or a timeout is thrown instead, so it isn't mistaken for an expired link.
async function renewRecovery(signal) {
  const current = recovery;
  if (!current?.refreshToken) return false;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: current.refreshToken }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token || recovery !== current) return false;
  current.accessToken = data.access_token;
  current.refreshToken = data.refresh_token || null;
  return true;
}

// Who the reset link is for, so the page can say which account gets the new
// password. signedInAsSomeoneElse: this browser is signed in to a different
// account (that session is left alone). Throws an expired-link error
// (err.expired) when the link no longer works.
export async function getRecoveryUser() {
  const user = await recoveryRequest("GET", "/auth/v1/user");
  const signedInId = tokenUserId(storedToken());
  return { email: user.email || "", signedInAsSomeoneElse: !!signedInId && signedInId !== user.id };
}

// Leaves the reset page without changing anything: forget the link's session
// and end it on the server.
export function cancelRecovery() {
  if (!recovery) return;
  const token = recovery.accessToken;
  recovery = null;
  logoutOnServer(token);
}

// For an account with two-step login (admins), Supabase Auth sets a new
// password only from a session confirmed with the 6-digit code:
// updatePassword then fails with err.code "insufficient_aal". This confirms
// the reset link's session with a code from the authenticator app; then
// updatePassword works. Throws with a message for the member when the code
// is wrong or too old.
export async function confirmRecoveryCode(code) {
  const user = await recoveryRequest("GET", "/auth/v1/user");
  const factor = (user.factors || []).find((f) => f.factor_type === "totp" && f.status === "verified");
  if (!factor) throw new Error("This account has no authenticator app set up. Please try again.");
  const id = encodeURIComponent(factor.id);
  try {
    const challenge = await recoveryRequest("POST", `/auth/v1/factors/${id}/challenge`, {});
    const data = await recoveryRequest("POST", `/auth/v1/factors/${id}/verify`, { challenge_id: challenge.id, code: String(code || "").replace(/\s+/g, "") });
    if (!data.access_token || !recovery) throw new Error("Couldn't confirm the code. Please try again.");
    recovery.accessToken = data.access_token;
    if (data.refresh_token) recovery.refreshToken = data.refresh_token;
  } catch (err) {
    throw wrongCodeError(err);
  }
}

// A password change that gets no answer fails after this long, so a hung
// request goes down the caller's "try again" path instead of waiting forever.
const PASSWORD_TIMEOUT_MS = 15000;

// After a reset link: sets the new password for the link's account, then ends
// the link's session and returns { email } so the member can sign in with the
// new password (fill the login form in with it only if
// resetWasRequestedFor(email): someone else may have made the link, for their
// own account). Otherwise: changes the signed-in member's password (the
// session may be one kept in memory, during signup). Either way it throws if
// there's no answer within 15 seconds; the change may still have gone
// through, so trying again is safe (Supabase then says it's the same password).
export async function updatePassword(password) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PASSWORD_TIMEOUT_MS);
  try {
    if (recovery) {
      const user = await recoveryRequest("PUT", "/auth/v1/user", { password }, "Couldn't update your password.", controller.signal);
      cancelRecovery();
      return { email: user.email || "" };
    }
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ password }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw authError(data, "Couldn't update your password.");
    if (data.id && data.id === currentUser?.id) currentUser = data;
    return data;
  } catch (err) {
    // Worded so the site's network-error check (profile.js) recognises it.
    if (controller.signal.aborted) throw new Error("Network request failed: no answer after 15 seconds.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Emails a 6-digit code to an existing account (used to confirm an email
// address); never creates an account.
export async function sendOtp(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, create_user: false }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.msg || data.error_description || data.message || "Failed to send OTP");
  }
}

// persist: false keeps the new session in this tab's memory only: requests
// use it, but a reload or another tab never sees it. Signup uses this to
// finish setting the account up first, then calls adoptSession() to save it,
// or discardSession() if that fails.
export async function verifyOtp(email, token, { persist = true } = {}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, token, type: "email" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || "Invalid OTP");
  if (data.access_token) saveSession(data, { persist });
  return data;
}

// Concurrent callers share one refresh request; refresh tokens are single-use.
// It resolves to { session, tokens }: session is what this tab now uses (or
// null), tokens are the new tokens even when they were thrown away, which
// signOut needs to end that session on the server.
let refreshInFlight = null;

export async function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = doRefreshSession().finally(() => { refreshInFlight = null; });
  }
  return (await refreshInFlight).session;
}

async function doRefreshSession() {
  const generation = sessionGeneration;
  // A session kept in memory refreshes there; a stored one is every tab's.
  const inMemory = memorySession;
  const refresh = inMemory ? inMemory.refreshToken : storedRefreshToken();
  // Whose session this tab has (at startup only the token says).
  const ownerId = currentUser?.id || tokenUserId(accessToken);
  if (!refresh) {
    // Signed out in another tab (or storage was cleared): the session is over.
    endSession({ clearStorage: false });
    return { session: null, tokens: null };
  }
  let res, data;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    data = await res.json().catch(() => ({}));
  } catch {
    return { session: null, tokens: null }; // offline: keep the session and try again later
  }
  const tokens = res.ok && data.access_token ? data : null;
  // Signed out, or signed in again, while this was running: keep nothing.
  if (generation !== sessionGeneration) return { session: null, tokens };
  if (inMemory && memorySession === inMemory) {
    // Not saved yet (signup is still finishing): only this tab has it.
    if (!tokens) {
      if (res.status >= 400 && res.status < 500) endSession({ clearStorage: false });
      return { session: null, tokens: null };
    }
    inMemory.refreshToken = data.refresh_token || null;
    accessToken = data.access_token;
    currentUser = data.user;
    return { session: data, tokens };
  }
  // Storage no longer holds the refresh token this started with: another tab
  // signed out, signed in or refreshed first. Neither write nor clear it.
  if (storedRefreshToken() !== refresh) return keepStoredSession(tokens, ownerId);
  if (!tokens) {
    // Revoked, expired or already-used refresh token: the session is over.
    if (res.status >= 400 && res.status < 500) endSession({ clearStorage: true });
    return { session: null, tokens: null };
  }
  // Tokens are shared by every tab. Save the rotated ones, but if another tab
  // signed in as someone else, don't switch this tab to that account.
  localStorage.setItem(TOKEN_KEY, data.access_token);
  if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
  if (currentUser && data.user?.id !== currentUser.id) {
    endSession({ clearStorage: false });
    return { session: null, tokens };
  }
  accessToken = data.access_token;
  currentUser = data.user;
  return { session: data, tokens };
}

// After a refresh that another tab overtook (see above). Nothing from the
// refresh is kept. Its new session belongs to nobody, so it's ended on the
// server, unless the other tab refreshed the very same session first (both
// then hold it). This tab carries on with the stored session if it is the
// same member's, and ends otherwise.
function keepStoredSession(tokens, ownerId) {
  const stored = storedToken();
  const storedSession = tokenSessionId(stored);
  if (tokens && !(storedSession && storedSession === tokenSessionId(tokens.access_token))) {
    logoutOnServer(tokens.access_token);
  }
  if (stored && ownerId && tokenUserId(stored) === ownerId) {
    accessToken = stored;
    const user = currentUser || (tokens?.user?.id === ownerId ? tokens.user : null);
    if (!user) return { session: null, tokens: null }; // getSession checks the stored token itself
    currentUser = user;
    return { session: { access_token: stored, refresh_token: storedRefreshToken(), user }, tokens };
  }
  endSession({ clearStorage: false });
  return { session: null, tokens };
}

export async function getSession() {
  // A session kept in memory (signup finishing) is this tab's session.
  if (memorySession) return currentUser ? { user: currentUser, access_token: accessToken } : null;
  return checkStoredSession(true);
}

async function checkStoredSession(retry) {
  const token = storedToken();
  if (!token) return null;
  const generation = sessionGeneration;
  accessToken = token;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const user = await res.json();
      if (generation !== sessionGeneration) return null;
      currentUser = user;
      return { user, access_token: token };
    }
  } catch {}
  if (generation !== sessionGeneration) return null;
  const refreshed = await refreshSession();
  if (!refreshed && generation === sessionGeneration) {
    accessToken = null;
    currentUser = null;
    // Another tab renewed the same member's session meanwhile: use that one.
    const now = storedToken();
    if (retry && now && now !== token && tokenUserId(now) === tokenUserId(token)) return checkStoredSession(false);
  }
  return refreshed;
}

export function getCurrentUser() { return currentUser; }
export function getToken() { return accessToken; }

// ----------------------------------------------------------------------------
// Two-step login (Supabase Auth TOTP), for admins
// ----------------------------------------------------------------------------

// How this session was signed in, from its access token: "aal2" after the
// 6-digit code from an authenticator app, "aal1" with the password only.
export function sessionAal() {
  return tokenClaims(accessToken || "").aal || "aal1";
}

// An Auth API call as the signed-in member, renewing the session once if
// its token has expired. Throws with Supabase Auth's message; err.code is
// its error_code (e.g. "mfa_verification_failed").
async function authCall(method, path, body = null) {
  const send = () => fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method,
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!accessToken) throw new Error("Not logged in");
  let res = await send();
  let data = await res.json().catch(() => ({}));
  if (isRefusedToken(res, data) && await refreshSession()) {
    res = await send();
    data = await res.json().catch(() => ({}));
  }
  if (!res.ok) throw authError(data, `Request failed (${res.status})`);
  return data;
}

// A refused 6-digit code (wrong, or too old) as a message for the member;
// any other error as it is.
function wrongCodeError(err) {
  if (/^mfa_(verification_failed|challenge_expired)$/.test(err.code || "") || /invalid totp|totp code/i.test(err.message || "")) {
    const wrong = new Error("That code didn't work. Codes change every 30 seconds: type the one your app shows now, and check that your phone's clock is right.");
    wrong.code = err.code;
    return wrong;
  }
  return err;
}

// The member's authenticator-app (TOTP) factors: { verified, unverified },
// each a list of { id, friendly_name, created_at }.
export async function getTotpFactors() {
  const user = await authCall("GET", "/user");
  const totp = (user.factors || []).filter((f) => f.factor_type === "totp");
  return {
    verified: totp.filter((f) => f.status === "verified"),
    unverified: totp.filter((f) => f.status !== "verified"),
  };
}

// The QR code Supabase Auth sends with a new factor, as an image address the
// page can show in an <img> (the site's Content Security Policy allows data:
// images). Supabase sends either the SVG itself or an SVG data address,
// sometimes unencoded; both become an encoded SVG data address.
function qrImage(qr) {
  const text = String(qr || "").trim();
  if (!text) return "";
  if (/^data:image\/[a-z+]+;base64,/i.test(text)) return text;
  const svg = text.startsWith("data:") ? text.slice(text.indexOf(",") + 1) : text;
  let markup = svg;
  try { if (!svg.trimStart().startsWith("<")) markup = decodeURIComponent(svg); } catch {}
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

// Starts setting up two-step login: a new authenticator-app factor. Returns
// { id, qr, secret, uri }: show the QR code (or the secret, to type in),
// then confirm the first code with verifyTotp(id, code). Factors left
// unconfirmed by an earlier try are removed first.
export async function enrollTotp() {
  const { unverified } = await getTotpFactors();
  await Promise.all(unverified.map((f) => authCall("DELETE", `/factors/${encodeURIComponent(f.id)}`).catch(() => {})));
  const data = await authCall("POST", "/factors", { factor_type: "totp", friendly_name: "NRIClub admin", issuer: "NRIClub" });
  return { id: data.id, qr: qrImage(data.totp?.qr_code), secret: data.totp?.secret || "", uri: data.totp?.uri || "" };
}

// Signs this session in with a 6-digit code from the authenticator app
// (the factor's first code confirms a new factor). The session becomes a
// two-step one (aal2) and is kept as the session always is. Throws with a
// message for the member when the code is wrong or too old.
export async function verifyTotp(factorId, code) {
  const id = encodeURIComponent(factorId);
  try {
    const challenge = await authCall("POST", `/factors/${id}/challenge`, {});
    const data = await authCall("POST", `/factors/${id}/verify`, { challenge_id: challenge.id, code: String(code || "").replace(/\s+/g, "") });
    if (!data.access_token) throw new Error("Couldn't confirm the code. Please try again.");
    saveSession(data);
    return data;
  } catch (err) {
    throw wrongCodeError(err);
  }
}

// ============================================================================
// PROFILES
// ============================================================================

// The profile columns members read. Since the 2026-10-20 database update
// members may read every column of profiles but linkedin_url (a request for
// all columns, select=*, is refused), so they are named here: a column added
// to profiles goes here once the live database has it.
const PROFILE_FIELDS = "id,name,avatar_url,location,hometown,profession,occupation_status,years_abroad,city,country_code,"
  + "bio,email_verified,linkedin_verified,created_at,updated_at,ambassador_city,ask_me_about,mentor_open,mentor_areas,"
  + "mentee_open,mentee_needs";

// Since the 2026-10-23 database update members see only the profiles of
// members our team has approved and who aren't blocked. What an account
// that isn't shown (waiting for review, declined, blocked, unfinished)
// posted or wrote before stays, but comes without its profile: the site
// shows it as UNLISTED_NAME, with no photo and no profile to open
// (unlisted: true).
export const UNLISTED_NAME = "NRIClub member";
const unlistedPerson = (id) => ({ id: id || null, name: UNLISTED_NAME, avatar_url: "", unlisted: true });

// Rows with an embedded profile (key, e.g. "profiles"), whose foreign key is
// idKey: a profile the member can't see becomes the placeholder above.
function withPerson(rows, key = "profiles", idKey = "user_id") {
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => (r && r[key] == null && r[idKey] ? { ...r, [key]: unlistedPerson(r[idKey]) } : r));
}

// A database function the database doesn't have yet (or a column) was asked
// for at this time (Date.now()): the old way is used for a few minutes, then
// the new one is tried again, so the site switches over soon after the
// database update without a reload.
const ASK_AGAIN_MS = 5 * 60 * 1000;
const missingSince = {};
const knownMissing = (name) => Date.now() - (missingSince[name] || 0) < ASK_AGAIN_MS;

// LinkedIn links the signed-in member may see, by member id:
// { [id]: { linkedin_url, linkedin_public } }. The link was asked for so our
// team can check members, so since the 2026-10-20 database update a member
// sees their own, admins see every member's, and other members see only the
// links members chose to show (linkedin_public, in Edit profile). Before that
// update every link was readable and comes straight from profiles (and
// there's no linkedin_public, so the answer has none). If the links can't be
// loaded, they're left out, or with strict the error is thrown (for the
// member's own profile, which must not look as if it had no link).
export async function getProfileLinks(ids, { strict = false } = {}) {
  const list = [...new Set((ids || []).filter((id) => UUID.test(id || "")))];
  const byId = {};
  if (!list.length) return byId;
  const viaFunction = async () => {
    for (let i = 0; i < list.length; i += 1000) {
      const rows = await restCall("POST", "/rest/v1/rpc/profile_links", { p_ids: list.slice(i, i + 1000) });
      (rows || []).forEach((r) => { byId[r.id] = { linkedin_url: r.linkedin_url || "", linkedin_public: !!r.linkedin_public }; });
    }
  };
  const viaProfiles = async () => {
    for (let i = 0; i < list.length; i += 100) {
      const rows = await restCall("GET", `/rest/v1/profiles?id=in.(${list.slice(i, i + 100).join(",")})&select=id,linkedin_url`);
      (rows || []).forEach((r) => { byId[r.id] = { linkedin_url: r.linkedin_url || "" }; });
    }
  };
  try {
    if (!knownMissing("profile_links")) {
      try {
        await viaFunction();
      } catch (err) {
        if (!isMissingInDatabase(err)) throw err;
        missingSince.profile_links = Date.now();
        await viaProfiles();
      }
    } else {
      // The database had no profile_links a few minutes ago. If the update
      // has run since, profiles refuses linkedin_url: then the function.
      try {
        await viaProfiles();
      } catch {
        delete missingSince.profile_links;
        await viaFunction();
      }
    }
  } catch (err) {
    if (strict) throw err;
  }
  return byId;
}

// Adds linkedin_url (and, when the database has it, linkedin_public) to
// profile rows from getProfileLinks: "" for links the member can't see.
function withLinks(rows, links) {
  return (rows || []).map((r) => ({ ...r, linkedin_url: links[r.id]?.linkedin_url || "",
    ...(links[r.id] && "linkedin_public" in links[r.id] ? { linkedin_public: links[r.id].linkedin_public } : {}) }));
}

export async function getProfile(userId, { strict = false } = {}) {
  const [data, links] = await Promise.all([
    restCall("GET", `/rest/v1/profiles?id=eq.${userId}&select=${PROFILE_FIELDS}`),
    getProfileLinks([userId], { strict }),
  ]);
  return withLinks(data, links)[0] || null;
}

// When the member last opened NRIClub, for the admin overview. Since the
// 2026-10-20 database update it's kept with their private details (only they
// and admins see it, and the server's clock decides the time); before, it
// was a column of profiles, which every member could read.
function touchLastActive(userId) {
  const body = { last_active: new Date().toISOString() };
  // (If profiles has no last_active any more, the update has run meanwhile:
  // next time, profile_private.)
  const onProfiles = () => restCall("PATCH", `/rest/v1/profiles?id=eq.${userId}`, body).catch(() => { delete missingSince.private_last_active; });
  if (knownMissing("private_last_active")) { onProfiles(); return; }
  restCall("PATCH", `/rest/v1/profile_private?id=eq.${userId}`, body).catch((err) => {
    if (!isMissingInDatabase(err)) return;
    missingSince.private_last_active = Date.now();
    onProfiles();
  });
}

// Email, verification status, the Terms record and the Art. 9 consent live
// in profile_private, which only the owner and admins can read; the app
// still sees them as fields of the user's own profile. Of those, the member
// can't change anything there directly (the database keeps them).
const PRIVATE_PROFILE_FIELDS = ["email"];

// Throws if the private row can't be read: without it the member would look
// like a new, unverified, unblocked account. Callers keep what they have.
// The same if their LinkedIn link can't be read (it would look removed, and
// Get verified would send it as removed).
export async function getMyProfile() {
  if (!currentUser) return null;
  touchLastActive(currentUser.id);
  const [profile, privateRows] = await Promise.all([
    getProfile(currentUser.id, { strict: true }),
    restCall("GET", `/rest/v1/profile_private?id=eq.${currentUser.id}&select=*`),
  ]);
  if (!profile) return null;
  if (!privateRows?.[0]) throw new Error("Couldn't load your account details. Please try again.");
  const { id, created_at, updated_at, ...privateFields } = privateRows[0];
  return { ...profile, email: currentUser.email, ...privateFields };
}

// The fields that decide what the member may do, for the regular status
// check: one small read, and it doesn't count as activity (no last_active).
// Compare with what's shown and call getMyProfile only if something changed.
const MY_STATUS_FIELDS = "verification_status,status,review_flag,terms_version,age_confirmed_at,terms_accepted_at";

export async function refreshMyStatus() {
  if (!currentUser) return null;
  const rows = await restCall("GET", `/rest/v1/profile_private?id=eq.${currentUser.id}&select=${MY_STATUS_FIELDS}`);
  if (!rows?.[0]) throw new Error("Couldn't load your account details. Please try again.");
  return rows[0];
}

export async function updateProfile(updates) {
  if (!currentUser) throw new Error("Not logged in");
  const publicUpdates = {};
  const privateUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    (PRIVATE_PROFILE_FIELDS.includes(key) ? privateUpdates : publicUpdates)[key] = value;
  }
  // email is managed by Supabase Auth and email_verified mirrors it; neither is client-writable.
  delete privateUpdates.email;
  delete publicUpdates.email_verified;
  if (Object.keys(privateUpdates).length) {
    await restCall("PATCH", `/rest/v1/profile_private?id=eq.${currentUser.id}`, privateUpdates);
  }
  if (!Object.keys(publicUpdates).length) return [];
  return restCall("PATCH", `/rest/v1/profiles?id=eq.${currentUser.id}&select=${PROFILE_FIELDS}`, publicUpdates, { Prefer: "return=representation" });
}

// The member's city, country (ISO code) and the place their profile shows
// ("Berlin, Germany"), changed together, as Get verified sets them: urgent
// questions go to members by their city. Since the 2026-10-25 database
// update through public.update_my_city, which checks them; before it,
// straight into profiles. Returns { city, country_code, location }.
export async function updateMyCity(city, countryCode, location) {
  if (!currentUser) throw new Error("Not logged in");
  if (!knownMissing("update_my_city")) {
    try {
      return await restCall("POST", "/rest/v1/rpc/update_my_city", { p_city: city, p_country_code: countryCode, p_location: location });
    } catch (err) {
      if (!isMissingInDatabase(err)) throw err;
      missingSince.update_my_city = Date.now();
    }
  }
  await restCall("PATCH", `/rest/v1/profiles?id=eq.${currentUser.id}`, { city, country_code: countryCode, location });
  return { city, country_code: countryCode, location };
}

// Changes the member's sign-in email address. Supabase Auth emails a link
// to confirm it (with "Secure email change" on, to the old and the new
// address); the address changes once it's confirmed. Supabase refuses an
// address another account has; the page says the same either way, so it
// can't be used to find out who is a member.
export async function changeEmail(email) {
  if (!currentUser) throw new Error("Not logged in");
  const redirectTo = encodeURIComponent(window.location.origin + "/");
  try {
    await authCall("PUT", `/user?redirect_to=${redirectTo}`, { email });
  } catch (err) {
    if (err.code === "email_exists" || /already (been )?registered|already exists/i.test(err.message || "")) return;
    throw err;
  }
}

// ============================================================================
// MEMBER VERIFICATION
// ============================================================================

// Submit (or correct) verification details. Either linkedinUrl or a note of
// at least 20 characters is required; the server validates and normalises.
// acceptTerms records "18 or older" and the Terms (as acceptTerms below does)
// for accounts that never confirmed them at signup.
export async function submitVerification({ city, countryCode, location, linkedinUrl = "", note = "", voucher = "", profession = null, acceptTerms = false }) {
  return restCall("POST", "/rest/v1/rpc/submit_verification", {
    p_city: city, p_country_code: countryCode, p_location: location,
    p_linkedin_url: linkedinUrl, p_note: note, p_voucher: voucher, p_profession: profession,
    p_accept_terms: acceptTerms,
  });
}

// ----------------------------------------------------------------------------
// Invite links
// ----------------------------------------------------------------------------

// The signed-in member's invite code, for nriclub.app/?invite=<code> (made
// the first time they ask). null before the 2026-10-22 database update,
// which adds codes: then the link carries the member's ID, as before.
export async function getInviteCode() {
  try {
    const code = await restCall("POST", "/rest/v1/rpc/my_invite_code", {});
    return typeof code === "string" && code ? code : null;
  } catch (err) {
    if (isMissingInDatabase(err)) return null;
    throw err;
  }
}

// Who invited the signed-in member, from the code in their invite link:
// { id, first } (the inviter's member ID and first name), or null for an
// unknown code (or before the database update).
export async function resolveInvite(code) {
  try {
    const rows = await restCall("POST", "/rest/v1/rpc/resolve_invite", { p_code: code });
    const r = rows?.[0];
    return r?.member_id ? { id: r.member_id, first: r.first_name || "" } : null;
  } catch (err) {
    if (isMissingInDatabase(err)) return null;
    throw err;
  }
}

// Whether a request failed because the database doesn't have the function or
// column it asked for yet (the site goes live a little before the database
// update that adds them): PostgREST's "not found" codes, or Postgres's.
export function isMissingInDatabase(err) {
  try {
    const body = JSON.parse(err?.message || "");
    return ["PGRST202", "PGRST204", "42883", "42703"].includes(body?.code);
  } catch {
    return false;
  }
}

// The version of the Terms of Use members must have accepted, as the
// database says (public.current_terms_version). Remembered once known;
// refresh asks again if the last answer is more than a minute old. Until the
// 2026-10-19 database update that function doesn't exist and the version is
// "2026-10", so members are asked to accept the new Terms only once the
// database expects them to. Any other failure (e.g. no connection) throws,
// and the next call asks again.
const TERMS_VERSION_BEFORE_UPDATE = "2026-10";
let termsVersionRequest = null;
let termsVersionAskedAt = 0;
export function getCurrentTermsVersion({ refresh = false } = {}) {
  if (refresh && Date.now() - termsVersionAskedAt > 60000) termsVersionRequest = null;
  if (!termsVersionRequest) {
    termsVersionAskedAt = Date.now();
    termsVersionRequest = restCall("POST", "/rest/v1/rpc/current_terms_version", {})
      .then((version) => (typeof version === "string" && version ? version : TERMS_VERSION_BEFORE_UPDATE))
      .catch((err) => {
        if (isMissingInDatabase(err)) return TERMS_VERSION_BEFORE_UPDATE;
        termsVersionRequest = null;
        throw err;
      });
  }
  return termsVersionRequest;
}

// The version before the current one (public.previous_terms_version): it
// still applies to members who accepted it until they accept the current
// one (Terms section 14), so they can take part and may answer "Later".
// "" if there is none: before the travel board's database update, or if it
// can't be asked (then the Terms screen just has no "Later"). Remembered and
// refreshed like the current version.
let previousTermsRequest = null;
let previousTermsAskedAt = 0;
export function getPreviousTermsVersion({ refresh = false } = {}) {
  if (refresh && Date.now() - previousTermsAskedAt > 60000) previousTermsRequest = null;
  if (!previousTermsRequest) {
    previousTermsAskedAt = Date.now();
    previousTermsRequest = restCall("POST", "/rest/v1/rpc/previous_terms_version", {})
      .then((version) => (typeof version === "string" ? version : ""))
      .catch((err) => {
        if (!isMissingInDatabase(err)) previousTermsRequest = null;
        return "";
      });
  }
  return previousTermsRequest;
}

// Records "18 or older" and the Terms: at signup once the email code is
// confirmed, and for members who haven't accepted the current version.
// version must be the current one (getCurrentTermsVersion); returns it.
// art9: the member also ticked the separate consent to processing what can
// show their origin, religion or health; the database records it with its
// time and wording's version. Before the 2026-10-19 database update there's
// nowhere to record it, and only the Terms are recorded (the member is asked
// for the consent once the update is in).
export async function acceptTerms(version, art9 = false) {
  if (art9) {
    try {
      return await restCall("POST", "/rest/v1/rpc/accept_terms", { p_version: version, p_art9: true });
    } catch (err) {
      if (!isMissingInDatabase(err)) throw err;
    }
  }
  return restCall("POST", "/rest/v1/rpc/accept_terms", { p_version: version });
}

// Everything NRIClub stores about the signed-in member, as one object, for
// "Download my data".
export async function exportMyData() {
  return restCall("POST", "/rest/v1/rpc/export_my_data", {});
}

// Deletes the account: first the member's photo files (Storage keeps them
// apart from the database, and the session that may delete them ends with
// the account), then the auth user server-side; every row the user owns
// cascades with it. Files that couldn't be deleted (the request goes on to
// the account anyway) the clean-up in the admin panel deletes. Afterwards
// this browser forgets what it kept for the member (forgetMember). A second
// call while one runs (a double tap) waits for the first.
let accountDeletion = null;
export function deleteAccount() {
  if (!currentUser) return Promise.reject(new Error("Not logged in"));
  if (!accountDeletion) {
    const uid = currentUser.id;
    accountDeletion = (async () => {
      await deleteMyFiles();
      await restCall("POST", "/rest/v1/rpc/delete_my_account", {});
      forgetMember(uid);
      await signOut();
    })().finally(() => { accountDeletion = null; });
  }
  return accountDeletion;
}

// Removes what this browser keeps for one member: the items named
// nriclub_<what>_<member id> (welcome messages and tips already seen, the
// last catch-up; Privacy Policy, section 8).
export function forgetMember(uid) {
  if (!uid) return;
  try {
    const mine = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith("nriclub_") && key.endsWith(`_${uid}`)) mine.push(key);
    }
    mine.forEach((key) => localStorage.removeItem(key));
  } catch (e) {}
}

export async function searchProfiles(query = "", filters = {}) {
  let url = `/rest/v1/profiles?select=${PROFILE_FIELDS}&order=created_at.desc`;
  if (query) url += `&or=(name.ilike.%25${query}%25,profession.ilike.%25${query}%25)`;
  if (filters.city && filters.city !== "All") url += `&location=ilike.%25${filters.city}%25`;
  if (filters.hometown && filters.hometown !== "All") url += `&hometown=ilike.%25${filters.hometown}%25`;
  if (currentUser) url += `&id=neq.${currentUser.id}`;
  url += "&limit=200";
  return restCall("GET", url);
}

// ============================================================================
// POSTS
// ============================================================================

export async function getPosts(limit = 30, groupId = null) {
  let url = `/rest/v1/posts?select=*,profiles:user_id(id,name,avatar_url,profession,occupation_status,location,hometown)&order=created_at.desc&limit=${limit}`;
  if (groupId) url += `&group_id=eq.${groupId}`;
  return withPerson(await restCall("GET", url));
}

// One post with its author, or null: for a shared link (#post=<id>) to a
// post older than the ones the feed loads.
export async function getPost(postId) {
  const rows = withPerson(await restCall("GET", `/rest/v1/posts?id=eq.${encodeURIComponent(postId)}&select=*,profiles:user_id(id,name,avatar_url,profession,occupation_status,location,hometown)`));
  return rows?.[0] || null;
}

// A member's latest posts (with author), for their profile page.
export async function getUserPosts(userId, limit = 20) {
  return withPerson(await restCall("GET", `/rest/v1/posts?user_id=eq.${encodeURIComponent(userId)}&select=*,profiles:user_id(id,name,avatar_url,profession,occupation_status,location,hometown)&order=created_at.desc&limit=${limit}`));
}

// The groups a member belongs to (ids), for "Groups in common".
export async function getUserGroupIds(userId) {
  const data = await restCall("GET", `/rest/v1/group_members?user_id=eq.${encodeURIComponent(userId)}&select=group_id`);
  return (data || []).map(d => d.group_id);
}

export async function createPost(content, tags = [], imageUrl = null, groupId = null) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/posts", {
    user_id: currentUser.id,
    content,
    tags,
    image_url: imageUrl,
    group_id: groupId,
  }, { Prefer: "return=representation" });
}

// Deletes one of the member's own rows and then the photo files it used
// (image_url: one link, or a listing's JSON array of links). The files go
// only once the row is gone; if deleting them fails, the clean-up in the
// admin panel deletes them later.
async function deleteWithPhotos(table, filter) {
  const rows = await restCall("DELETE", `/rest/v1/${table}?${filter}&select=image_url`, null, { Prefer: "return=representation" });
  const links = (rows || []).map((r) => r.image_url).filter(Boolean);
  if (links.length) await deleteOwnImages(links);
  return rows;
}

export async function deletePost(postId) {
  return deleteWithPhotos("posts", `id=eq.${postId}&user_id=eq.${currentUser.id}`);
}

export async function deleteMarketItem(id) {
  if (!currentUser) throw new Error("Not logged in");
  return deleteWithPhotos("marketplace", `id=eq.${id}&user_id=eq.${currentUser.id}`);
}

export async function deleteHelpRequest(id) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("DELETE", `/rest/v1/help_requests?id=eq.${id}&user_id=eq.${currentUser.id}`);
}

export async function deleteDoc(id) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("DELETE", `/rest/v1/docs?id=eq.${id}&user_id=eq.${currentUser.id}`);
}

export async function deleteEvent(id) {
  if (!currentUser) throw new Error("Not logged in");
  return deleteWithPhotos("events", `id=eq.${id}&organizer_id=eq.${currentUser.id}`);
}

// ============================================================================
// COMMENTS
// ============================================================================

export async function getComments(postId) {
  return withPerson(await restCall("GET", `/rest/v1/comments?post_id=eq.${postId}&select=*,profiles:user_id(id,name,avatar_url)&order=created_at.asc`));
}

export async function addComment(postId, content) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/comments", {
    post_id: postId,
    user_id: currentUser.id,
    content,
  }, { Prefer: "return=representation" });
}

// ============================================================================
// LIKES
// ============================================================================

// Likes (on true) or unlikes a post. It says what the member wants rather
// than flipping what the database has, so a heart shown wrongly can't undo
// a like: liking twice keeps one like, unliking what isn't liked does nothing.
export async function setLike(postId, on) {
  if (!currentUser) throw new Error("Not logged in");
  if (on) {
    return restCall("POST", "/rest/v1/likes?on_conflict=post_id,user_id", { post_id: postId, user_id: currentUser.id },
      { Prefer: "resolution=ignore-duplicates,return=minimal" });
  }
  return restCall("DELETE", `/rest/v1/likes?post_id=eq.${encodeURIComponent(postId)}&user_id=eq.${currentUser.id}`);
}

export async function getUserLikes() {
  if (!currentUser) return [];
  return restCall("GET", `/rest/v1/likes?user_id=eq.${currentUser.id}&select=post_id`);
}

// ============================================================================
// CONNECTIONS (Namaste)
// ============================================================================

// Sends a Namaste request: { id, created }. created is false when the
// member had sent one before (whatever came of it), so a request the other
// member ignored isn't sent again.
export async function sendNamaste(recipientId) {
  if (!currentUser) throw new Error("Not logged in");
  const existing = await restCall("GET", `/rest/v1/connections?requester_id=eq.${currentUser.id}&recipient_id=eq.${recipientId}&select=id`);
  if (existing && existing.length > 0) return { id: existing[0].id, created: false };
  const rows = await restCall("POST", "/rest/v1/connections", {
    requester_id: currentUser.id,
    recipient_id: recipientId,
    status: "pending",
  }, { Prefer: "return=representation" });
  return { id: rows?.[0]?.id || null, created: true };
}

export async function respondToNamaste(connectionId, accept) {
  return restCall("PATCH", `/rest/v1/connections?id=eq.${connectionId}`, {
    status: accept ? "accepted" : "blocked",
  });
}

export async function unfollowUser(userId) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("DELETE", `/rest/v1/connections?requester_id=eq.${currentUser.id}&recipient_id=eq.${userId}&status=eq.accepted`);
}

export async function getMyConnections() {
  if (!currentUser) return [];
  // Followers and following who are shown (see UNLISTED_NAME).
  const rows = await restCall("GET", `/rest/v1/connections?or=(requester_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id})&status=eq.accepted&select=*,requester:requester_id(id,name,avatar_url,profession),recipient:recipient_id(id,name,avatar_url,profession)`);
  return (rows || []).filter((c) => c.requester && c.recipient);
}

export async function getAllConnections() {
  return restCall("GET", `/rest/v1/connections?status=eq.accepted&select=requester_id,recipient_id`);
}

// Requests the member sent that weren't accepted (yet). One the other
// member ignored ("blocked") looks the same to the sender: still sent.
export async function getSentNamastes() {
  if (!currentUser) return [];
  return restCall("GET", `/rest/v1/connections?requester_id=eq.${currentUser.id}&status=in.(pending,blocked)&select=recipient_id`);
}

// ============================================================================
// GROUPS
// ============================================================================

export async function getGroups() {
  return restCall("GET", "/rest/v1/groups?is_approved=eq.true&select=*&order=members_count.desc");
}

export async function joinGroup(groupId) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/group_members", {
    group_id: groupId,
    user_id: currentUser.id,
  }, { Prefer: "return=representation" });
}

export async function leaveGroup(groupId) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("DELETE", `/rest/v1/group_members?group_id=eq.${groupId}&user_id=eq.${currentUser.id}`);
}

export async function getMyGroupIds() {
  if (!currentUser) return [];
  const data = await restCall("GET", `/rest/v1/group_members?user_id=eq.${currentUser.id}&select=group_id`);
  return (data || []).map(d => d.group_id);
}

export async function getGroupMembers(groupId) {
  // Only members who are shown (see UNLISTED_NAME).
  const rows = await restCall("GET", `/rest/v1/group_members?group_id=eq.${groupId}&select=*,profiles:user_id(id,name,avatar_url,profession,location)`);
  return (rows || []).filter((m) => m.profiles);
}

// A new city group ("Indians in Paris") or university group ("Indians at
// TU Munich"), which an admin approves.
export async function requestNewGroup(name, kind = "City") {
  if (!currentUser) throw new Error("Not logged in");
  const uni = kind === "University";
  return restCall("POST", "/rest/v1/groups", {
    name: uni ? `Indians at ${name}` : `Indians in ${name}`,
    description: uni ? `For Indian students and alumni of ${name}.` : `Community for Indians living in ${name}.`,
    category: uni ? "University" : "City",
    created_by: currentUser.id,
    is_approved: false,
  }, { Prefer: "return=representation" });
}

// Pins one of a group's posts at the top (null unpins).
export async function pinGroupPost(groupId, postId) {
  return restCall("POST", "/rest/v1/rpc/pin_group_post", { p_group: groupId, p_post: postId });
}

// The ambassadors of a city (name and photo): active, verified members only.
// Since the 2026-10-21 database update the database says so itself
// (city_ambassadors, which also leaves out blocked members); before it, the
// Verified badge is all the site can see. (The database also ends the role
// when an ambassador is blocked, rejected or back in review.)
export async function getCityAmbassadors(city) {
  const name = String(city || "").trim();
  if (!name) return [];
  if (!knownMissing("city_ambassadors")) {
    try {
      return (await restCall("POST", "/rest/v1/rpc/city_ambassadors", { p_city: name })) || [];
    } catch (err) {
      if (!isMissingInDatabase(err)) throw err;
      missingSince.city_ambassadors = Date.now();
    }
  }
  // ilike without wildcards: "%" and "*" become "_" (one character), so
  // only this city matches, brackets and commas included.
  const q = name.replace(/[%_*\\]/g, "_");
  return (await restCall("GET", `/rest/v1/profiles?ambassador_city=ilike.${encodeURIComponent(q)}&linkedin_verified=is.true&select=id,name,avatar_url&limit=5`)) || [];
}

// ============================================================================
// THE AMBASSADOR PANEL (src/member/AmbassadorPanel.jsx)
// ============================================================================

// Since the 2026-10-27 database update, for the member who is a city's
// ambassador. Before it the database has none of these functions: the
// status is null and the panel says it's coming soon (whatever PostgREST or
// Postgres answer for something that doesn't exist, as for the travel board).
export const panelMissing = (err) => travelMissing(err);

// { city (null for a member who isn't an ambassador), group_id (the city's
// group), version (of the agreement), accepted, accepted_at,
// accepted_version, can_take_part }, or null before the database update.
export async function getAmbassadorStatus() {
  if (knownMissing("ambassador_status")) return null;
  try {
    return await restCall("POST", "/rest/v1/rpc/ambassador_status", {});
  } catch (err) {
    if (!panelMissing(err)) throw err;
    missingSince.ambassador_status = Date.now();
    return null;
  }
}

// The ambassador accepts the agreement (version: the one they read).
// Returns the new status.
export async function acceptAmbassadorAgreement(version) {
  return restCall("POST", "/rest/v1/rpc/accept_ambassador_agreement", { p_version: version });
}

// The city at a glance: { city, group: { id, name, description, members,
// pinned_post } | null, new_7d, new_30d, welcomed_30d, events_upcoming,
// events (the next 5), open_questions, unanswered }.
export async function getAmbassadorOverview() {
  return restCall("POST", "/rest/v1/rpc/ambassador_overview", {});
}

// Who joined the city group in the last `days` days (at most 30), newest
// first: [{ id, name, avatar_url, joined_at, welcomed }].
export async function getAmbassadorNewMembers(days = 30) {
  return (await restCall("POST", "/rest/v1/rpc/ambassador_new_members", { p_days: days })) || [];
}

// Marks a newcomer as welcomed by the ambassador (on false: takes it back).
export async function markAmbassadorWelcomed(memberId, on = true) {
  return restCall("POST", "/rest/v1/rpc/ambassador_mark_welcomed", { p_member: memberId, p_on: on });
}

// Questions from the city still waiting for a best answer, newest first:
// [{ id, title, category, urgent, created_at, answers, asker }].
export async function getAmbassadorOpenQuestions() {
  return (await restCall("POST", "/rest/v1/rpc/ambassador_open_questions", {})) || [];
}

// The city group's new description. Returns { id, description }.
export async function ambassadorUpdateGroup(description) {
  return restCall("POST", "/rest/v1/rpc/ambassador_update_group", { p_description: description });
}

// Marks the ambassador's own event in their city as hosted by the city
// ambassador, or takes the mark off. Returns the mark.
export async function setEventAmbassadorHosted(eventId, on) {
  return restCall("POST", "/rest/v1/rpc/set_event_ambassador_hosted", { p_event: eventId, p_on: on });
}

// "Flag to the team": a report from the city's ambassador, which our team
// sees first. type: "post", "comment", "help", "answer", "event" or
// "profile"; id: its id (the member's for "profile"); category: a
// REPORT_REASONS key; explanation: the ambassador's words. Returns the
// report's id.
export async function ambassadorFlag({ type, id, category, explanation }) {
  return restCall("POST", "/rest/v1/rpc/ambassador_flag", {
    p_kind: type, p_id: id, p_category: category, p_explanation: explanation,
  });
}

// The ambassador steps down. Returns the city they were ambassador for.
export async function ambassadorStepDown() {
  return restCall("POST", "/rest/v1/rpc/ambassador_step_down", {});
}

// ============================================================================
// EVENTS
// ============================================================================

export async function getEvents() {
  return restCall("GET", "/rest/v1/events?select=*&order=created_at.desc");
}

export async function createEvent(eventData) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/events", {
    ...eventData,
    organizer_id: currentUser.id,
  }, { Prefer: "return=representation" });
}

// The author's changes to their event (title, description, date, time,
// place, city, link, photo). Returns the saved event, or throws: e.g. for a
// date that has passed (refused by the database since the 2026-10-25
// update), or when the event is gone. A photo that was replaced or removed
// is deleted once the change is saved.
export async function updateEvent(eventId, changes, previousImage = "") {
  if (!currentUser) throw new Error("Not logged in");
  const rows = await restCall("PATCH", `/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&organizer_id=eq.${currentUser.id}`,
    changes, { Prefer: "return=representation" });
  if (!rows?.[0]) throw Object.assign(new Error("Event not saved"), { userMessage: "This event couldn't be changed. It may have been deleted." });
  if (previousImage && "image_url" in changes && changes.image_url !== previousImage) deleteOwnImages([previousImage]).catch(() => {});
  return rows[0];
}

export async function toggleRsvp(eventId) {
  if (!currentUser) throw new Error("Not logged in");
  const existing = await restCall("GET", `/rest/v1/event_rsvps?event_id=eq.${eventId}&user_id=eq.${currentUser.id}`);
  if (existing && existing.length > 0) {
    await restCall("DELETE", `/rest/v1/event_rsvps?event_id=eq.${eventId}&user_id=eq.${currentUser.id}`);
    return false;
  } else {
    await restCall("POST", "/rest/v1/event_rsvps", { event_id: eventId, user_id: currentUser.id });
    return true;
  }
}

// ---- Desi places (per city, recommended by members) ----
// Each place comes with recs: who recommends it, for the count and the
// member's own 👍. Since the 2026-10-20 database update members don't see who
// recommended a place (a temple, a doctor), only how many did
// (place_recommendation_counts): recs then holds the member's own id if they
// do, and null for each other member. Before it, recs holds every member's id.
export async function getPlaces(city) {
  const [rows, counts] = await Promise.all([
    restCall("GET", `/rest/v1/places?city=ilike.${encodeURIComponent(city)}&select=*,place_recommendations(user_id)&order=created_at.desc&limit=200`),
    knownMissing("place_counts") ? null
      : restCall("POST", "/rest/v1/rpc/place_recommendation_counts", { p_city: city }).catch((err) => {
        if (isMissingInDatabase(err)) missingSince.place_counts = Date.now();
        return null;
      }),
  ]);
  const byPlace = counts ? Object.fromEntries(counts.map((c) => [c.place_id, c])) : null;
  return (rows || []).map(({ place_recommendations: recs, ...p }) => {
    const ids = (recs || []).map(r => r.user_id);
    if (!byPlace) return { ...p, recs: ids };
    const c = byPlace[p.id];
    const mine = c ? !!c.mine : ids.includes(currentUser?.id);
    const others = Math.max(0, (c?.recommendations ?? ids.length) - (mine ? 1 : 0));
    return { ...p, recs: [...(mine ? [currentUser?.id] : []), ...Array(others).fill(null)] };
  });
}
export async function addPlace({ city, name, kind, address, note, languages = "" }) {
  if (!currentUser) throw new Error("Not logged in");
  const rows = await restCall("POST", "/rest/v1/places", { city, name, kind, address, note, ...(languages ? { languages } : {}), created_by: currentUser.id }, { Prefer: "return=representation" });
  return rows?.[0];
}
export async function deletePlace(id) {
  return restCall("DELETE", `/rest/v1/places?id=eq.${encodeURIComponent(id)}`);
}
export async function recommendPlace(id, on) {
  if (!currentUser) throw new Error("Not logged in");
  if (on) return restCall("POST", "/rest/v1/place_recommendations", { place_id: id, user_id: currentUser.id });
  return restCall("DELETE", `/rest/v1/place_recommendations?place_id=eq.${encodeURIComponent(id)}&user_id=eq.${currentUser.id}`);
}

// Who's going to an event (with their name and photo).
export async function getEventAttendees(eventId) {
  const rows = await restCall("GET", `/rest/v1/event_rsvps?event_id=eq.${encodeURIComponent(eventId)}&select=user_id,profiles:user_id(id,name,avatar_url)&limit=200`);
  return (rows || []).map(r => r.profiles).filter(Boolean);
}

export async function getMyRsvps() {
  if (!currentUser) return [];
  const data = await restCall("GET", `/rest/v1/event_rsvps?user_id=eq.${currentUser.id}&select=event_id`);
  return (data || []).map(d => d.event_id);
}

// ============================================================================
// MESSAGES
// ============================================================================

// Conversations the member deleted from their list: id -> when. Such a
// conversation comes back only with messages sent after that.
const hiddenAt = new Map();

// Which member's hides hiddenAt holds (null: not loaded yet).
let hidesUser = null;
async function loadHides() {
  const uid = currentUser?.id;
  const hides = await restCall("GET", `/rest/v1/conversation_hides?user_id=eq.${uid}&select=conversation_id,hidden_at`).catch(() => null);
  if (hides && uid === currentUser?.id) {
    hiddenAt.clear();
    hides.forEach(h => hiddenAt.set(h.conversation_id, h.hidden_at));
    hidesUser = uid;
  }
}

export async function getConversations() {
  if (!currentUser) return [];
  const [data] = await Promise.all([
    restCall("GET", `/rest/v1/conversations?or=(participant_1.eq.${currentUser.id},participant_2.eq.${currentUser.id})&select=*,p1:participant_1(id,name,avatar_url),p2:participant_2(id,name,avatar_url)&order=last_message_at.desc`),
    loadHides(),
  ]);
  return (data || [])
    .filter(c => !hiddenAt.has(c.id) || new Date(c.last_message_at) > new Date(hiddenAt.get(c.id)))
    .map(c => {
      const otherId = c.participant_1 === currentUser.id ? c.participant_2 : c.participant_1;
      return { ...c, otherUser: (c.participant_1 === currentUser.id ? c.p2 : c.p1) || unlistedPerson(otherId) };
    });
}

// "Delete conversation": removes it from this member's list only.
export async function hideConversation(conversationId) {
  if (!currentUser) throw new Error("Not logged in");
  const rows = await restCall("POST", "/rest/v1/conversation_hides?on_conflict=user_id,conversation_id",
    { user_id: currentUser.id, conversation_id: conversationId },
    { Prefer: "resolution=merge-duplicates,return=representation" });
  hiddenAt.set(conversationId, rows?.[0]?.hidden_at || new Date().toISOString());
}

// Unread messages per conversation: { conversation id: count }.
// When each unread message arrived (ms), per conversation, as of the last
// getUnreadCounts(), so the app can count what arrived after a moment.
const unreadTimes = new Map();
export const unreadSince = (conversationId, since) => (unreadTimes.get(conversationId) || []).filter(t => t > since).length;

export async function getUnreadCounts() {
  if (!currentUser) return {};
  // Chats the member deleted don't count: load their hides first if needed.
  const [rows] = await Promise.all([
    restCall("GET", `/rest/v1/messages?read=eq.false&sender_id=neq.${currentUser.id}&select=conversation_id,created_at&limit=1000`),
    hidesUser === currentUser.id ? null : loadHides(),
  ]);
  const counts = {};
  unreadTimes.clear();
  (rows || []).forEach(r => {
    const h = hiddenAt.get(r.conversation_id);
    if (!h || new Date(r.created_at) > new Date(h)) {
      counts[r.conversation_id] = (counts[r.conversation_id] || 0) + 1;
      unreadTimes.set(r.conversation_id, [...(unreadTimes.get(r.conversation_id) || []), Date.parse(r.created_at) || 0]);
    }
  });
  return counts;
}

export async function markConversationRead(conversationId) {
  return restCall("POST", "/rest/v1/rpc/mark_conversation_read", { p_conversation: conversationId });
}

export async function getOrCreateConversation(otherUserId) {
  if (!currentUser) throw new Error("Not logged in");
  // Check existing
  const existing = await restCall("GET", `/rest/v1/conversations?or=(and(participant_1.eq.${currentUser.id},participant_2.eq.${otherUserId}),and(participant_1.eq.${otherUserId},participant_2.eq.${currentUser.id}))&select=*`);
  if (existing && existing.length > 0) return existing[0];
  // Create new
  const result = await restCall("POST", "/rest/v1/conversations", {
    participant_1: currentUser.id,
    participant_2: otherUserId,
  }, { Prefer: "return=representation" });
  return result[0];
}

export async function getMessages(conversationId) {
  const rows = withPerson(await restCall("GET", `/rest/v1/messages?conversation_id=eq.${conversationId}&select=*,sender:sender_id(id,name,avatar_url)&order=created_at.asc`), "sender", "sender_id");
  const h = hiddenAt.get(conversationId);
  return h && rows ? rows.filter(m => new Date(m.created_at) > new Date(h)) : rows;
}

export async function sendMessage(conversationId, content) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/messages", {
    conversation_id: conversationId,
    sender_id: currentUser.id,
    content,
  }, { Prefer: "return=representation" });
}

// ============================================================================
// MARKETPLACE
// ============================================================================

export async function getMarketItems(filters = {}) {
  let url = "/rest/v1/marketplace?status=eq.active&select=*,profiles:user_id(id,name,avatar_url)&order=created_at.desc";
  if (filters.category && filters.category !== "All") url += `&category=eq.${filters.category}`;
  if (filters.city && filters.city !== "All") url += `&location=ilike.%25${filters.city}%25`;
  if (filters.search) url += `&or=(title.ilike.%25${filters.search}%25,description.ilike.%25${filters.search}%25)`;
  return withPerson(await restCall("GET", url));
}

export async function createMarketItem(item) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/marketplace", {
    ...item,
    user_id: currentUser.id,
  }, { Prefer: "return=representation" });
}

// ============================================================================
// TRAVEL BOARD ("Flying to or from India", src/member/TravelBoard.jsx)
// ============================================================================

// Since the 2026-10-26 database update. Before it the board isn't there:
// the reads below return null and the board says it's coming soon, on
// whatever PostgREST or Postgres answer for something that doesn't exist
// (for travel_posts with its authors, PostgREST 12 says it can't find the
// relationship, PGRST200).
function travelMissing(err) {
  if (isMissingInDatabase(err) || /\(404\)$/.test(err?.message || "")) return true;
  try {
    return ["PGRST200", "PGRST205", "42P01"].includes(JSON.parse(err?.message || "")?.code);
  } catch {
    return false;
  }
}

const TRAVEL_FIELDS = "id,user_id,kind,from_city,to_city,from_key,to_key,date_from,date_to,flight,help,note,created_at,updated_at";

// The posts whose last date is today (in Germany: from) or later, soonest
// first (the first 500, plus all of the member's own), with their authors.
// The database leaves out posts of members who blocked the member or were
// blocked by them, and of accounts other members don't see. null before the
// database update.
const TRAVEL_SELECT = `select=${TRAVEL_FIELDS},profiles:user_id(id,name,avatar_url)`;
export async function getTravelPosts(from) {
  const current = `&date_to=gte.${encodeURIComponent(from)}`;
  try {
    const [board, mine] = await Promise.all([
      restCall("GET", `/rest/v1/travel_posts?${TRAVEL_SELECT}${current}&order=date_from.asc,created_at.desc&limit=500`),
      currentUser ? restCall("GET", `/rest/v1/travel_posts?${TRAVEL_SELECT}${current}&user_id=eq.${currentUser.id}`) : [],
    ]);
    const ids = new Set((board || []).map((p) => p.id));
    return withPerson([...(board || []), ...(mine || []).filter((p) => !ids.has(p.id))]);
  } catch (err) {
    if (travelMissing(err)) return null;
    throw err;
  }
}

// One post (e.g. from a notification), if the member may see it; else null.
export async function getTravelPost(id) {
  if (!UUID.test(id || "")) return null;
  const rows = withPerson(await restCall("GET", `/rest/v1/travel_posts?${TRAVEL_SELECT}&id=eq.${id}`));
  return rows?.[0] || null;
}

// Whether the member has ticked the board's current rules: { version,
// accepted, accepted_version, accepted_at }. null before the database update.
export async function getTravelRulesStatus() {
  try {
    return await restCall("POST", "/rest/v1/rpc/travel_rules_status", {});
  } catch (err) {
    if (travelMissing(err)) return null;
    throw err;
  }
}

// The member ticked the rules (version: TRAVEL_RULES_VERSION, the ones they
// read). Returns the new status.
export async function acceptTravelRules(version) {
  return restCall("POST", "/rest/v1/rpc/accept_travel_rules", { p_version: version });
}

const travelBody = (p) => ({
  from_city: p.from_city, to_city: p.to_city, date_from: p.date_from, date_to: p.date_to,
  flight: p.flight || "", help: p.help, note: p.note || "",
});

// A new post (kind "offer" or "request"); returns it as saved.
export async function createTravelPost(post) {
  if (!currentUser) throw new Error("Not logged in");
  const rows = await restCall("POST", `/rest/v1/travel_posts?select=${TRAVEL_FIELDS}`,
    { ...travelBody(post), kind: post.kind, user_id: currentUser.id }, { Prefer: "return=representation" });
  if (!rows?.[0]) throw userError("Your post couldn't be saved. Please try again.");
  return rows[0];
}

// The author's changes to their post (not its kind); returns it as saved.
export async function updateTravelPost(id, post) {
  if (!UUID.test(id || "")) throw new Error("Unknown post");
  const rows = await restCall("PATCH", `/rest/v1/travel_posts?id=eq.${id}&select=${TRAVEL_FIELDS}`, travelBody(post),
    { Prefer: "return=representation" });
  if (!rows?.[0]) throw userError("This post couldn't be saved. It may have been deleted.");
  return rows[0];
}

export async function deleteTravelPost(id) {
  if (!UUID.test(id || "")) throw new Error("Unknown post");
  return restCall("DELETE", `/rest/v1/travel_posts?id=eq.${id}`);
}

// ============================================================================
// DOCS
// ============================================================================

export async function getDocs(cityFilter = "All") {
  let url = "/rest/v1/docs?select=*,profiles:user_id(id,name,avatar_url,profession,location)&order=created_at.desc";
  if (cityFilter !== "All") url += `&city=ilike.%25${cityFilter}%25`;
  return withPerson(await restCall("GET", url));
}

export async function createDoc(doc) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/docs", {
    ...doc,
    user_id: currentUser.id,
  }, { Prefer: "return=representation" });
}

export async function getDocComments(docId) {
  return withPerson(await restCall("GET", `/rest/v1/doc_comments?doc_id=eq.${docId}&select=*,profiles:user_id(id,name,avatar_url)&order=created_at.asc`));
}

export async function addDocComment(docId, content) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/doc_comments", {
    doc_id: docId,
    user_id: currentUser.id,
    content,
  }, { Prefer: "return=representation" });
}

// ============================================================================
// HELP REQUESTS
// ============================================================================

export async function getHelpRequests() {
  return withPerson(await restCall("GET", "/rest/v1/help_requests?select=*,profiles:user_id(id,name,avatar_url)&order=created_at.desc"));
}

export async function createHelpRequest({ urgent = false, ...req }) {
  if (!currentUser) throw new Error("Not logged in");
  const send = (body) => restCall("POST", "/rest/v1/help_requests", { ...body, user_id: currentUser.id }, { Prefer: "return=representation" });
  if (!urgent) return send(req);
  try {
    return await send({ ...req, urgent: true });
  } catch (e) {
    // Before the database knows about urgent questions: post it as High,
    // and say that no alerts went out (rows.alertsOff).
    if (/urgent/.test(e.message || "") && /PGRST204|column/i.test(e.message || "")) {
      const rows = await send(req);
      return Object.assign(rows || [], { alertsOff: true });
    }
    throw e;
  }
}

// One question (with the asker), e.g. from a notification.
export async function getHelpRequest(id) {
  const rows = withPerson(await restCall("GET", `/rest/v1/help_requests?id=eq.${encodeURIComponent(id)}&select=*,profiles:user_id(id,name,avatar_url)`));
  return rows?.[0] || null;
}

// The asker's best answer (null to clear it).
export async function setBestAnswer(requestId, responseId) {
  if (!currentUser) throw new Error("Not logged in");
  const rows = await restCall("PATCH", `/rest/v1/help_requests?id=eq.${encodeURIComponent(requestId)}&user_id=eq.${currentUser.id}`, { best_response_id: responseId }, { Prefer: "return=representation" });
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Not changed");
  return rows[0];
}

// 🙏 Thanks for an answer (on = false takes it back).
export async function thankAnswer(responseId, on) {
  if (!currentUser) throw new Error("Not logged in");
  if (on) return restCall("POST", "/rest/v1/answer_thanks", { response_id: responseId, user_id: currentUser.id });
  return restCall("DELETE", `/rest/v1/answer_thanks?response_id=eq.${encodeURIComponent(responseId)}&user_id=eq.${currentUser.id}`);
}

// Which of these answers the member has thanked (ids).
export async function getMyThanks(responseIds) {
  if (!currentUser || !responseIds.length) return [];
  const rows = await restCall("GET", `/rest/v1/answer_thanks?user_id=eq.${currentUser.id}&response_id=in.(${responseIds.map(encodeURIComponent).join(",")})&select=response_id`);
  return (rows || []).map(r => r.response_id);
}

// How many members thanked this member for an answer.
export async function getHelpedCount(memberId) {
  const n = await restCall("POST", "/rest/v1/rpc/member_helped_count", { p_member: memberId });
  return Number(n) || 0;
}

export async function getHelpResponses(requestId) {
  if (requestId) {
    return withPerson(await restCall("GET", `/rest/v1/help_responses?request_id=eq.${requestId}&select=*,profiles:user_id(id,name,avatar_url)&order=created_at.asc`));
  }
  // Fetch all responses (for counting)
  return restCall("GET", `/rest/v1/help_responses?select=id,request_id&order=created_at.desc`);
}

export async function addHelpResponse(requestId, content) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/help_responses", {
    request_id: requestId,
    user_id: currentUser.id,
    content,
  }, { Prefer: "return=representation" });
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export async function getNotifications() {
  if (!currentUser) return [];
  // Get all unread + non-request read notifications (exclude handled requests)
  const all = withPerson(await restCall("GET", `/rest/v1/notifications?user_id=eq.${currentUser.id}&select=*,actor:actor_id(id,name,avatar_url)&order=created_at.desc&limit=20`), "actor", "actor_id");
  if (!all) return [];
  // Filter out request notifications that have been read (they were accepted/ignored)
  return all.filter(n => !(n.type === "request" && n.read === true));
}

export async function markNotificationsRead() {
  if (!currentUser) return;
  return restCall("PATCH", `/rest/v1/notifications?user_id=eq.${currentUser.id}&read=eq.false`, { read: true });
}

export async function deleteNotification(notifId) {
  if (!currentUser) return;
  return restCall("DELETE", `/rest/v1/notifications?id=eq.${notifId}`);
}

export async function markNotificationHandled(notifId) {
  if (!currentUser) return;
  // Mark as read - we track handled state by checking if request type + read=true
  return restCall("PATCH", `/rest/v1/notifications?id=eq.${notifId}`, { read: true });
}

export async function createNotification(userId, type, text, actorId = null, refId = null) {
  const body = { user_id: userId, type, text };
  if (actorId) body.actor_id = actorId;
  if (refId) body.reference_id = refId;
  return restCall("POST", "/rest/v1/notifications", body);
}

// The kinds of notification the database writes itself (like, comment and
// Namaste request since the 2026-10-20 database update, which also stops
// members writing them). Remembered once known; until that update there are
// none, and the database is asked again after a few minutes.
let serverTypesRequest = null;
function serverNotificationTypes() {
  if (!serverTypesRequest || (missingSince.server_notification_types && !knownMissing("server_notification_types"))) {
    delete missingSince.server_notification_types;
    serverTypesRequest = restCall("POST", "/rest/v1/rpc/server_notification_types", {})
      .then((types) => (Array.isArray(types) ? types : []))
      .catch((err) => {
        if (isMissingInDatabase(err)) {
          missingSince.server_notification_types = Date.now();
          return [];
        }
        serverTypesRequest = null;
        throw err;
      });
  }
  return serverTypesRequest;
}

// Tells another member about a like, comment or Namaste request, as the site
// did before the 2026-10-20 database update. Since that update the database
// writes these notifications itself, in its own words, and this sends
// nothing. If it isn't known which is the case (no connection), it sends
// nothing either.
export async function notifyMember(userId, type, text, actorId = null, refId = null) {
  let types;
  try { types = await serverNotificationTypes(); } catch { return; }
  if (types.includes(type)) return;
  return createNotification(userId, type, text, actorId, refId);
}

// ============================================================================
// REPORTS & BLOCKS
// ============================================================================

export async function reportUser(userId, reason) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/reports", {
    reporter_id: currentUser.id,
    reported_user_id: userId,
    reason,
    status: "pending",
  });
}

// Feedback (a bug report or an idea: reason "[BUG] ..." / "[IDEA] ...") is
// sent this way too, about the member themself.
export async function reportPost(postId, reason) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/reports", {
    reporter_id: currentUser.id,
    reported_post_id: postId,
    reason,
    status: "pending",
  });
}

// A report from the in-app dialog. type: what is reported, as the database
// calls it (reports.content_type: "post", "comment", "answer", "doc",
// "doc_comment", "event", "help", "market", "review", "place", "message" or
// "profile"); id: its id (the member's for "profile"); userId: who wrote it,
// if known (the database looks it up itself); name: a few words to recognise
// it by; category: a REPORT_REASONS key; explanation: the member's words.
// Since the 2026-10-21 database update these go in their own columns, with
// the good-faith confirmation. Before it, the database has no such columns:
// the reason line then carries the category's label and the explanation,
// with the kind in its "[TYPE]" prefix, as the admin panel read reports
// before.
export async function reportContent({ type, id, userId = null, name = "", category, categoryLabel, explanation }) {
  if (!currentUser) throw new Error("Not logged in");
  const profile = type === "profile";
  const prefix = `[${type === "market" ? "MARKETPLACE" : profile ? "USER" : type.toUpperCase()}] ${name ? `${String(name).slice(0, 80)} — ` : ""}`;
  const base = {
    reporter_id: currentUser.id,
    reported_post_id: profile ? null : id,
    reported_user_id: profile ? id : (userId || null),
    status: "pending",
  };
  const legacy = () => restCall("POST", "/rest/v1/reports", {
    ...base, reason: `${prefix}${categoryLabel}: ${explanation}`.slice(0, 5000),
  });
  if (knownMissing("report_columns")) return legacy();
  try {
    return await restCall("POST", "/rest/v1/reports", {
      ...base, reason: `${prefix}${categoryLabel}`.slice(0, 5000),
      content_type: type, category, explanation, good_faith: true,
    });
  } catch (err) {
    if (!isMissingInDatabase(err)) throw err;
    missingSince.report_columns = Date.now();
    return legacy();
  }
}

// What the member reported that is still waiting for our team, as
// "type:id" keys (and the plain id, for posts and members), so the app can
// hide Report on them. Before the 2026-10-21 database update reports have no
// kind or open status to go by: every item the member ever reported counts.
export async function getMyReports() {
  if (!currentUser) return new Set();
  const keys = new Set();
  const add = (r) => {
    const id = r.reported_post_id || r.reported_user_id;
    if (!id) return;
    keys.add(id);
    if (r.content_type) keys.add(`${r.content_type}:${id}`);
    else if (!r.reported_post_id) keys.add(`profile:${id}`);
  };
  if (!knownMissing("report_columns")) {
    try {
      const rows = await restCall("GET", `/rest/v1/reports?reporter_id=eq.${currentUser.id}&status=eq.pending&content_type=neq.feedback&select=reported_post_id,reported_user_id,content_type`);
      (rows || []).forEach(add);
      return keys;
    } catch (err) {
      if (!isMissingInDatabase(err)) throw err;
      missingSince.report_columns = Date.now();
    }
  }
  const rows = await restCall("GET", `/rest/v1/reports?reporter_id=eq.${currentUser.id}&select=reported_post_id,reported_user_id,reason`);
  (rows || []).filter((r) => !/^\[(BUG|IDEA)\]/.test(r.reason || "")).forEach(add);
  return keys;
}

// A report from the public page (nriclub.app/report), signed in or not:
// returns its reference code. Before the 2026-10-21 database update there's
// nowhere to send it: the error then has notAvailable set, and the page
// offers email instead.
export async function submitNotice({ location, category, explanation, name, email, goodFaith }) {
  try {
    return await restCall("POST", "/rest/v1/rpc/submit_notice", {
      p_location: location, p_category: category, p_explanation: explanation,
      p_name: name, p_email: email, p_good_faith: !!goodFaith,
    });
  } catch (err) {
    if (isMissingInDatabase(err)) {
      const e = new Error("Reports can't be sent here yet.");
      e.notAvailable = true;
      throw e;
    }
    throw err;
  }
}

// An application to be a city ambassador (anyone; a member who is signed
// in applies with their account's name and email address, and the
// application is linked to the account). Returns its reference code
// ("A-7F3A92C1"). The database answers null when a visitor's email address
// already has an open application (nothing is saved): throws an error with
// that in userMessage. Before the 2026-10-24 database update there's nowhere
// to send it: throws an error with notAvailable, and the form offers the
// same application by email.
export const AMBASSADOR_ALREADY_WAITING = "An application from this email address is already waiting for our team. We'll write to you soon; if something has changed, write to hello@nriclub.app.";

export async function submitAmbassadorApplication({ name, email, city, country, organisation = "", linkedinUrl = "", motivation, hoursPerWeek }) {
  let ref;
  try {
    ref = await restCall("POST", "/rest/v1/rpc/submit_ambassador_application", {
      p_name: name, p_email: email, p_city: city, p_country: country, p_organisation: organisation,
      p_linkedin_url: linkedinUrl, p_motivation: motivation, p_hours_per_week: hoursPerWeek,
    });
  } catch (err) {
    if (isMissingInDatabase(err) || /\(404\)$/.test(err?.message || "")) {
      const e = new Error("Applications can't be sent here yet.");
      e.notAvailable = true;
      throw e;
    }
    throw err;
  }
  if (typeof ref !== "string" || !ref) {
    const e = new Error("Already waiting");
    e.userMessage = AMBASSADOR_ALREADY_WAITING;
    throw e;
  }
  return ref;
}

// Blocks a member and removes the Namaste connections between the two.
// Since the 2026-10-25 database update that is one step
// (public.block_member) that either all happens or not at all; before it,
// the block is recorded first, then the connections are removed. Throws if
// the block wasn't recorded.
export async function blockUser(userId) {
  if (!currentUser) throw new Error("Not logged in");
  if (!knownMissing("block_member")) {
    try {
      return await restCall("POST", "/rest/v1/rpc/block_member", { p_member: userId });
    } catch (err) {
      if (!isMissingInDatabase(err)) throw err;
      missingSince.block_member = Date.now();
    }
  }
  try {
    await restCall("POST", "/rest/v1/blocks", { blocker_id: currentUser.id, blocked_id: userId });
  } catch (err) {
    if (!/23505/.test(err?.message || "")) throw err; // already blocked
  }
  await restCall("DELETE", `/rest/v1/connections?requester_id=eq.${currentUser.id}&recipient_id=eq.${userId}`);
  await restCall("DELETE", `/rest/v1/connections?requester_id=eq.${userId}&recipient_id=eq.${currentUser.id}`);
  return true;
}

export async function unblockUser(userId) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("DELETE", `/rest/v1/blocks?blocker_id=eq.${currentUser.id}&blocked_id=eq.${userId}`);
}

export async function getBlockedUsers() {
  if (!currentUser) return [];
  return withPerson(await restCall("GET", `/rest/v1/blocks?blocker_id=eq.${currentUser.id}&select=*,blocked:blocked_id(id,name,avatar_url,profession)`), "blocked", "blocked_id");
}


// ============================================================================
// PHOTO FILES
// ============================================================================

// The public buckets members upload photos to (event photos go to
// post-images). Each member writes only inside their own folder
// (<member id>/...); since the 2026-10-22 database update the buckets take
// JPEG, PNG and WebP up to 2 MB (profile photos) or 4 MB.
const PHOTO_BUCKETS = ["avatars", "post-images", "marketplace-images"];
const PHOTO_LIMIT = { avatars: 2 * 1024 * 1024, "post-images": 4 * 1024 * 1024, "marketplace-images": 4 * 1024 * 1024 };
const PUBLIC_PATH = "/storage/v1/object/public/";

// An error whose message the site may show as it is (apiErrorMessage).
function userError(message) {
  const err = new Error(message);
  err.userMessage = message;
  return err;
}

const PHOTO_UNREADABLE = "This photo couldn't be read. Try a JPEG or PNG.";
const PHOTO_TOO_LARGE = "This photo is too large. Please choose a smaller one.";

// A request to Storage as the signed-in member: renews an expired session
// once, like restRequest. Storage answers an expired token with 400 or 403
// and "jwt expired" as well as with 401.
async function storageRequest(method, path, body, contentType = "application/json") {
  const send = () => fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": contentType },
    body: body == null ? undefined : contentType === "application/json" ? JSON.stringify(body) : body,
  });
  let res = await send();
  if (!res.ok && accessToken) {
    const text = await res.clone().text().catch(() => "");
    if ((res.status === 401 || /jwt|token/i.test(text)) && await refreshSession()) res = await send();
  }
  return res;
}

// Uploads a file to bucket/filePath and returns its public link. Paths are
// random (photoPath), so an upload never replaces another file.
export async function uploadFile(bucket, filePath, file) {
  const res = await storageRequest("POST", `/storage/v1/object/${bucket}/${filePath}`, file, file.type || "application/octet-stream");
  if (!res.ok) {
    let j = {};
    try { j = await res.json(); } catch (e) {}
    const said = `${j.statusCode || ""} ${j.error || ""} ${j.message || ""}`;
    if (/413|too large|maximum allowed size/i.test(said)) throw userError(PHOTO_TOO_LARGE);
    if (/415|mime/i.test(said)) throw userError("Please choose a photo (JPEG or PNG).");
    throw new Error(j.message || j.error || `Upload failed (${res.status})`);
  }
  return `${SUPABASE_URL}${PUBLIC_PATH}${bucket}/${filePath}`;
}

// A photo the browser can show, ready to draw: an ImageBitmap (the photo's
// own rotation applied), or an <img> on browsers without createImageBitmap.
// Throws if the browser can't read it (e.g. a HEIC photo outside Safari).
async function readPhoto(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) {}
    try { return await createImageBitmap(file); } catch (e) {}
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    if (img.decode) await img.decode().catch(() => {});
    return img;
  } catch (e) {
    throw userError(PHOTO_UNREADABLE);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

// Every photo is drawn again and saved as a new JPEG before it is uploaded:
// at most `max` pixels on the long side (about 150-300 KB), and without the
// hidden details the original file carries (EXIF: where and when it was
// taken, the camera). Only the first frame of a GIF is kept. Throws a
// message for the member if the photo can't be read or stays too large.
async function toJpeg(file, max, limit, quality = 0.82) {
  if (!file || (file.type && !/^image\//i.test(file.type))) throw userError("Please choose a photo.");
  if (file.size > 25 * 1024 * 1024) throw userError(PHOTO_TOO_LARGE);
  const photo = await readPhoto(file);
  const width = photo.naturalWidth || photo.width;
  const height = photo.naturalHeight || photo.height;
  if (!width || !height) throw userError(PHOTO_UNREADABLE);
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // transparent PNG areas become white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
  photo.close?.();
  for (const q of [quality, 0.6]) {
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", q));
    if (!blob) throw userError(PHOTO_UNREADABLE);
    if (blob.size <= limit) return new File([blob], "photo.jpg", { type: "image/jpeg" });
  }
  throw userError(PHOTO_TOO_LARGE);
}

// <member id>/<random>.jpg: the name says nothing about the member's
// photos or when they were taken, and can't be guessed.
function photoPath() {
  let id;
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    id = crypto.randomUUID();
  } else {
    const b = crypto.getRandomValues(new Uint8Array(16));
    id = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }
  return `${currentUser.id}/${id}.jpg`;
}

async function uploadPhoto(bucket, file, max) {
  if (!currentUser) throw new Error("Not logged in");
  const jpeg = await toJpeg(file, max, PHOTO_LIMIT[bucket]);
  return uploadFile(bucket, photoPath(), jpeg);
}

export async function uploadAvatar(file) {
  return uploadPhoto("avatars", file, 512);
}

// Photos for posts and events.
export async function uploadPostImage(file) {
  return uploadPhoto("post-images", file, 1600);
}

export async function uploadMarketImage(file) {
  return uploadPhoto("marketplace-images", file, 1600);
}

// The bucket and path of a photo link from this project's Storage, or null.
function storageObject(url) {
  if (typeof url !== "string") return null;
  const at = url.indexOf(PUBLIC_PATH);
  if (at < 0) return null;
  const rest = url.slice(at + PUBLIC_PATH.length).split(/[?#]/)[0];
  const slash = rest.indexOf("/");
  if (slash < 1) return null;
  let path = rest.slice(slash + 1);
  try { path = decodeURIComponent(path); } catch (e) {}
  return { bucket: rest.slice(0, slash), path };
}

// The photo links in a stored value: one link, or a Market listing's JSON
// array of links.
function photoLinks(value) {
  if (!value || typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((u) => typeof u === "string");
    if (typeof parsed === "string") return [parsed];
  } catch (e) {}
  return [value];
}

// Deletes files (paths) from a bucket through the Storage API, 100 at a
// time; returns the paths Storage says it deleted. Storage deletes only
// what the policies let this account delete, and says nothing about the rest.
async function deleteStorageObjects(bucket, paths) {
  const gone = [];
  for (let i = 0; i < paths.length; i += 100) {
    const res = await storageRequest("DELETE", `/storage/v1/object/${bucket}`, { prefixes: paths.slice(i, i + 100) });
    if (!res.ok) throw new Error(`Deleting photo files failed (${res.status})`);
    const rows = await res.json().catch(() => []);
    (Array.isArray(rows) ? rows : []).forEach((r) => { if (r?.name) gone.push(r.name); });
  }
  return gone;
}

// Deletes the signed-in member's own photo files behind these links (other
// links are skipped): after their post, listing or event is deleted, or a
// profile photo is replaced. Never throws: what is left behind, the
// clean-up in the admin panel deletes. Returns how many were deleted.
export async function deleteOwnImages(urls) {
  if (!currentUser) return 0;
  const byBucket = {};
  (urls || []).flatMap(photoLinks).map(storageObject).forEach((o) => {
    if (!o || !PHOTO_BUCKETS.includes(o.bucket) || !o.path.startsWith(`${currentUser.id}/`)) return;
    (byBucket[o.bucket] = byBucket[o.bucket] || new Set()).add(o.path);
  });
  let count = 0;
  for (const [bucket, paths] of Object.entries(byBucket)) {
    try { count += (await deleteStorageObjects(bucket, [...paths])).length; } catch (e) {}
  }
  return count;
}

// A photo the member uploaded but then didn't use (taken off a post being
// written, or the post was cancelled).
export function discardUpload(url) {
  if (url) deleteOwnImages([url]);
}

// Every file in the signed-in member's own folder of a bucket (paths).
async function listMyFiles(bucket, folder = currentUser.id, depth = 0) {
  const paths = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await storageRequest("POST", `/storage/v1/object/list/${bucket}`, { prefix: `${folder}/`, limit: 1000, offset });
    if (!res.ok) throw new Error(`Listing photo files failed (${res.status})`);
    const rows = (await res.json().catch(() => [])) || [];
    for (const r of rows) {
      if (!r?.name) continue;
      if (r.id) paths.push(`${folder}/${r.name}`);
      else if (depth < 3) paths.push(...await listMyFiles(bucket, `${folder}/${r.name}`, depth + 1));
    }
    if (rows.length < 1000) return paths;
  }
}

// Deletes every photo file of the signed-in member, bucket by bucket (for
// account deletion). A bucket that fails is skipped. Returns how many files
// were deleted.
async function deleteMyFiles() {
  let count = 0;
  for (const bucket of PHOTO_BUCKETS) {
    try {
      const paths = await listMyFiles(bucket);
      if (paths.length) count += (await deleteStorageObjects(bucket, paths)).length;
    } catch (e) {}
  }
  return count;
}

// A new profile photo: uploads it, saves it on the profile, then deletes
// the previous one. If the profile can't be saved, the new file is deleted
// again. Returns the new link.
export async function changeAvatar(file, previousUrl = "") {
  const url = await uploadAvatar(file);
  try {
    const rows = await updateProfile({ avatar_url: url });
    if (!rows?.[0] || rows[0].avatar_url !== url) throw new Error("Your photo couldn't be saved. Please try again.");
  } catch (err) {
    await deleteOwnImages([url]);
    throw err;
  }
  if (previousUrl && previousUrl !== url) await deleteOwnImages([previousUrl]);
  return url;
}

// Takes the profile photo off the profile and deletes its file.
export async function removeAvatar(previousUrl) {
  const rows = await updateProfile({ avatar_url: "" });
  if (!rows?.[0] || rows[0].avatar_url !== "") throw new Error("Your photo couldn't be removed. Please try again.");
  await deleteOwnImages([previousUrl]);
}

// ============================================================================
// USER SETTINGS
// ============================================================================

export async function getUserSettings() {
  if (!currentUser) return null;
  const data = await restCall("GET", `/rest/v1/user_settings?user_id=eq.${currentUser.id}&select=*`);
  return data && data.length > 0 ? data[0] : null;
}

export async function saveUserSettings(settings) {
  if (!currentUser) throw new Error("Not logged in");
  // Try update first, then insert if not exists
  const existing = await getUserSettings();
  if (existing) {
    return restCall("PATCH", `/rest/v1/user_settings?user_id=eq.${currentUser.id}`, {
      ...settings, updated_at: new Date().toISOString(),
    });
  } else {
    return restCall("POST", "/rest/v1/user_settings", {
      user_id: currentUser.id, ...settings,
    }, { Prefer: "return=representation" });
  }
}

export async function getOtherUserSettings(userId) {
  // Fetch another user's public settings (for checking if they accept messages/requests)
  const data = await restCall("POST", "/rest/v1/rpc/get_member_preferences", { member: userId });
  return data && data.length > 0 ? data[0] : null;
}

// ============================================================================
// REALTIME - WebSocket subscription for instant messages
// ============================================================================
let realtimeSocket = null;
let realtimeHeartbeat = null;
let messageCallbacks = [];

export function subscribeToMessages(conversationId, callback) {
  // Clean up any existing connection
  unsubscribeFromMessages();
  
  const wsUrl = SUPABASE_URL.replace("https://", "wss://") + "/realtime/v1/websocket?apikey=" + SUPABASE_ANON_KEY + "&vsn=1.0.0";
  
  try {
    realtimeSocket = new WebSocket(wsUrl);
    
    realtimeSocket.onopen = () => {
      // Join the realtime channel for messages in this conversation
      const joinMsg = JSON.stringify({
        topic: `realtime:public:messages:conversation_id=eq.${conversationId}`,
        event: "phx_join",
        // access_token lets Realtime apply the messages RLS policy for this user.
        payload: { config: { broadcast: { self: false }, presence: { key: "" }, postgres_changes: [{ event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }] }, access_token: accessToken },
        ref: "1",
      });
      realtimeSocket.send(joinMsg);
      
      // Heartbeat to keep connection alive
      realtimeHeartbeat = setInterval(() => {
        if (realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) {
          realtimeSocket.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: "hb" }));
        }
      }, 30000);
    };
    
    realtimeSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === "postgres_changes" && data.payload?.data?.record) {
          const record = data.payload.data.record;
          callback(record);
        }
      } catch (e) {}
    };
    
    realtimeSocket.onerror = () => {};
    realtimeSocket.onclose = () => {};
  } catch (e) {}
  
  messageCallbacks.push(callback);
}

export function unsubscribeFromMessages() {
  if (realtimeHeartbeat) { clearInterval(realtimeHeartbeat); realtimeHeartbeat = null; }
  if (realtimeSocket) { try { realtimeSocket.close(); } catch(e) {} realtimeSocket = null; }
  messageCallbacks = [];
}

// ============================================================================
// ADMIN - every call runs as the signed-in user; the database only allows it
// for accounts listed in public.admins.
// ============================================================================

// What the signed-in account may do in the admin panel, as the database
// says (public.admin_mfa_status): { listed, active, mfaRequired, aal,
// isAdmin }. listed: in public.admins; active: not blocked; mfaRequired:
// admin rights need two-step login; aal: how this session was signed in;
// isAdmin: admin rights now; changedAt: when an admin last switched the
// requirement. Before the 2026-10-23 database update there is no such
// function: being listed is enough then (and there's no two-step
// requirement), so the answer comes from public.admins, with before: true.
export async function adminAccess() {
  if (!currentUser) return { listed: false, active: false, mfaRequired: false, aal: "", isAdmin: false };
  if (!knownMissing("admin_mfa_status")) {
    try {
      const s = (await restCall("POST", "/rest/v1/rpc/admin_mfa_status", {})) || {};
      return { listed: !!s.listed, active: s.active !== false, mfaRequired: !!s.mfa_required, aal: s.aal || sessionAal(), isAdmin: !!s.is_admin, changedAt: s.mfa_changed_at || null };
    } catch (err) {
      if (!isMissingInDatabase(err)) throw err;
      missingSince.admin_mfa_status = Date.now();
    }
  }
  const rows = await restCall("GET", `/rest/v1/admins?user_id=eq.${currentUser.id}&select=user_id`);
  const listed = Array.isArray(rows) && rows.length > 0;
  return { listed, active: true, mfaRequired: false, aal: sessionAal(), isAdmin: listed, before: true };
}

export async function isAdmin() {
  return (await adminAccess()).isAdmin;
}

// Turns "Require two-step login for admin rights" on or off. Works only from
// a session signed in with the 6-digit code (the database refuses it
// otherwise, with a message to show).
export async function adminSetMfaRequired(on) {
  return restCall("POST", "/rest/v1/rpc/admin_set_mfa_required", { p_on: !!on });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Members come with their private row embedded, so a status or email can
// never land on the wrong person. Since the 2026-10-20 database update the
// last activity is part of that private row, and LinkedIn links come from
// getProfileLinks (admins get every one); before it, both were columns of
// profiles (ADMIN_MEMBER_SELECT_BEFORE).
const ADMIN_MEMBER_SELECT = `select=${PROFILE_FIELDS},profile_private(email,verification_status,status,review_flag,last_active)`;
const ADMIN_MEMBER_SELECT_BEFORE = "select=*,profile_private(email,verification_status,status,review_flag)";

function adminMember(row) {
  const { profile_private: embedded, ...p } = row;
  const pp = (Array.isArray(embedded) ? embedded[0] : embedded) || {};
  return {
    ...p,
    email: pp.email || "",
    verification_status: pp.verification_status || "incomplete",
    status: pp.status || "active",
    review_flag: pp.review_flag || "",
    last_active: pp.last_active ?? p.last_active ?? null,
  };
}

// Members for the admin panel: query is the rest of the address (filter,
// order, limit). { rows, total }; total only when counted.
async function adminMemberRows(query, { counted = false } = {}, retried = false) {
  const get = async (select) => {
    const path = `/rest/v1/profiles?${select}&${query}`;
    return counted ? getCounted(path) : { rows: (await restCall("GET", path)) || [], total: null };
  };
  if (!knownMissing("admin_member_select")) {
    try {
      const res = await get(ADMIN_MEMBER_SELECT);
      const links = await getProfileLinks(res.rows.map((r) => r.id));
      return { ...res, rows: withLinks(res.rows, links).map(adminMember) };
    } catch (err) {
      if (!isMissingInDatabase(err)) throw err;
      missingSince.admin_member_select = Date.now();
    }
  }
  try {
    const res = await get(ADMIN_MEMBER_SELECT_BEFORE);
    return { ...res, rows: res.rows.map(adminMember) };
  } catch (err) {
    // The database had no last_active in profile_private a few minutes ago;
    // if the update has run since, select=* is refused: the new way, once.
    if (retried || !missingSince.admin_member_select) throw err;
    delete missingSince.admin_member_select;
    return adminMemberRows(query, { counted }, true);
  }
}

// A GET sent with "Prefer: count=exact": { rows, total }.
async function getCounted(path) {
  const res = await restRequest("GET", path, null, { Prefer: "count=exact" });
  const text = await res.text();
  return { rows: text ? JSON.parse(text) : [], total: totalFrom(res) };
}

// Open reports come oldest first, OPEN_REPORTS_PAGE at a time, reports about
// members and content apart from feedback (bug reports and ideas), so a
// flood of one can't hide the other or make the panel load everything.
export const OPEN_REPORTS_PAGE = 200;

// One page of open reports (feedback: bug reports and ideas, otherwise
// reports about members and content), oldest first, after the report
// "after" ({ created_at, id }) if given: { rows, total } (total: how many are
// open in all, counted with the first page only).
export async function adminGetOpenReports(feedback, after = null) {
  const kind = feedback ? `or=(reason.like.${BUG_REASON},reason.like.${IDEA_REASON})`
    : `reason=not.like.${BUG_REASON}&reason=not.like.${IDEA_REASON}`;
  let path = `/rest/v1/reports?select=*&status=eq.pending&${kind}&order=created_at.asc,id.asc&limit=${OPEN_REPORTS_PAGE}`;
  if (after) {
    const at = encodeURIComponent(`"${after.created_at}"`);
    path += `&and=(or(created_at.gt.${at},and(created_at.eq.${at},id.gt.${after.id})))`;
    return { rows: (await restCall("GET", path)) || [], total: null };
  }
  return getCounted(path);
}

// Handled reports stay on record, so only the newest are loaded.
export const HANDLED_REPORTS_SHOWN = 200;
// Feedback (bug reports and ideas) is kept apart from reports about members
// and content.
const BUG_REASON = encodeURIComponent("[BUG]*");
const IDEA_REASON = encodeURIComponent("[IDEA]*");

// Open reports a city's ambassador flagged to our team (reports.ambassador_city,
// since the 2026-10-27 database update), oldest first, so the panel shows
// them first even when they're newer than the first page of open reports.
// [] before that update.
async function adminFlaggedReports() {
  if (knownMissing("report_ambassador_city")) return [];
  try {
    return (await restCall("GET", `/rest/v1/reports?select=*&status=eq.pending&ambassador_city=neq.&order=created_at.asc,id.asc&limit=${OPEN_REPORTS_PAGE}`)) || [];
  } catch (err) {
    if (!isMissingInDatabase(err)) throw err;
    missingSince.report_ambassador_city = Date.now();
    return [];
  }
}

// users holds the newest 1,000 members; usersTotal is how many there are.
// reports holds the oldest 200 open member reports (openReportsTotal is how
// many are open) and the oldest 200 open bug reports and ideas
// (openFeedbackTotal), plus the newest 200 handled member reports
// (handledReportsTotal is how many there are) and the newest 200 handled bug
// reports (handledBugsTotal); newest first. More open ones:
// adminGetOpenReports.
export async function adminGetDashboardData() {
  const get = (path) => restCall("GET", path);
  const handled = `/rest/v1/reports?select=*&status=neq.pending&order=created_at.desc&limit=${HANDLED_REPORTS_SHOWN}`;
  const [members, groups, openReports, openFeedback, handledReports, handledBugs, posts, docs, events, helpRequests, marketItems, flagged] = await Promise.all([
    adminMemberRows("order=created_at.desc&limit=1000", { counted: true }),
    get("/rest/v1/groups?select=*&order=members_count.desc"),
    adminGetOpenReports(false),
    adminGetOpenReports(true),
    getCounted(`${handled}&reason=not.like.${BUG_REASON}&reason=not.like.${IDEA_REASON}`),
    getCounted(`${handled}&or=(reason.like.${BUG_REASON},reason.like.${IDEA_REASON})`),
    get("/rest/v1/posts?select=id,content,image_url,user_id,created_at&order=created_at.desc&limit=200"),
    get("/rest/v1/docs?select=id,title,excerpt,user_id&order=created_at.desc&limit=100"),
    get("/rest/v1/events?select=id,title,description,date,organizer_id&order=created_at.desc&limit=100"),
    get("/rest/v1/help_requests?select=id,title,description,user_id&order=created_at.desc&limit=100"),
    get("/rest/v1/marketplace?select=id,title,description,price,user_id,image_url&order=created_at.desc&limit=100"),
    adminFlaggedReports(),
  ]);
  const users = members.rows || [];
  // One list, newest first, each report once (one may have been handled
  // between the requests, and a flag from an ambassador can be in both
  // lists).
  const reports = [];
  const seen = new Set();
  [...handledReports.rows, ...handledBugs.rows, ...openReports.rows, ...flagged, ...openFeedback.rows].forEach((r) => {
    if (!seen.has(r.id)) { seen.add(r.id); reports.push(r); }
  });
  reports.sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  return {
    users,
    usersTotal: members.total ?? users.length,
    groups: groups || [],
    reports,
    openReportsTotal: openReports.total ?? openReports.rows.length,
    openFeedbackTotal: openFeedback.total ?? openFeedback.rows.length,
    // Where the next page of open reports starts (null: all are loaded).
    openReportsAfter: openReports.rows.length < OPEN_REPORTS_PAGE ? null : openReports.rows[openReports.rows.length - 1],
    openFeedbackAfter: openFeedback.rows.length < OPEN_REPORTS_PAGE ? null : openFeedback.rows[openFeedback.rows.length - 1],
    handledReportsTotal: handledReports.total ?? handledReports.rows.length,
    handledBugsTotal: handledBugs.total ?? handledBugs.rows.length,
    posts: posts || [],
    docs: docs || [],
    events: events || [],
    helpRequests: helpRequests || [],
    marketItems: marketItems || [],
  };
}

// Member counts from the server, however many members there are.
const VERIFICATION_STATUSES = ["incomplete", "pending", "needs_info", "approved", "rejected"];

export async function adminCountMembers() {
  const count = async (filter = "") => {
    const res = await restRequest("HEAD", `/rest/v1/profile_private?select=id${filter}`, null, { Prefer: "count=exact" });
    const total = totalFrom(res);
    if (total === null) throw new Error("Couldn't count the members.");
    return total;
  };
  const [total, blocked, ...byStatus] = await Promise.all([
    count(),
    count("&status=eq.blocked"),
    ...VERIFICATION_STATUSES.map((s) => count(`&verification_status=eq.${s}`)),
  ]);
  return { total, blocked, byStatus: Object.fromEntries(VERIFICATION_STATUSES.map((s, i) => [s, byStatus[i]])) };
}

// Reported content by kind, with the same fields as the previews in
// adminGetDashboardData ("marketplace" is accepted for "market"). Comments,
// answers, guide comments and places can be reported since the 2026-10-21
// database update, travel posts since the 2026-10-26 one; messages are read
// through adminGetReportedMessage.
const REPORTED_ITEMS = {
  post: ["posts", "id,content,image_url,user_id,created_at"],
  comment: ["comments", "id,content,post_id,user_id,created_at"],
  answer: ["help_responses", "id,content,request_id,user_id,created_at"],
  doc: ["docs", "id,title,excerpt,user_id"],
  doc_comment: ["doc_comments", "id,content,doc_id,user_id,created_at"],
  event: ["events", "id,title,description,date,organizer_id"],
  help: ["help_requests", "id,title,description,user_id"],
  market: ["marketplace", "id,title,description,price,user_id,image_url"],
  review: ["mentor_reviews", "id,rating,comment,mentee_id,mentor_id,created_at"],
  place: ["places", "id,name,kind,city,address,note,created_by,created_at"],
  travel: ["travel_posts", "id,kind,from_city,to_city,date_from,date_to,flight,help,note,user_id,created_at"],
};
REPORTED_ITEMS.marketplace = REPORTED_ITEMS.market;

// One reported item (or member, for "profile"), loaded by id so it can be
// shown before anything is done to it. null when it no longer exists.
export async function adminGetReportedItem(kind, id) {
  if (kind !== "profile" && !REPORTED_ITEMS[kind]) throw new Error(`Unknown kind of content: ${kind}`);
  if (!UUID.test(id || "")) return null;
  if (kind === "profile") {
    const { rows } = await adminMemberRows(`id=eq.${id}`);
    return rows[0] || null;
  }
  const [table, fields] = REPORTED_ITEMS[kind];
  const rows = await restCall("GET", `/rest/v1/${table}?id=eq.${id}&select=${fields}`);
  return rows?.[0] || null;
}

// The members who recommend a place (admins can see them), newest first.
export async function adminGetPlaceRecommenders(placeId) {
  if (!UUID.test(placeId || "")) return [];
  const rows = await restCall("GET", `/rest/v1/place_recommendations?place_id=eq.${placeId}&select=user_id,created_at,profiles:user_id(name)&order=created_at.desc&limit=100`);
  return (rows || []).map((r) => ({ id: r.user_id, name: r.profiles?.name || "", created_at: r.created_at }));
}

// A reported message (admins can't read messages otherwise): only the
// message the report is about. Since the 2026-10-21 database update; before
// it, null with missing set.
export async function adminGetReportedMessage(reportId) {
  try {
    const rows = await restCall("POST", "/rest/v1/rpc/admin_get_reported_message", { p_report: reportId });
    return rows?.[0] || null;
  } catch (err) {
    if (isMissingInDatabase(err)) return { missing: true };
    throw err;
  }
}

// RLS turns a forbidden write into a silent no-op, so ask for the changed
// rows back and treat "none" as a failure.
async function adminWrite(method, path, body = null) {
  const rows = await restCall(method, path, body, { Prefer: "return=representation" });
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Nothing was changed. It may already have been handled, or this account is no longer an admin.");
  }
  return rows;
}

// Before the 2026-10-21 database update only: block / unblock by writing the
// status. Since then admins can't write members' rows (adminModerate).
export async function adminSetMemberStatus(userId, status) {
  return adminWrite("PATCH", `/rest/v1/profile_private?id=eq.${userId}`, { status });
}

// Members and activity per city group (admins only).
export async function adminCityStats() {
  return (await restCall("POST", "/rest/v1/rpc/admin_city_stats", {})) || [];
}

// A function of the 2026-10-21 database update, or `old()` (the way the
// panel did it before) while the database doesn't have it yet. old()
// returns what the function would, or throws.
async function adminRpc(name, body, old) {
  if (!knownMissing(name)) {
    try {
      return await restCall("POST", `/rest/v1/rpc/${name}`, body);
    } catch (err) {
      if (!isMissingInDatabase(err) || !old) throw err;
      missingSince[name] = Date.now();
    }
  }
  if (!old) throw new Error("This needs the database update of 21 October 2026.");
  return old();
}

// Whether the database has the 2026-10-21 moderation functions: our team's
// decisions then reach the members concerned in the app (statements of
// reasons, report outcomes) and are recorded. Before it, the panel acts as
// before and says that the members aren't told.
export async function adminHasModeration() {
  if (knownMissing("admin_member_overview")) return false;
  try {
    await restCall("POST", "/rest/v1/rpc/admin_member_overview", { p_member: "00000000-0000-0000-0000-000000000000" });
    return true;
  } catch (err) {
    if (!isMissingInDatabase(err)) throw err;
    missingSince.admin_member_overview = Date.now();
    return false;
  }
}

// What the panel shows with a member: { is_admin, is_me, upcoming_sessions
// (mentoring sessions they give), free_slots, open_reports (about them or
// their content), open_profile_reports, last_warning_at, history: [{
// created_at, action, kind, ground, rule, explanation, urgent, source, by }]
// }. null before the 2026-10-21 database update.
export async function adminMemberOverview(memberId) {
  if (!UUID.test(memberId || "")) return null;
  try {
    return await adminRpc("admin_member_overview", { p_member: memberId }, () => null);
  } catch (err) {
    return null;
  }
}

const MODERATED_TABLES = {
  post: "posts", comment: "comments", answer: "help_responses", doc: "docs", doc_comment: "doc_comments",
  event: "events", help: "help_requests", market: "marketplace", review: "mentor_reviews", place: "places",
  travel: "travel_posts",
};

// One decision of our team on a member's content or account
// (public.admin_moderate): kind ("post", "comment", "answer", "doc",
// "doc_comment", "event", "help", "market", "review", "place", "travel",
// "message", "place_recommendation" with member, "profile_photo", "profile_bio" or
// "member"), id, action ("remove", "warn", "block", "unblock"), ground
// ("terms" or "illegal"), rule (the rule in the Terms, or the law), facts
// (finishing "because ..."), reportIds (the reports it answers; every other
// open report about the same item is closed with them), urgent (for a block
// without an earlier warning), notice (a report from the public page).
// The database records it, tells the member why and the reporters what was
// decided: { action_id, statement, closed_reports, cancelled_sessions }.
// Before the 2026-10-21 database update it's done the old way (reports
// closed first, then the content deleted or the status written), nobody is
// told, and the answer has fallback set.
export async function adminModerate({ kind, id, action, ground = null, rule = "", facts = "", reportIds = [], urgent = null, notice = null, member = null }) {
  const body = {
    p_kind: kind, p_id: id, p_action: action, p_ground: ground, p_rule: rule, p_explanation: facts,
    p_report_ids: (reportIds || []).filter((r) => UUID.test(r || "")),
  };
  if (urgent) body.p_urgent = urgent;
  if (notice) body.p_notice = notice;
  if (member) body.p_member = member;
  return adminRpc("admin_moderate", body, async () => {
    if (notice || action === "warn" || kind === "message" || kind === "place_recommendation") {
      throw new Error("This needs the database update of 21 October 2026.");
    }
    // Close the reports first, so a decision another admin took meanwhile
    // stops this one.
    let claimed = [];
    if (body.p_report_ids.length) {
      claimed = await adminSetReportStatus(body.p_report_ids, "resolved");
      if (!claimed.length) throw new Error("These reports were already handled by someone else. Reload to see the latest.");
    }
    try {
      if (kind === "member") await adminSetMemberStatus(id, action === "block" ? "blocked" : "active");
      else if (kind === "profile_photo") await adminWrite("PATCH", `/rest/v1/profiles?id=eq.${id}&select=id`, { avatar_url: "" });
      else if (kind === "profile_bio") await adminWrite("PATCH", `/rest/v1/profiles?id=eq.${id}&select=id`, { bio: "" });
      else if (MODERATED_TABLES[kind]) await adminWrite("DELETE", `/rest/v1/${MODERATED_TABLES[kind]}?id=eq.${id}`);
      else throw new Error(`Cannot moderate ${kind}`);
    } catch (err) {
      if (claimed.length) await adminReopenReports(claimed.map((r) => r.id), "resolved").catch(() => {});
      throw err;
    }
    return { fallback: true, closed_reports: claimed.map((r) => r.id), statement: "", cancelled_sessions: 0 };
  });
}

// Makes a member the NRIClub ambassador for a city ('' to stop). Recorded
// since the 2026-10-21 database update.
export async function adminSetAmbassador(userId, city) {
  return adminRpc("admin_set_ambassador", { p_member: userId, p_city: city },
    () => adminWrite("PATCH", `/rest/v1/profiles?id=eq.${userId}&select=id,ambassador_city`, { ambassador_city: city }));
}

// The city ambassadors and what they did, for Ambassadors: { version,
// ambassadors: [{ id, name, city, since, agreement_version,
// agreement_accepted_at, current, welcomed_30d, last_activity_at }], log:
// [{ id, ambassador_id, name, city, action, detail, at }] }. null before the
// 2026-10-27 database update.
export async function adminAmbassadorActivity(limit = 200) {
  if (knownMissing("admin_ambassador_activity")) return null;
  try {
    return await restCall("POST", "/rest/v1/rpc/admin_ambassador_activity", { p_limit: limit });
  } catch (err) {
    if (!panelMissing(err)) throw err;
    missingSince.admin_ambassador_activity = Date.now();
    return null;
  }
}

// The city ambassadors as the profiles say (admins read every profile):
// [{ id, name, ambassador_city }], for when adminAmbassadorActivity isn't
// there yet.
export async function adminAmbassadorProfiles() {
  return (await restCall("GET", "/rest/v1/profiles?ambassador_city=neq.&select=id,name,ambassador_city&order=ambassador_city.asc&limit=1000")) || [];
}

// Members waiting for a decision (or any other verification statuses), with
// everything needed to decide: email, LinkedIn or note, voucher, duplicates.
// All of them, up to 1,000 (the API's limit).
export async function adminVerificationQueue(statuses = ["pending"]) {
  return restCall("POST", "/rest/v1/rpc/admin_verification_queue", { p_statuses: statuses });
}

// One page of a verification list (see adminVerificationQueue): limit
// members from offset. Waiting members come oldest first, approved and
// rejected ones newest decision first, unfinished sign-ups newest first.
// { rows, total, paged }. Before the 2026-10-23 database update there are
// no pages: the first call gets the whole list (up to 1,000; total is its
// length) and paged is false.
export const VERIFICATION_PAGE = 200;
export async function adminVerificationPage(status, offset = 0, limit = VERIFICATION_PAGE) {
  if (!knownMissing("queue_pages")) {
    try {
      const rows = (await restCall("POST", "/rest/v1/rpc/admin_verification_queue", { p_statuses: [status], p_limit: limit, p_offset: offset })) || [];
      const total = rows.length ? Number(rows[0].total_count) : null;
      return { rows, total: Number.isFinite(total) ? total : (offset === 0 ? rows.length : null), paged: true };
    } catch (err) {
      if (!isMissingInDatabase(err)) throw err;
      missingSince.queue_pages = Date.now();
    }
  }
  if (offset > 0) return { rows: [], total: null, paged: false };
  const rows = (await adminVerificationQueue([status])) || [];
  return { rows, total: rows.length, paged: false };
}

// One member's row of the review queue (what the peek shows: email,
// LinkedIn or note, voucher, duplicates, hold), or null. status: their
// verification status, used before the 2026-10-23 database update, when the
// row can only be found in that status's whole list.
export async function adminMemberDetails(memberId, status) {
  if (!UUID.test(memberId || "")) return null;
  if (!knownMissing("queue_pages")) {
    try {
      const rows = await restCall("POST", "/rest/v1/rpc/admin_verification_queue", { p_statuses: null, p_ids: [memberId], p_limit: 1 });
      return (rows || [])[0] || null;
    } catch (err) {
      if (!isMissingInDatabase(err)) throw err;
      missingSince.queue_pages = Date.now();
    }
  }
  const rows = (await adminVerificationQueue([status || "pending"])) || [];
  return rows.find((r) => r.id === memberId) || null;
}

// Searches every member, not only the newest loaded in the panel
// (public.admin_search_members): query matches part of the name, email
// address, city or place; status a verification status; blocked true or
// false; null for any. { members, total }, members shaped like the panel's
// other member rows, newest first. null before the 2026-10-23 database
// update (no such function): the panel then searches the members it has.
export const SEARCH_PAGE = 100;
export async function adminSearchMembers({ query = "", status = null, blocked = null, limit = SEARCH_PAGE, offset = 0 } = {}) {
  if (knownMissing("admin_search")) return null;
  try {
    const res = (await restCall("POST", "/rest/v1/rpc/admin_search_members", {
      p_query: String(query || "").slice(0, 200), p_status: status, p_blocked: blocked, p_limit: limit, p_offset: offset,
    })) || {};
    return { members: (res.members || []).map(adminMember), total: Number(res.total) || 0 };
  } catch (err) {
    if (!isMissingInDatabase(err)) throw err;
    missingSince.admin_search = Date.now();
    return null;
  }
}

// decision: "approved" | "needs_info" | "rejected" | "pending" (reopen/undo)
// | "incomplete" (a rejected member who never sent their details goes back
// to unfinished). needs_info and rejected require a message, which the
// member sees.
// expected = { name, linkedinUrl, status } as the admin saw them: the
// database refuses the decision if the member's name, LinkedIn or
// verification status has changed since (its message says so; reload them).
export async function adminReviewMember(memberId, decision, message = "", adminNote = "", expected = null) {
  const body = { p_member: memberId, p_decision: decision, p_message: message, p_admin_note: adminNote };
  if (expected?.name != null) body.p_expected_name = expected.name;
  if (expected?.linkedinUrl != null) body.p_expected_linkedin = expected.linkedinUrl;
  if (expected?.status != null) body.p_expected_status = expected.status;
  return restCall("POST", "/rest/v1/rpc/review_member", body);
}

// A community: action "approve" or "reject" (a request that is still
// waiting), "unapprove" (Undo of an approval, while nobody has joined or
// posted), "delete" (a live community; reason needed). The member who asked
// for it is told. Recorded since the 2026-10-21 database update; before it,
// written directly as the panel did.
export async function adminSetGroup(group, action, reason = "") {
  return adminRpc("admin_set_group", { p_group: group.id, p_action: action, p_reason: reason }, async () => {
    if (action === "approve") {
      await adminWrite("PATCH", `/rest/v1/groups?id=eq.${group.id}&is_approved=eq.false`, { is_approved: true });
      if (group.created_by) { try { await adminNotify(group.created_by, "group", `Your community "${group.name}" has been approved!`); } catch { /* the approval itself worked */ } }
    } else if (action === "unapprove") {
      await adminWrite("PATCH", `/rest/v1/groups?id=eq.${group.id}&is_approved=eq.true&members_count=eq.0`, { is_approved: false });
    } else if (action === "reject") {
      await adminWrite("DELETE", `/rest/v1/groups?id=eq.${group.id}&is_approved=eq.false`);
      if (group.created_by) { try { await adminNotify(group.created_by, "group", `Your community request "${group.name}" was not approved.${reason ? ` Reason: ${reason}.` : ""}`); } catch { /* the rejection itself worked */ } }
    } else if (action === "delete") {
      await adminWrite("DELETE", `/rest/v1/groups?id=eq.${group.id}`);
      if (group.created_by) { try { await adminNotify(group.created_by, "group", `We deleted the community "${group.name}" because ${reason}. Think we got it wrong? Write to hello@nriclub.app.`); } catch { /* the deletion itself worked */ } }
    }
    return null;
  });
}

// Before the 2026-10-21 database update: marks reports as handled
// ("reviewed": dismissed, "resolved": acted on) by writing their status.
// They stay on record and show under Handled. Only reports that are still
// open change, so a panel that's out of date can't overwrite another
// admin's decision. Returns the reports that changed. Since that update this
// is only for feedback (bug reports and ideas); reports about members and
// content are closed with adminCloseReports or adminModerate.
export async function adminSetReportStatus(reportIds, status) {
  if (status !== "reviewed" && status !== "resolved") throw new Error(`Unknown report status: ${status}`);
  const ids = (Array.isArray(reportIds) ? reportIds : [reportIds]).filter((id) => UUID.test(id || ""));
  if (!ids.length) throw new Error("No reports to update.");
  const rows = await restCall("PATCH", `/rest/v1/reports?id=in.(${ids.join(",")})&status=eq.pending`, { status }, { Prefer: "return=representation" });
  return Array.isArray(rows) ? rows : [];
}

// Closes reports about members and content without acting on what they're
// about. status "reviewed": we kept it (reason finishes "because ..."),
// "resolved": it's already gone. The members who sent them are told why.
// Returns the reports that were still open (none: someone else handled them
// first). Before the 2026-10-21 database update, the status is written and
// nobody is told.
export async function adminCloseReports(reportIds, status, reason) {
  const ids = (Array.isArray(reportIds) ? reportIds : [reportIds]).filter((id) => UUID.test(id || ""));
  if (!ids.length) throw new Error("No reports to update.");
  const rows = await adminRpc("admin_close_reports", { p_ids: ids, p_status: status, p_reason: reason },
    () => adminSetReportStatus(ids, status));
  return Array.isArray(rows) ? rows : [];
}

// Opens reports again that were just closed with status (an Undo, or when
// the action they were closed for failed), and takes back the outcome their
// senders were sent. Only reports still in that status change. Returns them.
export async function adminReopenReports(reportIds, status) {
  if (status !== "reviewed" && status !== "resolved") throw new Error(`Unknown report status: ${status}`);
  const ids = reportIds.filter((id) => UUID.test(id || ""));
  if (!ids.length) return [];
  const rows = await adminRpc("admin_reopen_reports", { p_ids: ids, p_status: status },
    () => restCall("PATCH", `/rest/v1/reports?id=in.(${ids.join(",")})&status=eq.${status}`, { status: "pending" }, { Prefer: "return=representation" }));
  return Array.isArray(rows) ? rows : [];
}

// Our team's notes on reports, { [report id]: note } (e.g. which police
// authority they told about a safety report, and when). null before the
// 2026-10-21 database update, which has nowhere to keep them.
export async function adminReportNotes(reportIds) {
  const ids = (reportIds || []).filter((id) => UUID.test(id || ""));
  if (!ids.length) return {};
  try {
    const rows = await adminRpc("admin_report_notes", { p_ids: ids }, () => null);
    return rows ? Object.fromEntries(rows.map((r) => [r.report_id, r.note])) : null;
  } catch {
    return null;
  }
}

export async function adminSetReportNote(reportId, note) {
  return adminRpc("admin_set_report_note", { p_report: reportId, p_note: note });
}

// Reports from the public page (nriclub.app/report): open ones oldest
// first, then the newest closed ones. null before the 2026-10-21 database
// update (reports then arrive by email only).
export async function adminNotices() {
  try {
    return await adminRpc("admin_notices", {}, () => null);
  } catch (err) {
    if (isMissingInDatabase(err)) return null;
    throw err;
  }
}

// A step on a notice: "receipt_sent" / "decision_sent" (our team emailed
// the sender), "decide" (decision "kept", with reason), "reopen", "note".
export async function adminUpdateNotice(noticeId, step, decision = null, reason = null) {
  return adminRpc("admin_update_notice", { p_notice: noticeId, p_step: step, p_decision: decision, p_reason: reason });
}

// Applications to be a city ambassador, newest first: status null (all),
// "new", "contacted", "accepted", "declined" or "open" (new and contacted),
// a page of limit from offset. Returns { total, counts: { new, contacted,
// accepted, declined }, applications: [{ id, reference, created_at, name,
// email, city, country, organisation, linkedin_url, motivation,
// hours_per_week, status, decided_at, decided_by_name, admin_note, member:
// { id, name, status, verification_status, ambassador_city } | null,
// email_member: the same, for an account that uses the address of an
// application without one | null }] }. null before the 2026-10-24
// database update (applications then arrive by email).
export const AMBASSADOR_PAGE = 50;

export async function adminAmbassadorApplications({ status = null, limit = AMBASSADOR_PAGE, offset = 0 } = {}) {
  if (knownMissing("admin_ambassador_applications")) return null;
  try {
    return await restCall("POST", "/rest/v1/rpc/admin_ambassador_applications", { p_status: status, p_limit: limit, p_offset: offset });
  } catch (err) {
    if (!isMissingInDatabase(err)) throw err;
    missingSince.admin_ambassador_applications = Date.now();
    return null;
  }
}

// Our team's step on an application: status "contacted", "accepted",
// "declined" (or "contacted" again to reopen one), note (not null: replaces
// the note), city (when accepting: the city they become ambassador for, if
// not the one they wrote). Returns the application with outcome:
// "ambassador_set", "already_ambassador", "no_account", "not_approved" or
// null.
export async function adminUpdateAmbassadorApplication(id, { status = null, note = null, city = null } = {}) {
  return restCall("POST", "/rest/v1/rpc/admin_update_ambassador_application", {
    p_application: id, p_status: status, p_note: note, p_city: city,
  });
}

// The photo clean-up: deletes photo files nothing uses any more (of deleted
// posts, listings, events and accounts, replaced profile photos, content our
// team removed), which public.admin_storage_orphans lists, through the
// Storage API with the admin's own session. The database lets an admin
// delete a file only while nothing uses it. auto: only if no admin has run
// today's automatic clean-up yet (public.admin_photo_cleanup_due); then
// null when there was nothing to run. Returns { deleted: [{ bucket, name,
// reason }], failed: n } (reason: "account_deleted" or "unused"). Before the
// 2026-10-22 database update: auto does nothing (null), otherwise it throws
// an error with missing: true. An automatic run that took today's turn and
// then failed throws an error with claimed: true (no other admin runs it
// today, so the panel says so).
export const PHOTO_CLEANUP_PAGE = 200;

export async function adminCleanUpPhotoFiles({ auto = false } = {}) {
  const missing = (err) => {
    if (!isMissingInDatabase(err)) {
      if (auto && err) err.claimed = true;
      return err;
    }
    const e = new Error("The photo clean-up needs the database update of 22 October 2026 (20261022000000_storage_images.sql).");
    e.missing = true;
    return e;
  };
  if (auto) {
    try {
      if (!await restCall("POST", "/rest/v1/rpc/admin_photo_cleanup_due", {})) return null;
    } catch (err) {
      if (isMissingInDatabase(err)) return null;
      throw err;
    }
  }
  const deleted = [];
  let failed = 0;
  const tried = new Set();
  for (let round = 0; round < 50; round += 1) {
    let rows;
    try {
      rows = (await restCall("POST", "/rest/v1/rpc/admin_storage_orphans", { p_limit: PHOTO_CLEANUP_PAGE })) || [];
    } catch (err) {
      throw missing(err);
    }
    // Files that couldn't be deleted come back: they aren't tried again.
    const fresh = rows.filter((r) => !tried.has(`${r.bucket_id}/${r.name}`));
    if (!fresh.length) break;
    const byBucket = {};
    fresh.forEach((r) => {
      tried.add(`${r.bucket_id}/${r.name}`);
      (byBucket[r.bucket_id] = byBucket[r.bucket_id] || []).push(r);
    });
    for (const [bucket, files] of Object.entries(byBucket)) {
      let gone = new Set();
      try { gone = new Set(await deleteStorageObjects(bucket, files.map((f) => f.name))); } catch (e) {}
      files.forEach((f) => {
        if (gone.has(f.name)) deleted.push({ bucket, name: f.name, reason: f.reason });
        else failed += 1;
      });
    }
    if (rows.length < PHOTO_CLEANUP_PAGE) break;
  }
  return { deleted, failed };
}

export async function adminNotify(userId, type, text) {
  return restCall("POST", "/rest/v1/notifications", { user_id: userId, type, text });
}

// ---- Admin tools of the 2026-10-25 update: decision emails, deleting
// unfinished sign-ups, What's on, the Inbox (supabase/functions/*,
// 20261025100000_admin_tools.sql) ----

// One of our Edge Functions, with the admin's session. Throws with the
// function's own message; unreachable is set when there was no answer at
// all (no connection, or the function isn't deployed yet: Supabase's "not
// found" carries no CORS headers, so the browser sees no answer either).
// keepalive: the request may finish after the page closes. body null: a GET.
async function adminFunction(name, body, { keepalive = false } = {}) {
  const send = () => fetch(`${SUPABASE_URL}/functions/v1/${name}`, body === null
    ? { method: "GET", headers: headers() }
    : { method: "POST", keepalive, headers: headers(), body: JSON.stringify(body) });
  let res;
  try {
    res = await send();
    if (res.status === 401 && accessToken && !keepalive && await refreshSession()) res = await send();
  } catch {
    const err = new Error("Couldn't reach the server. It may not be set up yet, or the connection dropped.");
    err.unreachable = true;
    throw err;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `The server said no (${res.status}).`);
    err.status = res.status;
    err.unreachable = res.status === 404;
    throw err;
  }
  return data;
}

// The email to a member about our team's decision ("approved",
// "needs_info", "rejected" or "blocked"); the database decides what it says
// and sends it once per decision. { sent: true }.
export function sendMemberEmail(memberId, kind, { keepalive = false } = {}) {
  return adminFunction("member-email", { member_id: memberId, kind }, { keepalive });
}

// How many emails Resend has counted: { monthly_used, daily_used (free
// plan only), observed_at }, or null while not known. Asks member-email to
// refresh it from Resend; without that function, the last counts the
// database has; before the 2026-10-25 database update, null.
export async function adminEmailQuota() {
  try {
    const res = await adminFunction("member-email?quota=1", null);
    if (res?.quota) return res.quota;
  } catch { /* the database's last counts, below */ }
  try {
    return await restCall("POST", "/rest/v1/rpc/admin_resend_quota", {});
  } catch (err) {
    if (isMissingInDatabase(err)) return null;
    throw err;
  }
}

// Deletes an account that never finished signing up (the database checks).
// { deleted, recorded }.
export function adminDeleteSignup(memberId) {
  return adminFunction("admin-delete-signup", { member_id: memberId });
}

// What's on events our team added in the admin panel, still to come and not
// hidden, as items of src/content/whatson.js. Anyone can read them. Throws
// before the 2026-10-25 database update (no such table): the site then
// shows the list in the code only.
export async function getWhatsOnEvents() {
  const rows = await restCall("GET", `/rest/v1/whats_on_events?select=${WHATS_ON_COLUMNS}&order=start_date.asc&limit=500`);
  return Array.isArray(rows) ? rows : [];
}
export const WHATS_ON_COLUMNS = "id,title,category,start_date,end_date,event_time,city,venue,area,organiser,price,language,summary,url";

// Every event in the table for the admin panel: { upcoming, past }, each an
// item of src/content/whatson.js plus hidden. null before the database update.
export async function adminWhatsOnEvents() {
  try {
    return await restCall("POST", "/rest/v1/rpc/admin_whats_on_events", {});
  } catch (err) {
    if (isMissingInDatabase(err)) return null;
    throw err;
  }
}

// Adds (isNew) or changes an event: an item of src/content/whatson.js.
export async function adminSaveWhatsOnEvent(event, isNew) {
  return restCall("POST", "/rest/v1/rpc/admin_save_whats_on_event", { p_event: event, p_new: !!isNew });
}
export async function adminHideWhatsOnEvent(id, hidden) {
  return restCall("POST", "/rest/v1/rpc/admin_hide_whats_on_event", { p_id: id, p_hidden: !!hidden });
}
export async function adminDeleteWhatsOnEvent(id) {
  return restCall("POST", "/rest/v1/rpc/admin_delete_whats_on_event", { p_id: id });
}

// The Inbox (mail to hello@nriclub.app): filter "inbox" (not archived,
// unread first), "unread", "archived" or "all"; query finds part of the
// sender, subject or text. { messages, total, unread }, or null before the
// database update.
export const INBOX_PAGE = 50;
export async function adminInboxList({ filter = "inbox", query = "", offset = 0, limit = INBOX_PAGE } = {}) {
  if (knownMissing("admin_inbox_list")) return null;
  try {
    return await restCall("POST", "/rest/v1/rpc/admin_inbox_list", {
      p_filter: filter, p_limit: limit, p_offset: offset, p_query: String(query || "").slice(0, 200),
    });
  } catch (err) {
    if (!isMissingInDatabase(err)) throw err;
    missingSince.admin_inbox_list = Date.now();
    return null;
  }
}
// One message, with its text and our replies; marks it read.
export async function adminInboxGet(id) {
  return restCall("POST", "/rest/v1/rpc/admin_inbox_get", { p_id: id });
}
// Archive or bring back (archived), mark read or unread (read); null leaves it.
export async function adminInboxSet(id, { archived = null, read = null } = {}) {
  return restCall("POST", "/rest/v1/rpc/admin_inbox_set", { p_id: id, p_archived: archived, p_read: read });
}
// Sends our reply from hello@nriclub.app. { sent, reply: { id, body, sent_at, by } | null }.
export function adminInboxReply(messageId, body) {
  return adminFunction("admin-inbox-reply", { message_id: messageId, body });
}

// ---- Members' progress: sign-up stages, profile completeness and profile
// reminders (20261028000000_profile_completeness.sql). Each returns null
// before that database update. ----

// Accounts by sign-up stage: { counts: { unconfirmed, unfinished, pending,
// needs_info, approved, rejected, blocked }, total, members } (members: the
// accounts at stage, a page from offset, matching query).
export const PROGRESS_PAGE = 50;
export async function adminSignupStages({ stage = null, query = "", offset = 0, limit = PROGRESS_PAGE } = {}) {
  if (knownMissing("admin_signup_stages")) return null;
  try {
    return await restCall("POST", "/rest/v1/rpc/admin_signup_stages", {
      p_stage: stage, p_query: String(query || "").slice(0, 200), p_limit: limit, p_offset: offset,
    });
  } catch (err) {
    if (!isMissingInDatabase(err)) throw err;
    missingSince.admin_signup_stages = Date.now();
    return null;
  }
}

// How complete approved members' profiles are: { approved, levels, missing,
// average, cities, total, recent, complete, members } for level (items
// filled, 0-7), missing (an item's key), city and query, a page from
// offset. idsOnly: ids (every match, at most 5,000) instead of members.
export async function adminProfileCompleteness({ level = null, missing = null, city = null, query = "", offset = 0, limit = PROGRESS_PAGE, idsOnly = false } = {}) {
  if (knownMissing("admin_profile_completeness")) return null;
  try {
    return await restCall("POST", "/rest/v1/rpc/admin_profile_completeness", {
      p_level: level, p_missing: missing, p_city: city, p_query: String(query || "").slice(0, 200),
      p_limit: limit, p_offset: offset, p_ids_only: !!idsOnly,
    });
  } catch (err) {
    if (!isMissingInDatabase(err)) throw err;
    missingSince.admin_profile_completeness = Date.now();
    return null;
  }
}

// Sends members a reminder about their profile in the app: kind "general"
// or an item's key, with its words ({ text, words } from
// src/content/profileReminders.js). The database skips members reminded in
// the last 7 days, those with nothing to remind them of, and those who
// aren't approved. Sent in batches of 500. { sent, skipped, skipped_recent,
// skipped_complete, skipped_not_eligible, sent_to, sent_at }. If a batch
// fails, the error has partial: what the batches before it did.
export const REMINDER_BATCH = 500;
export async function adminSendProfileReminders(memberIds, kind, { text, words = {} }) {
  const total = { sent: 0, skipped: 0, skipped_recent: 0, skipped_complete: 0, skipped_not_eligible: 0, sent_to: [], sent_at: null };
  for (let i = 0; i < memberIds.length; i += REMINDER_BATCH) {
    let res;
    try {
      res = await restCall("POST", "/rest/v1/rpc/admin_send_profile_reminders", {
        p_members: memberIds.slice(i, i + REMINDER_BATCH), p_kind: kind, p_text: text, p_words: words,
      });
    } catch (err) {
      if (i > 0) err.partial = total;
      throw err;
    }
    for (const k of ["sent", "skipped", "skipped_recent", "skipped_complete", "skipped_not_eligible"]) total[k] += Number(res?.[k]) || 0;
    total.sent_to.push(...(res?.sent_to || []));
    total.sent_at = res?.sent_at || total.sent_at;
  }
  return total;
}

// ---- Public city pages (work without signing in; counts only) ----
export async function getCitySummary(city) {
  return restCall("POST", "/rest/v1/rpc/city_summary", { p_city: city });
}
export async function getPublicCities() {
  return (await restCall("POST", "/rest/v1/rpc/public_cities", {})) || [];
}

// ============================================================================
// MENTORING (open times, sessions, reviews)
// ============================================================================

// Open times from now on (all mentors, or one).
// (Bookings close 30 minutes before a session, so those aren't listed.)
export async function getMentorSlots(mentorId = null) {
  let url = `/rest/v1/mentor_slots?booked=eq.false&starts_at=gt.${encodeURIComponent(new Date(Date.now() + 31 * 60000).toISOString())}&select=id,mentor_id,starts_at,duration_min&order=starts_at.asc&limit=500`;
  if (mentorId) url += `&mentor_id=eq.${encodeURIComponent(mentorId)}`;
  return (await restCall("GET", url)) || [];
}

// The mentor's own times (free and booked) from now on.
export async function getMyMentorSlots() {
  if (!currentUser) return [];
  return (await restCall("GET", `/rest/v1/mentor_slots?mentor_id=eq.${currentUser.id}&starts_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&order=starts_at.asc`)) || [];
}

export async function addMentorSlots(times) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/mentor_slots", times.map(t => ({ mentor_id: currentUser.id, starts_at: t.starts_at, duration_min: t.duration_min })), { Prefer: "return=representation" });
}

export async function deleteMentorSlot(id) {
  const rows = await restCall("DELETE", `/rest/v1/mentor_slots?id=eq.${encodeURIComponent(id)}`, null, { Prefer: "return=representation" });
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("That time is booked or already gone.");
}

// Sessions the member is in (as mentor or as the one being helped).
export async function getMySessions() {
  if (!currentUser) return [];
  const rows = await restCall("GET", `/rest/v1/mentor_bookings?or=(mentor_id.eq.${currentUser.id},mentee_id.eq.${currentUser.id})&select=*,mentor:mentor_id(id,name,avatar_url),mentee:mentee_id(id,name,avatar_url)&order=starts_at.desc&limit=100`);
  return withPerson(withPerson(rows, "mentor", "mentor_id"), "mentee", "mentee_id") || [];
}

export async function bookMentorSession(slotId, topic, note) {
  return restCall("POST", "/rest/v1/rpc/book_mentor_session", { p_slot: slotId, p_topic: topic || "", p_note: note || "" });
}

export async function cancelMentorSession(bookingId, reason) {
  return restCall("POST", "/rest/v1/rpc/cancel_mentor_session", { p_booking: bookingId, p_reason: reason || "" });
}

export async function setSessionLink(bookingId, link) {
  return restCall("POST", "/rest/v1/rpc/set_session_link", { p_booking: bookingId, p_link: link || "" });
}

export async function reviewMentorSession(bookingId, rating, comment) {
  return restCall("POST", "/rest/v1/rpc/review_mentor_session", { p_booking: bookingId, p_rating: rating, p_comment: comment || "" });
}

// { [mentor id]: { rating, reviews } }
export async function getMentorRatings() {
  const rows = (await restCall("POST", "/rest/v1/rpc/mentor_ratings", {})) || [];
  return Object.fromEntries(rows.map(r => [r.mentor_id, { rating: Number(r.rating), reviews: r.reviews }]));
}

export async function getMentorReviews(mentorId) {
  return withPerson(await restCall("GET", `/rest/v1/mentor_reviews?mentor_id=eq.${encodeURIComponent(mentorId)}&select=*,mentee:mentee_id(id,name,avatar_url)&order=created_at.desc&limit=50`), "mentee", "mentee_id") || [];
}

// The reviews the member wrote (booking ids), to know which sessions are rated.
export async function getMyReviews() {
  if (!currentUser) return [];
  return (await restCall("GET", `/rest/v1/mentor_reviews?mentee_id=eq.${currentUser.id}&select=id,booking_id,rating,comment`)) || [];
}

export async function deleteMyReview(id) {
  return restCall("DELETE", `/rest/v1/mentor_reviews?id=eq.${encodeURIComponent(id)}&mentee_id=eq.${currentUser?.id}`);
}

// Verified mentors, and members looking for a mentor (their own lists, not
// limited to the newest members Find loads).
const MENTORING_FIELDS = "id,name,avatar_url,profession,location,city,linkedin_verified,mentor_open,mentor_areas,mentee_open,mentee_needs";
export async function getMentors() {
  return (await restCall("GET", `/rest/v1/profiles?mentor_open=eq.true&linkedin_verified=eq.true&select=${MENTORING_FIELDS}&limit=500`)) || [];
}
export async function getSeekers() {
  return (await restCall("GET", `/rest/v1/profiles?mentee_open=eq.true&select=${MENTORING_FIELDS}&order=updated_at.desc&limit=200`)) || [];
}

// { [mentor id]: their next open time }
export async function getMentorNextSlots() {
  const rows = (await restCall("POST", "/rest/v1/rpc/mentor_next_slots", {})) || [];
  return Object.fromEntries(rows.map(r => [r.mentor_id, { id: r.slot_id, starts_at: r.starts_at, duration_min: r.duration_min }]));
}
