// What's on: the Indian events in Germany that other organisers run, listed
// at nriclub.app/whats-on, on the city pages and in the members' Events.
// Events added here (public.whats_on_events) show next to the list in the
// code (src/content/whatson.js), which is read-only here. The database
// checks every event with the same rules as the build.
import { useEffect, useMemo, useState } from "react";
import * as api from "../supabaseApi";
import { Button, ConfirmDialog, EmptyState, ErrorNote, PageHeader, Pill, SectionTitle, SkeletonRows } from "./ui";
import { friendlyError } from "./format";
import { slug } from "../content/slug";
import {
  WHATS_ON, WHATS_ON_PATH, CATEGORY_LABELS, upcoming, todayInGermany, whenText, placeText, whatsOnProblem, safeUrl,
} from "../content/whatson";

const SUMMARY_MAX = 160;
const CODE_SHOWN = 20;
const STATIC_IDS = new Set(WHATS_ON.map((e) => e.id));

// The form's fields, in order: [key, label, help, required].
const FIELDS = [
  ["title", "Title", "", true],
  ["start", "First day", "", true],
  ["end", "Last day", "for events over several days", false],
  ["time", "Time", "e.g. 18:00 or 18:30–23:00", false],
  ["city", "City", "English or German name", true],
  ["venue", "Venue", "the hall, temple or club", false],
  ["area", "Area or address", "", false],
  ["organiser", "Organiser", "", true],
  ["price", "Price", "e.g. Free or From €15", false],
  ["language", "Language", "", false],
  ["url", "Link", "the organiser's page or the ticket page (https://)", true],
];

const EMPTY_FORM = { id: "", title: "", category: "festival", start: "", end: "", time: "", city: "", venue: "", area: "", organiser: "", price: "", language: "", summary: "", url: "" };

// "2026-11-07-diwali-mela-berlin": the event's link on the page, from its
// first day and title.
const makeId = (f) => [f.start, slug(f.title).slice(0, 60)].filter(Boolean).join("-").replace(/-+$/, "");

// The form as an item of src/content/whatson.js (empty fields left out).
function toItem(f) {
  const item = {};
  for (const k of Object.keys(EMPTY_FORM)) {
    const t = String(f[k] || "").trim();
    if (t) item[k] = t;
  }
  if (item.end && item.end === item.start) delete item.end;
  return item;
}

