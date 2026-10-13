import { useEffect, useMemo, useState } from "react";
import * as api from "../supabaseApi";
import { isNetworkError, NETWORK_MESSAGE } from "./profile";

// ============================================================================
// MENTORING: members who mentor (with open times people can book) and
// members looking for a mentor. Sessions are free; after one, the member
// rates it. The database enforces the rules (20261018000000_mentoring.sql).
// Avatar comes from the dashboard, so it looks the same everywhere.
// ============================================================================

const font = "'DM Sans', sans-serif";
const INK = "#37352F";
const MUTED = "#6B6A67";
const FAINT = "#9B9A97";
const card = { background: "#fff", borderRadius: 14, border: "1px solid #E8E7E4", padding: "18px 20px", marginBottom: 16 };
const btn = { padding: "9px 16px", borderRadius: 8, border: "none", background: INK, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font };
const btnLight = { padding: "8px 14px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", color: INK, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font };
const input = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 14, background: "#FAFAF8", outline: "none", fontFamily: font, boxSizing: "border-box" };
const label = { display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, fontFamily: font };
const h3 = { fontSize: 16, fontWeight: 700, color: INK, fontFamily: font, marginBottom: 4 };

export const MENTOR_AREAS = ["Job search", "CV & LinkedIn review", "Interview practice", "Moving here", "Studying abroad", "Visas & residence", "Starting a business", "Career change"];

const listOf = (text) => [...new Set((text || "").split(",").map(t => t.trim()).filter(Boolean))].slice(0, 8);

// "Tue 15 Oct, 18:00–18:30 CEST", in the viewer's own time zone.
export function sessionTime(startsAt, minutes) {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + minutes * 60000);
  const day = start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const t = (d, zone) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", ...(zone ? { timeZoneName: "short" } : {}) });
  return `${day}, ${t(start)}–${t(end, true)}`;
}

const errorText = (e, fallback) => {
  if (isNetworkError(e)) return NETWORK_MESSAGE;
  const m = /"message"\s*:\s*"([^"]+)"/.exec(e?.message || "");
  return m && !/violates|permission|PGRST/i.test(m[1]) ? m[1] : fallback;
};

