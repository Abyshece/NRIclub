import { useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { TermsModal, PrivacyModal, TERMS_CHANGES, PREVIOUS_TERMS_VERSION } from "./LegalModals";
import { AccountFooter } from "./AccountActions";
import { TermsCheckbox, Art9Checkbox, PrivacyNote, LegalLink, TERMS_ERROR, ART9_ERROR } from "./Consent";
import { FONT, COLORS, ErrorBox, primaryButtonStyle, ArrowRight } from "./ui";
import { mapProfile, apiErrorMessage, stillToAccept } from "./profile";

// Screen before the dashboard for members who still have to confirm they're
// 18 or older and accept the current version of the Terms of Use
// (termsVersion, from the database), or give the separate Art. 9 consent
// (asked once of members who joined before it existed). The database doesn't
// let them take part until they have. Members who accepted an earlier
// version see what changed. Same look as Get verified; they can also sign
// out, download their data or delete their account from here.
// Calls onDone(updatedUser) once the server has recorded it.
export default function TermsGate({ user, termsVersion, onDone, onSignOut }) {
  const needs = stillToAccept(user, termsVersion);
  // Accepted before, but an earlier version: the Terms have changed since.
  const termsChanged = needs.terms && !!user.ageConfirmedAt && !!user.termsAcceptedAt;
  const [agree, setAgree] = useState(false);
  const [art9, setArt9] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState(null); // "terms" | "privacy"
  const refs = { agree: useRef(null), art9: useRef(null) };
  const submitErrorRef = useRef(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => { if (submitError) submitErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [submitError]);

  const tick = (key, set) => (value) => { set(value); setErrors((e) => ({ ...e, [key]: undefined })); setSubmitError(""); };

  const submit = async (ev) => {
    ev.preventDefault();
    if (submitting) return;
    setSubmitError("");
    const found = {};
    if (needs.terms && !agree) found.agree = TERMS_ERROR;
    if (needs.art9 && !art9) found.art9 = ART9_ERROR;
    setErrors(found);
    const first = ["agree", "art9"].find((k) => found[k]);
    if (first) { refs[first].current?.focus(); return; }
    setSubmitting(true);
    let version = termsVersion;
    try {
      version = (await api.acceptTerms(termsVersion, needs.art9)) || termsVersion;
    } catch (err) {
      setSubmitError(apiErrorMessage(err, "We couldn't save that. Please try again."));
      setSubmitting(false);
      return;
    }
    // The profile as the database has it now (with what was just recorded,
    // should the read fail or not show it yet). If it still lacks the
    // consent (the database was updated while this page was open), the app
    // asks for that next.
    let updated = null;
    try { updated = mapProfile(await api.getMyProfile()); } catch {}
    const base = updated || user;
    const now = new Date().toISOString();
    onDone({
      ...base,
      ageConfirmedAt: base.ageConfirmedAt || now,
      termsAcceptedAt: base.termsVersion === version && base.termsAcceptedAt ? base.termsAcceptedAt : now,
      termsVersion: version,
      ...(needs.art9 && !base.art9ConsentAt && { art9ConsentAt: now }),
    });
    setSubmitting(false);
  };

  const intro = termsChanged
    ? "We've updated our Terms of Use. To keep using NRIClub, please read what changed and accept the new version."
    : needs.terms
      ? "To keep using NRIClub, please confirm you're 18 or older and accept our Terms of Use."
      : "One more thing: we now ask separately for your consent to what you share being shown to other members.";

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
          <p style={{ color: COLORS.helper, fontSize: 15, lineHeight: 1.55, margin: 0 }}>{intro}</p>
        </div>

        {termsChanged && TERMS_CHANGES?.length > 0 && (
          <section aria-labelledby="tg-changes-title" style={{ background: "#fff", border: "1px solid #E8E7E4", borderRadius: 12, padding: "16px 18px", marginBottom: 24 }}>
            <h3 id="tg-changes-title" style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, margin: "0 0 8px" }}>What changed</h3>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.55, color: COLORS.text }}>
              {TERMS_CHANGES.map((change) => <li key={change} style={{ marginBottom: 6 }}>{change}</li>)}
            </ul>
            <p style={{ fontSize: 13, color: COLORS.helper, lineHeight: 1.5, margin: "8px 0 0" }}>
              Read the <LegalLink href="/terms" onOpen={() => setModal("terms")}>new Terms of Use</LegalLink>
              {user.termsVersion && user.termsVersion === PREVIOUS_TERMS_VERSION && (
                <> or the <a href={`/terms/${PREVIOUS_TERMS_VERSION}`} target="_blank" rel="noopener noreferrer" style={{ color: "#3D5A9F", fontWeight: 500 }}>version you accepted before</a></>
              )}.
            </p>
          </section>
        )}

        <form onSubmit={submit} noValidate>
          {needs.terms && (
            <TermsCheckbox id="tg-agree" inputRef={refs.agree} checked={agree} onChange={tick("agree", setAgree)} error={errors.agree} onOpen={setModal} style={{ marginBottom: 16 }} />
          )}
          {needs.art9 && (
            <Art9Checkbox id="tg-art9" inputRef={refs.art9} checked={art9} onChange={tick("art9", setArt9)} error={errors.art9} style={{ marginBottom: 16 }} />
          )}
          <PrivacyNote onOpen={setModal} style={{ marginBottom: 22 }} />

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
