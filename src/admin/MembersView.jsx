// Members: everyone who has joined, with search, block / unblock and the
// same peek as Verification.
import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../supabaseApi";
import MemberPeek from "./MemberPeek";
import { Avatar, Button, ConfirmDialog, EmptyState, Icon, PageHeader, Pill } from "./ui";
import { VERIFICATION_LABELS, VERIFICATION_TONES, formatDate, friendlyError, placeLabel, shortName } from "./format";

const PAGE = 100;

export default function MembersView({ users, onMemberChange, showToast }) {
  const [query, setQuery] = useState("");
  const [show, setShow] = useState("all"); // all | blocked
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState(null);
  const [details, setDetails] = useState({}); // id -> row from admin_verification_queue
  const [loadingDetails, setLoadingDetails] = useState({}); // status -> true while its rows load
  const [confirm, setConfirm] = useState(null); // member to block
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const listRef = useRef(null);
  const fetchedStatuses = useRef(new Set());

  const blockedCount = users.filter((u) => u.status === "blocked").length;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (show === "blocked" && u.status !== "blocked") return false;
      if (!q) return true;
      return [u.name, u.email, u.city, u.location].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [users, query, show]);
  const visible = filtered.slice(0, limit);

  useEffect(() => { setLimit(PAGE); }, [query, show]);

  const openIndex = openId ? filtered.findIndex((u) => u.id === openId) : -1;
  const openUser = openIndex >= 0 ? filtered[openIndex] : (openId ? users.find((u) => u.id === openId) : null);

  // The members list has the public profile; the review queue has the rest
  // (consents, explanation, duplicates). Load it for the member's status.
  useEffect(() => {
    if (!openUser) return;
    const status = openUser.verification_status;
    if (details[openUser.id] || fetchedStatuses.current.has(status)) return;
    fetchedStatuses.current.add(status);
    setLoadingDetails((l) => ({ ...l, [status]: true }));
    // Rows are keyed by id, so keep them even if the admin has moved on.
    // On failure, forget the status so the next open tries again.
    api.adminVerificationQueue([status])
      .then((rows) => {
        setDetails((d) => {
          const next = { ...d };
          (rows || []).forEach((r) => { next[r.id] = r; });
          return next;
        });
      })
      .catch(() => { fetchedStatuses.current.delete(status); })
      .finally(() => { setLoadingDetails((l) => ({ ...l, [status]: false })); });
  }, [openUser?.id, openUser?.verification_status]); // eslint-disable-line react-hooks/exhaustive-deps

  const peekMember = useMemo(() => {
    if (!openUser) return null;
    const d = details[openUser.id];
    if (!d) {
      // Fall back to what we can work out from the members list.
      const sameLinkedin = openUser.linkedin_url
        ? users.filter((u) => u.id !== openUser.id && u.linkedin_url === openUser.linkedin_url).length
        : 0;
      return { ...openUser, same_linkedin_count: sameLinkedin };
    }
    return { ...openUser, ...d, verification_status: openUser.verification_status, status: openUser.status, name: openUser.name };
  }, [openUser, details, users]);

  const patchDetails = (id, patch) => setDetails((d) => (d[id] ? { ...d, [id]: { ...d[id], ...patch } } : d));

  const focusRow = (id) => requestAnimationFrame(() => {
    const el = id && listRef.current?.querySelector(`[data-id="${id}"]`);
    if (el) el.focus();
  });

  const decide = async (m, decision, message = "", note = "") => {
    await api.adminReviewMember(m.id, decision, message, note);
    const counted = decision !== "pending";
    const before = { verification_message: m.verification_message, reviewed_at: m.reviewed_at, previous_decisions: m.previous_decisions };
    patchDetails(m.id, {
      verification_message: decision === "needs_info" || decision === "rejected" ? message : "",
      reviewed_at: decision === "pending" ? null : new Date().toISOString(),
      previous_decisions: (Number(m.previous_decisions) || 0) + (counted ? 1 : 0),
      verification_status: decision,
    });
    onMemberChange(m.id, { verification_status: decision, linkedin_verified: decision === "approved" });
    const who = shortName(m.name);
    showToast({
      text: { approved: `Approved ${who}`, needs_info: `Asked ${who} for more info`, rejected: `Rejected ${who}`, pending: `Moved ${who} back to pending` }[decision],
      icon: decision === "approved" ? "check" : undefined,
      // Undo moves the member back to pending, so only offer it if that's where they were.
      undo: counted && m.verification_status === "pending" ? async () => {
        await api.adminReviewMember(m.id, "pending", "", "Undo");
        patchDetails(m.id, { ...before, verification_message: "", reviewed_at: null, verification_status: "pending" });
        onMemberChange(m.id, { verification_status: "pending", linkedin_verified: false });
        return `Undone. ${who} is now pending.`;
      } : undefined,
    });
  };

  const setStatus = async (m, status) => {
    await api.adminSetMemberStatus(m.id, status);
    onMemberChange(m.id, { status });
    const who = shortName(m.name);
    showToast(status === "blocked"
      ? {
        text: `Blocked ${who}`,
        undo: async () => {
          await api.adminSetMemberStatus(m.id, "active");
          onMemberChange(m.id, { status: "active" });
          return `Unblocked ${who}`;
        },
      }
      : { text: `Unblocked ${who}` });
  };

  const confirmBlock = async () => {
    setConfirmBusy(true);
    setConfirmError("");
    try {
      await setStatus(confirm, "blocked");
      setConfirm(null);
    } catch (e) {
      setConfirmError(friendlyError(e));
    } finally {
      setConfirmBusy(false);
    }
  };

  const unblock = async (u) => {
    try { await setStatus(u, "active"); } catch (e) { showToast({ text: friendlyError(e), tone: "error" }); }
  };

  return (
    <>
      <PageHeader title="Members" description="Everyone who has joined NRIClub. Open a member to review them, or block an account." />

      <div className="adm-toolbar">
        <label className="adm-search">
          <Icon name="search" size={15} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or city" aria-label="Search members" />
        </label>
        <div className="adm-filters" role="group" aria-label="Show">
          <button type="button" className="adm-filter" aria-pressed={show === "all"} onClick={() => setShow("all")}>All <span className="adm-filter-count">{users.length}</span></button>
          <button type="button" className="adm-filter" aria-pressed={show === "blocked"} onClick={() => setShow("blocked")}>Blocked <span className="adm-filter-count">{blockedCount}</span></button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={query ? "search" : "users"} title={query ? "No members match" : show === "blocked" ? "No blocked accounts" : "No members yet"}>
          {query ? "Try a different name, email or city." : show === "blocked" ? "Accounts you block appear here." : null}
        </EmptyState>
      ) : (
        <div className="adm-list" ref={listRef} role="table" aria-label="Members">
          <div className="adm-list-head adm-mhead" role="row">
            <span role="columnheader">Name</span>
            <span role="columnheader">Location</span>
            <span role="columnheader">Verification</span>
            <span role="columnheader">Account</span>
            <span role="columnheader">Joined</span>
            <span role="columnheader" style={{ textAlign: "right" }}><span className="adm-sr">Actions</span></span>
          </div>
          {visible.map((u) => {
            const vs = u.verification_status || "incomplete";
            const blocked = u.status === "blocked";
            return (
              <div key={u.id} data-id={u.id} role="row" tabIndex={0}
                className={`adm-row adm-mrow${u.id === openId ? " is-selected" : ""}`}
                onClick={() => setOpenId(u.id)}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpenId(u.id); } }}>
                <div className="adm-mcell-name" role="cell" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <Avatar name={u.name} url={u.avatar_url} size={26} />
                  <div style={{ minWidth: 0 }}>
                    <div className="adm-ellipsis" style={{ fontWeight: 500 }}>{u.name || "Unnamed member"}</div>
                    <div className="adm-mrow-email">{u.email || "—"}</div>
                  </div>
                </div>
                <div className="adm-mcell-loc adm-ellipsis adm-muted" role="cell" title={placeLabel(u)}>{placeLabel(u) || "—"}</div>
                <div className="adm-mcell-ver" role="cell"><Pill tone={VERIFICATION_TONES[vs]}>{VERIFICATION_LABELS[vs] || vs}</Pill></div>
                <div className="adm-mcell-acc" role="cell">{blocked ? <Pill tone="red">Blocked</Pill> : <Pill tone="gray">Active</Pill>}</div>
                <div className="adm-mcell-joined adm-muted" role="cell" style={{ fontSize: 13 }}>{formatDate(u.created_at)}</div>
                <div className="adm-mcell-meta" style={{ display: "none" }}>
                  <Pill tone={VERIFICATION_TONES[vs]}>{VERIFICATION_LABELS[vs] || vs}</Pill>
                  {blocked && <Pill tone="red">Blocked</Pill>}
                  <span className="adm-faint adm-small adm-ellipsis">{placeLabel(u)}</span>
                </div>
                <div className="adm-mrow-actions" role="cell">
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setOpenId(u.id); }}>View</Button>
                  {blocked
                    ? <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); unblock(u); }}>Unblock</Button>
                    : <Button variant="ghost" size="sm" className="adm-btn-ghost-danger" onClick={(e) => { e.stopPropagation(); setConfirmError(""); setConfirm(u); }}>Block</Button>}
                </div>
              </div>
            );
          })}
          {filtered.length > visible.length && (
            <div className="adm-more">
              <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, filtered.length - visible.length)} more</Button>
            </div>
          )}
        </div>
      )}

      {peekMember && (
        <MemberPeek
          member={peekMember}
          loadingDetails={!!loadingDetails[peekMember.verification_status] && !details[peekMember.id]}
          index={openIndex >= 0 ? openIndex : 0}
          total={openIndex >= 0 ? filtered.length : 1}
          onClose={() => { const id = openId; setOpenId(null); focusRow(id); }}
          onPrev={openIndex > 0 ? () => setOpenId(filtered[openIndex - 1].id) : null}
          onNext={openIndex >= 0 && openIndex < filtered.length - 1 ? () => setOpenId(filtered[openIndex + 1].id) : null}
          onDecision={decide}
          onSetStatus={setStatus}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={`Block ${confirm.name || "this member"}?`}
          confirmLabel="Block account"
          busy={confirmBusy}
          error={confirmError}
          onConfirm={confirmBlock}
          onCancel={() => { setConfirm(null); focusRow(confirm.id); }}>
          They can still sign in, but can't post, message or connect with anyone until you unblock them.
        </ConfirmDialog>
      )}
    </>
  );
}
