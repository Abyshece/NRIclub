// Members' progress: how far accounts have got with signing up, and how
// complete approved members' profiles are, with reminders in the app about
// what's missing. The words of the reminders are in
// src/content/profileReminders.js; the database decides who gets one
// (approved members only, at most one profile reminder a week) and keeps a
// note of each (20261028000000_profile_completeness.sql).
import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { Avatar, Button, ConfirmDialog, EmptyState, ErrorNote, Icon, PageHeader, SectionTitle, SkeletonRows } from "./ui";
import { ago, formatDate, friendlyError, placeLabel, shortName } from "./format";
import { PROFILE_ITEMS, REMINDER_DAYS, itemByKey, percentOf, reminderPayload, reminderText } from "../content/profileReminders";

const fmt = (n) => (Number(n) || 0).toLocaleString("en-GB");
const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const SEARCH_DELAY_MS = 300;
const DAY_MS = 86400000;

// The stages, in the order members go through them.
const STAGES = [
  { key: "unconfirmed", label: "Email not confirmed", color: "#9B9A97", help: "Signed up, but never confirmed their email address." },
  { key: "unfinished", label: "Unfinished", color: "#CB912F", help: "Confirmed their email address, but haven't sent their check details." },
  { key: "pending", label: "Waiting for review", color: "#D9730D", help: "Sent their check details: waiting for our team." },
  { key: "needs_info", label: "Asked for more info", color: "#0B6E99", help: "Our team asked them for more information." },
  { key: "approved", label: "Approved", color: "#0F7B6C", help: "Approved members." },
  { key: "rejected", label: "Declined", color: "#E03E3E", help: "Our team declined them." },
  { key: "blocked", label: "Blocked", color: "#5D1715", help: "Blocked accounts, whatever stage they were at." },
];

// What the date under each account says, by stage.
function stageDate(m, stage) {
  if (stage === "pending" || stage === "needs_info") return `sent ${ago(m.submitted_at || m.created_at)}`;
  if (stage === "approved") return m.reviewed_at ? `approved ${formatDate(m.reviewed_at)}` : `joined ${formatDate(m.created_at)}`;
  if (stage === "rejected") return m.reviewed_at ? `declined ${formatDate(m.reviewed_at)}` : `joined ${formatDate(m.created_at)}`;
  if (stage === "blocked") return m.blocked_at ? `blocked ${formatDate(m.blocked_at)}` : `joined ${formatDate(m.created_at)}`;
  return `joined ${ago(m.created_at)}`;
}

// Pale colours for the levels, from none (0 of 7) to complete (7 of 7).
const LEVEL_COLORS = ["#FBE4E4", "#FCE5DC", "#FAEBDD", "#FBF3DB", "#F1F3D8", "#E5F0DD", "#DDEDEA", "#CDE8E0"];
const LEVEL_EDGES = ["#E9A8A8", "#EDB49C", "#EDBE94", "#E9D193", "#CFD596", "#AFCF99", "#94CDBF", "#6FBFA8"];
// And one for each item.
const ITEM_COLORS = ["#DDEBF1", "#EAE4F2", "#FAEBDD", "#FBF3DB", "#DDEDEA", "#F4DFEB", "#EEE0DA"];

const recentlyReminded = (m) => !!m.reminded_at && Date.now() - new Date(m.reminded_at).getTime() < REMINDER_DAYS * DAY_MS;

