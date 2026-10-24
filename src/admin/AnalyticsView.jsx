// Analytics: visits to the website and the member app, from visitors who
// chose Accept on the privacy banner (src/analytics.js sends them through
// api/collect.js; supabase/migrations/20261029000000_analytics.sql stores
// them and gives this page its numbers). Pseudonymous: a random id per
// browser, never linked to a member's account. Raw events are kept 6 months.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { PageHeader, SectionTitle, ErrorNote, SkeletonRows, EmptyState } from "./ui";
import { countryName, friendlyError } from "./format";
import { SIGNUP_STEPS, LOGIN_STEPS, KEEP_MONTHS } from "../content/analytics";

const RANGES = [7, 30, 90];
const SESSIONS_PAGE = 25;
const STEP_LABELS = Object.fromEntries([...SIGNUP_STEPS, ...LOGIN_STEPS].map((s) => [s.key, s.label]));
const BAR = "#5B9CFF";
const BAR_DIM = "#B5D0FF";

const num = (v) => Number(v || 0).toLocaleString("en-GB");
const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);
const dayLabel = (day) => new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const shortDay = (day) => new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const when = (ts) => new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const clock = (ts) => new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const deviceName = (d) => ({ mobile: "Mobile", tablet: "Tablet", desktop: "Desktop" }[d] || "Unknown");
const placeOf = (city, country) => [city, country ? countryName(country) : ""].filter(Boolean).join(", ") || "Unknown place";
const sourceOf = (s) => (s.utm_source || s.utm_campaign
  ? [s.utm_source, s.utm_medium, s.utm_campaign].filter(Boolean).join(" · ")
  : s.referrer_domain || "Direct");

