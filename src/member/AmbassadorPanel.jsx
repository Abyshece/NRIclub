import { lazy, Suspense, useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { apiErrorMessage, isNetworkError, NETWORK_MESSAGE } from "./profile";
import { todayInGermany } from "../content/whatson";
import {
  AMBASSADOR_AGREEMENT, AMBASSADOR_AGREEMENT_VERSION, AMBASSADOR_GUIDELINES, GROUP_DESCRIPTION, HOSTED_LABEL, welcomeMessage,
} from "../content/ambassador";
import { CONTACT_EMAIL } from "../content/legal/doc";
import { HostedBadge, sameCity } from "./ambassadorBits";

const AmbassadorPrint = lazy(() => import("./AmbassadorPrint"));

// ============================================================================
// THE AMBASSADOR PANEL (/ambassador): a city ambassador's tools for their own
// city. They accept the ambassador agreement once (per version) first. Then:
// the city at a glance, newcomers to welcome, questions still waiting for an
// answer, the city group's description and starter post, their meetups,
// flagging problems to our team, and the print toolkit; and stepping down.
// The database decides who may do what (only the city's ambassador, able to
// take part, with the agreement accepted:
// supabase/migrations/20261027000000_ambassador_panel.sql); before that
// update the panel says it's coming soon.
// From the dashboard: onMessage(memberId, text) sends a first message and
// opens the conversation, or resolves to why it couldn't; openQuestion(id),
// openGroup(groupId), openMember(id); onFlag(target) opens "Flag to the team"
// (the report dialog); events: the dashboard's events (for the member's own
// meetups); onCreateMeetup() opens Host Event for the city with the mark on;
// onHosted(eventId, on) after the mark changed; onPinned(groupId, postId);
// onStatus(status) whenever the status is (re)loaded; onSteppedDown(city);
// onApply() opens the application form. Avatar comes from the dashboard.
// ============================================================================

const font = "'DM Sans', sans-serif";
const INK = "#37352F";
const MUTED = "#6B6A67";
const FAINT = "#9B9A97";
const INDIGO = "#000080";
const card = { background: "#fff", borderRadius: 14, border: "1px solid #E8E7E4", padding: "18px 18px", marginBottom: 16, fontFamily: font, minWidth: 0 };
const btn = { padding: "8px 14px", minHeight: 40, borderRadius: 8, border: "none", background: INK, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" };
const btnLight = { ...btn, border: "1px solid #E0E0DE", background: "#fff", color: INK };
const btnSmall = { padding: "6px 12px", minHeight: 36 };
const text = { fontSize: 13, color: MUTED, lineHeight: 1.55, fontFamily: font, margin: 0 };
const h3 = { fontSize: 16, fontWeight: 700, color: INK, margin: "0 0 4px", fontFamily: font };
const label = { display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, fontFamily: font };
const flagBtn = { background: "none", border: "none", cursor: "pointer", color: "#8F8E8A", padding: 8, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontFamily: font, minHeight: 36 };

const SECTIONS = [
  ["amb-overview", "Overview"], ["amb-newcomers", "Newcomers"], ["amb-questions", "Questions"],
  ["amb-group", "Group"], ["amb-meetups", "Meetups"], ["amb-toolkit", "Toolkit"],
];

const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";

// "today", "yesterday", "3 days ago".
function daysAgo(at) {
  const days = Math.floor((Date.now() - new Date(at).getTime()) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

// "Sat 14 Nov" for an event's date ("2026-11-14").
function dayLabel(date) {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

const FlagIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></svg>
);

// A window over the panel: Escape and a tap outside close it (not while busy).
function Dialog({ id, title, onClose, busy, children }) {
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
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, padding: "22px 20px", margin: "auto", boxSizing: "border-box", fontFamily: font }}>
        <h3 id={id} style={{ fontSize: 17, fontWeight: 700, color: INK, margin: "0 0 12px", fontFamily: font }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Stat({ value, label: name, note }) {
  return (
    <div style={{ background: "#FAFAF8", border: "1px solid #EDEDEB", borderRadius: 10, padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: INK, fontVariantNumeric: "tabular-nums" }}>{value ?? "–"}</div>
      <div style={{ fontSize: 12, color: MUTED }}>{name}</div>
      {note && <div style={{ fontSize: 11, color: "#C2410C", marginTop: 2 }}>{note}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE AGREEMENT, ACCEPTED ONCE PER VERSION
// ---------------------------------------------------------------------------
function Agreement({ city, onAccepted, onLater }) {
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const accept = async () => {
    if (!ticked || busy) return;
    setBusy(true);
    setError("");
    try {
      const status = await api.acceptAmbassadorAgreement(AMBASSADOR_AGREEMENT_VERSION);
      setBusy(false);
      onAccepted(status);
    } catch (e) {
      setBusy(false);
      setError(/42501/.test(e?.message || "") ? "Only a city ambassador who can take part on NRIClub can accept the agreement."
        : apiErrorMessage(e, "That didn't work. Please try again."));
    }
  };
  return (
    <section aria-labelledby="amb-agreement-title" style={card}>
      <h3 id="amb-agreement-title" style={h3}>{AMBASSADOR_AGREEMENT.title}</h3>
      <p style={{ ...text, marginBottom: 12 }}>{AMBASSADOR_AGREEMENT.intro} You're the ambassador for {city}.</p>
      <ol style={{ margin: "0 0 14px", paddingLeft: 20 }}>
        {AMBASSADOR_AGREEMENT.points.map((p) => (
          <li key={p.title} style={{ ...text, marginBottom: 8 }}><strong style={{ color: INK }}>{p.title}</strong> {p.text}</li>
        ))}
      </ol>
      <p style={{ ...text, fontSize: 12, marginBottom: 12 }}>Version {AMBASSADOR_AGREEMENT_VERSION}. We keep when you accepted it (Privacy Policy, section 2).</p>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 8, border: `1px solid ${ticked ? INK : "#E8E7E4"}`, background: ticked ? "#F7F7F5" : "#fff", cursor: "pointer", fontSize: 13, color: INK, lineHeight: 1.5, marginBottom: 12 }}>
        <input type="checkbox" checked={ticked} onChange={(e) => { setTicked(e.target.checked); setError(""); }} style={{ marginTop: 3, flexShrink: 0, width: 16, height: 16 }} />
        <span>{AMBASSADOR_AGREEMENT.confirm}</span>
      </label>
      {error && <p role="alert" style={{ ...text, color: "#B91C1C", marginBottom: 10 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={accept} disabled={busy || !ticked} aria-disabled={!ticked} style={{ ...btn, opacity: ticked ? 1 : 0.45, cursor: ticked && !busy ? "pointer" : "default" }}>
          {busy ? "Saving…" : AMBASSADOR_AGREEMENT.submit}
        </button>
        <button type="button" onClick={onLater} disabled={busy} style={btnLight}>Not now</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// THE WELCOME MESSAGE
// ---------------------------------------------------------------------------
function WelcomeDialog({ member, city, onCancel, onSend }) {
  const [value, setValue] = useState(() => welcomeMessage({ firstName: firstName(member.name), city }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async () => {
    if (busy || !value.trim()) return;
    setBusy(true);
    setError("");
    const problem = await onSend(member, value.trim());
    setBusy(false);
    if (problem) setError(problem);
  };
  return (
    <Dialog id="amb-welcome-title" title={`Welcome ${firstName(member.name) || "them"}`} onClose={onCancel} busy={busy}>
      <label htmlFor="amb-welcome-message" style={label}>Message</label>
      <textarea id="amb-welcome-message" value={value} autoFocus maxLength={5000} onChange={(e) => { setValue(e.target.value); setError(""); }}
        style={{ width: "100%", minHeight: 120, padding: "10px 12px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 14, background: "#FAFAF8", outline: "none", fontFamily: font, boxSizing: "border-box", color: INK, resize: "vertical" }} />
      <p style={{ ...text, fontSize: 12, margin: "8px 0 12px" }}>Change it as you like. It goes as an ordinary message from you, and the conversation opens in Messages. Once it's sent, we mark them as welcomed by you.</p>
      {error && <p role="alert" style={{ ...text, color: "#B91C1C", marginBottom: 10 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" onClick={onCancel} disabled={busy} style={btnLight}>Cancel</button>
        <button type="button" onClick={send} disabled={busy || !value.trim()} style={{ ...btn, opacity: value.trim() ? 1 : 0.45 }}>{busy ? "Sending…" : "Send message"}</button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// THE PANEL
// ---------------------------------------------------------------------------
export default function AmbassadorPanel({ user, events = [], onMessage, openQuestion, openGroup, openMember, onFlag, onCreateMeetup,
  onHosted, onPinned, onStatus, onSteppedDown, onApply, onHome, reportedIds, Avatar }) {
  const today = todayInGermany();
  const [state, setState] = useState("loading"); // loading | missing | error | none | closed | agreement | ready
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState(null);
  const [overview, setOverview] = useState(null);
  const [newcomers, setNewcomers] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [groupPosts, setGroupPosts] = useState([]);
  const [onlyNotWelcomed, setOnlyNotWelcomed] = useState(false);
  const [busy, setBusy] = useState(""); // what is being saved ("welcome:<id>", "pin:<id>", ...)
  const [notice, setNotice] = useState(null); // { text, tone }
  const [welcoming, setWelcoming] = useState(null); // the newcomer being welcomed
  const [description, setDescription] = useState(null); // the group description being edited (null: as saved)
  const [printing, setPrinting] = useState(null); // "poster" | "stickers"
  const [steppingDown, setSteppingDown] = useState(false);
  const city = status?.city || "";

  const say = (textValue, tone = "ok") => setNotice({ text: textValue, tone });
  // An action the database refused: a refusal of who they are (no longer
  // the ambassador, can't take part) loads the status again, which shows why.
  const failed = (e, fallback) => {
    if (/42501/.test(e?.message || "")) { load(); return; }
    if (/ambassador agreement first/.test(e?.message || "")) { load(); return; }
    say(apiErrorMessage(e, fallback), "error");
  };

  const loadPanel = async (s) => {
    const [o, n, q] = await Promise.all([api.getAmbassadorOverview(), api.getAmbassadorNewMembers(30), api.getAmbassadorOpenQuestions()]);
    setOverview(o);
    setNewcomers(n);
    setQuestions(q);
    setDescription(null);
    const groupId = o?.group?.id || s?.group_id;
    if (groupId) api.getPosts(20, groupId).then((rows) => setGroupPosts(rows || [])).catch(() => setGroupPosts([]));
    else setGroupPosts([]);
  };

  const load = async () => {
    setLoadError("");
    let s;
    try {
      s = await api.getAmbassadorStatus();
    } catch (e) {
      setLoadError(isNetworkError(e) ? NETWORK_MESSAGE : "The ambassador panel couldn't be loaded. Please try again.");
      setState("error");
      return;
    }
    setStatus(s);
    onStatus?.(s);
    if (s === null) { setState("missing"); return; }
    if (!s.city) { setState("none"); return; }
    if (!s.can_take_part) { setState("closed"); return; }
    if (!s.accepted) { setState("agreement"); return; }
    try {
      await loadPanel(s);
      setState("ready");
    } catch (e) {
      if (api.panelMissing(e)) { setState("missing"); return; }
      if (/42501|ambassador agreement first/.test(e?.message || "")) {
        // The role or the agreement changed since the status was read.
        setState(/42501/.test(e?.message || "") ? "closed" : "agreement");
        return;
      }
      setLoadError(isNetworkError(e) ? NETWORK_MESSAGE : "The ambassador panel couldn't be loaded. Please try again.");
      setState("error");
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // --- newcomers ---
  const setWelcomed = (memberId, welcomed) => setNewcomers((prev) => prev.map((m) => (m.id === memberId ? { ...m, welcomed } : m)));
  const mark = async (m, on) => {
    setBusy(`welcome:${m.id}`);
    try {
      const now = await api.markAmbassadorWelcomed(m.id, on);
      setWelcomed(m.id, !!now);
      setOverview((o) => (o ? { ...o, welcomed_30d: Math.max(0, (Number(o.welcomed_30d) || 0) + (now ? 1 : -1)) } : o));
      say(now ? `${m.name} is marked as welcomed by you.` : `${m.name} isn't marked as welcomed any more.`);
    } catch (e) {
      failed(e, "That didn't work. Please try again.");
    }
    setBusy("");
  };
  const sendWelcome = async (m, body) => {
    const problem = await onMessage(m.id, body);
    if (problem) return problem;
    // The conversation is open in Messages now; mark the welcome too.
    api.markAmbassadorWelcomed(m.id, true).catch(() => {});
    return "";
  };

  // --- the group ---
  const group = overview?.group || null;
  const pinned = group?.pinned_post || null;
  const savedDescription = group?.description || "";
  const draft = description ?? savedDescription;
  const saveDescription = async () => {
    const clean = draft.trim();
    if (clean.length < GROUP_DESCRIPTION.min) { say(`Please write at least ${GROUP_DESCRIPTION.min} characters.`, "error"); return; }
    setBusy("description");
    try {
      const saved = await api.ambassadorUpdateGroup(clean);
      setOverview((o) => (o ? { ...o, group: { ...o.group, description: saved?.description ?? clean } } : o));
      setDescription(null);
      say("The group's description is saved. Members see it now.");
    } catch (e) {
      failed(e, "The description couldn't be saved. Please try again.");
    }
    setBusy("");
  };
  const pin = async (post) => {
    if (!group) return;
    setBusy(`pin:${post?.id || "none"}`);
    try {
      await api.pinGroupPost(group.id, post ? post.id : null);
      setOverview((o) => (o ? { ...o, group: { ...o.group, pinned_post: post ? { id: post.id, content: (post.content || "").slice(0, 300), created_at: post.created_at, author: post.profiles?.unlisted ? null : post.profiles?.name } : null } } : o));
      onPinned?.(group.id, post ? post.id : null);
      say(post ? "Pinned. It shows first in the group." : "Unpinned.");
    } catch (e) {
      failed(e, "That didn't work. Please try again.");
    }
    setBusy("");
  };

  // --- meetups ---
  const myMeetups = events
    .filter((e) => e.organizerId === user.id && !String(e.id).startsWith("e_") && /^\d{4}-\d{2}-\d{2}$/.test(e.date || "") && e.date >= today && sameCity(e.city, city))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const setHosted = async (e, on) => {
    setBusy(`meetup:${e.id}`);
    try {
      const now = await api.setEventAmbassadorHosted(e.id, on);
      onHosted?.(e.id, !!now);
      say(now ? `"${e.title}" is marked "${HOSTED_LABEL}".` : `"${e.title}" isn't marked any more.`);
    } catch (err) {
      failed(err, "That didn't work. Please try again.");
    }
    setBusy("");
  };

  // --- stepping down ---
  const stepDown = async () => {
    setBusy("step-down");
    try {
      const was = await api.ambassadorStepDown();
      setBusy("");
      setSteppingDown(false);
      onSteppedDown?.(was || city);
    } catch (e) {
      setBusy("");
      setSteppingDown(false);
      failed(e, "That didn't work. Please try again, or write to us.");
    }
  };

  const isReported = (type, id) => !!reportedIds && (reportedIds.has(id) || reportedIds.has(`${type}:${id}`));
  const flag = (target) => onFlag?.({ ...target, flag: true });

  const header = (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: INK, fontFamily: font, margin: "0 0 4px" }}>Ambassador panel</h2>
      <p style={{ ...text, fontSize: 13 }}>
        {city ? <>Your tools as the ambassador for <strong style={{ color: INDIGO }}>{city}</strong>. Thank you for looking after the city's members.</> : "Tools for NRIClub's city ambassadors."}
      </p>
    </div>
  );
  const wrap = (children) => <div style={{ maxWidth: 700, margin: "0 auto" }}>{header}{children}</div>;
  const message = (title, body, action = null) => wrap(
    <div style={{ ...card, textAlign: "center", padding: "30px 20px" }}>
      <h3 style={{ ...h3, marginBottom: 6 }}>{title}</h3>
      <p style={text}>{body}</p>
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>,
  );

  if (state === "loading") return wrap(<p role="status" style={{ ...card, ...text, textAlign: "center", padding: 32 }}>Loading the ambassador panel…</p>);
  if (state === "missing") return message("Coming soon", "The ambassador panel isn't available yet. Please check back in a few days.");
  if (state === "error") {
    return wrap(
      <div role="alert" style={{ ...card, textAlign: "center", padding: "28px 20px" }}>
        <p style={{ ...text, marginBottom: 12 }}>{loadError}</p>
        <button type="button" onClick={() => { setState("loading"); load(); }} style={btnLight}>Try again</button>
      </div>,
    );
  }
  if (state === "none") {
    return message("You aren't a city ambassador", "This panel is for NRIClub's city ambassadors. They welcome newcomers, look after their city's group and host meetups now and then.",
      onApply ? <button type="button" onClick={onApply} style={btn}>Become a city ambassador</button> : null);
  }
  if (state === "closed") {
    return message("The panel is closed for now", `Your account can't take part on NRIClub right now, so you can't use the ambassador panel. Questions? Write to ${CONTACT_EMAIL}.`);
  }
  if (state === "agreement") {
    return wrap(<Agreement city={city} onLater={onHome} onAccepted={(s) => { setStatus(s); onStatus?.(s); setState("loading"); loadPanel(s).then(() => setState("ready")).catch(() => load()); }} />);
  }

  const shownNewcomers = newcomers.filter((m) => !onlyNotWelcomed || !m.welcomed);
  const otherPosts = groupPosts.filter((p) => p.id !== pinned?.id).slice(0, 5);
  const descriptionLength = draft.trim().length;

  return wrap(
    <>
      <nav aria-label="Sections of the panel" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {SECTIONS.map(([id, name]) => (
          <button key={id} type="button" onClick={() => go(id)} style={{ padding: "6px 12px", minHeight: 36, borderRadius: 18, border: "1px solid #E0E0DE", background: "#fff", color: "#5F5E5B", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>{name}</button>
        ))}
      </nav>

      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} style={{ ...text, color: notice.tone === "error" ? "#B91C1C" : "#1A7F52", background: notice.tone === "error" ? "#FEF2F2" : "#E3FCEF", border: `1px solid ${notice.tone === "error" ? "#FECACA" : "#B5E4CA"}`, borderRadius: 10, padding: "10px 12px", marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: "0 4px", fontSize: 16, lineHeight: 1 }}>×</button>
        </p>
      )}

      {/* 1. The city at a glance */}
      <section id="amb-overview" aria-labelledby="amb-overview-title" style={{ ...card, scrollMarginTop: 80 }}>
        <h3 id="amb-overview-title" style={h3}>{group ? group.name : `Indians in ${city}`}</h3>
        {!group && <p style={{ ...text, marginBottom: 10 }}>Your city has no group on NRIClub yet. Write to {CONTACT_EMAIL} and our team will set one up.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 8, margin: "12px 0" }}>
          <Stat value={group ? group.members : 0} label="members in the group" />
          <Stat value={overview?.new_7d} label="new this week" />
          <Stat value={overview?.new_30d} label="new in 30 days" note={overview?.new_30d ? `${overview.welcomed_30d || 0} welcomed by you` : null} />
          <Stat value={overview?.events_upcoming} label="upcoming events" />
          <Stat value={overview?.open_questions} label="open questions" note={overview?.unanswered ? `${overview.unanswered} with no answer yet` : null} />
        </div>
        <p style={label}>Starter post</p>
        {pinned ? (
          <div style={{ background: "#FAFAF8", border: "1px solid #EDEDEB", borderRadius: 10, padding: "10px 12px" }}>
            <p style={{ ...text, color: INK, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>📌 {pinned.content}</p>
            <p style={{ ...text, fontSize: 12, marginTop: 4 }}>{pinned.author || api.UNLISTED_NAME} · {daysAgo(pinned.created_at)}</p>
          </div>
        ) : <p style={text}>No starter post is pinned yet. Pin one under Group, below.</p>}
        {(overview?.events || []).length > 0 && (
          <>
            <p style={{ ...label, marginTop: 14 }}>Next events in {city}</p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {overview.events.map((e) => (
                <li key={e.id} style={{ ...text, color: INK, padding: "6px 0", borderTop: "1px solid #F0EFED", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>{e.title}</span>
                  <span style={{ color: MUTED }}>{dayLabel(e.date)}</span>
                  {e.ambassador_hosted && <HostedBadge />}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* 2. Welcome newcomers */}
      <section id="amb-newcomers" aria-labelledby="amb-newcomers-title" style={{ ...card, scrollMarginTop: 80 }}>
        <h3 id="amb-newcomers-title" style={h3}>Welcome newcomers</h3>
        <p style={{ ...text, marginBottom: 10 }}>Members who joined {group ? group.name : "your city's group"} in the last 30 days. Say hello with a message, or mark them as welcomed if you've met them another way. Only you see who you've welcomed.</p>
        {newcomers.length > 0 && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: INK, cursor: "pointer", marginBottom: 8, minHeight: 36 }}>
            <input type="checkbox" checked={onlyNotWelcomed} onChange={(e) => setOnlyNotWelcomed(e.target.checked)} style={{ width: 16, height: 16 }} />
            Only those not welcomed yet
          </label>
        )}
        {shownNewcomers.map((m) => (
          <div key={m.id} data-newcomer={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid #F0EFED", flexWrap: "wrap" }}>
            <button type="button" onClick={() => openMember?.(m.id)} style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 180px", minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: font }}>
              <Avatar name={m.name} size={36} url={m.avatar_url} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                <span style={{ display: "block", fontSize: 12, color: FAINT }}>Joined {daysAgo(m.joined_at)}</span>
              </span>
            </button>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {m.welcomed ? (<>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#1A7F52" }}>✓ Welcomed by you</span>
                <button type="button" onClick={() => mark(m, false)} disabled={busy === `welcome:${m.id}`} style={{ ...btnLight, ...btnSmall, fontWeight: 500 }}>Undo</button>
              </>) : (<>
                <button type="button" onClick={() => setWelcoming(m)} style={{ ...btn, ...btnSmall }}>Welcome</button>
                <button type="button" onClick={() => mark(m, true)} disabled={busy === `welcome:${m.id}`} style={{ ...btnLight, ...btnSmall }}>Mark as welcomed</button>
              </>)}
              {!isReported("profile", m.id) && (
                <button type="button" onClick={() => flag({ type: "profile", id: m.id, userId: m.id, name: m.name })} aria-label={`Flag ${m.name} to the team`} title="Flag to the team" style={flagBtn}><FlagIcon /></button>
              )}
            </div>
          </div>
        ))}
        {newcomers.length === 0 && <p style={{ ...text, padding: "8px 0" }}>Nobody new in the last 30 days. When someone joins, you get a notification.</p>}
        {newcomers.length > 0 && shownNewcomers.length === 0 && <p style={{ ...text, padding: "8px 0" }}>You've welcomed everyone. 🙏</p>}
      </section>

      {/* 3. Open questions */}
      <section id="amb-questions" aria-labelledby="amb-questions-title" style={{ ...card, scrollMarginTop: 80 }}>
        <h3 id="amb-questions-title" style={h3}>Open questions</h3>
        <p style={{ ...text, marginBottom: 10 }}>Questions from members in {city} still waiting for a best answer, newest first. Answer what you know, or point the asker to someone who does.</p>
        {questions.map((q) => (
          <div key={q.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: "1px solid #F0EFED", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <button type="button" onClick={() => openQuestion?.(q.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: font, fontSize: 14, fontWeight: 600, color: INK, overflowWrap: "anywhere" }}>{q.urgent && "🚨 "}{q.title}</button>
              <p style={{ ...text, fontSize: 12 }}>
                {q.asker || api.UNLISTED_NAME} · {daysAgo(q.created_at)} · {q.answers ? (q.answers === 1 ? "1 answer, no best answer yet" : `${q.answers} answers, no best answer yet`) : <span style={{ color: "#C2410C", fontWeight: 600 }}>No answer yet</span>}
              </p>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button type="button" onClick={() => openQuestion?.(q.id)} style={{ ...btnLight, ...btnSmall }}>Open in Ask →</button>
              {!isReported("help", q.id) && (
                <button type="button" onClick={() => flag({ type: "help", id: q.id, name: q.title })} aria-label={`Flag the question "${q.title}" to the team`} title="Flag to the team" style={flagBtn}><FlagIcon /></button>
              )}
            </div>
          </div>
        ))}
        {questions.length === 0 && <p style={{ ...text, padding: "8px 0" }}>No open questions from {city} right now.</p>}
      </section>

      {/* 4. Run the city group */}
      <section id="amb-group" aria-labelledby="amb-group-title" style={{ ...card, scrollMarginTop: 80 }}>
        <h3 id="amb-group-title" style={h3}>Your city group</h3>
        {group ? (<>
          <p style={{ ...text, marginBottom: 12 }}>The description and the starter post are the first things a newcomer sees. <button type="button" onClick={() => openGroup?.(group.id)} style={{ background: "none", border: "none", padding: "6px 0", color: INK, fontWeight: 600, textDecoration: "underline", cursor: "pointer", fontFamily: font, fontSize: 13 }}>Open the group</button></p>
          <label htmlFor="amb-description" style={label}>Description</label>
          <textarea id="amb-description" value={draft} maxLength={GROUP_DESCRIPTION.max} onChange={(e) => setDescription(e.target.value)}
            style={{ width: "100%", minHeight: 96, padding: "10px 12px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 14, background: "#FAFAF8", outline: "none", fontFamily: font, boxSizing: "border-box", color: INK, resize: "vertical" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "4px 0 16px" }}>
            <span style={{ ...text, fontSize: 11, color: descriptionLength && descriptionLength < GROUP_DESCRIPTION.min ? "#B45309" : FAINT }}>{draft.length} / {GROUP_DESCRIPTION.max}</span>
            <button type="button" onClick={saveDescription} disabled={busy === "description" || draft.trim() === savedDescription.trim()} style={{ ...btn, ...btnSmall, opacity: draft.trim() === savedDescription.trim() ? 0.45 : 1 }}>{busy === "description" ? "Saving…" : "Save description"}</button>
          </div>
          <p style={label}>Starter post</p>
          {pinned ? (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap", background: "#FAFAF8", border: "1px solid #EDEDEB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
              <p style={{ ...text, color: INK, flex: "1 1 200px", minWidth: 0, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>📌 {pinned.content}</p>
              <button type="button" onClick={() => pin(null)} disabled={busy.startsWith("pin:")} style={{ ...btnLight, ...btnSmall }}>Unpin</button>
            </div>
          ) : <p style={{ ...text, marginBottom: 12 }}>Pin a post that helps newcomers find their way, for example an introduction to the group.</p>}
          {otherPosts.length > 0 && <p style={{ ...text, fontSize: 12, marginBottom: 4 }}>Recent posts in the group:</p>}
          {otherPosts.map((p) => (
            <div key={p.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid #F0EFED", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <p style={{ ...text, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.content}</p>
                <p style={{ ...text, fontSize: 11 }}>{p.profiles?.name || api.UNLISTED_NAME} · {daysAgo(p.created_at)}</p>
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button type="button" onClick={() => pin(p)} disabled={busy.startsWith("pin:")} style={{ ...btnLight, ...btnSmall }}>📌 Pin</button>
                {p.user_id !== user.id && !isReported("post", p.id) && (
                  <button type="button" onClick={() => flag({ type: "post", id: p.id, userId: p.user_id, name: p.content })} aria-label={`Flag the post "${String(p.content || "").slice(0, 40)}" to the team`} title="Flag to the team" style={flagBtn}><FlagIcon /></button>
                )}
              </div>
            </div>
          ))}
        </>) : <p style={text}>Your city has no group on NRIClub yet. Write to {CONTACT_EMAIL} and our team will set one up.</p>}
      </section>

      {/* 5. Meetups */}
      <section id="amb-meetups" aria-labelledby="amb-meetups-title" style={{ ...card, scrollMarginTop: 80 }}>
        <h3 id="amb-meetups-title" style={h3}>Meetups</h3>
        <p style={{ ...text, marginBottom: 12 }}>A chai, a walk or a festival: host a meetup in {city} and mark it "{HOSTED_LABEL}", so members know who invites them. Meetups you host are your own events, as for any member.</p>
        <button type="button" onClick={onCreateMeetup} style={{ ...btn, marginBottom: myMeetups.length ? 12 : 0 }}>+ Create a meetup</button>
        {myMeetups.map((e) => (
          <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderTop: "1px solid #F0EFED", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <p style={{ ...text, color: INK, fontWeight: 600, overflowWrap: "anywhere" }}>{e.title}</p>
              <p style={{ ...text, fontSize: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{dayLabel(e.date)}{e.ambassadorHosted && <HostedBadge />}</p>
            </div>
            <button type="button" onClick={() => setHosted(e, !e.ambassadorHosted)} disabled={busy === `meetup:${e.id}`} style={{ ...btnLight, ...btnSmall }}>
              {e.ambassadorHosted ? "Take the mark off" : "Mark as hosted by you"}
            </button>
          </div>
        ))}
      </section>

      {/* 6. Flag to the team */}
      <section aria-labelledby="amb-flag-title" style={{ ...card, background: "#F5F8FF", border: "1px solid #D5DFF3" }}>
        <h3 id="amb-flag-title" style={h3}>Flag to the team</h3>
        <p style={text}>Something wrong in {city}? Use <FlagIcon /> <strong style={{ color: INK }}>Flag to the team</strong> on a newcomer, an open question or a post above, or in the menu of a post in your group and on a question from {city} in Ask. Our team sees it first and decides. You can't remove, hide or block anything yourself.</p>
      </section>

      {/* 7. Toolkit */}
      <section id="amb-toolkit" aria-labelledby="amb-toolkit-title" style={{ ...card, scrollMarginTop: 80 }}>
        <h3 id="amb-toolkit-title" style={h3}>Toolkit</h3>
        <p style={{ ...text, marginBottom: 12 }}>A poster and stickers for your university, workplace, temple or shop, with a QR code to the {city} page (ask before you put them up).</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <button type="button" onClick={() => setPrinting("poster")} style={btnLight}>🖨️ Poster (A4)</button>
          <button type="button" onClick={() => setPrinting("stickers")} style={btnLight}>🏷️ Stickers (A4 sheet)</button>
        </div>
        <p style={label}>Ambassador guidelines</p>
        <ul style={{ margin: "0 0 12px", paddingLeft: 18 }}>
          {AMBASSADOR_GUIDELINES.map((g) => <li key={g} style={{ ...text, marginBottom: 6 }}>{g}</li>)}
        </ul>
        <p style={{ ...text, marginBottom: 16 }}>Questions? <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: INK, fontWeight: 600 }}>{CONTACT_EMAIL}</a></p>
        <div style={{ borderTop: "1px solid #F0EFED", paddingTop: 14 }}>
          <button type="button" onClick={() => setSteppingDown(true)} style={{ ...btnLight, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626" }}>Step down as ambassador</button>
        </div>
      </section>

      {welcoming && <WelcomeDialog member={welcoming} city={city} onCancel={() => setWelcoming(null)} onSend={sendWelcome} />}
      {steppingDown && (
        <Dialog id="amb-step-down-title" title={`Step down as the ambassador for ${city}?`} onClose={() => setSteppingDown(false)} busy={busy === "step-down"}>
          <p style={{ ...text, marginBottom: 16 }}>You stop being the city's ambassador straight away: the badge goes from your profile and the city's group, and your meetups lose the mark "{HOSTED_LABEL}". Our team is told. Thank you for everything you did for {city}.</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" onClick={() => setSteppingDown(false)} disabled={busy === "step-down"} style={btnLight}>Cancel</button>
            <button type="button" onClick={stepDown} disabled={busy === "step-down"} style={{ ...btn, background: "#DC2626" }}>{busy === "step-down" ? "Stepping down…" : "Step down"}</button>
          </div>
        </Dialog>
      )}
      {printing && (
        <Suspense fallback={null}>
          <AmbassadorPrint city={city} kind={printing} onClose={() => setPrinting(null)} />
        </Suspense>
      )}
    </>,
  );
}
