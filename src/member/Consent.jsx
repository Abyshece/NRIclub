import { useEffect, useState } from "react";
import * as api from "../supabaseApi";
import { ART9_CONSENT_TEXT, TERMS_VERSION } from "./LegalModals";
import { ART9_CONSENT_TEXT_BY_VERSION } from "../content/legal/consent";
import { COLORS, linkButtonStyle, helperStyle, fieldErrorStyle } from "./ui";

// The two separate checkboxes a member ticks before they can take part, on
// signup, Get verified and the Terms screen. Neither is ticked in advance:
//   - "I'm 18 or older and accept the Terms of Use": the contract;
//   - the Art. 9 consent (ART9_CONSENT_TEXT, pending legal review) to
//     processing what they share that can show their ethnic origin,
//     religion or health. The database records it with its time and the
//     version of the wording (private.current_art9_version).
// The Privacy Policy is information, linked under them, with nothing to tick.

export const TERMS_ERROR = "Please confirm you're 18 or older and accept the Terms of Use.";
export const ART9_ERROR = "Please tick this box too: NRIClub can't be used without this consent.";

const checkboxStyle = { marginTop: 2, accentColor: "#37352F", width: 18, height: 18, flexShrink: 0, cursor: "pointer" };
const inlineLink = { ...linkButtonStyle, fontWeight: 500, color: "#3D5A9F" };

// A link to the Terms (/terms) or the Privacy Policy (/privacy): a real
// address that opens in a new tab or can be copied; a plain click shows it in
// a dialog instead (onOpen), so the form keeps what was typed.
export function LegalLink({ href, onOpen, children }) {
  const open = (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen();
  };
  return <a href={href} onClick={open} style={inlineLink}>{children}</a>;
}

function Checkbox({ id, inputRef, checked, onChange, error, label, style }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, ...style }}>
      <input
        id={id} ref={inputRef} type="checkbox" checked={checked}
        onChange={(e) => onChange(e.target.checked)} style={checkboxStyle}
        aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
      />
      <div>
        <label htmlFor={id} style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.5, cursor: "pointer" }}>{label}</label>
        {error && <p id={`${id}-error`} style={fieldErrorStyle}>{error}</p>}
      </div>
    </div>
  );
}

// "I'm 18 or older and accept the Terms of Use". onOpen("terms") shows them.
export function TermsCheckbox({ onOpen, ...props }) {
  return (
    <Checkbox
      {...props}
      label={<>I'm 18 or older and accept the <LegalLink href="/terms" onOpen={() => onOpen("terms")}>Terms of Use</LegalLink></>}
    />
  );
}

// The separate Art. 9 consent, in the wording the database will record: the
// current one once the database knows this site's Terms (the 2026-11-02
// update makes both current), until then the earlier one, so someone who
// signs up in between agrees to the words that are recorded (as TermsModal
// does for the Terms). If the version can't be fetched, the current wording.
export function Art9Checkbox(props) {
  const [dbTerms, setDbTerms] = useState(null);
  useEffect(() => {
    let live = true;
    api.getCurrentTermsVersion().then((v) => { if (live) setDbTerms(v || null); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const label = dbTerms && dbTerms !== TERMS_VERSION ? ART9_CONSENT_TEXT_BY_VERSION["2026-10-19"] : ART9_CONSENT_TEXT;
  return <Checkbox {...props} label={label} />;
}

// The Privacy Policy, for information. onOpen("privacy") shows it.
export function PrivacyNote({ onOpen, style }) {
  return (
    <p style={{ ...helperStyle, marginTop: 0, ...style }}>
      How we handle your data, and who can see what: our{" "}
      <LegalLink href="/privacy" onOpen={() => onOpen("privacy")}>Privacy Policy</LegalLink>.
    </p>
  );
}
