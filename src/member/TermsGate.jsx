import { useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { TermsModal, PrivacyModal, TERMS_VERSION } from "./LegalModals";
import { AccountFooter } from "./AccountActions";
import { FONT, COLORS, ErrorBox, primaryButtonStyle, linkButtonStyle, helperStyle, fieldErrorStyle, ArrowRight } from "./ui";
import { mapProfile, apiErrorMessage } from "./profile";

// Screen before the dashboard for members who never confirmed they're 18 or
// older and accepted the Terms of Use (accounts from before signup asked, or
// made outside the site), or who accepted an earlier version of the Terms
// than TERMS_VERSION. The database doesn't count them as active members
// until they do. Same look as Get verified; they can also sign out, download
// their data or delete their account from here.
// Calls onDone(updatedUser) once the server has recorded it.
export default function TermsGate({ user, onDone, onSignOut }) {
  // Accepted before, but an earlier version: the Terms have changed since.
  const termsChanged = !!user.ageConfirmedAt && !!user.termsAcceptedAt && user.termsVersion !== TERMS_VERSION;
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null); // "terms" | "privacy"
  const agreeRef = useRef(null);
  const submitErrorRef = useRef(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => { if (submitError) submitErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [submitError]);

  const submit = async (ev) => {
    ev.preventDefault();
    if (submitting) return;
    setSubmitError("");
    if (!agree) {
      setError("Please confirm you're 18 or older and accept the Terms of Use.");
      agreeRef.current?.focus();
      return;
    }
    setSubmitting(true);
    let version = TERMS_VERSION;
    try {
      version = (await api.acceptTerms(TERMS_VERSION)) || TERMS_VERSION;
    } catch (err) {
      setSubmitError(apiErrorMessage(err, "We couldn't save that. Please try again."));
      setSubmitting(false);
      return;
    }
    let updated = null;
    try { updated = mapProfile(await api.getMyProfile()); } catch {}
    const now = new Date().toISOString();
    const sameTerms = user.termsAcceptedAt && user.termsVersion === version;
    onDone(updated && updated.ageConfirmedAt && updated.termsAcceptedAt && updated.termsVersion === version ? updated : {
      ...user, ageConfirmedAt: user.ageConfirmedAt || now,
      termsAcceptedAt: sameTerms ? user.termsAcceptedAt : now, termsVersion: version,
    });
  };

  const checkboxStyle = { marginTop: 2, accentColor: "#37352F", width: 18, height: 18, flexShrink: 0, cursor: "pointer" };
  const inlineLink = { ...linkButtonStyle, fontWeight: 500, color: "#3D5A9F" };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.page, fontFamily: FONT }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "40px 16px 60px" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#E3FCEF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22A06B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /><path d="M9 15l2 2 4-4" />
            </svg>
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: COLORS.text, letterSpacing: "-0.03em", margin: "0 0 8px" }}>Before you continue</h2>
          <p style={{ color: COLORS.helper, fontSize: 15, lineHeight: 1.55, margin: 0 }}>
            {termsChanged
              ? "We've updated our Terms of Use. To keep using NRIClub, please read them and accept the new version."
              : "To keep using NRIClub, please confirm you're 18 or older and accept our Terms of Use."}
          </p>
        </div>

        <form onSubmit={submit} noValidate>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 22 }}>
            <input
              id="tg-agree" ref={agreeRef} type="checkbox" checked={agree}
              onChange={(e) => { setAgree(e.target.checked); setError(""); setSubmitError(""); }} style={checkboxStyle}
              aria-invalid={!!error} aria-describedby={error ? "tg-agree-error" : "tg-privacy"}
            />
            <div>
              <label htmlFor="tg-agree" style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.5, cursor: "pointer" }}>
                I'm 18 or older and accept the{" "}
                <button type="button" onClick={(e) => { e.preventDefault(); setModal("terms"); }} style={inlineLink}>Terms of Use</button>
              </label>
              <p id="tg-privacy" style={{ ...helperStyle, marginTop: 4 }}>
                We handle your data as described in our{" "}
                <button type="button" onClick={() => setModal("privacy")} style={inlineLink}>Privacy Policy</button>.
              </p>
              {error && <p id="tg-agree-error" style={fieldErrorStyle}>{error}</p>}
            </div>
          </div>

          {/* Not disabled while saving: a disabled button loses keyboard focus. */}
          <button type="submit" aria-disabled={submitting} aria-describedby={submitError ? "tg-submit-error" : undefined} style={{ ...primaryButtonStyle(submitting), marginTop: 6 }}>
            {submitting ? "Saving..." : "Continue"}
            {!submitting && <ArrowRight />}
          </button>
          {submitError && <ErrorBox id="tg-submit-error" boxRef={submitErrorRef} style={{ marginTop: 12 }}>{submitError}</ErrorBox>}
        </form>

        <AccountFooter email={user.email} onSignOut={onSignOut} />
      </div>
      {modal === "terms" && <TermsModal onClose={() => setModal(null)} />}
      {modal === "privacy" && <PrivacyModal onClose={() => setModal(null)} />}
    </div>
  );
}
