// News: what our team writes for Indians in Germany (src/content/news.js),
// public at nriclub.app/news once published, on the homepage and in the
// members' Home. Posts are saved as drafts first; publishing makes them
// public within a minute (the link preview for WhatsApp too). The database
// checks every post with the same rules as this form (newsProblem).
import { useEffect, useMemo, useState } from "react";
import * as api from "../supabaseApi";
import { Button, ConfirmDialog, EmptyState, ErrorNote, PageHeader, Pill, SectionTitle, SkeletonRows } from "./ui";
import { friendlyError } from "./format";
import {
  NEWS_TOPICS, NEWS_LIMITS, newsSlug, newsProblem, newsPath, newsShareText, newsDate, cleanNews,
} from "../content/news";
import { SITE } from "../content/preview";
import { NewsHead, NewsArticle } from "../NewsPage";

const EMPTY_SOURCE = { name: "", url: "" };
const EMPTY_FORM = { slug: "", title: "", topic: "visa", city: "", summary: "", body: "", sources: [{ ...EMPTY_SOURCE }] };

// The form as the database takes it (empty source rows left out).
const toPost = (f) => ({
  slug: f.slug.trim(), title: f.title.trim(), topic: f.topic, city: f.city.trim(), summary: f.summary.trim(), body: f.body.trim(),
  sources: f.sources.map((s) => ({ name: s.name.trim(), url: s.url.trim() })).filter((s) => s.name || s.url),
});

