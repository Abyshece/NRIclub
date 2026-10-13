import { useState } from "react";

const font = "'DM Sans', sans-serif";
const storageKey = (userId) => `nriclub_profile_card_dismissed_${userId}`;

// Whether the member closed the "Complete your profile" card (remembered per
// account in this browser).
export function useProfileCardDismissed(userId) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(storageKey(userId)) === "1"; } catch { return false; }
  });
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(storageKey(userId), "1"); } catch {}
  };
  return [dismissed, dismiss];
}

// A new member's three first steps, each with whether it's done: a photo,
// two groups, and saying hello (a post, or a Namaste sent).
export function setupSteps(user, groups = [], { said = false } = {}) {
  const joined = groups.filter((g) => g.joined).length;
  return [
    { key: "photo", label: "Add a photo", done: !!user.avatar_url },
    { key: "groups", label: joined === 1 ? "Join 2 groups (1 of 2)" : "Join 2 groups", done: joined >= 2 },
    { key: "hello", label: "Say hello", done: said },
  ];
}

// The "Get started" card: the steps from setupSteps with a progress ring;
// gone once all are done. onItem(step) runs a step.
export default function ProfileChecklist({ items, onItem, onDismiss, className, style }) {
  const done = items.filter((i) => i.done).length;
  if (!items.length || done === items.length) return null;
  const titleId = `${className || "profile"}-checklist-title`;
  const shown = items;
  const hidden = 0;
  const setExpanded = () => {};
  const r = 9, c = 2 * Math.PI * r;
  return (
    <section className={className} aria-labelledby={titleId} style={{ background: "#fff", borderRadius: 16, border: "1px solid #E8E7E4", padding: "14px 12px 8px", fontFamily: font, ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 6px", marginBottom: 4 }}>
        <h4 id={titleId} style={{ fontSize: 14, fontWeight: 700, color: "#37352F", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r={r} fill="none" stroke="#F0EFED" strokeWidth="3" />
            <circle cx="12" cy="12" r={r} fill="none" stroke="#138808" strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - done / items.length)} transform="rotate(-90 12 12)" />
          </svg>
          Get started <span style={{ fontSize: 12, fontWeight: 500, color: "#9B9A97" }}>{done} of {items.length}</span>
        </h4>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" title="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6A67", padding: 4, borderRadius: 6, display: "flex", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
        </button>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {shown.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => !item.done && onItem(item)}
              disabled={item.done}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "7px 6px", border: "none", background: "none", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: font }}
              onMouseOver={(e) => { e.currentTarget.style.background = "#F7F7F5"; }}
              onMouseOut={(e) => { e.currentTarget.style.background = "none"; }}
            >
              {item.done ? (
                <span aria-label="Done" style={{ width: 20, height: 20, borderRadius: "50%", background: "#138808", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
                </span>
              ) : (
                <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: "50%", border: "1.5px dashed #C9C8C5", flexShrink: 0 }} />
              )}
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: item.done ? "#9B9A97" : "#37352F", textDecoration: item.done ? "line-through" : "none", lineHeight: 1.35 }}>{item.label}</span>
              {!item.done && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" /></svg>}
            </button>
          </li>
        ))}
        {hidden > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              style={{ width: "100%", padding: "7px 6px", border: "none", background: "none", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: font, fontSize: 13, fontWeight: 500, color: "#6B6A67" }}
            >
              Show {hidden} more
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}
