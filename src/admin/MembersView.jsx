// Members: everyone who has joined, with search, block / unblock and the
// same peek as Verification.
import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../supabaseApi";
import MemberPeek from "./MemberPeek";
import { Avatar, Button, ConfirmDialog, EmptyState, Icon, PageHeader, Pill } from "./ui";
import {
  NO_HOLD, VERIFICATION_LABELS, VERIFICATION_TONES, formatDate, friendlyError, holdSummary, identityChanged,
  memberFields, placeLabel, refusedDecisionError, reviewFlagLabel, shortName,
} from "./format";

const PAGE = 100;

const fmt = (n) => n.toLocaleString("en-GB");

// users holds the newest members (at most 1,000); total and blockedTotal are
// the server's counts of all of them.
export default function MembersView({ users, total = users.length, blockedTotal = null, onMemberChange, showToast }) {
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
  const detailsRef = useRef(details);
  detailsRef.current = details;

  const blockedCount = blockedTotal ?? users.filter((u) => u.status === "blocked").length;
  const cut = users.length < total;
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

  // Counts the changes made here to each member, so a refresh that started
  // before one can't bring back what the member looked like before it.
  const changes = useRef({});
  const touch = (id) => { changes.current[id] = (changes.current[id] || 0) + 1; };

  // The members list has the public profile; the review queue has the rest
  // (consents, explanation, duplicates, submission, hold). Load it for the
  // member's status. Resolves when done (never rejects).
  const loadDetails = (status) => {
    fetchedStatuses.current.add(status);
    setLoadingDetails((l) => ({ ...l, [status]: true }));
    const marks = { ...changes.current };
    // Rows are keyed by id, so keep them even if the admin has moved on, but
    // not over members decided on here while they loaded. On failure, forget
    // the status so the next open tries again.
    return api.adminVerificationQueue([status])
      .then((rows) => {
        setDetails((d) => {
          const next = { ...d };
          (rows || []).forEach((r) => {
            if ((changes.current[r.id] || 0) === (marks[r.id] || 0)) next[r.id] = r;
          });
          return next;
        });
      })
      .catch(() => { fetchedStatuses.current.delete(status); })
      .finally(() => { setLoadingDetails((l) => ({ ...l, [status]: false })); });
  };

  useEffect(() => {
    if (!openUser) return;
    const status = openUser.verification_status;
    if (details[openUser.id] || fetchedStatuses.current.has(status)) return;
    loadDetails(status);
  }, [openUser?.id, openUser?.verification_status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the member again each time the peek opens on them, so the admin
  // decides on their details as they are now. If the name, LinkedIn link,
  // status or hold changed, load their review details again too (until
  // they're back the peek shows only what the members list has); full:
  // load them again anyway (after a refused decision or an Undo).
  const refreshMember = async (id, { full = false } = {}) => {
    const mark = changes.current[id] || 0;
    let fresh = null;
    try { fresh = await api.adminGetReportedItem("profile", id); } catch { return; }
    if (!fresh || (changes.current[id] || 0) !== mark) return;
    const d = detailsRef.current[id];
    onMemberChange(id, fresh);
    const stale = !!d && (identityChanged(d, fresh) || d.verification_status !== fresh.verification_status
      || (d.review_flag || "") !== (fresh.review_flag || ""));
    if (stale) setDetails((prev) => { const next = { ...prev }; delete next[id]; return next; });
    if (stale || full) await loadDetails(fresh.verification_status);
    else if (d) patchDetails(id, memberFields(fresh));
  };

  // After the database refused a decision (or an Undo): show the member as
  // they are now, then the reason.
  const refused = async (id, e) => {
    await refreshMember(id, { full: true });
    return refusedDecisionError(e);
  };

  useEffect(() => {
    if (openId) refreshMember(openId);
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    return { ...openUser, ...d, verification_status: openUser.verification_status, status: openUser.status, name: openUser.name, review_flag: openUser.review_flag ?? d.review_flag };
  }, [openUser, details, users]);

  const patchDetails = (id, patch) => setDetails((d) => (d[id] ? { ...d, [id]: { ...d[id], ...patch } } : d));

  const focusRow = (id) => requestAnimationFrame(() => {
    const el = id && listRef.current?.querySelector(`[data-id="${id}"]`);
    if (el) el.focus();
  });

  // Approve / ask for info / reject / move to pending / move back to
  // unfinished. Throws on failure so the peek can show the database's message.
  const decide = async (m, decision, message = "", note = "") => {
    const before = m.verification_status;
    // What the admin is looking at: the database refuses the decision if the
    // member's status has changed since, or (for a decision on their
    // details) their name or LinkedIn link.
    const reopening = decision === "pending" || decision === "incomplete";
    const expected = reopening
      ? { status: before }
      : { status: before, name: m.name ?? null, linkedinUrl: m.linkedin_url ?? null };
    try {
      await api.adminReviewMember(m.id, decision, message, note, expected);
    } catch (e) {
      throw await refused(m.id, e);
    }
    touch(m.id);
    const counted = !reopening;
    // Approving, or moving back to unfinished, ends a hold for review.
    const endsHold = decision === "approved" || decision === "incomplete";
    const previous = {
      verification_message: m.verification_message,
      reviewed_at: m.reviewed_at,
      review_flag: m.review_flag,
      flag_decision: m.flag_decision,
      flag_matched_on: m.flag_matched_on,
      flag_note: m.flag_note,
      flag_date: m.flag_date,
    };
    const decided = {
      verification_message: decision === "needs_info" || decision === "rejected" ? message : "",
      reviewed_at: reopening ? null : new Date().toISOString(),
      previous_decisions: (Number(m.previous_decisions) || 0) + (counted ? 1 : 0),
      verification_status: decision,
      ...(endsHold ? NO_HOLD : {}),
    };
    patchDetails(m.id, decided);
    onMemberChange(m.id, { verification_status: decision, linkedin_verified: decision === "approved", ...(endsHold ? { review_flag: "" } : {}) });
    // Back in review, the member is checked against rejected and blocked
    // accounts again (and gets a submission date): load what the database
    // decided.
    if (decision === "pending") refreshMember(m.id, { full: true });
    const who = shortName(m.name);
    // Undo puts the member back where they were, if one step can: back in
    // the queue, or back to unfinished for someone rejected before sending
    // their details. It's refused if someone else has decided since.
    const undoable = counted && (before === "pending" || (before === "incomplete" && decision === "rejected"));
    showToast({
      text: {
        approved: `Approved ${who}`,
        needs_info: `Asked ${who} for more info`,
        rejected: `Rejected ${who}`,
        pending: `Moved ${who} back to pending`,
        incomplete: `Moved ${who} back to unfinished`,
      }[decision],
      icon: decision === "approved" ? "check" : undefined,
      undo: undoable ? async () => {
        try {
          await api.adminReviewMember(m.id, before, "", "Undo", { status: decision });
        } catch (e) {
          throw await refused(m.id, e);
        }
        touch(m.id);
        // As before the decision, hold included (the database checks it
        // again; loaded below). Moving back to unfinished ends a hold.
        const restored = {
          ...previous,
          verification_message: "",
          reviewed_at: null,
          verification_status: before,
          ...(before === "incomplete" ? NO_HOLD : {}),
        };
        patchDetails(m.id, restored);
        onMemberChange(m.id, { verification_status: before, linkedin_verified: false, review_flag: restored.review_flag || "" });
        refreshMember(m.id, { full: true });
        return before === "pending" ? `Undone. ${who} is now pending.` : `Undone. ${who} is back to unfinished.`;
      } : undefined,
    });
  };

  const setStatus = async (m, status) => {
    await api.adminSetMemberStatus(m.id, status);
    touch(m.id);
    onMemberChange(m.id, { status });
    const who = shortName(m.name);
    showToast(status === "blocked"
      ? {
        text: `Blocked ${who}`,
        undo: async () => {
          await api.adminSetMemberStatus(m.id, "active");
          touch(m.id);
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
          <button type="button" className="adm-filter" aria-pressed={show === "all"} onClick={() => setShow("all")}>All <span className="adm-filter-count">{fmt(total)}</span></button>
          <button type="button" className="adm-filter" aria-pressed={show === "blocked"} onClick={() => setShow("blocked")}>Blocked <span className="adm-filter-count">{fmt(blockedCount)}</span></button>
        </div>
      </div>

      {cut && (
        <p className="adm-muted adm-small" style={{ margin: "0 0 10px" }}>
          Showing the newest {fmt(users.length)} of {fmt(total)} members. Search and the Blocked filter only cover these.
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={query ? "search" : "users"} title={query ? "No members match" : show === "blocked" ? (blockedCount > 0 ? "No blocked accounts among these members" : "No blocked accounts") : "No members yet"}>
          {query ? "Try a different name, email or city." : show === "blocked" ? (blockedCount > 0 ? "Blocked accounts that joined earlier aren't loaded here." : "Accounts you block appear here.") : null}
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
            // Held for review: the details of the hold are in the peek.
            const held = !!u.review_flag;
            return (
              <div key={u.id} data-id={u.id} role="row" tabIndex={0}
                className={`adm-row adm-mrow${u.id === openId ? " is-selected" : ""}`}
                onClick={() => setOpenId(u.id)}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpenId(u.id); } }}>
                <div className="adm-mcell-name" role="cell" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <Avatar name={u.name} url={u.avatar_url} size={26} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 2, minWidth: 0 }}>
                      <span className="adm-ellipsis" style={{ fontWeight: 500 }}>{u.name || "Unnamed member"}</span>
                      {held && <span className="adm-mrow-held"><Pill tone="red" title={holdSummary(u)}>{reviewFlagLabel(u.review_flag)}</Pill></span>}
                    </div>
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
                  {held && <Pill tone="red" title={holdSummary(u)}>{reviewFlagLabel(u.review_flag)}</Pill>}
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
