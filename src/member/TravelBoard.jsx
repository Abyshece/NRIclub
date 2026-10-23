import { useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { apiErrorMessage, isNetworkError, NETWORK_MESSAGE } from "./profile";
import { todayInGermany } from "../content/whatson";
import {
  TRAVEL_RULES, TRAVEL_RULES_VERSION, CUSTOMS_LINKS, TRAVEL_KINDS, TRAVEL_HELP, TRAVEL_HELP_KEYS, NOTE_LIMIT,
  WINDOW_DAYS, AHEAD_DAYS, CITIES_ABROAD, CITIES_INDIA, cityKey, cityFits, cityProblem, FLIGHT_PATTERN, cleanFlight, addDays,
  daysBetween, tripDates, tripTitle, isMatch, nextMonths, inMonth, travelTag,
} from "../content/travel";

// ============================================================================
// THE TRAVEL BOARD ("Flying to or from India", /travel): members our team has
// approved post trips between their city abroad and India, to find a travel
// companion or someone to carry documents or a small open item as a favour,
// and message each other about them. A member ticks the board's rules once,
// before their first post or message from here. The database enforces the
// rest (supabase/migrations/20261026000000_travel_board.sql); before that
// update the board says it's coming soon.
// focusId: a post to show first (from a notification or a /travel/<id>
// link); onFocus(id | null) changes it. onMessage(post, text) sends the
// first message to the post's author and opens Messages, or resolves to
// why it couldn't. Avatar comes from the dashboard, so it looks the same
// everywhere. The board's rules are in the Terms of Use 2026-10-23
// (section 7): a member still on the previous version (termsVersion is the
// current one) accepts them first; onReviewTerms opens the Terms screen.
// ============================================================================

const font = "'DM Sans', sans-serif";
const INK = "#37352F";
const MUTED = "#6B6A67";
const FAINT = "#9B9A97";
const MESSAGE_LIMIT = 5000;
const card = { background: "#fff", borderRadius: 14, border: "1px solid #E8E7E4", padding: "16px 18px", marginBottom: 12, fontFamily: font };
const btn = { padding: "9px 16px", minHeight: 40, borderRadius: 8, border: "none", background: INK, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, display: "inline-flex", alignItems: "center", gap: 6 };
const btnLight = { ...btn, border: "1px solid #E0E0DE", background: "#fff", color: INK };
const input = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 14, background: "#FAFAF8", outline: "none", fontFamily: font, boxSizing: "border-box", color: INK, minHeight: 42 };
const label = { display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, fontFamily: font };
const text = { fontSize: 13, color: MUTED, lineHeight: 1.55, fontFamily: font, margin: 0 };
const KIND_STYLE = {
  offer: { background: "#E3FCEF", color: "#1A7F52", border: "1px solid #B5E4CA" },
  request: { background: "#FFF3E0", color: "#C2410C", border: "1px solid #FED7AA" },
};
const NO_FILTERS = { from: "", to: "", month: "", type: "all" };

const firstName = (p) => (p.profiles?.name || "").split(" ")[0] || "the member";

// "Posted today", "Posted yesterday", "Posted 3 days ago".
function postedAgo(at) {
  const days = Math.floor((Date.now() - new Date(at).getTime()) / 86400000);
  return days <= 0 ? "Posted today" : days === 1 ? "Posted yesterday" : `Posted ${days} days ago`;
}

// A filter's cities against a post's: the same city, or the start of one of
// its names while it's being typed (cityFits).
function fitsFilters(p, f) {
  return cityFits(f.from, p.from_key || cityKey(p.from_city))
    && cityFits(f.to, p.to_key || cityKey(p.to_city))
    && (!f.month || inMonth(p, f.month))
    && (f.type === "all" || p.kind === f.type);
}

// The database's answer when a member still on the previous Terms posts or
// messages from the board, and what the board says about it.
const TERMS_NEEDED = /accept the updated Terms of Use/;
const TERMS_NOTICE = "The travel board's rules are part of our updated Terms of Use (section 7). Please accept the updated Terms to post a trip or message a member from the board.";

const byDate = (a, b) => (a.date_from < b.date_from ? -1 : a.date_from > b.date_from ? 1 : String(b.created_at).localeCompare(String(a.created_at)));

// ---------------------------------------------------------------------------
// SMALL PARTS
// ---------------------------------------------------------------------------

