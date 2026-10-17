// Members: everyone who has joined, with search, block / unblock and the
// same peek as Verification. A block (like a warning, or removing a photo or
// bio) goes through the database with the reasons the member is told.
import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../supabaseApi";
import MemberPeek, { MemberModeration } from "./MemberPeek";
import { moderateMember } from "./moderateMember";
import { Avatar, Button, EmptyState, ErrorNote, Icon, PageHeader, Pill, SkeletonRows } from "./ui";
import {
  NO_HOLD, VERIFICATION_LABELS, VERIFICATION_TONES, formatDate, friendlyError, holdSummary, identityChanged,
  memberFields, placeLabel, refusedDecisionError, reviewFlagLabel, shortName,
} from "./format";

const PAGE = 100;

const fmt = (n) => n.toLocaleString("en-GB");

// users holds the newest members (at most 1,000); total and blockedTotal are
// the server's counts of all of them. A search, and the Blocked filter, go
// to the server (api.adminSearchMembers) and cover every member; before the
// database could search (its 2026-10-23 update) they cover the loaded ones.
// recorded: whether the database records our team's decisions and tells the
// member (the 2026-10-21 update).
const SEARCH_DELAY_MS = 300;

export default function MembersView({ users, total = users.length, blockedTotal = null, onMemberChange, showToast, recorded = true }) {
  const [query, setQuery] = useState("");
  const [show, setShow] = useState("all"); // all | blocked
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState(null);
  const [details, setDetails] = useState({}); // id -> row from admin_verification_queue
  const [loadingDetails, setLoadingDetails] = useState({}); // id -> true while their row loads
  const [blocking, setBlocking] = useState(null); // member to block (from the list)
  // The server's answer to the search shown: { key, members, total }.
  // serverSearch: true once the database searched, false if it can't yet
  // (before its update), null while that isn't known.
  const [remote, setRemote] = useState(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState("");
  const [serverSearch, setServerSearch] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const searchSeq = useRef(0);
  const remoteRef = useRef(remote);
  remoteRef.current = remote;
  const listRef = useRef(null);
  const detailsRef = useRef(details);
  detailsRef.current = details;

  const blockedCount = blockedTotal ?? users.filter((u) => u.status === "blocked").length;
  const cut = users.length < total;
  const q = query.trim();
  const searchKey = `${show}|${q}`;
  const searching = !!q || show === "blocked";

  // Search the server a moment after typing stops (the Blocked filter at
  // once); answers to an earlier search are dropped.
  useEffect(() => {
    if (!searching || serverSearch === false) {
      searchSeq.current += 1;
      setRemoteLoading(false);
      setRemoteError("");
      return undefined;
    }
    const seq = ++searchSeq.current;
    setRemoteLoading(true);
    setRemoteError("");
    const timer = setTimeout(async () => {
      try {
        const res = await api.adminSearchMembers({ query: q, blocked: show === "blocked" ? true : null, offset: 0 });
        if (seq !== searchSeq.current) return;
        if (!res) { setServerSearch(false); setRemote(null); return; }
        setServerSearch(true);
        setRemote({ key: searchKey, members: res.members, total: res.total });
      } catch (e) {
        if (seq === searchSeq.current) setRemoteError(friendlyError(e));
      } finally {
        if (seq === searchSeq.current) setRemoteLoading(false);
      }
    }, q ? SEARCH_DELAY_MS : 0);
    return () => clearTimeout(timer);
  }, [searchKey, serverSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // With more members than are loaded, find out whether the server can
  // search them all, to say so above the list.
  useEffect(() => {
    if (!cut || serverSearch !== null) return;
    let alive = true;
    api.adminSearchMembers({ limit: 1 }).then((res) => { if (alive) setServerSearch(!!res); }).catch(() => {});
    return () => { alive = false; };
  }, [cut]); // eslint-disable-line react-hooks/exhaustive-deps

  const useRemote = searching && serverSearch !== false && remote?.key === searchKey;
  const localFiltered = useMemo(() => {
    const ql = q.toLowerCase();
    return users.filter((u) => {
      if (show === "blocked" && u.status !== "blocked") return false;
      if (!ql) return true;
      return [u.name, u.email, u.city, u.location].some((v) => String(v || "").toLowerCase().includes(ql));
    });
  }, [users, q, show]);
  // (A member unblocked here leaves the Blocked list at once, as it would
  // from the loaded members, and isn't counted: on the server they've left
  // it too.)
  const stillMatches = (m) => show !== "blocked" || m.status === "blocked";
  const filtered = useRemote ? remote.members.filter(stillMatches) : localFiltered;
  const visible = useRemote ? filtered : filtered.slice(0, limit);
  const remoteTotal = useRemote ? Math.max(0, remote.total - (remote.members.length - filtered.length)) : 0;
  const remoteMore = useRemote ? Math.max(0, remoteTotal - filtered.length) : 0;

  useEffect(() => { setLimit(PAGE); }, [query, show]);

  // The next page of the server's answer, after the members listed here that
  // are still in it.
  const loadMoreRemote = async () => {
    const r = remoteRef.current;
    if (!r || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.adminSearchMembers({ query: q, blocked: show === "blocked" ? true : null, offset: r.members.filter(stillMatches).length });
      if (res && remoteRef.current?.key === r.key) {
        setRemote((cur) => {
          if (!cur || cur.key !== r.key) return cur;
          const have = new Set(cur.members.map((m) => m.id));
          // total counts the members listed here that left the list too.
          const gone = cur.members.filter((m) => !stillMatches(m)).length;
          return { ...cur, members: [...cur.members, ...res.members.filter((m) => !have.has(m.id))], total: res.total + gone };
        });
      }
    } catch (e) {
      showToast({ text: `Couldn't load more: ${friendlyError(e)}`, tone: "error" });
    }
    setLoadingMore(false);
  };

  const openIndex = openId ? filtered.findIndex((u) => u.id === openId) : -1;
  const openUser = openIndex >= 0 ? filtered[openIndex]
    : (openId ? users.find((u) => u.id === openId) || remote?.members.find((u) => u.id === openId) : null);

  // Counts the changes made here to each member, so a refresh that started
  // before one can't bring back what the member looked like before it.
  const changes = useRef({});
  const touch = (id) => { changes.current[id] = (changes.current[id] || 0) + 1; };

  // A change to a member: in the panel (with how they were, for the counts,
  // if they aren't among the loaded members, or as the caller says) and in
  // the search results.
  const memberChanged = (id, patch, was = null) => {
    const found = remoteRef.current?.members.find((m) => m.id === id) || null;
    const before = found || was ? { ...(found || {}), ...(was || {}) } : null;
    onMemberChange(id, patch, before);
    setRemote((r) => (r && r.members.some((m) => m.id === id)
      ? { ...r, members: r.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) } : r));
  };

  // The members list has the public profile; the review queue has the rest
  // (consents, explanation, duplicates, submission, hold). Load the member's
  // row. Resolves with it when done (null on failure; never rejects).
  const loadingRef = useRef({}); // id -> the load in progress
  const loadDetails = (id, status) => {
    setLoadingDetails((l) => ({ ...l, [id]: true }));
    const mark = changes.current[id] || 0;
    // Not over a member decided on here while it loaded.
    const load = api.adminMemberDetails(id, status)
      .then((row) => {
        if (row && (changes.current[id] || 0) === mark) setDetails((d) => ({ ...d, [id]: row }));
        return row;
      })
      .catch(() => null)
      .finally(() => {
        if (loadingRef.current[id] !== load) return;
        delete loadingRef.current[id];
        setLoadingDetails((l) => ({ ...l, [id]: false }));
      });
    loadingRef.current[id] = load;
    return load;
  };

  useEffect(() => {
    if (!openUser || details[openUser.id] || loadingRef.current[openUser.id]) return;
    loadDetails(openUser.id, openUser.verification_status);
  }, [openUser?.id, openUser?.verification_status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the member again each time the peek opens on them, so the admin
  // decides on their details as they are now. If the name, LinkedIn link,
  // status or hold changed, load their review details again too (until
  // they're back the peek shows only what the members list has); full:
  // load them again anyway (after a refused decision or an Undo). With no
  // details yet, wait for the load in progress, or load them.
  const refreshMember = async (id, { full = false } = {}) => {
    const mark = changes.current[id] || 0;
    let fresh = null;
    try { fresh = await api.adminGetReportedItem("profile", id); } catch { return; }
    if (!fresh || (changes.current[id] || 0) !== mark) return;
    const d = detailsRef.current[id];
    const status = fresh.verification_status;
    memberChanged(id, fresh);
    const stale = !!d && (identityChanged(d, fresh) || d.verification_status !== status
      || (d.review_flag || "") !== (fresh.review_flag || ""));
    if (stale) setDetails((prev) => { const next = { ...prev }; delete next[id]; return next; });
    if (stale || full) await loadDetails(id, status);
    else if (d) patchDetails(id, memberFields(fresh));
    else await (loadingRef.current[id] || loadDetails(id, status));
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
    memberChanged(m.id, { verification_status: decision, linkedin_verified: decision === "approved", ...(endsHold ? { review_flag: "" } : {}) });
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
        memberChanged(m.id, { verification_status: before, linkedin_verified: false, review_flag: restored.review_flag || "" });
        refreshMember(m.id, { full: true });
        return before === "pending" ? `Undone. ${who} is now pending.` : `Undone. ${who} is back to unfinished.`;
      } : undefined,
    });
  };

  const setAmbassador = async (m, city) => {
    await api.adminSetAmbassador(m.id, city);
    touch(m.id);
    memberChanged(m.id, { ambassador_city: city });
    showToast({ text: city ? `${shortName(m.name)} is now the ambassador for ${city}` : `${shortName(m.name)} is no longer an ambassador` });
  };

  // Warn, block, unblock, remove the photo or bio (MemberPeek's
  // onModerate). Throws so the dialog can show why it didn't work.
  const moderate = (m, decision) => moderateMember(m, decision, {
    showToast,
    changed: (id, patch, before) => {
      touch(id);
      memberChanged(id, patch, before);
      patchDetails(id, patch);
    },
  });

  const unblock = async (u) => {
    try { await moderate(u, { kind: "member", action: "unblock", reasons: {} }); } catch (e) { showToast({ text: friendlyError(e), tone: "error" }); }
  };

  return (
    <>
      <PageHeader title="Members" description="Everyone who has joined NRIClub. Search finds any member by name, email or city. Open a member to review them, or block an account." />

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

      {remoteError && <ErrorNote>{`Couldn't search all members: ${remoteError} Showing matches among the loaded members.`}</ErrorNote>}
      {useRemote ? (
        <p className="adm-muted adm-small" role="status" style={{ margin: "0 0 10px" }}>
          {show === "blocked" && !q
            ? `${fmt(remoteTotal)} blocked account${remoteTotal === 1 ? "" : "s"}`
            : `${fmt(remoteTotal)} member${remoteTotal === 1 ? "" : "s"} match${remoteTotal === 1 ? "es" : ""}`}
        </p>
      ) : searching && remoteLoading ? (
        <p className="adm-muted adm-small" role="status" style={{ margin: "0 0 10px" }}>Searching all members…</p>
      ) : cut && (
        <p className="adm-muted adm-small" style={{ margin: "0 0 10px" }}>
          Showing the newest {fmt(users.length)} of {fmt(total)} members.{" "}
          {serverSearch === false ? "Search and the Blocked filter only cover these." : serverSearch ? "Search and the Blocked filter cover every member." : ""}
        </p>
      )}

      {filtered.length === 0 ? (
        searching && remoteLoading && !useRemote ? <SkeletonRows rows={3} /> : (
        <EmptyState icon={query ? "search" : "users"} title={query ? "No members match" : show === "blocked" ? (blockedCount > 0 && !useRemote ? "No blocked accounts among these members" : "No blocked accounts") : "No members yet"}>
          {query ? "Try a different name, email or city." : show === "blocked" ? (blockedCount > 0 && !useRemote ? "Blocked accounts that joined earlier aren't loaded here." : "Accounts you block appear here.") : null}
        </EmptyState>)
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
                    : <Button variant="ghost" size="sm" className="adm-btn-ghost-danger" onClick={(e) => { e.stopPropagation(); setBlocking(u); }}>Block…</Button>}
                </div>
              </div>
            );
          })}
          {useRemote ? remoteMore > 0 && (
            <div className="adm-more">
              <Button variant="secondary" size="sm" onClick={loadMoreRemote} disabled={loadingMore}>{loadingMore ? "Loading…" : `Show ${fmt(Math.min(api.SEARCH_PAGE, remoteMore))} more`}</Button>
            </div>
          ) : filtered.length > visible.length && (
            <div className="adm-more">
              <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, filtered.length - visible.length)} more</Button>
            </div>
          )}
        </div>
      )}

      {peekMember && (
        <MemberPeek
          member={peekMember}
          loadingDetails={!!loadingDetails[peekMember.id] && !details[peekMember.id]}
          index={openIndex >= 0 ? openIndex : 0}
          total={openIndex >= 0 ? filtered.length : 1}
          onClose={() => { const id = openId; setOpenId(null); focusRow(id); }}
          onPrev={openIndex > 0 ? () => setOpenId(filtered[openIndex - 1].id) : null}
          onNext={openIndex >= 0 && openIndex < filtered.length - 1 ? () => setOpenId(filtered[openIndex + 1].id) : null}
          recorded={recorded}
          onDecision={decide}
          onModerate={moderate}
          onSetAmbassador={setAmbassador}
        />
      )}

      {blocking && (
        <MemberModeration member={blocking} action="block" recorded={recorded} onModerate={moderate}
          onDone={() => { const id = blocking.id; setBlocking(null); focusRow(id); }}
          onCancel={() => { const id = blocking.id; setBlocking(null); focusRow(id); }} />
      )}
    </>
  );
}
