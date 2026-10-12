// Reports (flagged content and profiles) and Bug reports. Both live in the
// reports table; the kind is the "[TYPE]" prefix of the reason.
import { useState } from "react";
import * as api from "../supabaseApi";
import { Button, ConfirmDialog, EmptyState, PageHeader, Pill, SectionTitle } from "./ui";
import { ago, formatDate, friendlyError } from "./format";

export const isBugReport = (r) => (r.reason || "").startsWith("[BUG]");
export const isOpenReport = (r) => !isBugReport(r) && (r.status === "pending" || !r.status);

const CATEGORIES = ["Feed posts", "Marketplace", "Docs", "Events", "Help requests", "Profiles"];

function categoryOf(r) {
  const reason = (r.reason || "").toUpperCase();
  if (reason.startsWith("[MARKETPLACE]")) return "Marketplace";
  if (reason.startsWith("[DOC]")) return "Docs";
  if (reason.startsWith("[EVENT]")) return "Events";
  if (reason.startsWith("[HELP]")) return "Help requests";
  if (reason.startsWith("[USER]")) return "Profiles";
  if (reason.startsWith("[POST]")) return "Feed posts";
  if (r.reported_user_id && !r.reported_post_id) return "Profiles";
  return "Feed posts";
}

// Which table the reported content lives in.
function tableOf(r) {
  const reason = (r.reason || "").toUpperCase();
  return reason.startsWith("[MARKETPLACE]") ? "marketplace"
    : reason.startsWith("[DOC]") ? "docs"
    : reason.startsWith("[EVENT]") ? "events"
    : reason.startsWith("[HELP]") ? "help_requests"
    : "posts";
}

const CONTENT_NOUN = { posts: "post", marketplace: "listing", docs: "doc", events: "event", help_requests: "help request" };

function ContentPreview({ r }) {
  const c = r.reportedContent;
  if (c) {
    const main = c.type === "post" ? (c.content || "").slice(0, 200) + ((c.content || "").length > 200 ? "…" : "") : c.content;
    return (
      <div className="adm-preview">
        {/^https?:\/\//i.test(c.image || "") && <img src={c.image} alt="" loading="lazy" />}
        <div className="adm-preview-title">{main || <span className="adm-faint">(no text)</span>}</div>
        {c.excerpt && <div className="adm-preview-text">{c.excerpt.slice(0, 150)}{c.excerpt.length > 150 ? "…" : ""}</div>}
        {(c.price || c.date || r.contentAuthor) && (
          <div className="adm-preview-text adm-small" style={{ marginTop: 6 }}>
            {[c.price ? <span key="p" style={{ color: "#0F7B6C", fontWeight: 600 }}>{c.price}</span> : null,
              c.date ? <span key="d">{c.date}</span> : null,
              r.contentAuthor ? <span key="a">by {r.contentAuthor.name}{r.contentAuthor.email ? ` (${r.contentAuthor.email})` : ""}</span> : null]
              .filter(Boolean).reduce((acc, el, i) => (i ? [...acc, <span key={`s${i}`}> · </span>, el] : [el]), [])}
          </div>
        )}
      </div>
    );
  }
  if (r.reported_user) {
    return (
      <div className="adm-preview">
        <div className="adm-preview-title">Profile: {r.reported_user.name}</div>
        {r.reported_user.email && <div className="adm-preview-text">{r.reported_user.email}</div>}
      </div>
    );
  }
  if (r.reported_post_id) {
    return <div className="adm-preview"><div className="adm-preview-text">The content isn't in the latest items loaded here. It may already have been deleted.</div></div>;
  }
  return null;
}

export function ReportsView({ reports, setReports, usersById, onMemberChange, showToast }) {
  const [busyId, setBusyId] = useState(null);
  const [confirm, setConfirm] = useState(null); // { report, kind: "remove" | "block" }
  const [confirmError, setConfirmError] = useState("");

  const open = reports.filter(isOpenReport);
  const handled = reports.filter((r) => !isBugReport(r) && !isOpenReport(r));
  const grouped = {};
  open.forEach((r) => { const c = categoryOf(r); (grouped[c] = grouped[c] || []).push(r); });

  const dismiss = async (r) => {
    if (busyId) return;
    setBusyId(r.id);
    try {
      await api.adminDeleteReport(r.id);
      setReports((prev) => prev.filter((x) => x.id !== r.id));
      showToast({ text: "Report dismissed" });
    } catch (e) {
      showToast({ text: friendlyError(e), tone: "error" });
    }
    setBusyId(null);
  };

  const runConfirmed = async () => {
    const { report: r, kind } = confirm;
    setBusyId(r.id);
    setConfirmError("");
    try {
      if (kind === "remove" && r.reported_post_id) {
        await api.adminDeleteContent(tableOf(r), r.reported_post_id);
      }
      if (kind === "block" && r.reported_user_id) {
        await api.adminSetMemberStatus(r.reported_user_id, "blocked");
        onMemberChange(r.reported_user_id, { status: "blocked" });
      }
      await api.adminDeleteReport(r.id);
      setReports((prev) => prev.filter((x) => x.id !== r.id));
      setConfirm(null);
      showToast({ text: kind === "remove" ? "Content removed" : `Blocked ${r.reported_user?.name || "the account"}` });
    } catch (e) {
      setConfirmError(friendlyError(e));
    }
    setBusyId(null);
  };

  const renderReport = (r, actionable) => {
    const isProfile = !r.reported_post_id && !!r.reported_user_id;
    const alreadyBlocked = isProfile && usersById[r.reported_user_id]?.status === "blocked";
    return (
      <div key={r.id} className="adm-item">
        <div className="adm-item-main">
          <div className="adm-item-title">
            {(r.reason || "No reason given").replace(/^\[\w+\]\s*/, "")}
            {!actionable && <Pill tone={r.status === "resolved" ? "red" : "gray"}>{r.status === "resolved" ? "Removed" : "Reviewed"}</Pill>}
          </div>
          <ContentPreview r={r} />
          <div className="adm-item-meta">
            {r.reporter ? `Reported by ${r.reporter.name}${r.reporter.email ? ` (${r.reporter.email})` : ""}` : "Reported"} · <span title={formatDate(r.created_at, { time: true })}>{ago(r.created_at)}</span>
          </div>
        </div>
        {actionable && (
          <div className="adm-item-actions">
            {alreadyBlocked
              ? <Pill tone="red">Blocked</Pill>
              : isProfile
              ? <Button variant="danger" size="sm" icon="ban" disabled={busyId === r.id} onClick={() => { setConfirmError(""); setConfirm({ report: r, kind: "block" }); }}>Block account</Button>
              : <Button variant="danger" size="sm" icon="trash" disabled={busyId === r.id} onClick={() => { setConfirmError(""); setConfirm({ report: r, kind: "remove" }); }}>Remove content</Button>}
            <Button variant="secondary" size="sm" disabled={busyId === r.id} onClick={() => dismiss(r)}>Dismiss</Button>
          </div>
        )}
      </div>
    );
  };

  const noun = confirm ? CONTENT_NOUN[tableOf(confirm.report)] : "";

  return (
    <>
      <PageHeader title="Reports" description="Content and profiles members flagged. Remove what breaks the rules and dismiss the rest." />
      {open.length === 0 ? (
        <EmptyState icon="flag" title="No open reports">When members flag a post, listing or profile, it shows up here.</EmptyState>
      ) : CATEGORIES.filter((c) => grouped[c]?.length).map((c) => (
        <section key={c}>
          <SectionTitle count={grouped[c].length}>{c}</SectionTitle>
          {grouped[c].map((r) => renderReport(r, true))}
        </section>
      ))}
      {handled.length > 0 && (
        <section>
          <SectionTitle count={handled.length}>Handled</SectionTitle>
          {handled.map((r) => renderReport(r, false))}
        </section>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "remove" ? `Remove this ${noun}?` : `Block ${confirm.report.reported_user?.name || "this account"}?`}
          confirmLabel={confirm.kind === "remove" ? "Remove content" : "Block account"}
          busy={busyId === confirm.report.id}
          error={confirmError}
          onConfirm={runConfirmed}
          onCancel={() => setConfirm(null)}>
          {confirm.kind === "remove"
            ? `It's deleted for everyone and the report is closed. This can't be undone.`
            : "They can still sign in, but can't post, message or connect with anyone until you unblock them in Members. The report is closed."}
        </ConfirmDialog>
      )}
    </>
  );
}

