import { useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import {
  TermsModal, PrivacyModal, TERMS_CHANGES, TERMS_EARLIER_CHANGES, TERMS_NEEDED_FOR, TERMS_ARCHIVE, TERMS_VERSION,
  ART9_CHANGES, ART9_CONSENT_VERSION,
} from "./LegalModals";
import { AccountFooter } from "./AccountActions";
import { TermsCheckbox, Art9Checkbox, PrivacyNote, LegalLink, TERMS_ERROR, ART9_ERROR } from "./Consent";
import { FONT, COLORS, ErrorBox, primaryButtonStyle, ArrowRight } from "./ui";
import { mapProfile, apiErrorMessage, stillToAccept, consentToRenew } from "./profile";

// Screen before the dashboard for members who still have to confirm they're
// 18 or older and accept the current version of the Terms of Use
// (termsVersion, from the database), or give the separate Art. 9 consent
// (asked once of members who joined before it existed). The database doesn't
// let them take part until they have. Members who accepted an earlier
// version see what's new; if they gave the consent to an earlier wording,
// the screen asks for it in the new one along with the Terms (their earlier
// consent still counts until they accept). Same look as Get verified; they
// can also sign out, download their data or delete their account from here.
// Calls onDone(updatedUser) once the server has recorded it. onLater: for a
// member on an earlier version still in force, whose Terms still apply until
// they accept the new ones (section 14 of the Terms): they may answer
// "Later" and go on (App asks again the next time NRIClub is opened).
export default function TermsGate({ user, termsVersion, onDone, onSignOut, onLater = null }) {
  const needs = stillToAccept(user, termsVersion);
  // Accepted before, but an earlier version: the Terms have changed since.
  const termsChanged = needs.terms && !!user.ageConfirmedAt && !!user.termsAcceptedAt;
  // The consent again, in its new wording, with the new Terms.
  const renew = needs.terms && !needs.art9 && consentToRenew(user, termsVersion, TERMS_VERSION, ART9_CONSENT_VERSION);
  const askArt9 = needs.art9 || renew;
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
    if (askArt9 && !art9) found.art9 = ART9_ERROR;
    setErrors(found);
    const first = ["agree", "art9"].find((k) => found[k]);
    if (first) { refs[first].current?.focus(); return; }
    setSubmitting(true);
    let version = termsVersion;
    try {
      version = (await api.acceptTerms(termsVersion, askArt9)) || termsVersion;
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
      // The wording the consent box showed: the current one once the
      // database knows this site's Terms (Art9Checkbox).
      ...(askArt9 && (!base.art9ConsentAt || (renew && base.art9ConsentVersion !== ART9_CONSENT_VERSION)) && {
        art9ConsentAt: now, ...(version === TERMS_VERSION && { art9ConsentVersion: ART9_CONSENT_VERSION }),
      }),
    });
    setSubmitting(false);
  };

  // What's new in the version this site shows (not while the database still
  // asks for an earlier one), what changed before it for a member on an even
  // earlier version, and the consent's new wording.
  const showChanges = termsChanged && termsVersion === TERMS_VERSION && TERMS_CHANGES?.length > 0;
  const changes = showChanges
    ? [...TERMS_CHANGES, TERMS_EARLIER_CHANGES?.[user.termsVersion], renew && ART9_CHANGES].filter(Boolean) : [];
  const readChanges = showChanges ? "read what's new and " : "";
  const intro = onLater
    ? `We've updated our Terms of Use. Please ${readChanges}accept the new version.`
    : termsChanged
      ? `We've updated our Terms of Use. To keep using NRIClub, please ${readChanges}accept the new version.`
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

        {showChanges && (
          <section aria-labelledby="tg-changes-title" style={{ background: "#fff", border: "1px solid #E8E7E4", borderRadius: 12, padding: "16px 18px", marginBottom: 24 }}>
            <h3 id="tg-changes-title" style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, margin: "0 0 8px" }}>What's new</h3>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.55, color: COLORS.text }}>
              {changes.map((change) => <li key={change} style={{ marginBottom: 6 }}>{change}</li>)}
            </ul>
            <p style={{ fontSize: 13, color: COLORS.helper, lineHeight: 1.5, margin: "8px 0 0" }}>
              Read the <LegalLink href="/terms" onOpen={() => setModal("terms")}>new Terms of Use</LegalLink>
              {user.termsVersion && TERMS_ARCHIVE[user.termsVersion] && (
                <> or the <a href={`/terms/${user.termsVersion}`} target="_blank" rel="noopener noreferrer" style={{ color: "#3D5A9F", fontWeight: 500 }}>version you accepted before</a></>
              )}.
            </p>
          </section>
        )}

        <form onSubmit={submit} noValidate>
          {needs.terms && (
            <TermsCheckbox id="tg-agree" inputRef={refs.agree} checked={agree} onChange={tick("agree", setAgree)} error={errors.agree} onOpen={setModal} style={{ marginBottom: 16 }} />
          )}
          {askArt9 && (
            <Art9Checkbox id="tg-art9" inputRef={refs.art9} checked={art9} onChange={tick("art9", setArt9)} error={errors.art9} style={{ marginBottom: 16 }} />
          )}
          <PrivacyNote onOpen={setModal} style={{ marginBottom: 22 }} />

          {/* Not disabled while saving: a disabled button loses keyboard focus. */}
          <button type="submit" aria-disabled={submitting} aria-describedby={submitError ? "tg-submit-error" : undefined} style={{ ...primaryButtonStyle(submitting), marginTop: 6 }}>
            {submitting ? "Saving..." : onLater ? "Accept" : "Continue"}
            {!submitting && <ArrowRight />}
          </button>
          {submitError && <ErrorBox id="tg-submit-error" boxRef={submitErrorRef} style={{ marginTop: 12 }}>{submitError}</ErrorBox>}
          {onLater && (
            <>
              <button type="button" onClick={() => { if (!submitting) onLater(); }} aria-describedby="tg-later-note"
                style={{ ...primaryButtonStyle(false), background: "#fff", color: COLORS.text, border: `1px solid ${COLORS.border}`, marginTop: 10 }}>
                Later
              </button>
              <p id="tg-later-note" style={{ fontSize: 13, color: COLORS.helper, lineHeight: 1.5, margin: "10px 0 0" }}>
                Until you accept, the Terms you accepted before still apply and you can keep using NRIClub
                {TERMS_NEEDED_FOR ? `, but you need the new version for ${TERMS_NEEDED_FOR}` : ""}. We'll ask again the next time you open NRIClub.
              </p>
            </>
          )}
        </form>

        <AccountFooter email={user.email} onSignOut={onSignOut} />
      </div>
      {modal === "terms" && <TermsModal onClose={() => setModal(null)} />}
      {modal === "privacy" && <PrivacyModal onClose={() => setModal(null)} />}
    </div>
  );
}
