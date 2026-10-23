// Reports (flagged content and profiles, and reports of illegal content from
// the public page nriclub.app/report) and Feedback (bug reports and ideas
// from members). Reports from members live in the reports table: what was
// reported is reports.content_type (before the 2026-10-21 database update,
// the "[TYPE]" prefix of the reason), the reason reports.category with the
// member's explanation. Every decision goes through the database
// (api.adminModerate, api.adminCloseReports), which records it and tells the
// member concerned why and whoever reported it what was decided (Art. 16(5)
// and 17 DSA). Reports about a threat to someone's life or safety come first
// (Art. 18 DSA). Handling a report changes its status ("reviewed" when
// dismissed, "resolved" when acted on), so it stays on record under Handled.
// The panel loads the oldest open reports, a page at a time ("Load more"),
// and only the newest handled ones.
import { useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { emailFailed, queueDecisionEmail } from "./memberEmail";
import ModerationDialog from "./ModerationDialog";
import { Button, ConfirmDialog, EmptyState, ErrorNote, PageHeader, Pill, SectionTitle } from "./ui";
import { ago, formatDate, friendlyError, firstName } from "./format";
import {
  REPORT_KINDS, SAFETY_CHECKLIST, mailtoLink, noticeDecisionEmail, noticeReceiptEmail, reportReasonLabel,
} from "../content/legal/reporting";

export const isBugReport = (r) => (r.reason || "").startsWith("[BUG]");
export const isIdea = (r) => (r.reason || "").startsWith("[IDEA]");
// Feedback from members, not a report about someone or something.
export const isFeedback = (r) => r.content_type === "feedback" || isBugReport(r) || isIdea(r);
const isPending = (r) => r.status === "pending" || !r.status;
export const isOpenReport = (r) => !isFeedback(r) && isPending(r);
export const isOpenBug = (r) => isBugReport(r) && isPending(r);
export const isOpenIdea = (r) => isIdea(r) && isPending(r);
// A report about a threat to someone's life or safety (Art. 18 DSA).
export const isSafetyReport = (r) => r.category === "safety";

const HANDLED_PAGE = 20;

const fmt = (n) => n.toLocaleString("en-GB");

// Reports handled from this panel since it loaded (on top of the server's
// count of handled ones).
const handledHere = (list) => list.filter((r) => r.handledHere).length;

// Marks reports as handled here: rows the server returned, or ids with the
// status they now have.
function markHandled(prev, changedRows) {
  const byId = new Map(changedRows.map((x) => [x.id, x]));
  return prev.map((x) => (byId.has(x.id) ? { ...x, status: byId.get(x.id).status, handledHere: true } : x));
}

// "Showing the newest 200 of 1,234." when not all handled reports are loaded.
function HandledNote({ shown, total }) {
  if (total <= shown) return null;
  return <p className="adm-muted adm-small" style={{ margin: "0 0 8px" }}>Showing the newest {fmt(shown)} of {fmt(total)}.</p>;
}

// Open reports load oldest first, a page at a time: how many more there are,
// and a button for the next page.
function MoreOpen({ count, what, busy, onLoadMore }) {
  if (!count) return null;
  return (
    <div className="adm-more" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <span className="adm-muted adm-small">{fmt(count)} more open {what} (newer than these).</span>
      <Button variant="secondary" size="sm" disabled={busy} onClick={onLoadMore}>{busy ? "Loading…" : `Load ${fmt(Math.min(count, api.OPEN_REPORTS_PAGE))} more`}</Button>
    </div>
  );
}

const ALREADY_HANDLED = "Already handled by someone else. Reloading the list.";

// What our team decided on a report from the public page.
const NOTICE_DECISIONS = { removed: "Removed", blocked: "Blocked", warned: "Warned", kept: "Kept", gone: "Already gone" };

// The kind of content from the "[TYPE]" prefix reports had before
// reports.content_type (and still have, for a quick look).
const PREFIX_KINDS = {
  MARKETPLACE: "market", MARKET: "market", DOC_COMMENT: "doc_comment", DOC: "doc", EVENT: "event", HELP: "help",
  REVIEW: "review", COMMENT: "comment", ANSWER: "answer", PLACE: "place", MESSAGE: "message", POST: "post",
  TRAVEL: "travel",
};

const isProfileReport = (r) => (r.content_type ? r.content_type === "profile"
  : !r.reported_post_id && !!r.reported_user_id) || /^\[(USER|PROFILE)\]/i.test(r.reason || "");

// Which kind of content was reported (post, comment, answer, doc,
// doc_comment, event, help, market, review, place, travel or message).
function kindOf(r) {
  if (r.content_type && r.content_type !== "profile" && r.content_type !== "feedback") return r.content_type;
  const m = /^\[([A-Z_]+)\]/.exec((r.reason || "").toUpperCase());
  return (m && PREFIX_KINDS[m[1]]) || "post";
}

const SECTIONS = [
  ["Safety", (r) => isSafetyReport(r)],
  ["Feed posts", (r) => kindOf(r) === "post"],
  ["Comments", (r) => kindOf(r) === "comment"],
  ["Answers", (r) => kindOf(r) === "answer"],
  ["Questions", (r) => kindOf(r) === "help"],
  ["Guides", (r) => kindOf(r) === "doc" || kindOf(r) === "doc_comment"],
  ["Events", (r) => kindOf(r) === "event"],
  ["Marketplace", (r) => kindOf(r) === "market"],
  ["Travel board", (r) => kindOf(r) === "travel"],
  ["Places", (r) => kindOf(r) === "place"],
  ["Messages", (r) => kindOf(r) === "message"],
  ["Mentor reviews", (r) => kindOf(r) === "review"],
];
const sectionOf = (r) => (isSafetyReport(r) ? "Safety" : isProfileReport(r) ? "Profiles"
  : (SECTIONS.find(([, test]) => test(r)) || ["Feed posts"])[0]);
const SECTION_ORDER = ["Safety", ...SECTIONS.slice(1).map(([name]) => name), "Profiles"];

// The reported item ("post:<id>", "profile:<id>"), for fetching it and for
// finding other reports about it.
export const targetKey = (r) => (isProfileReport(r) ? `profile:${r.reported_user_id}` : `${kindOf(r)}:${r.reported_post_id}`);

const sameTarget = (a, b) => !isFeedback(b) && targetKey(a) === targetKey(b);

export const personOf = (u) => (u ? { name: u.name, email: u.email, linkedin_url: u.linkedin_url || "", avatar_url: u.avatar_url || "", bio: u.bio || "", status: u.status } : null);

const snippet = (t, n = 60) => {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 3)}...` : s;
};

// A preview of reported content from its row (kind as kindOf).
export function contentPreview(kind, row) {
  if (!row) return null;
  if (kind === "post") return { type: "post", content: row.content, image: row.image_url, authorId: row.user_id };
  if (kind === "comment") return { type: "comment", content: row.content, authorId: row.user_id };
  if (kind === "answer") return { type: "answer", content: row.content, authorId: row.user_id };
  if (kind === "doc_comment") return { type: "doc_comment", content: row.content, authorId: row.user_id };
  if (kind === "doc") return { type: "doc", content: row.title, excerpt: row.excerpt, authorId: row.user_id };
  if (kind === "event") return { type: "event", content: row.title, excerpt: row.description, date: row.date, authorId: row.organizer_id };
  if (kind === "help") return { type: "help", content: row.title, excerpt: row.description, authorId: row.user_id };
  if (kind === "review") return { type: "review", content: `${"★".repeat(row.rating)}${"☆".repeat(5 - row.rating)} mentoring review`, excerpt: row.comment, authorId: row.mentee_id };
  if (kind === "place") return { type: "place", content: row.name, excerpt: [row.kind, row.address, row.city].filter(Boolean).join(" · ") + (row.note ? ` — ${row.note}` : ""), authorId: row.created_by };
  if (kind === "message") return { type: "message", content: row.content, date: formatDate(row.created_at, { time: true }), authorId: row.sender_id };
  if (kind === "travel") {
    const when = row.date_from === row.date_to ? row.date_from : `${row.date_from} to ${row.date_to}`;
    const what = (row.help || []).join(", ");
    return { type: "travel", content: `${row.from_city} → ${row.to_city}`, excerpt: [row.kind === "offer" ? `Travelling, can help with: ${what}` : `Needs help with: ${what}`, row.flight, row.note].filter(Boolean).join(" · "), date: when, authorId: row.user_id };
  }
  // Listings keep image_url as a JSON array of URLs; show the first.
  let img = row.image_url;
  try { const a = JSON.parse(img); img = Array.isArray(a) ? a[0] : img; } catch { img = row.image_url; }
  return { type: "marketplace", content: row.title, excerpt: row.description, price: row.price, image: img, authorId: row.user_id };
}

// How the author sees what is removed: 'your comment "Nobody wants…"'.
const ownedWhat = (kind, c) => `your ${REPORT_KINDS[kind] || "post"}${c?.content && kind !== "review" ? ` "${snippet(c.content)}"` : c?.excerpt && kind === "review" ? ` "${snippet(c.excerpt)}"` : ""}`;

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
        <div className="adm-preview-title" style={{ whiteSpace: c.type === "message" || c.type === "comment" ? "pre-wrap" : undefined }}>{main || <span className="adm-faint">(no text)</span>}</div>
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
    const u = r.reported_user;
    return (
      <div className="adm-preview">
        {/^https?:\/\//i.test(u.avatar_url || "") && <img src={u.avatar_url} alt="Profile photo" loading="lazy" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover" }} />}
        <div className="adm-preview-title">Profile: {u.name || "Unnamed member"}</div>
        {u.email && <div className="adm-preview-text">{u.email}</div>}
        {/* A block records this link if an admin never reviewed their details. */}
        {u.linkedin_url && <div className="adm-preview-text">LinkedIn: {u.linkedin_url}</div>}
        {u.bio && <div className="adm-preview-text">Bio: {u.bio.slice(0, 200)}{u.bio.length > 200 ? "…" : ""}</div>}
      </div>
    );
  }
  if (!profile && !r.reported_post_id) return null;
  if (r.missing) return <Note>{profile ? "Profile not found. The account may have been deleted." : "Content not found. It may already have been deleted."}</Note>;
  if (r.messageUnavailable) return <Note>Reported messages can be read here once the database update of 21 October 2026 is in.</Note>;
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

// Our team's note on a report or notice (e.g. which police authority they
// told about a safety report, and when). save(note) may throw.
export function NoteEditor({ value, save, label = "Note for our team", placeholder = "e.g. Told the BKA on 21 Oct by phone, reference 12345" }) {
  const [draft, setDraft] = useState(value || "");
  const [state, setState] = useState(""); // "" | "saving" | "saved" | error text
  useEffect(() => { setDraft(value || ""); }, [value]);
  const dirty = draft.trim() !== String(value || "").trim();
  const store = async () => {
    setState("saving");
    try { await save(draft.trim()); setState("saved"); } catch (e) { setState(friendlyError(e)); }
  };
  return (
    <div style={{ marginTop: 10 }}>
      <label className="adm-field-label">{label} <span className="adm-faint">(admins only)</span></label>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
        <input className="adm-input" style={{ flex: "1 1 220px" }} value={draft} maxLength={2000} placeholder={placeholder}
          onChange={(e) => { setDraft(e.target.value); setState(""); }} />
        <Button variant="secondary" size="sm" disabled={!dirty || state === "saving"} onClick={store}>{state === "saving" ? "Saving…" : "Save note"}</Button>
      </div>
      {state && state !== "saving" && <div className="adm-help" role="status">{state === "saved" ? "Saved." : state}</div>}
    </div>
  );
}

function SafetyChecklist() {
  return (
    <div className="adm-safety" role="note">
      <strong>A threat to someone's life or safety: deal with this first.</strong>
      <ol>{SAFETY_CHECKLIST.map((t) => <li key={t}>{t}</li>)}</ol>
    </div>
  );
}

// A link to content on NRIClub in a notice ("https://nriclub.app/post/<id>"):
// { kind, id } for the admin panel, or null.
const LINK_KINDS = { post: "post", u: "profile", events: "event", docs: "doc", market: "market" };
export function linkedItem(text) {
  const m = /nriclub\.app\/(post|u|events|docs|market)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(String(text || ""));
  return m ? { kind: LINK_KINDS[m[1].toLowerCase()], id: m[2].toLowerCase() } : null;
}

// handledTotal: how many handled member reports there are in all (only the
// newest are loaded). onReload loads the panel's data again;
// onReportsChange(ids) tells the panel which reports' status was just
// changed here, so a reload that started earlier keeps them as they are now.
// notices: reports from the public page (null before the database update);
// recorded: whether the database records decisions and tells the members
// concerned (the 2026-10-21 update).
export function ReportsView({ reports, setReports, handledTotal = 0, moreOpen = 0, loadingMore = false, onLoadMore, usersById, onMemberChange, onReportsChange, showToast, onReload, notices = null, setNotices, recorded = true }) {
  const [busyId, setBusyId] = useState(null);
  const [dialog, setDialog] = useState(null); // { kind: "moderate" | "dismiss" | "keep", ... }
  const [lookups, setLookups] = useState({}); // target key -> "loading" | "error"
  const [notes, setNotes] = useState({}); // report id -> our team's note
  const [recommenders, setRecommenders] = useState({}); // place id -> [{ id, name }]
  const [handledLimit, setHandledLimit] = useState(HANDLED_PAGE);
  const inFlight = useRef(new Set()); // target keys being fetched
  const failed = useRef(new Set()); // target keys whose fetch failed (retried by hand)

  const open = reports.filter(isOpenReport);
  const handled = reports.filter((r) => !isFeedback(r) && !isOpenReport(r));
  const handledCount = Math.max(handledTotal + handledHere(handled), handled.length);
  const grouped = {};
  open.forEach((r) => { const c = sectionOf(r); (grouped[c] = grouped[c] || []).push(r); });
  const openNotices = (notices || []).filter((n) => n.status === "open");
  const closedNotices = (notices || []).filter((n) => n.status !== "open");

  // The panel loads only the newest items, so fetch any other reported item
  // by id: nothing can be removed or blocked without being shown first.
  // Messages come one at a time, by report (admins can't read messages
  // otherwise).
  const lookUp = async (r) => {
    const key = targetKey(r);
    const profile = isProfileReport(r);
    const kind = profile ? "profile" : kindOf(r);
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    failed.current.delete(key);
    setLookups((l) => ({ ...l, [key]: "loading" }));
    try {
      let row;
      if (kind === "message") {
        row = await api.adminGetReportedMessage(r.id);
        if (row?.missing) row = { unavailable: true };
      } else {
        row = await api.adminGetReportedItem(kind, profile ? r.reported_user_id : r.reported_post_id);
      }
      let patch = { missing: true };
      if (row?.unavailable) patch = { messageUnavailable: true };
      else if (row && profile) patch = { reported_user: { name: row.name, email: row.email, linkedin_url: row.linkedin_url || "", avatar_url: row.avatar_url || "", bio: row.bio || "", status: row.status } };
      else if (row) {
        const preview = contentPreview(kind, row);
        patch = { reportedContent: preview, contentAuthor: personOf(usersById[preview.authorId]) || (row.sender_name ? { name: row.sender_name } : null) };
      }
      setReports((prev) => prev.map((x) => (!isFeedback(x) && targetKey(x) === key ? { ...x, ...patch } : x)));
      setLookups((l) => { const next = { ...l }; delete next[key]; return next; });
      if (kind === "place" && row) {
        api.adminGetPlaceRecommenders(r.reported_post_id).then((list) => setRecommenders((m) => ({ ...m, [r.reported_post_id]: list }))).catch(() => {});
      }
    } catch {
      failed.current.add(key);
      setLookups((l) => ({ ...l, [key]: "error" }));
    }
    inFlight.current.delete(key);
  };

  useEffect(() => {
    reports.forEach((r) => {
      if (!isOpenReport(r) || r.missing || r.messageUnavailable) return;
      const shown = isProfileReport(r) ? !!r.reported_user : !r.reported_post_id || !!r.reportedContent;
      if (shown || failed.current.has(targetKey(r))) return;
      lookUp(r);
    });
  }, [reports]); // eslint-disable-line react-hooks/exhaustive-deps

  // Our team's notes on safety reports.
  const safetyIds = open.filter(isSafetyReport).map((r) => r.id).join(",");
  useEffect(() => {
    if (!safetyIds) return;
    api.adminReportNotes(safetyIds.split(",")).then((n) => { if (n) setNotes((prev) => ({ ...prev, ...n })); }).catch(() => {});
  }, [safetyIds]);

  // Only reports that are still open change. If this one isn't (another
  // admin handled it first), show the list as it is now.
  const alreadyHandled = () => {
    showToast({ text: ALREADY_HANDLED });
    onReload?.();
  };

  // The reports the server just closed (rows it returned, or ids).
  const showHandled = (changed) => {
    const rows = changed.map((x) => (typeof x === "string" ? { id: x, status: "resolved" } : x));
    onReportsChange?.(rows.map((x) => x.id));
    setReports((prev) => markHandled(prev, rows));
  };

  const relatedIds = (r) => open.filter((x) => x.id === r.id || sameTarget(r, x)).map((x) => x.id);

  // Dismiss: we keep it ("reviewed"), or it's already gone ("resolved"). The
  // members who reported it are told why. Undo opens the reports again and
  // takes that message back.
  const dismiss = async ({ reports: ids, status, reason }) => {
    const changed = await api.adminCloseReports(ids, status, reason);
    if (!changed.length) { setDialog(null); alreadyHandled(); return; }
    showHandled(changed);
    setDialog(null);
    const closedIds = changed.map((x) => x.id);
    showToast({
      text: closedIds.length > 1 ? `${closedIds.length} reports dismissed` : "Report dismissed",
      undo: async () => {
        const reopened = await api.adminReopenReports(closedIds, status);
        onReportsChange?.(closedIds);
        setReports((prev) => prev.map((x) => (reopened.some((o) => o.id === x.id) ? { ...x, status: "pending", handledHere: false } : x)));
        return reopened.length ? "Undone. The report is open again." : "It was already handled again by someone else.";
      },
    });
  };

  // A decision through the database: remove, warn, block (and for a member,
  // remove the photo or bio). target: { kind, id, member? } as for
  // api.adminModerate. reports: the open ones it answers.
  const moderate = async ({ target, action, reasons, reportIds, notice = null, done }) => {
    const res = await api.adminModerate({ kind: target.kind, id: target.id, member: target.member, action, ...reasons, reportIds, notice });
    const closed = res?.closed_reports || [];
    if (closed.length) showHandled(closed);
    if (target.kind === "member" && action === "block") {
      onMemberChange(target.id, { status: "blocked" }, { status: "active" });
      // The member also gets an email about it (there's no Undo here).
      if (!res?.fallback) queueDecisionEmail(target.id, "blocked", { delay: 0, onFail: emailFailed(showToast) });
      setReports((prev) => prev.map((x) => (x.reported_user_id === target.id && x.reported_user ? { ...x, reported_user: { ...x.reported_user, status: "blocked" } } : x)));
    }
    if (target.kind === "profile_photo" || target.kind === "profile_bio") {
      const field = target.kind === "profile_photo" ? "avatar_url" : "bio";
      onMemberChange(target.id, { [field]: "" });
      setReports((prev) => prev.map((x) => (x.reported_user_id === target.id && x.reported_user ? { ...x, reported_user: { ...x.reported_user, [field]: "" } } : x)));
    }
    if (target.kind === "place_recommendation") {
      setRecommenders((m) => ({ ...m, [target.id]: (m[target.id] || []).filter((p) => p.id !== target.member) }));
    }
    if (notice && setNotices) {
      setNotices((prev) => (prev || []).map((n) => (n.id === notice ? { ...n, status: "closed", decision: { remove: "removed", warn: "warned", block: "blocked" }[action], decision_reason: reasons.facts, decided_at: new Date().toISOString() } : n)));
    }
    setDialog(null);
    const tail = res?.fallback ? " The member wasn't told: write to them from hello@nriclub.app." : "";
    showToast({ text: `${done}${closed.length > 1 ? `. ${closed.length} reports closed` : ""}.${tail}` });
  };

  // Opens the reasons dialog for a decision on what report r is about.
  const openModeration = async (r, action, extra = {}) => {
    const profile = isProfileReport(r);
    const memberId = profile ? r.reported_user_id : r.reportedContent?.authorId;
    let overview = null;
    if (action === "block" && memberId) overview = await api.adminMemberOverview(memberId);
    if (overview?.is_admin || overview?.is_me) {
      showToast({ text: overview.is_me ? "That's your own account." : "This is an admin's account: it can't be moderated here.", tone: "error" });
      return;
    }
    setDialog({ kind: "moderate", report: r, action, overview, ...extra });
  };

  const renderReport = (r, actionable) => {
    const isProfile = isProfileReport(r);
    const kind = isProfile ? "profile" : kindOf(r);
    const user = isProfile ? (r.reported_user || personOf(usersById[r.reported_user_id])) : null;
    const alreadyBlocked = isProfile && (usersById[r.reported_user_id]?.status || r.reported_user?.status) === "blocked";
    // Only what is shown here can be removed or blocked.
    const shown = isProfile ? !!r.reported_user : !!r.reported_post_id && !!r.reportedContent;
    const placeRecs = kind === "place" ? recommenders[r.reported_post_id] : null;
    const title = r.category ? reportReasonLabel(r.category) : (r.reason || "No reason given").replace(/^\[\w+\]\s*/, "");
    return (
      <div key={r.id} className="adm-item">
        <div className="adm-item-main">
          <div className="adm-item-title">
            {isSafetyReport(r) && <Pill tone="red">Safety</Pill>}
            <span>{title}</span>
            {!actionable && <Pill tone={r.status === "resolved" ? "red" : "gray"}>{r.status === "resolved" ? "Acted on" : "Dismissed"}</Pill>}
          </div>
          {r.explanation && <div className="adm-item-text" style={{ whiteSpace: "pre-wrap" }}>“{r.explanation}”</div>}
          {r.category && r.reason && !r.reason.endsWith(reportReasonLabel(r.category)) && <div className="adm-item-text adm-small">{r.reason.replace(/^\[\w+\]\s*/, "")}</div>}
          <ContentPreview r={r} lookup={actionable ? lookups[targetKey(r)] : undefined} onRetry={() => lookUp(r)} />
          {actionable && placeRecs && placeRecs.length > 0 && (
            <div className="adm-preview">
              <div className="adm-preview-text" style={{ marginBottom: 4 }}>Recommended by {placeRecs.length === 1 ? "1 member" : `${placeRecs.length} members`}:</div>
              {placeRecs.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
                  <span style={{ flex: 1, minWidth: 0 }} className="adm-ellipsis">{p.name || "A member"} <span className="adm-faint adm-small">{ago(p.created_at)}</span></span>
                  {recorded && (
                    <Button variant="ghost" size="sm" className="adm-btn-ghost-danger" disabled={busyId === r.id} aria-label={`Remove ${p.name || "this member"}'s recommendation`}
                      onClick={() => setDialog({ kind: "moderate", report: r, action: "remove", target: { kind: "place_recommendation", id: r.reported_post_id, member: p.id, name: p.name } })}>Remove…</Button>
                  )}
                </div>
              ))}
            </div>
          )}
          {isSafetyReport(r) && actionable && <SafetyChecklist />}
          {isSafetyReport(r) && (notes[r.id] !== undefined || actionable) && (
            <NoteEditor value={notes[r.id] || ""} save={async (note) => { await api.adminSetReportNote(r.id, note); setNotes((n) => ({ ...n, [r.id]: note })); }} />
          )}
          <div className="adm-item-meta">
            {r.reporter ? `Reported by ${r.reporter.name}${r.reporter.email ? ` (${r.reporter.email})` : ""}` : r.reporter_id ? "Reported by a member" : "Reported by a member who has since deleted their account"} · <span title={formatDate(r.created_at, { time: true })}>{ago(r.created_at)}</span>
          </div>
        </div>
        {actionable && (
          <div className="adm-item-actions" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
            {alreadyBlocked ? <Pill tone="red">Blocked</Pill>
              : !shown ? null
              : isProfile ? (
                <>
                  <Button variant="danger" size="sm" icon="ban" disabled={busyId === r.id} onClick={() => openModeration(r, "block")}>Block…</Button>
                  {recorded && <Button variant="secondary" size="sm" disabled={busyId === r.id} onClick={() => openModeration(r, "warn")}>Warn…</Button>}
                  {user?.avatar_url && <Button variant="secondary" size="sm" disabled={busyId === r.id} onClick={() => openModeration(r, "remove", { target: { kind: "profile_photo", id: r.reported_user_id } })}>Remove photo…</Button>}
                  {user?.bio && <Button variant="secondary" size="sm" disabled={busyId === r.id} onClick={() => openModeration(r, "remove", { target: { kind: "profile_bio", id: r.reported_user_id } })}>Remove bio…</Button>}
                </>
              ) : (
                <>
                  <Button variant="danger" size="sm" icon="trash" disabled={busyId === r.id} onClick={() => openModeration(r, "remove")}>Remove…</Button>
                  {recorded && r.reportedContent?.authorId && <Button variant="secondary" size="sm" disabled={busyId === r.id} onClick={() => openModeration(r, "warn")}>Warn author…</Button>}
                </>
              )}
            <Button variant="secondary" size="sm" disabled={busyId === r.id} onClick={() => setDialog({ kind: "dismiss", report: r })}>Dismiss…</Button>
          </div>
        )}
      </div>
    );
  };

  // ----- notices from the public page -----
  const noticeEmailName = (n) => (n.name ? firstName(n.name) : "");
  const markNotice = async (n, step, decision = null, reason = null) => {
    setBusyId(n.id);
    try {
      await api.adminUpdateNotice(n.id, step, decision, reason);
      const now = new Date().toISOString();
      setNotices?.((prev) => (prev || []).map((x) => (x.id !== n.id ? x
        : step === "receipt_sent" ? { ...x, receipt_sent_at: now }
        : step === "decision_sent" ? { ...x, decision_sent_at: now }
        : step === "decide" ? { ...x, status: "closed", decision, decision_reason: reason, decided_at: now }
        : step === "reopen" ? { ...x, status: "open", decision: "", decision_reason: "", decided_at: null, decision_sent_at: null }
        : step === "note" ? { ...x, admin_note: reason } : x)));
    } finally {
      setBusyId(null);
    }
  };
  // A notice's linked content, looked up on request.
  const [noticeItems, setNoticeItems] = useState({}); // notice id -> { kind, id, row } | "loading" | "missing" | "error"
  const lookUpNotice = async (n) => {
    const link = linkedItem(`${n.location} ${n.explanation}`);
    if (!link) return;
    setNoticeItems((m) => ({ ...m, [n.id]: "loading" }));
    try {
      const row = await api.adminGetReportedItem(link.kind, link.id);
      setNoticeItems((m) => ({ ...m, [n.id]: row ? { ...link, row } : "missing" }));
    } catch {
      setNoticeItems((m) => ({ ...m, [n.id]: "error" }));
    }
  };

  const renderNotice = (n) => {
    const openOne = n.status === "open";
    const link = linkedItem(`${n.location} ${n.explanation}`);
    const item = noticeItems[n.id];
    const receipt = n.email ? noticeReceiptEmail({ ref: n.reference, name: noticeEmailName(n) }) : null;
    const decisionMail = n.email && !openOne && n.decision
      ? noticeDecisionEmail({ ref: n.reference, name: noticeEmailName(n), outcome: n.decision, reason: n.decision_reason }) : null;
    const preview = item && typeof item === "object" ? contentPreview(item.kind === "profile" ? "post" : item.kind, item.kind === "profile" ? null : item.row) : null;
    return (
      <div key={n.id} className="adm-item">
        <div className="adm-item-main">
          <div className="adm-item-title">
            {n.category === "safety" && <Pill tone="red">Safety</Pill>}
            <span>{reportReasonLabel(n.category)}</span>
            <Pill tone="gray" dot={false}>{n.reference}</Pill>
            {!openOne && <Pill tone={n.decision === "kept" || n.decision === "gone" ? "gray" : "red"}>{NOTICE_DECISIONS[n.decision] || "Closed"}</Pill>}
          </div>
          <div className="adm-preview">
            <div className="adm-preview-text"><strong style={{ color: "var(--text)" }}>Where:</strong> <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{n.location}</span></div>
            <div className="adm-preview-text" style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>“{n.explanation}”</div>
          </div>
          {n.category === "safety" && openOne && <SafetyChecklist />}
          {openOne && link && !item && <div style={{ marginTop: 8 }}><Button variant="secondary" size="sm" onClick={() => lookUpNotice(n)}>Look at the linked {link.kind === "profile" ? "profile" : REPORT_KINDS[link.kind]}</Button></div>}
          {item === "loading" && <Note>Loading…</Note>}
          {item === "missing" && <Note>Not found: it may already have been deleted.</Note>}
          {item === "error" && <Note>Couldn't load it. <button type="button" className="adm-link" onClick={() => lookUpNotice(n)}>Try again</button></Note>}
          {item && typeof item === "object" && (
            item.kind === "profile"
              ? <Note>Profile: {item.row.name || "Unnamed member"}{item.row.email ? ` (${item.row.email})` : ""}</Note>
              : preview && <div className="adm-preview"><div className="adm-preview-title">{snippet(preview.content, 200) || "(no text)"}</div>{preview.excerpt && <div className="adm-preview-text">{snippet(preview.excerpt, 150)}</div>}</div>
          )}
          {openOne && item && typeof item === "object" && (
            <div className="adm-actions" style={{ marginTop: 8 }}>
              {item.kind === "profile" ? (
                <>
                  <Button variant="danger" size="sm" icon="ban" onClick={async () => {
                    const overview = await api.adminMemberOverview(item.id);
                    if (overview?.is_admin || overview?.is_me) { showToast({ text: "This is an admin's account: it can't be moderated here.", tone: "error" }); return; }
                    setDialog({ kind: "moderate", notice: n, action: "block", overview, target: { kind: "member", id: item.id, name: item.row.name } });
                  }}>Block…</Button>
                  <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: "moderate", notice: n, action: "warn", target: { kind: "member", id: item.id, name: item.row.name } })}>Warn…</Button>
                </>
              ) : (
                <Button variant="danger" size="sm" icon="trash" onClick={() => setDialog({ kind: "moderate", notice: n, action: "remove", target: { kind: item.kind, id: item.id }, preview })}>Remove…</Button>
              )}
            </div>
          )}
          <div className="adm-item-meta" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>From {n.name || "someone who didn't give their name"}{n.email ? ` (${n.email})` : ""} · <span title={formatDate(n.created_at, { time: true })}>{ago(n.created_at)}</span></span>
            {n.email ? (
              <span>
                {n.receipt_sent_at ? `Receipt sent ${formatDate(n.receipt_sent_at)}.` : (
                  <>
                    <a className="adm-link" href={mailtoLink(n.email, receipt)}>Write to the reporter: receipt</a>
                    {" · "}<button type="button" className="adm-link" disabled={busyId === n.id} onClick={() => markNotice(n, "receipt_sent").catch((e) => showToast({ text: friendlyError(e), tone: "error" }))}>Mark as sent</button>
                  </>
                )}
                {decisionMail && (n.decision_sent_at ? ` Decision sent ${formatDate(n.decision_sent_at)}.` : (
                  <>
                    {" "}<a className="adm-link" href={mailtoLink(n.email, decisionMail)}>Write to the reporter: decision</a>
                    {" · "}<button type="button" className="adm-link" disabled={busyId === n.id} onClick={() => markNotice(n, "decision_sent").catch((e) => showToast({ text: friendlyError(e), tone: "error" }))}>Mark as sent</button>
                  </>
                ))}
              </span>
            ) : <span>No email address: the reporter can't be told the decision.</span>}
            {!openOne && n.decision_reason && <span>{n.decision === "gone" ? `Decision: already gone (${n.decision_reason}).` : `Decision: ${n.decision} because ${n.decision_reason}.`}</span>}
          </div>
          <NoteEditor value={n.admin_note || ""} save={(note) => markNotice(n, "note", null, note)} placeholder="e.g. Asked the reporter for the link on 22 Oct" />
        </div>
        {openOne && (
          <div className="adm-item-actions">
            <Button variant="secondary" size="sm" disabled={busyId === n.id} onClick={() => setDialog({ kind: "keep", notice: n })}>Keep it…</Button>
          </div>
        )}
      </div>
    );
  };

  // ----- the dialogs -----
  let dialogEl = null;
  if (dialog?.kind === "moderate") {
    const r = dialog.report;
    const n = dialog.notice;
    const target = dialog.target || (r && (isProfileReport(r) ? { kind: "member", id: r.reported_user_id } : { kind: kindOf(r), id: r.reported_post_id }));
    const memberName = target.kind === "member" || target.kind === "profile_photo" || target.kind === "profile_bio"
      ? (r?.reported_user?.name || target.name || usersById[target.id]?.name)
      : target.kind === "place_recommendation" ? target.name : r?.contentAuthor?.name;
    const who = memberName ? firstName(memberName) : "the member";
    const content = dialog.preview || r?.reportedContent;
    const what = target.kind === "member" ? "how you use NRIClub"
      : target.kind === "profile_photo" ? "your profile photo"
      : target.kind === "profile_bio" ? "the bio on your profile"
      : target.kind === "place_recommendation" ? `your recommendation of "${snippet(r?.reportedContent?.content)}"`
      : ownedWhat(target.kind, content);
    const verb = dialog.action === "block" ? "Block" : dialog.action === "warn" ? "Warn" : "Remove";
    const noun = target.kind === "member" ? (memberName || "this member")
      : target.kind === "profile_photo" ? "this profile photo"
      : target.kind === "profile_bio" ? "this bio"
      : target.kind === "place_recommendation" ? `${who}'s recommendation`
      : `this ${REPORT_KINDS[target.kind] || "post"}`;
    const reportIds = r ? relatedIds(r) : [];
    const done = { block: `Blocked ${memberName || "the member"}`, warn: `Warned ${memberName || "the member"}`, remove: target.kind === "profile_photo" ? "Photo removed" : target.kind === "profile_bio" ? "Bio removed" : "Removed" }[dialog.action];
    dialogEl = (
      <ModerationDialog
        title={dialog.action === "warn" && target.kind !== "member" ? `Warn ${who} about this ${REPORT_KINDS[target.kind] || "post"}?` : `${verb} ${noun}?`}
        confirmLabel={dialog.action === "block" ? "Block account" : dialog.action === "warn" ? "Send warning" : "Remove"}
        action={dialog.action} what={dialog.action === "warn" && target.kind !== "member" ? ownedWhat(target.kind, content) : what} who={who}
        source={n ? "notice" : reportIds.length ? "report" : "own"} recorded={recorded}
        lastWarningAt={dialog.overview?.last_warning_at || null} upcomingSessions={dialog.overview?.upcoming_sessions || 0}
        intro={dialog.action === "remove"
          ? `It's deleted for everyone${reportIds.length > 1 ? ` and all ${reportIds.length} reports about it are closed` : reportIds.length ? " and the report is closed" : ""}. This can't be undone.`
          : dialog.action === "block" ? `${who} can still sign in, download their data and delete their account, but can't take part until you unblock them.`
          : `${who} gets the warning in NRIClub, with 14 days to reply. Nothing is removed.`}
        onCancel={() => setDialog(null)}
        onConfirm={async (reasons) => {
          setBusyId(r?.id || n?.id);
          try {
            await moderate({ target, action: dialog.action, reasons, reportIds, notice: n?.id || null, done });
          } catch (e) {
            if (/already handled/i.test(friendlyError(e))) { setDialog(null); alreadyHandled(); return; }
            throw e;
          } finally {
            setBusyId(null);
          }
        }}
      />
    );
  } else if (dialog?.kind === "dismiss") {
    dialogEl = <DismissDialog report={dialog.report} related={relatedIds(dialog.report).length} recorded={recorded}
      onCancel={() => setDialog(null)} onConfirm={({ status, reason }) => dismiss({ reports: relatedIds(dialog.report), status, reason })} />;
  } else if (dialog?.kind === "keep") {
    // "It's already gone": e.g. removed after a member's report of the same
    // thing, so the sender isn't told "we kept it".
    dialogEl = <DismissDialog notice={dialog.notice} recorded onCancel={() => setDialog(null)}
      onConfirm={async ({ status, reason }) => { await markNotice(dialog.notice, "decide", status === "resolved" ? "gone" : "kept", reason); setDialog(null); showToast({ text: "Decision saved. Now write to the reporter." }); }} />;
  }

  const openCount = open.length + openNotices.length;
  return (
    <>
      <PageHeader title="Reports" description="Content and profiles members flagged, and reports of illegal content from the public page. A person decides each one: remove or act on what breaks the law or our rules, and dismiss the rest. The member concerned and whoever reported it are told." />
      {!recorded && <ErrorNote>The database update of 21 October 2026 isn't in yet: decisions aren't recorded and members aren't told automatically. Write to them from hello@nriclub.app.</ErrorNote>}
      {openCount === 0 && !moreOpen ? (
        <EmptyState icon="flag" title="No open reports">When members flag a post, comment, listing, message or profile, or someone reports content on the public page, it shows up here.</EmptyState>
      ) : (
        <>
          {grouped.Safety?.length > 0 && (
            <section>
              <SectionTitle count={grouped.Safety.length} tone="orange">Safety</SectionTitle>
              {grouped.Safety.map((r) => renderReport(r, true))}
            </section>
          )}
          {openNotices.length > 0 && (
            <section>
              <SectionTitle count={openNotices.length} tone="orange">From the public report page</SectionTitle>
              {[...openNotices].sort((a, b) => (b.category === "safety") - (a.category === "safety")).map(renderNotice)}
            </section>
          )}
          {SECTION_ORDER.filter((c) => c !== "Safety" && grouped[c]?.length).map((c) => (
            <section key={c}>
              <SectionTitle count={grouped[c].length}>{c}</SectionTitle>
              {grouped[c].map((r) => renderReport(r, true))}
            </section>
          ))}
        </>
      )}
      {notices === null && <p className="adm-muted adm-small" style={{ marginTop: 16 }}>Reports from the public page arrive by email at hello@nriclub.app until the database update of 21 October 2026 is in.</p>}
      <MoreOpen count={moreOpen} what="reports" busy={loadingMore} onLoadMore={onLoadMore} />
      {(handled.length > 0 || closedNotices.length > 0) && (
        <section>
          <SectionTitle count={handledCount + closedNotices.length}>Handled</SectionTitle>
          <HandledNote shown={handled.length} total={handledCount} />
          {closedNotices.slice(0, handledLimit).map(renderNotice)}
          {handled.slice(0, handledLimit).map((r) => renderReport(r, false))}
          {handled.length > handledLimit && (
            <div className="adm-more">
              <Button variant="secondary" size="sm" onClick={() => setHandledLimit((l) => l + HANDLED_PAGE)}>Show {Math.min(HANDLED_PAGE, handled.length - handledLimit)} more</Button>
            </div>
          )}
        </section>
      )}
      {dialogEl}
    </>
  );
}

