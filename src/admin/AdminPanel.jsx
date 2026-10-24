// NRIClub Admin: a minimal, Notion-like admin panel.
// Sections: Verification, Members, Communities, Ambassadors (applications to
// be a city ambassador), What's on (events on the public list), Reports,
// Feedback, Inbox (mail to hello@nriclub.app), Overview, Security (two-step
// login).
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../supabaseApi";
import LogoMark from "../LogoMark";
import VerificationView from "./VerificationView";
import MembersView from "./MembersView";
import CommunitiesView from "./CommunitiesView";
import AmbassadorsView from "./AmbassadorsView";
import WhatsOnView from "./WhatsOnView";
import InboxView from "./InboxView";
import OverviewView from "./OverviewView";
import SecurityView from "./SecurityView";
// Members' progress: sign-up stages, profile completeness and reminders.
import ProgressView from "./ProgressView";
import { usePhotoCleanup } from "./PhotoCleanup";
import { FeedbackView, ReportsView, contentPreview, isFeedback, isOpenBug, isOpenIdea, isOpenReport, isSafetyReport, personOf, targetKey } from "./ReportsView";
import { ADMIN_CSS, ErrorNote, Icon, SkeletonRows, Toast } from "./ui";
import { friendlyError } from "./format";

const TOAST_MS = 6000;
const COUNTS_REFRESH_MS = 1500;

// Join each report with its reporter, the reported member and a preview of
// the reported content, matched by kind so the preview is what Remove would
// delete. Content that isn't among the newest items loaded here is fetched by
// the Reports page.
function enrichReports(data) {
  const byId = Object.fromEntries(data.users.map((u) => [u.id, u]));
  const content = {};
  const add = (kind, rows) => rows.forEach((row) => { content[`${kind}:${row.id}`] = contentPreview(kind, row); });
  add("post", data.posts);
  add("doc", data.docs);
  add("event", data.events);
  add("help", data.helpRequests);
  add("market", data.marketItems);
  return data.reports.map((r) => {
    const reportedContent = content[targetKey(r)] || null;
    return {
      ...r,
      reporter: personOf(byId[r.reporter_id]),
      reported_user: personOf(byId[r.reported_user_id]),
      reportedContent,
      contentAuthor: reportedContent ? personOf(byId[reportedContent.authorId]) : null,
    };
  });
}

// The reports a reload loaded, except those changed here since it started
// (changed(id)): they keep the status they have now (now: the list shown),
// and stay listed if the reload missed them (read while they changed).
function keepChangedReports(loaded, now, changed) {
  const mine = new Map(now.filter((r) => changed(r.id)).map((r) => [r.id, r]));
  const out = loaded.map((r) => {
    const m = mine.get(r.id);
    mine.delete(r.id);
    return m && m.status !== r.status ? { ...r, status: m.status, handledHere: m.handledHere } : r;
  });
  if (!mine.size) return out;
  return [...out, ...mine.values()].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
}

