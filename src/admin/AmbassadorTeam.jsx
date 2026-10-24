// The city ambassadors, for Ambassadors in the admin panel: each one with the
// ambassador agreement they accepted (private.ambassador_agreement_ack), and
// what they did as ambassador (private.ambassador_log): changes to their
// city group's description and starter post, meetups they marked, flags to
// our team, stepping down. From public.admin_ambassador_activity, since the
// 2026-10-27 database update; before it, only who the ambassadors are (from
// their profiles). Admins keep every power they had: making someone an
// ambassador, or ending it, is under Members.
import { useCallback, useEffect, useState } from "react";
import * as api from "../supabaseApi";
import { Button, EmptyState, ErrorNote, Pill, SectionTitle, SkeletonRows } from "./ui";
import { ago, formatDate, friendlyError } from "./format";
import { REPORT_KINDS } from "../content/legal/reporting";

const LOG_PAGE = 20;

const quote = (t, n = 80) => {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  return s.length > n ? `“${s.slice(0, n - 1)}…”` : `“${s}”`;
};

// One entry of the log in words.
function logText(l) {
  const d = l.detail || {};
  switch (l.action) {
    case "agreement": return `Accepted the ambassador agreement (version ${d.version || "?"})`;
    case "group_description": return "Changed the group's description";
    case "pin": return `Pinned a starter post${d.post ? `: ${quote(d.post)}` : ""}`;
    case "unpin": return `Unpinned the starter post${d.post ? `: ${quote(d.post)}` : ""}`;
    case "meetup": return `Marked a meetup as hosted by the city ambassador${d.title ? `: ${quote(d.title)}` : ""}${/^\d{4}-\d{2}-\d{2}$/.test(d.date || "") ? ` (${formatDate(`${d.date}T12:00:00`)})` : ""}`;
    case "meetup_off": return `Took the mark off a meetup${d.title ? `: ${quote(d.title)}` : ""}`;
    case "flag": return `Flagged ${d.kind === "profile" ? "a member" : `a ${REPORT_KINDS[d.kind] || "post"}`} to our team (see Reports)`;
    case "step_down": return "Stepped down as ambassador";
    default: return l.action;
  }
}

// The ambassadors and their log: { activity (null before the database
// update), profiles (the fallback: [{ id, name, ambassador_city }]),
// loading, error, reload }.
export function useAmbassadorTeam() {
  const [state, setState] = useState({ activity: null, profiles: null, loading: true, error: "" });
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const activity = await api.adminAmbassadorActivity(200);
      const profiles = activity ? null : await api.adminAmbassadorProfiles();
      setState({ activity, profiles, loading: false, error: "" });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: `Couldn't load the ambassadors: ${friendlyError(e)}` }));
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

