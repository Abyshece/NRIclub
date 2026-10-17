import { useEffect, useRef, useState } from "react";
import LogoMark from "../LogoMark";
import { useDialogFocus } from "./LegalModals";
import { firstName } from "./profile";

// ============================================================================
// IN-APP NOTICES. NRIClub sends no notification emails (only sign-in codes
// and password links), so what an email would have said shows in the app:
//   - WelcomeNotice: the first time a new member opens NRIClub.
//   - VerifiedNotice / NeedsInfoNotice: when our team has decided, once (it
//     marks the 'verification' notification read).
//   - CatchUpNotice: when a member comes back to unread messages, Namaste
//     requests or notifications (at most every few hours).
//   - Toasts: a small pop-up for a new message or notification while the
//     member is on NRIClub.
// Dashboard.jsx decides which one shows; only one dialog at a time.
// ============================================================================

const font = "'DM Sans', sans-serif";
const INK = "#37352F";
const MUTED = "#6B6A67";

// What this browser remembers per member ("welcome" seen, when the last
// catch-up showed). If storage can't be used, nothing shows again and again.
const store = (kind, uid) => `nriclub_${kind}_${uid}`;
const read = (kind, uid) => {
  try { return { ok: true, value: localStorage.getItem(store(kind, uid)) }; } catch (e) { return { ok: false, value: null }; }
};
export const rememberNotice = (kind, uid) => {
  try { localStorage.setItem(store(kind, uid), String(Date.now())); } catch (e) {}
};

// The welcome is for new accounts only: members from before it existed
// already know their way around.
const WELCOME_FOR_DAYS = 30;
export function welcomeDue(user) {
  if (!user?.id) return false;
  const r = read("welcome", user.id);
  if (!r.ok || r.value) return false;
  const created = Date.parse(user.createdAt || "");
  return !created || Date.now() - created < WELCOME_FOR_DAYS * 86400000;
}

// When the last catch-up showed (0: never), or null if this browser can't
// remember it. A catch-up counts only what arrived after it.
export const CATCH_UP_EVERY_MS = 6 * 3600000;
export function lastCatchUp(uid) {
  const r = read("catchup", uid);
  return r.ok ? Number(r.value) || 0 : null;
}

const button = (primary) => ({
  minHeight: 44, padding: "0 18px", borderRadius: 10, fontSize: 14, fontWeight: 600, fontFamily: font, cursor: "pointer",
  border: primary ? "none" : "1px solid #E0E0DE", background: primary ? INK : "#fff", color: primary ? "#fff" : INK,
});

