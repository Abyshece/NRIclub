// Two-step login for admins (a 6-digit code from an authenticator app, such
// as Google Authenticator, Microsoft Authenticator, 1Password or Aegis): the
// pieces the admin login and the Security page share. Inline styles, so
// they look the same on the login card and in the panel.
import { useState } from "react";

// Only digits, at most 6 (a pasted "123 456" works too).
export const cleanCode = (value) => String(value || "").replace(/\D/g, "").slice(0, 6);

// The field for the 6-digit code. onEnter: Enter was pressed. label: its
// name for screen readers when no <label> names it.
export function CodeField({ id, value, onChange, onEnter, autoFocus = false, describedBy, label }) {
  return (
    <input
      id={id} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7}
      value={value} onChange={(e) => onChange(cleanCode(e.target.value))} autoFocus={autoFocus}
      onKeyDown={(e) => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); } }}
      aria-describedby={describedBy} aria-label={label} placeholder="123456"
      style={{ width: "100%", maxWidth: 220, padding: "10px 14px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 20, letterSpacing: "0.3em", textAlign: "center", fontVariantNumeric: "tabular-nums", boxSizing: "border-box", outline: "none", fontFamily: "inherit", background: "#fff", color: "#37352F" }}
    />
  );
}

// The QR code to scan with the app, and the key to type in instead (with a
// copy button), from api.enrollTotp().
export function TotpQr({ qr, secret }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      {qr && <img src={qr} alt="QR code to scan with your authenticator app" width={176} height={176} style={{ width: 176, height: 176, background: "#fff", border: "1px solid #EDEDEB", borderRadius: 8, padding: 6, boxSizing: "content-box" }} />}
      <div style={{ fontSize: 12, color: "#787774", textAlign: "center" }}>Can't scan it? Type this key into the app:</div>
      <code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 13, color: "#37352F", background: "#F7F7F5", border: "1px solid #EDEDEB", borderRadius: 6, padding: "6px 10px", maxWidth: "100%", boxSizing: "border-box", overflowWrap: "anywhere", textAlign: "center", userSelect: "all" }}>
        {secret.replace(/(.{4})(?=.)/g, "$1 ")}
      </code>
      <button type="button" onClick={copy} style={{ background: "none", border: "none", color: "#2F6FDB", fontSize: 12, cursor: "pointer", padding: 4, fontFamily: "inherit" }}>
        <span aria-live="polite">{copied ? "Copied" : "Copy key"}</span>
      </button>
    </div>
  );
}