// Closing a report (or a notice from the public page) without acting on it:
// why, in a few words, which the members who reported it read ("we kept it
// because …"), or "it's already gone" (e.g. the member deleted it, or we
// removed it after another report).
function DismissDialog({ report, notice, related = 1, recorded, onCancel, onConfirm }) {
  const [gone, setGone] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const clean = reason.replace(/\s+/g, " ").trim().replace(/[.!\s]+$/, "");
  const confirm = async () => {
    if (clean.length < 5 || busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm({ status: gone ? "resolved" : "reviewed", reason: clean });
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };
  return (
    <ConfirmDialog wide tone="primary" title={notice ? (gone ? "It's already gone?" : "Keep it?") : related > 1 ? `Dismiss ${related} reports?` : "Dismiss this report?"}
      confirmLabel={notice ? (gone ? "Close the report" : "Keep it") : "Dismiss"} busy={busy} error={error} onConfirm={confirm} onCancel={onCancel} confirmDisabled={clean.length < 5}>
      <p style={{ margin: 0 }}>
        {notice ? "Nothing is removed. Then write to the reporter with the decision (the panel prefills the email)."
          : `Nothing is removed. ${recorded ? (related > 1 ? "The members who reported it are" : "The member who reported it is") + " told why in NRIClub." : "The member who reported it isn't told automatically yet."}`}
      </p>
      <div className="adm-form">
        <div className="adm-radio-row" role="radiogroup" aria-label="Outcome">
          <label className="adm-radio"><input type="radio" name="adm-dismiss" checked={!gone} onChange={() => setGone(false)} /> We keep it</label>
          <label className="adm-radio"><input type="radio" name="adm-dismiss" checked={gone} onChange={() => setGone(true)} /> It's already gone</label>
        </div>
        <div>
          <label className="adm-field-label" htmlFor="adm-dismiss-reason">{gone ? "What happened" : "Why it stays"} <span className="adm-faint">({gone ? "e.g. the member deleted it" : "finishes “we kept it because …”"}; the reporter reads this)</span></label>
          <textarea id="adm-dismiss-reason" className="adm-textarea" value={reason} maxLength={600} onChange={(e) => setReason(e.target.value)}
            placeholder={gone ? "the member deleted it themselves" : "it is an invitation to an event, not an advert"} />
        </div>
      </div>
    </ConfirmDialog>
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
export function FeedbackView({ reports, setReports, handledTotal = 0, moreOpen = 0, loadingMore = false, onLoadMore, onReportsChange, showToast, onReload }) {
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
      {open.length === 0 && !moreOpen ? (
        <EmptyState icon={tab === "bugs" ? "bug" : "message"} title={tab === "bugs" ? "No open problems" : "No new ideas"}>
          {tab === "bugs" ? "Problems members report from Settings → Send feedback appear here." : "Ideas members send from Settings → Send feedback appear here."}
        </EmptyState>
      ) : open.map((r) => renderItem(r, true))}
      <MoreOpen count={moreOpen} what="problems and ideas" busy={loadingMore} onLoadMore={onLoadMore} />
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
