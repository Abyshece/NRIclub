import { useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { apiErrorMessage, isNetworkError, NETWORK_MESSAGE } from "./profile";
import { todayInGermany } from "../content/whatson";
import { CITIES_ABROAD } from "../content/travel";
import {
  HOUSING_KINDS, HOUSING_KIND_KEYS, FLEX_DAYS, AHEAD_DAYS, NOTE_LIMIT, MAX_RENT, MAX_DEPOSIT, MAX_SIZE, SAFETY_TITLE,
  SAFETY_POINTS, COPY, addDays, availability, money, kindLabel, fitLabel, lookingSummary, lookingState, listingState,
  marketTag, listingProblem, lookingProblem, shortDay,
} from "../content/housing";

// ============================================================================
// FIND A PLACE (Market → Housing): search housing listings by city and dates,
// "Looking for a place" posts that hear about matching listings, and the
// member's own housing listings. The database does the search, the matching
// and the rules (supabase/migrations/20261030000000_housing_search.sql);
// before that update the panel says it's coming soon and the rest of the
// Market works as before. The words are in src/content/housing.js.
//
// Also here, for the Market's own windows in the dashboard: HousingFields
// (the details in "Post in Market" when the category is Housing),
// HousingListingInfo (the details in an opened listing, and for its author
// renewing, changing and the members looking for a place like it) and
// useHousingStatus (whether the database has the update).
//
// No search, filter or field asks about gender, religion, caste, origin,
// nationality, language or diet (German General Equal Treatment Act, AGG).
// ============================================================================

const font = "'DM Sans', sans-serif";
const INK = "#37352F";
const MUTED = "#6B6A67";
const FAINT = "#9B9A97";
const MESSAGE_LIMIT = 5000;
const card = { background: "#fff", borderRadius: 14, border: "1px solid #E8E7E4", padding: "16px 18px", marginBottom: 12, fontFamily: font, boxSizing: "border-box" };
const btn = { padding: "9px 16px", minHeight: 40, borderRadius: 8, border: "none", background: INK, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 };
const btnLight = { ...btn, border: "1px solid #E0E0DE", background: "#fff", color: INK };
const btnSmall = { padding: "6px 12px", minHeight: 36 };
const input = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 14, background: "#FAFAF8", outline: "none", fontFamily: font, boxSizing: "border-box", color: INK, minHeight: 42 };
const label = { display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, fontFamily: font };
const text = { fontSize: 13, color: MUTED, lineHeight: 1.55, fontFamily: font, margin: 0 };
const heading = { fontSize: 11, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px", fontFamily: font };
const checkRow = { display: "flex", alignItems: "center", gap: 10, minHeight: 36, fontSize: 14, color: INK, cursor: "pointer", fontFamily: font };
const FIT_STYLE = {
  full: { background: "#E3FCEF", color: "#1A7F52", border: "1px solid #B5E4CA" },
  flexible: { background: "#EEF4FF", color: "#3D5A9F", border: "1px solid #D5DFF3" },
  partial: { background: "#FFF3E0", color: "#C2410C", border: "1px solid #FED7AA" },
};

const NO_SEARCH = { kinds: [], city: "", from: "", to: "", flexible: false, maxRent: "", furnished: false, anmeldung: false };
export const EMPTY_HOUSING = { kind: "", from: "", until: "", openEnded: false, rent: "", deposit: "", size: "", furnished: false, anmeldung: false };

const firstName = (name) => String(name || "").split(" ")[0] || "there";

// A listing's photos: a JSON list of links (older ones a single link).
function photosOf(value) {
  if (!value || typeof value !== "string") return [];
  let parsed;
  try { parsed = JSON.parse(value); } catch (e) { parsed = [value]; }
  return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string" && /^https?:\/\//i.test(p)) : [];
}

// "Posted today", "Posted yesterday", "Posted 3 days ago".
function postedAgo(at) {
  const days = Math.floor((Date.now() - new Date(at).getTime()) / 86400000);
  return days <= 0 ? "Posted today" : days === 1 ? "Posted yesterday" : `Posted ${days} days ago`;
}

// A search result or one of the member's listings as the Market's windows
// (Contact, the opened listing) take an item.
function asItem(r, listing = null) {
  const m = listing || r;
  return {
    id: r.listing_id, user_id: r.user_id, title: m.title, description: m.description || "",
    price: `${money(r.warm_rent)}/month warm`, category: "Housing", location: m.location || r.city,
    seller: r.name || "NRIClub member", sellerHidden: !r.name,
    date: new Date(r.posted_at || m.created_at || r.created_at).toLocaleDateString(), photos: photosOf(m.image_url), color: "#1B3A4E",
  };
}

// Details as the form keeps them, from the database's row.
export const housingForm = (h) => ({
  kind: h.kind, city: h.city, from: h.available_from, until: h.available_until || "", openEnded: !h.available_until,
  rent: String(h.warm_rent ?? ""), deposit: String(h.deposit ?? ""), size: h.size_m2 == null ? "" : String(h.size_m2),
  furnished: !!h.furnished, anmeldung: !!h.anmeldung,
});

// Whether the database has the housing search: undefined until known, null
// before its update, else public.housing_status's answer. Asked when enabled.
export function useHousingStatus(enabled = true) {
  const [status, setStatus] = useState(undefined);
  useEffect(() => {
    if (!enabled) return undefined;
    let on = true;
    api.getHousingStatus().then((s) => { if (on) setStatus(s); }).catch(() => { if (on) setStatus(null); });
    return () => { on = false; };
  }, [enabled]);
  return status;
}

// ---------------------------------------------------------------------------
// SMALL PARTS
// ---------------------------------------------------------------------------

// A window: Escape (the window on top) and a tap outside close it (not
// while it is saving). Escape is taken before the windows under it see it.
function Dialog({ id, title, onClose, busy, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || busy) return;
      const open = document.querySelectorAll("[role=dialog]");
      if (open[open.length - 1] !== ref.current) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);
  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", backdropFilter: "blur(2px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }} onClick={(e) => e.stopPropagation()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, padding: "22px 20px", margin: "auto", boxSizing: "border-box", fontFamily: font }}>
        <h3 id={id} style={{ fontSize: 17, fontWeight: 700, color: INK, margin: "0 0 12px", fontFamily: font }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

// The safety warning, next to listings and in the forms.
export function SafetyNote({ style }) {
  return (
    <div role="note" style={{ background: "#FFF8EC", border: "1px solid #FDE2B8", borderRadius: 10, padding: "10px 12px", fontFamily: font, ...style }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#7C4A03", margin: "0 0 4px" }}>⚠️ {SAFETY_TITLE}</p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {SAFETY_POINTS.map((p) => <li key={p} style={{ fontSize: 12, color: "#7C4A03", lineHeight: 1.5 }}>{p}</li>)}
      </ul>
    </div>
  );
}

// The kinds of place as buttons that stay pressed (several can be).
function KindChips({ value, onChange, legend, single = false }) {
  const toggle = (k) => onChange(single ? k : (value.includes(k) ? value.filter((x) => x !== k) : [...value, k]));
  const on = (k) => (single ? value === k : value.includes(k));
  return (
    <fieldset style={{ border: "none", padding: 0, margin: "0 0 12px", minWidth: 0 }}>
      <legend style={{ ...label, padding: 0 }}>{legend}</legend>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {HOUSING_KIND_KEYS.map((k) => (
          <button key={k} type="button" aria-pressed={on(k)} title={HOUSING_KINDS[k].hint} onClick={() => toggle(k)}
            style={{ padding: "7px 14px", minHeight: 36, borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: font, border: on(k) ? `1px solid ${INK}` : "1px solid #E0E0DE", background: on(k) ? INK : "#fff", color: on(k) ? "#fff" : "#5F5E5B" }}>
            {HOUSING_KINDS[k].label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Chip({ children }) {
  return <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, border: "1px solid #E0E0DE", background: "#FAFAF8", color: "#5F5E5B", fontFamily: font, whiteSpace: "nowrap" }}>{children}</span>;
}

// The facts of a place: kind, when it's free, rent, deposit, size, furnished, Anmeldung.
function Facts({ h }) {
  const rows = [
    ["Kind of place", kindLabel(h.kind)],
    ["Available", availability(h.available_from, h.available_until).replace(/^Free /, "")],
    ["Warm rent", `${money(h.warm_rent)} a month`],
    ["Deposit", h.deposit ? money(h.deposit) : "None"],
    ["Size", h.size_m2 ? `${h.size_m2} m²` : "Not given"],
    ["Furnished", h.furnished ? "Yes" : "No"],
    ["Anmeldung possible", h.anmeldung ? "Yes" : "No"],
  ];
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, margin: "0 0 14px" }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ padding: "10px 12px", background: "#FAFAF8", borderRadius: 8, border: "1px solid #EDEDEB", minWidth: 0 }}>
          <dt style={{ fontSize: 10, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3, fontFamily: font }}>{k}</dt>
          <dd style={{ margin: 0, fontSize: 14, fontWeight: 600, color: INK, fontFamily: font, overflowWrap: "anywhere" }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// THE DETAILS IN A FORM (Post in Market, and changing a listing)
// ---------------------------------------------------------------------------

// value: EMPTY_HOUSING's fields (and city, with withCity). today: in
// Germany. minFrom: the earliest "from" date the form offers (a listing
// being changed keeps one that has passed).
export function HousingFields({ value, onChange, today, error = "", withCity = false, minFrom = null, idPrefix = "housing", listId = "housing-cities" }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const last = addDays(today, AHEAD_DAYS);
  const id = (k) => `${idPrefix}-${k}`;
  return (
    <div style={{ marginBottom: 20 }}>
      <KindChips value={value.kind} single legend="Kind of place" onChange={(k) => set("kind", k)} />
      {withCity && (
        <div style={{ marginBottom: 12 }}>
          <label htmlFor={id("city")} style={label}>City</label>
          <input id={id("city")} list={listId} value={value.city || ""} maxLength={60} autoComplete="off" placeholder="e.g. Munich"
            onChange={(e) => set("city", e.target.value)} style={input} />
        </div>
      )}
      <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 6 }}>
        <div>
          <label htmlFor={id("from")} style={label}>Available from</label>
          <input id={id("from")} type="date" value={value.from} min={minFrom || today} max={last} onChange={(e) => set("from", e.target.value)} style={input} />
        </div>
        <div>
          <label htmlFor={id("until")} style={label}>Available until</label>
          <input id={id("until")} type="date" value={value.openEnded ? "" : value.until} min={value.from || today} max={last} disabled={value.openEnded}
            onChange={(e) => set("until", e.target.value)} style={{ ...input, opacity: value.openEnded ? 0.5 : 1 }} />
        </div>
      </div>
      <label style={{ ...checkRow, marginBottom: 12 }}>
        <input type="checkbox" checked={value.openEnded} onChange={(e) => onChange({ ...value, openEnded: e.target.checked, until: e.target.checked ? "" : value.until })} style={{ width: 16, height: 16 }} />
        Open-ended (no end date)
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 8, alignItems: "end" }}>
        <div>
          <label htmlFor={id("rent")} style={label}>Warm rent / month (€)</label>
          <input id={id("rent")} type="number" inputMode="numeric" min={1} max={MAX_RENT} step={1} value={value.rent} placeholder="e.g. 650"
            onChange={(e) => set("rent", e.target.value)} style={input} />
        </div>
        <div>
          <label htmlFor={id("deposit")} style={label}>Deposit (€)</label>
          <input id={id("deposit")} type="number" inputMode="numeric" min={0} max={MAX_DEPOSIT} step={1} value={value.deposit} placeholder="0 if none"
            onChange={(e) => set("deposit", e.target.value)} style={input} />
        </div>
        <div>
          <label htmlFor={id("size")} style={label}>Size (m², optional)</label>
          <input id={id("size")} type="number" inputMode="numeric" min={1} max={MAX_SIZE} step={1} value={value.size} placeholder="e.g. 14"
            onChange={(e) => set("size", e.target.value)} style={input} />
        </div>
      </div>
      <p style={{ ...text, fontSize: 12, marginBottom: 6 }}>Warm rent: the rent with heating and other running costs (Nebenkosten).</p>
      <label style={checkRow}>
        <input type="checkbox" checked={value.furnished} onChange={(e) => set("furnished", e.target.checked)} style={{ width: 16, height: 16 }} />
        Furnished
      </label>
      <label style={{ ...checkRow, marginBottom: 12 }}>
        <input type="checkbox" checked={value.anmeldung} onChange={(e) => set("anmeldung", e.target.checked)} style={{ width: 16, height: 16 }} />
        <span>Anmeldung possible <span style={{ color: MUTED, fontSize: 12 }}>({COPY.anmeldungHint.replace(/\.$/, "")})</span></span>
      </label>
      <SafetyNote />
      {error && <p role="alert" style={{ ...text, color: "#B91C1C", marginTop: 10 }}>{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A MESSAGE TO A MEMBER WHO IS LOOKING FOR A PLACE
// ---------------------------------------------------------------------------
function MessageDialog({ match, title, onCancel, onSend }) {
  const tag = marketTag(title);
  const [value, setValue] = useState(`Hi ${firstName(match.name)}, I saw you're looking for a place in ${match.city}. My listing "${title}" might suit you. `);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async () => {
    if (busy || !value.trim()) return;
    setBusy(true);
    setError("");
    const problem = await onSend(match.user_id, `${tag}${value.trim()}`);
    setBusy(false);
    if (problem) setError(problem);
    else onCancel();
  };
  return (
    <Dialog id="housing-message-title" title={`Message ${firstName(match.name)}`} onClose={onCancel} busy={busy}>
      <p style={{ ...text, marginBottom: 10 }}>{lookingSummary(match)}</p>
      <label htmlFor="housing-message" style={label}>Message</label>
      <textarea id="housing-message" value={value} autoFocus maxLength={MESSAGE_LIMIT - tag.length} onChange={(e) => { setValue(e.target.value); setError(""); }}
        style={{ ...input, minHeight: 110, resize: "vertical" }} />
      <p role="note" style={{ ...text, fontSize: 12, margin: "8px 0 12px" }}>Never ask for a deposit or rent before they've seen the place and signed a contract.</p>
      {error && <p role="alert" style={{ ...text, color: "#B91C1C", marginBottom: 10 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" onClick={onCancel} disabled={busy} style={btnLight}>Cancel</button>
        <button type="button" onClick={send} disabled={busy || !value.trim()} style={{ ...btn, opacity: value.trim() ? 1 : 0.45 }}>{busy ? "Sending…" : "Send message"}</button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// AN OPENED LISTING (in the Market's window): its details; for its author,
// when it stops being shown, renewing or changing it, and who is looking
// ---------------------------------------------------------------------------

// item: the Market listing. onMessage(userId, text) sends the first message
// and resolves to why it couldn't ("" when sent). onChanged(details) after
// a change or renewal. Shows nothing for a listing without details (from
// before, or before the database update).
export function HousingListingInfo({ item, user, Avatar, onMessage, onChanged }) {
  const today = todayInGermany();
  const [h, setH] = useState(undefined);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [matches, setMatches] = useState(null);
  const [messaging, setMessaging] = useState(null);
  useEffect(() => {
    let on = true;
    setH(undefined); setEditing(null); setMatches(null); setNotice(""); setError("");
    api.getHousingListing(item.id).then((x) => { if (on) setH(x); }).catch(() => { if (on) setH(null); });
    return () => { on = false; };
  }, [item.id]);
  const mine = !!h && h.user_id === user.id;
  useEffect(() => {
    if (!mine) return undefined;
    let on = true;
    api.getHousingMatches(item.id).then((m) => { if (on) setMatches(m); }).catch(() => { if (on) setMatches([]); });
    return () => { on = false; };
  }, [mine, item.id]);
  if (!h) return null;
  const state = listingState(h, today);

  const renew = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await api.renewHousingListing(h.listing_id);
      const next = { ...h, expires_on: r.expires_on, renewed_at: r.renewed_at };
      setH(next);
      setNotice(`Renewed: shown until ${shortDay(r.expires_on)}.`);
      onChanged?.(next);
    } catch (e) {
      setError(apiErrorMessage(e, "It couldn't be renewed. Please try again."));
    }
    setBusy(false);
  };
  const save = async () => {
    const problem = listingProblem(editing, today, h.available_from);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await api.updateHousingListing(h.listing_id, { ...editing, until: editing.openEnded ? "" : editing.until });
      setH(saved);
      setEditing(null);
      setNotice("Your changes are saved.");
      onChanged?.(saved);
      // Other dates or rent can fit other members.
      api.getHousingMatches(h.listing_id).then(setMatches).catch(() => {});
    } catch (e) {
      setError(apiErrorMessage(e, "Your changes couldn't be saved. Please try again."));
    }
    setBusy(false);
  };

  return (
    <div style={{ marginBottom: 20 }}>
      {editing ? (
        <section aria-labelledby="housing-edit-title" style={{ marginBottom: 12 }}>
          <h3 id="housing-edit-title" style={{ fontSize: 15, fontWeight: 700, color: INK, margin: "0 0 10px", fontFamily: font }}>Change the details</h3>
          <HousingFields value={editing} onChange={(v) => { setEditing(v); setError(""); }} today={today} withCity listId="housing-edit-cities"
            minFrom={h.available_from < today ? h.available_from : today} idPrefix="housing-edit" error={error} />
          <datalist id="housing-edit-cities">{CITIES_ABROAD.map((c) => <option key={c} value={c} />)}</datalist>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" onClick={() => { setEditing(null); setError(""); }} disabled={busy} style={btnLight}>Cancel</button>
            <button type="button" onClick={save} disabled={busy} style={btn}>{busy ? "Saving…" : "Save changes"}</button>
          </div>
        </section>
      ) : (<>
        <Facts h={h} />
        {!mine && state.key === "expired" && <p role="status" style={{ ...text, color: "#B91C1C", marginBottom: 12 }}>This listing has expired: the place may not be free any more.</p>}
        <SafetyNote style={{ marginBottom: 12 }} />
      </>)}
      {mine && !editing && (
        <section aria-labelledby="housing-own-title" style={{ ...card, background: "#FCFCFB", padding: "14px 14px" }}>
          <h3 id="housing-own-title" style={{ ...heading, marginBottom: 6 }}>Your listing</h3>
          <p style={{ ...text, color: state.key === "expired" ? "#B91C1C" : state.key === "soon" ? "#C2410C" : MUTED, marginBottom: 10 }}>
            {state.text}{h.available_until ? "" : `. Open-ended listings are shown for 60 days at a time.`}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            {!h.available_until && <button type="button" onClick={renew} disabled={busy} style={{ ...btn, ...btnSmall }}>{busy ? "Renewing…" : "Renew for 60 days"}</button>}
            <button type="button" onClick={() => { setEditing(housingForm(h)); setNotice(""); setError(""); }} disabled={busy} style={{ ...btnLight, ...btnSmall }}>
              {h.available_until ? "Change dates or details" : "Change details"}
            </button>
          </div>
          {notice && <p role="status" style={{ ...text, color: "#1A7F52", marginTop: 6 }}>{notice}</p>}
          {error && <p role="alert" style={{ ...text, color: "#B91C1C", marginTop: 6 }}>{error}</p>}
          <h4 style={{ ...heading, margin: "14px 0 4px" }}>Members looking for a place like this</h4>
          <p style={{ ...text, fontSize: 12, marginBottom: 8 }}>{COPY.matchesExplain}</p>
          {matches === null ? <p role="status" style={text}>Loading…</p> : matches.length === 0 ? (
            <p style={text}>Nobody yet. Members who post what they're looking for and whose dates, city and rent fit will show here.</p>
          ) : matches.map((m) => (
            <article key={m.id} aria-label={`${m.name}: ${lookingSummary(m)}`} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderTop: "1px solid #F0EFED", flexWrap: "wrap" }}>
              <Avatar name={m.name} size={28} url={m.avatar_url} />
              <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: INK, margin: 0, fontFamily: font }}>{m.name}</p>
                <p style={{ ...text, fontSize: 12 }}>{lookingSummary(m)}</p>
                {(m.furnished || m.anmeldung) && <p style={{ ...text, fontSize: 12 }}>{[m.furnished && "Furnished", m.anmeldung && "Anmeldung needed"].filter(Boolean).join(" · ")}</p>}
                {m.note && <p style={{ ...text, fontSize: 12, color: INK, whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 4 }}>{m.note}</p>}
              </div>
              <button type="button" onClick={() => setMessaging(m)} style={{ ...btn, ...btnSmall }}>Message</button>
            </article>
          ))}
        </section>
      )}
      {messaging && <MessageDialog match={messaging} title={item.title} onCancel={() => setMessaging(null)} onSend={onMessage} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// "LOOKING FOR A PLACE": WRITING ONE
// ---------------------------------------------------------------------------
function LookingForm({ initial, today, onCancel, onSaved }) {
  const editing = !!initial.id;
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setError(""); };
  const last = addDays(today, AHEAD_DAYS);
  const save = async () => {
    if (busy) return;
    const problem = lookingProblem(f, today, editing ? initial.from : null);
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      const saved = editing ? await api.updateLookingPost(initial.id, f) : await api.createLookingPost(f);
      setBusy(false);
      onSaved(saved, editing);
    } catch (e) {
      setBusy(false);
      setError(/42501|row-level security/i.test(e?.message || "") ? "Only members our team has approved can post here."
        : apiErrorMessage(e, "Your post couldn't be saved. Please try again."));
    }
  };
  return (
    <Dialog id="housing-looking-title" title={editing ? "Change what you're looking for" : "What are you looking for?"} onClose={onCancel} busy={busy}>
      <p style={{ ...text, marginBottom: 12 }}>{COPY.lookingExplain}</p>
      <KindChips value={f.kinds} legend="Kind of place (one or more)" onChange={(v) => set("kinds", v)} />
      <div style={{ marginBottom: 12 }}>
        <label htmlFor="looking-city" style={label}>City</label>
        <input id="looking-city" list="housing-cities" value={f.city} maxLength={60} autoComplete="off" placeholder="e.g. Munich"
          onChange={(e) => set("city", e.target.value)} style={input} />
      </div>
      <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 6 }}>
        <div>
          <label htmlFor="looking-from" style={label}>From</label>
          <input id="looking-from" type="date" value={f.from} min={editing && initial.from < today ? initial.from : today} max={last}
            onChange={(e) => set("from", e.target.value)} style={input} />
        </div>
        <div>
          <label htmlFor="looking-until" style={label}>Until (optional)</label>
          <input id="looking-until" type="date" value={f.until} min={f.from || today} max={last} onChange={(e) => set("until", e.target.value)} style={input} />
        </div>
      </div>
      <p style={{ ...text, fontSize: 12, marginBottom: 12 }}>No end date? Leave "until" empty: we'll tell you about places with no end date, or free for at least 4 weeks.</p>
      <div style={{ marginBottom: 8 }}>
        <label htmlFor="looking-rent" style={label}>Highest warm rent / month (€, optional)</label>
        <input id="looking-rent" type="number" inputMode="numeric" min={1} max={MAX_RENT} step={1} value={f.rent} placeholder="e.g. 700"
          onChange={(e) => set("rent", e.target.value)} style={input} />
      </div>
      <label style={checkRow}>
        <input type="checkbox" checked={f.furnished} onChange={(e) => set("furnished", e.target.checked)} style={{ width: 16, height: 16 }} />
        It must be furnished
      </label>
      <label style={{ ...checkRow, marginBottom: 12 }}>
        <input type="checkbox" checked={f.anmeldung} onChange={(e) => set("anmeldung", e.target.checked)} style={{ width: 16, height: 16 }} />
        I need to register my address there (Anmeldung)
      </label>
      <label htmlFor="looking-note" style={label}>A short note (optional)</label>
      <textarea id="looking-note" value={f.note} maxLength={NOTE_LIMIT} onChange={(e) => set("note", e.target.value)} placeholder={COPY.lookingNoteHint}
        style={{ ...input, minHeight: 80, resize: "vertical" }} />
      <p style={{ ...text, fontSize: 11, textAlign: "right", margin: "2px 0 10px" }}>{f.note.length} / {NOTE_LIMIT}</p>
      <SafetyNote style={{ marginBottom: 12 }} />
      {error && <p role="alert" style={{ ...text, color: "#B91C1C", marginBottom: 10 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" onClick={onCancel} disabled={busy} style={btnLight}>Cancel</button>
        <button type="button" onClick={save} disabled={busy} style={btn}>{busy ? "Saving…" : editing ? "Save" : "Post"}</button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// ONE SEARCH RESULT
// ---------------------------------------------------------------------------
function ResultCard({ r, wantedDays, reported, onOpen, onContact, onReport, Avatar }) {
  const photo = photosOf(r.image_url)[0];
  const item = asItem(r);
  const fit = fitLabel(r, wantedDays);
  return (
    <article style={{ ...card, padding: "14px 14px" }} aria-label={r.title}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <button type="button" onClick={() => onOpen(item)} aria-label={`Open ${r.title}`}
          style={{ width: 84, height: 84, flexShrink: 0, borderRadius: 10, overflow: "hidden", border: "none", padding: 0, cursor: "pointer", background: photo ? "#F0EFED" : "linear-gradient(135deg, #1B3A4EDD, #1B3A4E88)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
          {photo ? <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span aria-hidden="true">🏠</span>}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.04em", textTransform: "uppercase", background: "#F0EFED", color: "#5F5E5B" }}>{kindLabel(r.kind)}</span>
            {fit && <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, ...FIT_STYLE[r.fit] }}>{fit}</span>}
          </div>
          <h4 style={{ fontSize: 15, fontWeight: 700, color: INK, margin: "0 0 4px", fontFamily: font, overflowWrap: "anywhere", lineHeight: 1.3 }}>{r.title}</h4>
          <p style={{ ...text, fontSize: 12 }}>📍 {r.city} · {availability(r.available_from, r.available_until)}</p>
          <p style={{ ...text, fontSize: 12, color: INK }}>
            <strong>{money(r.warm_rent)}</strong> warm a month · Deposit {r.deposit ? money(r.deposit) : "none"}{r.size_m2 ? ` · ${r.size_m2} m²` : ""}
          </p>
          {(r.furnished || r.anmeldung) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {r.furnished && <Chip>Furnished</Chip>}
              {r.anmeldung && <Chip>Anmeldung possible</Chip>}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", paddingTop: 10, marginTop: 10, borderTop: "1px solid #F0EFED" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Avatar name={r.name || "NRIClub member"} size={24} url={r.avatar_url} />
          <span style={{ fontSize: 12, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.mine ? "Your listing" : r.name} · {postedAgo(r.posted_at)}
          </span>
        </span>
        <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => onOpen(item)} style={{ ...btnLight, ...btnSmall }}>View</button>
          {!r.mine && <button type="button" onClick={() => onContact(item)} style={{ ...btn, ...btnSmall }}>Message</button>}
          {!r.mine && !reported && (
            <button type="button" onClick={() => onReport({ type: "market", id: r.listing_id, userId: r.user_id, name: r.title })} aria-label={`Report the listing ${r.title}`} title="Report"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#8F8E8A", padding: 8, display: "flex" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></svg>
            </button>
          )}
        </span>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// THE PANEL
// ---------------------------------------------------------------------------

// onOpen(item) opens a listing in the Market's window; onContact(item) the
// Market's first message to its author; onReport(target) the report
// dialog; onPost() "Post in Market" with Housing chosen; onReady(bool)
// says whether the database has the update. Avatar comes from the
// dashboard.
export default function HousingSearch({ user, onOpen, onContact, onReport, reportedIds, blockedIds, onPost, onReady, Avatar }) {
  const today = todayInGermany();
  const [state, setState] = useState("loading"); // loading | ready | missing | error
  const [loadError, setLoadError] = useState("");
  const [q, setQ] = useState(NO_SEARCH);
  const [showMore, setShowMore] = useState(false);
  const [results, setResults] = useState(null); // { total, wanted_days, results, asked }
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [looking, setLooking] = useState([]);
  const [mine, setMine] = useState([]);
  const [lookingForm, setLookingForm] = useState(null);
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);
  const resultsRef = useRef(null);

  const load = async () => {
    setLoadError("");
    try {
      const status = await api.getHousingStatus();
      if (!status) { setState("missing"); onReady?.(false); return; }
      const [w, m] = await Promise.all([api.getMyLookingPosts(), api.getMyHousingListings()]);
      setLooking(w || []);
      setMine(m || []);
      setState("ready");
      onReady?.(true);
    } catch (e) {
      setLoadError(isNetworkError(e) ? NETWORK_MESSAGE : COPY.loadError);
      setState("error");
    }
  };
  useEffect(() => { load(); }, []);

  const setField = (k, v) => { setQ((x) => ({ ...x, [k]: v })); setSearchError(""); };
  const search = async (query = q, e = null) => {
    e?.preventDefault?.();
    if (query.from && query.to && query.to < query.from) { setSearchError("The \"to\" date is before the \"from\" date. Please check the dates."); return; }
    if (String(query.maxRent || "").trim() && !/^\d+$/.test(String(query.maxRent).trim())) { setSearchError("Please give the highest warm rent as a whole number of euros."); return; }
    setSearching(true);
    setSearchError("");
    try {
      const res = await api.searchHousing(query);
      if (res === null) { setState("missing"); onReady?.(false); return; }
      setResults({ ...res, asked: query });
      setTimeout(() => resultsRef.current?.focus(), 50);
    } catch (err) {
      setSearchError(isNetworkError(err) ? NETWORK_MESSAGE : apiErrorMessage(err, "The search didn't work. Please try again."));
    } finally {
      setSearching(false);
    }
  };
  const clear = () => { setQ(NO_SEARCH); setResults(null); setSearchError(""); };

  // A looking post's needs, as a search.
  const searchFor = (w) => {
    const query = { ...NO_SEARCH, kinds: [...(w.kinds || [])], city: w.city, from: w.date_from < today ? today : w.date_from,
      to: w.date_to || "", flexible: true, maxRent: w.max_rent ? String(w.max_rent) : "", furnished: !!w.furnished, anmeldung: !!w.anmeldung };
    setQ(query);
    search(query);
  };
  const startLooking = () => setLookingForm({
    kinds: [...q.kinds], city: q.city || user.city || "", from: q.from || "", until: q.to || "", rent: q.maxRent || "",
    furnished: q.furnished, anmeldung: q.anmeldung, note: "",
  });
  const editLooking = (w) => setLookingForm({
    id: w.id, kinds: [...(w.kinds || [])], city: w.city, from: w.date_from, until: w.date_to || "", rent: w.max_rent ? String(w.max_rent) : "",
    furnished: !!w.furnished, anmeldung: !!w.anmeldung, note: w.note || "",
  });
  const savedLooking = (row, edited) => {
    setLooking((prev) => (edited ? prev.map((x) => (x.id === row.id ? row : x)) : [row, ...prev]));
    setLookingForm(null);
    setNotice(edited ? "Your post is saved." : "Your post is up. We'll send you a notification when someone posts a matching place.");
  };
  const toggleLooking = async (w) => {
    setBusyId(w.id);
    try {
      const row = await api.updateLookingPost(w.id, { active: !w.active });
      setLooking((prev) => prev.map((x) => (x.id === row.id ? row : x)));
      setNotice(row.active ? "Turned on: we'll tell you about matching places again." : "Turned off: you won't get notifications for this post.");
    } catch (e) {
      alert(apiErrorMessage(e, "That didn't work. Please try again."));
    }
    setBusyId(null);
  };
  const deleteLooking = async (w) => {
    if (!confirm("Delete this post? You won't get notifications for it any more.")) return;
    setBusyId(w.id);
    try {
      await api.deleteLookingPost(w.id);
      setLooking((prev) => prev.filter((x) => x.id !== w.id));
      setNotice("");
    } catch (e) {
      alert(apiErrorMessage(e, "The post couldn't be deleted. Please try again."));
    }
    setBusyId(null);
  };
  const renew = async (h) => {
    setBusyId(h.listing_id);
    try {
      const r = await api.renewHousingListing(h.listing_id);
      setMine((prev) => prev.map((x) => (x.listing_id === h.listing_id ? { ...x, expires_on: r.expires_on, renewed_at: r.renewed_at,
        listing: x.listing ? { ...x.listing, status: "active" } : x.listing } : x)));
      setNotice(`Renewed: shown until ${shortDay(r.expires_on)}.`);
    } catch (e) {
      alert(apiErrorMessage(e, "It couldn't be renewed. Please try again."));
    }
    setBusyId(null);
  };

  const isReported = (r) => !!reportedIds && (reportedIds.has(r.listing_id) || reportedIds.has(`market:${r.listing_id}`));
  const shown = (results?.results || []).filter((r) => r.mine || !blockedIds?.has(r.user_id));
  const dated = !!(results?.asked?.from || results?.asked?.to);
  const groups = dated ? [
    ["full", "Free for all your dates"],
    ["flexible", `Within a week of your dates (±${FLEX_DAYS} days)`],
    ["partial", "Close alternatives"],
  ] : [[null, "Places"]];
  const searchingNow = q.kinds.length || q.city.trim() || q.from || q.to || q.flexible || String(q.maxRent).trim() || q.furnished || q.anmeldung;

  const header = (
    <div style={{ marginBottom: 12 }}>
      <h3 id="housing-title" style={{ fontSize: 18, fontWeight: 700, color: INK, fontFamily: font, margin: "0 0 4px" }}>🏠 {COPY.title}</h3>
      <p style={text}>{COPY.intro}</p>
    </div>
  );

  if (state === "loading") {
    return <section aria-labelledby="housing-title" style={card}>{header}<p role="status" style={text}>Loading…</p></section>;
  }
  if (state === "missing") {
    return (
      <section aria-labelledby="housing-title" style={{ ...card, background: "#F5F8FF", border: "1px solid #DCE6FA" }}>
        {header}
        <h4 style={{ fontSize: 14, fontWeight: 700, color: INK, margin: "0 0 4px", fontFamily: font }}>Coming soon</h4>
        <p style={text}>{COPY.comingSoon}</p>
      </section>
    );
  }
  if (state === "error") {
    return (
      <section aria-labelledby="housing-title" style={card}>
        {header}
        <p role="alert" style={{ ...text, marginBottom: 10 }}>{loadError}</p>
        <button type="button" onClick={() => { setState("loading"); load(); }} style={btnLight}>Try again</button>
      </section>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <section aria-labelledby="housing-title" style={card}>
        {header}
        <form role="search" aria-label="Search housing" onSubmit={(e) => search(q, e)}>
          <KindChips value={q.kinds} legend="I'm looking for" onChange={(v) => setField("kinds", v)} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 6 }}>
            <div>
              <label htmlFor="housing-city" style={label}>City</label>
              <input id="housing-city" list="housing-cities" value={q.city} maxLength={60} autoComplete="off" placeholder="Any city"
                onChange={(e) => setField("city", e.target.value)} style={input} />
            </div>
            <div>
              <label htmlFor="housing-from" style={label}>From</label>
              <input id="housing-from" type="date" value={q.from} min={today} onChange={(e) => setField("from", e.target.value)} style={input} />
            </div>
            <div>
              <label htmlFor="housing-to" style={label}>To</label>
              <input id="housing-to" type="date" value={q.to} min={q.from || today} onChange={(e) => setField("to", e.target.value)} style={input} />
            </div>
          </div>
          <label style={checkRow}>
            <input type="checkbox" checked={q.flexible} onChange={(e) => setField("flexible", e.target.checked)} style={{ width: 16, height: 16 }} />
            Flexible ±1 week
          </label>
          <button type="button" aria-expanded={showMore} aria-controls="housing-more" onClick={() => setShowMore((x) => !x)}
            style={{ background: "none", border: "none", color: INK, textDecoration: "underline", fontSize: 13, cursor: "pointer", padding: "8px 0", fontFamily: font }}>
            {showMore ? "Fewer filters" : "More filters: rent, furnished, Anmeldung"}
          </button>
          {showMore && (
            <div id="housing-more" style={{ padding: "8px 0 4px" }}>
              <div style={{ maxWidth: 260, marginBottom: 8 }}>
                <label htmlFor="housing-rent" style={label}>Highest warm rent / month (€)</label>
                <input id="housing-rent" type="number" inputMode="numeric" min={1} max={MAX_RENT} step={1} value={q.maxRent} placeholder="Any"
                  onChange={(e) => setField("maxRent", e.target.value)} style={input} />
              </div>
              <label style={checkRow}>
                <input type="checkbox" checked={q.furnished} onChange={(e) => setField("furnished", e.target.checked)} style={{ width: 16, height: 16 }} />
                Furnished
              </label>
              <label style={checkRow}>
                <input type="checkbox" checked={q.anmeldung} onChange={(e) => setField("anmeldung", e.target.checked)} style={{ width: 16, height: 16 }} />
                Anmeldung possible
              </label>
            </div>
          )}
          {searchError && <p role="alert" style={{ ...text, color: "#B91C1C", margin: "6px 0" }}>{searchError}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button type="submit" disabled={searching} style={btn}>{searching ? "Searching…" : "Search"}</button>
            {(searchingNow || results) && <button type="button" onClick={clear} style={btnLight}>Clear</button>}
            <button type="button" onClick={onPost} style={{ ...btnLight, marginLeft: "auto" }}>+ Offer a place</button>
          </div>
        </form>
      </section>

      <SafetyNote style={{ marginBottom: 12 }} />

      {notice && <p role="status" style={{ ...text, color: "#1A7F52", background: "#E3FCEF", border: "1px solid #B5E4CA", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>{notice}</p>}

      {results && (
        <section aria-labelledby="housing-results" style={{ marginBottom: 18 }}>
          <h3 id="housing-results" ref={resultsRef} tabIndex={-1} style={{ ...heading, outline: "none" }}>
            {results.total === 0 ? "No places found" : results.total === 1 ? "1 place" : `${results.total} places`}
            {results.wanted_days ? ` · your dates: ${results.wanted_days} days` : ""}
          </h3>
          {shown.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: "24px 18px", borderStyle: "dashed" }}>
              <p style={{ ...text, marginBottom: 6 }}>{COPY.noResults}</p>
              <p style={{ ...text, marginBottom: 12 }}>{COPY.noResultsTip}</p>
              <button type="button" onClick={startLooking} style={btn}>Post what you're looking for</button>
            </div>
          ) : groups.map(([fit, title]) => {
            const list = shown.filter((r) => (fit ? r.fit === fit : true));
            if (!list.length) return null;
            return (
              <div key={fit || "all"} style={{ marginBottom: 6 }}>
                {dated && <h4 style={{ fontSize: 13, fontWeight: 700, color: INK, margin: "10px 0 8px", fontFamily: font }}>{title}</h4>}
                {list.map((r) => <ResultCard key={r.listing_id} r={r} wantedDays={results.wanted_days} reported={isReported(r)}
                  onOpen={onOpen} onContact={onContact} onReport={onReport} Avatar={Avatar} />)}
              </div>
            );
          })}
          {results.total > (results.results || []).length && <p style={{ ...text, fontSize: 12 }}>Showing the best {results.results.length}. Add a city or dates to narrow it down.</p>}
        </section>
      )}

      <section aria-labelledby="housing-looking" style={{ marginBottom: 18 }}>
        <h3 id="housing-looking" style={heading}>What you're looking for</h3>
        {looking.length === 0 ? (
          <div style={{ ...card, background: "#FCFCFB" }}>
            <p style={{ ...text, marginBottom: 10 }}>{COPY.lookingExplain}</p>
            <button type="button" onClick={startLooking} style={btn}>Post what you're looking for</button>
          </div>
        ) : (<>
          {looking.map((w) => {
            const st = lookingState(w, today);
            return (
              <article key={w.id} style={{ ...card, padding: "12px 14px" }} aria-label={lookingSummary(w)}>
                <p style={{ fontSize: 14, fontWeight: 600, color: INK, margin: "0 0 4px", overflowWrap: "anywhere", fontFamily: font }}>{lookingSummary(w)}</p>
                {(w.furnished || w.anmeldung) && <p style={{ ...text, fontSize: 12 }}>{[w.furnished && "Furnished", w.anmeldung && "Anmeldung needed"].filter(Boolean).join(" · ")}</p>}
                {w.note && <p style={{ ...text, fontSize: 12, color: INK, whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 4 }}>{w.note}</p>}
                <p style={{ ...text, fontSize: 12, marginTop: 6, color: st.key === "active" ? "#1A7F52" : st.key === "off" ? MUTED : "#B91C1C" }}>{st.text}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  <button type="button" onClick={() => searchFor(w)} style={{ ...btn, ...btnSmall }}>See places</button>
                  {st.key !== "expired" && <button type="button" onClick={() => editLooking(w)} disabled={busyId === w.id} style={{ ...btnLight, ...btnSmall }}>Change</button>}
                  {st.key !== "expired" && <button type="button" onClick={() => toggleLooking(w)} disabled={busyId === w.id} style={{ ...btnLight, ...btnSmall }}>{w.active ? "Turn off" : "Turn on"}</button>}
                  <button type="button" onClick={() => deleteLooking(w)} disabled={busyId === w.id} style={{ ...btnLight, ...btnSmall, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626" }}>Delete</button>
                </div>
              </article>
            );
          })}
          <button type="button" onClick={startLooking} style={btnLight}>+ Post what you're looking for</button>
        </>)}
      </section>

      {mine.length > 0 && (
        <section aria-labelledby="housing-mine" style={{ marginBottom: 18 }}>
          <h3 id="housing-mine" style={heading}>Your housing listings</h3>
          {mine.map((h) => {
            const st = listingState(h, today);
            const item = asItem({ ...h, name: user.name }, h.listing);
            return (
              <article key={h.listing_id} style={{ ...card, padding: "12px 14px" }} aria-label={h.listing?.title || "Your listing"}>
                <p style={{ fontSize: 14, fontWeight: 600, color: INK, margin: "0 0 2px", overflowWrap: "anywhere", fontFamily: font }}>{h.listing?.title}</p>
                <p style={{ ...text, fontSize: 12 }}>{kindLabel(h.kind)} · {h.city} · {availability(h.available_from, h.available_until)} · {money(h.warm_rent)} warm</p>
                <p style={{ ...text, fontSize: 12, marginTop: 4, color: st.key === "expired" ? "#B91C1C" : st.key === "soon" ? "#C2410C" : MUTED }}>{st.text}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  <button type="button" onClick={() => onOpen(item)} style={{ ...btnLight, ...btnSmall }}>Open, change or see who's looking</button>
                  {!h.available_until && st.key !== "shown" && (
                    <button type="button" onClick={() => renew(h)} disabled={busyId === h.listing_id} style={{ ...btn, ...btnSmall }}>{busyId === h.listing_id ? "Renewing…" : "Renew for 60 days"}</button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}

      <datalist id="housing-cities">{CITIES_ABROAD.map((c) => <option key={c} value={c} />)}</datalist>
      {lookingForm && <LookingForm initial={lookingForm} today={today} onCancel={() => setLookingForm(null)} onSaved={savedLooking} />}
    </div>
  );
}