const CSS = `
.an-note { display:flex; gap:10px; align-items:flex-start; background:#FFF8E6; border:1px solid #F6E3B4; color:#6B4E00; border-radius:10px; padding:10px 14px; font-size:13px; line-height:1.5; margin-bottom:16px; }
.an-range { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:18px; }
.an-cards { display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:12px; }
.an-card { border-radius:12px; padding:14px 16px; min-width:0; }
.an-card-label { font-size:13px; color:#5F5E5B; }
.an-card-value { font-size:26px; font-weight:650; line-height:1.25; margin-top:4px; color:#37352F; font-variant-numeric:tabular-nums; }
.an-card-sub { font-size:12px; color:#5F5E5B; margin-top:4px; line-height:1.4; }
.an-blue { background:#EAF2FF; } .an-green { background:#E5F6EC; } .an-orange { background:#FFF0E0; }
.an-purple { background:#F1ECFF; } .an-pink { background:#FDEBF2; } .an-teal { background:#E1F5F3; }
.an-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap:16px; margin-top:16px; }
.an-panel { border:1px solid var(--line); border-radius:12px; padding:14px 16px 16px; min-width:0; background:#fff; }
.an-panel h3 { font-size:14px; font-weight:600; margin:0 0 4px; color:var(--text); }
.an-help { font-size:12px; color:var(--muted); margin:0 0 10px; line-height:1.5; }
.an-help code { font-size:12px; background:#F4F4F2; padding:1px 4px; border-radius:4px; overflow-wrap:anywhere; }
.an-table-wrap { overflow-x:auto; }
.an-table { width:100%; border-collapse:collapse; font-size:13px; }
.an-table th { text-align:left; font-weight:600; font-size:12px; color:var(--faint); padding:6px 8px; border-bottom:1px solid var(--line); white-space:nowrap; }
.an-table td { padding:7px 8px; border-bottom:1px solid rgba(55,53,47,0.06); vertical-align:top; }
.an-table .an-num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.an-table .an-path { overflow-wrap:anywhere; min-width:90px; }
.an-sub { display:block; color:var(--faint); font-size:12px; overflow-wrap:anywhere; }
.an-chart { position:relative; margin-top:6px; }
.an-chart svg { display:block; overflow:visible; }
.an-chart-max { position:absolute; top:-2px; left:0; font-size:11px; color:var(--faint); font-variant-numeric:tabular-nums; background:#fff; padding-right:4px; }
.an-chart-axis { display:flex; justify-content:space-between; font-size:11px; color:var(--faint); margin-top:4px; }
.an-chart-sum { font-size:13px; min-height:20px; }
.an-chart-sum b { color:var(--text); }
.an-details { margin-top:8px; font-size:12px; color:var(--muted); }
.an-details summary { cursor:pointer; padding:4px 0; }
.an-funnel { list-style:none; margin:0; padding:0; display:grid; gap:10px; }
.an-funnel-head { display:flex; justify-content:space-between; gap:12px; font-size:13px; }
.an-funnel-head b { font-variant-numeric:tabular-nums; }
.an-track { height:10px; background:#F1F1EF; border-radius:5px; margin-top:4px; overflow:hidden; }
.an-fill { height:100%; background:${BAR}; border-radius:5px; min-width:2px; }
.an-drop { font-size:12px; color:var(--muted); margin-top:3px; }
.an-drop.is-worst { color:#B4461B; font-weight:600; }
.an-shares { list-style:none; margin:0; padding:0; display:grid; gap:8px; }
.an-share-head { display:flex; justify-content:space-between; gap:12px; font-size:13px; }
.an-share-head span:last-child { color:var(--muted); font-variant-numeric:tabular-nums; white-space:nowrap; }
.an-visits { border-top:1px solid var(--line); }
.an-visit { border-bottom:1px solid var(--line); }
.an-visit-btn { display:flex; gap:10px; width:100%; text-align:left; background:none; border:0; padding:10px 6px; cursor:pointer; font:inherit; color:inherit; align-items:flex-start; }
.an-visit-btn:hover { background:var(--row-hover); }
.an-visit-btn:focus-visible { outline:2px solid ${BAR}; outline-offset:-2px; }
.an-visit-main { flex:1; min-width:0; }
.an-visit-top { display:flex; flex-wrap:wrap; gap:4px 12px; font-size:13.5px; }
.an-visit-top b { font-weight:600; }
.an-visit-meta { font-size:12px; color:var(--muted); margin-top:2px; overflow-wrap:anywhere; }
.an-chev { color:var(--faint); flex-shrink:0; transition:transform .15s; margin-top:2px; }
.an-visit-btn[aria-expanded="true"] .an-chev { transform:rotate(90deg); }
.an-steps { list-style:none; margin:0 0 12px; padding:0 6px 0 22px; display:grid; gap:4px; }
.an-step { display:flex; gap:10px; font-size:13px; align-items:baseline; }
.an-step time { color:var(--faint); font-size:12px; font-variant-numeric:tabular-nums; flex-shrink:0; }
.an-kind { font-size:11px; font-weight:600; border-radius:4px; padding:1px 6px; flex-shrink:0; }
.an-k-pageview { background:#EAF2FF; color:#0B5394; } .an-k-click { background:#FFF0E0; color:#8A4B00; }
.an-k-funnel { background:#E5F6EC; color:#0F6B3E; } .an-k-session_end { background:#F1F1EF; color:#5F5E5B; }
.an-step-text { min-width:0; overflow-wrap:anywhere; }
`;

// A width that follows the element's (for the chart).
function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const set = () => setWidth(el.clientWidth);
    set();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(set) : null;
    ro?.observe(el);
    window.addEventListener("resize", set);
    return () => { ro?.disconnect(); window.removeEventListener("resize", set); };
  }, [ref]);
  return width;
}

// 1, 2 or 5 times a power of ten, at least max.
function niceMax(max) {
  const p = 10 ** Math.floor(Math.log10(Math.max(1, max)));
  return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= max);
}

