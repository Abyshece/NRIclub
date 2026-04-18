// ============================================================================
// supabaseApi.js - Complete Supabase API layer for IndIn
// ============================================================================

const SUPABASE_URL = "https://uzzkdmybsbwknpsucuvv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6emtkbXlic2J3a25wc3VjdXZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MjE1NDUsImV4cCI6MjA5MDk5NzU0NX0.tolTpKSToyH_DtUfKYbKdWVyJiWC25RDBQlHVu140hQ";

let accessToken = null;
let currentUser = null;

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
  const opts = { method, headers: headers(extraHeaders) };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}${path}`, opts);
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
  // Supabase returns identities=[] for existing emails (doesn't error)
  if (data.user && data.user.identities && data.user.identities.length === 0) {
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
  localStorage.setItem("indin_token", data.access_token);
  localStorage.setItem("indin_refresh", data.refresh_token);
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
  localStorage.removeItem("indin_token");
  localStorage.removeItem("indin_refresh");
}

export async function sendOtp(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error_description || "Failed to send OTP");
  }
}

export async function verifyOtp(email, token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, token, type: "email" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || "Invalid OTP");
  if (data.access_token) {
    accessToken = data.access_token;
    currentUser = data.user;
    localStorage.setItem("indin_token", data.access_token);
    if (data.refresh_token) localStorage.setItem("indin_refresh", data.refresh_token);
  }
  return data;
}

export async function refreshSession() {
  const refresh = localStorage.getItem("indin_refresh");
  if (!refresh) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    accessToken = data.access_token;
    currentUser = data.user;
    localStorage.setItem("indin_token", data.access_token);
    if (data.refresh_token) localStorage.setItem("indin_refresh", data.refresh_token);
    return data;
  } catch {
    return null;
  }
}

export async function getSession() {
  const token = localStorage.getItem("indin_token");
  if (!token) return null;
  accessToken = token;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      // Try refresh
      return await refreshSession();
    }
    const user = await res.json();
    currentUser = user;
    return { user, access_token: token };
  } catch {
    return await refreshSession();
  }
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

export async function getMyProfile() {
  if (!currentUser) return null;
  // Update last_active timestamp
  try { restCall("PATCH", `/rest/v1/profiles?id=eq.${currentUser.id}`, { last_active: new Date().toISOString() }); } catch(e) {}
  return getProfile(currentUser.id);
}

export async function updateProfile(updates) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("PATCH", `/rest/v1/profiles?id=eq.${currentUser.id}`, updates, { Prefer: "return=representation" });
}

export async function deleteAccount() {
  if (!currentUser) throw new Error("Not logged in");
  const uid = currentUser.id;
  // Delete all user content in order (foreign keys)
  try { await restCall("DELETE", `/rest/v1/comments?user_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/likes?user_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/messages?sender_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/notifications?user_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/notifications?actor_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/event_rsvps?user_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/group_members?user_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/connections?requester_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/connections?recipient_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/blocks?blocker_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/blocks?blocked_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/help_responses?user_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/doc_comments?user_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/reports?reporter_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/user_settings?user_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/marketplace?user_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/help_requests?user_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/docs?user_id=eq.${uid}`); } catch(e) {}
  try { await restCall("DELETE", `/rest/v1/posts?user_id=eq.${uid}`); } catch(e) {}
  // Finally delete the profile itself
  try { await restCall("DELETE", `/rest/v1/profiles?id=eq.${uid}`); } catch(e) {}
  // Sign out
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

export async function getMyConnections() {
  if (!currentUser) return [];
  return restCall("GET", `/rest/v1/connections?or=(requester_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id})&status=eq.accepted&select=*,requester:requester_id(id,name,avatar_url,profession),recipient:recipient_id(id,name,avatar_url,profession)`);
}

export async function getAllConnections() {
  return restCall("GET", `/rest/v1/connections?status=eq.accepted&select=requester_id,recipient_id`);
}

export async function getSentNamastes() {
  if (!currentUser) return [];
  return restCall("GET", `/rest/v1/connections?requester_id=eq.${currentUser.id}&select=recipient_id`);
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
  });
}

export async function reportPost(postId, reason) {
  if (!currentUser) throw new Error("Not logged in");
  return restCall("POST", "/rest/v1/reports", {
    reporter_id: currentUser.id,
    reported_post_id: postId,
    reason,
  });
}

export async function blockUser(userId) {
  if (!currentUser) throw new Error("Not logged in");
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
  const data = await restCall("GET", `/rest/v1/user_settings?user_id=eq.${userId}&select=namaste_requests,receive_messages,profile_visibility`);
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
        payload: { config: { broadcast: { self: false }, presence: { key: "" }, postgres_changes: [{ event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }] } },
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
