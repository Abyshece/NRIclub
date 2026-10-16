import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { TermsModal, PrivacyModal } from "./LegalModals";
import { AccountFooter } from "./AccountActions";
import { VERIFICATION_BANNER_ID } from "./VerificationBanner";
import { TermsCheckbox, Art9Checkbox, PrivacyNote, TERMS_ERROR, ART9_ERROR } from "./Consent";
import { readInvite, forgetInvite, invitedByText, isInvitedByText } from "./invite";
import { FONT, COLORS, inputStyle, Field, ErrorBox, primaryButtonStyle, linkButtonStyle, describedBy } from "./ui";
import {
  mapProfile, countryName, getCountryOptions, MAJOR_INDIAN_CITIES,
  cityFromGroupName, linkedinProblem, apiErrorMessage, stillToAccept,
} from "./profile";

const NOTE_MIN = 20;
// Shown first in the Country list, above the full A-Z list.
const COMMON_COUNTRIES = ["IN", "US", "GB", "CA", "AU", "DE", "AE", "SG"];
const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

// "Get verified": city, country and LinkedIn (or a short note on how the
// member is connected to the community). Required for members whose
// verification_status is 'incomplete' (mode "required": besides the form they
// can sign out, download their data or delete their account); also opened
// from the dashboard to answer an admin's request for more information (mode
// "update", prefilled, can be cancelled). termsVersion: the current version
// of the Terms (the app passes it; asked for here otherwise).
// Calls onDone(updatedUser) after a successful submit.
export default function GetVerified({ user, mode = "required", termsVersion, onDone, onCancel, onSignOut }) {
  const isUpdate = mode === "update";
  // In India: country 'IN', or no country yet and never lived abroad.
  const isIndia = user.countryCode === "IN" || (!user.countryCode && user.isNRI === false);
  const hasNoteOnly = !user.linkedinUrl && !!user.verificationNote;
  // Accounts with no 18+ and Terms record (from before signup asked for them,
  // or whose signup stopped before they were recorded, e.g. one finished
  // with "Forgot password?"), or that accepted an earlier version of the
  // Terms, confirm them here; and give the Art. 9 consent if they haven't.
  const [currentTerms, setCurrentTerms] = useState(termsVersion || null);
  useEffect(() => {
    if (currentTerms) return;
    api.getCurrentTermsVersion().then(setCurrentTerms).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const needs = stillToAccept(user, currentTerms);

  const [country, setCountry] = useState(isIndia ? "IN" : user.countryCode || "");
  const [city, setCity] = useState(user.city || (user.location || "").split(",")[0].trim());
  const [useLinkedin, setUseLinkedin] = useState(!hasNoteOnly);
  const [linkedin, setLinkedin] = useState(user.linkedinUrl || "");
  const [note, setNote] = useState(user.verificationNote || "");
  // Who invited them, if they came through a member's invite link: a link
  // from before invite codes says so itself; a code is looked up. Once the
  // details are sent the invite is forgotten, so when they correct them
  // (our team asked for more information) it comes from what they sent.
  const [invitedBy, setInvitedBy] = useState(() => {
    const inv = readInvite();
    if (inv?.id) return invitedByText(inv.id, inv.from);
    return isInvitedByText(user.voucher) ? user.voucher : "";
  });
  const [voucher, setVoucher] = useState(user.voucher || invitedBy);
  useEffect(() => {
    const inv = readInvite();
    if (!inv?.code) return;
    let alive = true;
    api.resolveInvite(inv.code).then((found) => {
      if (!alive || !found) return;
      const text = invitedByText(found.id, found.first);
      setInvitedBy(text);
      setVoucher((v) => v || text);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const [profession, setProfession] = useState(user.profession || "");
  const [agree, setAgree] = useState(false);
  const [art9, setArt9] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [groupCities, setGroupCities] = useState([]);
  const [modal, setModal] = useState(null); // "terms" | "privacy"
  const inIndia = country === "IN";

  const refs = { country: useRef(null), city: useRef(null), linkedin: useRef(null), note: useRef(null), agree: useRef(null), art9: useRef(null) };
  const submitErrorRef = useRef(null);
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const swapped = useRef(false);

  // City suggestions from the approved "Indians in X" groups (the member is
  // signed in now, so groups can be read).
  useEffect(() => {
    let alive = true;
    api.getGroups()
      .then((groups) => {
        if (!alive) return;
        const names = (groups || []).map((g) => cityFromGroupName(g.name)).filter(Boolean);
        setGroupCities([...new Set(names)].sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // The groups are abroad, so members in India get Indian cities instead.
  const cityOptions = inIndia ? MAJOR_INDIAN_CITIES : groupCities;
  const countries = useMemo(() => getCountryOptions(), []);

  useEffect(() => { if (submitError) submitErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [submitError]);
  // Opened over the dashboard: focus moves into it and Tab stays inside,
  // Escape closes it, and focus goes back to where it was afterwards. After a
  // submit the "Update details" button is gone (the banner now says the
  // profile is in review), so focus goes to that banner instead.
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  const modalOpen = useRef(false);
  modalOpen.current = !!modal;
  useEffect(() => {
    if (mode !== "update") return;
    const previous = document.activeElement;
    titleRef.current?.focus();
    const onKey = (e) => {
      if (modalOpen.current) return; // the Terms or Privacy dialog handles its own keys
      if (e.key === "Escape") cancelRef.current?.();
      if (e.key !== "Tab") return;
      const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      const outside = !dialogRef.current.contains(document.activeElement);
      if (e.shiftKey ? i <= 0 : (i === items.length - 1 || outside)) {
        e.preventDefault();
        items[e.shiftKey ? items.length - 1 : 0].focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const target = previous && previous.isConnected ? previous : document.getElementById(VERIFICATION_BANNER_ID);
      if (target && target.focus) target.focus();
    };
  }, [mode]);
  useEffect(() => {
    if (!swapped.current) return;
    (useLinkedin ? refs.linkedin : refs.note).current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useLinkedin]);

  const clearError = (key) => { if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined })); setSubmitError(""); };
  const swap = (toLinkedin) => { swapped.current = true; setUseLinkedin(toLinkedin); setErrors({}); setSubmitError(""); };

  const validate = () => {
    const e = {};
    if (!country) e.country = "Please choose your country.";
    if (!city.trim()) e.city = "Please enter the city you live in.";
    if (useLinkedin) {
      const problem = linkedinProblem(linkedin);
      if (problem) e.linkedin = problem;
    } else {
      const n = note.trim().length;
      if (!n) e.note = "Tell us in a sentence or two how you're connected to the community.";
      else if (n < NOTE_MIN) e.note = `Please write a little more (at least ${NOTE_MIN} characters, you have ${n}).`;
    }
    if (needs.terms && !agree) e.agree = TERMS_ERROR;
    if (needs.art9 && !art9) e.art9 = ART9_ERROR;
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (submitting) return;
    setSubmitError("");
    const found = validate();
    setErrors(found);
    const first = ["country", "city", "linkedin", "note", "agree", "art9"].find((k) => found[k]);
    if (first) { refs[first].current?.focus(); return; }

    const cityName = city.trim().replace(/\s+/g, " ");
    const details = {
      city: cityName,
      countryCode: country,
      location: `${cityName}, ${countryName(country)}`,
      linkedinUrl: useLinkedin ? linkedin.trim() : "",
      note: useLinkedin ? "" : note.trim(),
      voucher: useLinkedin ? invitedBy : voucher.trim(),
      profession: profession.trim(),
    };
    setSubmitting(true);
    let version = currentTerms;
    try {
      // The 18+/Terms tick and the Art. 9 consent first (accepting the same
      // again changes nothing, if the details need another try).
      if (needs.terms || needs.art9) {
        version = version || await api.getCurrentTermsVersion();
        version = (await api.acceptTerms(version, needs.art9)) || version;
      }
      await api.submitVerification(details);
    } catch (err) {
      setSubmitError(apiErrorMessage(err, "We couldn't send your details. Please try again."));
      setSubmitting(false);
      return;
    }
    // Our team has who invited them now: the browser needn't keep it.
    forgetInvite();
    let updated = null;
    try { updated = mapProfile(await api.getMyProfile()); } catch {}
    const now = new Date().toISOString();
    // The dashboard opens at the top, not where this form was scrolled to.
    if (!isUpdate) window.scrollTo(0, 0);
    onDone(updated || {
      ...user, city: details.city, countryCode: country, location: details.location, linkedinUrl: details.linkedinUrl,
      verificationNote: details.note, voucher: details.voucher, profession: details.profession,
      verificationStatus: "pending", verificationMessage: "", isNRI: country !== "IN",
      ...(needs.terms && {
        ageConfirmedAt: user.ageConfirmedAt || now,
        termsAcceptedAt: (user.termsVersion === version && user.termsAcceptedAt) || now,
        termsVersion: version,
      }),
      ...(needs.art9 && { art9ConsentAt: now }),
    });
  };

  const textareaStyle = { ...inputStyle(!!errors.note), minHeight: 96, resize: "vertical", lineHeight: 1.5 };
  const swapLinkStyle = { ...linkButtonStyle, fontWeight: 500, color: "#3D5A9F", fontSize: 13 };

  return (
    <div
      ref={dialogRef}
      style={isUpdate
        ? { position: "fixed", inset: 0, zIndex: 120, overflowY: "auto", background: COLORS.page, fontFamily: FONT }
        : { minHeight: "100vh", background: COLORS.page, fontFamily: FONT }}
      role={isUpdate ? "dialog" : undefined}
      aria-modal={isUpdate ? "true" : undefined}
      aria-labelledby="gv-title"
    >
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "40px 16px 60px" }}>
        {isUpdate && (
          <button type="button" onClick={onCancel} style={{ ...linkButtonStyle, textDecoration: "none", fontWeight: 500, color: COLORS.helper, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 20 }}>
            <span aria-hidden="true">←</span> Back
          </button>
        )}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#E3FCEF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22A06B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <h2 id="gv-title" ref={titleRef} tabIndex={-1} style={{ fontSize: 28, fontWeight: 700, color: COLORS.text, letterSpacing: "-0.03em", margin: "0 0 8px", outline: "none" }}>{isUpdate ? "Update your details" : "Get verified"}</h2>
          {/* Updating answers the team's request (the "Our team asked" box
              below says why), so the first-time intro isn't repeated. */}
          {!isUpdate && (
            <p style={{ color: COLORS.helper, fontSize: 15, lineHeight: 1.55, margin: 0 }}>
              NRIClub is for real people only, so our team checks every new member before they can take part.
              It takes a minute to fill in, and our check usually takes a day.
            </p>
          )}
        </div>

        {isUpdate && user.verificationMessage && (
          <div style={{ padding: "12px 14px", background: "#FFF8E6", border: "1px solid #FCE7B2", borderRadius: 8, marginBottom: 24, fontSize: 13, lineHeight: 1.5, color: "#7A4D00" }}>
            <strong>Our team asked:</strong> {user.verificationMessage}
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <Field id="gv-country" label="Country" helper="The country where you live now." error={errors.country}>
            <select
              id="gv-country" ref={refs.country} value={country} autoComplete="country"
              onChange={(e) => { setCountry(e.target.value); clearError("country"); }}
              aria-invalid={!!errors.country} aria-describedby={describedBy("gv-country", errors.country, true)}
              style={{ ...inputStyle(!!errors.country), cursor: "pointer", color: country ? COLORS.text : COLORS.helper }}
            >
              <option value="">Choose your country</option>
              <optgroup label="Common">
                {COMMON_COUNTRIES.map((code) => <option key={code} value={code}>{countryName(code)}</option>)}
              </optgroup>
              <optgroup label="All countries">
                {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </optgroup>
            </select>
          </Field>

          <Field id="gv-city" label="City" helper={inIndia ? "The city in India where you live now." : "The city where you live now."} error={errors.city}>
            <input
              id="gv-city" ref={refs.city} type="text" list="gv-city-options" autoComplete="address-level2" autoCapitalize="words"
              value={city} onChange={(e) => { setCity(e.target.value); clearError("city"); }}
              placeholder={inIndia ? "e.g. Bengaluru" : "e.g. Berlin"} maxLength={200}
              aria-invalid={!!errors.city} aria-describedby={describedBy("gv-city", errors.city, true)}
              style={inputStyle(!!errors.city)}
            />
            <datalist id="gv-city-options">
              {cityOptions.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>

          {useLinkedin ? (
            <Field id="gv-linkedin" label="LinkedIn profile" helper={user.hasLinkedinChoice
              ? "Copy the link from your LinkedIn profile page. Our team uses it to check you. Other members see it only if you choose so in Edit profile."
              : "Copy the link from your LinkedIn profile page. Our team uses it to check you, and other members see it on your profile."} error={errors.linkedin} style={{ marginBottom: 10 }}>
              <input
                id="gv-linkedin" ref={refs.linkedin} type="text" inputMode="url" autoComplete="url" autoCapitalize="none" spellCheck={false}
                value={linkedin} onChange={(e) => { setLinkedin(e.target.value); clearError("linkedin"); }}
                onBlur={() => { if (linkedin.trim()) { const p = linkedinProblem(linkedin); if (p) setErrors((e) => ({ ...e, linkedin: p })); } }}
                placeholder="linkedin.com/in/your-name" maxLength={500}
                aria-invalid={!!errors.linkedin} aria-describedby={describedBy("gv-linkedin", errors.linkedin, true)}
                style={inputStyle(!!errors.linkedin)}
              />
            </Field>
          ) : (
            <>
              <Field id="gv-note" label={inIndia ? "How are you connected to the NRI community?" : "How are you connected to the Indian community here?"} helper={`For example your university, employer or a community group you're part of. Your origin, nationality or religion doesn't matter. At least ${NOTE_MIN} characters.`} error={errors.note}>
                <textarea
                  id="gv-note" ref={refs.note} value={note} maxLength={1000}
                  onChange={(e) => { setNote(e.target.value); clearError("note"); }}
                  placeholder={inIndia ? "e.g. I'm moving to Berlin for my MSc at TU Berlin this autumn." : "e.g. I'm doing my MSc at TU Munich and help run the Indian students' association."}
                  aria-invalid={!!errors.note} aria-describedby={describedBy("gv-note", errors.note, true)}
                  style={textareaStyle}
                />
              </Field>
              <Field id="gv-voucher" label="A member who can vouch for you" optional helper="Their name or email, if someone on NRIClub knows you." style={{ marginBottom: 10 }}>
                <input
                  id="gv-voucher" type="text" value={voucher} maxLength={200} autoCapitalize="words"
                  onChange={(e) => setVoucher(e.target.value)} aria-describedby="gv-voucher-help"
                  style={inputStyle(false)}
                />
              </Field>
            </>
          )}
          <p style={{ margin: "0 0 26px", fontSize: 13 }}>
            {useLinkedin
              ? <button type="button" onClick={() => swap(false)} style={swapLinkStyle}>I don't have LinkedIn</button>
              : <button type="button" onClick={() => swap(true)} style={swapLinkStyle}>Use my LinkedIn profile instead</button>}
          </p>

          <Field id="gv-profession" label="What do you do?" optional>
            <input
              id="gv-profession" type="text" value={profession} maxLength={200} autoComplete="organization-title"
              onChange={(e) => setProfession(e.target.value)} placeholder="e.g. Software Engineer at SAP"
              style={inputStyle(false)}
            />
          </Field>

          {(needs.terms || needs.art9) && (
            <div style={{ marginBottom: 22 }}>
              {needs.terms && (
                <TermsCheckbox id="gv-agree" inputRef={refs.agree} checked={agree} onChange={(v) => { setAgree(v); clearError("agree"); }} error={errors.agree} onOpen={setModal} style={{ marginBottom: 14 }} />
              )}
              {needs.art9 && (
                <Art9Checkbox id="gv-art9" inputRef={refs.art9} checked={art9} onChange={(v) => { setArt9(v); clearError("art9"); }} error={errors.art9} style={{ marginBottom: 14 }} />
              )}
              <PrivacyNote onOpen={setModal} />
            </div>
          )}

          {/* Not disabled while sending: a disabled button loses keyboard focus. */}
          <button type="submit" aria-disabled={submitting} aria-describedby={submitError ? "gv-submit-error" : undefined} style={{ ...primaryButtonStyle(submitting), marginTop: 6 }}>
            {submitting ? "Sending..." : isUpdate ? "Send update" : "Submit for review"}
          </button>
          {submitError && <ErrorBox id="gv-submit-error" boxRef={submitErrorRef} style={{ marginTop: 12 }}>{submitError}</ErrorBox>}
        </form>

        {isUpdate ? (
          <p style={{ textAlign: "center", marginTop: 28, fontSize: 13, color: COLORS.helper, lineHeight: 1.6 }}>
            <button type="button" onClick={onCancel} style={{ ...linkButtonStyle, fontWeight: 500, color: COLORS.label }}>Cancel</button>
          </p>
        ) : (
          // Settings can't be reached from here, so the account actions are too.
          <AccountFooter email={user.email} onSignOut={onSignOut} />
        )}
      </div>
      {modal === "terms" && <TermsModal onClose={() => setModal(null)} />}
      {modal === "privacy" && <PrivacyModal onClose={() => setModal(null)} />}
    </div>
  );
}