function EventForm({ initial, isNew, takenIds, onSave, onCancel }) {
  const [f, setF] = useState(() => ({ ...EMPTY_FORM, ...initial }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setError(""); };
  const id = isNew ? makeId(f) : f.id;
  const item = toItem({ ...f, id });
  const missing = FIELDS.some(([k, , , req]) => req && !String(f[k] || "").trim()) || !f.summary.trim();

  const save = async () => {
    // The usual mistakes in words; anything else as the build would say it.
    const problem = (!/^https:\/\/\S+$/i.test(item.url || "") ? "The link must be a full https:// address." : "")
      || (item.end && item.end < item.start ? "The last day is before the first." : "")
      || whatsOnProblem(item) || (isNew && takenIds.has(id) ? "An event with this title on this day is already listed. Change the title." : "")
      || ((item.end || item.start) < todayInGermany() ? "This event has already ended." : "");
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError("");
    try {
      await onSave(item, isNew);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog wide tone="primary" title={isNew ? "Add an event" : `Change "${initial.title}"`} confirmLabel={isNew ? "Add event" : "Save changes"}
      busy={busy} error={error} confirmDisabled={missing} onConfirm={save} onCancel={onCancel}>
      <p style={{ margin: 0 }} className="adm-muted">
        Take the facts from the organiser's own page and write the summary in your own words. Leave out anything not confirmed.
      </p>
      <div className="adm-form">
        <div>
          <label className="adm-field-label" htmlFor="wo-title">Title</label>
          <input id="wo-title" className="adm-input" value={f.title} maxLength={120} onChange={set("title")} />
        </div>
        <div>
          <label className="adm-field-label" htmlFor="wo-category">Type</label>
          <select id="wo-category" className="adm-select" value={f.category} onChange={set("category")}>
            {Object.entries(CATEGORY_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className="adm-wo-pair">
          {FIELDS.filter(([k]) => k === "start" || k === "end").map(([k, label, help]) => (
            <div key={k}>
              <label className="adm-field-label" htmlFor={`wo-${k}`}>{label}{help && <span className="adm-faint"> ({help})</span>}</label>
              <input id={`wo-${k}`} type="date" className="adm-input" value={f[k]} min={k === "end" ? f.start || undefined : undefined} onChange={set(k)} />
            </div>
          ))}
        </div>
        {FIELDS.filter(([k]) => !["title", "start", "end"].includes(k)).map(([k, label, help, req]) => (
          <div key={k}>
            <label className="adm-field-label" htmlFor={`wo-${k}`}>{label}{!req && <span className="adm-faint"> (optional{help ? `; ${help}` : ""})</span>}{req && help && <span className="adm-faint"> ({help})</span>}</label>
            <input id={`wo-${k}`} className="adm-input" value={f[k]} onChange={set(k)} type={k === "url" ? "url" : "text"}
              inputMode={k === "url" ? "url" : undefined} maxLength={k === "url" ? 2000 : k === "time" ? 40 : 200} />
          </div>
        ))}
        <div>
          <label className="adm-field-label" htmlFor="wo-summary">Summary <span className="adm-faint">(one line, in our own words)</span></label>
          <textarea id="wo-summary" className="adm-textarea" value={f.summary} maxLength={SUMMARY_MAX} onChange={set("summary")} aria-describedby="wo-summary-count" />
          <div id="wo-summary-count" className="adm-help" style={{ textAlign: "right" }}>{f.summary.length} / {SUMMARY_MAX}</div>
        </div>
        {id && <p className="adm-help" style={{ margin: 0, overflowWrap: "anywhere" }}>Link on the page: nriclub.app{WHATS_ON_PATH}#{id}</p>}
      </div>
    </ConfirmDialog>
  );
}

function EventRow({ e, children, pills }) {
  const href = safeUrl(e.url);
  return (
    <div className="adm-item">
      <div className="adm-item-main">
        <div className="adm-item-title"><span style={{ overflowWrap: "anywhere" }}>{e.title}</span>{pills}</div>
        <div className="adm-item-text">{whenText(e)} · {placeText(e)}</div>
        <div className="adm-item-meta">
          {CATEGORY_LABELS[e.category] || e.category} · {e.organiser}
          {href && <> · <a href={href} target="_blank" rel="noopener noreferrer" className="adm-link">Organiser's page</a></>}
        </div>
      </div>
      {children && <div className="adm-item-actions">{children}</div>}
    </div>
  );
}

export default function WhatsOnView({ showToast }) {
  const [data, setData] = useState(undefined); // undefined: loading; null: before the database update
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // { initial, isNew }
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [showAllCode, setShowAllCode] = useState(false);

  const load = async () => {
    setError("");
    try {
      setData(await api.adminWhatsOnEvents());
    } catch (e) {
      setError(friendlyError(e));
      setData((d) => (d === undefined ? { upcoming: [], past: [] } : d));
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const codeEvents = useMemo(() => upcoming(WHATS_ON, todayInGermany()), []);
  const added = data?.upcoming || [];
  const past = data?.past || [];
  const takenIds = useMemo(() => new Set([...STATIC_IDS, ...added.map((e) => e.id), ...past.map((e) => e.id)]), [added, past]);

  const save = async (item, isNew) => {
    const saved = await api.adminSaveWhatsOnEvent(item, isNew);
    setData((d) => {
      const list = (d?.upcoming || []).filter((e) => e.id !== saved.id);
      return { ...(d || {}), past: d?.past || [], upcoming: [...list, saved].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title)) };
    });
    setEditing(null);
    showToast({ text: isNew ? `Added ${saved.title}` : `Saved ${saved.title}`, icon: "check" });
  };

  const setHidden = async (e, hidden) => {
    if (busyId) return;
    setBusyId(e.id);
    try {
      const saved = await api.adminHideWhatsOnEvent(e.id, hidden);
      setData((d) => ({ ...d, upcoming: d.upcoming.map((x) => (x.id === e.id ? saved : x)) }));
      showToast({
        text: hidden ? `Hid ${e.title}` : `${e.title} shows again`,
        undo: async () => {
          const back = await api.adminHideWhatsOnEvent(e.id, !hidden);
          setData((d) => ({ ...d, upcoming: d.upcoming.map((x) => (x.id === e.id ? back : x)) }));
          return "Undone";
        },
      });
    } catch (err) {
      showToast({ text: friendlyError(err), tone: "error" });
    }
    setBusyId(null);
  };

  const remove = async () => {
    const e = deleting;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await api.adminDeleteWhatsOnEvent(e.id);
      setData((d) => ({ ...d, upcoming: d.upcoming.filter((x) => x.id !== e.id), past: d.past.filter((x) => x.id !== e.id) }));
      setDeleting(null);
      showToast({ text: `Deleted ${e.title}` });
    } catch (err) {
      setDeleteError(friendlyError(err));
    }
    setDeleteBusy(false);
  };

  const shownCode = showAllCode ? codeEvents : codeEvents.slice(0, CODE_SHOWN);
  const ready = data !== undefined;

  return (
    <>
      <PageHeader title="What's on" description="Indian events in Germany that other organisers run, listed at nriclub.app/whats-on, on the city pages and in the members' Events. Add events here; the ones in the code can only be changed there.">
        {data && <div style={{ marginTop: 14 }}><Button variant="primary" onClick={() => setEditing({ initial: {}, isNew: true })}>Add event</Button></div>}
      </PageHeader>

      {error && <ErrorNote onRetry={load}>{`Couldn't load the events: ${error}`}</ErrorNote>}
      {data === null && (
        <p className="adm-callout" role="note" style={{ margin: "0 0 16px" }}>
          Adding events here needs the database update of 25 October 2026. Until then the site shows the events in the code only.
        </p>
      )}

      {!ready ? <SkeletonRows rows={3} /> : data && (
        <section>
          <SectionTitle count={added.length}>Added here</SectionTitle>
          {added.length === 0 ? (
            <EmptyState icon="calendar" title="No events added here yet">Events you add show on the site within a minute, next to the ones in the code.</EmptyState>
          ) : added.map((e) => (
            <EventRow key={e.id} e={e} pills={e.hidden ? <Pill tone="gray">Hidden</Pill> : null}>
              <Button variant="ghost" size="sm" onClick={() => setEditing({ initial: e, isNew: false })} disabled={busyId === e.id}>Edit…</Button>
              <Button variant="ghost" size="sm" onClick={() => setHidden(e, !e.hidden)} disabled={busyId === e.id}>{e.hidden ? "Show" : "Hide"}</Button>
              <Button variant="ghost" size="sm" className="adm-btn-ghost-danger" onClick={() => { setDeleteError(""); setDeleting(e); }} aria-label={`Delete ${e.title}`}>Delete…</Button>
            </EventRow>
          ))}
          {past.length > 0 && (
            <>
              <SectionTitle count={past.length}>Ended</SectionTitle>
              {past.map((e) => (
                <EventRow key={e.id} e={e} pills={<Pill tone="gray">Ended</Pill>}>
                  <Button variant="ghost" size="sm" className="adm-btn-ghost-danger" onClick={() => { setDeleteError(""); setDeleting(e); }} aria-label={`Delete ${e.title}`}>Delete…</Button>
                </EventRow>
              ))}
            </>
          )}
        </section>
      )}

      <SectionTitle count={codeEvents.length}>In the code</SectionTitle>
      <p className="adm-muted adm-small" style={{ margin: "0 0 6px" }}>From src/content/whatson.js. To change these, change the file.</p>
      {shownCode.map((e) => <EventRow key={e.id} e={e} pills={<Pill tone="gray" dot={false}>In the code</Pill>} />)}
      {codeEvents.length > shownCode.length && (
        <div className="adm-more">
          <Button variant="secondary" size="sm" onClick={() => setShowAllCode(true)}>Show all {codeEvents.length}</Button>
        </div>
      )}

      {editing && <EventForm initial={editing.initial} isNew={editing.isNew} takenIds={takenIds} onSave={save} onCancel={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog title={`Delete "${deleting.title}"?`} confirmLabel="Delete event" busy={deleteBusy} error={deleteError}
          onConfirm={remove} onCancel={() => setDeleting(null)}>
          It disappears from the site. To take it off for a while instead, hide it. This can't be undone.
        </ConfirmDialog>
      )}
    </>
  );
}
