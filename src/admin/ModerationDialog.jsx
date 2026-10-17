// The reasons for a decision on a member's content or account: the ground
// (our Terms of Use, or the law), the rule or law, and the facts, which the
// member reads in the statement of reasons (Art. 17 DSA) and whoever
// reported it in the outcome (Art. 16(5) DSA). For a block: why it can't
// wait for a warning, or that the warning was at least 14 days ago (Terms
// of Use, section 10), and what it does to their mentoring sessions. The
// preview is what the database will send (src/content/legal/reporting.js
// writes it in the same words).
import { useState } from "react";
import { ConfirmDialog } from "./ui";
import { formatDate, friendlyError } from "./format";
import { TERMS_RULES, URGENT_REASONS, statementOfReasons } from "../content/legal/reporting";

const FACTS_MIN = 10;
const FACTS_MAX = 600;
const WARNING_DAYS = 14;

// action: "remove" | "warn" | "block". what: e.g. 'your comment "…"' (the
// member's view of it; "how you use NRIClub" for a warning about the
// account). who: the member's first name. source: "report" | "notice" |
// "own". lastWarningAt / upcomingSessions: for a block (from the member's
// overview; undefined when not known). recorded: whether the database
// records decisions and tells the member (the 2026-10-21 update); if not,
// the panel says so (and can't check for an earlier warning, so a block
// doesn't ask why it can't wait). refusal: why this can't be done here (e.g.
// it's an admin's account), shown instead of the form. onConfirm({ ground,
// rule, facts, urgent }) may throw; its message shows in the dialog.
export default function ModerationDialog({ title, confirmLabel, action, what, who = "the member", source = "own", lastWarningAt, upcomingSessions, recorded = true, intro, refusal = "", onConfirm, onCancel }) {
  const [ground, setGround] = useState("terms");
  const [rule, setRule] = useState("");
  const [law, setLaw] = useState("");
  const [facts, setFacts] = useState("");
  const [urgent, setUrgent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const warnedLongEnough = !!lastWarningAt && Date.now() - Date.parse(lastWarningAt) >= WARNING_DAYS * 86400000;
  const cleanFacts = facts.replace(/\s+/g, " ").trim().replace(/[.!\s]+$/, "");
  const ruleText = ground === "illegal" ? law.trim() : rule;
  const needsUrgent = action === "block" && !warnedLongEnough && recorded;
  const complete = !!ruleText && cleanFacts.length >= FACTS_MIN && cleanFacts.length <= FACTS_MAX && (!needsUrgent || !!urgent);

  const preview = complete ? statementOfReasons({
    action: action === "remove" ? "removed" : action === "warn" ? "warning" : "blocked",
    what, ground, rule: ruleText, law: ruleText, facts: cleanFacts, source,
    urgent: action === "block" ? urgent || null : null, sessions: upcomingSessions || 0,
  }) : "";

  const confirm = async () => {
    if (!complete || busy || refusal) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm({ ground, rule: ruleText, facts: cleanFacts, urgent: action === "block" ? urgent || null : null });
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  if (refusal) {
    return (
      <ConfirmDialog wide title={title} confirmLabel={confirmLabel} onConfirm={() => {}} onCancel={onCancel} confirmDisabled>
        <p style={{ margin: 0 }}>{refusal}</p>
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog wide title={title} confirmLabel={confirmLabel} busy={busy} error={error} onConfirm={confirm} onCancel={onCancel}
      confirmDisabled={!complete} tone={action === "warn" ? "primary" : "danger"}>
      {intro && <p style={{ margin: 0 }}>{intro}</p>}
      <div className="adm-form">
        <div>
          <span className="adm-field-label">Why</span>
          <div className="adm-radio-row" role="radiogroup" aria-label="Ground">
            <label className="adm-radio"><input type="radio" name="adm-ground" checked={ground === "terms"} onChange={() => setGround("terms")} /> Against our Terms of Use</label>
            <label className="adm-radio"><input type="radio" name="adm-ground" checked={ground === "illegal"} onChange={() => setGround("illegal")} /> Illegal</label>
          </div>
        </div>
        {ground === "terms" ? (
          <div>
            <label className="adm-field-label" htmlFor="adm-rule">Which rule</label>
            <select id="adm-rule" className="adm-select" value={rule} onChange={(e) => setRule(e.target.value)}>
              <option value="">Choose the rule…</option>
              {TERMS_RULES.map((r) => <option key={r.key} value={r.label}>{r.label}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="adm-field-label" htmlFor="adm-law">Which law</label>
            <input id="adm-law" className="adm-input" value={law} maxLength={300} onChange={(e) => setLaw(e.target.value)} placeholder="e.g. § 185 StGB (insult)" />
          </div>
        )}
        <div>
          <label className="adm-field-label" htmlFor="adm-facts">What it said or did <span className="adm-faint">(finishes the sentence “…because …”; {who} and whoever reported it read this)</span></label>
          <textarea id="adm-facts" className="adm-textarea" value={facts} maxLength={FACTS_MAX} onChange={(e) => setFacts(e.target.value)}
            placeholder="e.g. it calls another member an idiot" />
          <div className="adm-help" style={{ textAlign: "right" }}>{cleanFacts.length < FACTS_MIN ? `At least ${FACTS_MIN} characters` : `${facts.length} / ${FACTS_MAX}`}</div>
        </div>
        {action === "block" && (
          <div>
            <label className="adm-field-label" htmlFor="adm-urgent">Block now because</label>
            <select id="adm-urgent" className="adm-select" value={urgent} onChange={(e) => setUrgent(e.target.value)}>
              {warnedLongEnough
                ? <option value="">They were warned on {formatDate(lastWarningAt)} and had 14 days to reply</option>
                : !recorded ? <option value="">They were warned by email at least 14 days ago</option>
                : <option value="">Choose the serious reason…</option>}
              {URGENT_REASONS.map((u) => <option key={u.key} value={u.key}>A serious case: {u.label}</option>)}
            </select>
            {!warnedLongEnough && recorded && (
              <div className="adm-help" style={{ marginTop: 4 }}>
                {lastWarningAt
                  ? `They were warned on ${formatDate(lastWarningAt)}: the 14 days to reply aren't over yet. Block now only in a serious case.`
                  : "No warning on record. Warn first and give them 14 days to reply, unless it's a serious case."}
              </div>
            )}
          </div>
        )}
        {action === "block" && upcomingSessions > 0 && (
          <div className="adm-warn-note" role="note">
            {upcomingSessions === 1 ? "1 upcoming mentoring session" : `${upcomingSessions} upcoming mentoring sessions`} will be cancelled and the members who booked told. This can't be undone.
          </div>
        )}
        {recorded ? (
          preview && (
            <div>
              <span className="adm-field-label">What {who} will read in NRIClub</span>
              <div className="adm-statement">{preview}</div>
            </div>
          )
        ) : (
          <div className="adm-warn-note" role="note">
            The database update of 21 October 2026 isn't in yet, so {who} isn't told in the app and nothing is recorded. Write to them from hello@nriclub.app with these reasons.
          </div>
        )}
      </div>
    </ConfirmDialog>
  );
}
