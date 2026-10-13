// NRIClub Admin: a minimal, Notion-like admin panel.
// Sections: Verification, Members, Communities, Reports, Bug reports, Overview.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../supabaseApi";
import VerificationView from "./VerificationView";
import MembersView from "./MembersView";
import CommunitiesView from "./CommunitiesView";
import OverviewView from "./OverviewView";
import { BugReportsView, ReportsView, contentPreview, isOpenBug, isOpenReport, personOf, targetKey } from "./ReportsView";
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

export default function AdminPanel({ onLogout }) {
  const [page, setPage] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  // Member counts from the server: { total, blocked, byStatus }. null when
  // they couldn't be loaded; the counts then come from the loaded members.
  const [memberCounts, setMemberCounts] = useState(null);
  const [groups, setGroups] = useState([]);
  // Every open report, plus the newest handled ones: handledTotals says how
  // many handled reports and bug reports there are in all.
  const [reports, setReports] = useState([]);
  const [handledTotals, setHandledTotals] = useState({ reports: 0, bugs: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const queueCache = useRef({});
  const usersRef = useRef(users);
  usersRef.current = users;
  const countsTimer = useRef(null);
  const countsSeq = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    countsSeq.current += 1;
    const [dash, queue, totals] = await Promise.allSettled([
      api.adminGetDashboardData(),
      api.adminVerificationQueue(["pending"]),
      api.adminCountMembers(),
    ]);
    let pendingCount = 0;
    if (queue.status === "fulfilled") {
      const rows = Array.isArray(queue.value) ? queue.value : [];
      queueCache.current.pending = { rows, at: Date.now() };
      pendingCount = rows.length;
    }
    setMemberCounts(totals.status === "fulfilled" ? totals.value : null);
    if (dash.status === "fulfilled") {
      const data = dash.value;
      setUsers(data.users);
      setUsersTotal(data.usersTotal ?? data.users.length);
      setGroups(data.groups);
      setReports(enrichReports(data));
      setHandledTotals({ reports: data.handledReportsTotal ?? 0, bugs: data.handledBugsTotal ?? 0 });
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
  const openReports = reports.filter(isOpenReport).length;
  const bugCount = reports.filter(isOpenBug).length;
  const pendingGroups = groups.filter((g) => !g.is_approved).length;

  const nav = [
    { key: "verification", label: "Verification", icon: "shieldCheck", count: counts.pending, hot: counts.pending > 0 },
    { key: "members", label: "Members", icon: "users", count: membersTotal },
    { key: "communities", label: "Communities", icon: "globe", count: pendingGroups },
    { key: "reports", label: "Reports", icon: "flag", count: openReports },
    { key: "bugs", label: "Bug reports", icon: "bug", count: bugCount },
    { key: "overview", label: "Overview", icon: "chart" },
  ];

  const go = (key) => {
    setPage(key);
    window.scrollTo(0, 0);
  };

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
    content = <VerificationView usersById={usersById} counts={counts} countsExact={countsExact} cache={queueCache} onMemberChange={onMemberChange} showToast={showToast} />;
  } else if (page === "members") {
    content = <MembersView users={users} total={membersTotal} blockedTotal={blockedTotal} onMemberChange={onMemberChange} showToast={showToast} />;
  } else if (page === "communities") {
    content = <CommunitiesView groups={groups} setGroups={setGroups} usersById={usersById} showToast={showToast} onReload={load} />;
  } else if (page === "reports") {
    content = <ReportsView reports={reports} setReports={setReports} handledTotal={handledTotals.reports} usersById={usersById} onMemberChange={onMemberChange} showToast={showToast} onReload={load} />;
  } else if (page === "bugs") {
    content = <BugReportsView reports={reports} setReports={setReports} handledTotal={handledTotals.bugs} showToast={showToast} onReload={load} />;
  } else {
    content = <OverviewView users={users} membersTotal={membersTotal} blockedTotal={blockedTotal} counts={counts} openReports={openReports} pendingGroups={pendingGroups} onNavigate={go} />;
  }

  return (
    <div className="adm">
      <style>{ADMIN_CSS}</style>
      <aside className="adm-side" aria-label="Admin navigation">
        <div className="adm-ws">
          <span className="adm-logo" aria-hidden="true">N</span>
          <span className="adm-ws-name">NRIClub Admin</span>
          <button type="button" className="adm-btn adm-btn-ghost adm-btn-icon adm-ws-signout" onClick={signOut} aria-label="Sign out" title="Sign out">
            <Icon name="logout" size={16} />
          </button>
        </div>
        <nav className="adm-nav">
          {nav.map((n, i) => (
            <Fragment key={n.key}>
              {i === nav.length - 1 && <div className="adm-nav-divider" aria-hidden="true" />}
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