export default function AdminPanel({ onLogout }) {
  const [page, setPage] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  // Member counts from the server: { total, blocked, byStatus }. null when
  // they couldn't be loaded; the counts then come from the loaded members.
  const [memberCounts, setMemberCounts] = useState(null);
  const [groups, setGroups] = useState([]);
  // The oldest open reports (a page of each kind), plus the newest handled
  // ones: handledTotals says how many handled reports and bug reports there
  // are in all. moreOpen: for open member reports and open feedback, how
  // many aren't loaded yet and where the next page starts.
  const [reports, setReports] = useState([]);
  const [handledTotals, setHandledTotals] = useState({ reports: 0, bugs: 0 });
  const [moreOpen, setMoreOpen] = useState({ reports: { hidden: 0, after: null }, feedback: { hidden: 0, after: null } });
  const [loadingMore, setLoadingMore] = useState(false);
  // Reports from the public page (nriclub.app/report); null before the
  // 2026-10-21 database update. recorded: whether the database records our
  // team's decisions and tells the members concerned (the same update).
  const [notices, setNotices] = useState(null);
  const [recorded, setRecorded] = useState(true);
  // Applications to be a city ambassador, by status ({ new, contacted,
  // accepted, declined }); null before the 2026-10-24 database update or
  // when they couldn't be loaded.
  const [ambassadorCounts, setAmbassadorCounts] = useState(null);
  // Unread mail to hello@nriclub.app; null before the 2026-10-25 database
  // update or when it couldn't be loaded.
  const [inboxUnread, setInboxUnread] = useState(null);
  // A member to open in Members, from Members' progress: { id, query }.
  const [memberLink, setMemberLink] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const queueCache = useRef({});
  const usersRef = useRef(users);
  usersRef.current = users;
  const countsTimer = useRef(null);
  const countsSeq = useRef(0);
  const loadSeq = useRef(0);
  // Counts the changes made here to each member and report, so a reload that
  // started before one can't bring back what they looked like before it.
  const memberChanges = useRef({});
  const reportChanges = useRef({});
  // Accounts deleted here, which a reload that started before mustn't bring back.
  const deletedMembers = useRef(new Set());

  const load = useCallback(async () => {
    const req = ++loadSeq.current;
    const memberMarks = { ...memberChanges.current };
    const reportMarks = { ...reportChanges.current };
    setLoading(true);
    setLoadError("");
    const countsMark = ++countsSeq.current;
    const [dash, queue, totals, noticeRows, moderation, ambassadors, inbox] = await Promise.allSettled([
      api.adminGetDashboardData(),
      api.adminVerificationPage("pending", 0),
      api.adminCountMembers(),
      api.adminNotices(),
      api.adminHasModeration(),
      api.adminAmbassadorApplications({ status: "new", limit: 1 }),
      api.adminInboxList({ filter: "unread", limit: 1 }),
    ]);
    // A later reload has started: its answers are newer.
    if (req !== loadSeq.current) return;
    let pendingCount = 0;
    if (queue.status === "fulfilled") {
      const { rows, total, paged } = queue.value;
      queueCache.current.pending = { rows, at: Date.now(), total, paged };
      pendingCount = total ?? rows.length;
    }
    if (countsMark === countsSeq.current) setMemberCounts(totals.status === "fulfilled" ? totals.value : null);
    if (noticeRows.status === "fulfilled") setNotices(noticeRows.value);
    if (moderation.status === "fulfilled") setRecorded(moderation.value);
    if (ambassadors.status === "fulfilled") setAmbassadorCounts(ambassadors.value?.counts || null);
    if (inbox.status === "fulfilled") setInboxUnread(inbox.value ? Number(inbox.value.unread) || 0 : null);
    if (dash.status === "fulfilled") {
      const data = dash.value;
      // Members and reports changed here since the reload started stay as
      // they are now (the reload may have read them before the change).
      const changedSince = (changes, marks) => (id) => (changes.current[id] || 0) !== (marks[id] || 0);
      const memberChanged = changedSince(memberChanges, memberMarks);
      const reportChanged = changedSince(reportChanges, reportMarks);
      setUsers((prev) => {
        const now = new Map(prev.filter((u) => memberChanged(u.id)).map((u) => [u.id, u]));
        return data.users.filter((u) => !deletedMembers.current.has(u.id)).map((u) => now.get(u.id) || u);
      });
      setUsersTotal(data.usersTotal ?? data.users.length);
      setGroups(data.groups);
      setReports((prev) => keepChangedReports(enrichReports(data), prev, reportChanged));
      setHandledTotals({ reports: data.handledReportsTotal ?? 0, bugs: data.handledBugsTotal ?? 0 });
      const loadedOpen = (feedback) => data.reports.filter((r) => r.status === "pending" && isFeedback(r) === feedback).length;
      setMoreOpen({
        reports: { hidden: Math.max(0, (data.openReportsTotal ?? 0) - loadedOpen(false)), after: data.openReportsAfter ?? null },
        feedback: { hidden: Math.max(0, (data.openFeedbackTotal ?? 0) - loadedOpen(true)), after: data.openFeedbackAfter ?? null },
      });
      if (queue.status !== "fulfilled") {
        pendingCount = totals.status === "fulfilled" ? totals.value.byStatus.pending : data.users.filter((u) => u.verification_status === "pending").length;
      }
    } else {
      setLoadError(`Couldn't load the admin data: ${friendlyError(dash.reason)} Your session may have expired; sign out and sign in again.`);
    }
    setPage((p) => p || (pendingCount > 0 ? "verification" : "overview"));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Toasts close by themselves; one at a time.
  useEffect(() => {
    if (!toast || toast.busy) return undefined;
    const h = setTimeout(() => setToast(null), toast.duration || TOAST_MS);
    return () => clearTimeout(h);
  }, [toast]);

  // On phones the nav is a horizontal strip: keep the current page in view.
  useEffect(() => {
    document.querySelector('.adm-nav-item[aria-current="page"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [page]);

  const showToast = useCallback((t) => setToast({ id: Date.now() + Math.random(), ...t }), []);
  // Photo files nothing uses any more: deleted once a day when the panel
  // opens, and from Overview.
  const photoCleanup = usePhotoCleanup(showToast);

  const undoToast = async () => {
    const t = toast;
    if (!t?.undo) return;
    setToast({ ...t, busy: true, text: "Undoing…" });
    try {
      const msg = await t.undo();
      setToast({ id: Date.now(), text: typeof msg === "string" ? msg : "Undone", duration: 3000 });
    } catch (e) {
      setToast({ id: Date.now(), text: `Couldn't undo: ${friendlyError(e)}`, tone: "error" });
    }
  };

  // Check the member counts with the server shortly after a change (answers
  // that started before a later change are ignored).
  const refreshCounts = useCallback(() => {
    clearTimeout(countsTimer.current);
    countsTimer.current = setTimeout(async () => {
      const seq = countsSeq.current;
      try {
        const c = await api.adminCountMembers();
        if (seq === countsSeq.current) setMemberCounts(c);
      } catch { /* keep the counts we have */ }
    }, COUNTS_REFRESH_MS);
  }, []);

  useEffect(() => () => clearTimeout(countsTimer.current), []);

  // patch: new fields for one member. before: what the view knew about them
  // (needed for members who aren't among the loaded ones), so the counts can
  // follow straight away.
  const onMemberChange = useCallback((id, patch, before = null) => {
    memberChanges.current[id] = (memberChanges.current[id] || 0) + 1;
    const old = { ...(usersRef.current.find((u) => u.id === id) || {}), ...(before || {}) };
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    const vsFrom = old.verification_status;
    const vsTo = patch.verification_status;
    const vsChanged = !!vsFrom && !!vsTo && vsFrom !== vsTo;
    const blockedChanged = !!old.status && !!patch.status && (old.status === "blocked") !== (patch.status === "blocked");
    if (!vsChanged && !blockedChanged) return;
    countsSeq.current += 1;
    setMemberCounts((c) => {
      if (!c) return c;
      const byStatus = { ...c.byStatus };
      if (vsChanged) {
        byStatus[vsFrom] = Math.max(0, (byStatus[vsFrom] || 0) - 1);
        byStatus[vsTo] = (byStatus[vsTo] || 0) + 1;
      }
      const blocked = blockedChanged ? Math.max(0, c.blocked + (patch.status === "blocked" ? 1 : -1)) : c.blocked;
      return { ...c, byStatus, blocked };
    });
    refreshCounts();
  }, [refreshCounts]);

  // An unfinished sign-up deleted from the Members or Verification page:
  // before is the member as the page knew them, for the counts.
  const onMemberDeleted = useCallback((id, before = null) => {
    deletedMembers.current.add(id);
    const old = { ...(before || {}), ...(usersRef.current.find((u) => u.id === id) || {}) };
    if (usersRef.current.some((u) => u.id === id)) {
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setUsersTotal((t) => Math.max(0, t - 1));
    }
    countsSeq.current += 1;
    setMemberCounts((c) => {
      if (!c) return c;
      const vs = old.verification_status || "incomplete";
      return { ...c, total: Math.max(0, c.total - 1), byStatus: { ...c.byStatus, [vs]: Math.max(0, (c.byStatus[vs] || 0) - 1) } };
    });
    refreshCounts();
  }, [refreshCounts]);

  // The next page of open member reports (or of feedback), oldest first.
  // Their content and the reported member are looked up by the Reports page.
  const loadMoreOpen = useCallback(async (feedback) => {
    const key = feedback ? "feedback" : "reports";
    const after = moreOpen[key].after;
    if (!after || loadingMore) return;
    setLoadingMore(true);
    try {
      const { rows } = await api.adminGetOpenReports(feedback, after);
      const byId = Object.fromEntries(usersRef.current.map((u) => [u.id, u]));
      setReports((prev) => {
        const have = new Set(prev.map((r) => r.id));
        const added = rows.filter((r) => !have.has(r.id)).map((r) => ({
          ...r, reporter: personOf(byId[r.reporter_id]), reported_user: personOf(byId[r.reported_user_id]),
          reportedContent: null, contentAuthor: null,
        }));
        return [...prev, ...added].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
      });
      setMoreOpen((m) => ({
        ...m,
        [key]: {
          hidden: Math.max(0, m[key].hidden - rows.length),
          after: rows.length < api.OPEN_REPORTS_PAGE ? null : rows[rows.length - 1],
        },
      }));
    } catch (e) {
      showToast({ text: `Couldn't load more: ${friendlyError(e)}`, tone: "error" });
    }
    setLoadingMore(false);
  }, [moreOpen, loadingMore, showToast]);

  // The reports (ids) whose status this panel just changed on the server.
  const onReportsChange = useCallback((ids) => {
    ids.forEach((id) => { reportChanges.current[id] = (reportChanges.current[id] || 0) + 1; });
  }, []);

  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const countsExact = !!memberCounts;
  const counts = useMemo(() => {
    if (memberCounts) return { ...memberCounts.byStatus };
    const c = { pending: 0, needs_info: 0, incomplete: 0, rejected: 0, approved: 0 };
    users.forEach((u) => { const s = u.verification_status || "incomplete"; c[s] = (c[s] || 0) + 1; });
    return c;
  }, [users, memberCounts]);
  const membersTotal = Math.max(memberCounts?.total ?? usersTotal, users.length);
  const blockedTotal = memberCounts ? memberCounts.blocked : users.filter((u) => u.status === "blocked").length;
  // Open ones loaded here, plus those not loaded yet, plus open reports from
  // the public page. A threat to someone's safety makes the count stand out.
  const openNotices = (notices || []).filter((n) => n.status === "open");
  const openReports = reports.filter(isOpenReport).length + moreOpen.reports.hidden + openNotices.length;
  const safetyOpen = reports.some((r) => isOpenReport(r) && isSafetyReport(r)) || openNotices.some((n) => n.category === "safety");
  const feedbackCount = reports.filter((r) => isOpenBug(r) || isOpenIdea(r)).length + moreOpen.feedback.hidden;
  const pendingGroups = groups.filter((g) => !g.is_approved).length;

  const nav = [
    { key: "verification", label: "Verification", icon: "shieldCheck", count: counts.pending, hot: counts.pending > 0 },
    { key: "members", label: "Members", icon: "users", count: membersTotal },
    { key: "progress", label: "Members' progress", icon: "checkCircle" },
    { key: "communities", label: "Communities", icon: "globe", count: pendingGroups },
    { key: "ambassadors", label: "Ambassadors", icon: "star", count: ambassadorCounts?.new || 0 },
    { key: "whatson", label: "What's on", icon: "calendar" },
    { key: "reports", label: "Reports", icon: "flag", count: openReports, hot: safetyOpen },
    { key: "bugs", label: "Feedback", icon: "bug", count: feedbackCount },
    { key: "inbox", label: "Inbox", icon: "mail", count: inboxUnread || 0 },
    { key: "overview", label: "Overview", icon: "chart" },
    { key: "security", label: "Security", icon: "lock" },
  ];

  const go = (key) => {
    setMemberLink(null);
    setPage(key);
    window.scrollTo(0, 0);
  };
  // Members, searched for this member, with them open.
  const openMember = useCallback((m) => {
    setMemberLink({ id: m.id, query: m.email || m.name || "" });
    setPage("members");
    window.scrollTo(0, 0);
  }, []);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await onLogout();
  };

  const adminEmail = api.getCurrentUser()?.email || "";

  let content;
  if (loading && !page) {
    content = (
      <>
        <div className="adm-head"><span className="adm-skel" style={{ width: 220, height: 30, borderRadius: 6 }} /></div>
        <SkeletonRows rows={5} />
      </>
    );
  } else if (page === "verification") {
    content = <VerificationView usersById={usersById} counts={counts} countsExact={countsExact} cache={queueCache} onMemberChange={onMemberChange} onMemberDeleted={onMemberDeleted} showToast={showToast} recorded={recorded} />;
  } else if (page === "members") {
    content = <MembersView users={users} total={membersTotal} blockedTotal={blockedTotal} onMemberChange={onMemberChange} onMemberDeleted={onMemberDeleted} showToast={showToast} recorded={recorded} openOnStart={memberLink} />;
  } else if (page === "progress") {
    content = <ProgressView showToast={showToast} onOpenMember={openMember} />;
  } else if (page === "communities") {
    content = <CommunitiesView groups={groups} setGroups={setGroups} usersById={usersById} showToast={showToast} onReload={load} recorded={recorded} />;
  } else if (page === "ambassadors") {
    content = <AmbassadorsView showToast={showToast} onCountsChange={setAmbassadorCounts} initialCounts={ambassadorCounts} />;
  } else if (page === "reports") {
    content = <ReportsView reports={reports} setReports={setReports} handledTotal={handledTotals.reports} moreOpen={moreOpen.reports.after ? moreOpen.reports.hidden : 0} loadingMore={loadingMore} onLoadMore={() => loadMoreOpen(false)} usersById={usersById} onMemberChange={onMemberChange} onReportsChange={onReportsChange} showToast={showToast} onReload={load} notices={notices} setNotices={setNotices} recorded={recorded} />;
  } else if (page === "whatson") {
    content = <WhatsOnView showToast={showToast} />;
  } else if (page === "inbox") {
    content = <InboxView showToast={showToast} onUnread={setInboxUnread} />;
  } else if (page === "security") {
    content = <SecurityView showToast={showToast} />;
  } else if (page === "bugs") {
    content = <FeedbackView reports={reports} setReports={setReports} handledTotal={handledTotals.bugs} moreOpen={moreOpen.feedback.after ? moreOpen.feedback.hidden : 0} loadingMore={loadingMore} onLoadMore={() => loadMoreOpen(true)} onReportsChange={onReportsChange} showToast={showToast} onReload={load} />;
  } else {
    content = <OverviewView users={users} membersTotal={membersTotal} blockedTotal={blockedTotal} counts={counts} openReports={openReports} pendingGroups={pendingGroups} onNavigate={go} photoCleanup={photoCleanup} />;
  }

  return (
    <div className="adm">
      <style>{ADMIN_CSS}</style>
      <aside className="adm-side" aria-label="Admin navigation">
        <div className="adm-ws">
          <LogoMark size={22} />
          <span className="adm-ws-name">NRIClub Admin</span>
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-icon adm-ws-signout" onClick={signOut} aria-label="Sign out" title="Sign out">
            <Icon name="logout" size={16} />
          </button>
        </div>
        <nav className="adm-nav">
          {nav.map((n, i) => (
            <Fragment key={n.key}>
              {n.key === "overview" && <div className="adm-nav-divider" aria-hidden="true" />}
              <button type="button" className="adm-nav-item" aria-current={page === n.key ? "page" : undefined} onClick={() => go(n.key)}>
                <Icon name={n.icon} size={16} />
                <span>{n.label}</span>
                {n.count > 0 && <span className={`adm-nav-count${n.hot ? " hot" : ""}`} aria-label={`${n.count}`}>{n.count.toLocaleString("en-GB")}</span>}
              </button>
            </Fragment>
          ))}
        </nav>
        <div className="adm-side-foot">
          {adminEmail && <div className="adm-side-user" title={adminEmail}>{adminEmail}</div>}
          <button type="button" className="adm-nav-item" onClick={signOut} disabled={signingOut}>
            <Icon name="logout" size={16} />
            <span>{signingOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      </aside>

      <main className="adm-main">
        <div className="adm-page">
          {loadError && <ErrorNote onRetry={load}>{loadError}</ErrorNote>}
          {content}
        </div>
      </main>

      <Toast toast={toast} onUndo={undoToast} onClose={() => setToast(null)} />
    </div>
  );
}
