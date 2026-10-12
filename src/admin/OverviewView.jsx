// Overview: a few calm numbers, recent activity and signups per month.
import { useMemo, useState } from "react";
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

export default function OverviewView({ users, counts, openReports, pendingGroups, onNavigate }) {
  const blocked = users.filter((u) => u.status === "blocked").length;
  const stats = [
    { label: "Members", value: users.length, page: "members" },
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

      <div style={{ marginTop: 40 }}>
        <SectionTitle>Signups per month</SectionTitle>
        <SignupsChart users={users} />
      </div>
    </>
  );
}