// Add to calendar: Google Calendar link and an .ics file.
const icsStamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
function calendarFor(b, other) {
  const start = new Date(b.starts_at);
  const end = new Date(start.getTime() + b.duration_min * 60000);
  const title = `Mentoring session with ${other}`;
  const details = [b.topic && `Topic: ${b.topic}`, b.meeting_link && `Video call: ${b.meeting_link}`, "Booked on NRIClub"].filter(Boolean).join("\n");
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${icsStamp(start)}/${icsStamp(end)}&details=${encodeURIComponent(details)}${b.meeting_link ? `&location=${encodeURIComponent(b.meeting_link)}` : ""}`;
  const ics = () => {
    const esc = (s) => String(s).replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
    const text = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NRIClub//Mentoring//EN", "BEGIN:VEVENT",
      `UID:${b.id}@nriclub.app`, `DTSTAMP:${icsStamp(new Date())}`, `DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(end)}`,
      `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(details)}`, ...(b.meeting_link ? [`LOCATION:${esc(b.meeting_link)}`] : []),
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url; a.download = "nriclub-mentoring.ics"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return { google, ics };
}

export function Stars({ value, size = 14, label: aria }) {
  const full = Math.round(value || 0);
  return (
    <span role="img" aria-label={aria || `${value} out of 5 stars`} style={{ color: "#E8A317", fontSize: size, letterSpacing: 1 }}>
      {"★".repeat(full)}<span style={{ color: "#DDDCD9" }}>{"★".repeat(5 - full)}</span>
    </span>
  );
}

export function RatingLine({ rating }) {
  if (!rating?.reviews) return <span style={{ fontSize: 12, color: FAINT, fontFamily: font }}>No reviews yet</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: MUTED, fontFamily: font }}>
      <Stars value={rating.rating} size={13} /> <b style={{ color: INK }}>{rating.rating.toFixed(1)}</b> ({rating.reviews} {rating.reviews === 1 ? "review" : "reviews"})
    </span>
  );
}

export const MentorBadge = () => (
  <span title="Offers free mentoring" style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, letterSpacing: "0.05em", background: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0", whiteSpace: "nowrap" }}>🤝 MENTOR</span>
);

const Chips = ({ items, onPick, selected }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
    {items.map(t => {
      const on = selected?.includes(t);
      return onPick
        ? <button key={t} type="button" onClick={() => onPick(t)} aria-pressed={!!on} style={{ fontSize: 12, padding: "4px 11px", borderRadius: 20, border: `1px solid ${on ? "#047857" : "#E0E0DE"}`, background: on ? "#ECFDF5" : "#fff", color: on ? "#047857" : "#5F5E5B", cursor: "pointer", fontFamily: font }}>{on ? "✓ " : ""}{t}</button>
        : <span key={t} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, border: "1px solid #A7F3D0", background: "#ECFDF5", color: "#047857", fontFamily: font }}>{t}</span>;
    })}
  </div>
);
export const AreaChips = ({ text, max = 8 }) => <Chips items={listOf(text).slice(0, max)} />;

// ---------------------------------------------------------------------------
// BOOKING
// ---------------------------------------------------------------------------
export function BookingModal({ mentor, onClose, onMessage, Avatar }) {
  const [slots, setSlots] = useState(null);
  const [pick, setPick] = useState(null);
  const [topic, setTopic] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState(null);
  const areas = listOf(mentor.mentorAreas);

  useEffect(() => {
    api.getMentorSlots(mentor.id).then(setSlots).catch(() => { setSlots([]); setError("Open times couldn't be loaded. Please try again."); });
  }, [mentor.id]);

  const byDay = useMemo(() => {
    const groups = [];
    (slots || []).forEach(s => {
      const day = new Date(s.starts_at).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
      const g = groups.find(x => x.day === day);
      if (g) g.slots.push(s); else groups.push({ day, slots: [s] });
    });
    return groups;
  }, [slots]);

  const book = async () => {
    if (!pick || busy) return;
    setBusy(true); setError("");
    try {
      const id = await api.bookMentorSession(pick.id, topic, note.trim());
      setBooked({ id, starts_at: pick.starts_at, duration_min: pick.duration_min, topic, meeting_link: "" });
    } catch (e) {
      setError(errorText(e, "The session couldn't be booked. Please try again."));
      if (/no longer free/i.test(e?.message || "")) api.getMentorSlots(mentor.id).then(setSlots).catch(() => {});
    }
    setBusy(false);
  };

  const first = (mentor.name || "").split(" ")[0] || "the mentor";
  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="book-title" style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "88vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #F0EFED" }}>
          <Avatar name={mentor.name} size={36} url={mentor.avatar_url} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="book-title" style={{ fontSize: 16, fontWeight: 700, color: INK, fontFamily: font }}>{booked ? "Session booked 🎉" : `Book a session with ${first}`}</h3>
            <p style={{ fontSize: 12, color: FAINT, fontFamily: font }}>Free · Times are shown in your time zone</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: FAINT, fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 20, fontFamily: font }}>
          {booked ? (() => {
            const cal = calendarFor(booked, mentor.name);
            return (
              <>
                <p style={{ fontSize: 15, color: INK, fontWeight: 600, marginBottom: 6 }}>{sessionTime(booked.starts_at, booked.duration_min)}</p>
                <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: 16 }}>{first} has been told. They'll add a video call link before the session; you'll find it under Mentoring. You can message each other now.</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a href={cal.google} target="_blank" rel="noopener noreferrer" style={{ ...btnLight, textDecoration: "none" }}>📅 Google Calendar</a>
                  <button onClick={cal.ics} style={btnLight}>Download .ics</button>
                  <button onClick={() => { onClose(); onMessage(mentor); }} style={btn}>Message {first}</button>
                </div>
              </>
            );
          })() : slots === null ? (
            <p role="status" style={{ fontSize: 13, color: FAINT }}>Loading open times…</p>
          ) : slots.length === 0 ? (
            <div>
              <p style={{ fontSize: 14, color: INK, marginBottom: 6 }}>{first} has no open times right now.</p>
              <p style={{ fontSize: 13, color: MUTED, marginBottom: 14 }}>Send a message to ask when they're free.</p>
              <button onClick={() => { onClose(); onMessage(mentor); }} style={btn}>Message {first}</button>
            </div>
          ) : (
            <>
              <div style={{ maxHeight: 260, overflow: "auto", marginBottom: 16 }}>
                {byDay.map(g => (
                  <div key={g.day} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 6 }}>{g.day}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {g.slots.map(s => {
                        const on = pick?.id === s.id;
                        return (
                          <button key={s.id} onClick={() => setPick(s)} aria-pressed={on} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${on ? INK : "#E0E0DE"}`, background: on ? INK : "#fff", color: on ? "#fff" : INK, fontSize: 13, cursor: "pointer", fontFamily: font }}>
                            {new Date(s.starts_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · {s.duration_min} min
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 12 }}>
                <label htmlFor="book-topic" style={label}>What would you like help with?</label>
                {areas.length > 0 && <div style={{ marginBottom: 8 }}><Chips items={areas} selected={[topic]} onPick={(t) => setTopic(topic === t ? "" : t)} /></div>}
                <input id="book-topic" style={input} value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Finding a job as a software engineer" />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor="book-note" style={label}>A short note for {first} (optional)</label>
                <textarea id="book-note" style={{ ...input, minHeight: 70, resize: "vertical" }} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Where you are now, and what you'd like to get out of the session" />
              </div>
              {error && <p role="alert" style={{ fontSize: 13, color: "#B91C1C", marginBottom: 10 }}>{error}</p>}
              <button onClick={book} disabled={!pick || busy} style={{ ...btn, width: "100%", padding: 12, fontSize: 14, opacity: pick && !busy ? 1 : 0.5 }}>
                {busy ? "Booking…" : pick ? `Book ${sessionTime(pick.starts_at, pick.duration_min)}` : "Pick a time"}
              </button>
              <p style={{ fontSize: 11, color: FAINT, marginTop: 8, textAlign: "center" }}>Mentoring is free. Please cancel in time if you can't make it.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MENTOR CARD (member page) with reviews
