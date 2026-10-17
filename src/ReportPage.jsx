import { useEffect, useRef, useState } from "react";
import * as api from "./supabaseApi";
import PublicShell, { INK, MUTED, SUPPORT_EMAIL, primaryBtn, section, useCanonical } from "./PublicShell";
import { apiErrorMessage } from "./member/profile";
import { HOME_TITLE } from "./content/slug";
import { REPORT_FIELDS, REPORT_MAILTO, REPORT_PAGE, REPORT_REASONS, mailtoLink, reportReasonLabel } from "./content/legal/reporting";

// ============================================================================
// REPORT ILLEGAL CONTENT (nriclub.app/report): anyone, member or not, can
// tell us about content on NRIClub they believe is illegal (Art. 16 DSA).
// The report goes to the database (public.submit_notice), which gives it a
// reference code and tells our team; they confirm receipt and send the
// decision by email from hello@nriclub.app. Before the 2026-10-21 database
// update there's nowhere to send it: the page then offers the same report by
// email. The texts are in src/content/legal/reporting.js.
// ============================================================================

const label = { display: "block", fontSize: 15, fontWeight: 600, color: INK, margin: "0 0 4px" };
const hint = { fontSize: 13, color: MUTED, margin: "0 0 8px", lineHeight: 1.5 };
const field = {
  width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1px solid #C9C8C5", borderRadius: 8,
  fontSize: 16, fontFamily: "inherit", color: INK, background: "#fff",
};

