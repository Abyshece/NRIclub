// Small shared building blocks for the member screens (signup, login code
// entry, Get verified), in the app's existing Notion-like style.

export const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export const COLORS = {
  text: "#37352F",
  label: "#5F5E5B",
  helper: "#6B6A67", // lightest grey used for text on light backgrounds
  border: "#E0E0DE",
  page: "#F7F7F5",
  red: "#DC2626",
  redText: "#B91C1C",
};

export const inputStyle = (invalid = false) => ({
  width: "100%",
  padding: "13px 14px",
  borderRadius: 8,
  border: `1px solid ${invalid ? COLORS.red : COLORS.border}`,
  fontSize: 15,
  background: "#fff",
  color: COLORS.text,
  fontFamily: FONT,
  boxSizing: "border-box",
  outline: "none",
  transition: "border-color 0.15s",
});

export const labelStyle = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: COLORS.label,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 8,
  fontFamily: FONT,
};

export const helperStyle = { fontSize: 12, color: COLORS.helper, marginTop: 6, marginBottom: 0, lineHeight: 1.45, fontFamily: FONT };
export const fieldErrorStyle = { fontSize: 12, color: COLORS.red, marginTop: 6, marginBottom: 0, lineHeight: 1.45, fontFamily: FONT, fontWeight: 500 };

export const primaryButtonStyle = (busy = false) => ({
  width: "100%",
  padding: "14px",
  borderRadius: 8,
  border: "none",
  fontSize: 15,
  fontWeight: 600,
  background: COLORS.text,
  color: "#fff",
  cursor: busy ? "default" : "pointer",
  opacity: busy ? 0.75 : 1,
  fontFamily: FONT,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
});

export const linkButtonStyle = {
  background: "none",
  border: "none",
  padding: 0,
  color: COLORS.text,
  fontWeight: 600,
  textDecoration: "underline",
  textUnderlineOffset: 2,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "inherit",
};

// ids for aria-describedby: the error when there is one, else the helper.
export const describedBy = (id, error, helper) => (error ? `${id}-error` : helper ? `${id}-help` : undefined);

// Label + control + helper or error underneath.
export function Field({ id, label, optional, helper, error, children, style }) {
  return (
    <div style={{ marginBottom: 22, ...style }}>
      <label htmlFor={id} style={labelStyle}>
        {label}
        {optional && <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0, color: COLORS.helper }}> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} style={fieldErrorStyle}>{error}</p>
      ) : helper ? (
        <p id={`${id}-help`} style={helperStyle}>{helper}</p>
      ) : null}
    </div>
  );
}

export function ErrorBox({ children, id, boxRef, style }) {
  if (!children) return null;
  return (
    <div id={id} ref={boxRef} role="alert" style={{ padding: "12px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, fontSize: 13, lineHeight: 1.5, color: COLORS.redText, fontFamily: FONT, ...style }}>
      {children}
    </div>
  );
}

// The globe tile used at the top of the signup screens.
export const GlobeTile = () => (
  <svg width="28" height="28" viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <rect width="40" height="40" rx="10" fill="#F0EFED" />
    <circle cx="20" cy="20" r="8" stroke="#37352F" strokeWidth="1.5" fill="none" />
    <ellipse cx="20" cy="20" rx="4" ry="8" stroke="#37352F" strokeWidth="1.2" fill="none" />
    <line x1="12" y1="20" x2="28" y2="20" stroke="#37352F" strokeWidth="1.2" />
  </svg>
);

export const ArrowRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);
