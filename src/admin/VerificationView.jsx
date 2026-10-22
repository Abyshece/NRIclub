// Verification: the review queue, filtered by status, with the side peek.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../supabaseApi";
import MemberPeek from "./MemberPeek";
import { moderateMember } from "./moderateMember";
import { EMAILED_DECISIONS, EMAIL_DELAY_MS, emailFailed, queueDecisionEmail } from "./memberEmail";
import { Avatar, Button, EmptyState, ErrorNote, Icon, PageHeader, Pill, SkeletonRows } from "./ui";
import {
  NO_HOLD, VERIFICATION_LABELS, VERIFICATION_TONES, formatDate, friendlyError, holdSummary, identityChanged,
  isOverdue, linkedinSlug, memberFields, msSince, nameMatchesSlug, placeLabel, refusedDecisionError,
  reviewFlagLabel, shortDuration, shortName, waitingSince,
} from "./format";

export const VERIFICATION_FILTERS = ["pending", "needs_info", "incomplete", "rejected", "approved"];

const EMPTY = {
  pending: ["All caught up", "No one is waiting for verification. New requests will show up here."],
  needs_info: ["Nothing waiting on members", "Members you ask for more info appear here until they reply."],
  incomplete: ["No unfinished sign-ups", "Everyone who signed up has sent their verification details."],
  rejected: ["No rejected members", "Members whose request you reject appear here."],
  approved: ["No verified members yet", "Members you approve get the Verified badge and appear here."],
};

const TIME_HEADING = { pending: "Waiting", needs_info: "Asked", incomplete: "Joined", rejected: "Reviewed", approved: "Reviewed" };

const FRESH_MS = 10000;

// The order of each list, for "Showing 200 of 1,234, ...".
const ORDER_NOTE = { pending: "oldest first", needs_info: "oldest first", incomplete: "newest first", rejected: "newest decision first", approved: "newest decision first" };

function RowChecks({ m }) {
  const slug = linkedinSlug(m.linkedin_url);
  const hasLinkedin = !!String(m.linkedin_url || "").trim();
  const items = [];
  if (hasLinkedin) {
    const good = !!slug && nameMatchesSlug(m.name, slug);
    items.push({ key: "li", icon: "linkedin", tone: good ? "ok" : "warn", title: !slug ? "LinkedIn link isn't a profile" : good ? "LinkedIn link and name look right" : "LinkedIn name doesn't match" });
  } else {
    const hasNote = String(m.verification_note || "").trim().length >= 20;
    items.push({ key: "li", icon: "note", tone: hasNote ? "off" : "warn", title: hasNote ? "No LinkedIn — explanation provided" : "No LinkedIn and no explanation" });
  }
  items.push({ key: "mail", icon: "mail", tone: m.email_verified ? "ok" : "warn", title: m.email_verified ? "Email verified" : "Email not verified" });
  if (Number(m.same_linkedin_count) > 0) {
    const n = Number(m.same_linkedin_count);
    items.push({ key: "dupe", icon: "copy", tone: "warn", title: `LinkedIn used by ${n} other account${n === 1 ? "" : "s"}` });
  }
  return (
    <div className="adm-icons adm-vrow-icons">
      {items.map((it) => (
        <span key={it.key} className={`adm-ci adm-ci-${it.tone}`} title={it.title} aria-label={it.title} role="img">
          <Icon name={it.icon} size={13} strokeWidth={1.9} />
        </span>
      ))}
    </div>
  );
}