// A small centred dialog. `actions`: [{ label, onClick, primary }]. The
// dialog itself has focus when it opens (it can open while the member is
// typing, so no button may catch the next key). Escape, the ✕ and a click
// outside all close it.
function NoticeModal({ id, onClose, actions, children }) {
  const { closeRef, dialogRef } = useDialogFocus(onClose);
  const setDialog = (el) => { dialogRef.current = el; closeRef.current = el; };
  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div ref={setDialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} style={{ outline: "none", position: "relative", background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, maxHeight: "88vh", overflow: "auto", fontFamily: font, color: INK }} onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 6, right: 6, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 8, cursor: "pointer", color: MUTED }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
        <div style={{ padding: "28px 24px 4px" }}>{children}</div>
        <div style={{ padding: "16px 24px 22px", display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {actions.map((a, i) => (
            <button key={a.label} type="button" onClick={a.onClick} style={{ ...button(a.primary), flex: i === actions.length - 1 ? "1 1 auto" : "0 1 auto" }}>{a.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

const title = { fontSize: 21, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.01em", margin: "0 32px 8px 0" };
const para = { fontSize: 14.5, lineHeight: 1.6, color: MUTED, margin: "0 0 14px" };
const box = (bg, border, color) => ({ background: bg, border: `1px solid ${border}`, color, borderRadius: 10, padding: "10px 12px", fontSize: 13.5, lineHeight: 1.55, margin: "0 0 16px" });

const Steps = ({ items }) => (
  <ol style={{ listStyle: "none", padding: 0, margin: "0 0 4px", display: "grid", gap: 10 }}>
    {items.map(([head, text], i) => (
      <li key={head} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: "50%", background: "#F0EFED", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
        <span style={{ fontSize: 14, lineHeight: 1.5 }}><strong>{head}</strong><span style={{ display: "block", color: MUTED }}>{text}</span></span>
      </li>
    ))}
  </ol>
);

// The member's city group, for the first step and the main button:
// `group` its name when it exists; `missing` when the lists say it doesn't
// (then they can ask for one); neither while the lists are still loading.
const cityStep = (city, group, missing) => (group
  ? { step: [`Join ${group}`, "Questions, rooms, referrals and meetups near you."], label: `Go to ${group}` }
  : missing
    ? { step: [`Ask for a ${city} group`, `There's no ${city} group yet. Ask for one and be its first member.`], label: `Ask for a ${city} group` }
    : { step: ["Join your city's group", "Questions, rooms, referrals and meetups near you."], label: "Go to my city's group" });

// The first time a new member opens NRIClub: what it's for, where they stand
// with verification, and three first steps. `verified`: our team's approval
// arrived with this visit (also true when their status says approved).
// onCityGroup opens the city's group (or asks for one when `cityMissing`).
export function WelcomeNotice({ user, verified, cityGroup, cityMissing, onClose, onCityGroup }) {
  const city = (user.city || "").trim();
  const approved = verified || user.verificationStatus === "approved";
  const needsInfo = !approved && user.verificationStatus === "needs_info";
  const held = user.reviewFlag && !approved; // can't take part until approved
  const status = approved
    ? <p style={box("#F0FDF4", "#BBF7D0", "#166534")}>✓ You're verified. Your profile shows the Verified badge, so members know you're real.</p>
    : needsInfo
      ? <p style={box("#FFF8E6", "#FCE7B2", "#7A4D00")}>{held
        ? "We need a little more information before our team can check your membership: see the note at the top of the page."
        : "We need a little more information to verify you: see the note at the top of the page."}</p>
      : held
        ? <p style={box("#EFF6FF", "#BFDBFE", "#1E40AF")}>Our team will check your membership before you can take part. This usually takes a day; you'll see it here.</p>
        : <p style={box("#EFF6FF", "#BFDBFE", "#1E40AF")}>Our team is checking your profile, usually within a day. You can already join groups and say hello.</p>;
  const first = cityStep(city, cityGroup, cityMissing);
  const actions = held || !city
    ? [{ label: "Get started", onClick: onClose, primary: true }]
    : [{ label: "Later", onClick: onClose }, { label: first.label, onClick: onCityGroup, primary: true }];
  return (
    <NoticeModal id="notice-welcome" onClose={onClose} actions={actions}>
      <div style={{ marginBottom: 14 }}><LogoMark size={38} /></div>
      <h2 id="notice-welcome-title" style={title}>Welcome to NRIClub, {firstName(user.name)}!</h2>
      <p style={para}>One home for Indians abroad: your city's group, answers from people who've been there, desi places, festivals and free mentors.</p>
      {status}
      {!held && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTED, margin: "0 0 10px" }}>Start here</h3>
          <Steps items={[
            first.step,
            ["Add a photo", "So people recognise you at meetups."],
            ["Say hello or ask a question", "Members who've been through it can answer."],
          ]} />
        </>
      )}
    </NoticeModal>
  );
}

// Our team approved the member (after they had already been in).
export function VerifiedNotice({ user, cityGroup, cityMissing, onClose, onCityGroup }) {
  const city = (user.city || "").trim();
  const first = cityStep(city, cityGroup, cityMissing);
  return (
    <NoticeModal id="notice-verified" onClose={onClose}
      actions={city ? [{ label: "OK", onClick: onClose }, { label: first.label, onClick: onCityGroup, primary: true }] : [{ label: "OK", onClick: onClose, primary: true }]}>
      <div aria-hidden="true" style={{ fontSize: 34, marginBottom: 8 }}>🎉</div>
      <h2 id="notice-verified-title" style={title}>You're verified</h2>
      <p style={para}>Welcome to the club, {firstName(user.name)}. Your profile now shows the Verified badge, so members know you're real.</p>
      <ul style={{ margin: "0 0 4px", paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
        <li>Your urgent questions now alert members in {city || "your city"}.</li>
        <li>You can offer to mentor other members (Settings › Mentoring).</li>
      </ul>
    </NoticeModal>
  );
}

// Our team needs more information before verifying the member.
export function NeedsInfoNotice({ user, onClose, onUpdate }) {
  return (
    <NoticeModal id="notice-info" onClose={onClose}
      actions={[{ label: "Later", onClick: onClose }, { label: "Update my details", onClick: onUpdate, primary: true }]}>
      <h2 id="notice-info-title" style={title}>We need a little more information</h2>
      <p style={box("#FFF8E6", "#FCE7B2", "#7A4D00")}>{user.verificationMessage || "Please check your details."}</p>
      <p style={para}>Our team looks again as soon as you've updated your details.</p>
    </NoticeModal>
  );
}

// Back after a while, with unread things. `items`: [{ icon, text, action, onClick }].
export function CatchUpNotice({ user, items, onClose }) {
  return (
    <NoticeModal id="notice-catchup" onClose={onClose} actions={[{ label: "Done", onClick: onClose, primary: true }]}>
      <h2 id="notice-catchup-title" style={title}>Welcome back, {firstName(user.name)}</h2>
      <p style={para}>While you were away:</p>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "grid", gap: 8 }}>
        {items.map((it) => (
          <li key={it.text} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px 8px 12px", borderRadius: 10, border: "1px solid #ECEBE8" }}>
            <span aria-hidden="true" style={{ fontSize: 20 }}>{it.icon}</span>
            <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>{it.text}</span>
            <button type="button" onClick={it.onClick} style={{ ...button(false), minHeight: 40, padding: "0 14px" }}>{it.action}</button>
          </li>
        ))}
      </ul>
      <p style={{ fontSize: 12.5, color: MUTED, margin: 0 }}>You can turn this off in Settings › Notifications.</p>
    </NoticeModal>
  );
}

// A small pop-up at the bottom for something new while the member is here.
// It goes 8 seconds after the pointer and focus have left it; everything in
// it is also in Messages or under the bell. If it had focus when it goes,
// focus moves to the bell.
function Toast({ toast, onDismiss }) {
  const boxRef = useRef(null);
  const timer = useRef(null);
  const recheck = useRef(null);
  const hovered = useRef(false);
  const dismiss = () => {
    const hadFocus = boxRef.current?.contains(document.activeElement);
    onDismiss();
    if (hadFocus) [...document.querySelectorAll('button[aria-label="Notifications"]')].find((b) => b.getClientRects().length)?.focus();
  };
  const stop = () => clearTimeout(timer.current);
  const start = () => { stop(); timer.current = setTimeout(dismiss, 8000); };
  const maybeStart = () => {
    clearTimeout(recheck.current);
    recheck.current = setTimeout(() => { if (boxRef.current && !hovered.current && !boxRef.current.contains(document.activeElement)) start(); }, 0);
  };
  useEffect(() => { start(); return () => { stop(); clearTimeout(recheck.current); }; }, []);
  return (
    <div ref={boxRef} className="nc-toast" onMouseEnter={() => { hovered.current = true; stop(); }} onMouseLeave={() => { hovered.current = false; maybeStart(); }}
      onFocus={stop} onBlur={maybeStart} style={{ alignItems: "center", gap: 10, background: INK, color: "#fff", borderRadius: 12, padding: "8px 8px 8px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", fontFamily: font, maxWidth: 420, width: "100%", boxSizing: "border-box", pointerEvents: "auto" }}>
      <span aria-hidden="true" style={{ fontSize: 18 }}>{toast.icon}</span>
      <span style={{ flex: 1, fontSize: 14, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{toast.text}</span>
      {toast.onOpen && (
        <button type="button" onClick={() => { stop(); onDismiss(); toast.onOpen(); }} style={{ minHeight: 40, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.35)", background: "transparent", color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: font, cursor: "pointer", flexShrink: 0 }}>{toast.action || "View"}</button>
      )}
      <button type="button" onClick={() => { stop(); dismiss(); }} aria-label="Dismiss" style={{ width: 40, height: 40, borderRadius: 8, border: "none", background: "transparent", color: "#fff", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  );
}

// Above the page, below the top bar and its menus (zIndex 30), the mobile
// menu (40) and the app's windows (50 and up), so a toast never covers
// something the member is using. On phones only the newest shows. Screen
// readers hear each new toast's text once, from a live region that is
// always on the page (a toast going away says nothing).
export function ToastStack({ toasts, onDismiss }) {
  const [said, setSaid] = useState({ n: 0, text: "" });
  const known = useRef(new WeakSet());
  useEffect(() => {
    const added = toasts.filter((t) => !known.current.has(t));
    toasts.forEach((t) => known.current.add(t));
    if (added.length) setSaid((s) => ({ n: s.n + 1, text: added.map((t) => t.text).join(". ") }));
  }, [toasts]);
  return (
    <>
      <div role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}><span key={said.n}>{said.text}</span></div>
      <div className="nc-toasts" style={{ position: "fixed", left: 12, right: 12, zIndex: 25, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none" }}>
        <style>{`.nc-toasts { bottom: 24px; } .nc-toast { display: flex; } @media (max-width: 900px) { .nc-toasts { bottom: calc(76px + env(safe-area-inset-bottom, 0px)); } .nc-toasts > .nc-toast:not(:last-child) { display: none; } }`}</style>
        {toasts.map((t) => <Toast key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />)}
      </div>
    </>
  );
}
