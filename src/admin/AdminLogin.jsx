// The admin login (admin.nriclub.app): the password, then, for an account
// with two-step login, the 6-digit code from the authenticator app. When
// admin rights need two-step login and the account hasn't set it up yet, it
// is set up here first, so no admin is ever locked out by the switch. The
// database decides what an account may do (public.admin_mfa_status); this
// page only finds the next step.
import { useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { rateLimiter } from "../rateLimiter";
import { CodeField, TotpQr } from "./TwoStep";

const card = { maxWidth: 380, width: "100%", background: "#fff", borderRadius: 16, padding: 32, boxSizing: "border-box" };
const input = { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 14, boxSizing: "border-box", outline: "none" };
const primary = (busy) => ({ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: "#37352F", color: "#fff", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 });
const linkButton = { background: "none", border: "none", color: "#5B9CFF", fontSize: 12, cursor: "pointer", padding: 4 };
const text = { fontSize: 13, color: "#5F5E5B", lineHeight: 1.55, margin: "0 0 14px" };

// initialEmail / notice: after a password reset. resume: this browser has a
// session (a reload): find the next step without asking for the password.
// onSignedIn: the account has admin rights now. onBack: leave for the site.
export default function AdminLogin({ initialEmail = "", notice: initialNotice = "", resume = false, onSignedIn, onBack }) {
  const [step, setStep] = useState(resume ? "checking" : "password"); // checking | password | code | enrol
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState(null); // the factor the code is for
  const [enrol, setEnrol] = useState(null); // { id, qr, secret } while setting up
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(initialNotice);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const deciding = useRef(null); // the decide() in progress, so it never runs twice at once

  const backToPassword = (message) => {
    api.signOut().catch(() => {});
    setCode("");
    setEnrol(null);
    setFactorId(null);
    setStep("password");
    setError(message || "");
  };

  // Signed in (with the password, and perhaps the code): what next?
  const decide = () => {
    if (!deciding.current) deciding.current = findNextStep().finally(() => { deciding.current = null; });
    return deciding.current;
  };
  const findNextStep = async () => {
    let access, factors;
    try {
      [access, factors] = await Promise.all([api.adminAccess(), api.getTotpFactors()]);
    } catch (e) {
      if (alive.current) backToPassword("Couldn't check admin access. Please try again.");
      return;
    }
    if (!alive.current) return;
    if (!access.listed || !access.active) { backToPassword("This account does not have admin access."); return; }
    const verified = factors.verified[0];
    // Two-step login set up: always the code, whether or not it's required.
    if (verified && api.sessionAal() !== "aal2") {
      setFactorId(verified.id);
      setCode("");
      setError("");
      setStep("code");
      return;
    }
    if (access.isAdmin) {
      rateLimiter.reset("admin_login");
      rateLimiter.reset("admin_code");
      onSignedIn();
      return;
    }
    // Required, and not set up yet: set it up now.
    if (access.mfaRequired && !verified) {
      setStep("enrol");
      setError("");
      try {
        const started = await api.enrollTotp();
        if (alive.current) setEnrol(started);
      } catch (e) {
        if (alive.current) setError("Couldn't start setting up two-step login. Please try again.");
      }
      return;
    }
    backToPassword("This account does not have admin access.");
  };

  useEffect(() => {
    if (resume) decide();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = async () => {
    if (busy) return;
    const rl = rateLimiter.check("admin_login", 5, 900000);
    if (!rl.allowed) { setError(`Too many attempts. Wait ${Math.ceil(rl.waitSecs / 60)} min.`); return; }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.signIn(email.trim().toLowerCase(), password);
    } catch (e) {
      setError(e.message || "Invalid email or password.");
      setBusy(false);
      return;
    }
    setPassword("");
    await decide();
    if (alive.current) setBusy(false);
  };

  // The code from the app: signs this session in with it (for a new factor,
  // that also finishes setting it up).
  const confirmCode = async () => {
    if (busy) return;
    const id = step === "enrol" ? enrol?.id : factorId;
    if (!id) return;
    if (code.length !== 6) { setError("Enter the 6-digit code from your authenticator app."); return; }
    const rl = rateLimiter.check("admin_code", 10, 900000);
    if (!rl.allowed) { setError(`Too many attempts. Wait ${Math.ceil(rl.waitSecs / 60)} min.`); return; }
    setBusy(true);
    setError("");
    try {
      await api.verifyTotp(id, code);
    } catch (e) {
      if (alive.current) { setError(e.message || "That code didn't work. Please try again."); setCode(""); setBusy(false); }
      return;
    }
    await decide();
    if (alive.current) setBusy(false);
  };

  const forgotPassword = async () => {
    const address = email.trim().toLowerCase();
    if (!address.includes("@")) { setError("Enter your email first, then click Forgot password."); return; }
    try {
      await api.resetPassword(address);
      setError("");
      setNotice("If that account exists, we've emailed it a link to set a new password.");
    } catch (e) {
      setError(e.message || "Couldn't send the reset email. Please try again.");
    }
  };

  const otherAccount = (
    <p style={{ fontSize: 12, textAlign: "center", margin: "14px 0 0" }}>
      <button type="button" onClick={() => backToPassword("")} disabled={busy} style={linkButton}>Use a different account</button>
    </p>
  );

  let body;
  if (step === "checking") {
    body = <p role="status" style={{ ...text, textAlign: "center", margin: 0 }}>Checking your account…</p>;
  } else if (step === "code") {
    body = (
      <>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#37352F", margin: "0 0 6px" }}>Two-step login</h3>
        <p id="admin-code-help" style={text}>Enter the 6-digit code your authenticator app shows for NRIClub.</p>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <CodeField id="admin-code" value={code} onChange={setCode} onEnter={confirmCode} autoFocus describedBy="admin-code-help" label="6-digit code" />
        </div>
        <button type="button" onClick={confirmCode} disabled={busy} style={primary(busy)}>{busy ? "Checking..." : "Confirm"}</button>
        <p style={{ fontSize: 11, color: "#9B9A97", lineHeight: 1.5, textAlign: "center", margin: "14px 0 0" }}>
          No longer have the app? The site owner can remove two-step login for your account in the Supabase dashboard (Authentication → Users).
        </p>
        {otherAccount}
      </>
    );
  } else if (step === "enrol") {
    body = (
      <>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#37352F", margin: "0 0 6px" }}>Set up two-step login</h3>
        <p style={text}>
          Admin rights now need a 6-digit code from an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator, 1Password or Aegis. Scan the QR code with the app, then enter the code it shows.
        </p>
        {enrol ? (
          <>
            <div style={{ marginBottom: 14 }}><TotpQr qr={enrol.qr} secret={enrol.secret} /></div>
            <p style={{ ...text, fontSize: 12, background: "#FFF8E6", border: "1px solid #FCE7B2", color: "#7A4D00", borderRadius: 8, padding: "8px 10px" }}>
              Keep the key somewhere safe, for example in your password manager: with it you can add NRIClub to a new phone.
            </p>
            <label htmlFor="admin-enrol-code" style={{ display: "block", fontSize: 12, color: "#5F5E5B", marginBottom: 6, textAlign: "center" }}>Code from the app</label>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <CodeField id="admin-enrol-code" value={code} onChange={setCode} onEnter={confirmCode} />
            </div>
            <button type="button" onClick={confirmCode} disabled={busy} style={primary(busy)}>{busy ? "Checking..." : "Confirm and continue"}</button>
          </>
        ) : !error ? (
          <p role="status" style={{ ...text, textAlign: "center" }}>Preparing your QR code…</p>
        ) : (
          <button type="button" onClick={() => decide()} style={primary(false)}>Try again</button>
        )}
        {otherAccount}
      </>
    );
  } else {
    body = (
      <>
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Admin email" aria-label="Admin email" style={{ ...input, marginBottom: 12 }} />
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" aria-label="Password" style={{ ...input, marginBottom: 20 }} onKeyDown={(e) => { if (e.key === "Enter") signIn(); }} />
        <button type="button" onClick={signIn} disabled={busy} style={primary(busy)}>{busy ? "Signing in..." : "Sign In"}</button>
        <p style={{ fontSize: 11, textAlign: "center", marginTop: 12 }}><button type="button" onClick={forgotPassword} style={{ ...linkButton, fontSize: 11, padding: 0 }}>Forgot password?</button></p>
      </>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", boxSizing: "border-box", background: "#1A1A1A", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={card}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#37352F" }}>NRI<span style={{ fontStyle: "italic", fontFamily: '"Times New Roman",serif' }}>Club</span></h2>
          <p style={{ fontSize: 12, color: "#9B9A97", marginTop: 4 }}>Admin Panel Login</p>
        </div>
        {error && <div role="alert" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", padding: "8px 12px", borderRadius: 8, fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>{error}</div>}
        {notice && !error && <div role="status" style={{ background: "#E3FCEF", border: "1px solid #ABF5D1", color: "#22A06B", padding: "8px 12px", borderRadius: 8, fontSize: 12, marginBottom: 16 }}>{notice}</div>}
        {body}
        <p style={{ fontSize: 11, color: "#9B9A97", textAlign: "center", marginTop: 16 }}><a href="/" onClick={(e) => { e.preventDefault(); onBack(); }} style={{ color: "#5B9CFF" }}>← Back to NRIClub</a></p>
      </div>
    </div>
  );
}
