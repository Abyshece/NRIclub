import { useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { apiErrorMessage } from "./profile";
import { REPORT_FIELDS, REPORT_KINDS, REPORT_REASONS, REPORT_RECEIVED, REPORT_PAGE, reportReasonLabel } from "../content/legal/reporting";

// The one report dialog for everything a member can report: posts,
// comments, answers, guides and their comments, events, questions, Market
// listings, places, mentoring reviews, messages and members (Art. 16 DSA).
// The member picks a reason from the two groups (illegal, against our
// rules), says why in their own words and confirms good faith.
// target: { type (reports.content_type), id, userId (who wrote it, if
// known), name (a few words to recognise it by) }. onReported(target) once
// it's sent.

const DEFAULT_FONT = "'DM Sans', sans-serif";

export default function ReportDialog({ target, onClose, onReported, font = DEFAULT_FONT }) {
  const [category, setCategory] = useState("");
  const [explanation, setExplanation] = useState("");
  const [goodFaith, setGoodFaith] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const firstRef = useRef(null);
  const doneRef = useRef(null);
  const noun = REPORT_KINDS[target.type] || "post";
  const { min, max } = REPORT_FIELDS.explanation;
  const length = explanation.trim().length;
  const ready = !!category && length >= min && length <= max && goodFaith;

  useEffect(() => { firstRef.current?.focus(); }, []);
  useEffect(() => { if (sent) doneRef.current?.focus(); }, [sent]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy) { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const send = async () => {
    if (busy) return;
    if (!category) { setError("Please choose what the problem is."); return; }
    if (length < min) { setError(`Please tell us why, in at least ${min} characters.`); return; }
    if (!goodFaith) { setError("Please confirm that your report is accurate and made in good faith."); return; }
    setBusy(true);
    setError("");
    try {
      await api.reportContent({
        type: target.type, id: target.id, userId: target.userId || null, name: target.name || "",
        category, categoryLabel: reportReasonLabel(category), explanation: explanation.trim(),
      });
    } catch (e) {
      setError(apiErrorMessage(e, "Your report couldn't be sent. Please try again."));
      setBusy(false);
      return;
    }
    setBusy(false);
    setSent(true);
    onReported?.(target);
  };

  const text = { fontSize: 13, color: "#5F5E5B", lineHeight: 1.55, fontFamily: font, margin: 0 };
  const legend = { fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px", padding: 0, fontFamily: font };
  const option = (on) => ({ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", borderRadius: 8, border: `1px solid ${on ? "#37352F" : "#E8E7E4"}`, background: on ? "#F7F7F5" : "#fff", cursor: "pointer", fontSize: 13, color: "#37352F", lineHeight: 1.4, fontFamily: font, marginBottom: 6 });
  const firstKey = Object.values(REPORT_REASONS)[0].reasons[0].key;

  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 55, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", backdropFilter: "blur(2px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="report-title" style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, padding: "24px 22px", margin: "auto", boxSizing: "border-box" }}>
        {sent ? (
          <div role="status" style={{ textAlign: "center" }}>
            <h3 id="report-title" style={{ fontSize: 17, fontWeight: 700, color: "#37352F", margin: "0 0 10px", fontFamily: font }}>Report sent</h3>
            <p style={{ ...text, marginBottom: 20 }}>{REPORT_RECEIVED}</p>
            <button ref={doneRef} type="button" onClick={onClose} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#37352F", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Done</button>
          </div>
        ) : (
          <>
            <h3 id="report-title" style={{ fontSize: 17, fontWeight: 700, color: "#37352F", margin: "0 0 4px", fontFamily: font }}>Report this {noun}</h3>
            {target.name && <p style={{ ...text, fontSize: 12, marginBottom: 8, overflowWrap: "anywhere" }}>"{String(target.name).slice(0, 120)}"</p>}
            <p style={{ ...text, marginBottom: 14 }}>
              A person on our team looks at every report and tells you what we decided. We don't tell the member you report who you are, unless the law requires it.
              {target.type === "message" && " Our team sees only this message, not the rest of your conversation."}
            </p>
            {category === "safety" && (
              <p role="note" style={{ ...text, color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 10px", marginBottom: 12 }}>{REPORT_PAGE.emergency}</p>
            )}
            {Object.entries(REPORT_REASONS).map(([groupKey, group]) => (
              <fieldset key={groupKey} style={{ border: "none", margin: "0 0 10px", padding: 0 }}>
                <legend style={legend}>{group.label}</legend>
                {group.reasons.map((r) => {
                  return (
                    <label key={r.key} style={option(category === r.key)}>
                      <input ref={r.key === firstKey ? firstRef : undefined} type="radio" name="report-reason" value={r.key} checked={category === r.key}
                        onChange={() => { setCategory(r.key); setError(""); }} style={{ marginTop: 2, flexShrink: 0 }} />
                      <span>{r.label}</span>
                    </label>
                  );
                })}
              </fieldset>
            ))}
            <label htmlFor="report-why" style={{ ...legend, display: "block", marginTop: 4 }}>{REPORT_FIELDS.explanation.label}</label>
            <textarea id="report-why" value={explanation} maxLength={max} onChange={(e) => { setExplanation(e.target.value); setError(""); }}
              placeholder={REPORT_FIELDS.explanation.hint} aria-describedby="report-why-count"
              style={{ width: "100%", minHeight: 84, padding: "10px 12px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 14, fontFamily: font, boxSizing: "border-box", resize: "vertical", outline: "none", color: "#37352F" }} />
            <p id="report-why-count" style={{ ...text, fontSize: 11, color: length && length < min ? "#B45309" : "#6B6A67", textAlign: "right", margin: "2px 0 10px" }}>
              {length < min ? `At least ${min} characters` : `${explanation.length} / ${max}`}
            </p>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "#37352F", lineHeight: 1.45, fontFamily: font, cursor: "pointer", marginBottom: 14 }}>
              <input type="checkbox" checked={goodFaith} onChange={(e) => { setGoodFaith(e.target.checked); setError(""); }} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>{REPORT_FIELDS.goodFaith.label}</span>
            </label>
            {error && <p role="alert" style={{ ...text, color: "#B91C1C", marginBottom: 12 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" onClick={onClose} disabled={busy} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", fontSize: 13, color: "#5F5E5B", cursor: "pointer", fontFamily: font }}>Cancel</button>
              <button type="button" onClick={send} disabled={busy} aria-disabled={!ready}
                style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: ready ? "#DC2626" : "#F3A6A6", fontSize: 13, fontWeight: 600, color: "#fff", cursor: busy ? "default" : "pointer", fontFamily: font }}>
                {busy ? "Sending…" : REPORT_FIELDS.submit}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