// The view's own styles (the panel's are in ui.jsx).
const PROGRESS_CSS = `
.adm-pg-stages { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:8px; }
.adm-pg-stage { display:flex; flex-direction:column; align-items:flex-start; gap:2px; min-width:0; text-align:left; border:1px solid var(--line); border-radius:8px; background:#fff; padding:10px 12px; cursor:pointer; color:var(--text); }
.adm-pg-stage:hover { background:#FBFBFA; }
.adm-pg-stage[aria-pressed="true"] { border-color:#37352F; box-shadow:inset 0 0 0 1px #37352F; }
.adm-pg-stage-label { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--muted); max-width:100%; }
.adm-pg-stage-label span:last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.adm-pg-stage-count { font-size:22px; font-weight:600; line-height:1.25; font-variant-numeric:tabular-nums; }
.adm-pg-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.adm-pg-panel { margin-top:12px; }
.adm-pg-summary { color:var(--muted); font-size:13px; margin:0 0 12px; }
.adm-pg-summary b { color:var(--text); font-weight:600; font-variant-numeric:tabular-nums; }
.adm-pg-hist { display:grid; grid-template-columns:repeat(8, minmax(0,1fr)); gap:6px; height:168px; }
.adm-pg-col { display:flex; flex-direction:column; justify-content:flex-end; align-items:stretch; gap:4px; min-width:0; height:100%; border:0; background:none; padding:4px 2px 2px; border-radius:6px; cursor:pointer; color:var(--text); }
.adm-pg-col:hover { background:var(--row-hover); }
.adm-pg-col[aria-pressed="true"] { background:var(--hover); }
.adm-pg-col-val { font-size:12px; font-weight:600; text-align:center; font-variant-numeric:tabular-nums; }
.adm-pg-bar { border-radius:5px 5px 2px 2px; border-top:2px solid; min-height:3px; }
.adm-pg-col-label { font-size:11px; text-align:center; color:var(--muted); white-space:nowrap; font-variant-numeric:tabular-nums; }
.adm-pg-caption { font-size:12px; color:var(--faint); margin:16px 0 6px; }
.adm-pg-items { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:6px 14px; }
.adm-pg-item { position:relative; display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:0; height:32px; padding:0 10px; border:1px solid var(--line); border-radius:6px; background:#fff; overflow:hidden; cursor:pointer; color:var(--text); font-size:13px; text-align:left; }
.adm-pg-item:hover { border-color:var(--line-strong); }
.adm-pg-item[aria-pressed="true"] { border-color:#37352F; box-shadow:inset 0 0 0 1px #37352F; }
.adm-pg-item-fill { position:absolute; left:0; top:0; bottom:0; z-index:0; }
.adm-pg-item > span:not(.adm-pg-item-fill) { position:relative; z-index:1; white-space:nowrap; }
.adm-pg-item-n { color:var(--muted); font-variant-numeric:tabular-nums; }
.adm-pg-filters { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:22px 0 10px; }
.adm-pg-filters .adm-search { flex:1 1 220px; min-width:0; }
.adm-pg-filters .adm-select { width:auto; flex:0 1 auto; min-width:0; max-width:100%; height:32px; padding:4px 8px; }
.adm-pg-bulk { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; margin:0 0 10px; font-size:13px; color:var(--muted); }
.adm-pg-row, .adm-pg-head { display:grid; grid-template-columns:minmax(0,1.5fr) 64px minmax(0,1.9fr) 96px 92px; gap:12px; align-items:center; }
.adm-pg-row { padding:10px 8px; border-bottom:1px solid var(--line); }
.adm-pg-row:hover { background:var(--row-hover); }
.adm-pg-name { display:flex; align-items:center; gap:10px; min-width:0; }
.adm-pg-name-text { min-width:0; }
.adm-pg-link { display:block; max-width:100%; background:none; border:0; padding:0; font-weight:500; color:var(--text); text-align:left; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-decoration:underline; text-decoration-color:rgba(55,53,47,0.25); text-underline-offset:3px; }
.adm-pg-link:hover { text-decoration-color:currentColor; }
.adm-pg-sub { font-size:12px; color:var(--faint); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.adm-pg-pct { font-variant-numeric:tabular-nums; font-weight:600; font-size:13px; }
.adm-pg-meter { display:block; height:4px; border-radius:2px; background:#EFEFED; margin-top:4px; overflow:hidden; }
.adm-pg-meter > span { display:block; height:100%; border-radius:2px; }
.adm-pg-chips { display:flex; flex-wrap:wrap; gap:4px; min-width:0; }
.adm-pg-chip { display:inline-flex; align-items:center; gap:4px; height:22px; padding:0 8px; border-radius:11px; border:1px solid rgba(55,53,47,0.14); background:#fff; color:var(--muted); font-size:12px; line-height:1; white-space:nowrap; }
button.adm-pg-chip { cursor:pointer; }
button.adm-pg-chip:hover:not(:disabled) { background:#DDEBF1; border-color:#DDEBF1; color:#0B6E99; }
button.adm-pg-chip:disabled { cursor:default; opacity:.6; }
.adm-pg-when { font-size:12px; color:var(--muted); }
.adm-pg-act { display:flex; justify-content:flex-end; }
.adm-pg-srow { display:flex; align-items:center; gap:10px; padding:9px 8px; border-bottom:1px solid var(--line); }
.adm-pg-srow:hover { background:var(--row-hover); }
.adm-pg-srow-main { flex:1; min-width:0; }
.adm-pg-srow-date { font-size:12px; color:var(--muted); white-space:nowrap; flex-shrink:0; }
.adm-pg-preview { margin-top:10px; padding:10px 12px; background:#F7F7F5; border-radius:6px; font-size:13px; line-height:1.55; color:var(--text); overflow-wrap:anywhere; }
.adm-pg-skips { margin:10px 0 0; padding-left:18px; font-size:13px; }
@media (max-width: 767px) {
  .adm-pg-stages { grid-template-columns:repeat(2, minmax(0,1fr)); }
  .adm-pg-stage-count { font-size:20px; }
  .adm-pg-hist { gap:3px; height:150px; }
  .adm-pg-col-label { font-size:10px; }
  .adm-pg-items { grid-template-columns:minmax(0,1fr); }
  .adm-pg-filters .adm-search { flex-basis:100%; }
  .adm-pg-filters .adm-select { flex:1 1 30%; }
  .adm-pg-head { display:none; }
  .adm-pg-row { grid-template-columns:minmax(0,1fr) auto; grid-template-areas:"name pct" "chips chips" "when act"; row-gap:8px; padding:12px 4px; }
  .adm-pg-row > .adm-pg-name { grid-area:name; }
  .adm-pg-row > .adm-pg-pctcell { grid-area:pct; min-width:56px; }
  .adm-pg-row > .adm-pg-chips { grid-area:chips; }
  .adm-pg-row > .adm-pg-when { grid-area:when; }
  .adm-pg-row > .adm-pg-act { grid-area:act; }
  .adm-pg-srow { padding:10px 4px; }
}
`;

