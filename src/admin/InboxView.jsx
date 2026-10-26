// Inbox: mail sent to hello@nriclub.app. Resend receives it and the Edge
// Function forward-email keeps it here, and only here (no copy goes to any
// other mailbox since 26 October 2026). Unread
// messages first; open one to read it (as plain text: an email's HTML is
// never put into this page), archive it, or reply from hello@nriclub.app
// (the Edge Function admin-inbox-reply). Messages are deleted 12 months
// after they arrived.
import { useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { Button, EmptyState, ErrorNote, Icon, PageHeader, Pill, SkeletonRows } from "./ui";
import { ago, formatDate, friendlyError } from "./format";

const SEARCH_DELAY_MS = 300;
// Resend's plan: emails a month and a day (the free plan's; change them
// with the plan). Sign-in and sign-up codes count too.
export const EMAIL_LIMITS = { month: 3000, day: 100 };
const WARN_AT = 0.8;
const REPLY_MAX = 10000;
const FILTERS = [["inbox", "Inbox"], ["unread", "Unread"], ["archived", "Archived"], ["all", "All"]];

// "Asha Rao <asha@example.org>" -> "Asha Rao"; a bare address stays.
const senderName = (from) => (/^\s*"?([^"<]+?)"?\s*</.exec(from || "")?.[1] || from || "Unknown sender").trim();

// An email that only came as HTML, as plain text. DOMParser builds a
// document that runs no scripts and loads nothing; only its text is used.
function htmlToText(html) {
  try {
    const marked = String(html || "").replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "$&\n");
    const doc = new DOMParser().parseFromString(marked, "text/html");
    doc.querySelectorAll("script, style, head").forEach((el) => el.remove());
    return (doc.body?.textContent || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return "";
  }
}

const sizeText = (n) => (typeof n !== "number" ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function Message({ id, onBack, onChange, showToast }) {
  const [m, setM] = useState(null);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setM(null);
    setError("");
    api.adminInboxGet(id).then((row) => {
      if (!alive) return;
      setM(row);
      onChange(row);
    }).catch((e) => { if (alive) setError(friendlyError(e)); });
    return () => { alive = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = async (patch, text) => {
    if (busy) return;
    setBusy(true);
    try {
      const row = await api.adminInboxSet(id, patch);
      setM((x) => ({ ...x, ...row }));
      onChange(row);
      showToast({ text });
      if (patch.archived || patch.read === false) onBack();
    } catch (e) {
      showToast({ text: friendlyError(e), tone: "error" });
    }
    setBusy(false);
  };

  const send = async () => {
    const body = reply.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError("");
    try {
      const res = await api.adminInboxReply(id, body);
      const r = res?.reply || { id: `local-${Date.now()}`, body, sent_at: new Date().toISOString(), by: "You" };
      setM((x) => ({ ...x, replied_at: r.sent_at, replies: [...(x.replies || []), r] }));
      onChange({ id, replied_at: r.sent_at, read: true });
      setReply("");
      showToast({ text: res?.reply ? "Reply sent" : "Reply sent. It couldn't be saved here, so it won't show under the message.", icon: "check" });
    } catch (e) {
      setSendError(e.unreachable
        ? "The reply couldn't be sent: the server function isn't reachable. It may not be set up yet (docs/EMAIL-SETUP.md). Please try again later."
        : friendlyError(e));
    }
    setSending(false);
  };

  const text = m ? (m.text?.trim() ? m.text : htmlToText(m.html)) : "";
  const files = m?.attachment_list || [];
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Button variant="ghost" size="sm" onClick={onBack}>← Back to the Inbox</Button>
      </div>
      {error ? <ErrorNote onRetry={onBack}>{error}</ErrorNote> : !m ? <SkeletonRows rows={3} /> : (
        <article aria-labelledby="adm-mail-subject">
          <h2 id="adm-mail-subject" className="adm-title" style={{ fontSize: 22, overflowWrap: "anywhere" }}>{m.subject || "(no subject)"}</h2>
          <div style={{ margin: "12px 0 16px", display: "grid", gap: 2 }}>
            <div className="adm-muted adm-small" style={{ overflowWrap: "anywhere" }}>
              From <strong style={{ color: "var(--text)" }}>{m.from || "unknown"}</strong>
              {m.reply_to && m.reply_to !== m.from ? <> · Reply to {m.reply_to}</> : null}
            </div>
            <div className="adm-muted adm-small" style={{ overflowWrap: "anywhere" }}>
              To {(m.to || []).join(", ") || "hello@nriclub.app"} · {formatDate(m.received_at, { time: true })}
              {m.archived && <> · <Pill tone="gray">Archived</Pill></>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            {m.archived
              ? <Button variant="secondary" size="sm" onClick={() => set({ archived: false }, "Moved back to the Inbox")} disabled={busy}>Move to Inbox</Button>
              : <Button variant="secondary" size="sm" onClick={() => set({ archived: true }, "Archived")} disabled={busy}>Archive</Button>}
            <Button variant="ghost" size="sm" onClick={() => set({ read: false }, "Marked unread")} disabled={busy}>Mark unread</Button>
          </div>
          <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.6, padding: "14px 16px", border: "1px solid var(--line)", borderRadius: 8, background: "#FCFCFB" }}>
            {text || <span className="adm-faint">This email has no text.</span>}
          </div>
          {files.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="adm-field-label">Attachments (kept with Resend; open them in Resend under Emails → Receiving)</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {files.map((a, i) => (
                  <li key={i} style={{ overflowWrap: "anywhere" }}>{a.filename}<span className="adm-faint">{[a.content_type, sizeText(a.size)].filter(Boolean).length ? ` · ${[a.content_type, sizeText(a.size)].filter(Boolean).join(" · ")}` : ""}</span></li>
                ))}
              </ul>
            </div>
          )}

          {(m.replies || []).length > 0 && (
            <section style={{ marginTop: 24 }} aria-label="Our replies">
              {m.replies.map((r) => (
                <div key={r.id} style={{ borderLeft: "3px solid var(--line-strong)", padding: "4px 0 4px 12px", marginBottom: 12 }}>
                  <div className="adm-muted adm-small">{r.by || "NRIClub Team"} replied {formatDate(r.sent_at, { time: true })}</div>
                  <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 4 }}>{r.body}</div>
                </div>
              ))}
            </section>
          )}

          <div style={{ marginTop: 24 }}>
            <label className="adm-field-label" htmlFor="adm-reply">Reply <span className="adm-faint">(from hello@nriclub.app, as plain text)</span></label>
            <textarea id="adm-reply" className="adm-textarea" style={{ minHeight: 140 }} value={reply} maxLength={REPLY_MAX}
              onChange={(e) => { setReply(e.target.value); setSendError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
            {sendError && <ErrorNote>{sendError}</ErrorNote>}
            <div className="adm-actions" style={{ marginTop: 8 }}>
              <Button variant="primary" icon="send" onClick={send} disabled={sending || !reply.trim()}>{sending ? "Sending…" : "Send reply"}</Button>
            </div>
          </div>
        </article>
      )}
    </>
  );
}

