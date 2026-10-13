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
  // Supabase answers an existing email with empty identities instead of an
  // error; the user object is top-level when email confirmation is on.
  const signedUpUser = data.user || data;
  if (Array.isArray(signedUpUser?.identities) && signedUpUser.identities.length === 0) {
    throw new Error("An account with this email already exists. Please log in instead.");
  }
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
const RESET_REQUEST_KEY = "nriclub_reset_requested";
const RESET_REQUEST_MS = 24 * 60 * 60 * 1000;

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
// Auth answers an expired token) 403 with error_code "bad_jwt".
function isRefusedToken(res, data) {
  return res.status === 401 || data.error_code === "bad_jwt" || /\bbad_jwt\b|invalid jwt/i.test(data.msg || data.message || "");
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
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || fallback);
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
    if (!res.ok) throw new Error(data.msg || data.error_description || data.message || "Couldn't update your password.");
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

// ============================================================================
// PROFILES
// ============================================================================

export async function getProfile(userId) {
  const data = await restCall("GET", `/rest/v1/profiles?id=eq.${userId}&select=*`);
  return data?.[0] || null;
}

// Email, consent and verification status live in profile_private, which
// only the owner and admins can read; the app still sees them as fields of
// the user's own profile.
const PRIVATE_PROFILE_FIELDS = ["email", "gdpr_consent", "gdpr_consent_date", "marketing_consent"];

