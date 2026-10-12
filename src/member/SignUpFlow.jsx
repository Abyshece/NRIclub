import { useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import CodeEntry from "./CodeEntry";
import { TermsModal, PrivacyModal, TERMS_VERSION } from "./LegalModals";
import { FONT, COLORS, inputStyle, Field, ErrorBox, primaryButtonStyle, linkButtonStyle, describedBy, GlobeTile, ArrowRight, helperStyle, fieldErrorStyle } from "./ui";
import { mapProfile, authErrorMessage, isExistingAccountResponse, isExistingAccountError, NETWORK_MESSAGE, isNetworkError } from "./profile";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_MS = 60 * 1000;

const withUserMessage = (userMessage) => Object.assign(new Error(userMessage), { userMessage });

// Signup: where do you live -> name, email, password -> 6-digit email code.
// Calls onComplete(user) once the code is verified and the member is signed
// in; the app then asks for verification details (Get verified).
export default function SignUpFlow({ onComplete, onLogin }) {
  const [step, setStep] = useState("residency"); // residency | account | code
  const [residency, setResidency] = useState(null); // abroad | india
  const [form, setForm] = useState({ name: "", email: "", password: "", agree: false, marketing: false });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null); // { text, existing }
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [modal, setModal] = useState(null); // "terms" | "privacy"
  // The account created during this visit ({ email }), so going back to fix
  // something doesn't create a second account for the same address.
  const [account, setAccount] = useState(null);
  const [resendAt, setResendAt] = useState(0);

  const fieldRefs = { name: useRef(null), email: useRef(null), password: useRef(null), agree: useRef(null) };
  const submitErrorRef = useRef(null);
  const focusOnAccountStep = useRef(null);

  useEffect(() => { window.scrollTo(0, 0); }, [step]);
  useEffect(() => {
    if (submitError) submitErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [submitError]);
  useEffect(() => {
    if (step === "account" && focusOnAccountStep.current) {
      fieldRefs[focusOnAccountStep.current]?.current?.focus();
      focusOnAccountStep.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const update = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    if (submitError && (key === "email" || key === "password")) setSubmitError(null);
  };

  const validate = (v) => {
    const e = {};
    if (v.name.length < 2) e.name = "Please enter your full name.";
    if (!v.email) e.email = "Please enter your email address.";
    else if (!EMAIL_RE.test(v.email)) e.email = "That email address doesn't look right. Check it for typos.";
    if (!v.password) e.password = "Please choose a password.";
    else if (v.password.length < 8) e.password = "Use at least 8 characters.";
    if (!v.agree) e.agree = "Please confirm you're 18 or older and accept the Terms of Use.";
    return e;
  };

  const handleContinue = async (e) => {
    e.preventDefault();
    if (submitting) return;
    // Names and emails are trimmed; passwords are kept exactly as typed
    // (spaces are valid characters and login doesn't trim them either).
    const v = { ...form, name: form.name.trim().replace(/\s+/g, " "), email: form.email.trim().toLowerCase() };
    setForm(v);
    setSubmitError(null);
    const found = validate(v);
    setErrors(found);
    const first = ["name", "email", "password", "agree"].find((k) => found[k]);
    if (first) {
      fieldRefs[first].current?.focus();
      return;
    }

    // Back from the code screen with the same address: the account exists
    // already, so send a fresh code instead of signing up again.
    if (account && account.email === v.email) {
      if (Date.now() >= resendAt) {
        try { await api.sendOtp(v.email); setResendAt(Date.now() + RESEND_MS); } catch {}
      }
      setStep("code");
      return;
    }

    setSubmitting(true);
    try {
      const metadata = {
        full_name: v.name,
        age_confirmed: true,
        terms_version: TERMS_VERSION,
        gdpr_consent: true,
        marketing_consent: v.marketing,
      };
      if (residency === "india") metadata.country_code = "IN";
      const result = await api.signUp(v.email, v.password, metadata);
      if (isExistingAccountResponse(result)) throw new Error("already exists");
      // An unfinished signup from an earlier visit comes back with its old
      // creation time (Supabase only re-sends the code).
      const u = result?.user ?? result;
      const lastSent = Math.max(Date.parse(u?.confirmation_sent_at) || 0, Date.parse(u?.updated_at) || 0);
      const resumed = !!u?.created_at && lastSent - Date.parse(u.created_at) > 30000;
      setAccount({ email: v.email, password: v.password, resumed });
      setResendAt(Date.now() + RESEND_MS);
      setStep("code");
    } catch (err) {
      if (isExistingAccountError(err)) {
        setSubmitError({ text: "There's already an account with this email.", existing: true });
      } else {
        setSubmitError({ text: authErrorMessage(err) || "We couldn't create your account. Please try again." });
      }
    }
    setSubmitting(false);
  };

  const verifyCode = async (code) => {
    const email = account.email;
    // Wrong or expired codes throw here and CodeEntry says so.
    let session = await api.verifyOtp(email, code);
    try {
      if (!session?.access_token) session = await api.signIn(email, form.password).catch(() => null);
      if (!session?.access_token) {
        throw withUserMessage("Your email is confirmed, but we couldn't sign you in. Please log in with your email and password.");
      }
      let db = await api.getMyProfile();
      if (!db) {
        await new Promise((r) => setTimeout(r, 800));
        db = await api.getMyProfile();
      }
      if (!db) throw withUserMessage("Your email is confirmed, but we couldn't load your profile. Please log in.");

      // An unfinished signup from an earlier visit keeps that visit's
      // password (as does going back and changing it here); set the one
      // typed now so logging in later works.
      if (account.resumed || account.password !== form.password) {
        await api.updatePassword(form.password).catch(() => {});
      }

      // Bring the profile in line with this visit's answers (they differ if
      // the member went back and edited them, or signed up before).
      const patch = {};
      if (db.name !== form.name) patch.name = form.name;
      if (!!db.marketing_consent !== form.marketing) patch.marketing_consent = form.marketing;
      if (residency === "india" && db.country_code !== "IN") patch.country_code = "IN";
      if (residency === "abroad" && db.country_code === "IN") patch.country_code = "";
      if (Object.keys(patch).length) {
        try { await api.updateProfile(patch); } catch { Object.keys(patch).forEach((k) => delete patch[k]); }
      }
      onComplete(mapProfile({ ...db, ...patch }));
    } catch (err) {
      if (err.userMessage) throw err;
      throw withUserMessage(isNetworkError(err) ? NETWORK_MESSAGE : "Your email is confirmed, but something went wrong signing you in. Please log in.");
    }
  };

  const resendCode = async () => {
    await api.sendOtp(account.email);
    setResendAt(Date.now() + RESEND_MS);
  };

  const page = (children, align = "center") => (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: align, justifyContent: "center", padding: align === "center" ? "2rem 16px" : "40px 16px 60px", background: COLORS.page, fontFamily: FONT }}>
      {children}
      {modal === "terms" && <TermsModal onClose={() => setModal(null)} />}
      {modal === "privacy" && <PrivacyModal onClose={() => setModal(null)} />}
    </div>
  );

  // ---- WHERE DO YOU LIVE ----
  if (step === "residency") {
    const choose = (r) => { setResidency(r); setStep("account"); focusOnAccountStep.current = "name"; };
    const optionStyle = { padding: "18px 24px", borderRadius: 12, border: "1px solid #E0E0DE", background: "#fff", cursor: "pointer", textAlign: "left", transition: "all 0.15s", fontFamily: FONT };
    const hoverOn = (e) => { e.currentTarget.style.borderColor = "#37352F"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; };
    const hoverOff = (e) => { e.currentTarget.style.borderColor = "#E0E0DE"; e.currentTarget.style.boxShadow = "none"; };
    return page(
      <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "#37352F", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "#fff" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, margin: "0 0 8px" }}>Where do you live?</h2>
        <p style={{ fontSize: 14, color: COLORS.helper, margin: "0 0 32px" }}>This helps us personalize your experience on NRIClub.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 320, margin: "0 auto" }}>
          <button type="button" onClick={() => choose("abroad")} style={optionStyle} onMouseOver={hoverOn} onMouseOut={hoverOff}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: "#E3FCEF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22A06B" strokeWidth="2" aria-hidden="true"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>I live outside India</div>
                <div style={{ fontSize: 12, color: COLORS.helper, marginTop: 2 }}>NRI, student abroad, or recently moved</div>
              </div>
            </div>
          </button>
          <button type="button" onClick={() => choose("india")} style={optionStyle} onMouseOver={hoverOn} onMouseOut={hoverOff}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: "#FFF3E0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E65100" strokeWidth="2" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M9 22V12h6v10" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>I live in India</div>
                <div style={{ fontSize: 12, color: COLORS.helper, marginTop: 2 }}>Connect with NRIs for advice & support</div>
              </div>
            </div>
          </button>
        </div>
        <p style={{ fontSize: 13, color: COLORS.helper, marginTop: 24 }}>
          Already have an account? <button type="button" onClick={() => onLogin()} style={linkButtonStyle}>Log in</button>
        </p>
      </div>
    );
  }

  // ---- EMAIL CODE ----
  if (step === "code") {
    return page(
      <div style={{ maxWidth: 400, width: "100%" }}>
        <CodeEntry
          email={account.email}
          onVerify={verifyCode}
          onResend={resendCode}
          resendAt={resendAt}
          onChangeEmail={() => { setStep("account"); focusOnAccountStep.current = "email"; }}
        />
      </div>
    );
  }

  // ---- CREATE YOUR ACCOUNT ----
  const checkboxStyle = { marginTop: 2, accentColor: "#37352F", width: 18, height: 18, flexShrink: 0, cursor: "pointer" };
  const inlineLink = { ...linkButtonStyle, fontWeight: 500, color: "#3D5A9F" };
  return page(
    <div style={{ maxWidth: 460, width: "100%" }}>
      <button type="button" onClick={() => setStep("residency")} style={{ ...linkButtonStyle, textDecoration: "none", fontWeight: 500, color: COLORS.helper, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 20 }}>
        <span aria-hidden="true">←</span> Back
      </button>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ marginBottom: 16, display: "inline-block" }}><GlobeTile /></div>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: COLORS.text, letterSpacing: "-0.03em", margin: "0 0 8px" }}>Create your account</h2>
        <p style={{ color: COLORS.helper, fontSize: 15, margin: 0 }}>Join the NRIClub network to start connecting.</p>
      </div>

      <form onSubmit={handleContinue} noValidate>
        <Field id="signup-name" label="Full name" helper="Use the name on your LinkedIn so we can approve you quickly." error={errors.name}>
          <input
            id="signup-name" ref={fieldRefs.name} type="text" autoComplete="name" autoCapitalize="words"
            value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Priya Sharma"
            aria-invalid={!!errors.name} aria-describedby={describedBy("signup-name", errors.name, true)}
            style={inputStyle(!!errors.name)} maxLength={200}
          />
        </Field>

        <Field id="signup-email" label="Email" helper="We'll send a 6-digit code to confirm it." error={errors.email}>
          <input
            id="signup-email" ref={fieldRefs.email} type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false}
            value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@email.com"
            aria-invalid={!!errors.email} aria-describedby={describedBy("signup-email", errors.email, true)}
            style={inputStyle(!!errors.email)} maxLength={254}
          />
        </Field>

        <Field id="signup-password" label="Password" helper="At least 8 characters." error={errors.password}>
          <div style={{ position: "relative" }}>
            <input
              id="signup-password" ref={fieldRefs.password} type={showPassword ? "text" : "password"} autoComplete="new-password"
              value={form.password} onChange={(e) => update("password", e.target.value)}
              aria-invalid={!!errors.password} aria-describedby={describedBy("signup-password", errors.password, true)}
              style={{ ...inputStyle(!!errors.password), paddingRight: 72 }} maxLength={72}
            />
            <button
              type="button" onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"} aria-controls="signup-password"
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: COLORS.label, fontSize: 13, fontWeight: 600, padding: "8px 10px", borderRadius: 6, fontFamily: FONT }}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </Field>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <input
              id="signup-agree" ref={fieldRefs.agree} type="checkbox" checked={form.agree}
              onChange={(e) => update("agree", e.target.checked)} style={checkboxStyle}
              aria-invalid={!!errors.agree} aria-describedby={errors.agree ? "signup-agree-error" : "signup-privacy"}
            />
            <div>
              <label htmlFor="signup-agree" style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.5, cursor: "pointer" }}>
                I'm 18 or older and accept the{" "}
                <button type="button" onClick={(e) => { e.preventDefault(); setModal("terms"); }} style={inlineLink}>Terms of Use</button>
              </label>
              <p id="signup-privacy" style={{ ...helperStyle, marginTop: 4 }}>
                We handle your data as described in our{" "}
                <button type="button" onClick={() => setModal("privacy")} style={inlineLink}>Privacy Policy</button>.
              </p>
              {errors.agree && <p id="signup-agree-error" style={fieldErrorStyle}>{errors.agree}</p>}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 28 }}>
          <input id="signup-marketing" type="checkbox" checked={form.marketing} onChange={(e) => update("marketing", e.target.checked)} style={checkboxStyle} />
          <label htmlFor="signup-marketing" style={{ fontSize: 14, color: COLORS.label, lineHeight: 1.5, cursor: "pointer" }}>
            Email me about events and community news <span style={{ color: COLORS.helper }}>(optional)</span>
          </label>
        </div>

        <button type="submit" disabled={submitting} aria-describedby={submitError ? "signup-submit-error" : undefined} style={primaryButtonStyle(submitting)}>
          {submitting ? "Creating your account..." : "Continue"}
          {!submitting && <ArrowRight />}
        </button>

        {submitError && (
          <ErrorBox id="signup-submit-error" boxRef={submitErrorRef} style={{ marginTop: 12 }}>
            {submitError.text}
            {submitError.existing && (
              <>
                {" "}
                <button type="button" onClick={() => onLogin(form.email)} style={{ ...linkButtonStyle, color: COLORS.redText }}>Log in instead</button>
              </>
            )}
          </ErrorBox>
        )}
      </form>

      <p style={{ textAlign: "center", marginTop: 28, fontSize: 13, color: COLORS.helper }}>
        Already have an account? <button type="button" onClick={() => onLogin(form.email.trim())} style={linkButtonStyle}>Log in</button>
      </p>
    </div>,
    "flex-start"
  );
}
