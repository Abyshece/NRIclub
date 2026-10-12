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

// What's still missing from a profile. Hometown and the move abroad only
// apply to members who live outside India.
export function missingProfileItems(user, groups = []) {
  const abroad = user.countryCode ? user.countryCode !== "IN" : user.isNRI !== false;
  const items = [];
  if (!user.avatar_url) items.push({ key: "photo", label: "Add a photo" });
  if (abroad && !user.hometown) items.push({ key: "hometown", label: "Hometown in India" });
  if (abroad && !user.yearsAbroad) items.push({ key: "yearsAbroad", label: "When you moved abroad" });
  if (!user.occupationStatus) items.push({ key: "occupationStatus", label: "Work or study status" });
  const city = (user.city || "").trim().toLowerCase();
  const cityGroup = city && groups.find((g) => (g.name || "").trim().toLowerCase() === `indians in ${city}`);
  if (cityGroup && !cityGroup.joined) items.push({ key: "group", label: `Join ${cityGroup.name}`, groupId: cityGroup.id });
  return items;
}

// onItem(item): "photo" opens the avatar upload, profile fields open Edit
// Profile, "group" joins the city group.
export default function ProfileChecklist({ items, onItem, onDismiss, className, style }) {
  if (!items.length) return null;
  const titleId = `${className || "profile"}-checklist-title`;
  return (
    <section className={className} aria-labelledby={titleId} style={{ background: "#fff", borderRadius: 16, border: "1px solid #E8E7E4", padding: "14px 12px 8px", fontFamily: font, ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 6px", marginBottom: 4 }}>
        <h4 id={titleId} style={{ fontSize: 14, fontWeight: 700, color: "#37352F", margin: 0 }}>Complete your profile</h4>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" title="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6A67", padding: 4, borderRadius: 6, display: "flex", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
        </button>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onItem(item)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "7px 6px", border: "none", background: "none", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: font }}
              onMouseOver={(e) => { e.currentTarget.style.background = "#F7F7F5"; }}
              onMouseOut={(e) => { e.currentTarget.style.background = "none"; }}
            >
              <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: "50%", border: "1.5px dashed #C9C8C5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#6B6A67" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: "#37352F", lineHeight: 1.35 }}>{item.label}</span>
              {item.key === "group" ? (
                <span style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: "#37352F", padding: "3px 10px", borderRadius: 6, flexShrink: 0 }}>Join</span>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" /></svg>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