const fmt = (n) => Number(n).toLocaleString("en-GB");

// "Emails this month: 1,234 of 3,000 used · 1,766 left", and today's, from
// Resend's own counter (api.adminEmailQuota); warns above 80%.
export function EmailQuota() {
  const [q, setQ] = useState(undefined); // undefined: loading; null: not known
  useEffect(() => {
    let alive = true;
    api.adminEmailQuota().then((v) => { if (alive) setQ(v || null); }).catch(() => { if (alive) setQ(null); });
    return () => { alive = false; };
  }, []);
  if (q === undefined) return null;
  const month = Number.isFinite(q?.monthly_used) ? q.monthly_used : null;
  const day = Number.isFinite(q?.daily_used) ? q.daily_used : null;
  if (month === null && day === null) {
    return <p className="adm-callout" role="status">Emails this month: not known yet. Resend's count shows here after the next email goes out.</p>;
  }
  const warn = (month !== null && month >= EMAIL_LIMITS.month * WARN_AT) || (day !== null && day >= EMAIL_LIMITS.day * WARN_AT);
  return (
    <p className={warn ? "adm-warn-note" : "adm-callout"} role="status" style={{ marginTop: 12 }}>
      {month !== null && <>Emails this month: <strong>{fmt(month)}</strong> of {fmt(EMAIL_LIMITS.month)} used · {fmt(Math.max(0, EMAIL_LIMITS.month - month))} left</>}
      {month !== null && day !== null && <br />}
      {day !== null && <>Today: {fmt(day)} of {fmt(EMAIL_LIMITS.day)}</>}
      <span className="adm-faint">{q.observed_at ? ` · as of ${formatDate(q.observed_at, { time: true })}` : ""}</span>
      {warn && <><br />Close to Resend's limit: sign-in codes stop going out when it's reached.</>}
    </p>
  );
}

