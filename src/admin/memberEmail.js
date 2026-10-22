// The email a member gets about our team's decision (approved, asked for
// more information, rejected, blocked), on top of the in-app notice:
// supabase/functions/member-email, which asks the database what it may say.
// A decision that can be undone is emailed once its Undo has gone (the
// toast's 6 seconds, and a little more), so an undone decision is never
// emailed; one that can't be undone goes at once. If the panel is closed
// before then, the email goes as the page closes. A failure never undoes
// the decision: the panel says the email couldn't be sent.
import * as api from "../supabaseApi";

export const EMAIL_DELAY_MS = 7000;
export const EMAIL_FAILED_TEXT = "Decision saved; the email couldn't be sent.";
// review_member's decisions that are emailed (moving back to pending or to
// unfinished isn't).
export const EMAILED_DECISIONS = new Set(["approved", "needs_info", "rejected"]);

const waiting = new Map(); // id -> { memberId, kind, timer, onFail }
let nextId = 0;

function send(id, { keepalive = false } = {}) {
  const entry = waiting.get(id);
  if (!entry) return;
  waiting.delete(id);
  clearTimeout(entry.timer);
  api.sendMemberEmail(entry.memberId, entry.kind, { keepalive }).catch((e) => {
    // Another admin changed the decision meanwhile: no email is right.
    if (e?.status === 409 && /changed since|already gone out/i.test(e.message || "")) return;
    entry.onFail?.(e);
  });
}

// Sends the email about the decision kind ("approved", "needs_info",
// "rejected" or "blocked") on member memberId after delay ms. onFail(error)
// if it couldn't be sent. Returns { cancel, sendNow }: cancel for an Undo,
// sendNow if that Undo then failed (the decision stands).
export function queueDecisionEmail(memberId, kind, { delay = EMAIL_DELAY_MS, onFail } = {}) {
  const id = ++nextId;
  waiting.set(id, { memberId, kind, onFail, timer: setTimeout(() => send(id), delay) });
  return {
    cancel: () => { const entry = waiting.get(id); if (entry) { clearTimeout(entry.timer); waiting.delete(id); } },
    sendNow: () => send(id),
  };
}

// The panel closes (or reloads) with emails still waiting: send them now.
try {
  window.addEventListener("pagehide", () => { [...waiting.keys()].forEach((id) => send(id, { keepalive: true })); });
} catch { /* no window (build) */ }

// The toast for a failed email.
export const emailFailed = (showToast) => () => showToast({ text: EMAIL_FAILED_TEXT, tone: "error", duration: 8000 });
