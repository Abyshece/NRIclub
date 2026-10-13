// Communities: requests for new communities first, then the active ones.
import { useState } from "react";
import * as api from "../supabaseApi";
import { Button, ConfirmDialog, EmptyState, PageHeader, Pill, SectionTitle } from "./ui";
import { ago, friendlyError, isNothingChangedError } from "./format";

// onReload loads the panel's data again.
export default function CommunitiesView({ groups, setGroups, usersById, showToast, onReload }) {
  const [busyId, setBusyId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [confirmError, setConfirmError] = useState("");

  const pending = groups.filter((g) => !g.is_approved);
  const active = groups.filter((g) => g.is_approved).sort((a, b) => (b.members_count || 0) - (a.members_count || 0));
  const creatorName = (g) => (g.created_by && usersById[g.created_by]?.name) || null;

  // Approve and reject only touch a request that is still waiting. If it
  // isn't (another admin got there first), show the list as it is now.
  const alreadyHandled = () => {
    showToast({ text: "This request may already have been handled, so nothing was changed. Reloading the list." });
    onReload?.();
  };

  const approve = async (g) => {
    if (busyId) return;
    setBusyId(g.id);
    try {
      await api.adminApproveGroup(g.id);
    } catch (e) {
      setBusyId(null);
      if (isNothingChangedError(e)) alreadyHandled();
      else showToast({ text: friendlyError(e), tone: "error" });
      return;
    }
    if (g.created_by) {
      try { await api.adminNotify(g.created_by, "group", `Your community "${g.name}" has been approved!`); } catch { /* the approval itself worked */ }
    }
    setGroups((prev) => prev.map((x) => (x.id === g.id ? { ...x, is_approved: true } : x)));
    showToast({ text: `Approved ${g.name}`, icon: "check" });
    setBusyId(null);
  };

  const reject = async () => {
    const g = confirm;
    setBusyId(g.id);
    setConfirmError("");
    try {
      await api.adminRejectGroupRequest(g.id);
    } catch (e) {
      setBusyId(null);
      if (isNothingChangedError(e)) { setConfirm(null); alreadyHandled(); } else setConfirmError(friendlyError(e));
      return;
    }
    if (g.created_by) {
      try { await api.adminNotify(g.created_by, "group", `Your community request "${g.name}" was not approved.`); } catch { /* the rejection itself worked */ }
    }
    setGroups((prev) => prev.filter((x) => x.id !== g.id));
    setConfirm(null);
    setBusyId(null);
    showToast({ text: `Rejected ${g.name}` });
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
            <Button variant="secondary" size="sm" onClick={() => { setConfirmError(""); setConfirm(g); }} disabled={busyId === g.id}>Reject</Button>
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
        </div>
      ))}

      {confirm && (
        <ConfirmDialog
          title={`Reject "${confirm.name}"?`}
          confirmLabel="Reject request"
          busy={busyId === confirm.id}
          error={confirmError}
          onConfirm={reject}
          onCancel={() => setConfirm(null)}>
          The request is deleted{confirm.created_by ? " and the member who asked for it gets a notification" : ""}.
        </ConfirmDialog>
      )}
    </>
  );
}