// onUnread(n): the number of unread messages, for the nav.
export default function InboxView({ showToast, onUnread }) {
  const [filter, setFilter] = useState("inbox");
  const [query, setQuery] = useState("");
  const [list, setList] = useState(undefined); // undefined: loading; null: before the database update
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const seq = useRef(0);

  const load = async ({ more = false } = {}) => {
    const s = more ? seq.current : ++seq.current;
    if (!more) setError("");
    try {
      const res = await api.adminInboxList({ filter, query: query.trim(), offset: more ? list?.messages.length || 0 : 0 });
      if (s !== seq.current) return;
      if (res === null) { setList(null); return; }
      onUnread?.(Number(res.unread) || 0);
      setList((cur) => (more && cur ? { ...res, messages: [...cur.messages, ...res.messages.filter((x) => !cur.messages.some((c) => c.id === x.id))] } : res));
    } catch (e) {
      if (s === seq.current) setError(friendlyError(e));
    }
  };

  useEffect(() => {
    const t = setTimeout(() => load(), query ? SEARCH_DELAY_MS : 0);
    return () => clearTimeout(t);
  }, [filter, query]); // eslint-disable-line react-hooks/exhaustive-deps

  // A message changed in the message view: the list follows.
  const changed = (row) => {
    setList((cur) => {
      if (!cur) return cur;
      const before = cur.messages.find((x) => x.id === row.id);
      const wasUnread = before && !before.read && !before.archived;
      const isUnread = row.read === false && !(row.archived ?? before?.archived);
      const unread = Math.max(0, (Number(cur.unread) || 0) + (before ? (isUnread ? 1 : 0) - (wasUnread ? 1 : 0) : 0));
      onUnread?.(unread);
      return { ...cur, unread, messages: cur.messages.map((x) => (x.id === row.id ? { ...x, ...row } : x)) };
    });
  };

  if (openId) {
    return <Message id={openId} showToast={showToast} onChange={changed} onBack={() => { setOpenId(null); load(); }} />;
  }

  const messages = list?.messages || [];
  const more = list ? Math.max(0, (Number(list.total) || 0) - messages.length) : 0;
  return (
    <>
      <PageHeader title="Inbox" description="Mail sent to hello@nriclub.app. Reply from here as hello@nriclub.app, or archive what's done. Messages are deleted 12 months after they arrive.">
        <EmailQuota />
      </PageHeader>
      {list === null ? (
        <p className="adm-callout" role="note">
          The Inbox needs the database update of 25 October 2026. Until it's in, mail to hello@nriclub.app can't be kept here: it stays in Resend under Emails → Receiving.
        </p>
      ) : (
        <>
          <div className="adm-toolbar">
            <label className="adm-search">
              <Icon name="search" size={15} />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sender, subject or text" aria-label="Search the Inbox" />
            </label>
            <div className="adm-filters" role="group" aria-label="Show">
              {FILTERS.map(([k, label]) => (
                <button key={k} type="button" className="adm-filter" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {label}{k === "unread" && list?.unread > 0 && <span className="adm-filter-count">{list.unread}</span>}
                </button>
              ))}
            </div>
          </div>
          {error && <ErrorNote onRetry={() => load()}>{`Couldn't load the Inbox: ${error}`}</ErrorNote>}
          {list === undefined ? <SkeletonRows rows={4} /> : messages.length === 0 ? (
            <EmptyState icon="mail" title={query ? "No messages match" : filter === "archived" ? "Nothing archived" : filter === "unread" ? "No unread messages" : "No messages"}>
              {query ? "Try a different word." : "Mail to hello@nriclub.app shows here."}
            </EmptyState>
          ) : (
            <div className="adm-list" role="list" aria-label="Messages">
              {messages.map((x) => {
                const unread = !x.read;
                return (
                  <div key={x.id} role="listitem" tabIndex={0} className="adm-row adm-inbox-row" onClick={() => setOpenId(x.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(x.id); } }}
                    aria-label={`${unread ? "Unread. " : ""}From ${senderName(x.from)}: ${x.subject || "no subject"}`}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline", minWidth: 0 }}>
                        {unread && <span className="adm-online-dot" aria-hidden="true" style={{ flexShrink: 0 }} />}
                        <span className="adm-ellipsis" style={{ fontWeight: unread ? 700 : 500 }}>{senderName(x.from)}</span>
                        <span className="adm-faint adm-small" style={{ marginLeft: "auto", flexShrink: 0 }} title={formatDate(x.received_at, { time: true })}>{ago(x.received_at)}</span>
                      </div>
                      <div className="adm-ellipsis" style={{ fontWeight: unread ? 650 : 400 }}>
                        {x.subject || "(no subject)"}
                        {x.replied_at && <> <Pill tone="green">Replied</Pill></>}
                        {x.archived && filter === "all" && <> <Pill tone="gray">Archived</Pill></>}
                        {x.attachments > 0 && <span className="adm-faint adm-small"> · {x.attachments} attachment{x.attachments === 1 ? "" : "s"}</span>}
                      </div>
                      <div className="adm-ellipsis adm-muted adm-small">{x.snippet}</div>
                    </div>
                  </div>
                );
              })}
              {more > 0 && (
                <div className="adm-more">
                  <Button variant="secondary" size="sm" disabled={loadingMore}
                    onClick={async () => { setLoadingMore(true); await load({ more: true }); setLoadingMore(false); }}>
                    {loadingMore ? "Loading…" : `Show ${Math.min(api.INBOX_PAGE, more)} more`}
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