// onOpenMember({ id, name }): opens the member under Members.
export default function AmbassadorTeam({ team, onOpenMember }) {
  const [shown, setShown] = useState(LOG_PAGE);
  const [open, setOpen] = useState({}); // log entry id -> details shown
  const { activity, profiles, loading, error, reload } = team;
  const name = (m) => (
    <button type="button" className="adm-link" style={{ fontWeight: 600, textDecoration: "none", color: "var(--text)" }}
      onClick={() => onOpenMember?.({ id: m.id, name: m.name })} title="Open under Members">{m.name || "Unnamed member"}</button>
  );

  if (loading && !activity && !profiles) return <section><SectionTitle>City ambassadors</SectionTitle><SkeletonRows rows={2} /></section>;
  if (error) return <section><SectionTitle>City ambassadors</SectionTitle><ErrorNote onRetry={reload}>{error}</ErrorNote></section>;

  if (!activity) {
    const list = profiles || [];
    return (
      <section aria-label="City ambassadors">
        <SectionTitle count={list.length}>City ambassadors</SectionTitle>
        <p className="adm-muted adm-small" style={{ margin: "0 0 8px" }}>Their agreement and what they do show here once the database update of 27 October 2026 (20261027000000_ambassador_panel.sql) is in.</p>
        {list.map((m) => (
          <div key={m.id} className="adm-item">
            <div className="adm-item-main"><div className="adm-item-title">{name(m)}<Pill tone="indigo" dot={false}>{m.ambassador_city}</Pill></div></div>
          </div>
        ))}
        {list.length === 0 && <EmptyState icon="star" title="No city ambassadors yet">Make a member the ambassador for their city under Members, or accept an application below.</EmptyState>}
      </section>
    );
  }

  const log = activity.log || [];
  return (
    <>
      <section aria-label="City ambassadors">
        <SectionTitle count={activity.ambassadors.length}>City ambassadors</SectionTitle>
        {activity.ambassadors.length === 0 && <EmptyState icon="star" title="No city ambassadors yet">Make a member the ambassador for their city under Members, or accept an application below.</EmptyState>}
        {activity.ambassadors.map((a) => (
          <div key={a.id} className="adm-item" data-ambassador={a.id}>
            <div className="adm-item-main">
              <div className="adm-item-title">
                {name(a)}
                <Pill tone="indigo" dot={false}>{a.city}</Pill>
                {a.current
                  ? <Pill tone="green">Agreement accepted {formatDate(a.agreement_accepted_at)}</Pill>
                  : a.agreement_version
                    ? <Pill tone="orange">Accepted an earlier agreement ({a.agreement_version}), not {activity.version} yet</Pill>
                    : <Pill tone="orange">Agreement not accepted yet</Pill>}
              </div>
              <div className="adm-item-meta">
                {[a.since ? `Ambassador since ${formatDate(a.since)}` : null,
                  `${a.welcomed_30d || 0} newcomer${Number(a.welcomed_30d) === 1 ? "" : "s"} welcomed in 30 days`,
                  a.last_activity_at ? `last active in the panel ${ago(a.last_activity_at)}` : "hasn't used the panel yet"].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
        ))}
      </section>

      <section aria-label="What ambassadors did">
        <SectionTitle count={log.length}>What ambassadors did</SectionTitle>
        <p className="adm-muted adm-small" style={{ margin: "0 0 8px" }}>The newest first. Entries are deleted after 12 months, and with the ambassador's account.</p>
        {log.length === 0 && <p className="adm-muted adm-small">Nothing yet.</p>}
        {log.slice(0, shown).map((l) => (
          <div key={l.id} className="adm-item" style={{ padding: "10px 8px" }}>
            <div className="adm-item-main">
              <div style={{ display: "grid", gridTemplateColumns: "72px minmax(0, 1fr)", gap: 8, alignItems: "baseline" }}>
                <span className="adm-faint adm-small" title={formatDate(l.at, { time: true })}>{ago(l.at)}</span>
                <span style={{ overflowWrap: "anywhere" }}>
                  {l.name ? name({ id: l.ambassador_id, name: l.name }) : "A former member"} <span className="adm-muted">({l.city})</span>: {logText(l)}
                  {l.action === "group_description" && (
                    <> <button type="button" className="adm-link adm-small" onClick={() => setOpen((o) => ({ ...o, [l.id]: !o[l.id] }))}>{open[l.id] ? "Hide" : "Show"} the text</button></>
                  )}
                </span>
              </div>
              {l.action === "group_description" && open[l.id] && (
                <div className="adm-preview">
                  <div className="adm-preview-text"><strong style={{ color: "var(--text)" }}>Before:</strong> <span style={{ whiteSpace: "pre-wrap" }}>{l.detail?.before || "(empty)"}</span></div>
                  <div className="adm-preview-text" style={{ marginTop: 6 }}><strong style={{ color: "var(--text)" }}>After:</strong> <span style={{ whiteSpace: "pre-wrap" }}>{l.detail?.after}</span></div>
                </div>
              )}
            </div>
          </div>
        ))}
        {log.length > shown && (
          <div className="adm-more"><Button variant="secondary" size="sm" onClick={() => setShown((n) => n + LOG_PAGE)}>Show {Math.min(LOG_PAGE, log.length - shown)} more</Button></div>
        )}
      </section>
    </>
  );
}