// ---------------------------------------------------------------------------
export function MentorProfileCard({ member, rating, onBook, isSelf, Avatar, me }) {
  const [reviews, setReviews] = useState(null);
  useEffect(() => {
    let gone = false;
    api.getMentorReviews(member.id).then(r => { if (!gone) setReviews(r); }).catch(() => { if (!gone) setReviews([]); });
    return () => { gone = true; };
  }, [member.id]);
  return (
    <div style={{ ...card, border: "1px solid #A7F3D0", background: "#FBFFFD" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={h3}>🤝 Free mentoring</h3>
          <RatingLine rating={rating} />
          {member.mentorAreas && <div style={{ marginTop: 10 }}><AreaChips text={member.mentorAreas} /></div>}
        </div>
        {!isSelf && <button onClick={onBook} style={btn}>Book a session</button>}
      </div>
      {reviews && reviews.length > 0 && (
        <div style={{ marginTop: 14, borderTop: "1px solid #E8F5EE", paddingTop: 10 }}>
          {reviews.slice(0, 5).map(r => (
            <div key={r.id} style={{ display: "flex", gap: 10, padding: "8px 0" }}>
              <Avatar name={r.mentee?.name || "Member"} size={28} url={r.mentee?.avatar_url} />
              <div style={{ flex: 1, minWidth: 0, fontFamily: font }}>
                <div style={{ fontSize: 12, color: MUTED, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span><b style={{ color: INK }}>{r.mentee?.name || "Member"}</b> · <Stars value={r.rating} size={12} /></span>
                  {me && r.mentee_id === me ? (
                    <button onClick={async () => { if (!confirm("Delete your review?")) return; try { await api.deleteMyReview(r.id); setReviews(prev => prev.filter(x => x.id !== r.id)); } catch (e) { alert(errorText(e, "Your review couldn't be deleted.")); } }} style={{ marginLeft: "auto", background: "none", border: "none", color: FAINT, fontSize: 11, cursor: "pointer", textDecoration: "underline", fontFamily: font }}>Delete</button>
                  ) : me && (
                    <button onClick={async () => { if (!confirm("Report this review to the NRIClub team?")) return; try { await api.reportPost(r.id, `[REVIEW] Mentor review: ${(r.comment || "").slice(0, 80)}`); alert("Thanks, the NRIClub team will look at it."); } catch (e) { alert(errorText(e, "The report couldn't be sent.")); } }} style={{ marginLeft: "auto", background: "none", border: "none", color: FAINT, fontSize: 11, cursor: "pointer", textDecoration: "underline", fontFamily: font }}>Report</button>
                  )}
                </div>
                {r.comment && <p style={{ fontSize: 13, color: INK, lineHeight: 1.5, marginTop: 2, overflowWrap: "anywhere" }}>{r.comment}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MENTORS LIST (Find → Mentors)
// ---------------------------------------------------------------------------
export function MentorsList({ user, people, ratings, onBook, openMember, Avatar }) {
  const [slots, setSlots] = useState(null);
  const [area, setArea] = useState("");
  useEffect(() => { api.getMentorSlots().then(setSlots).catch(() => setSlots([])); }, []);
  const next = useMemo(() => {
    const m = {};
    (slots || []).forEach(s => { if (!m[s.mentor_id]) m[s.mentor_id] = s; });
    return m;
  }, [slots]);
  const myCity = (user.city || (user.location || "").split(",")[0] || "").trim().toLowerCase();
  const mentors = people
    .filter(p => p.mentorOpen && p.linkedin_verified && p.id !== user.id)
    .filter(p => !area || listOf(p.mentorAreas).some(a => a.toLowerCase() === area.toLowerCase()))
    .sort((a, b) =>
      ((b.location || "").toLowerCase().startsWith(myCity) - (a.location || "").toLowerCase().startsWith(myCity))
      || (!!next[b.id] - !!next[a.id])
      || ((ratings[b.id]?.rating || 0) - (ratings[a.id]?.rating || 0)));
  return (
    <div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 14 }}>
        {["", ...MENTOR_AREAS].map(a => (
          <button key={a || "all"} onClick={() => setArea(a)} aria-pressed={area === a} style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 20, border: `1px solid ${area === a ? INK : "#E0E0DE"}`, background: area === a ? INK : "#fff", color: area === a ? "#fff" : "#5F5E5B", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>{a || "All mentors"}</button>
        ))}
      </div>
      {mentors.length === 0 ? (
        <div style={{ ...card, textAlign: "center", color: MUTED, fontSize: 14, fontFamily: font }}>
          {area ? `No mentors for "${area}" yet.` : "No mentors yet."} Know your way around? Offer mentoring under Mentoring.
        </div>
      ) : mentors.map(m => (
        <div key={m.id} style={{ ...card, display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
          <button type="button" onClick={() => openMember(m.id)} aria-label={`${m.name}'s profile`} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}><Avatar name={m.name} size={52} url={m.avatar_url} /></button>
          <div style={{ flex: 1, minWidth: 180, fontFamily: font }}>
            <button type="button" onClick={() => openMember(m.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 16, fontWeight: 700, color: INK, fontFamily: font, textAlign: "left" }}>{m.name}</button>
            <p style={{ fontSize: 13, color: MUTED }}>{[m.profession, (m.location || "").split(",")[0]].filter(Boolean).join(" · ")}</p>
            <div style={{ margin: "6px 0" }}><RatingLine rating={ratings[m.id]} /></div>
            {m.mentorAreas && <AreaChips text={m.mentorAreas} max={4} />}
            <p style={{ fontSize: 12, color: next[m.id] ? "#047857" : FAINT, marginTop: 8 }}>{slots === null ? "" : next[m.id] ? `Next free: ${sessionTime(next[m.id].starts_at, next[m.id].duration_min)}` : "No open times right now"}</p>
          </div>
          <button onClick={() => onBook(m)} style={{ ...btn, alignSelf: "center" }}>{next[m.id] ? "Book" : "Ask"}</button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MY MENTORING PAGE (/mentoring)
// ---------------------------------------------------------------------------
function SessionCard({ b, user, review, onChanged, onMessage, openMember, Avatar }) {
  const mentoring = b.mentor_id === user.id; // I'm the mentor
  const other = mentoring ? b.mentee : b.mentor;
  const otherName = other?.name || "Member";
  const end = new Date(b.starts_at).getTime() + b.duration_min * 60000;
  const past = end < Date.now();
  const cancelled = b.status === "cancelled";
  const [link, setLink] = useState(b.meeting_link || "");
  const [editing, setEditing] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const cal = calendarFor(b, otherName);

  const run = async (fn, fallback) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); await onChanged(); } catch (e) { alert(errorText(e, fallback)); }
    setBusy(false);
  };
  const cancel = () => {
    const reason = prompt(`Cancel this session with ${otherName}? You can add a short reason for them (optional).`, "");
    if (reason === null) return;
    run(() => api.cancelMentorSession(b.id, reason), "The session couldn't be cancelled. Please try again.");
  };

  return (
    <div style={{ ...card, opacity: cancelled ? 0.7 : 1 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <button type="button" onClick={() => other && openMember(other.id)} aria-label={otherName} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}><Avatar name={otherName} size={40} url={other?.avatar_url} /></button>
        <div style={{ flex: 1, minWidth: 0, fontFamily: font }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{mentoring ? `Mentoring ${otherName}` : `With ${otherName}`}</div>
          <div style={{ fontSize: 13, color: cancelled ? FAINT : INK, textDecoration: cancelled ? "line-through" : "none" }}>{sessionTime(b.starts_at, b.duration_min)}</div>
          {b.topic && <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>Topic: {b.topic}</div>}
          {b.note && mentoring && <p style={{ fontSize: 13, color: MUTED, marginTop: 4, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>“{b.note}”</p>}
          {cancelled && <p style={{ fontSize: 12, color: "#B91C1C", marginTop: 4 }}>Cancelled{b.cancelled_by === user.id ? " by you" : ` by ${otherName}`}{b.cancel_reason ? `: ${b.cancel_reason}` : ""}</p>}
        </div>
      </div>

      {!cancelled && !past && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F0EFED", fontFamily: font }}>
          {mentoring && (editing || !b.meeting_link) ? (
            <form onSubmit={(e) => { e.preventDefault(); run(async () => { await api.setSessionLink(b.id, link.trim()); setEditing(false); }, "The link couldn't be saved. It must start with https://"); }} style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <input aria-label="Video call link" style={{ ...input, padding: "8px 10px", fontSize: 13 }} value={link} maxLength={500} onChange={(e) => setLink(e.target.value)} placeholder="Video call link, e.g. https://meet.google.com/…" />
              <button type="submit" disabled={busy} style={{ ...btn, padding: "8px 12px", whiteSpace: "nowrap" }}>Save link</button>
            </form>
          ) : b.meeting_link ? (
            <p style={{ fontSize: 13, marginBottom: 10 }}>🎥 <a href={b.meeting_link} target="_blank" rel="noopener noreferrer" style={{ color: "#0B6E99", fontWeight: 600, overflowWrap: "anywhere" }}>Join the video call</a>{mentoring && <button onClick={() => setEditing(true)} style={{ marginLeft: 8, background: "none", border: "none", color: FAINT, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>change</button>}</p>
          ) : (
            <p style={{ fontSize: 12, color: FAINT, marginBottom: 10 }}>{otherName.split(" ")[0]} will add a video call link before the session.</p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => onMessage(other)} style={btnLight}>Message</button>
            <a href={cal.google} target="_blank" rel="noopener noreferrer" style={{ ...btnLight, textDecoration: "none" }}>📅 Add to calendar</a>
            <button onClick={cal.ics} style={btnLight}>.ics</button>
            <button onClick={cancel} disabled={busy} style={{ ...btnLight, color: "#B91C1C" }}>Cancel</button>
          </div>
        </div>
      )}

      {!cancelled && past && !mentoring && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F0EFED", fontFamily: font }}>
          {review ? (
            <p style={{ fontSize: 13, color: MUTED }}>Your rating: <Stars value={review.rating} />{review.comment ? ` · “${review.comment}”` : ""}</p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: INK, fontWeight: 600, marginBottom: 6 }}>How was it? Your rating helps others find good mentors.</p>
              <div role="radiogroup" aria-label="Rating" style={{ display: "flex", gap: 2, marginBottom: 8 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setStars(n)} style={{ background: "none", border: "none", fontSize: 26, cursor: "pointer", color: n <= stars ? "#E8A317" : "#DDDCD9", padding: 0, lineHeight: 1 }}>★</button>
                ))}
              </div>
              <textarea aria-label="Review" style={{ ...input, minHeight: 56, marginBottom: 8 }} value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} placeholder={`What did ${otherName.split(" ")[0]} help you with? (optional)`} />
              <button disabled={!stars || busy} onClick={() => run(() => api.reviewMentorSession(b.id, stars, comment.trim()), "Your rating couldn't be saved. Please try again.")} style={{ ...btn, opacity: stars && !busy ? 1 : 0.5 }}>Send rating</button>
            </>
          )}
        </div>
      )}
      {!cancelled && past && mentoring && <p style={{ fontSize: 12, color: FAINT, marginTop: 8, fontFamily: font }}>Done. Thank you for mentoring! 🙏</p>}
    </div>
  );
}

export function MentoringPage({ user, onUserUpdate, people, ratings, onBook, onMessage, openMember, Avatar }) {
  const [sessions, setSessions] = useState(null);
  const [myReviews, setMyReviews] = useState([]);
  const [mySlots, setMySlots] = useState([]);
  const [areas, setAreas] = useState(listOf(user.mentorAreas));
  const [customArea, setCustomArea] = useState("");
  const [needs, setNeeds] = useState(user.menteeNeeds || "");
  const [saving, setSaving] = useState("");
  const [slotForm, setSlotForm] = useState({ date: "", time: "18:00", duration: 30, weeks: 1 });
  const [slotError, setSlotError] = useState("");

  const load = async () => {
    const [s, r, sl] = await Promise.all([api.getMySessions().catch(() => null), api.getMyReviews().catch(() => []), api.getMyMentorSlots().catch(() => [])]);
    setSessions(s || []); setMyReviews(r); setMySlots(sl);
  };
  useEffect(() => { load(); }, []);

  if (!user.hasMentoring) {
    return <div style={{ maxWidth: 700, margin: "0 auto" }}><div style={card}><h3 style={h3}>Mentoring</h3><p style={{ fontSize: 14, color: MUTED, fontFamily: font }}>Mentoring is being switched on. Please check back soon.</p></div></div>;
  }

  const save = async (key, updates) => {
    setSaving(key);
    try {
      await api.updateProfile(updates);
      onUserUpdate({
        ...user,
        ...(updates.mentor_open !== undefined ? { mentorOpen: updates.mentor_open } : {}),
        ...(updates.mentor_areas !== undefined ? { mentorAreas: updates.mentor_areas } : {}),
        ...(updates.mentee_open !== undefined ? { menteeOpen: updates.mentee_open } : {}),
        ...(updates.mentee_needs !== undefined ? { menteeNeeds: updates.mentee_needs } : {}),
      });
    } catch (e) {
      alert(errorText(e, "Your change couldn't be saved. Please try again."));
    }
    setSaving("");
  };
  const toggleArea = (a) => setAreas(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a].slice(0, 8));
  const verified = user.verificationStatus === "approved";

  const addTimes = async (e) => {
    e.preventDefault();
    setSlotError("");
    const { date, time, duration, weeks } = slotForm;
    if (!date || !time) { setSlotError("Pick a date and a time."); return; }
    const first = new Date(`${date}T${time}`);
    if (isNaN(first) || first.getTime() < Date.now() + 3600000) { setSlotError("Pick a time at least an hour from now."); return; }
    const times = Array.from({ length: Number(weeks) }, (_, i) => ({ starts_at: new Date(first.getTime() + i * 7 * 86400000).toISOString(), duration_min: Number(duration) }));
    setSaving("slots");
    try { await api.addMentorSlots(times); await load(); setSlotForm(f => ({ ...f, date: "" })); }
    catch (e2) { setSlotError(/23505|duplicate/i.test(e2?.message || "") ? "You already have a time at that moment." : errorText(e2, "Those times couldn't be added. Please try again.")); }
    setSaving("");
  };
  const removeSlot = async (s) => {
    try { await api.deleteMentorSlot(s.id); setMySlots(prev => prev.filter(x => x.id !== s.id)); }
    catch (e) { alert(errorText(e, "That time couldn't be removed.")); load(); }
  };

  const now = Date.now();
  const upcoming = (sessions || []).filter(b => b.status === "booked" && new Date(b.starts_at).getTime() + b.duration_min * 60000 > now).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const past = (sessions || []).filter(b => !upcoming.includes(b)).slice(0, 20);
  const reviewFor = (id) => myReviews.find(r => r.booking_id === id);
  const toRate = past.filter(b => b.mentee_id === user.id && b.status === "booked" && !reviewFor(b.id)).length;
  const myCity = (user.city || (user.location || "").split(",")[0] || "").trim().toLowerCase();
  const seekers = people.filter(p => p.menteeOpen && p.id !== user.id).sort((a, b) => (b.location || "").toLowerCase().startsWith(myCity) - (a.location || "").toLowerCase().startsWith(myCity)).slice(0, 6);
  const freeSlots = mySlots.filter(s => !s.booked);

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: INK, fontFamily: font, marginBottom: 4 }}>Mentoring</h2>
      <p style={{ fontSize: 13, color: FAINT, fontFamily: font, marginBottom: 18 }}>Free help from Indians who've been there: job search, CVs, interviews, moving, studies. {toRate > 0 && <b style={{ color: "#B45309" }}>You have {toRate} session{toRate > 1 ? "s" : ""} to rate.</b>}</p>

      {/* Sessions */}
      <div style={{ marginBottom: 8 }}>
        <h3 style={{ ...h3, marginBottom: 10 }}>Upcoming sessions</h3>
        {sessions === null ? <p role="status" style={{ fontSize: 13, color: FAINT, fontFamily: font, marginBottom: 16 }}>Loading…</p>
          : upcoming.length === 0 ? <div style={{ ...card, fontSize: 13, color: MUTED, fontFamily: font }}>No upcoming sessions. <button onClick={() => onBook(null)} style={{ background: "none", border: "none", padding: 0, color: INK, fontWeight: 600, textDecoration: "underline", cursor: "pointer", fontFamily: font }}>Find a mentor</button></div>
          : upcoming.map(b => <SessionCard key={b.id} b={b} user={user} onChanged={load} onMessage={onMessage} openMember={openMember} Avatar={Avatar} />)}
      </div>

      {/* Looking for a mentor */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <h3 style={h3}>🌱 Looking for a mentor</h3>
            <p style={{ fontSize: 13, color: MUTED, fontFamily: font }}>Mentors can see that you're looking, and what for.</p>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, fontFamily: font, cursor: "pointer", flexShrink: 0 }}>
            <input type="checkbox" aria-label="Looking for a mentor" checked={!!user.menteeOpen} disabled={saving === "mentee"} onChange={(e) => save("mentee", { mentee_open: e.target.checked, mentee_needs: needs.trim().slice(0, 300) })} /> {user.menteeOpen ? "On" : "Off"}
          </label>
        </div>
        {user.menteeOpen && (
          <form onSubmit={(e) => { e.preventDefault(); save("needs", { mentee_needs: needs.trim().slice(0, 300) }); }} style={{ display: "flex", gap: 6, marginTop: 12 }}>
            <input aria-label="What you'd like help with" style={input} value={needs} maxLength={300} onChange={(e) => setNeeds(e.target.value)} placeholder="What you'd like help with, e.g. finding a data job in Berlin" />
            <button type="submit" disabled={saving === "needs" || needs.trim() === (user.menteeNeeds || "")} style={{ ...btn, whiteSpace: "nowrap", opacity: needs.trim() === (user.menteeNeeds || "") ? 0.5 : 1 }}>Save</button>
          </form>
        )}
        <button onClick={() => onBook(null)} style={{ ...btnLight, marginTop: 12 }}>Browse mentors</button>
      </div>

      {/* Offering mentoring */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <h3 style={h3}>🤝 Offer free mentoring</h3>
            <p style={{ fontSize: 13, color: MUTED, fontFamily: font }}>{verified ? "Share what you've learned. You choose when you're free." : "You can offer mentoring once you're verified."}</p>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, fontFamily: font, cursor: verified ? "pointer" : "default", flexShrink: 0, opacity: verified ? 1 : 0.5 }}>
            <input type="checkbox" aria-label="Offer free mentoring" checked={!!user.mentorOpen} disabled={!verified || saving === "mentor"} onChange={(e) => save("mentor", { mentor_open: e.target.checked, mentor_areas: areas.join(", ").slice(0, 300) })} /> {user.mentorOpen ? "On" : "Off"}
          </label>
        </div>
        {user.mentorOpen && (
          <>
            <div style={{ marginTop: 14 }}>
              <span style={label}>I can help with</span>
              <Chips items={[...new Set([...MENTOR_AREAS, ...areas])]} selected={areas} onPick={toggleArea} />
              <form onSubmit={(e) => { e.preventDefault(); const a = customArea.trim().slice(0, 40); if (a) { setAreas(prev => [...new Set([...prev, a])].slice(0, 8)); setCustomArea(""); } }} style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input aria-label="Another area" style={{ ...input, padding: "8px 10px", fontSize: 13 }} value={customArea} maxLength={40} onChange={(e) => setCustomArea(e.target.value)} placeholder="Another area, e.g. SAP careers" />
                <button type="submit" style={{ ...btnLight, whiteSpace: "nowrap" }}>Add</button>
              </form>
              <button disabled={saving === "areas" || areas.join(", ") === listOf(user.mentorAreas).join(", ")} onClick={() => save("areas", { mentor_areas: areas.join(", ").slice(0, 300) })} style={{ ...btn, marginTop: 10, opacity: areas.join(", ") === listOf(user.mentorAreas).join(", ") ? 0.5 : 1 }}>Save areas</button>
            </div>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #F0EFED" }}>
              <span style={label}>When you're free ({freeSlots.length} open {freeSlots.length === 1 ? "time" : "times"})</span>
              <form onSubmit={addTimes} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, alignItems: "end" }}>
                <div><label htmlFor="slot-date" style={{ ...label, textTransform: "none", letterSpacing: 0 }}>Day</label><input id="slot-date" type="date" style={input} value={slotForm.date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setSlotForm({ ...slotForm, date: e.target.value })} /></div>
                <div><label htmlFor="slot-time" style={{ ...label, textTransform: "none", letterSpacing: 0 }}>Time</label><input id="slot-time" type="time" step={900} style={input} value={slotForm.time} onChange={(e) => setSlotForm({ ...slotForm, time: e.target.value })} /></div>
                <div><label htmlFor="slot-dur" style={{ ...label, textTransform: "none", letterSpacing: 0 }}>Length</label><select id="slot-dur" style={input} value={slotForm.duration} onChange={(e) => setSlotForm({ ...slotForm, duration: e.target.value })}>{[20, 30, 45, 60].map(d => <option key={d} value={d}>{d} min</option>)}</select></div>
                <div><label htmlFor="slot-weeks" style={{ ...label, textTransform: "none", letterSpacing: 0 }}>Repeat</label><select id="slot-weeks" style={input} value={slotForm.weeks} onChange={(e) => setSlotForm({ ...slotForm, weeks: e.target.value })}><option value={1}>Once</option><option value={2}>2 weeks</option><option value={4}>4 weeks</option><option value={8}>8 weeks</option></select></div>
                <button type="submit" disabled={saving === "slots"} style={{ ...btn, padding: "10px 12px" }}>{saving === "slots" ? "Adding…" : "Add time"}</button>
              </form>
              {slotError && <p role="alert" style={{ fontSize: 13, color: "#B91C1C", marginTop: 6, fontFamily: font }}>{slotError}</p>}
              <p style={{ fontSize: 11, color: FAINT, marginTop: 6, fontFamily: font }}>Times are in your time zone; members see them in theirs.</p>
              {mySlots.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {mySlots.map(s => (
                    <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 10px", borderRadius: 8, border: `1px solid ${s.booked ? "#A7F3D0" : "#E0E0DE"}`, background: s.booked ? "#ECFDF5" : "#fff", fontFamily: font, color: INK }}>
                      {sessionTime(s.starts_at, s.duration_min)}{s.booked ? " · booked" : ""}
                      {!s.booked && <button onClick={() => removeSlot(s)} aria-label="Remove this time" style={{ background: "none", border: "none", cursor: "pointer", color: FAINT, padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {seekers.length > 0 && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #F0EFED" }}>
                <span style={label}>Members looking for a mentor</span>
                {seekers.map(p => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                    <button type="button" onClick={() => openMember(p.id)} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                      <Avatar name={p.name} size={32} url={p.avatar_url} />
                      <span style={{ minWidth: 0, fontFamily: font }}>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: INK }}>{p.name}</span>
                        <span style={{ display: "block", fontSize: 12, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.menteeNeeds || (p.location || "").split(",")[0]}</span>
                      </span>
                    </button>
                    <button onClick={() => onMessage(p)} style={{ ...btnLight, padding: "6px 10px", fontSize: 12 }}>Say hello</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {past.length > 0 && (
        <div>
          <h3 style={{ ...h3, marginBottom: 10 }}>Past sessions</h3>
          {past.map(b => <SessionCard key={b.id} b={b} user={user} review={reviewFor(b.id)} onChanged={load} onMessage={onMessage} openMember={openMember} Avatar={Avatar} />)}
        </div>
      )}
      {user.mentorOpen && ratings[user.id] && (
        <p style={{ fontSize: 13, color: MUTED, fontFamily: font, textAlign: "center", marginTop: 8 }}>Your mentoring rating: <RatingLine rating={ratings[user.id]} /></p>
      )}
    </div>
  );
}
