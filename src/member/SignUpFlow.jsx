import { useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import CodeEntry from "./CodeEntry";
import { TermsModal, PrivacyModal } from "./LegalModals";
import { TermsCheckbox, Art9Checkbox, PrivacyNote, TERMS_ERROR, ART9_ERROR } from "./Consent";
import { FONT, COLORS, inputStyle, Field, ErrorBox, primaryButtonStyle, linkButtonStyle, describedBy, GlobeTile, ArrowRight, helperStyle } from "./ui";
import { mapProfile, authErrorMessage, isExistingAccountResponse, isExistingAccountError } from "./profile";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_MS = 60 * 1000;
// Supabase refuses to "change" a password to the one it already has.
const SAME_PASSWORD_RE = /different from the old password|same_password/i;
// Profile details a signup can carry in its metadata. An unfinished signup
// from an earlier visit may have been made by someone else with this email,
// so these start empty when it is resumed.
const RESUMED_CLEAR = ["location", "country_code", "hometown", "profession", "occupation_status", "years_abroad", "linkedin_url"];

// The answers from the signup form, as the profile stores them.
const answersFrom = (form) => ({
  name: form.name,
});

// Runs step, and once more after a short pause if it fails (the first
// failure may be a dropped connection or a request that got no answer).
// Resolves to step's result, or rejects with the second failure.
const tryTwice = async (step) => {
  try {
    return await step();
  } catch {
    await new Promise((r) => setTimeout(r, 800));
    return step();
  }
};

// Signup: name, email, password, "18 or older and the Terms" and the
// separate Art. 9 consent -> 6-digit email code.
// Calls onComplete(user) once the code is verified, the account is set up
// and the member is signed in; the app then asks for verification details
// (Get verified), including the country. onBack goes back to the landing page.
// An address that already has an account gets the same next step (a code,
// which logs its owner in), so this page never says whether someone is a
// member: being one can say something about a person's origin.
export default function SignUpFlow({ onComplete, onLogin, onBack }) {
  const [step, setStep] = useState("account"); // account | code | stopped
  const [stopMessage, setStopMessage] = useState(""); // why signup stopped (step "stopped")
  const [form, setForm] = useState({ name: "", email: "", password: "", agree: false, art9: false });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null); // { text }
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [modal, setModal] = useState(null); // "terms" | "privacy"
  // The account created during this visit ({ email, password, resumed,
  // answers }: the password and answers it was created with), so going back
  // to fix something doesn't create a second account for the same address;
  // or { email, existing: true } for an address that already had one.
  const [account, setAccount] = useState(null);
  const [resendAt, setResendAt] = useState(0);

  const fieldRefs = { name: useRef(null), email: useRef(null), password: useRef(null), agree: useRef(null), art9: useRef(null) };
  const submitErrorRef = useRef(null);
  const focusOnAccountStep = useRef("name");
  const stopTitleRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (step === "stopped") stopTitleRef.current?.focus();
  }, [step]);
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
    if (!v.agree) e.agree = TERMS_ERROR;
    if (!v.art9) e.art9 = ART9_ERROR;
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
    const first = ["name", "email", "password", "agree", "art9"].find((k) => found[k]);
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
      // Only the name: the signup step ignores anything else, as anyone can
      // sign up any address through the API. The 18+/Terms tick and the
      // Art. 9 consent are recorded once the code is confirmed (verifyCode).
      const metadata = { full_name: v.name };
      let result = null;
      let existing = false;
      try {
        result = await api.signUp(v.email, v.password, metadata);
        existing = isExistingAccountResponse(result);
      } catch (err) {
        if (!isExistingAccountError(err)) throw err;
        existing = true;
      }
      if (existing) {
        // Already a member: a code to log in with, and the same code screen
        // as for a new account. A failure here (e.g. a code was sent a
        // moment ago) looks the same too; "Resend code" tries again.
        await api.sendOtp(v.email).catch(() => {});
        setAccount({ email: v.email, existing: true });
      } else {
        // An unfinished signup from an earlier visit comes back with its old
        // creation time (Supabase only re-sends the code).
        const u = result?.user ?? result;
        const lastSent = Math.max(Date.parse(u?.confirmation_sent_at) || 0, Date.parse(u?.updated_at) || 0);
        const resumed = !!u?.created_at && lastSent - Date.parse(u.created_at) > 30000;
        setAccount({ email: v.email, password: v.password, resumed, answers: answersFrom(v) });
      }
      setResendAt(Date.now() + RESEND_MS);
      setStep("code");
    } catch (err) {
      setSubmitError({ text: authErrorMessage(err) || "We couldn't create your account. Please try again." });
    }
    setSubmitting(false);
  };

  // Sets the password typed in this visit, trying twice. Supabase saying
  // it's already that password counts as done (also when the first attempt
  // went through but its answer never came).
  const replacePassword = () => tryTwice(async () => {
    try {
      await api.updatePassword(form.password);
    } catch (err) {
      if (!SAME_PASSWORD_RE.test(err?.message || "")) throw err;
    }
  });

  // Ends signup on a screen that explains why and sends the member to log in.
  const stop = (message) => {
    setStopMessage(message);
    setStep("stopped");
  };

  // The profile changes that bring the account in line with this visit's
  // answers. A resumed signup gets all of them, and the earlier visit's
  // details are cleared; otherwise only the answers changed (by going back)
  // since this visit created the account.
  const profilePatch = () => {
    const want = answersFrom(form);
    if (account.resumed) {
      RESUMED_CLEAR.forEach((k) => { want[k] = ""; });
      return want;
    }
    const patch = {};
    for (const [k, v] of Object.entries(want)) {
      if (account.answers[k] !== v) patch[k] = v;
    }
    return patch;
  };

  // Puts this visit's answers in place (profilePatch) and records the 18+ and
  // Terms tick and the Art. 9 consent, with the session the code gave (the
  // Terms version the database expects; the consent once the database can
  // record it). Both can be sent again.
  const setUpAccount = async () => {
    const patch = profilePatch();
    if (Object.keys(patch).length) await api.updateProfile(patch);
    await api.acceptTerms(await api.getCurrentTermsVersion(), true);
  };

  // Loads the profile of the account the code signed in to, then keeps the
  // session (so it lasts across reloads and tabs) and goes on.
  const finish = async (giveUp) => {
    const db = await tryTwice(async () => {
      const profile = await api.getMyProfile();
      if (!profile) throw new Error("Profile not found");
      return profile;
    }).catch(() => null);
    if (!db) {
      await giveUp("Your account is ready, but we couldn't load your profile, so we've signed you out. Please log in with your email and the password you just chose.");
      return;
    }
    await api.adoptSession();
    onComplete(mapProfile(db));
  };

  const verifyCode = async (code) => {
    const email = account.email;
    // Wrong or expired codes throw here and CodeEntry says so. The session is
    // kept in this tab's memory only until the account is set up below: if a
    // step fails, or the tab is reloaded or closed half-way, nobody is left
    // signed in to an account that may still have an earlier visit's
    // password or details.
    let session = await api.verifyOtp(email, code, { persist: false });
    // The code is used up now, so every way out below ends signed out, on
    // the "please log in" screen, unless all the steps work.
    const giveUp = async (message) => {
      await api.discardSession().catch(() => {});
      stop(message);
    };
    try {
      // An address that already had an account: the code logged its owner
      // in. Nothing on the account changes here (not the name or password
      // typed on this page); the app asks for anything still missing, such
      // as the current Terms.
      if (account.existing) {
        if (!session?.access_token) {
          stop("We couldn't sign you in. Please log in with your email and password. If your password doesn't work, choose “Forgot password?” to set a new one.");
          return;
        }
        await finish(async () => {
          await giveUp("We couldn't load your profile, so we've signed you out. Please log in with your email and password.");
        });
        return;
      }
      if (!session?.access_token) session = await api.signIn(email, form.password, { persist: false }).catch(() => null);
      if (!session?.access_token) {
        stop("We couldn't sign you in. Please log in with your email and password. If your password doesn't work, choose “Forgot password?” to set a new one.");
        return;
      }

      // An unfinished signup from an earlier visit keeps that visit's
      // password (as does going back and changing it here), and that visit
      // may not have been this person. Set the one typed now before anything
      // else. A resumed signup gets this visit's answers first as well (and
      // again below): if the tab is closed once the new password is saved
      // but before its answer arrives, the account mustn't keep the earlier
      // visit's details.
      if (account.resumed) await tryTwice(setUpAccount).catch(() => {});
      if (account.resumed || account.password !== form.password) {
        if (!(await replacePassword().then(() => true, () => false))) {
          // Still put this visit's answers and the 18+/Terms tick in place,
          // so the account doesn't keep the earlier visit's details after a
          // password reset.
          await setUpAccount().catch(() => {});
          await giveUp("We couldn't save your password, so we've signed you out to keep your account safe. On the login page, choose “Forgot password?” to set a new one.");
          return;
        }
      }

      // Then this visit's answers replace what an earlier visit left in the
      // profile, and the 18+/Terms tick is recorded, before anything reads it.
      if (!(await tryTwice(setUpAccount).then(() => true, () => false))) {
        await giveUp("We couldn't finish setting up your account, so we've signed you out to keep it safe. Please log in with your email and the password you just chose, then check your details.");
        return;
      }

      // Only then is the session saved, so it lasts across reloads and tabs.
      await finish(giveUp);
    } catch {
      // E.g. the session ended meanwhile (adoptSession).
      await giveUp("Something went wrong signing you in, so we've signed you out. Please log in with your email and the password you just chose.");
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

  // ---- SIGNUP STOPPED (email confirmed, but the member must log in) ----
  if (step === "stopped") {
    return page(
      <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
        <h2 ref={stopTitleRef} tabIndex={-1} style={{ fontSize: 24, fontWeight: 700, color: COLORS.text, margin: "0 0 16px", outline: "none" }}>Your email is confirmed</h2>
        <ErrorBox style={{ textAlign: "left", marginBottom: 20 }}>{stopMessage}</ErrorBox>
        <button type="button" onClick={() => onLogin(account?.email)} style={primaryButtonStyle()}>
          Go to log in <ArrowRight />
        </button>
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
        {/* For everyone, so the page doesn't say which it was. */}
        <p style={{ ...helperStyle, textAlign: "center", marginTop: 20 }}>
          Already have an account with this email? Then the code logs you in to it.
        </p>
      </div>
    );
  }

  // ---- CREATE YOUR ACCOUNT ----
  return page(
    <div style={{ maxWidth: 460, width: "100%" }}>
      <button type="button" onClick={onBack} style={{ ...linkButtonStyle, textDecoration: "none", fontWeight: 500, color: COLORS.helper, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 20 }}>
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

        <div style={{ marginBottom: 28 }}>
          <TermsCheckbox id="signup-agree" inputRef={fieldRefs.agree} checked={form.agree} onChange={(v) => update("agree", v)} error={errors.agree} onOpen={setModal} style={{ marginBottom: 14 }} />
          <Art9Checkbox id="signup-art9" inputRef={fieldRefs.art9} checked={form.art9} onChange={(v) => update("art9", v)} error={errors.art9} style={{ marginBottom: 14 }} />
          <PrivacyNote onOpen={setModal} />
        </div>

        <button type="submit" disabled={submitting} aria-describedby={submitError ? "signup-submit-error" : undefined} style={primaryButtonStyle(submitting)}>
          {submitting ? "Creating your account..." : "Continue"}
          {!submitting && <ArrowRight />}
        </button>

        {submitError && (
          <ErrorBox id="signup-submit-error" boxRef={submitErrorRef} style={{ marginTop: 12 }}>{submitError.text}</ErrorBox>
        )}
      </form>

      <p style={{ textAlign: "center", marginTop: 28, fontSize: 13, color: COLORS.helper }}>
        Already have an account? <button type="button" onClick={() => onLogin(form.email.trim())} style={linkButtonStyle}>Log in</button>
      </p>
    </div>,
    "flex-start"
  );
}
