import { useEffect, useId, useRef, useState } from "react";
import * as api from "../supabaseApi";
import {
  SWITCH_LABEL, SWITCH_HELP, PREVIEW_WARNING, CONFIRM_TITLE, CONFIRM_TEXT, TURN_ON_AND_SHARE, MEMBERS_ONLY, PREVIEW_FAILED, itemPath,
} from "../content/preview";

// ============================================================================
// Sharing a Market listing, an event, a question or a trip, and its
// author's switch "Show a preview to people who aren't members yet" (off
// until they turn it on; what a preview holds: src/content/preview.js).
// Share uses the phone's share sheet, or copies the link. A member sharing
// their own item while its preview is off is asked first whether to turn
// it on; sharing someone else's item just shares the link. Before the
// 2026-10-31 database update there is no switch: nothing asks about it.
// ============================================================================

const font = "'DM Sans', sans-serif";
const INK = "#37352F";
const MUTED = "#6B6A67";

// Whether the database has the switch yet (false until it's known).
export function useSharePreviews() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let alive = true;
    api.sharePreviewsAvailable().then((yes) => { if (alive) setAvailable(!!yes); });
    return () => { alive = false; };
  }, []);
  return available;
}

// The item's own link, e.g. https://nriclub.app/market/<id>.
export const itemLink = (kind, id) => `${window.location.origin}${itemPath(kind, id)}`;

// Shares a link: the share sheet where the browser has one (phones);
// otherwise it's copied and onCopied says so; without clipboard access, it's
// shown to copy by hand. Only the link: the app showing it fetches the
// preview, if there is one.
export function shareLink(url, onCopied) {
  if (typeof navigator.share === "function") {
    navigator.share({ url }).catch(() => {});
    return;
  }
  const copied = navigator.clipboard?.writeText ? navigator.clipboard.writeText(url) : Promise.reject(new Error("no clipboard"));
  copied.then(() => onCopied?.(), () => { window.prompt("Copy this link:", url); });
}

// The author's switch. In a post form (checked, onChange), and on the
// author's own item (busy while the change is saved). The text says what a
// preview of this kind of item shows, and never; for a question, also that
// its title is shown (PREVIEW_WARNING). Questions under Health or
// Legal/Visa get no switch (questionPreviewAllowed, where it's used).
export function PreviewSwitch({ kind, checked, onChange, busy = false, style }) {
  const id = useId();
  const on = !!checked;
  const warning = PREVIEW_WARNING[kind];
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", fontFamily: font, ...style }}>
      <button type="button" id={id} role="switch" aria-checked={on} aria-describedby={`${id}-help${warning ? ` ${id}-warning` : ""}`} disabled={busy}
        onClick={() => onChange(!on)}
        style={{ flexShrink: 0, width: 44, height: 26, marginTop: 1, borderRadius: 13, border: "none", padding: 3, cursor: busy ? "default" : "pointer",
          background: on ? "#1A7F52" : "#C9C8C5", opacity: busy ? 0.6 : 1, transition: "background 0.15s", display: "flex",
          justifyContent: on ? "flex-end" : "flex-start", alignItems: "center" }}>
        <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
      </button>
      <div style={{ minWidth: 0 }}>
        <label htmlFor={id} style={{ display: "block", fontSize: 13, fontWeight: 600, color: INK, lineHeight: 1.4, cursor: busy ? "default" : "pointer" }}>
          {SWITCH_LABEL}
        </label>
        <p id={`${id}-help`} style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, margin: "2px 0 0" }}>{SWITCH_HELP[kind]}</p>
        {warning && <p id={`${id}-warning`} style={{ fontSize: 12, color: "#9A3412", lineHeight: 1.5, margin: "4px 0 0" }}>{warning}</p>}
      </div>
    </div>
  );
}

// "Turn on the preview?" before the author shares their own item while its
// preview is off. Escape or a tap outside closes it without sharing; focus
// goes back to where it was.
function ShareConfirm({ kind, onTurnOn, onMembersOnly, onClose }) {
  const id = useId();
  const box = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    box.current?.querySelector("button")?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      if (e.key === "Tab") {
        // Focus stays in the window.
        const buttons = [...box.current.querySelectorAll("button")];
        const at = buttons.indexOf(document.activeElement);
        const next = e.shiftKey ? (at <= 0 ? buttons.length - 1 : at - 1) : (at + 1) % buttons.length;
        e.preventDefault();
        buttons[next].focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); before?.focus?.(); };
  }, []);
  const btn = { width: "100%", minHeight: 44, padding: "10px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: font };
  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-text${PREVIEW_WARNING[kind] ? ` ${id}-warning` : ""}`}
        style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, padding: "22px 20px 18px", boxSizing: "border-box", fontFamily: font }}>
        <h3 id={`${id}-title`} style={{ fontSize: 17, fontWeight: 700, color: INK, margin: "0 0 8px" }}>{CONFIRM_TITLE}</h3>
        <p id={`${id}-text`} style={{ fontSize: 14, color: MUTED, lineHeight: 1.55, margin: "0 0 16px" }}>{CONFIRM_TEXT[kind]}</p>
        {PREVIEW_WARNING[kind] && <p id={`${id}-warning`} style={{ fontSize: 13, color: "#9A3412", lineHeight: 1.5, margin: "-8px 0 16px" }}>{PREVIEW_WARNING[kind]}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" onClick={onTurnOn} style={{ ...btn, border: "none", background: INK, color: "#fff" }}>{TURN_ON_AND_SHARE}</button>
          <button type="button" onClick={onMembersOnly} style={{ ...btn, border: "1px solid #E0E0DE", background: "#fff", color: INK }}>{MEMBERS_ONLY}</button>
        </div>
      </div>
    </div>
  );
}

// Share for every member. share({ kind, id, mine, preview, setPreview }):
// mine and preview say whose item it is and whether its preview is on;
// setPreview(true) turns it on (a promise). The author's own item with its
// preview off asks first, as long as the database has the switch.
// onCopied: the link was copied ("Link copied"); onError(text): turning
// the preview on failed (the link was shared all the same). Returns
// { share, dialog (render it), available (the database has the switch) }.
export function useShare({ onCopied, onError }) {
  const [ask, setAsk] = useState(null);
  const available = useSharePreviews();
  const share = (item) => {
    const url = itemLink(item.kind, item.id);
    if (item.mine && available && !item.preview && item.setPreview) { setAsk({ ...item, url }); return; }
    shareLink(url, onCopied);
  };
  // The link is shared at once (share sheets and the clipboard need the
  // tap), while the switch is saved.
  const turnOnAndShare = () => {
    const a = ask;
    setAsk(null);
    Promise.resolve().then(() => a.setPreview(true)).catch(() => onError?.(PREVIEW_FAILED));
    shareLink(a.url, onCopied);
  };
  const dialog = ask && (
    <ShareConfirm kind={ask.kind} onTurnOn={turnOnAndShare} onClose={() => setAsk(null)}
      onMembersOnly={() => { const a = ask; setAsk(null); shareLink(a.url, onCopied); }} />
  );
  return { share, dialog, available };
}

// The Share button on an item.
export function ShareButton({ onClick, label = "Share", style, size = 15 }) {
  return (
    <button type="button" onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, padding: "6px 10px",
      background: "none", border: "none", cursor: "pointer", color: "#5F5E5B", fontSize: 13, fontWeight: 600, fontFamily: font, ...style }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
      {label}
    </button>
  );
}