function PostForm({ initial, isNew, takenSlugs, onSave, onCancel }) {
  const [f, setF] = useState(() => ({ ...EMPTY_FORM, ...initial, sources: initial.sources?.length ? initial.sources.map((s) => ({ ...s })) : [{ ...EMPTY_SOURCE }] }));
  const [slugEdited, setSlugEdited] = useState(!isNew);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => {
    const v = e.target.value;
    setF((x) => ({ ...x, [k]: v, ...(k === "title" && isNew && !slugEdited ? { slug: newsSlug(v) } : {}) }));
    setError("");
  };
  const setSource = (i, k) => (e) => {
    const v = e.target.value;
    setF((x) => ({ ...x, sources: x.sources.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }));
    setError("");
  };
  const post = toPost(f);
  const missing = !post.title || !post.summary || !post.body || !post.slug;
  const shown = cleanNews({ ...post, published_at: initial.published_at || null, edited_at: initial.edited_at || null });

  const save = async () => {
    const problem = newsProblem(post) || (isNew && takenSlugs.has(post.slug) ? "A post with this address already exists. Change the address." : "");
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError("");
    try {
      await onSave(post, isNew);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  const published = initial.status === "published";
  return (
    <ConfirmDialog wide tone="primary" title={isNew ? "Write a post" : `Change "${initial.title}"`}
      confirmLabel={isNew ? "Save draft" : published ? "Save changes (live)" : "Save changes"}
      busy={busy} error={error} confirmDisabled={missing} onConfirm={save} onCancel={onCancel}>
      <p style={{ margin: 0 }} className="adm-muted">
        Take the facts from the official source and write in your own words. Never copy a newspaper's text or photos. Say what changes, for whom and from when.
        {published && " This post is published: saved changes show on the site within a minute, marked \"Updated\"."}
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }} role="tablist" aria-label="Write or preview">
        <Button variant={preview ? "ghost" : "secondary"} size="sm" role="tab" aria-selected={!preview} onClick={() => setPreview(false)}>Write</Button>
        <Button variant={preview ? "secondary" : "ghost"} size="sm" role="tab" aria-selected={preview} onClick={() => setPreview(true)} disabled={!shown}>Preview</Button>
      </div>
      {preview && shown ? (
        <div style={{ marginTop: 12, padding: "8px 18px 18px", border: "1px solid #ECEBE8", borderRadius: 12, background: "#fff", color: "#37352F", fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", textAlign: "left" }}>
          <NewsHead post={shown} back={false} />
          <div style={{ marginTop: 18 }}><NewsArticle post={shown} share={false} /></div>
        </div>
      ) : (
        <div className="adm-form">
          <div>
            <label className="adm-field-label" htmlFor="nw-title">Title</label>
            <input id="nw-title" className="adm-input" value={f.title} maxLength={NEWS_LIMITS.titleMax} onChange={set("title")} placeholder="e.g. Blue Card: new salary thresholds from 1 January 2027" />
          </div>
          <div>
            <label className="adm-field-label" htmlFor="nw-slug">Address <span className="adm-faint">({isNew ? "from the title; it can't change once saved" : "can't change"})</span></label>
            <input id="nw-slug" className="adm-input" value={f.slug} maxLength={NEWS_LIMITS.slugMax} disabled={!isNew}
              onChange={(e) => { setSlugEdited(true); set("slug")(e); }} />
            <div className="adm-help" style={{ overflowWrap: "anywhere" }}>nriclub.app{newsPath(f.slug || "…")}</div>
          </div>
          <div className="adm-wo-pair">
            <div>
              <label className="adm-field-label" htmlFor="nw-topic">Topic</label>
              <select id="nw-topic" className="adm-select" value={f.topic} onChange={set("topic")}>
                {Object.entries(NEWS_TOPICS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="adm-field-label" htmlFor="nw-city">City <span className="adm-faint">(optional; empty for all of Germany)</span></label>
              <input id="nw-city" className="adm-input" value={f.city} maxLength={100} onChange={set("city")} />
            </div>
          </div>
          <div>
            <label className="adm-field-label" htmlFor="nw-summary">Summary <span className="adm-faint">(one or two sentences: the list, the homepage and the WhatsApp preview show it)</span></label>
            <textarea id="nw-summary" className="adm-textarea" value={f.summary} maxLength={NEWS_LIMITS.summaryMax} onChange={set("summary")} aria-describedby="nw-summary-count" />
            <div id="nw-summary-count" className="adm-help" style={{ textAlign: "right" }}>{f.summary.length} / {NEWS_LIMITS.summaryMax}</div>
          </div>
          <div>
            <label className="adm-field-label" htmlFor="nw-body">Text</label>
            <textarea id="nw-body" className="adm-textarea" style={{ minHeight: 220 }} value={f.body} maxLength={NEWS_LIMITS.body} onChange={set("body")} aria-describedby="nw-body-help" />
            <div id="nw-body-help" className="adm-help">
              An empty line between paragraphs. A short line in CAPITALS is a heading (e.g. WHO IS AFFECTED). Start a line with "- " for a bullet. No links here: put them under Sources.
            </div>
          </div>
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend className="adm-field-label">Sources <span className="adm-faint">(at least one, up to {NEWS_LIMITS.sources}: the official page the facts come from)</span></legend>
            {f.sources.map((s, i) => (
              <div key={i} className="adm-wo-pair" style={{ marginBottom: 8 }}>
                <input className="adm-input" aria-label={`Source ${i + 1}: name`} placeholder="Name, e.g. BAMF" value={s.name} maxLength={NEWS_LIMITS.sourceName} onChange={setSource(i, "name")} />
                <input className="adm-input" aria-label={`Source ${i + 1}: link`} placeholder="https://…" type="url" inputMode="url" value={s.url} maxLength={NEWS_LIMITS.url} onChange={setSource(i, "url")} />
              </div>
            ))}
            {f.sources.length < NEWS_LIMITS.sources && (
              <Button variant="ghost" size="sm" onClick={() => setF((x) => ({ ...x, sources: [...x.sources, { ...EMPTY_SOURCE }] }))}>Add a source</Button>
            )}
          </fieldset>
        </div>
      )}
    </ConfirmDialog>
  );
}

function PostRow({ p, children }) {
  const when = p.status === "draft" ? `Saved ${newsDate(p.updated_at)}`
    : `Published ${newsDate(p.published_at)}${p.edited_at ? ` · Updated ${newsDate(p.edited_at)}` : ""}`;
  return (
    <div className="adm-item">
      <div className="adm-item-main">
        <div className="adm-item-title">
          <span style={{ overflowWrap: "anywhere" }}>{p.title}</span>
          {p.status === "draft" && <Pill tone="yellow">Draft</Pill>}
          {p.status === "published" && <Pill tone="green">Published</Pill>}
          {p.status === "hidden" && <Pill tone="gray">Off the site</Pill>}
        </div>
        <div className="adm-item-text">{p.summary}</div>
        <div className="adm-item-meta">
          {NEWS_TOPICS[p.topic] || p.topic}{p.city ? ` · ${p.city}` : ""} · {when}
          {p.status === "published" && <> · <a href={`${SITE}${newsPath(p.slug)}`} target="_blank" rel="noopener noreferrer" className="adm-link">Open on the site</a></>}
        </div>
      </div>
      {children && <div className="adm-item-actions">{children}</div>}
    </div>
  );
}

export default function NewsView({ showToast }) {
  const [posts, setPosts] = useState(undefined); // undefined: loading; null: before the database update
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // { initial, isNew }
  const [publishing, setPublishing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [busySlug, setBusySlug] = useState(null);

  const load = async () => {
    setError("");
    try {
      setPosts(await api.adminNewsPosts());
    } catch (e) {
      setError(friendlyError(e));
      setPosts((p) => (p === undefined ? [] : p));
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const list = posts || [];
  const takenSlugs = useMemo(() => new Set(list.map((p) => p.slug)), [list]);
  const put = (saved) => setPosts((ps) => [saved, ...(ps || []).filter((p) => p.slug !== saved.slug)]
    .sort((a, b) => String(b.published_at || b.updated_at).localeCompare(String(a.published_at || a.updated_at))));

  const save = async (post, isNew) => {
    const saved = await api.adminSaveNewsPost(post, isNew);
    put(saved);
    setEditing(null);
    showToast({ text: isNew ? `Saved "${saved.title}" as a draft` : `Saved "${saved.title}"`, icon: "check" });
  };

  const setStatus = async (p, status) => {
    const saved = await api.adminSetNewsStatus(p.slug, status);
    put(saved);
    return saved;
  };

  const publish = async () => {
    const p = publishing;
    setDialogBusy(true);
    setDialogError("");
    try {
      await setStatus(p, "published");
      setPublishing(null);
      showToast({ text: `Published "${p.title}". Use Copy for WhatsApp to share it.`, icon: "check" });
    } catch (err) {
      setDialogError(friendlyError(err));
    }
    setDialogBusy(false);
  };

  const takeOff = async (p) => {
    if (busySlug) return;
    setBusySlug(p.slug);
    try {
      await setStatus(p, "hidden");
      showToast({
        text: `"${p.title}" is off the site`,
        undo: async () => { await setStatus(p, "published"); return "Published again"; },
      });
    } catch (err) {
      showToast({ text: friendlyError(err), tone: "error" });
    }
    setBusySlug(null);
  };

  const copyForWhatsApp = async (p) => {
    try {
      await navigator.clipboard.writeText(newsShareText(p, SITE));
      showToast({ text: "Copied. Paste it into the WhatsApp group (with the admin's OK).", icon: "copy" });
    } catch (e) {
      showToast({ text: "Couldn't copy. Open the post on the site and share it from there.", tone: "error" });
    }
  };

  const remove = async () => {
    const p = deleting;
    setDialogBusy(true);
    setDialogError("");
    try {
      await api.adminDeleteNewsPost(p.slug);
      setPosts((ps) => (ps || []).filter((x) => x.slug !== p.slug));
      setDeleting(null);
      showToast({ text: `Deleted "${p.title}"` });
    } catch (err) {
      setDialogError(friendlyError(err));
    }
    setDialogBusy(false);
  };

  const ready = posts !== undefined;
  const drafts = list.filter((p) => p.status === "draft");
  const live = list.filter((p) => p.status === "published");
  const off = list.filter((p) => p.status === "hidden");
  const edit = (p) => setEditing({ initial: p, isNew: false });
  const askDelete = (p) => { setDialogError(""); setDeleting(p); };

  return (
    <>
      <PageHeader title="News" description="News for Indians in Germany, at nriclub.app/news, on the homepage and in the members' Home. Write in your own words, name the official source, and publish when it's checked. About one post a week keeps the page alive.">
        {posts && <div style={{ marginTop: 14 }}><Button variant="primary" onClick={() => setEditing({ initial: {}, isNew: true })}>Write a post</Button></div>}
      </PageHeader>

      {error && <ErrorNote onRetry={load}>{`Couldn't load the news: ${error}`}</ErrorNote>}
      {posts === null && (
        <p className="adm-callout" role="note" style={{ margin: "0 0 16px" }}>
          News needs the database update of 3 November 2026 (supabase/oneoff/2026-11-03-news). Until then the site says there's no news yet.
        </p>
      )}

      {!ready ? <SkeletonRows rows={3} /> : posts && (
        <>
          {list.length === 0 && (
            <EmptyState icon="note" title="No posts yet">Write the first one: a rule that changed, a consulate notice, a deadline. Save it as a draft, check the preview, then publish.</EmptyState>
          )}
          {drafts.length > 0 && (
            <section>
              <SectionTitle count={drafts.length}>Drafts</SectionTitle>
              {drafts.map((p) => (
                <PostRow key={p.slug} p={p}>
                  <Button variant="ghost" size="sm" onClick={() => edit(p)}>Edit…</Button>
                  <Button variant="secondary" size="sm" onClick={() => { setDialogError(""); setPublishing(p); }}>Publish…</Button>
                  <Button variant="ghost" size="sm" className="adm-btn-ghost-danger" onClick={() => askDelete(p)} aria-label={`Delete ${p.title}`}>Delete…</Button>
                </PostRow>
              ))}
            </section>
          )}
          {live.length > 0 && (
            <section>
              <SectionTitle count={live.length}>Published</SectionTitle>
              {live.map((p) => (
                <PostRow key={p.slug} p={p}>
                  <Button variant="secondary" size="sm" icon="copy" onClick={() => copyForWhatsApp(p)}>Copy for WhatsApp</Button>
                  <Button variant="ghost" size="sm" onClick={() => edit(p)} disabled={busySlug === p.slug}>Edit…</Button>
                  <Button variant="ghost" size="sm" onClick={() => takeOff(p)} disabled={busySlug === p.slug}>Take off the site</Button>
                  <Button variant="ghost" size="sm" className="adm-btn-ghost-danger" onClick={() => askDelete(p)} aria-label={`Delete ${p.title}`}>Delete…</Button>
                </PostRow>
              ))}
            </section>
          )}
          {off.length > 0 && (
            <section>
              <SectionTitle count={off.length}>Off the site</SectionTitle>
              {off.map((p) => (
                <PostRow key={p.slug} p={p}>
                  <Button variant="ghost" size="sm" onClick={() => edit(p)}>Edit…</Button>
                  <Button variant="secondary" size="sm" onClick={() => { setDialogError(""); setPublishing(p); }}>Publish again…</Button>
                  <Button variant="ghost" size="sm" className="adm-btn-ghost-danger" onClick={() => askDelete(p)} aria-label={`Delete ${p.title}`}>Delete…</Button>
                </PostRow>
              ))}
            </section>
          )}
        </>
      )}

      {editing && <PostForm initial={editing.initial} isNew={editing.isNew} takenSlugs={takenSlugs} onSave={save} onCancel={() => setEditing(null)} />}
      {publishing && (
        <ConfirmDialog tone="primary" title={`Publish "${publishing.title}"?`} confirmLabel="Publish" busy={dialogBusy} error={dialogError}
          onConfirm={publish} onCancel={() => setPublishing(null)}>
          Anyone can read it at nriclub.app{newsPath(publishing.slug)} within a minute, and it shows on the homepage and in the members' Home.
          Before you publish: the facts match the source, it's in our own words with nothing copied, and the date of any change is right.
        </ConfirmDialog>
      )}
      {deleting && (
        <ConfirmDialog title={`Delete "${deleting.title}"?`} confirmLabel="Delete post" busy={dialogBusy} error={dialogError}
          onConfirm={remove} onCancel={() => setDeleting(null)}>
          {deleting.status === "draft" ? "The draft is gone for good." : "Links already shared will show \"not found\". To take it off for a while instead, use Take off the site."} This can't be undone.
        </ConfirmDialog>
      )}
    </>
  );
}