export default function ReportPage({ onJoin, onLogin, signedIn }) {
  useCanonical("/report");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [explanation, setExplanation] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [goodFaith, setGoodFaith] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // { ref, email } once it's in; { byEmail: true } when it must go by email.
  const [done, setDone] = useState(null);
  const doneRef = useRef(null);
  const errorRef = useRef(null);

  useEffect(() => {
    document.title = `${REPORT_PAGE.title} · NRIClub`;
    window.scrollTo(0, 0);
    return () => { document.title = HOME_TITLE; };
  }, []);
  useEffect(() => { if (done) doneRef.current?.focus(); }, [done]);
  // A message about what's missing goes once something is changed.
  useEffect(() => { setError(""); }, [location, category, explanation, name, email, goodFaith]);

  const max = REPORT_FIELDS.noticeExplanationMax;
  const min = REPORT_FIELDS.explanation.min;
  const anonymousAllowed = category === "child_abuse";

  // The same report as an email, with what was typed in.
  const byEmail = mailtoLink(SUPPORT_EMAIL, {
    subject: REPORT_PAGE.title,
    body: [
      `Where is the content? ${location.trim()}`,
      "",
      `What is the problem? ${category ? reportReasonLabel(category) : ""}`,
      "",
      `Why? ${explanation.trim()}`,
      "",
      `Your name: ${name.trim()}`,
      "",
      REPORT_FIELDS.goodFaith.label,
    ].join("\n"),
  });

  const fail = (text) => {
    setError(text);
    requestAnimationFrame(() => errorRef.current?.focus());
  };

  const send = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!location.trim()) return fail("Please tell us where the content is.");
    if (!category) return fail("Please choose what the problem is.");
    if (explanation.trim().length < min) return fail("Please explain in a sentence or two why the content is illegal.");
    if (!anonymousAllowed && (!name.trim() || !email.trim())) return fail("Please give your name and email address, so we can tell you what we decided.");
    if (!goodFaith) return fail("Please confirm that your report is accurate and made in good faith.");
    setBusy(true);
    setError("");
    try {
      const ref = await api.submitNotice({ location: location.trim(), category, explanation: explanation.trim(), name: name.trim(), email: email.trim(), goodFaith });
      setDone({ ref: typeof ref === "string" ? ref : "", email: !!email.trim() });
    } catch (err) {
      if (err?.notAvailable) setDone({ byEmail: true });
      else fail(apiErrorMessage(err, "Your report couldn't be sent. Please try again, or write to us instead."));
    }
    setBusy(false);
  };

  const reset = () => {
    setLocation(""); setCategory(""); setExplanation(""); setGoodFaith(false); setError(""); setDone(null);
    window.scrollTo(0, 0);
  };

  const hero = (
    <div style={{ ...section, maxWidth: 720, paddingTop: "clamp(20px, 5vh, 48px)", paddingBottom: 16 }}>
      <h1 style={{ fontSize: "clamp(32px, 5vw, 44px)", fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 10px" }}>{REPORT_PAGE.title}</h1>
      <p style={{ fontSize: 17, color: MUTED, margin: 0, lineHeight: 1.6 }}>{REPORT_PAGE.intro}</p>
    </div>
  );

  const emergency = (
    <p role="note" style={{ margin: "0 0 24px", padding: "12px 14px", borderRadius: 10, background: "#FEF2F2", color: "#991B1B", fontSize: 15, lineHeight: 1.5, fontWeight: 500 }}>
      {REPORT_PAGE.emergency}
    </p>
  );

  let body;
  if (done?.byEmail) {
    body = (
      <div ref={doneRef} tabIndex={-1} role="status" style={{ outline: "none" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>Please send it by email</h2>
        <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 16px" }}>
          Reports can't be sent from this page just yet. Your email app opens with your report filled in: send it to {SUPPORT_EMAIL}, and a person on our team will look at it.
        </p>
        <a href={byEmail} style={{ ...primaryBtn, display: "inline-block", textDecoration: "none" }}>Write the email</a>
        <p style={{ margin: "16px 0 0" }}><button type="button" onClick={() => setDone(null)} style={{ background: "none", border: "none", padding: 0, color: MUTED, textDecoration: "underline", cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>Back to the form</button></p>
      </div>
    );
  } else if (done) {
    body = (
      <div ref={doneRef} tabIndex={-1} role="status" style={{ outline: "none", padding: "20px 18px", borderRadius: 12, background: "#F0F7EE", border: "1px solid #CFE3C9" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>Report sent</h2>
        <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 10px" }}>{REPORT_PAGE.sent(done.ref)}</p>
        <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 18px", color: "#45443F" }}>{done.email ? REPORT_PAGE.sentNext : REPORT_PAGE.sentAnonymous}</p>
        <button type="button" onClick={reset} style={{ ...primaryBtn, padding: "12px 20px", fontSize: 15 }}>Send another report</button>
      </div>
    );
  } else {
    body = (
      <form onSubmit={send} noValidate style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label htmlFor="rp-location" style={label}>{REPORT_FIELDS.location.label}</label>
          <p id="rp-location-hint" style={hint}>{REPORT_FIELDS.location.hint}</p>
          <textarea id="rp-location" rows={2} value={location} maxLength={REPORT_FIELDS.location.max} aria-describedby="rp-location-hint"
            onChange={(e) => setLocation(e.target.value)} style={{ ...field, resize: "vertical" }} placeholder="https://nriclub.app/…" />
        </div>
        <div>
          <label htmlFor="rp-category" style={label}>{REPORT_FIELDS.category.label}</label>
          <select id="rp-category" value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...field, appearance: "auto" }}>
            <option value="">Choose…</option>
            {Object.entries(REPORT_REASONS).map(([key, group]) => (
              <optgroup key={key} label={group.label}>
                {group.reasons.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </optgroup>
            ))}
          </select>
          {category === "safety" && <p role="note" style={{ ...hint, margin: "8px 0 0", color: "#991B1B", fontWeight: 600 }}>{REPORT_PAGE.emergency} Then send this report: our team looks at reports like this first.</p>}
        </div>
        <div>
          <label htmlFor="rp-explanation" style={label}>{REPORT_FIELDS.explanation.label}</label>
          <p id="rp-explanation-hint" style={hint}>{REPORT_FIELDS.explanation.hint}</p>
          <textarea id="rp-explanation" rows={5} value={explanation} maxLength={max} aria-describedby="rp-explanation-hint rp-explanation-count"
            onChange={(e) => setExplanation(e.target.value)} style={{ ...field, resize: "vertical" }} />
          <p id="rp-explanation-count" style={{ ...hint, margin: "4px 0 0", textAlign: "right" }}>{explanation.trim().length < min ? `At least ${min} characters` : `${explanation.length.toLocaleString("en-GB")} / ${max.toLocaleString("en-GB")}`}</p>
        </div>
        {anonymousAllowed && <p role="note" style={{ ...hint, margin: 0, color: INK }}>{REPORT_PAGE.anonymousNote}</p>}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <label htmlFor="rp-name" style={label}>{REPORT_FIELDS.name.label}{anonymousAllowed && <span style={{ fontWeight: 400, color: MUTED }}> (optional)</span>}</label>
            <input id="rp-name" autoComplete="name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} style={field} />
          </div>
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <label htmlFor="rp-email" style={label}>{REPORT_FIELDS.email.label}{anonymousAllowed && <span style={{ fontWeight: 400, color: MUTED }}> (optional)</span>}</label>
            <input id="rp-email" type="email" autoComplete="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} style={field} aria-describedby="rp-email-hint" />
            <p id="rp-email-hint" style={{ ...hint, margin: "4px 0 0" }}>{REPORT_FIELDS.email.hint}</p>
          </div>
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 15, lineHeight: 1.5, cursor: "pointer" }}>
          <input type="checkbox" checked={goodFaith} onChange={(e) => setGoodFaith(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }} />
          <span>{REPORT_FIELDS.goodFaith.label}</span>
        </label>
        {error && <p ref={errorRef} tabIndex={-1} role="alert" style={{ margin: 0, padding: "10px 12px", borderRadius: 8, background: "#FEF2F2", color: "#B91C1C", fontSize: 14, lineHeight: 1.5, outline: "none" }}>{error}</p>}
        <div>
          <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.7 : 1, cursor: busy ? "default" : "pointer" }}>{busy ? "Sending…" : REPORT_FIELDS.submit}</button>
        </div>
      </form>
    );
  }

  return (
    <PublicShell onLogin={onLogin} onJoin={signedIn ? null : onJoin} loginLabel={signedIn ? "Open NRIClub" : "Log in"} hero={hero}>
      <section style={{ ...section, maxWidth: 720, fontSize: 16, lineHeight: 1.6 }}>
        {emergency}
        {body}
        <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid #F0EFED", fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
          <p style={{ margin: "0 0 8px" }}>{REPORT_PAGE.confidentiality}</p>
          <p style={{ margin: "0 0 8px" }}>{REPORT_PAGE.afterwards}</p>
          <p style={{ margin: "0 0 8px" }}>{REPORT_PAGE.membersNote}</p>
          <p style={{ margin: 0 }}>{REPORT_PAGE.emailInstead} <a href={REPORT_MAILTO} style={{ color: INK, fontWeight: 600 }}>{SUPPORT_EMAIL}</a></p>
        </div>
      </section>
    </PublicShell>
  );
}
