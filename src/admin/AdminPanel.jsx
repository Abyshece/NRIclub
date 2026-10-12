// NRIClub Admin: a minimal, Notion-like admin panel.
// Sections: Verification, Members, Communities, Reports, Bug reports, Overview.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../supabaseApi";
import VerificationView from "./VerificationView";
import MembersView from "./MembersView";
import CommunitiesView from "./CommunitiesView";
import OverviewView from "./OverviewView";
import { BugReportsView, ReportsView, isBugReport, isOpenReport } from "./ReportsView";
import { ADMIN_CSS, ErrorNote, Icon, SkeletonRows, Toast } from "./ui";
import { friendlyError } from "./format";

const TOAST_MS = 6000;

// Join each report with its reporter, the reported member and a preview of
// the reported content.
function enrichReports(data) {
  const byId = Object.fromEntries(data.users.map((u) => [u.id, u]));
  const content = {};
  data.posts.forEach((p) => { content[p.id] = { type: "post", content: p.content, image: p.image_url, authorId: p.user_id }; });
  data.docs.forEach((d) => { content[d.id] = { type: "doc", content: d.title, excerpt: d.excerpt, authorId: d.user_id }; });
  data.events.forEach((e) => { content[e.id] = { type: "event", content: e.title, excerpt: e.description, date: e.date, authorId: e.organizer_id }; });
  data.helpRequests.forEach((h) => { content[h.id] = { type: "help", content: h.title, excerpt: h.description, authorId: h.user_id }; });
  data.marketItems.forEach((m) => {
    // Listings keep image_url as a JSON array of URLs; show the first.
    let img = m.image_url;
    try { const a = JSON.parse(img); img = Array.isArray(a) ? a[0] : img; } catch { img = m.image_url; }
    content[m.id] = { type: "marketplace", content: m.title, excerpt: m.description, price: m.price, image: img, authorId: m.user_id };
  });
  const person = (u) => (u ? { name: u.name, email: u.email } : null);
  return data.reports.map((r) => {
    const reportedContent = content[r.reported_post_id || r.reported_user_id] || null;
    return {
      ...r,
      reporter: person(byId[r.reporter_id]),
      reported_user: person(byId[r.reported_user_id]),
      reportedContent,
      contentAuthor: reportedContent ? person(byId[reportedContent.authorId]) : null,
    };
  });
}

export default function AdminPanel({ onLogout }) {
  const [page, setPage] = useState(null);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const queueCache = useRef({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const [dash, queue] = await Promise.allSettled([
      api.adminGetDashboardData(),
      api.adminVerificationQueue(["pending"]),
    ]);
    let pendingCount = 0;
    if (queue.status === "fulfilled") {
      const rows = Array.isArray(queue.value) ? queue.value : [];
      queueCache.current.pending = { rows, at: Date.now() };
      pendingCount = rows.length;
    }
    if (dash.status === "fulfilled") {
      const data = dash.value;
      setUsers(data.users);
      setGroups(data.groups);
      setReports(enrichReports(data));
      if (queue.status !== "fulfilled") pendingCount = data.users.filter((u) => u.verification_status === "pending").length;
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

  const onMemberChange = useCallback((id, patch) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }, []);

  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const counts = useMemo(() => {
    const c = { pending: 0, needs_info: 0, incomplete: 0, rejected: 0, approved: 0 };
    users.forEach((u) => { const s = u.verification_status || "incomplete"; c[s] = (c[s] || 0) + 1; });
    return c;
  }, [users]);
  const openReports = reports.filter(isOpenReport).length;
  const bugCount = reports.filter(isBugReport).length;
  const pendingGroups = groups.filter((g) => !g.is_approved).length;

  const nav = [
    { key: "verification", label: "Verification", icon: "shieldCheck", count: counts.pending, hot: counts.pending > 0 },
    { key: "members", label: "Members", icon: "users", count: users.length },
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
    content = <VerificationView usersById={usersById} counts={counts} cache={queueCache} onMemberChange={onMemberChange} showToast={showToast} />;
  } else if (page === "members") {
    content = <MembersView users={users} onMemberChange={onMemberChange} showToast={showToast} />;
  } else if (page === "communities") {
    content = <CommunitiesView groups={groups} setGroups={setGroups} usersById={usersById} showToast={showToast} />;
  } else if (page === "reports") {
    content = <ReportsView reports={reports} setReports={setReports} usersById={usersById} onMemberChange={onMemberChange} showToast={showToast} />;
  } else if (page === "bugs") {
    content = <BugReportsView reports={reports} setReports={setReports} showToast={showToast} />;
  } else {
    content = <OverviewView users={users} counts={counts} openReports={openReports} pendingGroups={pendingGroups} onNavigate={go} />;
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
