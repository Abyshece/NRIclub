import { useEffect, useId, useRef, useState } from "react";
import * as api from "./supabaseApi";
import { apiErrorMessage, getCountryOptions } from "./member/profile";
import { AMBASSADOR_FORM as T, AMBASSADOR_HOURS, AMBASSADOR_LIMITS as L, applicationEmail } from "./content/ambassadors";

// ============================================================================
// "BECOME A CITY AMBASSADOR": the application form, as a dialog over the
// landing page, a city page or the app. The application goes to the
// database (public.submit_ambassador_application), which gives it a
// reference code and tells our team in the admin panel (Ambassadors); our
// team then writes to the applicant from hello@nriclub.app. A member who is
// signed in applies with their account's name and email address (shown, not
// editable). Before the 2026-10-24 database update there's nowhere to send
// it: the dialog then offers the same application by email.
//
// account: { name, email, city, country, linkedinUrl } of the signed-in
// member, or null. city / country: what to fill in (e.g. the city page's
// city). onJoin: for visitors, "Join NRIClub" after sending.
// ============================================================================

const INK = "#37352F";
const MUTED = "#6B6A67";

const CSS = `
.amb-overlay { position: fixed; inset: 0; z-index: 90; background: rgba(15,15,15,0.45); display: flex; align-items: center; justify-content: center; padding: 24px 16px; overflow-y: auto; }
.amb-dialog { background: #fff; color: ${INK}; width: 100%; max-width: 580px; max-height: calc(100vh - 48px); max-height: calc(100dvh - 48px); display: flex; flex-direction: column; border-radius: 16px; box-shadow: 0 18px 50px rgba(15,15,15,0.25); box-sizing: border-box; font-size: 15px; line-height: 1.55; text-align: left; }
.amb-head { display: flex; align-items: flex-start; gap: 12px; padding: 20px 22px 0; }
.amb-title { font-size: 22px; font-weight: 750; letter-spacing: -0.02em; margin: 0; flex: 1; line-height: 1.25; outline: none; }
.amb-close { flex-shrink: 0; width: 44px; height: 44px; margin: -10px -12px 0 0; border: none; background: none; border-radius: 10px; color: ${MUTED}; font-size: 26px; line-height: 1; cursor: pointer; font-family: inherit; }
.amb-close:hover { background: #F4F4F2; color: ${INK}; }
.amb-body { overflow-y: auto; padding: 8px 22px 22px; -webkit-overflow-scrolling: touch; }
.amb-intro { color: ${MUTED}; margin: 0 0 18px; font-size: 15px; }
.amb-form { display: flex; flex-direction: column; gap: 16px; margin: 0; }
.amb-row { display: flex; gap: 14px; flex-wrap: wrap; }
.amb-row > div { flex: 1 1 200px; min-width: 0; }
.amb-label { display: block; font-size: 14px; font-weight: 650; margin: 0 0 4px; }
.amb-opt { font-weight: 400; color: ${MUTED}; }
.amb-hint { font-size: 13px; color: ${MUTED}; margin: 4px 0 0; line-height: 1.45; }
.amb-field { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #C9C8C5; border-radius: 8px; font-size: 16px; font-family: inherit; color: ${INK}; background: #fff; min-height: 44px; }
.amb-field:focus { outline: 2px solid rgba(91,156,255,0.7); outline-offset: 1px; border-color: #5B9CFF; }
.amb-field[readonly] { background: #F7F7F5; color: #45443F; }
textarea.amb-field { resize: vertical; min-height: 110px; line-height: 1.5; }
select.amb-field { appearance: auto; }
.amb-hours { border: none; margin: 0; padding: 0; min-width: 0; }
.amb-hours legend { padding: 0; margin: 0 0 6px; font-size: 14px; font-weight: 650; }
.amb-choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.amb-choice { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 12px; border: 1px solid #E0DFDC; border-radius: 10px; cursor: pointer; font-size: 14px; box-sizing: border-box; }
.amb-choice:has(input:checked) { border-color: ${INK}; background: #F7F7F5; font-weight: 600; }
.amb-choice input { width: 18px; height: 18px; margin: 0; flex-shrink: 0; accent-color: ${INK}; }
.amb-privacy { font-size: 13px; color: ${MUTED}; margin: 0; line-height: 1.5; }
.amb-privacy a { color: ${INK}; font-weight: 600; }
.amb-error { margin: 0; padding: 10px 12px; border-radius: 8px; background: #FEF2F2; color: #B91C1C; font-size: 14px; line-height: 1.5; outline: none; }
.amb-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.amb-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 22px; border-radius: 10px; font-size: 15px; font-weight: 650; font-family: inherit; cursor: pointer; text-decoration: none; box-sizing: border-box; }
.amb-btn-primary { background: ${INK}; color: #fff; border: 1px solid ${INK}; }
.amb-btn-primary:disabled { opacity: .7; cursor: default; }
.amb-btn-secondary { background: #fff; color: ${INK}; border: 1px solid #C9C8C5; }
.amb-done { padding: 18px; border-radius: 12px; background: #F0F7EE; border: 1px solid #CFE3C9; outline: none; }
.amb-done h3 { font-size: 18px; margin: 0 0 6px; }
.amb-done p { margin: 0 0 8px; }
.amb-ref { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; letter-spacing: .02em; }
@media (max-width: 600px) {
  .amb-overlay { padding: 0; align-items: flex-end; }
  .amb-dialog { max-width: none; max-height: 100vh; max-height: 100dvh; border-radius: 16px 16px 0 0; }
  .amb-head { padding: 16px 16px 0; }
  .amb-body { padding: 6px 16px calc(18px + env(safe-area-inset-bottom)); }
  .amb-title { font-size: 20px; }
  .amb-choices { grid-template-columns: minmax(0, 1fr); }
  .amb-actions .amb-btn { flex: 1 1 auto; }
}
`;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function AmbassadorApply({ account = null, city: startCity = "", country: startCountry = "", onClose, onJoin = null }) {
  const id = useId();
  const f = (name) => `${id}-${name}`;
  const signedIn = !!account;
  const [name, setName] = useState(account?.name || "");
  const [email, setEmail] = useState(account?.email || "");
  const [city, setCity] = useState(startCity || account?.city || "");
  const [country, setCountry] = useState(startCountry || account?.country || "");
  const [organisation, setOrganisation] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState(account?.linkedinUrl || "");
  const [motivation, setMotivation] = useState("");
  const [hours, setHours] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // { ref } once it's in; { byEmail: true } when it must go by email.
  const [done, setDone] = useState(null);
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const errorRef = useRef(null);
  const doneRef = useRef(null);
  const busyRef = useRef(false);
  busyRef.current = busy;

  const countries = getCountryOptions();
  const countryKnown = !country || countries.some((c) => c.name === country);
  const dirty = !done && [organisation, motivation, hours, signedIn ? "" : name, signedIn ? "" : email].some((v) => String(v).trim());

  // While open: the page behind doesn't scroll, the heading has the focus
  // (so a phone doesn't open its keyboard over the introduction), and on
  // closing the focus goes back to the button that opened it.
  useEffect(() => {
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
    };
  }, []);
  useEffect(() => { if (done) doneRef.current?.focus(); }, [done]);
  useEffect(() => { setError(""); }, [name, email, city, country, organisation, linkedinUrl, motivation, hours]);

  const close = () => { if (!busyRef.current) onClose(); };

  // Tab and Shift+Tab stay inside the dialog; Escape closes it.
  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== "Tab") return;
    const items = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) || [])].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const fail = (text) => {
    setError(text);
    requestAnimationFrame(() => errorRef.current?.focus());
  };

  const values = () => ({
    name: name.trim(), email: email.trim(), city: city.trim().replace(/\s+/g, " "), country: country.trim(),
    organisation: organisation.trim(), linkedinUrl: linkedinUrl.trim(), motivation: motivation.trim(), hoursPerWeek: hours,
  });

  const send = async (e) => {
    e.preventDefault();
    if (busy) return;
    const v = values();
    if (!v.name) return fail("Please give your name.");
    if (!/^[^@\s?&#%,;:<>()"\\/]+@[^@\s?&#%,;:<>()"\\/]+\.[^@\s?&#%,;:<>()"\\/]+$/.test(v.email)) return fail("Please check your email address: our team will write to you there.");
    if (!v.city) return fail("Please give the city where you'd be ambassador.");
    if (!v.country) return fail("Please choose your country.");
    if (v.motivation.length < L.motivationMin) return fail(`Please tell us in a sentence or two why you'd like to be an ambassador (at least ${L.motivationMin} characters).`);
    if (!v.hoursPerWeek) return fail("Please choose how much time you could give.");
    setBusy(true);
    setError("");
    try {
      const ref = await api.submitAmbassadorApplication(v);
      setDone({ ref: typeof ref === "string" ? ref : "", email: v.email });
    } catch (err) {
      if (err?.notAvailable) setDone({ byEmail: true });
      else fail(apiErrorMessage(err, "Your application couldn't be sent. Please try again, or write to us at hello@nriclub.app."));
    }
    setBusy(false);
  };

  let body;
  if (done?.byEmail) {
    body = (
      <div ref={doneRef} tabIndex={-1} role="status" style={{ outline: "none" }}>
        <h3 style={{ fontSize: 18, margin: "0 0 6px" }}>{T.byEmailTitle}</h3>
        <p style={{ margin: "0 0 16px" }}>{T.byEmail}</p>
        <div className="amb-actions">
          <a className="amb-btn amb-btn-primary" href={applicationEmail(values())}>Write the email</a>
          <button type="button" className="amb-btn amb-btn-secondary" onClick={() => setDone(null)}>Back to the form</button>
        </div>
      </div>
    );
  } else if (done) {
    body = (
      <>
        <div ref={doneRef} tabIndex={-1} role="status" className="amb-done">
          <h3>{T.sentTitle}</h3>
          <p>{done.ref ? <>Your reference is <span className="amb-ref">{done.ref}</span>. </> : null}{T.sent(done.email)}</p>
          <p style={{ marginBottom: 0 }}>{signedIn ? T.sentMember : T.sentJoin}</p>
        </div>
        <div className="amb-actions" style={{ marginTop: 16 }}>
          {!signedIn && onJoin && <button type="button" className="amb-btn amb-btn-primary" onClick={() => { onClose(); onJoin(); }}>Join NRIClub free</button>}
          <button type="button" className={`amb-btn ${!signedIn && onJoin ? "amb-btn-secondary" : "amb-btn-primary"}`} onClick={onClose}>Close</button>
        </div>
      </>
    );
  } else {
    const count = motivation.trim().length;
    body = (
      <form className="amb-form" onSubmit={send} noValidate>
        <div className="amb-row">
          <div>
            <label className="amb-label" htmlFor={f("name")}>{T.fields.name}</label>
            <input id={f("name")} className="amb-field" autoComplete="name" value={name} maxLength={L.name} readOnly={signedIn}
              aria-describedby={signedIn ? f("account") : undefined} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="amb-label" htmlFor={f("email")}>{T.fields.email}</label>
            <input id={f("email")} className="amb-field" type="email" autoComplete="email" value={email} maxLength={L.email} readOnly={signedIn}
              aria-describedby={signedIn ? f("account") : f("email-hint")} onChange={(e) => setEmail(e.target.value)} />
            {!signedIn && <p id={f("email-hint")} className="amb-hint">{T.fields.emailHint}</p>}
          </div>
        </div>
        {signedIn && <p id={f("account")} className="amb-hint" style={{ marginTop: -10 }}>{T.fields.signedIn} {T.fields.emailHint}</p>}
        <div className="amb-row">
          <div>
            <label className="amb-label" htmlFor={f("city")}>{T.fields.city}</label>
            <input id={f("city")} className="amb-field" autoComplete="address-level2" value={city} maxLength={L.city}
              aria-describedby={f("city-hint")} onChange={(e) => setCity(e.target.value)} />
            <p id={f("city-hint")} className="amb-hint">{T.fields.cityHint}</p>
          </div>
          <div>
            <label className="amb-label" htmlFor={f("country")}>{T.fields.country}</label>
            <select id={f("country")} className="amb-field" autoComplete="country-name" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">Choose…</option>
              {!countryKnown && <option value={country}>{country}</option>}
              {countries.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="amb-label" htmlFor={f("org")}>{T.fields.organisation} <span className="amb-opt">(optional)</span></label>
          <input id={f("org")} className="amb-field" autoComplete="organization" value={organisation} maxLength={L.organisation}
            aria-describedby={f("org-hint")} onChange={(e) => setOrganisation(e.target.value)} />
          <p id={f("org-hint")} className="amb-hint">{T.fields.organisationHint}</p>
        </div>
        <div>
          <label className="amb-label" htmlFor={f("linkedin")}>{T.fields.linkedin} <span className="amb-opt">(optional)</span></label>
          <input id={f("linkedin")} className="amb-field" type="url" inputMode="url" autoComplete="url" value={linkedinUrl} maxLength={L.linkedin}
            placeholder="linkedin.com/in/your-name" aria-describedby={f("linkedin-hint")} onChange={(e) => setLinkedinUrl(e.target.value)} />
          <p id={f("linkedin-hint")} className="amb-hint">{T.fields.linkedinHint}</p>
        </div>
        <div>
          <label className="amb-label" htmlFor={f("why")}>{T.fields.motivation}</label>
          <textarea id={f("why")} className="amb-field" rows={4} value={motivation} maxLength={L.motivationMax}
            aria-describedby={`${f("why-hint")} ${f("why-count")}`} onChange={(e) => setMotivation(e.target.value)} />
          <p id={f("why-hint")} className="amb-hint">{T.fields.motivationHint}</p>
          <p id={f("why-count")} className="amb-hint" style={{ textAlign: "right", marginTop: 2 }}>
            {count < L.motivationMin ? `At least ${L.motivationMin} characters` : `${motivation.length.toLocaleString("en-GB")} / ${L.motivationMax.toLocaleString("en-GB")}`}
          </p>
        </div>
        <fieldset className="amb-hours">
          <legend>{T.fields.hours}</legend>
          <div className="amb-choices">
            {AMBASSADOR_HOURS.map((h) => (
              <label key={h.key} className="amb-choice">
                <input type="radio" name={f("hours")} value={h.key} checked={hours === h.key} onChange={() => setHours(h.key)} />
                <span>{h.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="amb-privacy">{T.privacy} <a href={T.privacyHref} target="_blank" rel="noopener">{T.privacyLink}</a>.</p>
        {error && <p ref={errorRef} tabIndex={-1} role="alert" className="amb-error">{error}</p>}
        <div className="amb-actions">
          <button type="submit" className="amb-btn amb-btn-primary" disabled={busy}>{busy ? "Sending…" : T.submit}</button>
          <button type="button" className="amb-btn amb-btn-secondary" onClick={close} disabled={busy}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div className="amb-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !dirty) close(); }}>
      <style>{CSS}</style>
      <div ref={dialogRef} className="amb-dialog" role="dialog" aria-modal="true" aria-labelledby={f("title")} aria-describedby={done ? undefined : f("intro")} onKeyDown={onKeyDown}>
        <div className="amb-head">
          <h2 id={f("title")} ref={titleRef} tabIndex={-1} className="amb-title">{T.title}</h2>
          <button type="button" className="amb-close" onClick={close} aria-label="Close" disabled={busy}>×</button>
        </div>
        <div className="amb-body">
          {!done && <p id={f("intro")} className="amb-intro">{T.intro}</p>}
          {body}
        </div>
      </div>
    </div>
  );
}
