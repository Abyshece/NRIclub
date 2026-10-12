// ============================================================================
// supabaseApi.js - Complete Supabase API layer for NRIclub
// ============================================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const TOKEN_KEY = "nriclub_token";
const REFRESH_KEY = "nriclub_refresh";

let accessToken = null;
let currentUser = null;

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
  accessToken = null;
  currentUser = null;
  if (clearStorage) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }
  if (hadUser && sessionEndedHandler) sessionEndedHandler();
}

function headers(extra = {}) {
  const h = {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
    ...extra,
  };
  return h;
}

async function restCall(method, path, body = null, extraHeaders = {}) {
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
    throw new Error(err);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
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

export async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Login failed");
  accessToken = data.access_token;
  currentUser = data.user;
  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(REFRESH_KEY, data.refresh_token);
  return data;
}

export async function signOut() {
  try {
    if (accessToken) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
      });
    }
  } catch (e) {}
  accessToken = null;
  currentUser = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export async function resetPassword(email) {
  const redirectTo = encodeURIComponent(window.location.origin + window.location.pathname);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${redirectTo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || err.msg || "Failed to send reset email");
  }
  return true;
}

// The password-reset email links back to the site with the session in the URL
// hash (#access_token=...&type=recovery). Take it, clean the URL, and return
// true so the app can ask for a new password.
export function takeRecoverySession() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (params.get("type") !== "recovery" || !params.get("access_token")) return false;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  accessToken = params.get("access_token");
  localStorage.setItem(TOKEN_KEY, accessToken);
  if (params.get("refresh_token")) localStorage.setItem(REFRESH_KEY, params.get("refresh_token"));
  return true;
}

export async function updatePassword(password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || "Couldn't update your password.");
  currentUser = data;
  return data;
}

export async function sendOtp(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.msg || data.error_description || data.message || "Failed to send OTP");
  }
}

export async function verifyOtp(email, token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, token, type: "email" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || "Invalid OTP");
  if (data.access_token) {
    accessToken = data.access_token;
    currentUser = data.user;
    localStorage.setItem(TOKEN_KEY, data.access_token);
    if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
  }
  return data;
}

// Concurrent callers share one refresh request; refresh tokens are single-use.
let refreshInFlight = null;

export function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = doRefreshSession().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function doRefreshSession() {
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return null;
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: refresh }),
    });
  } catch {
    return null; // offline: keep the session and try again later
  }
  if (!res.ok) {
    // Revoked, expired or already-used refresh token: the session is over.
    if (res.status >= 400 && res.status < 500) endSession({ clearStorage: true });
    return null;
  }
  const data = await res.json();
  // Tokens are shared by every tab. Save the rotated ones, but if another tab
  // signed in as someone else, don't switch this tab to that account.
  localStorage.setItem(TOKEN_KEY, data.access_token);
  if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
  if (currentUser && data.user?.id !== currentUser.id) {
    endSession({ clearStorage: false });
    return null;
  }
  accessToken = data.access_token;
  currentUser = data.user;
  return data;
}

export async function getSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  accessToken = token;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const user = await res.json();
      currentUser = user;
      return { user, access_token: token };
    }
  } catch {}
  const refreshed = await refreshSession();
  if (!refreshed) {
    accessToken = null;
    currentUser = null;
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

// Email and consent live in profile_private, which only the owner and admins
// can read; the app still sees them as fields of the user's own profile.
const PRIVATE_PROFILE_FIELDS = ["email", "gdpr_consent", "gdpr_consent_date", "marketing_consent"];

export async function getMyProfile() {
  if (!currentUser) return null;
  restCall("PATCH", `/rest/v1/profiles?id=eq.${currentUser.id}`, { last_active: new Date().toISOString() }).catch(() => {});
  const [profile, privateRows] = await Promise.all([
    getProfile(currentUser.id),
    restCall("GET", `/rest/v1/profile_private?id=eq.${currentUser.id}&select=*`).catch(() => []),
  ]);
  if (!profile) return null;
  const { id, created_at, updated_at, ...privateFields } = privateRows?.[0] || {};
  return { ...profile, email: currentUser.email, ...privateFields };
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
export async function submitVerification({ city, countryCode, location, linkedinUrl = "", note = "", voucher = "", profession = null }) {
  return restCall("POST", "/rest/v1/rpc/submit_verification", {
    p_city: city, p_country_code: countryCode, p_location: location,
    p_linkedin_url: linkedinUrl, p_note: note, p_voucher: voucher, p_profession: profession,
  });
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
  url += "&limit=20";
  return restCall("GET", url);
}

// ============================================================================
// POSTS
// ============================================================================

export async function getPosts(limit = 30, groupId = null) {
  let url = `/rest/v1/posts?select=*,profiles:user_id(id,name,avatar_url,profession,location,hometown,linkedin_url)&order=created_at.desc&limit=${limit}`;
  if (groupId) url += `&group_id=eq.${groupId}`;
  return restCall("GET", url);
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
  return restCall("GET", `/rest/v1/comments?post_id=eq.${postId}&select=*,profiles:user_id(id,name,avatar_url)&order=created_at.desc`);
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

export async function requestNewGroup(cityName) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/groups", {
    name: `Indians in ${cityName}`,
    description: `Community for Indians living in ${cityName}.`,
    category: "City",
    created_by: currentUser.id,
    is_approved: false,
  }, { Prefer: "return=representation" });
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

export async function getMyRsvps() {
  if (!currentUser) return [];
  const data = await restCall("GET", `/rest/v1/event_rsvps?user_id=eq.${currentUser.id}&select=event_id`);
  return (data || []).map(d => d.event_id);
}

// ============================================================================
// MESSAGES
// ============================================================================

export async function getConversations() {
  if (!currentUser) return [];
  const data = await restCall("GET", `/rest/v1/conversations?or=(participant_1.eq.${currentUser.id},participant_2.eq.${currentUser.id})&select=*,p1:participant_1(id,name,avatar_url),p2:participant_2(id,name,avatar_url)&order=last_message_at.desc`);
  return (data || []).map(c => ({
    ...c,
    otherUser: c.participant_1 === currentUser.id ? c.p2 : c.p1,
  }));
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
  return restCall("GET", `/rest/v1/messages?conversation_id=eq.${conversationId}&select=*,sender:sender_id(id,name,avatar_url)&order=created_at.asc`);
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

export async function createHelpRequest(req) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/help_requests", {
    ...req,
    user_id: currentUser.id,
  }, { Prefer: "return=representation" });
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