function parseBug(r) {
  const text = (r.reason || "").replace(/^\[BUG\]\s*/, "");
  const parts = text.split(": ");
  const page = parts[0] || "Unknown";
  const rest = parts.slice(1).join(": ");
  const cut = rest.indexOf(" — ");
  const title = cut > -1 ? rest.slice(0, cut) : rest;
  const desc = cut > -1 ? rest.slice(cut + 3) : "";
  return { page, title: title || "Untitled bug", desc: desc && desc !== "No details" ? desc : "" };
}

export function BugReportsView({ reports, setReports, showToast }) {
  const [busyId, setBusyId] = useState(null);
  const bugs = reports.filter(isBugReport);

  const resolve = async (r) => {
    if (busyId) return;
    setBusyId(r.id);
    try {
      await api.adminDeleteReport(r.id);
      setReports((prev) => prev.filter((x) => x.id !== r.id));
      showToast({ text: "Bug report resolved", icon: "check" });
    } catch (e) {
      showToast({ text: friendlyError(e), tone: "error" });
    }
    setBusyId(null);
  };

  return (
    <>
      <PageHeader title="Bug reports" description="Problems members reported from the app. Resolve them once they're fixed or no longer relevant." />
      {bugs.length === 0 ? (
        <EmptyState icon="bug" title="No bug reports">Reports members send from Settings → Report a bug appear here.</EmptyState>
      ) : bugs.map((r) => {
        const b = parseBug(r);
        return (
          <div key={r.id} className="adm-item">
            <div className="adm-item-main">
              <div className="adm-item-title"><Pill tone="blue" dot={false}>{b.page}</Pill>{b.title}</div>
              {b.desc && <div className="adm-item-text" style={{ whiteSpace: "pre-wrap" }}>{b.desc}</div>}
              <div className="adm-item-meta">
                {r.reporter ? `${r.reporter.name}${r.reporter.email ? ` (${r.reporter.email})` : ""} · ` : ""}
                <span title={formatDate(r.created_at, { time: true })}>{ago(r.created_at)}</span>
              </div>
            </div>
            <div className="adm-item-actions">
              <Button variant="secondary" size="sm" icon="check" disabled={busyId === r.id} onClick={() => resolve(r)}>{busyId === r.id ? "Resolving…" : "Resolve"}</Button>
            </div>
          </div>
        );
      })}
    </>
  );
}
