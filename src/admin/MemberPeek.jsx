// Side peek with everything needed to decide on one member, the automatic
// checks, and the decision actions (with keyboard shortcuts).
import { useEffect, useRef, useState } from "react";
import { Avatar, Button, ConfirmDialog, ErrorNote, Icon, Kbd, Pill } from "./ui";
import {
  VERIFICATION_LABELS, VERIFICATION_TONES, ago, firstName, formatDate, friendlyError, holdNote, holdSummary,
  holdText, linkedinHref, placeLabel, reviewFlagLabel, verificationChecks,
} from "./format";

const TEMPLATES = {
  needs_info: [
    "Your LinkedIn link doesn't open",
    "The name on your LinkedIn doesn't match",
    "Your LinkedIn profile looks empty — add a photo or experience, or tell us how you're connected",
    "Please confirm your city",
  ],
  rejected: [
    "We couldn't verify your identity",
    "This doesn't meet our membership criteria",
    "Duplicate account",
    "Spam or fake profile",
  ],
};

const SUBMIT_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "") ? "⌘↵" : "Ctrl ↵";

const asSentence = (t) => (/[.!?]$/.test(t) ? t : `${t}.`);

function toggleTemplate(message, template) {
  const s = asSentence(template);
  if (message.includes(s)) {
    return message.replace(s, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }
  const base = message.trim();
  return base ? `${base} ${s}` : s;
}

function Prop({ icon, label, children }) {
  return (
    <>
      <div className="adm-prop-label"><Icon name={icon} size={15} />{label}</div>
      <div className="adm-prop-value">{children}</div>
    </>
  );
}

function CheckMark({ ok }) {
  if (ok === true) return <span className="adm-check-mark adm-check-ok" aria-label="Passed"><Icon name="check" size={12} strokeWidth={2.8} /></span>;
  if (ok === false) return <span className="adm-check-mark adm-check-warn" aria-label="Needs attention"><Icon name="alert" size={11} strokeWidth={2.4} /></span>;
  return <span className="adm-check-mark adm-check-info" aria-label="Note"><Icon name="undo" size={11} strokeWidth={2.2} /></span>;
}

export default function MemberPeek({
  member, loadingDetails = false, index = 0, total = 1,
  onClose, onPrev, onNext, onDecision, onSetStatus,
}) {
  const [composer, setComposer] = useState(null); // null | "needs_info" | "rejected"
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blockError, setBlockError] = useState("");
  const peekRef = useRef(null);
  const textRef = useRef(null);
  const idRef = useRef(member.id);

  // A different member: start fresh.
  useEffect(() => {
    idRef.current = member.id;
    setComposer(null); setMessage(""); setNote(""); setBusy(""); setError("");
    setConfirmBlock(false); setBlockError("");
    peekRef.current?.focus({ preventScroll: true });
    peekRef.current?.querySelector(".adm-peek-body")?.scrollTo?.(0, 0);
  }, [member.id]);

  useEffect(() => {
    if (composer) textRef.current?.focus();
  }, [composer]);

  const status = member.verification_status || "incomplete";
  const blocked = member.status === "blocked";
  // Matches review_member: approve or ask for more only while the member is
  // waiting for review (so someone who never sent their details can only be
  // rejected); reopen approved members, and rejected ones who sent details.
  // A rejected member who never sent them goes back to unfinished instead.
  // Both wait for the member's full details (submitted_at), which the
  // Members page loads after opening the peek.
  const waiting = status === "pending" || status === "needs_info";
  const detailsLoaded = member.submitted_at !== undefined;
  const sentDetails = detailsLoaded && member.submitted_at !== null;
  const can = {
    approve: waiting,
    info: waiting,
    reject: status !== "rejected",
    reopen: detailsLoaded && (status === "approved" || (status === "rejected" && sentDetails)),
    unfinish: detailsLoaded && status === "rejected" && !sentDetails,
  };

  const run = async (kind, fn) => {
    if (busy) return false;
    const id = member.id;
    setBusy(kind);
    setError("");
    try {
      await fn();
      if (idRef.current === id) { setComposer(null); setMessage(""); setNote(""); }
      return true;
    } catch (e) {
      if (idRef.current === id) setError(friendlyError(e));
      return false;
    } finally {
      if (idRef.current === id) setBusy("");
    }
  };

  const approve = () => run("approved", () => onDecision(member, "approved", "", ""));
  const reopen = () => run("pending", () => onDecision(member, "pending", "", ""));
  const unfinish = () => run("incomplete", () => onDecision(member, "incomplete", "", ""));
  const submitComposer = () => {
    if (!composer) return;
    if (!message.trim()) { setError("Add a message for the member. They'll see it in their notifications."); textRef.current?.focus(); return; }
    const decision = composer;
    run(decision, () => onDecision(member, decision, message.trim(), decision === "rejected" ? note.trim() : ""));
  };
  const openComposer = (kind) => {
    setError("");
    if (composer !== kind) { setMessage(""); setNote(""); }
    setComposer(kind);
  };
  const closeComposer = () => {
    setComposer(null); setError("");
    peekRef.current?.focus({ preventScroll: true });
  };

  const doBlock = async () => {
    setBlockError("");
    setBusy("block");
    const id = member.id;
    try {
      await onSetStatus(member, "blocked");
      if (idRef.current === id) setConfirmBlock(false);
    } catch (e) {
      if (idRef.current === id) setBlockError(friendlyError(e));
    } finally {
      if (idRef.current === id) setBusy("");
    }
  };
  const unblock = () => run("unblock", () => onSetStatus(member, "active"));

  // Keyboard shortcuts while the peek is open.
  const keyHandler = useRef(null);
  keyHandler.current = (e) => {
    // Holding a key down mustn't act on member after member.
    if (e.repeat) return;
    if (composer && e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.defaultPrevented && !confirmBlock) {
      e.preventDefault();
      submitComposer();
      return;
    }
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || confirmBlock) return;
    const t = e.target;
    const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    if (e.key === "Escape") {
      e.preventDefault();
      if (composer) closeComposer(); else onClose();
      return;
    }
    // While a message is open only Escape and Ctrl/⌘+Enter act, wherever the
    // focus is, so typing that lands outside the box can't approve the member,
    // switch the message or wipe it.
    if (composer) return;
    if (typing || busy) return;
    const k = e.key.toLowerCase();
    if (k === "a" && can.approve) { e.preventDefault(); approve(); }
    else if (k === "i" && can.info) { e.preventDefault(); openComposer("needs_info"); }
    else if (k === "r" && can.reject) { e.preventDefault(); openComposer("rejected"); }
    else if (k === "j" && onNext) { e.preventDefault(); onNext(); }
    else if (k === "k" && onPrev) { e.preventDefault(); onPrev(); }
  };
  useEffect(() => {
    const h = (e) => keyHandler.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const checks = verificationChecks(member);
  const hasLinkedin = !!String(member.linkedin_url || "").trim();
  const noteText = String(member.verification_note || "").trim();
  const voucher = String(member.voucher || "").trim();
  const first = firstName(member.name);
  const hold = holdText(member);
  const heldNote = holdNote(member);

  return (
    <aside className="adm-peek" role="dialog" aria-label={`Member: ${member.name || "Unnamed"}`} ref={peekRef} tabIndex={-1}>
      <div className="adm-peek-bar">
        <Button variant="ghost" className="adm-btn-icon" onClick={onClose} aria-label="Close" title="Close (Esc)"><Icon name="chevronsRight" size={17} /></Button>
        <Button variant="ghost" className="adm-btn-icon" onClick={onPrev} disabled={!onPrev} aria-label="Previous member" title="Previous (K)"><Icon name="chevronUp" size={17} /></Button>
        <Button variant="ghost" className="adm-btn-icon" onClick={onNext} disabled={!onNext} aria-label="Next member" title="Next (J)"><Icon name="chevronDown" size={17} /></Button>
        {total > 1 && <span className="adm-peek-pos">{index + 1} of {total}</span>}
      </div>

      <div className="adm-peek-body">
        <div className="adm-peek-head"><Avatar name={member.name} url={member.avatar_url} size={56} /></div>
        <h2 className="adm-peek-name">{member.name || "Unnamed member"}</h2>
        <div className="adm-peek-pills">
          <Pill tone={VERIFICATION_TONES[status]}>{VERIFICATION_LABELS[status] || status}</Pill>
          {blocked ? <Pill tone="red">Blocked</Pill> : null}
          {member.review_flag ? <Pill tone="red" title={holdSummary(member)}>{reviewFlagLabel(member.review_flag)}</Pill> : null}
        </div>
        {/* Why they're held: the rejection or block they matched. */}
        {hold && (
          <div className="adm-hold" role="note">
            <div>{hold}</div>
            {heldNote && <div className="adm-hold-note">Note: {heldNote}</div>}
          </div>
        )}

        <div className="adm-props">
          <Prop icon="mail" label="Email">
            <span>{member.email || "—"}</span>
            {member.email_verified
              ? <span className="adm-verified-mark" title="This email address has been confirmed"><Icon name="checkCircle" size={13} strokeWidth={2} />verified email</span>
              : <span className="adm-faint adm-small">not verified</span>}
          </Prop>
          <Prop icon="mapPin" label="Lives in">{placeLabel(member) || <span className="adm-faint">—</span>}</Prop>
          <Prop icon="briefcase" label="Profession">{member.profession || <span className="adm-faint">—</span>}</Prop>
          <Prop icon="home" label="Hometown">{member.hometown || <span className="adm-faint">—</span>}</Prop>
          {member.years_abroad ? <Prop icon="globe" label="Years abroad">{member.years_abroad}</Prop> : null}
          <Prop icon="calendar" label="Signed up">{formatDate(member.created_at)}<span className="adm-faint adm-small">{ago(member.created_at)}</span></Prop>
          {member.submitted_at !== undefined && (
            <Prop icon="send" label="Submitted">
              {member.submitted_at
                ? <>{formatDate(member.submitted_at, { time: true })}<span className="adm-faint adm-small">{ago(member.submitted_at)}</span></>
                : <span className="adm-faint">Not yet</span>}
            </Prop>
          )}
          {member.reviewed_at ? <Prop icon="checkCircle" label="Last reviewed">{formatDate(member.reviewed_at, { time: true })}</Prop> : null}
        </div>

        <section className="adm-peek-section">
          <div className="adm-peek-section-title">{hasLinkedin ? "LinkedIn" : "How they're connected"}</div>
          {hasLinkedin ? (
            <>
              <div className="adm-linkedin">
                <a className="adm-btn adm-btn-primary" href={linkedinHref(member.linkedin_url)} target="_blank" rel="noopener noreferrer">
                  <Icon name="linkedin" size={15} /><span>Open LinkedIn ↗</span>
                </a>
                <span className="adm-linkedin-url">{member.linkedin_url}</span>
              </div>
              {noteText && <blockquote className="adm-quote" style={{ marginTop: 14 }}>{noteText}</blockquote>}
              {member.verification_note === undefined && !loadingDetails && <p className="adm-faint" style={{ marginTop: 14 }}>Their details didn't load. Close and reopen to try again.</p>}
            </>
          ) : member.verification_note === undefined ? (
            <p className="adm-faint">{loadingDetails ? "Loading…" : "Their details didn't load. Close and reopen to try again."}</p>
          ) : noteText || voucher ? (
            <blockquote className="adm-quote">
              {noteText || <span className="adm-faint">No explanation given.</span>}
              {voucher && <div className="adm-quote-meta"><Icon name="user" size={14} /><span>Can vouch: <strong style={{ color: "#37352F", fontWeight: 600 }}>{voucher}</strong></span></div>}
            </blockquote>
          ) : (
            <p className="adm-muted">No LinkedIn and no explanation yet.</p>
          )}
        </section>

        <section className="adm-peek-section">
          <div className="adm-peek-section-title">Automatic checks</div>
          <ul className="adm-checks">
            {checks.map((c) => (
              <li key={c.key} className="adm-check">
                <CheckMark ok={c.ok} />
                <span>{c.label}{c.detail && <span className="adm-check-detail">{c.detail}</span>}</span>
              </li>
            ))}
            {loadingDetails && <li className="adm-check adm-faint">Loading the rest…</li>}
          </ul>
          {member.verification_message ? (
            <div className="adm-callout">
              <div className="adm-callout-label">Last message to {first}</div>
              <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{member.verification_message}</div>
            </div>
          ) : null}
        </section>
      </div>

      <div className="adm-peek-foot">
        {error && <ErrorNote>{error}</ErrorNote>}
        {composer ? (
          <div className="adm-composer">
            <div className="adm-composer-title">
              <span style={{ flex: 1 }}>{composer === "needs_info" ? `Ask ${first} for more info` : `Reject ${first}'s request`}</span>
              <Button variant="ghost" className="adm-btn-icon" onClick={closeComposer} aria-label="Cancel"><Icon name="x" size={15} /></Button>
            </div>
            <div className="adm-chips" role="group" aria-label="Message templates">
              {TEMPLATES[composer].map((t) => {
                const on = message.includes(asSentence(t));
                return (
                  <button key={t} type="button" className={`adm-chip${on ? " is-on" : ""}`} aria-pressed={on}
                    onClick={() => { setMessage((m) => toggleTemplate(m, t)); setError(""); textRef.current?.focus(); }}>
                    {t}
                  </button>
                );
              })}
            </div>
            <div>
              <label className="adm-field-label" htmlFor="adm-msg">Message to {first} <span className="adm-faint">(required, they'll see this)</span></label>
              <textarea id="adm-msg" ref={textRef} className="adm-textarea" value={message} maxLength={1000}
                placeholder={composer === "needs_info" ? "What do you need from them?" : "Why isn't this request approved?"}
                onChange={(e) => { setMessage(e.target.value); if (error) setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitComposer(); } }} />
            </div>
            {composer === "rejected" && (
              <div>
                <label className="adm-field-label" htmlFor="adm-note">Internal note (admins only) <span className="adm-faint">optional</span></label>
                <input id="adm-note" className="adm-input" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)}
                  placeholder="Context for other admins"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitComposer(); } }} />
              </div>
            )}
            <div className="adm-actions">
              {composer === "needs_info"
                ? <Button variant="primary" icon="send" onClick={submitComposer} disabled={!!busy || !message.trim()} kbd={SUBMIT_KEY}>{busy ? "Sending…" : "Send request"}</Button>
                : <Button variant="danger-solid" onClick={submitComposer} disabled={!!busy || !message.trim()} kbd={SUBMIT_KEY}>{busy ? "Rejecting…" : "Reject member"}</Button>}
              <Button variant="ghost" onClick={closeComposer} disabled={!!busy}>Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="adm-actions">
              {can.approve && <Button variant="approve" icon="check" onClick={approve} disabled={!!busy} kbd="A">{busy === "approved" ? "Approving…" : "Approve"}</Button>}
              {can.info && <Button variant="secondary" onClick={() => openComposer("needs_info")} disabled={!!busy} kbd="I">Ask for more info</Button>}
              {can.reject && <Button variant="danger" onClick={() => openComposer("rejected")} disabled={!!busy} kbd="R">Reject</Button>}
              {can.reopen && <Button variant="secondary" icon="undo" onClick={reopen} disabled={!!busy}>{busy === "pending" ? "Moving…" : "Move to pending"}</Button>}
              {can.unfinish && (
                <Button variant="secondary" icon="undo" onClick={unfinish} disabled={!!busy}
                  title={`${first} never sent their details. They go back to finishing their signup and aren't notified.`}>
                  {busy === "incomplete" ? "Moving…" : "Move back to unfinished"}
                </Button>
              )}
            </div>
            <div className="adm-peek-util">
              {blocked
                ? <Button variant="ghost" size="sm" icon="undo" onClick={unblock} disabled={!!busy}>{busy === "unblock" ? "Unblocking…" : "Unblock account"}</Button>
                : <Button variant="ghost" size="sm" icon="ban" className="adm-btn-ghost-danger" onClick={() => { setBlockError(""); setConfirmBlock(true); }} disabled={!!busy}>Block account</Button>}
              <div className="adm-peek-hints" aria-hidden="true">
                <Kbd>J</Kbd><Kbd>K</Kbd><span style={{ marginRight: 10 }}>&nbsp;next / previous</span>
                <Kbd>Esc</Kbd><span>&nbsp;close</span>
              </div>
            </div>
          </>
        )}
      </div>

      {confirmBlock && (
        <ConfirmDialog
          title={`Block ${member.name || "this member"}?`}
          confirmLabel="Block account"
          busy={busy === "block"}
          error={blockError}
          onConfirm={doBlock}
          onCancel={() => { setConfirmBlock(false); peekRef.current?.focus({ preventScroll: true }); }}>
          They can still sign in, but can't post, message or connect with anyone until you unblock them. Their verification status doesn't change.
        </ConfirmDialog>
      )}
    </aside>
  );
}