// A window over the board: Escape (the window on top) and a tap outside
// close it (not while it is saving).
function Dialog({ id, title, onClose, busy, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || busy || e.defaultPrevented) return;
      const open = document.querySelectorAll("[role=dialog]");
      if (open[open.length - 1] !== ref.current) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 55, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", backdropFilter: "blur(2px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: wide ? 520 : 460, padding: "22px 20px", margin: "auto", boxSizing: "border-box", fontFamily: font }}>
        <h3 id={id} style={{ fontSize: 17, fontWeight: 700, color: INK, margin: "0 0 12px", fontFamily: font }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Rule({ rule, n }) {
  return (
    <>
      <strong style={{ color: INK }}>{n}. {rule.title}</strong> {rule.text}
      {rule.customs && (
        <> Check the rules of both countries: {CUSTOMS_LINKS.map((l, i) => (
          <span key={l.href}>{i ? " · " : ""}<a href={l.href} target="_blank" rel="noopener noreferrer" style={{ color: "#3D5A9F", fontWeight: 600 }}>{l.label}</a></span>
        ))}.</>
      )}
    </>
  );
}

function HelpChips({ help, kind }) {
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
      {TRAVEL_HELP_KEYS.filter((h) => (help || []).includes(h)).map((h) => (
        <span key={h} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, border: "1px solid #E0E0DE", background: "#FAFAF8", color: "#5F5E5B", fontFamily: font, whiteSpace: "nowrap" }}>
          {kind === "offer" ? TRAVEL_HELP[h].offer : TRAVEL_HELP[h].short}
        </span>
      ))}
    </span>
  );
}

