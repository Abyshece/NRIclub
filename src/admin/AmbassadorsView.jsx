// Ambassadors: applications to be a city ambassador, sent from the website
// and the app (public.submit_ambassador_application). Newest first, by
// status, a page at a time. Our team writes to the applicant from
// hello@nriclub.app (the panel prefills the email), then marks the
// application Contacted, Accepted or Declined. Accepting the application of
// an active, approved member makes them the city's ambassador (recorded like
// every change of ambassador); someone without an account, or whose account
// isn't approved yet, is only marked accepted: our team asks them to join
// and makes them ambassador once they are approved.
import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { NoteEditor } from "./ReportsView";
import { Button, ConfirmDialog, EmptyState, ErrorNote, PageHeader, Pill, SkeletonRows } from "./ui";
import { ago, firstName, formatDate, friendlyError, shortName } from "./format";
import { APPLICATION_STATUS, ambassadorReplyEmail, hoursLabel, mailtoLink } from "../content/ambassadors";

const FILTERS = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
  { key: "all", label: "All" },
];

const MEMBER_STATUS = {
  approved: "approved member",
  pending: "waiting for review",
  needs_info: "asked for more information",
  incomplete: "hasn't sent the check details",
  rejected: "declined",
};

const isApproved = (m) => !!m && m.status === "active" && m.verification_status === "approved";
const memberState = (m) => (m.status === "blocked" ? "blocked" : MEMBER_STATUS[m.verification_status] || m.verification_status);
const sameCity = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

// What happened when an application was accepted, for the toast.
function acceptedMessage(app, outcome, city) {
  const who = shortName(app.member?.name || app.name);
  if (outcome === "ambassador_set") return `${who} is now the ambassador for ${city}.`;
  if (outcome === "already_ambassador") return `Accepted. ${who} already is the ambassador for ${city}.`;
  if (outcome === "not_approved") return `Accepted. ${who}'s account isn't approved yet, so they aren't the ambassador yet: approve them in Verification, then click Make ambassador here.`;
  return `Accepted. ${who} has no NRIClub account yet: ask them to join, then make them ambassador under Members once they're approved.`;
}

// Who sent it: the account it came from, or none.
function AccountLine({ app }) {
  const m = app.member;
  if (m) {
    return (
      <span>
        Sent from {m.name ? <strong style={{ color: "var(--text)" }}>{m.name}</strong> : "an account"}'s account ({memberState(m)})
        {m.ambassador_city ? <> · ambassador for {m.ambassador_city}</> : null}
      </span>
    );
  }
  if (app.email_member) {
    const e = app.email_member;
    return (
      <span>
        Sent without signing in. {e.name || "A member"} has an account with this email address ({memberState(e)}){e.ambassador_city ? `, ambassador for ${e.ambassador_city}` : ""}: check it's them, then make them ambassador under Members.
      </span>
    );
  }
  return <span>No NRIClub account. If you accept, ask them to join; once they're approved, make them ambassador under Members.</span>;
}

// Accept or decline, with our team's note (and, when accepting a member who
// can be ambassador, the city they become ambassador for).
function DecisionDialog({ app, kind, onCancel, onDone }) {
  const [note, setNote] = useState(app.admin_note || "");
  const [city, setCity] = useState(app.city);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const accept = kind === "accept";
  const canBe = accept && isApproved(app.member);
  const who = app.member?.name || app.name;
  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.adminUpdateAmbassadorApplication(app.id, {
        status: accept ? "accepted" : "declined",
        note: note.trim() !== (app.admin_note || "").trim() ? note.trim() : null,
        city: canBe && city.trim() && city.trim() !== app.city ? city.trim() : null,
      });
      onDone(res, canBe ? city.trim() || app.city : app.city);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };
  let text;
  if (!accept) text = `Write to ${firstName(who)} first to let them know (Reply by email). The application stays here as declined for 6 months.`;
  else if (app.status === "accepted") text = `${who} is now an approved member: they become the ambassador for the city below. Members see the badge on their profile and in the city's group. This is recorded.`;
  else if (canBe) text = `${who} is an approved member: they become the ambassador for the city below. Members see the badge on their profile and in the city's group. This is recorded.`;
  else if (app.member) text = `${who}'s account isn't approved yet (${memberState(app.member)}), so they won't be the ambassador yet. The application is marked accepted; once they're approved, click Make ambassador here, or use Members.`;
  else text = `${who} has no NRIClub account. The application is marked accepted: write to them to join NRIClub, and once they're approved, make them ambassador under Members.`;
  // A member is ambassador for one city at a time.
  if (accept && canBe && app.member.ambassador_city && !sameCity(app.member.ambassador_city, city)) {
    text += ` They're the ambassador for ${app.member.ambassador_city} now: this replaces it.`;
  }
  return (
    <ConfirmDialog wide tone={accept ? "primary" : "danger"} busy={busy} error={error} onCancel={onCancel} onConfirm={confirm}
      title={accept ? (app.status === "accepted" ? `Make ${firstName(who)} ambassador?` : `Accept ${firstName(who)}'s application?`) : `Decline ${firstName(who)}'s application?`}
      confirmLabel={accept ? (canBe ? "Make ambassador" : "Accept") : "Decline"} confirmDisabled={canBe && !city.trim()}>
      <p>{text}</p>
      <div className="adm-form">
        {canBe && (
          <div>
            <label className="adm-field-label" htmlFor="amb-city">Ambassador for</label>
            <input id="amb-city" className="adm-input" value={city} maxLength={100} onChange={(e) => setCity(e.target.value)} />
            <div className="adm-help">The city as in its group's name ("Indians in …"), so members of that group see them.</div>
          </div>
        )}
        <div>
          <label className="adm-field-label" htmlFor="amb-note">Note for our team <span className="adm-faint">(optional, admins only)</span></label>
          <textarea id="amb-note" className="adm-textarea" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)}
            placeholder={accept ? "e.g. Spoke on 20 Oct: will host a chai meetup in November" : "e.g. Lives in another city now"} />
        </div>
      </div>
    </ConfirmDialog>
  );
}