export async function uploadAvatar(file) {
  if (!currentUser) throw new Error("Not logged in");
  const ext = file.name.split(".").pop();
  const path = `${currentUser.id}/avatar_${Date.now()}.${ext}`;
  const url = await uploadFile("avatars", path, file);
  // Add cache-busting param
  return url + "?t=" + Date.now();
}

export async function uploadPostImage(file) {
  if (!currentUser) throw new Error("Not logged in");
  const ext = file.name.split(".").pop();
  const path = `${currentUser.id}/${Date.now()}.${ext}`;
  return uploadFile("post-images", path, file);
}

export async function uploadMarketImage(file) {
  if (!currentUser) throw new Error("Not logged in");
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

export async function adminGetDashboardData() {
  const get = (path) => restCall("GET", path);
  const [profiles, privateRows, groups, reports, posts, docs, events, helpRequests, marketItems] = await Promise.all([
    get("/rest/v1/profiles?select=*&order=created_at.desc"),
    get("/rest/v1/profile_private?select=id,email"),
    get("/rest/v1/groups?select=*&order=members_count.desc"),
    get("/rest/v1/reports?select=*&order=created_at.desc"),
    get("/rest/v1/posts?select=id,content,image_url,user_id,created_at&order=created_at.desc&limit=200"),
    get("/rest/v1/docs?select=id,title,excerpt,user_id&order=created_at.desc&limit=100"),
    get("/rest/v1/events?select=id,title,description,date,organizer_id&order=created_at.desc&limit=100"),
    get("/rest/v1/help_requests?select=id,title,description,user_id&order=created_at.desc&limit=100"),
    get("/rest/v1/marketplace?select=id,title,description,price,user_id,image_url&order=created_at.desc&limit=100"),
  ]);
  const emails = Object.fromEntries((privateRows || []).map((p) => [p.id, p.email]));
  return {
    users: (profiles || []).map((p) => ({ ...p, email: emails[p.id] || "" })),
    groups: groups || [],
    reports: reports || [],
    posts: posts || [],
    docs: docs || [],
    events: events || [],
    helpRequests: helpRequests || [],
    marketItems: marketItems || [],
  };
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
  return adminWrite("PATCH", `/rest/v1/profiles?id=eq.${userId}`, { status });
}

// Members waiting for a decision (or any other verification statuses), with
// everything needed to decide: email, LinkedIn or note, voucher, duplicates.
export async function adminVerificationQueue(statuses = ["pending"]) {
  return restCall("POST", "/rest/v1/rpc/admin_verification_queue", { p_statuses: statuses });
}

// decision: "approved" | "needs_info" | "rejected" | "pending" (reopen/undo).
// needs_info and rejected require a message, which the member sees.
export async function adminReviewMember(memberId, decision, message = "", adminNote = "") {
  return restCall("POST", "/rest/v1/rpc/review_member", {
    p_member: memberId, p_decision: decision, p_message: message, p_admin_note: adminNote,
  });
}

export async function adminApproveGroup(groupId) {
  return adminWrite("PATCH", `/rest/v1/groups?id=eq.${groupId}`, { is_approved: true });
}

export async function adminDeleteGroup(groupId) {
  return adminWrite("DELETE", `/rest/v1/groups?id=eq.${groupId}`);
}

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