// Throws if the private row can't be read: without it the member would look
// like a new, unverified, unblocked account. Callers keep what they have.
export async function getMyProfile() {
  if (!currentUser) return null;
  restCall("PATCH", `/rest/v1/profiles?id=eq.${currentUser.id}`, { last_active: new Date().toISOString() }).catch(() => {});
  const [profile, privateRows] = await Promise.all([
    getProfile(currentUser.id),
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
  delete privateUpdates.gdpr_consent_date;
  delete publicUpdates.email_verified;
  if (Object.keys(privateUpdates).length) {
    await restCall("PATCH", `/rest/v1/profile_private?id=eq.${currentUser.id}`, privateUpdates);
  }
  if (!Object.keys(publicUpdates).length) return [];
  return restCall("PATCH", `/rest/v1/profiles?id=eq.${currentUser.id}`, publicUpdates, { Prefer: "return=representation" });
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

// Records "18 or older" and the Terms (with consent to the Privacy Policy):
// at signup once the email code is confirmed, and for members who haven't
// confirmed them (older accounts). version must be the current one
// (TERMS_VERSION); returns it.
export async function acceptTerms(version) {
  return restCall("POST", "/rest/v1/rpc/accept_terms", { p_version: version });
}

// Everything NRIClub stores about the signed-in member, as one object, for
// "Download my data".
export async function exportMyData() {
  return restCall("POST", "/rest/v1/rpc/export_my_data", {});
}

// Deletes the auth user server-side; every row the user owns cascades with it.
export async function deleteAccount() {
  if (!currentUser) throw new Error("Not logged in");
  await restCall("POST", "/rest/v1/rpc/delete_my_account", {});
  await signOut();
}

export async function searchProfiles(query = "", filters = {}) {
  let url = `/rest/v1/profiles?select=*&order=created_at.desc`;
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
  let url = `/rest/v1/posts?select=*,profiles:user_id(id,name,avatar_url,profession,occupation_status,location,hometown,linkedin_url)&order=created_at.desc&limit=${limit}`;
  if (groupId) url += `&group_id=eq.${groupId}`;
  return restCall("GET", url);
}

// One post with its author, or null: for a shared link (#post=<id>) to a
// post older than the ones the feed loads.
export async function getPost(postId) {
  const rows = await restCall("GET", `/rest/v1/posts?id=eq.${encodeURIComponent(postId)}&select=*,profiles:user_id(id,name,avatar_url,profession,occupation_status,location,hometown,linkedin_url)`);
  return rows?.[0] || null;
}

// A member's latest posts (with author), for their profile page.
export async function getUserPosts(userId, limit = 20) {
  return restCall("GET", `/rest/v1/posts?user_id=eq.${encodeURIComponent(userId)}&select=*,profiles:user_id(id,name,avatar_url,profession,occupation_status,location,hometown,linkedin_url)&order=created_at.desc&limit=${limit}`);
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

export async function deletePost(postId) {
  return restCall("DELETE", `/rest/v1/posts?id=eq.${postId}&user_id=eq.${currentUser.id}`);
}

export async function deleteMarketItem(id) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("DELETE", `/rest/v1/marketplace?id=eq.${id}&user_id=eq.${currentUser.id}`);
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
  return restCall("DELETE", `/rest/v1/events?id=eq.${id}&organizer_id=eq.${currentUser.id}`);
}

// ============================================================================
// COMMENTS
// ============================================================================

export async function getComments(postId) {
  return restCall("GET", `/rest/v1/comments?post_id=eq.${postId}&select=*,profiles:user_id(id,name,avatar_url)&order=created_at.asc`);
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

export async function toggleLike(postId) {
  if (!currentUser) throw new Error("Not logged in");
  // Check if already liked
  const existing = await restCall("GET", `/rest/v1/likes?post_id=eq.${postId}&user_id=eq.${currentUser.id}`);
  if (existing && existing.length > 0) {
    await restCall("DELETE", `/rest/v1/likes?post_id=eq.${postId}&user_id=eq.${currentUser.id}`);
    return false; // unliked
  } else {
    await restCall("POST", "/rest/v1/likes", { post_id: postId, user_id: currentUser.id });
    return true; // liked
  }
}

export async function getUserLikes() {
  if (!currentUser) return [];
  return restCall("GET", `/rest/v1/likes?user_id=eq.${currentUser.id}&select=post_id`);
}

// ============================================================================
// CONNECTIONS (Namaste)
// ============================================================================

export async function sendNamaste(recipientId) {
  if (!currentUser) throw new Error("Not logged in");
  // Check if connection already exists
  const existing = await restCall("GET", `/rest/v1/connections?requester_id=eq.${currentUser.id}&recipient_id=eq.${recipientId}&select=id`);
  if (existing && existing.length > 0) return existing; // Already sent
  return restCall("POST", "/rest/v1/connections", {
    requester_id: currentUser.id,
    recipient_id: recipientId,
    status: "pending",
  }, { Prefer: "return=representation" });
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
  return restCall("GET", `/rest/v1/connections?or=(requester_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id})&status=eq.accepted&select=*,requester:requester_id(id,name,avatar_url,profession),recipient:recipient_id(id,name,avatar_url,profession)`);
}

export async function getAllConnections() {
  return restCall("GET", `/rest/v1/connections?status=eq.accepted&select=requester_id,recipient_id`);
}

export async function getSentNamastes() {
  if (!currentUser) return [];
  return restCall("GET", `/rest/v1/connections?requester_id=eq.${currentUser.id}&status=eq.pending&select=recipient_id`);
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
  return restCall("GET", `/rest/v1/group_members?group_id=eq.${groupId}&select=*,profiles:user_id(id,name,avatar_url,profession,location)`);
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

// The ambassadors of a city (name and photo).
export async function getCityAmbassadors(city) {
  // ilike without wildcards: "%" and "*" become "_" (one character), so
  // only this city matches, brackets and commas included.
  const q = String(city || "").trim().replace(/[%_*\\]/g, "_");
  if (!q) return [];
  return (await restCall("GET", `/rest/v1/profiles?ambassador_city=ilike.${encodeURIComponent(q)}&select=id,name,avatar_url&limit=5`)) || [];
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
export async function getPlaces(city) {
  const rows = await restCall("GET", `/rest/v1/places?city=ilike.${encodeURIComponent(city)}&select=*,place_recommendations(user_id)&order=created_at.desc&limit=200`);
  return (rows || []).map(p => ({ ...p, recs: (p.place_recommendations || []).map(r => r.user_id) }));
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

export async function getConversations() {
  if (!currentUser) return [];
  const [data, hides] = await Promise.all([
    restCall("GET", `/rest/v1/conversations?or=(participant_1.eq.${currentUser.id},participant_2.eq.${currentUser.id})&select=*,p1:participant_1(id,name,avatar_url),p2:participant_2(id,name,avatar_url)&order=last_message_at.desc`),
    restCall("GET", `/rest/v1/conversation_hides?user_id=eq.${currentUser.id}&select=conversation_id,hidden_at`).catch(() => null),
  ]);
  if (hides) {
    hiddenAt.clear();
    hides.forEach(h => hiddenAt.set(h.conversation_id, h.hidden_at));
  }
  return (data || [])
    .filter(c => !hiddenAt.has(c.id) || new Date(c.last_message_at) > new Date(hiddenAt.get(c.id)))
    .map(c => ({
      ...c,
      otherUser: c.participant_1 === currentUser.id ? c.p2 : c.p1,
    }));
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
export async function getUnreadCounts() {
  if (!currentUser) return {};
  const rows = await restCall("GET", `/rest/v1/messages?read=eq.false&sender_id=neq.${currentUser.id}&select=conversation_id,created_at&limit=1000`);
  const counts = {};
  (rows || []).forEach(r => {
    const h = hiddenAt.get(r.conversation_id);
    if (!h || new Date(r.created_at) > new Date(h)) counts[r.conversation_id] = (counts[r.conversation_id] || 0) + 1;
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
  const rows = await restCall("GET", `/rest/v1/messages?conversation_id=eq.${conversationId}&select=*,sender:sender_id(id,name,avatar_url)&order=created_at.asc`);
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
  return restCall("GET", url);
}

export async function createMarketItem(item) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/marketplace", {
    ...item,
    user_id: currentUser.id,
  }, { Prefer: "return=representation" });
}

// ============================================================================
// DOCS
// ============================================================================

export async function getDocs(cityFilter = "All") {
  let url = "/rest/v1/docs?select=*,profiles:user_id(id,name,avatar_url,profession,location)&order=created_at.desc";
  if (cityFilter !== "All") url += `&city=ilike.%25${cityFilter}%25`;
  return restCall("GET", url);
}

export async function createDoc(doc) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/docs", {
    ...doc,
    user_id: currentUser.id,
  }, { Prefer: "return=representation" });
}

export async function getDocComments(docId) {
  return restCall("GET", `/rest/v1/doc_comments?doc_id=eq.${docId}&select=*,profiles:user_id(id,name,avatar_url)&order=created_at.asc`);
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
  return restCall("GET", "/rest/v1/help_requests?select=*,profiles:user_id(id,name,avatar_url)&order=created_at.desc");
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
  const rows = await restCall("GET", `/rest/v1/help_requests?id=eq.${encodeURIComponent(id)}&select=*,profiles:user_id(id,name,avatar_url)`);
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
    return restCall("GET", `/rest/v1/help_responses?request_id=eq.${requestId}&select=*,profiles:user_id(id,name,avatar_url)&order=created_at.asc`);
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
  const all = await restCall("GET", `/rest/v1/notifications?user_id=eq.${currentUser.id}&select=*,actor:actor_id(id,name,avatar_url)&order=created_at.desc&limit=20`);
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

export async function reportPost(postId, reason) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/reports", {
    reporter_id: currentUser.id,
    reported_post_id: postId,
    reason,
    status: "pending",
  });
}

export async function getMyReports() {
  if (!currentUser) return [];
  return restCall("GET", `/rest/v1/reports?reporter_id=eq.${currentUser.id}&select=reported_post_id`);
}

export async function blockUser(userId) {
  if (!currentUser) throw new Error("Not logged in");
  // Remove all connections between the two users
  try { await restCall("DELETE", `/rest/v1/connections?requester_id=eq.${currentUser.id}&recipient_id=eq.${userId}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/connections?requester_id=eq.${userId}&recipient_id=eq.${currentUser.id}`); } catch(e) {}
  // Block the user
  return restCall("POST", "/rest/v1/blocks", {
    blocker_id: currentUser.id,
    blocked_id: userId,
  });
}

export async function unblockUser(userId) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("DELETE", `/rest/v1/blocks?blocker_id=eq.${currentUser.id}&blocked_id=eq.${userId}`);
}

export async function getBlockedUsers() {
  if (!currentUser) return [];
  return restCall("GET", `/rest/v1/blocks?blocker_id=eq.${currentUser.id}&select=*,blocked:blocked_id(id,name,avatar_url,profession)`);
}


// ============================================================================
// FILE UPLOAD
// ============================================================================

export async function uploadFile(bucket, filePath, file) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: file,
  });
  if (!res.ok) {
    let err = "";
    try { const j = await res.json(); err = j.message || j.error || ""; } catch(e) {}
    throw new Error(err || `Upload failed (${res.status})`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${filePath}`;
}

// Phone photos are often 3-8 MB. Before uploading, photos are scaled down to
// at most `max` pixels on the long side and saved as JPEG (about 150-300 KB),
// so uploads and feeds are fast. GIFs, SVGs and files that can't be read are
// uploaded as they are; a smaller original is kept.
async function shrinkImage(file, max = 1600, quality = 0.82) {
  if (!file || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type || "") || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // transparent PNG areas become white, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch (e) {
    return file;
  }
}

export async function uploadAvatar(file) {
  if (!currentUser) throw new Error("Not logged in");
  file = await shrinkImage(file, 512);
  const ext = file.name.split(".").pop();
  const path = `${currentUser.id}/avatar_${Date.now()}.${ext}`;
  const url = await uploadFile("avatars", path, file);
  // Add cache-busting param
  return url + "?t=" + Date.now();
}

export async function uploadPostImage(file) {
  if (!currentUser) throw new Error("Not logged in");
  file = await shrinkImage(file, 1600);
  const ext = file.name.split(".").pop();
  const path = `${currentUser.id}/${Date.now()}.${ext}`;
  return uploadFile("post-images", path, file);
}

export async function uploadMarketImage(file) {
  if (!currentUser) throw new Error("Not logged in");
  file = await shrinkImage(file, 1600);
  const ext = file.name.split(".").pop();
  const path = `${currentUser.id}/${Date.now()}.${ext}`;
  return uploadFile("marketplace-images", path, file);
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

export async function isAdmin() {
  if (!currentUser) return false;
  const rows = await restCall("GET", `/rest/v1/admins?user_id=eq.${currentUser.id}&select=user_id`);
  return Array.isArray(rows) && rows.length > 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Members come with their private row embedded, so a status or email can
// never land on the wrong person.
const ADMIN_MEMBER_SELECT = "select=*,profile_private(email,verification_status,status,review_flag)";

function adminMember(row) {
  const { profile_private: embedded, ...p } = row;
  const pp = (Array.isArray(embedded) ? embedded[0] : embedded) || {};
  return {
    ...p,
    email: pp.email || "",
    verification_status: pp.verification_status || "incomplete",
    status: pp.status || "active",
    review_flag: pp.review_flag || "",
  };
}

// A GET sent with "Prefer: count=exact": { rows, total }.
async function getCounted(path) {
  const res = await restRequest("GET", path, null, { Prefer: "count=exact" });
  const text = await res.text();
  return { rows: text ? JSON.parse(text) : [], total: totalFrom(res) };
}

// Every open report (bug reports included), however many there are: the
// server returns at most 1,000 rows per request, so they come in pages, by
// id, so one handled meanwhile can't push another out of the pages.
const REPORTS_PAGE = 1000;

async function getAllPendingReports() {
  const path = `/rest/v1/reports?select=*&status=eq.pending&order=id.asc&limit=${REPORTS_PAGE}`;
  const first = await getCounted(path);
  const rows = [...first.rows];
  let page = first.rows;
  // A short page is the last one, unless the server capped it below the
  // total it reported.
  while (page.length && (page.length === REPORTS_PAGE || (first.total !== null && rows.length < first.total))) {
    page = (await restCall("GET", `${path}&id=gt.${page[page.length - 1].id}`)) || [];
    rows.push(...page);
  }
  return rows;
}

// Handled reports stay on record, so only the newest are loaded.
export const HANDLED_REPORTS_SHOWN = 200;
const BUG_REASON = encodeURIComponent("[BUG]*");

// users holds the newest 1,000 members; usersTotal is how many there are.
// reports holds every open report plus the newest 200 handled member reports
// (handledReportsTotal is how many there are) and the newest 200 handled bug
// reports (handledBugsTotal); newest first.
export async function adminGetDashboardData() {
  const get = (path) => restCall("GET", path);
  const handled = `/rest/v1/reports?select=*&status=neq.pending&order=created_at.desc&limit=${HANDLED_REPORTS_SHOWN}`;
  const [members, groups, pendingReports, handledReports, handledBugs, posts, docs, events, helpRequests, marketItems] = await Promise.all([
    getCounted(`/rest/v1/profiles?${ADMIN_MEMBER_SELECT}&order=created_at.desc&limit=1000`),
    get("/rest/v1/groups?select=*&order=members_count.desc"),
    getAllPendingReports(),
    getCounted(`${handled}&reason=not.like.${BUG_REASON}`),
    getCounted(`${handled}&reason=like.${BUG_REASON}`),
    get("/rest/v1/posts?select=id,content,image_url,user_id,created_at&order=created_at.desc&limit=200"),
    get("/rest/v1/docs?select=id,title,excerpt,user_id&order=created_at.desc&limit=100"),
    get("/rest/v1/events?select=id,title,description,date,organizer_id&order=created_at.desc&limit=100"),
    get("/rest/v1/help_requests?select=id,title,description,user_id&order=created_at.desc&limit=100"),
    get("/rest/v1/marketplace?select=id,title,description,price,user_id,image_url&order=created_at.desc&limit=100"),
  ]);
  const users = (members.rows || []).map(adminMember);
  // One list, newest first, each report once (one may have been handled
  // between the requests).
  const reports = [];
  const seen = new Set();
  [...handledReports.rows, ...handledBugs.rows, ...pendingReports].forEach((r) => {
    if (!seen.has(r.id)) { seen.add(r.id); reports.push(r); }
  });
  reports.sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  return {
    users,
    usersTotal: members.total ?? users.length,
    groups: groups || [],
    reports,
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
// adminGetDashboardData ("marketplace" is accepted for "market").
const REPORTED_ITEMS = {
  post: ["posts", "id,content,image_url,user_id,created_at"],
  doc: ["docs", "id,title,excerpt,user_id"],
  event: ["events", "id,title,description,date,organizer_id"],
  help: ["help_requests", "id,title,description,user_id"],
  market: ["marketplace", "id,title,description,price,user_id,image_url"],
};
REPORTED_ITEMS.marketplace = REPORTED_ITEMS.market;

// One reported item (or member, for "profile"), loaded by id so it can be
// shown before anything is done to it. null when it no longer exists.
export async function adminGetReportedItem(kind, id) {
  if (kind !== "profile" && !REPORTED_ITEMS[kind]) throw new Error(`Unknown kind of content: ${kind}`);
  if (!UUID.test(id || "")) return null;
  if (kind === "profile") {
    const rows = await restCall("GET", `/rest/v1/profiles?id=eq.${id}&${ADMIN_MEMBER_SELECT}`);
    return rows?.[0] ? adminMember(rows[0]) : null;
  }
  const [table, fields] = REPORTED_ITEMS[kind];
  const rows = await restCall("GET", `/rest/v1/${table}?id=eq.${id}&select=${fields}`);
  return rows?.[0] || null;
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

// Moderation only (block / unblock). Verification decisions go through
// adminReviewMember.
export async function adminSetMemberStatus(userId, status) {
  return adminWrite("PATCH", `/rest/v1/profile_private?id=eq.${userId}`, { status });
}

// Members and activity per city group (admins only).
export async function adminCityStats() {
  return (await restCall("POST", "/rest/v1/rpc/admin_city_stats", {})) || [];
}

// Makes a member the NRIClub ambassador for a city ('' to stop).
export async function adminSetAmbassador(userId, city) {
  return adminWrite("PATCH", `/rest/v1/profiles?id=eq.${userId}`, { ambassador_city: city });
}

// Members waiting for a decision (or any other verification statuses), with
// everything needed to decide: email, LinkedIn or note, voucher, duplicates.
export async function adminVerificationQueue(statuses = ["pending"]) {
  return restCall("POST", "/rest/v1/rpc/admin_verification_queue", { p_statuses: statuses });
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

// Approve and reject act only on a request that is still waiting, so a panel
// that's out of date can't touch a community that is already live.
export async function adminApproveGroup(groupId) {
  return adminWrite("PATCH", `/rest/v1/groups?id=eq.${groupId}&is_approved=eq.false`, { is_approved: true });
}

export async function adminRejectGroupRequest(groupId) {
  return adminWrite("DELETE", `/rest/v1/groups?id=eq.${groupId}&is_approved=eq.false`);
}

// Deletes any community, live or not. Community requests are rejected with
// adminRejectGroupRequest.
export async function adminDeleteGroup(groupId) {
  return adminWrite("DELETE", `/rest/v1/groups?id=eq.${groupId}`);
}

// Marks reports as handled ("reviewed": dismissed, "resolved": acted on).
// They stay on record and show under Handled. Takes one id or several (every
// report about the same item). Only reports that are still open change, so
// a panel that's out of date can't overwrite another admin's decision.
// Returns the reports that changed: none means they were already handled
// (or this account is no longer an admin); reload to see the latest.
// Removing content or blocking claims the reports this way first, so it only
// goes ahead if some are still open.
export async function adminSetReportStatus(reportIds, status) {
  if (status !== "reviewed" && status !== "resolved") throw new Error(`Unknown report status: ${status}`);
  const ids = (Array.isArray(reportIds) ? reportIds : [reportIds]).filter((id) => UUID.test(id || ""));
  if (!ids.length) throw new Error("No reports to update.");
  const rows = await restCall("PATCH", `/rest/v1/reports?id=in.(${ids.join(",")})&status=eq.pending`, { status }, { Prefer: "return=representation" });
  return Array.isArray(rows) ? rows : [];
}

// Opens reports again that adminSetReportStatus just claimed with status,
// when the action they were claimed for failed. Only reports still in that
// status change (other admins only change open ones). Returns them.
export async function adminReopenReports(reportIds, status) {
  if (status !== "reviewed" && status !== "resolved") throw new Error(`Unknown report status: ${status}`);
  const ids = reportIds.filter((id) => UUID.test(id || ""));
  if (!ids.length) return [];
  const rows = await restCall("PATCH", `/rest/v1/reports?id=in.(${ids.join(",")})&status=eq.${status}`, { status: "pending" }, { Prefer: "return=representation" });
  return Array.isArray(rows) ? rows : [];
}

// Deletes a report for good (no record is kept); handling a report uses
// adminSetReportStatus.
export async function adminDeleteReport(reportId) {
  return adminWrite("DELETE", `/rest/v1/reports?id=eq.${reportId}`);
}

const MODERATED_TABLES = ["posts", "docs", "events", "help_requests", "marketplace"];

export async function adminDeleteContent(table, id) {
  if (!MODERATED_TABLES.includes(table)) throw new Error(`Cannot moderate ${table}`);
  return adminWrite("DELETE", `/rest/v1/${table}?id=eq.${id}`);
}

export async function adminNotify(userId, type, text) {
  return restCall("POST", "/rest/v1/notifications", { user_id: userId, type, text });
}

// ---- Public city pages (work without signing in; counts only) ----
export async function getCitySummary(city) {
  return restCall("POST", "/rest/v1/rpc/city_summary", { p_city: city });
}
export async function getPublicCities() {
  return (await restCall("POST", "/rest/v1/rpc/public_cities", {})) || [];
}
