// Deleting a member's account from Members (supabase/functions/
// admin-delete-member): because the member asked us to (e.g. by email, when
// they can't do it themselves: Art. 17 GDPR), or because it is blocked.
// The admin chooses the reason, may add a note for our record of decisions,
// and types the member's email address (or their name, without one) to
// confirm. A block less than 6 months old can still be challenged (Art. 20
// DSA): the dialog says until when, and allows it anyway. Before the
// database update and the function are in, it says which is missing and
// deletes nothing.
import { useEffect, useState } from "react";
import * as api from "../supabaseApi";
import { ConfirmDialog } from "./ui";
import { firstName, friendlyError } from "./format";

const NOTE_MAX = 500;
const APPEAL_MONTHS = 6;

// "21 April 2027", German time (as the database writes dates in its messages).
const longDate = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });

// months later, on the same day of the month or the month's last day (as
// Postgres adds an interval of months).
function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

const plain = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();

const NOT_READY = {
  needs_update: "Deleting accounts needs the database update of 1 November 2026. Until it's in, nothing can be deleted here.",
  unreachable: "The server function isn't reachable (admin-delete-member). It may not be set up yet. Nothing can be deleted until it is.",
};

// member: as the peek has them. overview: from api.adminMemberOverview (its
// history gives the block's date if the account doesn't have one), or null.
// onConfirm({ reason, note }) deletes and may throw (its message shows here).
export default function DeleteMemberDialog({ member, overview = null, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState("checking"); // checking | ready | needs_update | unreachable | unknown
  const [blockedAt, setBlockedAt] = useState(null);

  const blocked = member.status === "blocked";
  const first = firstName(member.name) || "the member";
  const email = String(member.email || "").trim();
  const name = String(member.name || "").trim();
  const confirmWith = email || name || "delete";

  useEffect(() => {
    let live = true;
    api.adminDeleteMemberReady().then((r) => { if (live) setReady(r); }).catch(() => { if (live) setReady("unknown"); });
    return () => { live = false; };
  }, []);

  // When it was blocked: the account's own date, else the latest block in
  // what our team did about them.
  useEffect(() => {
    if (!blocked) return undefined;
    let live = true;
    const fromHistory = (overview?.history || []).find((h) => h.action === "block")?.created_at || null;
    api.adminMemberBlockedAt(member.id)
      .then((at) => { if (live) setBlockedAt(at || fromHistory); })
      .catch(() => { if (live) setBlockedAt(fromHistory); });
    return () => { live = false; };
  }, [member.id, blocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const appealUntil = blockedAt ? addMonths(blockedAt, APPEAL_MONTHS) : null;
  const canAppeal = blocked && (!appealUntil || appealUntil.getTime() > Date.now());
  const notReady = NOT_READY[ready] || "";
  const confirmed = !!confirmWith && plain(typed) === plain(confirmWith);
  const complete = !!reason && confirmed && note.trim().length <= NOTE_MAX && !notReady;

  const confirm = async () => {
    if (!complete || busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm({ reason, note: note.trim() });
    } catch (e) {
      setError(e?.unreachable
        ? "The server function isn't reachable. It may not be set up yet. Nothing was deleted."
        : friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog wide title={member.name ? `Delete ${member.name}'s account?` : "Delete this account?"}
      confirmLabel="Delete account" busy={busy} error={error} onConfirm={confirm} onCancel={onCancel} confirmDisabled={!complete}>
      <p style={{ margin: 0 }}>
        Their profile, photos, everything they posted and their messages are deleted, as when members delete their own
        account (a conversation goes for the other member too). Our team's records of decisions about them stay, without
        their name, as the Privacy Policy says. {email ? `We email ${first} that their account was deleted.` : `${first} has no email address: tell them yourself if you can.`} This can't be undone.
      </p>
      {notReady && <div className="adm-warn-note" role="note" style={{ marginTop: 12 }}>{notReady}</div>}
      <div className="adm-form">
        <div>
          <span className="adm-field-label" id="adm-delete-why">Why <span className="adm-faint">(required)</span></span>
          <div className="adm-radio-list" role="radiogroup" aria-labelledby="adm-delete-why">
            <label className="adm-radio">
              <input type="radio" name="adm-delete-why" checked={reason === "member_request"} onChange={() => setReason("member_request")} />
              <span>The member asked us to delete their account
                <span className="adm-help adm-radio-help">For example by email, when they can't do it themselves (GDPR Art. 17).</span>
              </span>
            </label>
            {blocked && (
              <label className="adm-radio">
                <input type="radio" name="adm-delete-why" checked={reason === "blocked_account"} onChange={() => setReason("blocked_account")} />
                <span>Blocked account
                  {blockedAt && <span className="adm-help adm-radio-help">Blocked on {longDate(new Date(blockedAt))}.</span>}
                </span>
              </label>
            )}
          </div>
        </div>
        {reason === "blocked_account" && canAppeal && (
          <div className="adm-warn-note" role="note">
            {appealUntil
              ? `The member can still complain about the block until ${longDate(appealUntil)} (DSA Art. 20).`
              : `The member can complain about the block for ${APPEAL_MONTHS} months after it (DSA Art. 20).`}
            {" "}The record of our decision stays, but their account and posts will be gone.
          </div>
        )}
        <div>
          <label className="adm-field-label" htmlFor="adm-delete-note">Internal note (admins only) <span className="adm-faint">optional</span></label>
          <textarea id="adm-delete-note" className="adm-textarea" value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Asked by email on 26 October" style={{ minHeight: 56 }} />
          <div className="adm-help" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>Kept in our record of decisions. Leave out their name and email address.</span>
            <span style={{ flexShrink: 0 }}>{note.length} / {NOTE_MAX}</span>
          </div>
        </div>
        <div>
          <label className="adm-field-label" htmlFor="adm-delete-confirm">
            To confirm, type {email ? "their email address" : name ? "their name" : "the word"}: <strong className="adm-confirm-target">{confirmWith}</strong>
          </label>
          <input id="adm-delete-confirm" className="adm-input" value={typed} onChange={(e) => setTyped(e.target.value)}
            autoComplete="off" autoCapitalize="off" spellCheck={false}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirm(); } }} />
        </div>
      </div>
    </ConfirmDialog>
  );
}