// One post. mine: the member's own (Edit, Delete); otherwise Message and
// Report. compact: a match under one of the member's own posts.
function TripCard({ post: p, mine, compact, highlight, reported, onEdit, onDelete, onMessage, onReport, openMember, Avatar }) {
  const person = p.profiles || { name: "NRIClub member", unlisted: true };
  const kind = TRAVEL_KINDS[p.kind] || TRAVEL_KINDS.offer;
  return (
    <article style={{ ...card, ...(compact ? { padding: "12px 14px", marginBottom: 8, background: "#FCFCFB" } : {}), ...(highlight ? { border: "2px solid #37352F" } : {}) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.04em", textTransform: "uppercase", ...KIND_STYLE[p.kind] }}>{kind.badge}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{tripDates(p.date_from, p.date_to)}</span>
        {p.flight && <span style={{ fontSize: 12, color: MUTED }}>✈️ {p.flight}</span>}
      </div>
      <h4 style={{ fontSize: compact ? 15 : 17, fontWeight: 700, color: INK, margin: "0 0 8px", overflowWrap: "anywhere", fontFamily: font }}>{p.from_city} → {p.to_city}</h4>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: p.note ? 8 : 10 }}>
        <span style={{ fontSize: 12, color: MUTED }}>{p.kind === "offer" ? "Can help with:" : "Needs:"}</span>
        <HelpChips help={p.help} kind={p.kind} />
      </div>
      {p.note && !compact && <p style={{ ...text, color: INK, whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginBottom: 10 }}>{p.note}</p>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", paddingTop: 10, borderTop: "1px solid #F0EFED" }}>
        {mine ? (
          <span style={{ fontSize: 12, color: FAINT }}>Your post · {postedAgo(p.created_at)}</span>
        ) : (
          <button type="button" onClick={() => !person.unlisted && openMember?.(p.user_id)} disabled={person.unlisted}
            style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, background: "none", border: "none", padding: 0, cursor: person.unlisted ? "default" : "pointer", textAlign: "left", fontFamily: font }}>
            <Avatar name={person.name} size={26} url={person.avatar_url} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person.name}</span>
              <span style={{ display: "block", fontSize: 11, color: FAINT }}>{postedAgo(p.created_at)}</span>
            </span>
          </button>
        )}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {mine ? (<>
            <button type="button" onClick={() => onEdit(p)} style={{ ...btnLight, padding: "6px 12px", minHeight: 36 }}>Edit</button>
            <button type="button" onClick={() => onDelete(p)} style={{ ...btnLight, padding: "6px 12px", minHeight: 36, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626" }}>Delete</button>
          </>) : (<>
            {!person.unlisted && <button type="button" onClick={() => onMessage(p)} style={{ ...btn, padding: "6px 14px", minHeight: 36 }}>Message</button>}
            {!reported && <button type="button" onClick={() => onReport(p)} aria-label={`Report the post ${p.from_city} to ${p.to_city}`} title="Report"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#8F8E8A", padding: 8, display: "flex", fontFamily: font, fontSize: 12 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></svg>
            </button>}
          </>)}
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// THE RULES, TICKED ONCE
// ---------------------------------------------------------------------------
function RulesChecklist({ onCancel, onAccepted }) {
  const [ticked, setTicked] = useState(() => TRAVEL_RULES.map(() => false));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const all = ticked.every(Boolean);
  const accept = async () => {
    if (!all || busy) return;
    setBusy(true);
    setError("");
    try {
      const status = await api.acceptTravelRules(TRAVEL_RULES_VERSION);
      setBusy(false);
      onAccepted(status);
    } catch (e) {
      setBusy(false);
      setError(/42501/.test(e?.message || "") ? "Only members our team has approved can use the travel board."
        : apiErrorMessage(e, "That didn't work. Please try again."));
    }
  };
  return (
    <Dialog id="travel-rules-title" title="Before you use the travel board" onClose={onCancel} busy={busy} wide>
      <p style={{ ...text, marginBottom: 14 }}>Please read each rule and tick it. You only do this once.</p>
      {TRAVEL_RULES.map((r, i) => (
        <label key={r.title} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 8, border: `1px solid ${ticked[i] ? INK : "#E8E7E4"}`, background: ticked[i] ? "#F7F7F5" : "#fff", marginBottom: 8, cursor: "pointer", fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
          <input type="checkbox" checked={ticked[i]} autoFocus={i === 0} onChange={(e) => { const on = e.target.checked; setTicked((t) => t.map((x, j) => (j === i ? on : x))); setError(""); }}
            style={{ marginTop: 3, flexShrink: 0, width: 16, height: 16 }} />
          <span><Rule rule={r} n={i + 1} /></span>
        </label>
      ))}
      {error && <p role="alert" style={{ ...text, color: "#B91C1C", margin: "6px 0 10px" }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 12 }}>
        <button type="button" onClick={onCancel} disabled={busy} style={btnLight}>Cancel</button>
        <button type="button" onClick={accept} disabled={busy || !all} aria-disabled={!all} style={{ ...btn, opacity: all ? 1 : 0.45, cursor: all && !busy ? "pointer" : "default" }}>
          {busy ? "Saving…" : "I agree to these rules"}
        </button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// A NEW POST, OR EDITING ONE
// ---------------------------------------------------------------------------
function TripForm({ initial, today, onCancel, onSaved, onRefused, onTerms }) {
  const editing = !!initial.id;
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setError(""); };
  const offer = f.kind === "offer";
  const latestMax = f.date_from ? [addDays(f.date_from, WINDOW_DAYS), addDays(today, AHEAD_DAYS)].sort()[0] : addDays(today, AHEAD_DAYS);
  // An edited post keeps dates that have begun (a request's window), as the
  // database does.
  const minFrom = editing && initial.date_from < today ? initial.date_from : today;

  const problem = () => {
    const from = cityProblem(f.from_city);
    if (from) return `From: ${from}`;
    const to = cityProblem(f.to_city);
    if (to) return `To: ${to}`;
    if (cityKey(f.from_city) === cityKey(f.to_city)) return "The two cities are the same. Please check where you fly from and to.";
    if (!f.date_from) return offer ? "Please choose the date of your flight." : "Please choose the earliest date.";
    if (!offer && !f.date_to) return "Please choose the latest date.";
    const to2 = offer ? f.date_from : f.date_to;
    if (to2 < f.date_from) return "The latest date is before the earliest. Please check the dates.";
    if (daysBetween(f.date_from, to2) > WINDOW_DAYS) return `The earliest and the latest date can be at most ${WINDOW_DAYS} days apart.`;
    if (to2 < today || (f.date_from < today && f.date_from !== initial.date_from)) return "That date has passed. Please choose today or a later date.";
    if (to2 > addDays(today, AHEAD_DAYS)) return "Please choose a date within the next 12 months.";
    if (offer && f.flight && !FLIGHT_PATTERN.test(cleanFlight(f.flight))) return "Please write the flight number like LH 760, or leave it empty.";
    if (!f.help.length) return offer ? "Please choose what you can help with." : "Please choose what you need.";
    if (f.note.length > NOTE_LIMIT) return `Please keep the note to ${NOTE_LIMIT} characters.`;
    return "";
  };

  const save = async () => {
    if (busy) return;
    const p = problem();
    if (p) { setError(p); return; }
    const body = {
      kind: f.kind, from_city: f.from_city.replace(/\s+/g, " ").trim(), to_city: f.to_city.replace(/\s+/g, " ").trim(),
      date_from: f.date_from, date_to: offer ? f.date_from : f.date_to, flight: offer ? cleanFlight(f.flight) : "",
      help: f.help, note: f.note.trim(),
    };
    setBusy(true);
    try {
      const saved = editing ? await api.updateTravelPost(initial.id, body) : await api.createTravelPost(body);
      setBusy(false);
      onSaved(saved, editing);
    } catch (e) {
      // Refused by the database's rules for who may post: the board's rules
      // to tick again (they changed), or not an approved member.
      const refused = /42501|row-level security/i.test(e?.message || "");
      const again = refused ? await onRefused() : "";
      setBusy(false);
      const said = apiErrorMessage(e, "Your post couldn't be saved. Please try again.");
      // Still on the previous Terms: say so, and offer them.
      if (TERMS_NEEDED.test(said)) onTerms();
      setError(again || (refused ? "Only members our team has approved can post on the travel board." : said));
    }
  };

  const title = editing ? "Edit your post" : TRAVEL_KINDS[f.kind].label;
  return (
    <Dialog id="travel-form-title" title={title} onClose={onCancel} busy={busy} wide>
      {!editing ? (
        <div role="radiogroup" aria-label="Type of post" style={{ display: "flex", gap: 6, background: "#F0EFED", padding: 4, borderRadius: 10, marginBottom: 16 }}>
          {Object.entries(TRAVEL_KINDS).map(([k, v]) => (
            <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => set("kind", k)}
              style={{ flex: 1, minHeight: 38, borderRadius: 8, border: "none", background: f.kind === k ? "#fff" : "transparent", color: f.kind === k ? INK : MUTED, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, boxShadow: f.kind === k ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}>{v.label}</button>
          ))}
        </div>
      ) : (
        <p style={{ ...text, marginBottom: 14 }}>{TRAVEL_KINDS[f.kind].label}. The type of a post can't be changed: delete it and post a new one instead.</p>
      )}
      <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div>
          <label htmlFor="travel-from" style={label}>From</label>
          <input id="travel-from" list="travel-cities" value={f.from_city} maxLength={60} autoComplete="off" autoFocus placeholder="e.g. Frankfurt"
            onChange={(e) => set("from_city", e.target.value)} style={input} />
        </div>
        <div>
          <label htmlFor="travel-to" style={label}>To</label>
          <input id="travel-to" list="travel-cities" value={f.to_city} maxLength={60} autoComplete="off" placeholder="e.g. Delhi"
            onChange={(e) => set("to_city", e.target.value)} style={input} />
        </div>
      </div>
      {offer ? (
        <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label htmlFor="travel-date" style={label}>Date of the flight</label>
            <input id="travel-date" type="date" value={f.date_from} min={minFrom} max={addDays(today, AHEAD_DAYS)}
              onChange={(e) => set("date_from", e.target.value)} style={input} />
          </div>
          <div>
            <label htmlFor="travel-flight" style={label}>Flight number (optional)</label>
            <input id="travel-flight" value={f.flight} maxLength={10} autoComplete="off" placeholder="e.g. LH 760"
              onChange={(e) => set("flight", e.target.value)} style={input} />
          </div>
        </div>
      ) : (
        <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 6 }}>
          <div>
            <label htmlFor="travel-earliest" style={label}>Earliest date</label>
            <input id="travel-earliest" type="date" value={f.date_from} min={minFrom} max={addDays(today, AHEAD_DAYS)}
              onChange={(e) => set("date_from", e.target.value)} style={input} />
          </div>
          <div>
            <label htmlFor="travel-latest" style={label}>Latest date</label>
            <input id="travel-latest" type="date" value={f.date_to} min={f.date_from || today} max={latestMax}
              onChange={(e) => set("date_to", e.target.value)} style={input} />
          </div>
        </div>
      )}
      {!offer && <p style={{ ...text, fontSize: 12, marginBottom: 14 }}>Any day in this window works for you (at most {WINDOW_DAYS} days).</p>}
      <fieldset style={{ border: "none", padding: 0, margin: "0 0 14px" }}>
        <legend style={label}>{TRAVEL_KINDS[f.kind].helpLabel}</legend>
        {TRAVEL_HELP_KEYS.map((h) => (
          <label key={h} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 36, fontSize: 14, color: INK, cursor: "pointer", fontFamily: font }}>
            <input type="checkbox" checked={f.help.includes(h)} style={{ width: 16, height: 16 }}
              onChange={(e) => set("help", e.target.checked ? [...f.help, h] : f.help.filter((x) => x !== h))} />
            {TRAVEL_HELP[h][f.kind]}
          </label>
        ))}
      </fieldset>
      <label htmlFor="travel-note" style={label}>A short note</label>
      <textarea id="travel-note" value={f.note} maxLength={NOTE_LIMIT} onChange={(e) => set("note", e.target.value)}
        placeholder={offer ? "e.g. Happy to help an older passenger through the transfer." : "e.g. My mother flies alone for the first time and would like company."}
        style={{ ...input, minHeight: 80, resize: "vertical" }} />
      <p style={{ ...text, fontSize: 11, textAlign: "right", margin: "2px 0 10px" }}>{f.note.length} / {NOTE_LIMIT}</p>
      <p role="note" style={{ ...text, fontSize: 12, background: "#FFF8EC", border: "1px solid #FDE2B8", borderRadius: 8, padding: "8px 10px", marginBottom: 12, color: "#7C4A03" }}>
        Favours only: no payment of any kind. Documents and small open items only, checked in person before the trip. No sealed parcels.
      </p>
      {error && <p role="alert" style={{ ...text, color: "#B91C1C", marginBottom: 10 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" onClick={onCancel} disabled={busy} style={btnLight}>Cancel</button>
        <button type="button" onClick={save} disabled={busy} style={btn}>{busy ? "Saving…" : editing ? "Save" : "Post"}</button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// THE FIRST MESSAGE TO A POST'S AUTHOR
// ---------------------------------------------------------------------------
function MessageDialog({ post, onCancel, onSend }) {
  const tag = travelTag(post);
  const [value, setValue] = useState(`Hi ${firstName(post)}, I saw your post on the travel board. `);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async () => {
    if (busy || !value.trim()) return;
    setBusy(true);
    setError("");
    const problem = await onSend(post, `${tag}${value.trim()}`);
    setBusy(false);
    if (problem) setError(problem);
  };
  return (
    <Dialog id="travel-message-title" title={`Message ${firstName(post)}`} onClose={onCancel} busy={busy}>
      <div style={{ padding: "10px 12px", background: "#FAFAF8", border: "1px solid #EDEDEB", borderRadius: 10, marginBottom: 12 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: INK, margin: 0, overflowWrap: "anywhere" }}>{post.from_city} → {post.to_city}</p>
        <p style={{ ...text, fontSize: 12 }}>{TRAVEL_KINDS[post.kind].badge} · {tripDates(post.date_from, post.date_to)}</p>
      </div>
      <label htmlFor="travel-message" style={label}>Message</label>
      <textarea id="travel-message" value={value} autoFocus maxLength={MESSAGE_LIMIT - tag.length} onChange={(e) => { setValue(e.target.value); setError(""); }}
        style={{ ...input, minHeight: 100, resize: "vertical" }} />
      <p role="note" style={{ ...text, fontSize: 12, margin: "8px 0 12px" }}>
        Agree the details in a chat, meet in a public place to hand things over, and never send passport copies, OTPs or bank details. Favours only: no payment.
      </p>
      {error && <p role="alert" style={{ ...text, color: "#B91C1C", marginBottom: 10 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" onClick={onCancel} disabled={busy} style={btnLight}>Cancel</button>
        <button type="button" onClick={send} disabled={busy || !value.trim()} style={{ ...btn, opacity: value.trim() ? 1 : 0.45 }}>{busy ? "Sending…" : "Send message"}</button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// THE BOARD
// ---------------------------------------------------------------------------
export default function TravelBoard({ user, focusId = null, onFocus, onMessage, onReport, reportedIds, blockedIds, openMember, Avatar, termsVersion = null, onReviewTerms = null }) {
  const today = todayInGermany();
  const [state, setState] = useState("loading"); // loading | ready | missing | error
  const [loadError, setLoadError] = useState("");
  const [posts, setPosts] = useState([]);
  const [rules, setRules] = useState(null); // { version, accepted, ... }
  const [filters, setFilters] = useState(NO_FILTERS);
  const [form, setForm] = useState(null); // the post being written or edited
  const [checklist, setChecklist] = useState(null); // { then }: the rules to tick before going on
  const [messaging, setMessaging] = useState(null); // the post whose author is being messaged
  const [notice, setNotice] = useState("");
  const [termsPrompt, setTermsPrompt] = useState(false); // "accept the updated Terms first", over what it interrupts
  // Still on the previous version of the Terms (they answered "Later"): the
  // board's rules are in the new one, so it comes before them.
  const needsTerms = !!termsVersion && !!user.termsVersion && user.termsVersion !== termsVersion;
  const reviewTerms = () => {
    setTermsPrompt(false);
    if (onReviewTerms) onReviewTerms(); else window.location.reload();
  };

  // The posts and the rules come with the same database update: the rules'
  // function missing means the board isn't there yet (and the posts missing
  // too, if the rules couldn't be asked about).
  const load = async () => {
    setLoadError("");
    const [rows, status] = await Promise.allSettled([api.getTravelPosts(today), api.getTravelRulesStatus()]);
    const rowsMissing = rows.status === "fulfilled" && rows.value === null;
    if ((status.status === "fulfilled" && status.value === null) || (rowsMissing && status.status === "rejected")) {
      setState("missing");
      return;
    }
    const failed = [rows, status].find((r) => r.status === "rejected") || (rowsMissing ? { reason: null } : null);
    if (failed) {
      setLoadError(isNetworkError(failed.reason) ? NETWORK_MESSAGE : "The travel board couldn't be loaded. Please try again.");
      setState("error");
      return;
    }
    let list = rows.value;
    // The post a notification points at, if it's beyond the first 500.
    if (focusId && !list.some((p) => String(p.id) === String(focusId))) {
      try {
        const one = await api.getTravelPost(String(focusId));
        if (one) list = [...list, one];
      } catch (e) {}
    }
    setPosts(list);
    setRules(status.value);
    setState("ready");
  };
  useEffect(() => { load(); }, []);
  // A post opened from a notification may be newer than the list: load it again.
  useEffect(() => {
    if (!focusId) return;
    window.scrollTo(0, 0);
    if (state === "ready" && !posts.some((p) => String(p.id) === String(focusId))) load();
  }, [focusId]);

  // The posts still on the board (also after midnight with the page open),
  // without those of members the member blocked.
  const current = posts.filter((p) => p.date_to >= today && !blockedIds?.has(p.user_id)).sort(byDate);
  const mine = current.filter((p) => p.user_id === user.id);
  const others = current.filter((p) => p.user_id !== user.id);
  const focused = focusId ? current.find((p) => String(p.id) === String(focusId)) : null;
  // (The post opened from a notification shows above the list, not again in it.)
  const shown = others.filter((p) => fitsFilters(p, filters) && p !== focused);
  const filtering = filters.from.trim() || filters.to.trim() || filters.month || filters.type !== "all";
  const months = nextMonths(today);

  // The updated Terms first, then the rules: once both are done, straight on.
  const withRules = (then) => {
    if (needsTerms) setTermsPrompt(true);
    else if (rules?.accepted) then();
    else setChecklist({ then });
  };
  const startPost = (kind) => withRules(() => setForm({
    kind, from_city: kind === "offer" ? (user.city || "") : "", to_city: "", date_from: "", date_to: "", flight: "", help: [], note: "",
  }));
  const editPost = (p) => setForm({ ...p, flight: p.flight || "", note: p.note || "", help: [...(p.help || [])] });
  const messagePost = (p) => withRules(() => setMessaging(p));
  const reportPost = (p) => onReport?.({ type: "travel", id: p.id, userId: p.user_id, name: tripTitle(p) });
  const isReported = (p) => !!reportedIds && (reportedIds.has(p.id) || reportedIds.has(`travel:${p.id}`));

  const saved = (row, edited) => {
    const p = { ...row, profiles: { id: user.id, name: user.name, avatar_url: user.avatar_url || user.avatarUrl || "" } };
    setPosts((prev) => (edited ? prev.map((x) => (x.id === p.id ? { ...x, ...p } : x)) : [...prev, p]));
    setForm(null);
    // As the database tells them: at most 20 members, the closest dates first.
    const matches = new Set(others.filter((o) => isMatch(p, o)).map((o) => o.user_id)).size;
    setNotice(edited ? "Your post is saved."
      : matches ? `Your post is on the board, with the matching posts under it. ${matches === 1 ? "Their author gets" : matches <= 20 ? "Their authors get" : "The 20 members with the closest dates get"} a notification.`
        : "Your post is on the board. You'll get a notification when someone posts a matching trip.");
  };
  const remove = async (p) => {
    if (!confirm("Delete this post? Members won't see it any more.")) return;
    try {
      await api.deleteTravelPost(p.id);
      setPosts((prev) => prev.filter((x) => x.id !== p.id));
      setNotice("");
      if (focusId && String(focusId) === String(p.id)) onFocus?.(null);
    } catch (e) {
      alert(apiErrorMessage(e, "The post couldn't be deleted. Please try again."));
    }
  };
  // The database wants the current rules ticked (they changed since this
  // page loaded, or another tab): show them again, and say so.
  const rulesAgain = async () => {
    try {
      const s = await api.getTravelRulesStatus();
      if (s) setRules(s);
      if (s && !s.accepted) {
        setChecklist({ then: () => {} });
        return "Please read and tick the board's rules first, then try again.";
      }
    } catch (e) {}
    return "";
  };
  const sendMessage = async (p, body) => {
    const problem = await onMessage(p, body);
    if (!problem) setMessaging(null);
    if (TERMS_NEEDED.test(problem || "")) setTermsPrompt(true);
    return /rules first/.test(problem || "") ? (await rulesAgain()) || problem : problem;
  };

  const cardProps = { onEdit: editPost, onDelete: remove, onMessage: messagePost, onReport: reportPost, openMember, Avatar };
  const withMatches = (p, highlight) => {
    const matches = others.filter((o) => isMatch(p, o));
    return (
      <div key={p.id}>
        <TripCard post={p} mine highlight={highlight} {...cardProps} />
        {matches.length > 0 && (
          <div style={{ margin: "-4px 0 14px 14px", paddingLeft: 12, borderLeft: "2px solid #E8E7E4" }}>
            <p style={{ ...text, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{matches.length === 1 ? "1 matching post" : `${matches.length} matching posts`}</p>
            {matches.map((o) => <TripCard key={o.id} post={o} compact reported={isReported(o)} {...cardProps} />)}
          </div>
        )}
      </div>
    );
  };

  const header = (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: INK, fontFamily: font, margin: "0 0 4px" }}>Flying to or from India</h2>
      <p style={{ ...text, fontSize: 13 }}>Find a travel companion, for example for your parents flying alone, or a member who can carry documents or a small open item. Favours between members, never for money.</p>
    </div>
  );

  if (state === "loading") {
    return <div style={{ maxWidth: 700, margin: "0 auto" }}>{header}<p role="status" style={{ ...card, ...text, textAlign: "center", padding: 32 }}>Loading the travel board…</p></div>;
  }
  if (state === "missing") {
    return (
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        {header}
        <div style={{ ...card, textAlign: "center", padding: "32px 20px" }}>
          <p style={{ fontSize: 28, margin: "0 0 8px" }} aria-hidden="true">✈️</p>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: "0 0 6px", fontFamily: font }}>Coming soon</h3>
          <p style={text}>The travel board isn't available yet. Please check back in a few days.</p>
        </div>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        {header}
        <div role="alert" style={{ ...card, textAlign: "center", padding: "28px 20px" }}>
          <p style={{ ...text, marginBottom: 12 }}>{loadError}</p>
          <button type="button" onClick={() => { setState("loading"); load(); }} style={btnLight}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      {header}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <button type="button" onClick={() => startPost("offer")} style={btn}>✈️ {TRAVEL_KINDS.offer.label}</button>
        <button type="button" onClick={() => startPost("request")} style={btnLight}>🤝 {TRAVEL_KINDS.request.label}</button>
      </div>

      {needsTerms && (
        <section aria-labelledby="travel-terms-title" style={{ ...card, background: "#F5F8FF", border: "1px solid #D5DFF3" }}>
          <h3 id="travel-terms-title" style={{ fontSize: 14, fontWeight: 700, color: INK, margin: "0 0 4px", fontFamily: font }}>Updated Terms of Use</h3>
          <p style={text}>{TERMS_NOTICE} You can still read the board.</p>
          <button type="button" onClick={reviewTerms} style={{ ...btn, marginTop: 10 }}>Read and accept the Terms</button>
        </section>
      )}

      {/* The rules, open until the member has ticked them. */}
      <details open={!rules?.accepted} style={{ ...card, background: "#FFFDF8", border: "1px solid #F3E3C3" }}>
        <summary style={{ fontSize: 14, fontWeight: 700, color: INK, cursor: "pointer", minHeight: 24 }}>The travel board's rules{rules?.accepted ? " (you've agreed to them)" : ""}</summary>
        <ol style={{ margin: "10px 0 0", paddingLeft: 0, listStyle: "none" }}>
          {TRAVEL_RULES.map((r, i) => <li key={r.title} style={{ ...text, marginBottom: 8 }}><Rule rule={r} n={i + 1} /></li>)}
        </ol>
      </details>

      {notice && (
        <p role="status" style={{ ...text, color: "#1A7F52", background: "#E3FCEF", border: "1px solid #B5E4CA", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>{notice}</p>
      )}

      {/* The post a notification or a link points at. */}
      {focusId && (
        <section aria-labelledby="travel-focus" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <h3 id="travel-focus" style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0, fontFamily: font }}>The post you opened</h3>
            <button type="button" onClick={() => onFocus?.(null)} style={{ ...btnLight, padding: "6px 12px", minHeight: 36 }}>Show all trips</button>
          </div>
          {focused
            ? (focused.user_id === user.id ? withMatches(focused, true) : <TripCard post={focused} highlight reported={isReported(focused)} {...cardProps} />)
            : <p style={{ ...card, ...text }}>This post isn't on the board any more. It may have been deleted, or its last date has passed.</p>}
        </section>
      )}

      {mine.length > 0 && (
        <section aria-labelledby="travel-mine" style={{ marginBottom: 18 }}>
          <h3 id="travel-mine" style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px", fontFamily: font }}>Your posts</h3>
          {mine.filter((p) => !focused || p.id !== focused.id).map((p) => withMatches(p, false))}
        </section>
      )}

      {/* Filters: route, month and type. */}
      <section aria-labelledby="travel-all">
        <h3 id="travel-all" style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px", fontFamily: font }}>Trips on the board</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 8 }}>
          <div>
            <label htmlFor="travel-filter-from" style={{ ...label, fontSize: 10 }}>From</label>
            <input id="travel-filter-from" list="travel-cities" value={filters.from} autoComplete="off" placeholder="Any city"
              onChange={(e) => setFilters((x) => ({ ...x, from: e.target.value }))} style={input} />
          </div>
          <div>
            <label htmlFor="travel-filter-to" style={{ ...label, fontSize: 10 }}>To</label>
            <input id="travel-filter-to" list="travel-cities" value={filters.to} autoComplete="off" placeholder="Any city"
              onChange={(e) => setFilters((x) => ({ ...x, to: e.target.value }))} style={input} />
          </div>
          <div>
            <label htmlFor="travel-filter-month" style={{ ...label, fontSize: 10 }}>Month</label>
            <select id="travel-filter-month" value={filters.month} onChange={(e) => setFilters((x) => ({ ...x, month: e.target.value }))} style={{ ...input, cursor: "pointer" }}>
              <option value="">Any month</option>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          {[["all", "All"], ["offer", "Travelling"], ["request", "Need help"]].map(([k, v]) => (
            <button key={k} type="button" aria-pressed={filters.type === k} onClick={() => setFilters((x) => ({ ...x, type: k }))}
              style={{ padding: "7px 14px", minHeight: 36, borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: font, border: filters.type === k ? "1px solid #37352F" : "1px solid #E0E0DE", background: filters.type === k ? INK : "#fff", color: filters.type === k ? "#fff" : "#5F5E5B" }}>{v}</button>
          ))}
          {(filters.from.trim() || filters.to.trim()) && (
            <button type="button" onClick={() => setFilters((x) => ({ ...x, from: x.to, to: x.from }))} style={{ ...btnLight, padding: "6px 12px", minHeight: 36, fontWeight: 500 }}>⇄ Swap</button>
          )}
          {filtering && <button type="button" onClick={() => setFilters(NO_FILTERS)} style={{ background: "none", border: "none", color: INK, textDecoration: "underline", fontSize: 12, cursor: "pointer", padding: "8px 6px", fontFamily: font }}>Clear filters</button>}
        </div>
        {shown.map((p) => <TripCard key={p.id} post={p} highlight={false} reported={isReported(p)} {...cardProps} />)}
        {shown.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 20px", color: FAINT, fontSize: 14, background: "#fff", borderRadius: 12, border: "1px dashed #E8E7E4", fontFamily: font }}>
            {filtering ? (<>
              <p style={{ margin: 0 }}>No trips match your filters.</p>
              <button type="button" onClick={() => setFilters(NO_FILTERS)} style={{ background: "none", border: "none", color: INK, textDecoration: "underline", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 6, padding: "6px 8px", fontFamily: font }}>Clear filters</button>
            </>) : (
              <p style={{ margin: 0 }}>{others.length ? "No other trips right now." : mine.length ? "No trips from other members yet." : "No trips on the board yet."} Flying soon? Post your trip, and members flying the same way can find you.</p>
            )}
          </div>
        )}
      </section>

      <datalist id="travel-cities">
        {[...CITIES_ABROAD, ...CITIES_INDIA].map((c) => <option key={c} value={c} />)}
      </datalist>

      {form && <TripForm initial={form} today={today} onCancel={() => setForm(null)} onSaved={saved} onRefused={rulesAgain} onTerms={() => setTermsPrompt(true)} />}
      {messaging && <MessageDialog post={messaging} onCancel={() => setMessaging(null)} onSend={sendMessage} />}
      {/* Last, so it shows over the form or message it interrupts. */}
      {checklist && (
        <RulesChecklist onCancel={() => setChecklist(null)}
          onAccepted={(status) => { const then = checklist.then; setRules(status); setChecklist(null); then(); }} />
      )}
      {termsPrompt && (
        <Dialog id="travel-terms-dialog" title="Please accept the updated Terms of Use" onClose={() => setTermsPrompt(false)}>
          <p style={{ ...text, marginBottom: 16 }}>{TERMS_NOTICE}</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" onClick={() => setTermsPrompt(false)} style={btnLight}>Cancel</button>
            <button type="button" onClick={reviewTerms} style={btn}>Read and accept the Terms</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
