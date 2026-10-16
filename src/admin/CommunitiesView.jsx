// Communities: requests for new communities first, then the active ones.
// Every decision goes through the database (api.adminSetGroup), which tells
// the member who asked for the community and, since the 2026-10-21 database
// update, records it.
import { useState } from "react";
import * as api from "../supabaseApi";
import { Button, ConfirmDialog, EmptyState, PageHeader, Pill, SectionTitle } from "./ui";
import { ago, friendlyError, isNothingChangedError } from "./format";

const REASON_MAX = 600;

// onReload loads the panel's data again.
export default function CommunitiesView({ groups, setGroups, usersById, showToast, onReload }) {
  const [busyId, setBusyId] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind: "reject" | "delete", group }
  const [reason, setReason] = useState("");
  const [confirmError, setConfirmError] = useState("");

  const pending = groups.filter((g) => !g.is_approved);
  const active = groups.filter((g) => g.is_approved).sort((a, b) => (b.members_count || 0) - (a.members_count || 0));
  const creatorName = (g) => (g.created_by && usersById[g.created_by]?.name) || null;
  const cleanReason = reason.replace(/\s+/g, " ").trim().replace(/[.!\s]+$/, "");

  // Approve and reject only touch a request that is still waiting. If it
  // isn't (another admin got there first), show the list as it is now.
  const alreadyHandled = () => {
    showToast({ text: "This request may already have been handled, so nothing was changed. Reloading the list." });
    onReload?.();
  };
  const handledElsewhere = (e) => isNothingChangedError(e) || /already been handled/i.test(friendlyError(e));

  const approve = async (g) => {
    if (busyId) return;
    setBusyId(g.id);
    try {
      await api.adminSetGroup(g, "approve");
    } catch (e) {
      setBusyId(null);
      if (handledElsewhere(e)) alreadyHandled();
      else showToast({ text: friendlyError(e), tone: "error" });
      return;
    }
    setGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, is_approved: true } : x)));
    setBusyId(null);
    // Undo while nobody has joined or posted yet (the database checks).
    showToast({
      text: `Approved ${g.name}`,
      icon: "check",
      undo: async () => {
        await api.adminSetGroup(g, "unapprove");
        setGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, is_approved: false } : x)));
        return `Undone. ${g.name} is a request again.`;
      },
    });
  };

  const openConfirm = (kind, g) => {
    setConfirmError("");
    setReason("");
    setConfirm({ kind, group: g });
  };

  const runConfirmed = async () => {
    const { kind, group: g } = confirm;
    if (kind === "delete" && cleanReason.length < 5) return;
    setBusyId(g.id);
    setConfirmError("");
    try {
      await api.adminSetGroup(g, kind, cleanReason);
    } catch (e) {
      setBusyId(null);
      if (handledElsewhere(e)) { setConfirm(null); alreadyHandled(); } else setConfirmError(friendlyError(e));
      return;
    }
    setGroups((prev) => prev.filter((x) => x.id !== g.id));
    setConfirm(null);
    setBusyId(null);
    showToast({ text: kind === "reject" ? `Turned down ${g.name}` : `Deleted ${g.name}` });
  };

  return (
    <>
      <PageHeader title="Communities" description="Approve requests for new communities. Approved ones appear for every member." />

      <SectionTitle count={pending.length} tone={pending.length ? "orange" : undefined}>Requests</SectionTitle>
      {pending.length === 0 ? (
        <p className="adm-muted" style={{ padding: "12px 8px 4px" }}>No requests waiting.</p>
      ) : pending.map((g) => (
        <div key={g.id} className="adm-item">
          <div className="adm-item-main">
            <div className="adm-item-title">{g.name}<Pill tone="orange">Pending</Pill></div>
            {g.description && <div className="adm-item-text">{g.description}</div>}
            <div className="adm-item-meta">
              {[g.category, creatorName(g) ? `Requested by ${creatorName(g)}` : g.created_by ? "Requested by a member" : null, g.created_at ? ago(g.created_at) : null].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="adm-item-actions">
            <Button variant="approve" size="sm" icon="check" onClick={() => approve(g)} disabled={busyId === g.id}>Approve</Button>
            <Button variant="secondary" size="sm" onClick={() => openConfirm("reject", g)} disabled={busyId === g.id}>Reject…</Button>
          </div>
        </div>
      ))}

      <SectionTitle count={active.length}>Active communities</SectionTitle>
      {active.length === 0 ? (
        <EmptyState icon="globe" title="No communities yet">Approved communities appear here.</EmptyState>
      ) : active.map((g) => (
        <div key={g.id} className="adm-simple-row">
          <span className="adm-ellipsis" style={{ flex: 1, fontWeight: 500 }}>{g.name}</span>
          {g.category && g.category !== "City" && <Pill tone="gray" dot={false}>{g.category}</Pill>}
          <span className="adm-muted" style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", minWidth: 96, textAlign: "right" }}>
            {(g.members_count || 0).toLocaleString("en-GB")} member{g.members_count === 1 ? "" : "s"}
          </span>
          <Button variant="ghost" size="sm" className="adm-btn-ghost-danger" onClick={() => openConfirm("delete", g)} disabled={busyId === g.id} aria-label={`Delete ${g.name}`}>Delete…</Button>
        </div>
      ))}

      {confirm && (
        <ConfirmDialog
          wide
          title={confirm.kind === "reject" ? `Reject "${confirm.group.name}"?` : `Delete "${confirm.group.name}"?`}
          confirmLabel={confirm.kind === "reject" ? "Reject request" : "Delete community"}
          busy={busyId === confirm.group.id}
          error={confirmError}
          confirmDisabled={confirm.kind === "delete" && cleanReason.length < 5}
          onConfirm={runConfirmed}
          onCancel={() => setConfirm(null)}>
          <p style={{ margin: 0 }}>
            {confirm.kind === "reject"
              ? `The request is deleted${confirm.group.created_by ? " and the member who asked for it gets a notification, with your reason if you give one" : ""}.`
              : `The community is deleted and its ${(confirm.group.members_count || 0).toLocaleString("en-GB")} member${confirm.group.members_count === 1 ? " leaves" : "s leave"} it. Posts in it stay in the feed, without the community. ${confirm.group.created_by ? "The member who started it is told why. " : ""}This can't be undone.`}
          </p>
          <div className="adm-form">
            <div>
              <label className="adm-field-label" htmlFor="adm-group-reason">
                {confirm.kind === "reject" ? "Reason" : "Why"}{" "}
                <span className="adm-faint">({confirm.kind === "reject" ? "optional; " : "finishes “we deleted it because …”; "}the member reads this)</span>
              </label>
              <textarea id="adm-group-reason" className="adm-textarea" value={reason} maxLength={REASON_MAX} onChange={(e) => setReason(e.target.value)}
                placeholder={confirm.kind === "reject" ? "e.g. there is already a community for this" : "e.g. it was used to sell things, which our Terms of Use don't allow"} />
            </div>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