// A bar with rounded top corners, standing on the baseline.
function barPath(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// Visits per day: one bar a day; hover (or the table below) for the numbers.
function VisitsChart({ days }) {
  const wrap = useRef(null);
  const width = useWidth(wrap);
  const [hover, setHover] = useState(null);
  const H = 140;
  const TOP = 14;
  const top = niceMax(Math.max(1, ...days.map((d) => d.sessions)));
  const step = days.length ? width / days.length : 0;
  const barW = Math.max(1, Math.min(28, step - 2));
  const total = days.reduce((s, d) => s + d.sessions, 0);
  const shown = hover != null ? days[hover] : null;
  return (
    <div>
      <div className="an-chart-sum adm-muted" aria-live="polite">
        {shown
          ? <><b>{dayLabel(shown.day)}</b>: {num(shown.sessions)} visit{shown.sessions === 1 ? "" : "s"}, {num(shown.visitors)} visitor{shown.visitors === 1 ? "" : "s"}, {num(shown.pageviews)} page view{shown.pageviews === 1 ? "" : "s"}</>
          : <><b>{num(total)}</b> visit{total === 1 ? "" : "s"} in {days.length} days. Point at a day for its numbers.</>}
      </div>
      <div className="an-chart" ref={wrap} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={H} role="img" aria-label={`Visits per day, ${shortDay(days[0].day)} to ${shortDay(days[days.length - 1].day)}: ${num(total)} in all. The table below has each day.`}>
            <line x1="0" x2={width} y1={TOP + 0.5} y2={TOP + 0.5} stroke="#EDEDEB" strokeDasharray="3 3" />
            <line x1="0" x2={width} y1={H - 0.5} y2={H - 0.5} stroke="#E0E0DE" />
            {days.map((d, i) => {
              const h = d.sessions ? Math.max(2, (d.sessions / top) * (H - TOP)) : 0;
              const x = i * step + (step - barW) / 2;
              return (
                <g key={d.day} onMouseEnter={() => setHover(i)}>
                  <rect x={i * step} y="0" width={step} height={H} fill="transparent" />
                  {h > 0 && <path d={barPath(x, H - h, barW, h)} fill={hover == null || hover === i ? BAR : BAR_DIM} />}
                </g>
              );
            })}
          </svg>
        )}
        <span className="an-chart-max" aria-hidden="true">{num(top)}</span>
      </div>
      {days.length > 0 && (
        <div className="an-chart-axis" aria-hidden="true">
          <span>{shortDay(days[0].day)}</span>
          {days.length > 2 && <span>{shortDay(days[Math.floor(days.length / 2)].day)}</span>}
          <span>{shortDay(days[days.length - 1].day)}</span>
        </div>
      )}
      <details className="an-details">
        <summary>Show as a table</summary>
        <DataTable
          cols={[{ key: "day", label: "Day", render: (r) => dayLabel(r.day) }, { key: "sessions", label: "Visits", num: true },
            { key: "visitors", label: "Visitors", num: true }, { key: "pageviews", label: "Page views", num: true }]}
          rows={[...days].reverse()} empty="" />
      </details>
    </div>
  );
}