// counts: members per verification status; countsExact when they come from
// the server. Lists load a page at a time (api.VERIFICATION_PAGE members);
// cache.current[status] = { rows, at, total, paged }: total is how many
// there are in all, paged false before the database could give pages (the
// list then stops at 1,000 rows).
// recorded: whether the database records our team's decisions and tells the
// member (the 2026-10-21 update).
export default function VerificationView({ usersById, counts, countsExact = false, cache, onMemberChange, onMemberDeleted, showToast, recorded = true }) {
  const [filter, setFilter] = useState("pending");
  const [rows, setRows] = useState(() => cache.current.pending?.rows || null);
  const pageOf = (entry) => (entry ? { total: entry.total ?? null, paged: !!entry.paged } : null);
  const [pageInfo, setPageInfo] = useState(() => pageOf(cache.current.pending));
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(!cache.current.pending);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const listRef = useRef(null);
  const filterRef = useRef(filter);
  const rowsRef = useRef(rows);
  const reqRef = useRef(0);
  rowsRef.current = rows;

  // Counts the changes made here to each member, so a refresh that started
  // before one can't bring back what the member looked like before it.
  const changes = useRef({});
  const touch = (id) => { changes.current[id] = (changes.current[id] || 0) + 1; };

  const commitRows = useCallback((list, f) => {
    cache.current[f] = { ...(cache.current[f] || {}), rows: list, at: Date.now() };
    if (filterRef.current === f) setRows(list);
  }, [cache]);

  // A list for filter f, loaded from the server while the changes counted in
  // marks were the latest: a member decided on here since keeps their row as
  // it is now (and their place, if Undo brought them back into the list), or
  // stays out if the decision moved them out of it.
  const reconcile = useCallback((list, f, marks) => {
    const now = (filterRef.current === f ? rowsRef.current : cache.current[f]?.rows) || [];
    const changed = (id) => (changes.current[id] || 0) !== (marks[id] || 0);
    const current = new Map(now.map((r) => [r.id, r]));
    const out = list.flatMap((r) => (!changed(r.id) ? [r] : current.has(r.id) ? [current.get(r.id)] : []));
    now.forEach((r, i) => {
      if (changed(r.id) && !out.some((x) => x.id === r.id)) out.splice(Math.min(i, out.length), 0, r);
    });
    return out;
  }, [cache]);

  const load = useCallback(async (f, { silent = false } = {}) => {
    const req = ++reqRef.current;
    const marks = { ...changes.current };
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await api.adminVerificationPage(f, 0);
      if (req !== reqRef.current) return;
      cache.current[f] = { ...(cache.current[f] || {}), total: data.total, paged: data.paged };
      commitRows(reconcile(data.rows, f, marks), f);
      if (filterRef.current === f) setPageInfo(pageOf(cache.current[f]));
    } catch (e) {
      if (req !== reqRef.current) return;
      setError(friendlyError(e));
    } finally {
      if (req === reqRef.current) setLoading(false);
    }
  }, [commitRows, reconcile]);

  useEffect(() => {
    filterRef.current = filter;
    const cached = cache.current[filter];
    setRows(cached?.rows || null);
    setPageInfo(pageOf(cached));
    setOpenId(null);
    if (cached && Date.now() - cached.at < FRESH_MS) { setLoading(false); return; }
    load(filter, { silent: !!cached });
  }, [filter, load, cache]);

  // How many members list f has in all, when it comes in pages: a decision
  // here that takes a member out of it, or an Undo that brings them back,
  // changes it at once.
  const shiftTotal = (f, by) => {
    const c = cache.current[f];
    if (!c || c.total == null) return;
    cache.current[f] = { ...c, total: Math.max(0, c.total + by) };
    if (filterRef.current === f) setPageInfo(pageOf(cache.current[f]));
  };

  // The next page of this list. It starts after the members listed here who
  // are still in it on the server (a member whose status changed elsewhere
  // keeps their row, showing the new status); a member already listed isn't
  // added twice. A short page is the end of the list.
  const loadMore = async () => {
    const f = filterRef.current;
    const have = rowsRef.current || [];
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await api.adminVerificationPage(f, have.filter((r) => r.verification_status === f).length);
      if (filterRef.current !== f) return;
      const ids = new Set(have.map((r) => r.id));
      const merged = [...have, ...data.rows.filter((r) => !ids.has(r.id))];
      commitRows(merged, f);
      const total = data.paged && data.rows.length < api.VERIFICATION_PAGE
        ? merged.filter((r) => r.verification_status === f).length : data.total;
      if (total != null) {
        cache.current[f] = { ...cache.current[f], total };
        setPageInfo(pageOf(cache.current[f]));
      }
    } catch (e) {
      showToast({ text: `Couldn't load more: ${friendlyError(e)}`, tone: "error" });
    } finally {
      setLoadingMore(false);
    }
  };

  const list = rows || [];
  const openIndex = openId ? list.findIndex((r) => r.id === openId) : -1;
  const openRow = openIndex >= 0 ? list[openIndex] : null;
  const peekMember = useMemo(() => (openRow ? { ...(usersById[openRow.id] || {}), ...openRow } : null), [openRow, usersById]);

  const rowEl = (id) => (id ? listRef.current?.querySelector(`[data-id="${id}"]`) : null);
  // After the peek closes, wait a frame so it's gone before moving focus.
  const focusRowLater = (id) => requestAnimationFrame(() => rowEl(id)?.focus());
  const closePeek = () => { const id = openId; setOpenId(null); focusRowLater(id); };

  const restoreRow = (row, index, forFilter) => {
    const apply = (l) => {
      if (!l) return l;
      const i = l.findIndex((r) => r.id === row.id);
      const copy = [...l];
      if (i >= 0) copy[i] = row; else copy.splice(Math.min(index, copy.length), 0, row);
      return copy;
    };
    const cached = cache.current[forFilter];
    if (cached) cache.current[forFilter] = { ...cached, rows: apply(cached.rows) };
    if (forFilter !== "pending") delete cache.current.pending;
    if (filterRef.current === forFilter) setRows((l) => apply(l));
  };

  const patchRow = (id, patch) => {
    const apply = (l) => (l ? l.map((r) => (r.id === id ? { ...r, ...patch } : r)) : l);
    Object.keys(cache.current).forEach((f) => {
      const c = cache.current[f];
      if (c?.rows) cache.current[f] = { ...c, rows: apply(c.rows) };
    });
    setRows((l) => apply(l));
  };

  // Load the member again each time the peek opens on them, so the admin
  // decides on their details as they are now. If their name, LinkedIn link,
  // status or hold changed (or full: after a refused decision or an Undo),
  // their row is loaded again from the review queue (duplicates, notes and
  // holds may have changed too), and the other lists load again when next
  // opened. The row stays where it is in this list, showing the new status
  // if it no longer matches the filter.
  const refreshMember = async (id, { full = false } = {}) => {
    const mark = changes.current[id] || 0;
    let fresh = null;
    try { fresh = await api.adminGetReportedItem("profile", id); } catch { return; }
    if (!fresh || (changes.current[id] || 0) !== mark) return;
    const row = (rowsRef.current || []).find((r) => r.id === id);
    onMemberChange(id, fresh, row);
    const moved = !row || identityChanged(row, fresh) || row.verification_status !== fresh.verification_status
      || (row.review_flag || "") !== (fresh.review_flag || "");
    if (!full && !moved) { patchRow(id, memberFields(fresh)); return; }
    let queueRow = null;
    try { queueRow = await api.adminMemberDetails(id, fresh.verification_status); } catch { queueRow = null; }
    if ((changes.current[id] || 0) !== mark) return;
    patchRow(id, queueRow || memberFields(fresh));
    // Other lists may still have the member under their old status.
    Object.keys(cache.current).forEach((f) => { if (f !== filterRef.current) delete cache.current[f]; });
  };

  useEffect(() => {
    if (openId) refreshMember(openId);
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  // After the database refused a decision (or an Undo): show the member as
  // they are now, then the reason.
  const refused = async (id, e) => {
    await refreshMember(id, { full: true });
    return refusedDecisionError(e);
  };

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
    const f = filterRef.current;
    const current = rowsRef.current || [];
    const index = current.findIndex((r) => r.id === m.id);
    const counted = !reopening;
    const updated = {
      ...m,
      verification_status: decision,
      verification_message: decision === "needs_info" || decision === "rejected" ? message : "",
      reviewed_at: reopening ? null : new Date().toISOString(),
      previous_decisions: (Number(m.previous_decisions) || 0) + (counted ? 1 : 0),
      // Approving, or moving back to unfinished, ends a hold for review.
      ...(decision === "approved" || decision === "incomplete" ? NO_HOLD : {}),
    };
    const stays = decision === f;
    const next = stays ? current.map((r) => (r.id === m.id ? updated : r)) : current.filter((r) => r.id !== m.id);
    commitRows(next, f);
    if (!stays && index >= 0) shiftTotal(f, -1);
    // The list the member moved to loads again next time, with them in it.
    if (!stays) delete cache.current[decision];
    const after = stays ? next[index + 1] : (next[index] || next[index - 1]);
    setOpenId(after ? after.id : null);
    onMemberChange(m.id, { verification_status: decision, linkedin_verified: decision === "approved", review_flag: updated.review_flag }, m);
    // Back in review, the member is checked against rejected and blocked
    // accounts again (and gets a submission date): load what the database
    // decided.
    if (decision === "pending") refreshMember(m.id, { full: true });

    const who = shortName(m.name);
    const text = {
      approved: `Approved ${who}`,
      needs_info: `Asked ${who} for more info`,
      rejected: `Rejected ${who}`,
      pending: `Moved ${who} back to pending`,
      incomplete: `Moved ${who} back to unfinished`,
    }[decision];
    // Undo puts the member back where they were, if one step can: back in
    // the queue, or back to unfinished for someone rejected before sending
    // their details. It's refused if someone else has decided since.
    const undoable = counted && (before === "pending" || (before === "incomplete" && decision === "rejected"));
    // The member's email about it, once the Undo has gone.
    const email = EMAILED_DECISIONS.has(decision)
      ? queueDecisionEmail(m.id, decision, { delay: undoable ? EMAIL_DELAY_MS : 0, onFail: emailFailed(showToast) })
      : null;
    showToast({
      text,
      icon: decision === "approved" ? "check" : undefined,
      undo: undoable ? async () => {
        email?.cancel();
        try {
          await api.adminReviewMember(m.id, before, "", "Undo", { status: decision });
        } catch (e) {
          // The decision stands: so does its email.
          email?.sendNow();
          throw await refused(m.id, e);
        }
        touch(m.id);
        // As before the decision, hold included (the database checks it
        // again; loaded below). Moving back to unfinished ends a hold.
        const restored = {
          ...m,
          verification_message: "",
          reviewed_at: null,
          previous_decisions: updated.previous_decisions,
          ...(before === "incomplete" ? NO_HOLD : {}),
        };
        const back = !(cache.current[f]?.rows || []).some((r) => r.id === m.id);
        restoreRow(restored, index < 0 ? 0 : index, f);
        if (back) shiftTotal(f, 1);
        onMemberChange(m.id, { verification_status: before, linkedin_verified: false, review_flag: restored.review_flag }, updated);
        refreshMember(m.id, { full: true });
        return before === "pending" ? `Undone. ${who} is back in the queue.` : `Undone. ${who} is back to unfinished.`;
      } : undefined,
    });
  };

  // Warn, block, unblock, remove the photo (MemberPeek's onModerate).
  // Throws so the dialog can show why it didn't work.
  const moderate = (m, decision) => moderateMember(m, decision, {
    showToast,
    changed: (id, patch, before) => {
      touch(id);
      patchRow(id, patch);
      onMemberChange(id, patch, before ? { ...m, ...before } : m);
    },
  });

  // Deletes an account that never finished signing up (MemberPeek's
  // onDeleteSignup; the server checks again). Throws so the dialog can say why.
  const deleteSignup = async (m) => {
    const res = await api.adminDeleteSignup(m.id);
    touch(m.id);
    const f = filterRef.current;
    const current = rowsRef.current || [];
    const index = current.findIndex((r) => r.id === m.id);
    const next = current.filter((r) => r.id !== m.id);
    commitRows(next, f);
    if (index >= 0) shiftTotal(f, -1);
    const after = next[index] || next[index - 1];
    setOpenId(after ? after.id : null);
    onMemberDeleted?.(m.id, m);
    showToast({ text: `Deleted ${shortName(m.name)}'s unfinished sign-up${res?.recorded === false ? ". It couldn't be recorded in the log" : ""}` });
  };

  const onRowKey = (e, id, i) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(id); }
    else if (e.key === "ArrowDown" && list[i + 1]) { e.preventDefault(); rowEl(list[i + 1].id)?.focus(); }
    else if (e.key === "ArrowUp" && list[i - 1]) { e.preventDefault(); rowEl(list[i - 1].id)?.focus(); }
  };

  const paged = !!pageInfo?.paged && pageInfo.total != null;
  const countFor = (f) => (f === filter && rows && !countsExact ? (paged ? pageInfo.total : rows.length) : counts[f] ?? 0);
  // Lists come a page at a time (or, before the database gave pages, stop
  // at 1,000 members): say so when there are more.
  const filterTotal = paged ? pageInfo.total : countsExact ? counts[filter] ?? 0 : 0;
  const cut = !!rows && rows.length > 0 && filterTotal > rows.length;
  const morePages = paged && !!rows && rows.length < pageInfo.total;
  const [emptyTitle, emptyText] = EMPTY[filter];

  return (
    <>
      <PageHeader title="Verification" description="Check new members and give them the Verified badge. Until you approve them, members can't see other members or take part, and other members can't see them." />

      <div className="adm-filters" role="group" aria-label="Filter by status">
        {VERIFICATION_FILTERS.map((f) => (
          <button key={f} type="button" className="adm-filter" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {VERIFICATION_LABELS[f]}
            <span className="adm-filter-count">{countFor(f)}</span>
          </button>
        ))}
      </div>

      {error && <ErrorNote onRetry={() => load(filter)}>{error}</ErrorNote>}
      {cut && (
        <p className="adm-muted adm-small" style={{ margin: "0 0 10px" }}>
          {/* Before the 2026-10-23 database update every list but unfinished sign-ups came oldest first. */}
          {`Showing ${rows.length.toLocaleString("en-GB")} of ${filterTotal.toLocaleString("en-GB")}, ${paged ? ORDER_NOTE[filter] : filter === "incomplete" ? "newest first" : "oldest first"}.`}
        </p>
      )}

      {loading && !rows ? <SkeletonRows rows={4} /> : rows && rows.length === 0 && !error ? (
        <EmptyState icon={filter === "pending" ? "checkCircle" : "users"} title={emptyTitle}>{emptyText}</EmptyState>
      ) : rows ? (
        <div className="adm-list" ref={listRef} role="list" aria-label={`${VERIFICATION_LABELS[filter]} members`}>
          <div className="adm-list-head adm-vhead" aria-hidden="true">
            <span />
            <span>Member</span>
            <span>Lives in</span>
            <span>Checks</span>
            <span style={{ textAlign: "right" }}>{TIME_HEADING[filter]}</span>
          </div>
          {rows.map((m, i) => {
            const since = waitingSince(m);
            const late = isOverdue(m);
            const status = m.verification_status;
            return (
              <div key={m.id} data-id={m.id} role="listitem" tabIndex={0}
                className={`adm-row adm-vrow${m.id === openId ? " is-selected" : ""}`}
                aria-label={[m.name || "Unnamed member", m.review_flag ? reviewFlagLabel(m.review_flag).toLowerCase() : "", placeLabel(m),
                  late ? "waiting over 24 hours" : `${TIME_HEADING[filter].toLowerCase()} ${shortDuration(msSince(since))}`].filter(Boolean).join(", ")}
                onClick={() => setOpenId(m.id)} onKeyDown={(e) => onRowKey(e, m.id, i)}>
                <Avatar name={m.name} url={m.avatar_url} size={26} />
                <div className="adm-row-name adm-vrow-name">
                  <span>{m.name || "Unnamed member"}</span>
                  {status !== filter && <Pill tone={VERIFICATION_TONES[status]}>{VERIFICATION_LABELS[status]}</Pill>}
                  {m.status === "blocked" && <Pill tone="red">Blocked</Pill>}
                  {m.review_flag && <Pill tone="red" title={holdSummary(m)}>{reviewFlagLabel(m.review_flag)}</Pill>}
                </div>
                <div className="adm-vrow-place adm-ellipsis adm-muted">{placeLabel(m) || "—"}</div>
                <RowChecks m={m} />
                <div className={`adm-vrow-time${late ? " is-late" : ""}`} title={`${TIME_HEADING[filter]} since ${formatDate(since, { time: true })}`}>
                  {shortDuration(msSince(since))}
                </div>
              </div>
            );
          })}
          {morePages && (
            <div className="adm-more">
              <Button variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : `Show ${Math.min(api.VERIFICATION_PAGE, pageInfo.total - rows.length).toLocaleString("en-GB")} more`}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {peekMember && (
        <MemberPeek
          member={peekMember}
          index={openIndex}
          total={list.length}
          onClose={closePeek}
          onPrev={openIndex > 0 ? () => setOpenId(list[openIndex - 1].id) : null}
          onNext={openIndex < list.length - 1 ? () => setOpenId(list[openIndex + 1].id) : null}
          recorded={recorded}
          onDecision={decide}
          onModerate={moderate}
          onDeleteSignup={deleteSignup}
        />
      )}
    </>
  );
}
