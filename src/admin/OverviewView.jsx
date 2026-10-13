// Overview: a few calm numbers, recent activity and signups per month.
import { useEffect, useMemo, useState } from "react";
import * as api from "../supabaseApi";
import { slug } from "../content/slug";
import { PageHeader, SectionTitle } from "./ui";
import { DAY, msSince } from "./format";

const MONTHS = 12;

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function SignupsChart({ users }) {
  const [hover, setHover] = useState(null);
  const months = useMemo(() => {
    const counts = {};
    users.forEach((u) => {
      if (!u.created_at) return;
      const d = new Date(u.created_at);
      if (Number.isNaN(d.getTime())) return;
      const k = monthKey(d);
      counts[k] = (counts[k] || 0) + 1;
    });
    const out = [];
    const now = new Date();
    for (let i = MONTHS - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({
        key: monthKey(d),
        short: d.toLocaleString("en-GB", { month: "short" }),
        long: d.toLocaleString("en-GB", { month: "long", year: "numeric" }),
        count: counts[monthKey(d)] || 0,
      });
    }
    return out;
  }, [users]);
  const max = Math.max(1, ...months.map((m) => m.count));
  const total = months.reduce((s, m) => s + m.count, 0);
  const peak = months.reduce((best, m) => (m.count > (best?.count ?? -1) ? m : best), null);
  const last = months[months.length - 1];
  const shown = hover != null ? months[hover] : null;

  return (
    <div>
      <div className="adm-muted" style={{ fontSize: 13, minHeight: 20 }} aria-live="polite">
        {shown
          ? <><b style={{ color: "#37352F" }}>{shown.count}</b> signup{shown.count === 1 ? "" : "s"} in {shown.long}</>
          : <><b style={{ color: "#37352F" }}>{total}</b> signup{total === 1 ? "" : "s"} in the last 12 months</>}
      </div>
      <div className="adm-chart" role="img" aria-label={`Signups per month: ${months.map((m) => `${m.long} ${m.count}`).join(", ")}`}>
        {months.map((m, i) => {
          const labelled = m.count > 0 && (m === peak || m === last);
          return (
            <div key={m.key} className="adm-bar-col" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} title={`${m.long}: ${m.count}`}>
              <span className="adm-bar-val" style={{ visibility: labelled || hover === i ? "visible" : "hidden" }}>{m.count}</span>
              <div className={`adm-bar${m.count === 0 ? " is-zero" : ""}`} style={{ height: m.count === 0 ? 2 : `${Math.max(4, (m.count / max) * 100)}px`, opacity: hover == null || hover === i ? 1 : 0.55 }} />
              <span className="adm-bar-label">{m.short}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Members and activity per city group, to see where NRIClub grows and where
// outreach is needed. Cities without members are hidden until "Show all".
function CityStats() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  useEffect(() => {
    api.adminCityStats().then(setRows).catch(() => setError("City numbers couldn't be loaded. If the 2026-10-17 database update hasn't been run yet, run it first."));
  }, []);
  if (error) return <p className="adm-faint adm-small">{error}</p>;
  if (!rows) return <p className="adm-faint adm-small">Loading…</p>;
  const q = query.trim().toLowerCase();
  const active = (r) => r.members > 0 || r.posts_30d > 0 || r.questions_30d > 0 || r.events_upcoming > 0 || r.ambassadors;
  const shown = rows.filter((r) => (q ? r.city.toLowerCase().includes(q) : all || active(r)));
  const th = { textAlign: "left", fontWeight: 600, fontSize: 12, color: "var(--text-faint, #9B9A97)", padding: "8px 10px", borderBottom: "1px solid rgba(55,53,47,0.09)", whiteSpace: "nowrap" };
  const td = { padding: "8px 10px", borderBottom: "1px solid rgba(55,53,47,0.06)", fontSize: 13, whiteSpace: "nowrap" };
  const num = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a city" aria-label="Find a city"
          style={{ padding: "6px 10px", border: "1px solid rgba(55,53,47,0.16)", borderRadius: 6, fontSize: 13, fontFamily: "inherit", minWidth: 180 }} />
        {!q && <label className="adm-small" style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all {rows.length} cities
        </label>}
      </div>
      <div style={{ overflowX: "auto", border: "1px solid rgba(55,53,47,0.09)", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>City</th><th style={{ ...th, textAlign: "right" }}>Members</th><th style={{ ...th, textAlign: "right" }}>New, 7 days</th>
            <th style={{ ...th, textAlign: "right" }}>New, 30 days</th><th style={{ ...th, textAlign: "right" }}>Posts, 30 days</th>
            <th style={{ ...th, textAlign: "right" }}>Questions, 30 days</th><th style={{ ...th, textAlign: "right" }}>Upcoming events</th><th style={th}>Ambassador</th>
          </tr></thead>
          <tbody>
            {shown.slice(0, 200).map((r) => (
              <tr key={r.city}>
                <td style={td}><a href={`https://nriclub.app/city/${slug(r.city) || encodeURIComponent(r.city)}`} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>{r.city}</a></td>
                <td style={num}>{r.members}</td>
                <td style={{ ...num, color: r.joined_7d ? "#0F7B6C" : undefined }}>{r.joined_7d || "–"}</td>
                <td style={num}>{r.joined_30d || "–"}</td>
                <td style={num}>{r.posts_30d || "–"}</td>
                <td style={num}>{r.questions_30d || "–"}</td>
                <td style={num}>{r.events_upcoming || "–"}</td>
                <td style={{ ...td, color: r.ambassadors ? undefined : "#D9730D" }}>{r.ambassadors || (r.members >= 10 ? "Needs one" : "–")}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td style={td} colSpan={8}>{q ? "No city matches." : "No city has members yet."}</td></tr>}
          </tbody>
        </table>
      </div>
      {shown.length > 200 && <p className="adm-faint adm-small" style={{ marginTop: 6 }}>Showing the first 200 of {shown.length}. Search to find a city.</p>}
    </>
  );
}

// users: the newest members loaded (at most 1,000); membersTotal and
// blockedTotal count all of them.
export default function OverviewView({ users, membersTotal = users.length, blockedTotal = null, counts, openReports, pendingGroups, onNavigate }) {
  const blocked = blockedTotal ?? users.filter((u) => u.status === "blocked").length;
  const cut = users.length < membersTotal;
  const stats = [
    { label: "Members", value: membersTotal, page: "members" },
    { label: "Pending verification", value: counts.pending || 0, page: "verification", warn: (counts.pending || 0) > 0 },
    { label: "Verified", value: counts.approved || 0, page: "verification" },
    { label: "Blocked", value: blocked, page: "members" },
    { label: "Open reports", value: openReports, page: "reports" },
    { label: "Community requests", value: pendingGroups, page: "communities" },
  ];

  const activeWithin = (ms) => users.filter((u) => { const a = msSince(u.last_active); return a != null && a < ms; }).length;
  const activity = [
    { label: "Online now", value: activeWithin(5 * 60000), dot: true },
    { label: "Active today", value: activeWithin(DAY) },
    { label: "This week", value: activeWithin(7 * DAY) },
    { label: "This month", value: activeWithin(30 * DAY) },
    { label: "This quarter", value: activeWithin(90 * DAY) },
    { label: "This year", value: activeWithin(365 * DAY) },
  ];

  return (
    <>
      <PageHeader title="Overview" description="How NRIClub is doing at a glance." />
      <div className="adm-stats">
        {stats.map((s) => (
          <button key={s.label} type="button" className="adm-stat" onClick={() => onNavigate(s.page)}>
            <div className="adm-stat-label">{s.label}</div>
            <div className="adm-stat-value" style={s.warn ? { color: "#D9730D" } : undefined}>{s.value.toLocaleString("en-GB")}</div>
          </button>
        ))}
      </div>
      <div className="adm-activity">
        {activity.map((a) => (
          <span key={a.label}>{a.dot && <span className="adm-online-dot" aria-hidden="true" />}{a.label} <b>{a.value}</b></span>
        ))}
      </div>
      {cut && (
        <p className="adm-faint adm-small" style={{ marginTop: 8 }}>
          Activity and signups per month count the newest {users.length.toLocaleString("en-GB")} of {membersTotal.toLocaleString("en-GB")} members.
        </p>
      )}

      <div style={{ marginTop: 40 }}>
        <SectionTitle>Signups per month</SectionTitle>
        <SignupsChart users={users} />
      </div>

      <div style={{ marginTop: 40 }}>
        <SectionTitle>Cities</SectionTitle>
        <CityStats />
      </div>
    </>
  );
}
