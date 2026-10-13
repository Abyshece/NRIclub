// Verification: the review queue, filtered by status, with the side peek.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../supabaseApi";
import MemberPeek from "./MemberPeek";
import { Avatar, EmptyState, ErrorNote, Icon, PageHeader, Pill, SkeletonRows } from "./ui";
import {
  CHANGED_DETAILS_TEXT, VERIFICATION_LABELS, VERIFICATION_TONES, formatDate, friendlyError, identityChanged,
  isChangedDetailsError, isOverdue, linkedinSlug, memberFields, msSince, nameMatchesSlug, placeLabel,
  reviewFlagLabel, reviewFlagText, shortDuration, shortName, waitingSince,
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
// the server (the lists themselves stop at 1,000 rows).
export default function VerificationView({ usersById, counts, countsExact = false, cache, onMemberChange, showToast }) {
  const [filter, setFilter] = useState("pending");
  const [rows, setRows] = useState(() => cache.current.pending?.rows || null);
  const [loading, setLoading] = useState(!cache.current.pending);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const listRef = useRef(null);
  const filterRef = useRef(filter);
  const rowsRef = useRef(rows);
  const reqRef = useRef(0);
  rowsRef.current = rows;

  const commitRows = useCallback((list, f) => {
    cache.current[f] = { rows: list, at: Date.now() };
    if (filterRef.current === f) setRows(list);
  }, [cache]);

  const load = useCallback(async (f, { silent = false } = {}) => {
    const req = ++reqRef.current;
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await api.adminVerificationQueue([f]);
      if (req !== reqRef.current) return;
      commitRows(Array.isArray(data) ? data : [], f);
    } catch (e) {
      if (req !== reqRef.current) return;
      setError(friendlyError(e));
    } finally {
      if (req === reqRef.current) setLoading(false);
    }
  }, [commitRows]);

  useEffect(() => {
    filterRef.current = filter;
    const cached = cache.current[filter];
    setRows(cached?.rows || null);
    setOpenId(null);
    if (cached && Date.now() - cached.at < FRESH_MS) { setLoading(false); return; }
    load(filter, { silent: !!cached });
  }, [filter, load, cache]);

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

  // Counts the changes made here to each member, so a refresh that started
  // before one can't bring back what the member looked like before it.
  const changes = useRef({});
  const touch = (id) => { changes.current[id] = (changes.current[id] || 0) + 1; };

  // Load the member again each time the peek opens on them, so the admin
  // decides on their details as they are now. If the name or LinkedIn link
  // changed, reload the list as well (duplicates and notes may have too).
  const refreshMember = async (id) => {
    const mark = changes.current[id] || 0;
    let fresh = null;
    try { fresh = await api.adminGetReportedItem("profile", id); } catch { return; }
    if (!fresh || (changes.current[id] || 0) !== mark) return;
    const row = (rowsRef.current || []).find((r) => r.id === id);
    patchRow(id, memberFields(fresh));
    onMemberChange(id, fresh, row);
    if (row && identityChanged(row, fresh)) load(filterRef.current, { silent: true });
  };

  useEffect(() => {
    if (openId) refreshMember(openId);
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Approve / ask for info / reject / move to pending. Throws on failure so
  // the peek can show the database's message.
  const decide = async (m, decision, message = "", note = "") => {
    // The name and LinkedIn link the admin is looking at: the database
    // refuses the decision if the member has changed either since.
    const expected = decision === "pending" ? null : { name: m.name ?? null, linkedinUrl: m.linkedin_url ?? null };
    try {
      await api.adminReviewMember(m.id, decision, message, note, expected);
    } catch (e) {
      if (!isChangedDetailsError(e)) throw e;
      await refreshMember(m.id);
      throw new Error(CHANGED_DETAILS_TEXT);
    }
    touch(m.id);
    const f = filterRef.current;
    const current = rowsRef.current || [];
    const index = current.findIndex((r) => r.id === m.id);
    const counted = decision !== "pending";
    const updated = {
      ...m,
      verification_status: decision,
      verification_message: decision === "needs_info" || decision === "rejected" ? message : "",
      reviewed_at: decision === "pending" ? null : new Date().toISOString(),
      previous_decisions: (Number(m.previous_decisions) || 0) + (counted ? 1 : 0),
      // Approving clears the review flag.
      review_flag: decision === "approved" ? "" : m.review_flag,
    };
    const stays = decision === f;
    const next = stays ? current.map((r) => (r.id === m.id ? updated : r)) : current.filter((r) => r.id !== m.id);
    commitRows(next, f);
    const after = stays ? next[index + 1] : (next[index] || next[index - 1]);
    setOpenId(after ? after.id : null);
    onMemberChange(m.id, { verification_status: decision, linkedin_verified: decision === "approved", review_flag: updated.review_flag }, m);

    const who = shortName(m.name);
    const text = {
      approved: `Approved ${who}`,
      needs_info: `Asked ${who} for more info`,
      rejected: `Rejected ${who}`,
      pending: `Moved ${who} back to pending`,
    }[decision];
    showToast({
      text,
      icon: decision === "approved" ? "check" : undefined,
      // Undo moves the member back to pending, so only offer it if that's where they were.
      undo: counted && m.verification_status === "pending" ? async () => {
        await api.adminReviewMember(m.id, "pending", "", "Undo");
        touch(m.id);
        const restored = { ...updated, verification_status: "pending", verification_message: "", reviewed_at: null };
        restoreRow(restored, index < 0 ? 0 : index, f);
        onMemberChange(m.id, { verification_status: "pending", linkedin_verified: false }, updated);
        return `Undone. ${who} is back in the queue.`;
      } : undefined,
    });
  };

  const setStatus = async (m, status) => {
    await api.adminSetMemberStatus(m.id, status);
    touch(m.id);
    patchRow(m.id, { status });
    onMemberChange(m.id, { status }, m);
    const who = shortName(m.name);
    showToast(status === "blocked"
      ? {
        text: `Blocked ${who}`,
        undo: async () => {
          await api.adminSetMemberStatus(m.id, "active");
          touch(m.id);
          patchRow(m.id, { status: "active" });
          onMemberChange(m.id, { status: "active" }, { status: "blocked" });
          return `Unblocked ${who}`;
        },
      }
      : { text: `Unblocked ${who}` });
  };

  const onRowKey = (e, id, i) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(id); }
    else if (e.key === "ArrowDown" && list[i + 1]) { e.preventDefault(); rowEl(list[i + 1].id)?.focus(); }
    else if (e.key === "ArrowUp" && list[i - 1]) { e.preventDefault(); rowEl(list[i - 1].id)?.focus(); }
  };

  const countFor = (f) => (f === filter && rows && !countsExact ? rows.length : counts[f] ?? 0);
  // A list stops at 1,000 members: say so when there are more.
  const filterTotal = countsExact ? counts[filter] ?? 0 : 0;
  const cut = !!rows && rows.length > 0 && filterTotal > rows.length;
  const [emptyTitle, emptyText] = EMPTY[filter];

  return (
    <>
      <PageHeader title="Verification" description="Check new members and give them the Verified badge. Members have full access while they wait, unless they're flagged." />

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
          {/* The database lists unfinished sign-ups newest first, everyone else oldest first. */}
          {filter === "incomplete"
            ? `Showing the newest ${rows.length.toLocaleString("en-GB")} of ${filterTotal.toLocaleString("en-GB")}.`
            : `Showing the first ${rows.length.toLocaleString("en-GB")} of ${filterTotal.toLocaleString("en-GB")}, oldest first.`}
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
                aria-label={`${m.name}${m.review_flag ? `, ${reviewFlagLabel(m.review_flag).toLowerCase()}` : ""}, ${placeLabel(m)}, ${late ? "waiting over 24 hours" : `${TIME_HEADING[filter].toLowerCase()} ${shortDuration(msSince(since))}`}`}
                onClick={() => setOpenId(m.id)} onKeyDown={(e) => onRowKey(e, m.id, i)}>
                <Avatar name={m.name} url={m.avatar_url} size={26} />
                <div className="adm-row-name adm-vrow-name">
                  <span>{m.name || "Unnamed member"}</span>
                  {status !== filter && <Pill tone={VERIFICATION_TONES[status]}>{VERIFICATION_LABELS[status]}</Pill>}
                  {m.status === "blocked" && <Pill tone="red">Blocked</Pill>}
                  {m.review_flag && <Pill tone="red" title={reviewFlagText(m.review_flag)}>{reviewFlagLabel(m.review_flag)}</Pill>}
                </div>
                <div className="adm-vrow-place adm-ellipsis adm-muted">{placeLabel(m) || "—"}</div>
                <RowChecks m={m} />
                <div className={`adm-vrow-time${late ? " is-late" : ""}`} title={`${TIME_HEADING[filter]} since ${formatDate(since, { time: true })}`}>
                  {shortDuration(msSince(since))}
                </div>
              </div>
            );
          })}
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
          onDecision={decide}
          onSetStatus={setStatus}
        />
      )}
    </>
  );
}
