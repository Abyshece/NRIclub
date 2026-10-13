// Reports (flagged content and profiles) and Bug reports. Both live in the
// reports table; the kind is the "[TYPE]" prefix of the reason. Handling a
// report changes its status ("reviewed" when dismissed, "resolved" when acted
// on), so it stays on record under Handled.
import { useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { Button, ConfirmDialog, EmptyState, PageHeader, Pill, SectionTitle } from "./ui";
import { ago, formatDate, friendlyError, isNothingChangedError } from "./format";

export const isBugReport = (r) => (r.reason || "").startsWith("[BUG]");
const isPending = (r) => r.status === "pending" || !r.status;
export const isOpenReport = (r) => !isBugReport(r) && isPending(r);
export const isOpenBug = (r) => isBugReport(r) && isPending(r);

const CATEGORIES = ["Feed posts", "Marketplace", "Docs", "Events", "Help requests", "Profiles"];

const HANDLED_PAGE = 20;

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

// Which kind of content was reported, and the table it lives in.
function kindOf(r) {
  const reason = (r.reason || "").toUpperCase();
  return reason.startsWith("[MARKETPLACE]") ? "market"
    : reason.startsWith("[DOC]") ? "doc"
    : reason.startsWith("[EVENT]") ? "event"
    : reason.startsWith("[HELP]") ? "help"
    : "post";
}

const TABLES = { post: "posts", market: "marketplace", doc: "docs", event: "events", help: "help_requests" };
const CONTENT_NOUN = { post: "post", market: "listing", doc: "doc", event: "event", help: "help request" };

const isProfileReport = (r) => !r.reported_post_id && !!r.reported_user_id;

// The reported item ("post:<id>", "profile:<id>"), for fetching it and for
// finding other reports about it.
export const targetKey = (r) => (isProfileReport(r) ? `profile:${r.reported_user_id}` : `${kindOf(r)}:${r.reported_post_id}`);

const sameTarget = (a, b) => !isBugReport(b) && targetKey(a) === targetKey(b);

export const personOf = (u) => (u ? { name: u.name, email: u.email } : null);

// A preview of reported content from its row (kind: post, doc, event, help
// or market).
export function contentPreview(kind, row) {
  if (!row) return null;
  if (kind === "post") return { type: "post", content: row.content, image: row.image_url, authorId: row.user_id };
  if (kind === "doc") return { type: "doc", content: row.title, excerpt: row.excerpt, authorId: row.user_id };
  if (kind === "event") return { type: "event", content: row.title, excerpt: row.description, date: row.date, authorId: row.organizer_id };
  if (kind === "help") return { type: "help", content: row.title, excerpt: row.description, authorId: row.user_id };
  // Listings keep image_url as a JSON array of URLs; show the first.
  let img = row.image_url;
  try { const a = JSON.parse(img); img = Array.isArray(a) ? a[0] : img; } catch { img = row.image_url; }
  return { type: "marketplace", content: row.title, excerpt: row.description, price: row.price, image: img, authorId: row.user_id };
}

function Note({ children }) {
  return <div className="adm-preview"><div className="adm-preview-text">{children}</div></div>;
}

// lookup: "loading" | "error" while an item that wasn't loaded with the panel
// is fetched by id.
function ContentPreview({ r, lookup, onRetry }) {
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
  const profile = isProfileReport(r);
  if (profile && r.reported_user) {
    return (
      <div className="adm-preview">
        <div className="adm-preview-title">Profile: {r.reported_user.name || "Unnamed member"}</div>
        {r.reported_user.email && <div className="adm-preview-text">{r.reported_user.email}</div>}
      </div>
    );
  }
  if (!profile && !r.reported_post_id) return null;
  if (r.missing) return <Note>{profile ? "Profile not found. The account may have been deleted." : "Content not found. It may already have been deleted."}</Note>;
  if (lookup === "loading") return <Note>{profile ? "Loading the profile…" : "Loading the reported content…"}</Note>;
  if (lookup === "error") {
    return (
      <Note>
        {profile ? "Couldn't load the profile." : "Couldn't load the reported content."}{" "}
        <button type="button" className="adm-link" onClick={onRetry}>Try again</button>
      </Note>
    );
  }
  return null;
}

export function ReportsView({ reports, setReports, usersById, onMemberChange, showToast }) {
  const [busyId, setBusyId] = useState(null);
  const [confirm, setConfirm] = useState(null); // { report, kind: "remove" | "block" }
  const [confirmError, setConfirmError] = useState("");
  const [lookups, setLookups] = useState({}); // target key -> "loading" | "error"
  const [handledLimit, setHandledLimit] = useState(HANDLED_PAGE);
  const inFlight = useRef(new Set()); // target keys being fetched
  const failed = useRef(new Set()); // target keys whose fetch failed (retried by hand)

  const open = reports.filter(isOpenReport);
  const handled = reports.filter((r) => !isBugReport(r) && !isOpenReport(r));
  const grouped = {};
  open.forEach((r) => { const c = categoryOf(r); (grouped[c] = grouped[c] || []).push(r); });

  // The panel loads only the newest items, so fetch any other reported item
  // by id: nothing can be removed or blocked without being shown first.
  const lookUp = async (r) => {
    const key = targetKey(r);
    const profile = isProfileReport(r);
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    failed.current.delete(key);
    setLookups((l) => ({ ...l, [key]: "loading" }));
    try {
      const row = await api.adminGetReportedItem(profile ? "profile" : kindOf(r), profile ? r.reported_user_id : r.reported_post_id);
      let patch = { missing: true };
      if (row && profile) patch = { reported_user: { name: row.name, email: row.email, status: row.status } };
      if (row && !profile) {
        const preview = contentPreview(kindOf(r), row);
        patch = { reportedContent: preview, contentAuthor: personOf(usersById[preview.authorId]) };
      }
      setReports((prev) => prev.map((x) => (!isBugReport(x) && targetKey(x) === key ? { ...x, ...patch } : x)));
      setLookups((l) => { const next = { ...l }; delete next[key]; return next; });
    } catch {
      failed.current.add(key);
      setLookups((l) => ({ ...l, [key]: "error" }));
    }
    inFlight.current.delete(key);
  };

  useEffect(() => {
    reports.forEach((r) => {
      if (!isOpenReport(r) || r.missing) return;
      const shown = isProfileReport(r) ? !!r.reported_user : !r.reported_post_id || !!r.reportedContent;
      if (shown || failed.current.has(targetKey(r))) return;
      lookUp(r);
    });
  }, [reports]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = async (r) => {
    if (busyId) return;
    setBusyId(r.id);
    try {
      await api.adminSetReportStatus([r.id], "reviewed");
      setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: "reviewed" } : x)));
      showToast({ text: "Report dismissed" });
    } catch (e) {
      showToast({ text: friendlyError(e), tone: "error" });
    }
    setBusyId(null);
  };

  // Removing something that's already gone counts as done.
  const removeContent = async (r) => {
    try {
      await api.adminDeleteContent(TABLES[kindOf(r)], r.reported_post_id);
    } catch (e) {
      if (!isNothingChangedError(e)) throw e;
      const still = await api.adminGetReportedItem(kindOf(r), r.reported_post_id).catch(() => undefined);
      if (still !== null) throw e;
    }
  };

  const runConfirmed = async () => {
    const { report: r, kind } = confirm;
    const who = r.reported_user?.name || "the account";
    // Every open report about the same item (or profile) is closed with it.
    const ids = open.filter((x) => x.id === r.id || sameTarget(r, x)).map((x) => x.id);
    setBusyId(r.id);
    setConfirmError("");
    try {
      if (kind === "remove") await removeContent(r);
      if (kind === "block") {
        await api.adminSetMemberStatus(r.reported_user_id, "blocked");
        onMemberChange(r.reported_user_id, { status: "blocked" }, { status: "active" });
        setReports((prev) => prev.map((x) => (x.reported_user && x.reported_user_id === r.reported_user_id
          ? { ...x, reported_user: { ...x.reported_user, status: "blocked" } } : x)));
      }
    } catch (e) {
      setConfirmError(friendlyError(e));
      setBusyId(null);
      return;
    }
    try {
      await api.adminSetReportStatus(ids, "resolved");
    } catch (e) {
      const done = kind === "remove" ? `The ${CONTENT_NOUN[kindOf(r)]} was removed` : `${who} is blocked`;
      setConfirmError(`${done}, but the report couldn't be closed: ${friendlyError(e)}`);
      setBusyId(null);
      return;
    }
    setReports((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, status: "resolved" } : x)));
    setConfirm(null);
    setBusyId(null);
    const closed = ids.length > 1 ? `. ${ids.length} reports closed` : "";
    showToast({ text: `${kind === "remove" ? "Content removed" : `Blocked ${who}`}${closed}` });
  };

  const renderReport = (r, actionable) => {
    const isProfile = isProfileReport(r);
    const alreadyBlocked = isProfile && (usersById[r.reported_user_id]?.status || r.reported_user?.status) === "blocked";
    // Only what is shown here can be removed or blocked.
    const shown = isProfile ? !!r.reported_user : !!r.reported_post_id && !!r.reportedContent;
    return (
      <div key={r.id} className="adm-item">
        <div className="adm-item-main">
          <div className="adm-item-title">
            {(r.reason || "No reason given").replace(/^\[\w+\]\s*/, "")}
            {!actionable && <Pill tone={r.status === "resolved" ? "red" : "gray"}>{r.status === "resolved" ? (isProfile ? "Blocked" : "Removed") : "Dismissed"}</Pill>}
          </div>
          <ContentPreview r={r} lookup={actionable ? lookups[targetKey(r)] : undefined} onRetry={() => lookUp(r)} />
          <div className="adm-item-meta">
            {r.reporter ? `Reported by ${r.reporter.name}${r.reporter.email ? ` (${r.reporter.email})` : ""}` : "Reported"} · <span title={formatDate(r.created_at, { time: true })}>{ago(r.created_at)}</span>
          </div>
        </div>
        {actionable && (
          <div className="adm-item-actions">
            {alreadyBlocked
              ? <Pill tone="red">Blocked</Pill>
              : !shown ? null
              : isProfile
              ? <Button variant="danger" size="sm" icon="ban" disabled={busyId === r.id} onClick={() => { setConfirmError(""); setConfirm({ report: r, kind: "block" }); }}>Block account</Button>
              : <Button variant="danger" size="sm" icon="trash" disabled={busyId === r.id} onClick={() => { setConfirmError(""); setConfirm({ report: r, kind: "remove" }); }}>Remove content</Button>}
            <Button variant="secondary" size="sm" disabled={busyId === r.id} onClick={() => dismiss(r)}>Dismiss</Button>
          </div>
        )}
      </div>
    );
  };

  const noun = confirm ? CONTENT_NOUN[kindOf(confirm.report)] : "";
  const related = confirm ? open.filter((x) => x.id === confirm.report.id || sameTarget(confirm.report, x)).length : 0;

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
          {handled.slice(0, handledLimit).map((r) => renderReport(r, false))}
          {handled.length > handledLimit && (
            <div className="adm-more">
              <Button variant="secondary" size="sm" onClick={() => setHandledLimit((l) => l + HANDLED_PAGE)}>Show {Math.min(HANDLED_PAGE, handled.length - handledLimit)} more</Button>
            </div>
          )}
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
            ? `It's deleted for everyone and ${related > 1 ? `all ${related} reports about it are` : "the report is"} closed. This can't be undone.`
            : `They can still sign in, but can't post, message or connect with anyone until you unblock them in Members. ${related > 1 ? `All ${related} reports about them are` : "The report is"} closed.`}
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
  const [resolvedLimit, setResolvedLimit] = useState(HANDLED_PAGE);
  const open = reports.filter(isOpenBug);
  const resolved = reports.filter((r) => isBugReport(r) && !isOpenBug(r));

  const resolve = async (r) => {
    if (busyId) return;
    setBusyId(r.id);
    try {
      await api.adminSetReportStatus([r.id], "resolved");
      setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: "resolved" } : x)));
      showToast({ text: "Bug report resolved", icon: "check" });
    } catch (e) {
      showToast({ text: friendlyError(e), tone: "error" });
    }
    setBusyId(null);
  };

  const renderBug = (r, actionable) => {
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
        {actionable && (
          <div className="adm-item-actions">
            <Button variant="secondary" size="sm" icon="check" disabled={busyId === r.id} onClick={() => resolve(r)}>{busyId === r.id ? "Resolving…" : "Resolve"}</Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <PageHeader title="Bug reports" description="Problems members reported from the app. Resolve them once they're fixed or no longer relevant." />
      {open.length === 0 ? (
        <EmptyState icon="bug" title={resolved.length ? "No open bug reports" : "No bug reports"}>Reports members send from Settings → Report a bug appear here.</EmptyState>
      ) : open.map((r) => renderBug(r, true))}
      {resolved.length > 0 && (
        <section>
          <SectionTitle count={resolved.length}>Resolved</SectionTitle>
          {resolved.slice(0, resolvedLimit).map((r) => renderBug(r, false))}
          {resolved.length > resolvedLimit && (
            <div className="adm-more">
              <Button variant="secondary" size="sm" onClick={() => setResolvedLimit((l) => l + HANDLED_PAGE)}>Show {Math.min(HANDLED_PAGE, resolved.length - resolvedLimit)} more</Button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