// A table; cols: [{ key, label, num (right-aligned count), render(row) }].
function DataTable({ cols, rows, empty }) {
  if (!rows.length) return <p className="adm-faint adm-small">{empty}</p>;
  return (
    <div className="an-table-wrap">
      <table className="an-table">
        <thead><tr>{cols.map((c) => <th key={c.key} className={c.num ? "an-num" : undefined} scope="col">{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c.key} className={c.num ? "an-num" : c.path ? "an-path" : undefined}>{c.render ? c.render(r) : c.num ? num(r[c.key]) : r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Shares of a whole: a label, a bar, the count and its percentage.
function Shares({ rows, total }) {
  if (!rows.length) return <p className="adm-faint adm-small">Nothing yet.</p>;
  return (
    <ul className="an-shares">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="an-share-head"><span>{r.label}</span><span>{num(r.value)} · {percent(r.value, total) ?? 0}%</span></div>
          <div className="an-track" aria-hidden="true"><div className="an-fill" style={{ width: `${(r.value / Math.max(1, total)) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

// The steps of signing up: how many visitors reached each, and how many of
// them didn't reach the next one (where people leave).
function Funnel({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.visitors));
  const drops = rows.map((r, i) => {
    const next = rows[i + 1];
    if (!next || r.visitors <= 0) return null;
    return Math.max(0, Math.round(((r.visitors - next.visitors) / r.visitors) * 100));
  });
  const worst = drops.reduce((best, d, i) => (d != null && d > 0 && (best < 0 || d > drops[best]) ? i : best), -1);
  return (
    <ol className="an-funnel">
      {rows.map((r, i) => (
        <li key={r.step}>
          <div className="an-funnel-head"><span>{i + 1}. {STEP_LABELS[r.step] || r.step}</span><b>{num(r.visitors)}</b></div>
          <div className="an-track" aria-hidden="true"><div className="an-fill" style={{ width: `${(r.visitors / max) * 100}%` }} /></div>
          {drops[i] != null && (
            <div className={`an-drop${i === worst ? " is-worst" : ""}`}>
              {drops[i] === 0 ? "Everyone went on to the next step." : `${drops[i]}% didn't go on to the next step${i === worst ? ": the most people leave here" : ""}.`}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

const KIND_LABELS = { pageview: "Page", click: "Click", funnel: "Step", session_end: "Left" };

function stepText(e) {
  if (e.type === "pageview") return <>{e.path}{e.title && <span className="an-sub">{e.title}</span>}</>;
  if (e.type === "click") return <>“{e.label || "(no name)"}”{e.target ? ` → ${e.target}` : ""} <span className="an-sub">on {e.path}</span></>;
  if (e.type === "funnel") return STEP_LABELS[e.label] || e.label;
  return <>Left on {e.path}</>;
}

// Recent visits, newest first; each opens to its pages and clicks in order.
function Journeys({ days }) {
  const [list, setList] = useState(null); // { total, sessions }
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState({}); // id -> events, "loading" or "error"
  const seq = useRef(0);

  const load = () => {
    const mine = ++seq.current;
    setList(null);
    setError("");
    setOpen({});
    api.adminAnalyticsSessions(days, 0, SESSIONS_PAGE)
      .then((r) => { if (mine === seq.current) setList(r || { total: 0, sessions: [] }); })
      .catch((e) => { if (mine === seq.current) setError(`Couldn't load the visits: ${friendlyError(e)}`); });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [days]);

  const more = async () => {
    if (!list || loadingMore) return;
    const mine = seq.current;
    setLoadingMore(true);
    try {
      const r = await api.adminAnalyticsSessions(days, list.sessions.length, SESSIONS_PAGE);
      if (mine === seq.current) {
        setList((l) => {
          const have = new Set(l.sessions.map((s) => s.id));
          return { total: r.total, sessions: [...l.sessions, ...r.sessions.filter((s) => !have.has(s.id))] };
        });
      }
    } catch (e) {
      if (mine === seq.current) setError(`Couldn't load more visits: ${friendlyError(e)}`);
    }
    setLoadingMore(false);
  };

  const toggle = async (id) => {
    if (open[id]) { setOpen(({ [id]: _gone, ...rest }) => rest); return; }
    setOpen((o) => ({ ...o, [id]: "loading" }));
    try {
      const events = await api.adminAnalyticsJourney(id);
      setOpen((o) => (o[id] ? { ...o, [id]: events } : o));
    } catch {
      setOpen((o) => (o[id] ? { ...o, [id]: "error" } : o));
    }
  };

  if (error && !list) return <ErrorNote onRetry={load}>{error}</ErrorNote>;
  if (!list) return <SkeletonRows rows={4} />;
  if (!list.sessions.length) return <p className="adm-faint adm-small">No visits in these days.</p>;
  return (
    <>
      <ul className="an-visits" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {list.sessions.map((s) => {
          const steps = open[s.id];
          return (
            <li key={s.id} className="an-visit">
              <button type="button" className="an-visit-btn" aria-expanded={!!steps} aria-controls={`an-visit-${s.id}`} onClick={() => toggle(s.id)}>
                <span className="an-chev" aria-hidden="true">›</span>
                <span className="an-visit-main">
                  <span className="an-visit-top"><b>{when(s.started_at)}</b><span>{placeOf(s.city, s.country)}</span>
                    <span>{num(s.pages)} page{s.pages === 1 ? "" : "s"} · {num(s.steps - s.pages)} click{s.steps - s.pages === 1 ? "" : "s"}</span></span>
                  <span className="an-visit-meta" style={{ display: "block" }}>
                    IP {s.ip || "unknown"} · {deviceName(s.device)}{s.browser ? ` · ${s.browser}` : ""}{s.os ? ` · ${s.os}` : ""} · From {sourceOf(s)}{s.exit ? ` · Left on ${s.exit}` : ""}
                  </span>
                </span>
              </button>
              {steps && (
                <div id={`an-visit-${s.id}`}>
                  {steps === "loading" ? <p className="adm-faint adm-small" style={{ padding: "0 0 10px 22px" }}>Loading…</p>
                    : steps === "error" ? <p className="adm-small" style={{ padding: "0 0 10px 22px", color: "#B4461B" }}>Couldn't load this visit. Close it and try again.</p>
                      : (
                        <ol className="an-steps">
                          {steps.map((e, i) => (
                            <li key={i} className="an-step">
                              <time dateTime={e.at}>{clock(e.at)}</time>
                              <span className={`an-kind an-k-${e.type}`}>{KIND_LABELS[e.type] || e.type}</span>
                              <span className="an-step-text">{stepText(e)}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="adm-small" style={{ color: "#B4461B", marginTop: 8 }}>{error}</p>}
      <p className="adm-faint adm-small" style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        Showing {num(list.sessions.length)} of {num(list.total)} visits.
        {list.sessions.length < list.total && (
          <button type="button" className="adm-btn adm-btn-secondary" onClick={more} disabled={loadingMore}>{loadingMore ? "Loading…" : "Show more"}</button>
        )}
      </p>
    </>
  );
}

export default function AnalyticsView() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(undefined); // undefined: loading; null: the database update isn't in yet
  const [error, setError] = useState("");
  const seq = useRef(0);

  const load = () => {
    const mine = ++seq.current;
    setError("");
    setData(undefined);
    api.adminAnalytics(days)
      .then((d) => { if (mine === seq.current) setData(d); })
      .catch((e) => { if (mine === seq.current) setError(`Couldn't load the analytics: ${friendlyError(e)}`); });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [days]);

  const header = (
    <>
      <style>{CSS}</style>
      <PageHeader title="Analytics" description="Which pages people visit, what they click, where they come from and where they leave." />
      <div className="an-note" role="note">
        <span aria-hidden="true">ⓘ</span>
        <span>Only visitors who accepted analytics are counted. Visits aren't linked to members' accounts, and raw visits are deleted after {KEEP_MONTHS} months.</span>
      </div>
      <div className="an-range adm-filters" role="group" aria-label="Date range">
        {RANGES.map((d) => (
          <button key={d} type="button" className="adm-filter" aria-pressed={days === d} onClick={() => setDays(d)}>Last {d} days</button>
        ))}
      </div>
    </>
  );

  if (error) return <>{header}<ErrorNote onRetry={load}>{error}</ErrorNote></>;
  if (data === undefined) return <>{header}<SkeletonRows rows={6} /></>;
  if (data === null) {
    return (
      <>
        {header}
        <EmptyState icon="chart" title="Analytics aren't set up yet">
          Run the database update of 29 October 2026 (supabase/migrations/20261029000000_analytics.sql) and add the two settings in Vercel (LAUNCH-GUIDE.md, “Website analytics”).
        </EmptyState>
      </>
    );
  }

  const o = data.overview || {};
  const choices = Number(o.accepted || 0) + Number(o.declined || 0);
  const funnel = data.funnel || [];
  const signupRows = funnel.filter((r) => SIGNUP_STEPS.some((s) => s.key === r.step));
  const login = Object.fromEntries(funnel.filter((r) => LOGIN_STEPS.some((s) => s.key === r.step)).map((r) => [r.step, r.visitors]));
  const sessionsTotal = (data.devices || []).reduce((s, r) => s + r.sessions, 0);
  const cards = [
    { label: "Visitors", value: num(o.visitors), sub: "Different browsers", tone: "an-blue" },
    { label: "Visits", value: num(o.sessions), sub: "A visit ends after 30 minutes without activity", tone: "an-green" },
    { label: "Page views", value: num(o.pageviews), tone: "an-purple" },
    { label: "Pages per visit", value: Number(o.pages_per_session || 0).toLocaleString("en-GB", { maximumFractionDigits: 1 }), sub: "On average", tone: "an-teal" },
    { label: "Accepted analytics", value: choices ? `${percent(o.accepted, choices)}%` : "–", sub: `${num(o.accepted)} accepted · ${num(o.declined)} declined on the banner`, tone: "an-orange" },
    { label: "Sign-ups started", value: num(o.signups_started), sub: `${num(o.details_sent)} sent their check details`, tone: "an-pink" },
  ];
  const nothing = !o.sessions && !choices;

  return (
    <>
      {header}
      <div className="an-cards">
        {cards.map((c) => (
          <div key={c.label} className={`an-card ${c.tone}`}>
            <div className="an-card-label">{c.label}</div>
            <div className="an-card-value">{c.value}</div>
            {c.sub && <div className="an-card-sub">{c.sub}</div>}
          </div>
        ))}
      </div>
      {nothing && (
        <p className="adm-faint adm-small" style={{ marginTop: 12 }}>
          Nothing recorded in these days yet. Visits are counted once the settings in Vercel are in place (LAUNCH-GUIDE.md, “Website analytics”) and visitors choose Accept.
        </p>
      )}

      <SectionTitle>Visits per day</SectionTitle>
      <VisitsChart days={data.per_day || []} />

      <div className="an-grid">
        <section className="an-panel" aria-labelledby="an-funnel">
          <h3 id="an-funnel">Sign-up steps</h3>
          <p className="an-help">How many visitors reached each step of signing up, and how many of them didn't go on (where people leave).</p>
          <Funnel rows={signupRows} />
          <p className="an-help" style={{ marginTop: 14, marginBottom: 0 }}>
            Log in: {num(login.login_start)} opened it, {num(login.login_ok)} logged in{login.login_start ? ` (${percent(login.login_ok, login.login_start)}%)` : ""}.
          </p>
        </section>
        <section className="an-panel" aria-labelledby="an-pages">
          <h3 id="an-pages">Top pages</h3>
          <p className="an-help">Ids in addresses show as “:id” (a member's page is /u/:id).</p>
          <DataTable cols={[{ key: "path", label: "Page", path: true, render: (r) => <>{r.path}{r.title && <span className="an-sub">{r.title}</span>}</> },
            { key: "views", label: "Views", num: true }, { key: "visitors", label: "Visitors", num: true }]}
          rows={data.top_pages || []} empty="No page views yet." />
        </section>
      </div>

      <div className="an-grid">
        <section className="an-panel" aria-labelledby="an-clicks">
          <h3 id="an-clicks">Top clicked buttons and links</h3>
          <p className="an-help">In the members' area only the menus' names show; other buttons count as “(button)” or “(link)”.</p>
          <DataTable cols={[{ key: "label", label: "Button or link", path: true, render: (r) => <>{r.label || "(no name)"}{r.target && <span className="an-sub">→ {r.target}</span>}</> },
            { key: "path", label: "Page", path: true }, { key: "clicks", label: "Clicks", num: true }, { key: "visitors", label: "Visitors", num: true }]}
          rows={data.top_clicks || []} empty="No clicks yet." />
        </section>
        <section className="an-panel" aria-labelledby="an-exits">
          <h3 id="an-exits">Exit pages</h3>
          <p className="an-help">The page each visit ended on, and how often a view of that page was the last of a visit.</p>
          <DataTable cols={[{ key: "path", label: "Page", path: true }, { key: "exits", label: "Visits ended here", num: true },
            { key: "rate", label: "Of its views", num: true, render: (r) => (r.views ? `${Math.min(100, percent(r.exits, r.views))}%` : "–") }]}
          rows={data.exit_pages || []} empty="No visits yet." />
        </section>
      </div>

      <SectionTitle>Where visitors come from</SectionTitle>
      <div className="an-grid" style={{ marginTop: 8 }}>
        <section className="an-panel" aria-labelledby="an-campaigns">
          <h3 id="an-campaigns">Campaigns and links</h3>
          <p className="an-help">
            Links like <code>nriclub.app/?utm_source=whatsapp&amp;utm_campaign=munich</code> are counted here. Give each WhatsApp group, post or poster its own link (for example a different <code>utm_campaign</code>) to see which one worked.
          </p>
          <DataTable cols={[{ key: "source", label: "Source", path: true, render: (r) => r.source || "–" }, { key: "medium", label: "Medium", render: (r) => r.medium || "–" },
            { key: "campaign", label: "Campaign", path: true, render: (r) => <>{r.campaign || "–"}{r.content && <span className="an-sub">{r.content}</span>}</> },
            { key: "sessions", label: "Visits", num: true }, { key: "visitors", label: "Visitors", num: true }]}
          rows={data.campaigns || []} empty="No visits from campaign links yet." />
        </section>
        <section className="an-panel" aria-labelledby="an-referrers">
          <h3 id="an-referrers">Referring sites</h3>
          <p className="an-help">The site a visit came from. Apps such as WhatsApp often don't say, so their visits count as “Direct”: use campaign links for them.</p>
          <DataTable cols={[{ key: "domain", label: "Site", path: true, render: (r) => r.domain || "Direct" },
            { key: "sessions", label: "Visits", num: true }, { key: "visitors", label: "Visitors", num: true }]}
          rows={data.referrers || []} empty="No visits yet." />
        </section>
      </div>

      <SectionTitle>Places</SectionTitle>
      <div className="an-grid" style={{ marginTop: 8 }}>
        <section className="an-panel" aria-labelledby="an-countries">
          <h3 id="an-countries">Countries</h3>
          <DataTable cols={[{ key: "name", label: "Country", render: (r) => (r.name ? countryName(r.name) : "Unknown") },
            { key: "sessions", label: "Visits", num: true }, { key: "visitors", label: "Visitors", num: true }]}
          rows={data.countries || []} empty="No visits yet." />
        </section>
        <section className="an-panel" aria-labelledby="an-cities">
          <h3 id="an-cities">Cities</h3>
          <p className="an-help">Approximate: looked up from the shortened IP address.</p>
          <DataTable cols={[{ key: "name", label: "City", path: true, render: (r) => placeOf(r.name, r.country) },
            { key: "sessions", label: "Visits", num: true }, { key: "visitors", label: "Visitors", num: true }]}
          rows={data.cities || []} empty="No visits yet." />
        </section>
      </div>

      <SectionTitle>Devices</SectionTitle>
      <div className="an-grid" style={{ marginTop: 8 }}>
        <section className="an-panel" aria-labelledby="an-devices">
          <h3 id="an-devices">Phone, tablet or computer</h3>
          <Shares rows={(data.devices || []).map((r) => ({ label: deviceName(r.name), value: r.sessions }))} total={sessionsTotal} />
        </section>
        <section className="an-panel" aria-labelledby="an-browsers">
          <h3 id="an-browsers">Browsers</h3>
          <Shares rows={(data.browsers || []).map((r) => ({ label: r.name || "Unknown", value: r.sessions }))} total={sessionsTotal} />
          <h3 style={{ marginTop: 16 }}>Systems</h3>
          <Shares rows={(data.systems || []).map((r) => ({ label: r.name || "Unknown", value: r.sessions }))} total={sessionsTotal} />
        </section>
      </div>

      <SectionTitle>Visitor journeys</SectionTitle>
      <p className="an-help" style={{ marginTop: 4 }}>Recent visits, newest first. Open one to see its pages, clicks and sign-up steps in order. Times are in your time zone.</p>
      <Journeys days={days} />
    </>
  );
}