// onCountsChange(counts): the counts by status, for the panel's navigation.
export default function AmbassadorsView({ showToast, onCountsChange, initialCounts = null }) {
  const [filter, setFilter] = useState(initialCounts && !initialCounts.new ? "all" : "new");
  const [apps, setApps] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState(initialCounts);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [dialog, setDialog] = useState(null); // { kind: "accept" | "decline", app }
  const seq = useRef(0);

  // The panel's navigation shows the number of new applications.
  useEffect(() => { if (counts) onCountsChange?.(counts); }, [counts, onCountsChange]);

  const load = useCallback(async (f) => {
    const mine = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const res = await api.adminAmbassadorApplications({ status: f === "all" ? null : f, offset: 0 });
      if (mine !== seq.current) return;
      if (!res) { setMissing(true); setApps([]); setTotal(0); }
      else { setMissing(false); setApps(res.applications || []); setTotal(res.total || 0); setCounts(res.counts); }
    } catch (e) {
      if (mine === seq.current) setError(`Couldn't load the applications: ${friendlyError(e)}`);
    }
    if (mine === seq.current) setLoading(false);
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await api.adminAmbassadorApplications({ status: filter === "all" ? null : filter, offset: apps.length });
      if (res) {
        setApps((prev) => { const have = new Set(prev.map((a) => a.id)); return [...prev, ...res.applications.filter((a) => !have.has(a.id))]; });
        setTotal(res.total || 0);
        setCounts(res.counts);
      }
    } catch (e) {
      showToast({ text: `Couldn't load more: ${friendlyError(e)}`, tone: "error" });
    }
    setLoadingMore(false);
  };

  // The application as the server returned it after a change; it stays in
  // the list until the next reload, with its new status.
  const replace = (updated, before) => {
    setApps((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
    if (before.status !== updated.status) {
      setCounts((c) => (c ? { ...c, [before.status]: Math.max(0, (c[before.status] || 0) - 1), [updated.status]: (c[updated.status] || 0) + 1 } : c));
    }
  };

  const step = async (app, status) => {
    setBusyId(app.id);
    try {
      const res = await api.adminUpdateAmbassadorApplication(app.id, { status });
      replace(res, app);
      showToast({ text: status === "contacted" ? `Marked as contacted: ${shortName(app.name)}` : `Reopened: ${shortName(app.name)}` });
    } catch (e) {
      showToast({ text: friendlyError(e), tone: "error" });
    }
    setBusyId(null);
  };

  const saveNote = async (app, note) => {
    const res = await api.adminUpdateAmbassadorApplication(app.id, { note });
    replace(res, app);
  };

  const renderApp = (app) => {
    const status = APPLICATION_STATUS[app.status] || { label: app.status, tone: "gray" };
    const reply = mailtoLink(app.email, ambassadorReplyEmail({ ref: app.reference, name: firstName(app.name), city: app.city }));
    const open = app.status === "new" || app.status === "contacted";
    const canMake = app.status === "accepted" && isApproved(app.member) && !sameCity(app.member.ambassador_city, app.city);
    const busy = busyId === app.id;
    return (
      <div key={app.id} className="adm-item">
        <div className="adm-item-main">
          <div className="adm-item-title">
            <span>{app.name}</span>
            <Pill tone={status.tone}>{status.label}</Pill>
            <Pill tone="gray" dot={false}>{app.reference}</Pill>
          </div>
          <div className="adm-item-text">
            {app.city}, {app.country} · {hoursLabel(app.hours_per_week)}{app.organisation ? ` · ${app.organisation}` : ""}
          </div>
          <div className="adm-preview"><div className="adm-preview-text" style={{ whiteSpace: "pre-wrap", color: "var(--text)" }}>“{app.motivation}”</div></div>
          <div className="adm-item-meta" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>
              {app.email} · <a className="adm-link" href={reply}>Reply by email</a>
              {app.linkedin_url ? <> · <a className="adm-link" href={app.linkedin_url} target="_blank" rel="noopener noreferrer">LinkedIn</a></> : null}
              {" · "}<span title={formatDate(app.created_at, { time: true })}>sent {ago(app.created_at)}</span>
            </span>
            <AccountLine app={app} />
            {app.decided_at && <span>{status.label} {app.decided_by_name ? `by ${app.decided_by_name} ` : ""}on {formatDate(app.decided_at)}.</span>}
          </div>
          <NoteEditor value={app.admin_note || ""} save={(note) => saveNote(app, note)} placeholder="e.g. Called 20 Oct, chai meetup in Nov" />
        </div>
        <div className="adm-item-actions" style={{ flexWrap: "wrap" }}>
          {app.status === "new" && <Button variant="secondary" size="sm" icon="mail" disabled={busy} onClick={() => step(app, "contacted")}>Contacted</Button>}
          {open && <Button variant="approve" size="sm" icon="check" disabled={busy} onClick={() => setDialog({ kind: "accept", app })}>Accept…</Button>}
          {open && <Button variant="secondary" size="sm" disabled={busy} onClick={() => setDialog({ kind: "decline", app })}>Decline…</Button>}
          {canMake && <Button variant="approve" size="sm" icon="star" disabled={busy} onClick={() => setDialog({ kind: "accept", app })}>Make ambassador…</Button>}
          {!open && <Button variant="ghost" size="sm" icon="undo" disabled={busy} onClick={() => step(app, "contacted")}>Reopen</Button>}
        </div>
      </div>
    );
  };

  const countOf = (key) => (counts ? (key === "all" ? Object.values(counts).reduce((n, v) => n + (v || 0), 0) : counts[key] || 0) : null);

  let body;
  if (missing) {
    body = <EmptyState icon="star" title="Not available yet">Applications arrive by email at hello@nriclub.app until the database update of 24 October 2026 (20261024000000_ambassador_applications.sql) is in.</EmptyState>;
  } else if (loading && !apps.length) {
    body = <SkeletonRows rows={3} />;
  } else if (!apps.length && !error) {
    body = (
      <EmptyState icon="star" title={filter === "all" ? "No applications yet" : `No ${FILTERS.find((x) => x.key === filter).label.toLowerCase()} applications`}>
        When someone applies to be a city ambassador on the website or in the app, it shows up here.
      </EmptyState>
    );
  } else {
    body = (
      <section className="adm-list" aria-busy={loading}>
        {apps.map(renderApp)}
        {apps.length < total && (
          <div className="adm-more">
            <Button variant="secondary" size="sm" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? "Loading…" : `Show ${Math.min(api.AMBASSADOR_PAGE, total - apps.length)} more`}
            </Button>
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      <PageHeader title="Ambassadors" description="Applications to be a city ambassador, from the website and the app. Reply by email, then mark each one: Contacted, Accept or Decline. Accepting an approved member makes them the city's ambassador." />
      {!missing && (
        <div className="adm-filters" role="group" aria-label="Show applications">
          {FILTERS.map((x) => (
            <button key={x.key} type="button" className="adm-filter" aria-pressed={filter === x.key} onClick={() => setFilter(x.key)}>
              {x.label}{countOf(x.key) != null && <span className="adm-filter-count">{countOf(x.key).toLocaleString("en-GB")}</span>}
            </button>
          ))}
        </div>
      )}
      {error && <ErrorNote onRetry={() => load(filter)}>{error}</ErrorNote>}
      {body}
      {dialog && (
        <DecisionDialog app={dialog.app} kind={dialog.kind} onCancel={() => setDialog(null)}
          onDone={(res, city) => {
            const app = dialog.app;
            setDialog(null);
            replace(res, app);
            showToast({ text: dialog.kind === "accept" ? acceptedMessage(app, res.outcome, city) : `Declined: ${shortName(app.name)}`, duration: dialog.kind === "accept" ? 9000 : undefined });
          }} />
      )}
    </>
  );
}