// One account at a sign-up stage.
function StageRow({ m, stage, onOpenMember }) {
  return (
    <div className="adm-pg-srow">
      <Avatar name={m.name} url={m.avatar_url} size={26} />
      <div className="adm-pg-srow-main">
        <button type="button" className="adm-pg-link" onClick={() => onOpenMember(m)} title="Open in Members">{m.name || "Unnamed member"}</button>
        <div className="adm-pg-sub">{[m.email, placeLabel(m)].filter(Boolean).join(" · ") || "—"}</div>
      </div>
      <span className="adm-pg-srow-date">{stageDate(m, stage)}</span>
    </div>
  );
}

// Sign-up stages: a tile per stage with its count; a tile opens the list of
// accounts at that stage (search, a page at a time).
function SignupStages({ data, onOpenMember, showToast }) {
  const [open, setOpen] = useState(null);
  const [query, setQuery] = useState("");
  const [list, setList] = useState(null); // { key, members, total }
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const counts = data?.counts || {};
  const q = query.trim();
  const key = `${open}|${q}`;

  useEffect(() => {
    if (!open) return undefined;
    const mine = ++seq.current;
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const res = await api.adminSignupStages({ stage: open, query: q });
        if (mine !== seq.current) return;
        setList({ key, members: res?.members || [], total: res?.total || 0 });
      } catch (e) {
        if (mine === seq.current) setError(`Couldn't load the list: ${friendlyError(e)}`);
      }
      if (mine === seq.current) setLoading(false);
    }, q ? SEARCH_DELAY_MS : 0);
    return () => clearTimeout(timer);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    if (!list || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.adminSignupStages({ stage: open, query: q, offset: list.members.length });
      setList((cur) => {
        if (!cur || cur.key !== list.key || !res) return cur;
        const have = new Set(cur.members.map((m) => m.id));
        return { ...cur, members: [...cur.members, ...res.members.filter((m) => !have.has(m.id))], total: res.total };
      });
    } catch (e) {
      showToast({ text: `Couldn't load more: ${friendlyError(e)}`, tone: "error" });
    }
    setLoadingMore(false);
  };

  const toggle = (k) => {
    setOpen((cur) => (cur === k ? null : k));
    setQuery("");
    setList(null);
  };
  const stage = STAGES.find((s) => s.key === open);
  const shown = list && list.key === key ? list : null;

  return (
    <section aria-labelledby="adm-pg-stages-title">
      <SectionTitle><span id="adm-pg-stages-title">Sign-up stages</span></SectionTitle>
      <div className="adm-pg-stages" role="group" aria-label="Accounts by sign-up stage">
        {STAGES.map((s) => (
          <button key={s.key} type="button" className="adm-pg-stage" aria-pressed={open === s.key} title={s.help} onClick={() => toggle(s.key)}>
            <span className="adm-pg-stage-label"><span className="adm-pg-dot" style={{ background: s.color }} aria-hidden="true" /><span>{s.label}</span></span>
            <span className="adm-pg-stage-count">{data ? fmt(counts[s.key]) : "–"}</span>
          </button>
        ))}
      </div>
      {stage && (
        <div className="adm-pg-panel">
          <p className="adm-pg-summary">{stage.help}</p>
          <div className="adm-toolbar">
            <label className="adm-search">
              <Icon name="search" size={15} />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or city" aria-label={`Search: ${stage.label}`} />
            </label>
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
          {!shown ? (loading ? <SkeletonRows rows={3} /> : null) : shown.members.length === 0 ? (
            <p className="adm-muted adm-small" style={{ padding: "8px 8px 4px" }}>{q ? "No accounts match." : "No accounts at this stage."}</p>
          ) : (
            <div className="adm-list" aria-busy={loading} aria-label={stage.label}>
              {shown.members.map((m) => <StageRow key={m.id} m={m} stage={open} onOpenMember={onOpenMember} />)}
              {shown.members.length < shown.total && (
                <div className="adm-more">
                  <Button variant="secondary" size="sm" disabled={loadingMore} onClick={loadMore}>
                    {loadingMore ? "Loading…" : `Show ${fmt(Math.min(api.PROGRESS_PAGE, shown.total - shown.members.length))} more`}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// How many members have each level: a pale, colourful bar per level, from
// 100% down to 0%. A bar shows those members in the list below.
function LevelChart({ levels, approved, level, onLevel }) {
  const counts = Array.from({ length: 8 }, (_, i) => Number(levels?.[String(i)]) || 0);
  const max = Math.max(1, ...counts);
  const order = [7, 6, 5, 4, 3, 2, 1, 0];
  return (
    <div className="adm-pg-hist" role="group" aria-label="Members by how complete their profile is">
      {order.map((l) => (
        <button key={l} type="button" className="adm-pg-col" aria-pressed={level === l}
          aria-label={`${percentOf(l)}% (${l} of 7): ${plural(counts[l], "member")}`}
          title={`${l} of 7 items: ${plural(counts[l], "member")}${approved ? ` (${Math.round((counts[l] / approved) * 100)}%)` : ""}`}
          onClick={() => onLevel(level === l ? null : l)}>
          <span className="adm-pg-col-val">{fmt(counts[l])}</span>
          <span className="adm-pg-bar" style={{ height: `${counts[l] ? Math.max(6, (counts[l] / max) * 108) : 3}px`, background: LEVEL_COLORS[l], borderTopColor: LEVEL_EDGES[l] }} />
          <span className="adm-pg-col-label">{percentOf(l)}%</span>
        </button>
      ))}
    </div>
  );
}

// How many members miss each item; an item shows those members.
function MissingItems({ missing, approved, value, onPick }) {
  return (
    <div className="adm-pg-items" role="group" aria-label="Members missing each item">
      {PROFILE_ITEMS.map((item, i) => {
        const n = Number(missing?.[item.key]) || 0;
        return (
          <button key={item.key} type="button" className="adm-pg-item" aria-pressed={value === item.key}
            onClick={() => onPick(value === item.key ? null : item.key)} title={`${plural(n, "member")} without: ${item.label}`}>
            <span className="adm-pg-item-fill" aria-hidden="true" style={{ width: `${approved ? (n / approved) * 100 : 0}%`, background: ITEM_COLORS[i] }} />
            <span>{item.label}</span>
            <span className="adm-pg-item-n">{fmt(n)} missing</span>
          </button>
        );
      })}
    </div>
  );
}

// One approved member: how complete, what's missing (each a one-click
// reminder about that item), when they were last reminded, and Remind.
function MemberRow({ m, busy, onRemind, onOpenMember }) {
  const recent = recentlyReminded(m);
  const done = m.missing.length === 0;
  const pct = Number(m.percent) || percentOf(m.filled);
  const waitNote = recent ? `Reminded ${ago(m.reminded_at)}: the next reminder can go ${REMINDER_DAYS} days after the last one.` : "";
  return (
    <div className="adm-pg-row" role="row">
      <div className="adm-pg-name" role="cell">
        <Avatar name={m.name} url={m.avatar_url} size={26} />
        <div className="adm-pg-name-text">
          <button type="button" className="adm-pg-link" onClick={() => onOpenMember(m)} title="Open in Members">{m.name || "Unnamed member"}</button>
          <div className="adm-pg-sub">{placeLabel(m) || "No city"}</div>
        </div>
      </div>
      <div className="adm-pg-pctcell" role="cell" aria-label={`${pct}% complete`}>
        <span className="adm-pg-pct">{pct}%</span>
        <span className="adm-pg-meter" aria-hidden="true"><span style={{ width: `${pct}%`, background: LEVEL_EDGES[m.filled] }} /></span>
      </div>
      <div className="adm-pg-chips" role="cell">
        {done ? <span className="adm-faint adm-small">Complete</span> : m.missing.map((k) => {
          const item = itemByKey(k);
          if (!item) return null;
          return recent
            ? <span key={k} className="adm-pg-chip" title={waitNote}>{item.label}</span>
            : (
              <button key={k} type="button" className="adm-pg-chip" disabled={busy}
                title={`Remind about this: “${item.reminder}”`} aria-label={`Remind ${shortName(m.name)} about: ${item.label}`}
                onClick={() => onRemind(m, k)}>
                {item.label}<Icon name="send" size={11} />
              </button>
            );
        })}
      </div>
      <div className="adm-pg-when" role="cell" title={m.reminded_at ? formatDate(m.reminded_at, { time: true }) : undefined}>
        {m.reminded_at ? `Reminded ${ago(m.reminded_at)}` : "Not reminded"}
      </div>
      <div className="adm-pg-act" role="cell">
        {!done && (
          <Button variant="secondary" size="sm" icon="send" disabled={busy || recent} onClick={() => onRemind(m, "general")}
            title={recent ? waitNote : `Sends: “${reminderText("general", { missing: m.missing, city: m.city })}”`}>
            {busy ? "Sending…" : "Remind"}
          </Button>
        )}
      </div>
    </div>
  );
}

// The confirmation before a bulk send: how many get it, how many are
// skipped and why, and the words (for the general reminder, as the first
// member who gets it would read it).
function BulkDialog({ bulk, onCancel, onConfirm, busy, error }) {
  const { kind, total, recent, complete, example } = bulk;
  const skippedComplete = kind === "general" ? complete : 0;
  const ready = Math.max(0, total - recent - skippedComplete);
  const item = itemByKey(kind);
  const capped = total > 5000;
  return (
    <ConfirmDialog wide tone="primary" busy={busy} error={error} onCancel={onCancel} onConfirm={onConfirm}
      confirmDisabled={ready === 0} confirmLabel={ready === 1 ? "Send 1 reminder" : `Send ${fmt(ready)} reminders`}
      title={item ? `Remind ${plural(ready, "member")} about: ${item.label}?` : `Remind ${plural(ready, "member")}?`}>
      <p>
        {ready === 0 ? "Nobody in this list can get a reminder now." : `${ready === 1 ? "1 member gets" : `${fmt(ready)} members get`} this in their notifications in the app${kind === "general" ? ", with their own percentage, missing items and city" : ""}:`}
      </p>
      {ready > 0 && example && (
        <div className="adm-pg-preview">
          {kind === "general" && <div className="adm-faint adm-small" style={{ marginBottom: 4 }}>For {example.name}:</div>}
          {example.text}
        </div>
      )}
      {(recent > 0 || skippedComplete > 0) && (
        <ul className="adm-pg-skips">
          {recent > 0 && <li>{plural(recent, "member")} skipped: reminded in the last {REMINDER_DAYS} days.</li>}
          {skippedComplete > 0 && <li>{plural(skippedComplete, "member")} skipped: their profile is complete.</li>}
        </ul>
      )}
      {capped && <p className="adm-small" style={{ marginTop: 8 }}>Only the first 5,000 in the list are sent this time. Send again for the rest.</p>}
    </ConfirmDialog>
  );
}

// What a send did, for the toast.
function sentMessage(res, { name, kind }) {
  const item = itemByKey(kind);
  if (name) {
    if (res.sent) return item ? `Reminded ${name} about: ${item.label}` : `Reminded ${name} to complete their profile`;
    if (res.skipped_recent) return `Not sent: ${name} had a reminder in the last ${REMINDER_DAYS} days`;
    if (res.skipped_complete) return item ? `Not sent: ${name} has added it since` : `Not sent: ${name}'s profile is complete now`;
    return `Not sent: ${name} isn't an approved member any more`;
  }
  const parts = [`Sent ${plural(res.sent, "reminder")}`];
  if (res.skipped_recent) parts.push(`${fmt(res.skipped_recent)} skipped (reminded in the last ${REMINDER_DAYS} days)`);
  if (res.skipped_complete) parts.push(`${fmt(res.skipped_complete)} skipped (nothing missing)`);
  if (res.skipped_not_eligible) parts.push(`${fmt(res.skipped_not_eligible)} skipped (not approved)`);
  return `${parts.join(". ")}.`;
}

const NO_FILTERS = { level: null, missing: null, city: "" };

// onOpenMember(member): opens the member in Members.
export default function ProgressView({ showToast, onOpenMember }) {
  const [unavailable, setUnavailable] = useState(false);
  const [stages, setStages] = useState(null);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null); // the answer for the filters shown
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [stagesError, setStagesError] = useState("");
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [bulk, setBulk] = useState(null); // { kind, total, recent, complete, example }
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const seq = useRef(0);
  const q = query.trim();
  const params = { level: filters.level, missing: filters.missing, city: filters.city || null, query: q };
  const paramsKey = JSON.stringify(params);

  const loadStages = useCallback(async () => {
    setStagesError("");
    try {
      const res = await api.adminSignupStages({ limit: 1 });
      if (!res) setUnavailable(true);
      else setStages(res);
    } catch (e) {
      setStagesError(`Couldn't load the sign-up stages: ${friendlyError(e)}`);
    }
  }, []);

  useEffect(() => { loadStages(); }, [loadStages]);

  // The summary and the first page for the filters, a moment after typing
  // stops (at once for the other filters). Answers to earlier ones are dropped.
  const load = useCallback((p, delay = 0) => {
    const mine = ++seq.current;
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const res = await api.adminProfileCompleteness({ ...p, offset: 0 });
        if (mine !== seq.current) return;
        if (!res) setUnavailable(true);
        else setData({ ...res, key: JSON.stringify(p) });
      } catch (e) {
        if (mine === seq.current) setError(`Couldn't load the profiles: ${friendlyError(e)}`);
      }
      if (mine === seq.current) setLoading(false);
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => load(JSON.parse(paramsKey), q ? SEARCH_DELAY_MS : 0), [paramsKey]); // eslint-disable-line react-hooks/exhaustive-deps


  const loadMore = async () => {
    if (!data || loadingMore) return;
    const key = data.key;
    setLoadingMore(true);
    try {
      const res = await api.adminProfileCompleteness({ ...params, offset: data.members.length });
      setData((cur) => {
        if (!cur || cur.key !== key || !res) return cur;
        const have = new Set(cur.members.map((m) => m.id));
        return { ...cur, members: [...cur.members, ...res.members.filter((m) => !have.has(m.id))], total: res.total };
      });
    } catch (e) {
      showToast({ text: `Couldn't load more: ${friendlyError(e)}`, tone: "error" });
    }
    setLoadingMore(false);
  };

  // The members a send reminded: their last reminder is now, and the list's
  // counts follow.
  const markSent = (res, kind) => {
    if (!res.sent_to?.length) return;
    const sent = new Set(res.sent_to);
    setData((cur) => {
      if (!cur) return cur;
      const newlyRecent = cur.members.filter((m) => sent.has(m.id) && !recentlyReminded(m)).length;
      const members = cur.members.map((m) => (sent.has(m.id) ? { ...m, reminded_at: res.sent_at, reminded_kind: kind } : m));
      return { ...cur, members, recent: (cur.recent || 0) + newlyRecent };
    });
  };

  const remindOne = async (m, kind) => {
    const name = shortName(m.name);
    setBusyIds((s) => new Set(s).add(m.id));
    try {
      const res = await api.adminSendProfileReminders([m.id], kind, reminderPayload(kind));
      markSent(res, kind);
      showToast({ text: sentMessage(res, { name, kind }), icon: res.sent ? "check" : undefined, tone: res.sent ? undefined : "error" });
      if (!res.sent) load(params);
    } catch (e) {
      showToast({ text: `Couldn't send the reminder: ${friendlyError(e)}`, tone: "error" });
    }
    setBusyIds((s) => { const next = new Set(s); next.delete(m.id); return next; });
  };

  // Bulk: general, or about the item the list is filtered by.
  const bulkKind = filters.missing || "general";
  const openBulk = () => {
    if (!data) return;
    const first = data.members.find((m) => !recentlyReminded(m) && m.missing.length > 0 && (bulkKind === "general" || m.missing.includes(bulkKind)));
    setBulkError("");
    setBulk({
      kind: bulkKind,
      total: data.total,
      recent: data.recent || 0,
      complete: data.complete || 0,
      example: first
        ? { name: shortName(first.name), text: reminderText(bulkKind, { missing: first.missing, city: first.city }) }
        : bulkKind !== "general" ? { name: "", text: reminderText(bulkKind) } : null,
    });
  };

  const sendBulk = async () => {
    if (!bulk) return;
    setBulkBusy(true);
    setBulkError("");
    try {
      const res = await api.adminProfileCompleteness({ ...params, idsOnly: true });
      if (!res) { setUnavailable(true); setBulk(null); setBulkBusy(false); return; }
      const sent = await api.adminSendProfileReminders(res.ids || [], bulk.kind, reminderPayload(bulk.kind));
      setBulk(null);
      showToast({ text: sentMessage(sent, { kind: bulk.kind }), icon: "check", duration: 9000 });
      load(params);
    } catch (e) {
      if (e?.partial?.sent) {
        setBulk(null);
        showToast({ text: `${sentMessage(e.partial, { kind: bulk.kind })} Then it stopped: ${friendlyError(e)}`, tone: "error", duration: 12000 });
        load(params);
      } else {
        setBulkError(friendlyError(e));
      }
    }
    setBulkBusy(false);
  };

  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const filtered = filters.level != null || !!filters.missing || !!filters.city || !!q;
  // (While new filters load, the list for the earlier ones stays.)
  const shown = data;
  const members = shown?.members || [];
  const total = shown?.total || 0;
  const readyCount = shown ? Math.max(0, total - (shown.recent || 0) - (bulkKind === "general" ? shown.complete || 0 : 0)) : 0;
  const bulkItem = itemByKey(bulkKind);

  if (unavailable) {
    return (
      <>
        <PageHeader title="Members' progress" />
        <EmptyState icon="chart" title="Needs the database update">
          Sign-up stages, profile completeness and reminders work once the database update 20261028000000_profile_completeness.sql is in.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <style>{PROGRESS_CSS}</style>
      <PageHeader title="Members' progress"
        description={`How far people have got with signing up, and how complete approved members' profiles are. Remind members in the app about what's missing: at most once every ${REMINDER_DAYS} days each.`} />

      {stagesError && <ErrorNote onRetry={loadStages}>{stagesError}</ErrorNote>}
      {error && <ErrorNote onRetry={() => load(params)}>{error}</ErrorNote>}

      <SignupStages data={stages} onOpenMember={onOpenMember} showToast={showToast} />

      <section aria-labelledby="adm-pg-profiles-title" style={{ marginTop: 8 }}>
        <SectionTitle><span id="adm-pg-profiles-title">Profile completeness</span></SectionTitle>
        {!shown ? <SkeletonRows rows={4} /> : (
          <>
            <p className="adm-pg-summary">
              <b>{fmt(shown.approved)}</b> approved {shown.approved === 1 ? "member" : "members"}, on average <b>{fmt(shown.average)}%</b> complete.
              {" "}Each of the {PROFILE_ITEMS.length} items counts the same: {PROFILE_ITEMS.map((i) => i.label.toLowerCase()).join(", ")}.
            </p>
            <LevelChart levels={shown.levels} approved={shown.approved} level={filters.level} onLevel={(level) => setFilter({ level })} />
            <p className="adm-pg-caption">Missing, by item. Pick a bar or an item to list those members.</p>
            <MissingItems missing={shown.missing} approved={shown.approved} value={filters.missing} onPick={(missing) => setFilter({ missing })} />
          </>
        )}

        <div className="adm-pg-filters">
          <label className="adm-search">
            <Icon name="search" size={15} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or city" aria-label="Search approved members" />
          </label>
          <select className="adm-select" aria-label="Level" value={filters.level ?? ""} onChange={(e) => setFilter({ level: e.target.value === "" ? null : Number(e.target.value) })}>
            <option value="">Any level</option>
            {[7, 6, 5, 4, 3, 2, 1, 0].map((l) => <option key={l} value={l}>{percentOf(l)}% ({l} of 7)</option>)}
          </select>
          <select className="adm-select" aria-label="Missing item" value={filters.missing || ""} onChange={(e) => setFilter({ missing: e.target.value || null })}>
            <option value="">Missing: any</option>
            {PROFILE_ITEMS.map((i) => <option key={i.key} value={i.key}>Missing: {i.label}</option>)}
          </select>
          <select className="adm-select" aria-label="City" value={filters.city} onChange={(e) => setFilter({ city: e.target.value })}>
            <option value="">Any city</option>
            {filters.city && !(shown?.cities || []).some((c) => c.city === filters.city) && <option value={filters.city}>{filters.city}</option>}
            {(shown?.cities || []).map((c) => <option key={c.city} value={c.city}>{c.city} ({fmt(c.count)})</option>)}
          </select>
          {filtered && <button type="button" className="adm-link adm-small" onClick={() => { setFilters(NO_FILTERS); setQuery(""); }}>Clear filters</button>}
        </div>

        {shown && (
          <div className="adm-pg-bulk" role="status">
            <span>{filtered ? `${plural(total, "member")} in this list` : `${plural(total, "approved member")}`}{shown.recent ? `, ${fmt(shown.recent)} reminded in the last ${REMINDER_DAYS} days` : ""}</span>
            {total > 0 && (
              <Button variant="secondary" size="sm" icon="send" disabled={loading || readyCount === 0} onClick={openBulk}
                title={readyCount === 0 ? "Nobody in this list can get a reminder now" : undefined}>
                {bulkItem ? `Remind all ${fmt(total)} about: ${bulkItem.label}…` : `Remind all ${fmt(total)} in this list…`}
              </Button>
            )}
          </div>
        )}

        {!shown ? null : members.length === 0 ? (
          <EmptyState icon={filtered ? "search" : "users"} title={filtered ? "No members match" : "No approved members yet"}>
            {filtered ? "Try other filters." : "Approved members show up here with how complete their profile is."}
          </EmptyState>
        ) : (
          <div className="adm-list" role="table" aria-label="Approved members" aria-busy={loading}>
            <div className="adm-list-head adm-pg-head" role="row">
              <span role="columnheader">Member</span>
              <span role="columnheader">Profile</span>
              <span role="columnheader">Missing (click to remind)</span>
              <span role="columnheader">Last reminder</span>
              <span role="columnheader"><span className="adm-sr">Actions</span></span>
            </div>
            {members.map((m) => (
              <MemberRow key={m.id} m={m} busy={busyIds.has(m.id)} onRemind={remindOne} onOpenMember={onOpenMember} />
            ))}
            {members.length < total && (
              <div className="adm-more">
                <Button variant="secondary" size="sm" disabled={loadingMore} onClick={loadMore}>
                  {loadingMore ? "Loading…" : `Show ${fmt(Math.min(api.PROGRESS_PAGE, total - members.length))} more`}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {bulk && <BulkDialog bulk={bulk} busy={bulkBusy} error={bulkError} onCancel={() => !bulkBusy && setBulk(null)} onConfirm={sendBulk} />}
    </>
  );
}
