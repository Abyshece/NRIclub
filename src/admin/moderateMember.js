// A decision of our team on a member, from the Members or Verification page
// (MemberPeek's onModerate): kind "member" with action "warn", "block" or
// "unblock", or "profile_photo" / "profile_bio" with "remove". reasons: {
// ground, rule, facts, urgent } from the reasons dialog; overview: the
// member's api.adminMemberOverview (null before the 2026-10-21 database
// update). The database records it and tells the member why (before that
// update, the panel says they weren't told). changed(id, patch, before)
// updates the page; throws so the dialog can show why it didn't work.
import * as api from "../supabaseApi";
import { shortName } from "./format";
import { EMAIL_DELAY_MS, emailFailed, queueDecisionEmail } from "./memberEmail";

export async function moderateMember(m, { kind, action, reasons = {}, overview = null }, { showToast, changed }) {
  const res = await api.adminModerate({ kind, id: m.id, action, ...reasons });
  const who = shortName(m.name);
  if (kind === "member" && action === "block") {
    // A block also ends an ambassador role.
    changed(m.id, { status: "blocked", ...(m.ambassador_city ? { ambassador_city: "" } : {}) }, { status: m.status || "active" });
  } else if (kind === "member" && action === "unblock") {
    changed(m.id, { status: "active" }, { status: "blocked" });
  } else if (kind === "profile_photo") {
    changed(m.id, { avatar_url: "" });
  } else if (kind === "profile_bio") {
    changed(m.id, { bio: "" });
  }
  const cancelled = res?.cancelled_sessions || 0;
  const text = {
    block: `Blocked ${who}${cancelled ? `. ${cancelled === 1 ? "1 mentoring session" : `${cancelled} mentoring sessions`} cancelled` : ""}`,
    unblock: `Unblocked ${who}`,
    warn: `Warning sent to ${who}`,
    remove: kind === "profile_photo" ? `Removed ${who}'s photo` : `Removed ${who}'s bio`,
  }[action];
  const tail = res?.fallback && action !== "unblock" ? ". They weren't told in the app: write to them from hello@nriclub.app." : "";
  // Undo a block only while nothing went with it: no mentoring sessions
  // cancelled, no open mentoring times deleted and no ambassador role ended
  // (none of them come back with an unblock).
  const undoable = kind === "member" && action === "block" && !cancelled
    && !(overview?.upcoming_sessions > 0) && !(overview?.free_slots > 0) && !m.ambassador_city;
  // A block is also emailed (once its Undo has gone); before the 2026-10-21
  // database update (fallback) it isn't recorded, so it isn't emailed.
  const email = kind === "member" && action === "block" && !res?.fallback
    ? queueDecisionEmail(m.id, "blocked", { delay: undoable ? EMAIL_DELAY_MS : 0, onFail: emailFailed(showToast) })
    : null;
  showToast({
    text: `${text}${tail}`,
    undo: undoable ? async () => {
      email?.cancel();
      try {
        await api.adminModerate({ kind: "member", id: m.id, action: "unblock" });
      } catch (e) {
        email?.sendNow();
        throw e;
      }
      changed(m.id, { status: "active" }, { status: "blocked" });
      return `Undone. ${who} is unblocked.`;
    } : undefined,
  });
  return res;
}
