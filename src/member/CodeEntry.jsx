import { useEffect, useRef, useState } from "react";
import { FONT, COLORS, primaryButtonStyle, linkButtonStyle, ErrorBox } from "./ui";
import { isNetworkError, NETWORK_MESSAGE, authErrorMessage } from "./profile";

const LENGTH = 6;
const EMPTY = Array(LENGTH).fill("");

export const WRONG_CODE_MESSAGE = "That code is wrong or has expired. Check the latest email or resend.";

// The 6-digit email code: one box per digit, filled by typing, pasting into
// any box or the browser's one-time-code autofill. Submits by itself when the
// sixth digit arrives.
//
// onVerify(code) resolves when the code worked (the parent then moves on) or
//   throws: errors with a userMessage are shown as is, network errors keep
//   the digits, anything else counts as a wrong code.
// onResend() sends a new code; the parent owns resendAt (a timestamp) so the
//   countdown survives going back to change the email.
export default function CodeEntry({ email, onVerify, onResend, resendAt = 0, onChangeEmail, changeLabel = "Change email", submitLabel = "Verify email" }) {
  const [digits, setDigits] = useState(EMPTY);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const boxes = useRef([]);
  const submitted = useRef(""); // code sent to onVerify, so auto-submit fires once per entry

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const focusBox = (i) => {
    const el = boxes.current[Math.max(0, Math.min(LENGTH - 1, i))];
    if (el) { el.focus(); el.select(); }
  };

  const clearMessages = () => { setError(""); setNotice(""); };

  // Write str into the boxes starting at start.
  const fillFrom = (start, str) => {
    const next = [...digits];
    let i = start;
    for (const ch of str) {
      if (i >= LENGTH) break;
      next[i++] = ch;
    }
    setDigits(next);
    clearMessages();
    focusBox(i >= LENGTH ? LENGTH - 1 : i);
  };

  const handleChange = (i, value) => {
    let d = value.replace(/\D/g, "");
    if (!d) {
      const next = [...digits];
      next[i] = "";
      setDigits(next);
      return;
    }
    if (d.length >= LENGTH) return fillFrom(0, d.slice(0, LENGTH)); // autofill of the whole code
    // Typed next to the digit already in the box: keep the new one.
    if (d.length === 2 && digits[i] && d.includes(digits[i])) d = d.replace(digits[i], "") || digits[i];
    fillFrom(i, d);
  };

  const handlePaste = (i, e) => {
    const pasted = (e.clipboardData?.getData("text") || "").replace(/\D/g, "");
    e.preventDefault();
    if (!pasted) return;
    if (pasted.length >= LENGTH) fillFrom(0, pasted.slice(0, LENGTH));
    else fillFrom(i, pasted);
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      const next = [...digits];
      next[i - 1] = "";
      setDigits(next);
      focusBox(i - 1);
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === "ArrowRight" && i < LENGTH - 1) {
      e.preventDefault();
      focusBox(i + 1);
    }
  };

  const submit = async (code) => {
    if (verifying) return;
    if (code.length !== LENGTH) {
      setError("Enter all 6 digits of the code.");
      focusBox(digits.findIndex((d) => !d));
      return;
    }
    submitted.current = code;
    setVerifying(true);
    clearMessages();
    try {
      await onVerify(code);
    } catch (err) {
      submitted.current = "";
      if (err?.userMessage) {
        setError(err.userMessage);
      } else if (isNetworkError(err)) {
        setError(NETWORK_MESSAGE);
      } else {
        setError(WRONG_CODE_MESSAGE);
        setDigits(EMPTY);
        focusBox(0);
      }
      setVerifying(false);
    }
  };

  // Auto-submit once all six digits are in.
  useEffect(() => {
    const code = digits.join("");
    if (code.length === LENGTH && submitted.current !== code) submit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  const resend = async () => {
    if (secondsLeft > 0 || resending) return;
    setResending(true);
    clearMessages();
    try {
      await onResend();
      setDigits(EMPTY);
      submitted.current = "";
      setNotice("We sent a new code. It can take a minute to arrive.");
      focusBox(0);
    } catch (err) {
      setError(authErrorMessage(err) || "We couldn't send a new code. Please try again in a minute.");
    }
    setResending(false);
  };

  return (
    <div style={{ textAlign: "center", fontFamily: FONT }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: "#EDF4FF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5B9CFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 6L2 7" />
        </svg>
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, margin: "0 0 8px" }}>Check your email</h2>
      <p style={{ fontSize: 14, color: COLORS.helper, margin: "0 0 6px", lineHeight: 1.6 }}>
        We sent a 6-digit code to<br />
        <strong style={{ color: COLORS.text, wordBreak: "break-all" }}>{email}</strong>
      </p>
      <p style={{ fontSize: 12, color: COLORS.helper, margin: "0 0 24px" }}>Can't find it? Check your spam folder.</p>

      <form onSubmit={(e) => { e.preventDefault(); submit(digits.join("")); }} noValidate>
        <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <legend className="nc-sr-only">Enter the 6-digit code</legend>
          <div style={{ display: "flex", gap: "clamp(6px, 2vw, 10px)", justifyContent: "center", marginBottom: 20 }}>
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { boxes.current[i] = el; }}
                id={i === 0 ? "code-digit-1" : undefined}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                aria-label={`Digit ${i + 1} of 6`}
                aria-invalid={error ? true : undefined}
                value={digit}
                readOnly={verifying}
                autoFocus={i === 0}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={(e) => handlePaste(i, e)}
                onFocus={(e) => e.target.select()}
                style={{
                  width: "clamp(38px, 12vw, 48px)", height: 54, padding: 0, borderRadius: 10,
                  border: digit ? "2px solid #37352F" : `1px solid ${error ? COLORS.red : COLORS.border}`,
                  fontSize: 22, fontWeight: 700, textAlign: "center", outline: "none",
                  color: COLORS.text, fontFamily: FONT, background: "#fff", boxSizing: "border-box",
                }}
              />
            ))}
          </div>
        </fieldset>

        {error && <ErrorBox style={{ marginBottom: 16, textAlign: "left" }}>{error}</ErrorBox>}
        {notice && !error && (
          <div role="status" style={{ marginBottom: 16, padding: "10px 14px", background: "#E3FCEF", border: "1px solid #B5E4CA", borderRadius: 8, fontSize: 13, color: "#126B45", textAlign: "left" }}>{notice}</div>
        )}

        <button type="submit" disabled={verifying} style={{ ...primaryButtonStyle(verifying), marginBottom: 20 }}>
          {verifying ? "Checking the code..." : submitLabel}
        </button>
      </form>

      <p style={{ fontSize: 13, color: COLORS.helper, margin: "0 0 14px" }}>
        Didn't get the code?{" "}
        {secondsLeft > 0 ? (
          <span>You can resend it in <strong style={{ color: COLORS.text }}>{secondsLeft}s</strong></span>
        ) : (
          <button type="button" onClick={resend} disabled={resending} style={linkButtonStyle}>
            {resending ? "Sending..." : "Resend code"}
          </button>
        )}
      </p>
      {onChangeEmail && (
        <button type="button" onClick={onChangeEmail} style={{ ...linkButtonStyle, fontWeight: 500, color: COLORS.helper, fontSize: 13 }}>
          {changeLabel}
        </button>
      )}
    </div>
  );
}
