// Who invited a visitor, from a member's invite link, for the details our
// team checks (Get verified fills in "Invited by ..."). Links carry a random
// code (?invite=<code>); links from before invite codes carry the member's
// ID and first name (?invite=<member id>&from=<name>) and still work.
//
// Kept in this browser tab only (sessionStorage) and only until the details
// are sent (forgetInvite). Older versions kept it in localStorage, where it
// stayed: moveOldInvite takes it out of there.
export const INVITE_KEY = "nriclub_invite";

const MEMBER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[a-z0-9]{8,32}$/i;

// From the address bar's ?invite= (and &from=); anything else is ignored.
export function rememberInvite(value, from = "") {
  const v = String(value || "").trim();
  let invite = null;
  if (MEMBER_ID.test(v)) invite = { id: v.toLowerCase(), from: String(from || "").slice(0, 40) };
  else if (CODE.test(v)) invite = { code: v.toLowerCase() };
  if (!invite) return;
  try { sessionStorage.setItem(INVITE_KEY, JSON.stringify(invite)); } catch (e) {}
}

// { code } or { id, from }, or null.
export function readInvite() {
  try {
    const inv = JSON.parse(sessionStorage.getItem(INVITE_KEY) || "null");
    if (inv && typeof inv.code === "string" && CODE.test(inv.code)) return { code: inv.code };
    if (inv && typeof inv.id === "string" && MEMBER_ID.test(inv.id)) return { id: inv.id, from: String(inv.from || "").slice(0, 40) };
  } catch (e) {}
  return null;
}

export function forgetInvite() {
  try { sessionStorage.removeItem(INVITE_KEY); } catch (e) {}
  try { localStorage.removeItem(INVITE_KEY); } catch (e) {}
}

export function moveOldInvite() {
  try {
    const old = localStorage.getItem(INVITE_KEY);
    if (old === null) return;
    if (!sessionStorage.getItem(INVITE_KEY)) sessionStorage.setItem(INVITE_KEY, old);
    localStorage.removeItem(INVITE_KEY);
  } catch (e) {}
}

// What Get verified tells our team: "Invited by Arjun (member <id>)".
export function invitedByText(id, first) {
  return id ? `Invited by ${first || "a member"} (member ${id})` : "";
}
