// Reports (flagged content and profiles) and Feedback (bug reports and
// ideas from members). All live in the reports table; the kind is the
// "[TYPE]" prefix of the reason ("[BUG]", "[IDEA]"). Handling a
// report changes its status ("reviewed" when dismissed, "resolved" when acted
// on), so it stays on record under Handled. The panel has every open report
// but only the newest handled ones.
import { useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { Button, ConfirmDialog, EmptyState, PageHeader, Pill, SectionTitle } from "./ui";
import { ago, formatDate, friendlyError, isNothingChangedError } from "./format";

export const isBugReport = (r) => (r.reason || "").startsWith("[BUG]");
export const isIdea = (r) => (r.reason || "").startsWith("[IDEA]");
// Feedback from members, not a report about someone or something.
export const isFeedback = (r) => isBugReport(r) || isIdea(r);
const isPending = (r) => r.status === "pending" || !r.status;
export const isOpenReport = (r) => !isFeedback(r) && isPending(r);
export const isOpenBug = (r) => isBugReport(r) && isPending(r);
export const isOpenIdea = (r) => isIdea(r) && isPending(r);

const CATEGORIES = ["Feed posts", "Marketplace", "Docs", "Events", "Help requests", "Profiles"];

const HANDLED_PAGE = 20;

const fmt = (n) => n.toLocaleString("en-GB");

// Reports handled from this panel since it loaded (on top of the server's
// count of handled ones).
const handledHere = (list) => list.filter((r) => r.handledHere).length;

// Marks the reports the server changed (rows it returned) as handled here.
function markHandled(prev, changedRows) {
  const byId = new Map(changedRows.map((x) => [x.id, x]));
  return prev.map((x) => (byId.has(x.id) ? { ...x, status: byId.get(x.id).status, handledHere: true } : x));
}

// "Showing the newest 200 of 1,234." when not all handled reports are loaded.
function HandledNote({ shown, total }) {
  if (total <= shown) return null;
  return <p className="adm-muted adm-small" style={{ margin: "0 0 8px" }}>Showing the newest {fmt(shown)} of {fmt(total)}.</p>;
}

const ALREADY_HANDLED = "Already handled by someone else. Reloading the list.";

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

const sameTarget = (a, b) => !isFeedback(b) && targetKey(a) === targetKey(b);

export const personOf = (u) => (u ? { name: u.name, email: u.email, linkedin_url: u.linkedin_url || "" } : null);

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
        {/* A block records this link if an admin never reviewed their details. */}
        {r.reported_user.linkedin_url && <div className="adm-preview-text">LinkedIn: {r.reported_user.linkedin_url}</div>}
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

// handledTotal: how many handled member reports there are in all (only the
// newest are loaded). onReload loads the panel's data again;
// onReportsChange(ids) tells the panel which reports' status was just
// changed here, so a reload that started earlier keeps them as they are now.
export function ReportsView({ reports, setReports, handledTotal = 0, usersById, onMemberChange, onReportsChange, showToast, onReload }) {
  const [busyId, setBusyId] = useState(null);
  const [confirm, setConfirm] = useState(null); // { report, kind: "remove" | "block" }
  const [confirmError, setConfirmError] = useState("");
  const [lookups, setLookups] = useState({}); // target key -> "loading" | "error"
  const [handledLimit, setHandledLimit] = useState(HANDLED_PAGE);
  const inFlight = useRef(new Set()); // target keys being fetched
  const failed = useRef(new Set()); // target keys whose fetch failed (retried by hand)

  const open = reports.filter(isOpenReport);
  const handled = reports.filter((r) => !isFeedback(r) && !isOpenReport(r));
  const handledCount = Math.max(handledTotal + handledHere(handled), handled.length);
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
      if (row && profile) patch = { reported_user: { name: row.name, email: row.email, linkedin_url: row.linkedin_url || "", status: row.status } };
      if (row && !profile) {
        const preview = contentPreview(kindOf(r), row);
        patch = { reportedContent: preview, contentAuthor: personOf(usersById[preview.authorId]) };
      }
      setReports((prev) => prev.map((x) => (!isFeedback(x) && targetKey(x) === key ? { ...x, ...patch } : x)));
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

  // Only reports that are still open change. If this one isn't (another
  // admin handled it first), show the list as it is now.
  const alreadyHandled = () => {
    showToast({ text: ALREADY_HANDLED });
    onReload?.();
  };

  // The reports the server just marked as handled (rows it returned).
  const showHandled = (changed) => {
    onReportsChange?.(changed.map((x) => x.id));
    setReports((prev) => markHandled(prev, changed));
  };

  const dismiss = async (r) => {
    if (busyId) return;
    setBusyId(r.id);
    try {
      const changed = await api.adminSetReportStatus([r.id], "reviewed");
      if (changed.length) {
        showHandled(changed);
        showToast({ text: "Report dismissed" });
      } else {
        alreadyHandled();
      }
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
    // Close the reports first, as removed or blocked ("resolved"). Only
    // reports that are still open change, so if another admin has handled
    // them all (perhaps deciding to keep the item), nothing is done.
    let claimed;
    try {
      claimed = await api.adminSetReportStatus(ids, "resolved");
    } catch (e) {
      setConfirmError(friendlyError(e));
      setBusyId(null);
      return;
    }
    if (!claimed.length) {
      setConfirm(null);
      setBusyId(null);
      alreadyHandled();
      return;
    }
    const claimedIds = claimed.map((x) => x.id);
    onReportsChange?.(claimedIds);
    try {
      if (kind === "remove") await removeContent(r);
      if (kind === "block") {
        await api.adminSetMemberStatus(r.reported_user_id, "blocked");
        onMemberChange(r.reported_user_id, { status: "blocked" }, { status: "active" });
        setReports((prev) => prev.map((x) => (x.reported_user && x.reported_user_id === r.reported_user_id
          ? { ...x, reported_user: { ...x.reported_user, status: "blocked" } } : x)));
      }
    } catch (e) {
      // Nothing was removed or blocked: open the reports again.
      const reopened = await api.adminReopenReports(claimedIds, "resolved").catch(() => []);
      onReportsChange?.(claimedIds);
      const one = claimedIds.length === 1;
      const state = reopened.length === claimedIds.length
        ? (one ? "The report is still open." : "The reports are still open.")
        : (one ? "The report was closed anyway and couldn't be opened again." : "The reports were closed anyway and couldn't be opened again.");
      const why = friendlyError(e);
      setConfirmError(`${/[.!?]$/.test(why) ? why : `${why}.`} ${state}`);
      setBusyId(null);
      return;
    }
    showHandled(claimed);
    setConfirm(null);
    setBusyId(null);
    const done = kind === "remove" ? "Content removed" : `Blocked ${who}`;
    // Reports another admin handled first keep their decision.
    if (claimed.length < ids.length) {
      const rest = ids.length - claimed.length;
      showToast({ text: `${done}. ${fmt(claimed.length)} of ${fmt(ids.length)} reports closed; ${rest === 1 ? "the other was" : "the others were"} already handled by someone else.` });
      onReload?.();
      return;
    }
    const closed = ids.length > 1 ? `. ${ids.length} reports closed` : "";
    showToast({ text: `${done}${closed}` });
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
          <SectionTitle count={handledCount}>Handled</SectionTitle>
          <HandledNote shown={handled.length} total={handledCount} />
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

// The title is the message's first line (cut at 60 characters): don't show
// that line twice.
const withoutTitle = (title, desc) => {
  const [first, ...more] = (desc || "").split("\n");
  return first.trim() === title.trim() ? more.join("\n").trim() : desc;
};

function parseBug(r) {
  const text = (r.reason || "").replace(/^\[BUG\]\s*/, "");
  const parts = text.split(": ");
  const page = parts[0] || "Unknown";
  const rest = parts.slice(1).join(": ");
  const cut = rest.indexOf(" — ");
  const title = cut > -1 ? rest.slice(0, cut) : rest;
  const desc = cut > -1 ? rest.slice(cut + 3) : "";
  return { page, title: title || "Untitled bug", desc: desc && desc !== "No details" ? withoutTitle(title, desc) : "" };
}

function parseIdea(r) {
  const text = (r.reason || "").replace(/^\[IDEA\]\s*/, "");
  const cut = text.indexOf(" — ");
  const title = (cut > -1 ? text.slice(0, cut) : text) || "Untitled idea";
  return { title, desc: cut > -1 ? withoutTitle(title, text.slice(cut + 3)) : "" };
}

// Feedback: problems members report and ideas they send (Settings → Send
// feedback). Problems are resolved once fixed; ideas are marked done once
// built, or closed. handledTotal: how many handled ones there are in all
// (only the newest are loaded). onReload and onReportsChange: as for
// ReportsView.
export function FeedbackView({ reports, setReports, handledTotal = 0, onReportsChange, showToast, onReload }) {
  const [busyId, setBusyId] = useState(null);
  const [tab, setTab] = useState("bugs"); // bugs | ideas
  const [handledLimit, setHandledLimit] = useState(HANDLED_PAGE);
  const isKind = tab === "bugs" ? isBugReport : isIdea;
  const open = reports.filter((r) => isKind(r) && isPending(r));
  const handled = reports.filter((r) => isKind(r) && !isPending(r));
  const allHandled = reports.filter((r) => isFeedback(r) && !isPending(r));
  const handledCount = Math.max(handledTotal + handledHere(allHandled), allHandled.length);
  const openBugs = reports.filter(isOpenBug).length;
  const openIdeas = reports.filter(isOpenIdea).length;

  const setStatus = async (r, status, text) => {
    if (busyId) return;
    setBusyId(r.id);
    try {
      const changed = await api.adminSetReportStatus([r.id], status);
      if (changed.length) {
        onReportsChange?.(changed.map((x) => x.id));
        setReports((prev) => markHandled(prev, changed));
        showToast({ text, icon: "check" });
      } else {
        // Someone else handled it first: show the list as it is now.
        showToast({ text: ALREADY_HANDLED });
        onReload?.();
      }
    } catch (e) {
      showToast({ text: friendlyError(e), tone: "error" });
    }
    setBusyId(null);
  };

  const renderItem = (r, actionable) => {
    const bug = isBugReport(r);
    const b = bug ? parseBug(r) : parseIdea(r);
    const done = r.status === "resolved";
    return (
      <div key={r.id} className="adm-item">
        <div className="adm-item-main">
          <div className="adm-item-title">
            {bug ? <Pill tone="blue" dot={false}>{b.page}</Pill> : !actionable && <Pill tone={done ? "green" : "gray"} dot={false}>{done ? "Done" : "Closed"}</Pill>}
            {b.title}
          </div>
          {b.desc && <div className="adm-item-text" style={{ whiteSpace: "pre-wrap" }}>{b.desc}</div>}
          <div className="adm-item-meta">
            {r.reporter ? `${r.reporter.name}${r.reporter.email ? ` (${r.reporter.email})` : ""} · ` : ""}
            <span title={formatDate(r.created_at, { time: true })}>{ago(r.created_at)}</span>
          </div>
        </div>
        {actionable && (
          <div className="adm-item-actions">
            {bug ? (
              <Button variant="secondary" size="sm" icon="check" disabled={busyId === r.id} onClick={() => setStatus(r, "resolved", "Bug report resolved")}>{busyId === r.id ? "Resolving…" : "Resolve"}</Button>
            ) : (
              <>
                <Button variant="secondary" size="sm" icon="check" disabled={busyId === r.id} onClick={() => setStatus(r, "resolved", "Idea marked as done")}>Done</Button>
                <Button variant="ghost" size="sm" disabled={busyId === r.id} onClick={() => setStatus(r, "reviewed", "Idea closed")}>Close</Button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <PageHeader title="Feedback" description="Problems members report and ideas they send from Settings → Send feedback. Resolve problems once they're fixed; mark ideas done once built, or close them." />
      <div role="tablist" style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[["bugs", `Problems${openBugs ? ` (${openBugs})` : ""}`], ["ideas", `Ideas${openIdeas ? ` (${openIdeas})` : ""}`]].map(([k, l]) => (
          <Button key={k} role="tab" aria-selected={tab === k} variant={tab === k ? "primary" : "secondary"} size="sm" onClick={() => { setTab(k); setHandledLimit(HANDLED_PAGE); }}>{l}</Button>
        ))}
      </div>
      {open.length === 0 ? (
        <EmptyState icon={tab === "bugs" ? "bug" : "message"} title={tab === "bugs" ? "No open problems" : "No new ideas"}>
          {tab === "bugs" ? "Problems members report from Settings → Send feedback appear here." : "Ideas members send from Settings → Send feedback appear here."}
        </EmptyState>
      ) : open.map((r) => renderItem(r, true))}
      {handled.length > 0 && (
        <section>
          <SectionTitle count={handled.length}>{tab === "bugs" ? "Resolved" : "Done or closed"}</SectionTitle>
          <HandledNote shown={allHandled.length} total={handledCount} />
          {handled.slice(0, handledLimit).map((r) => renderItem(r, false))}
          {handled.length > handledLimit && (
            <div className="adm-more">
              <Button variant="secondary" size="sm" onClick={() => setHandledLimit((l) => l + HANDLED_PAGE)}>Show {Math.min(HANDLED_PAGE, handled.length - handledLimit)} more</Button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
