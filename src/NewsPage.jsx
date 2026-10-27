import { useEffect, useMemo, useState } from "react";
import PublicShell, { Phrases, useCanonical, INK, MUTED, SAFFRON_TEXT, section, primaryBtn, whatsappShare, SUPPORT_EMAIL } from "./PublicShell";
import { TRUST_LINE } from "./content/home";
import { HOME_TITLE } from "./content/slug";
import { SITE } from "./content/preview";
import {
  NEWS_PATH, NEWS_TITLE, NEWS_LEAD, NEWS_DISCLAIMER, NEWS_SUBMIT, NEWS_TOPICS,
  newsPath, newsBlocks, newsDates, newsDate, newsDay, newsShareText, newsShareUrl, topicsOf, isNewsSlug,
} from "./content/news";
import { getNewsPost } from "./supabaseApi";
import { useNews } from "./newsLive";

// ============================================================================
// NEWS: nriclub.app/news (the list) and /news/<slug> (one post), readable
// without an account (src/content/news.js). The same parts show members the
// news in the app (NewsReader, used by Dashboard.jsx) and our team a draft
// in the admin panel (NewsArticle). The link previews and the text search
// engines read come from api/news.js.
// ============================================================================

const metaStyle = { fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: SAFFRON_TEXT };

// A link to a post (or the list): a plain link, or, with onOpen, one that
// opens it in place (the members' app) unless it's opened in a new tab.
export function NewsLink({ slug, onOpen, children, ...rest }) {
  const click = onOpen ? (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen(slug || null);
  } : undefined;
  return <a href={slug ? newsPath(slug) : NEWS_PATH} onClick={click} {...rest}>{children}</a>;
}

const PostMeta = ({ post }) => (
  <span style={{ ...metaStyle, display: "block" }}>
    {NEWS_TOPICS[post.topic]}
    {post.published_at && <> · <time dateTime={newsDay(post.published_at)}>{newsDate(post.published_at)}</time></>}
    {post.city && ` · ${post.city}`}
  </span>
);

// One post in a list. heading: the element of its title (h2 on the News
// page, h3 under another heading).
export function NewsCard({ post, onOpen, compact, heading: Heading = "h2" }) {
  return (
    <NewsLink slug={post.slug} onOpen={onOpen}
      style={{ display: "block", padding: compact ? "14px 16px" : "18px 20px", borderRadius: 12, border: "1px solid #ECEBE8", textDecoration: "none", color: INK, background: "#fff" }}>
      <PostMeta post={post} />
      <Heading style={{ fontSize: compact ? 15 : 18, fontWeight: 700, lineHeight: 1.35, margin: "6px 0 4px", letterSpacing: "-0.01em" }}>{post.title}</Heading>
      {!compact && <span style={{ display: "block", fontSize: 15, color: MUTED, lineHeight: 1.55 }}>{post.summary}</span>}
    </NewsLink>
  );
}

// A post's text: headings, bullet lists and paragraphs (newsBlocks).
export function NewsBody({ text }) {
  return newsBlocks(text).map((b, i) => {
    if (b.type === "h") return <h2 key={i} style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: SAFFRON_TEXT, margin: "28px 0 8px" }}>{b.text}</h2>;
    if (b.type === "ul") return <ul key={i} style={{ margin: "0 0 14px", paddingLeft: 22, fontSize: 16, lineHeight: 1.7 }}>{b.items.map((t, j) => <li key={j} style={{ marginBottom: 4 }}>{t}</li>)}</ul>;
    return <p key={i} style={{ fontSize: 16, lineHeight: 1.75, margin: "0 0 14px" }}>{b.text}</p>;
  });
}

// The top of a post: the way back (not in the admin panel's preview), its
// topic and date, title and summary.
export function NewsHead({ post, onOpen, back = true }) {
  const dates = newsDates(post);
  return (
    <>
      {back && <NewsLink onOpen={onOpen} style={{ display: "inline-block", padding: "10px 0", fontSize: 14, color: MUTED }}>← All news</NewsLink>}
      <div style={{ marginTop: 10 }}><PostMeta post={{ ...post, published_at: null }} /></div>
      <h1 style={{ fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 800, lineHeight: 1.14, letterSpacing: "-0.03em", margin: "10px 0 10px", overflowWrap: "anywhere" }}>{post.title}</h1>
      <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.6, margin: 0 }}>{post.summary}</p>
      {dates && <p style={{ fontSize: 13, color: MUTED, marginTop: 10 }}>{dates} · From the NRIClub team</p>}
    </>
  );
}

// Share on WhatsApp, and copy the link (each with where it was shared, for
// the website analytics' campaigns).
function ShareRow({ post }) {
  const [copied, setCopied] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(newsShareUrl(post, SITE, "link"));
      setCopied("Link copied");
    } catch (e) {
      setCopied("Couldn't copy: copy the address from your browser instead.");
    }
  };
  const btn = { display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 16px", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textDecoration: "none", boxSizing: "border-box" };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 24 }}>
      <a href={whatsappShare(newsShareText(post, SITE))} target="_blank" rel="noopener noreferrer"
        style={{ ...btn, background: "#E7F6EC", color: "#0B5E2B", border: "1px solid #BFE5CB" }}>Share on WhatsApp</a>
      <button type="button" onClick={copy} style={{ ...btn, background: "#fff", color: INK, border: "1px solid #C9C8C5" }}>Copy link</button>
      <span role="status" style={{ fontSize: 13, color: MUTED }}>{copied}</span>
    </div>
  );
}

// The rest of a post: its text, sources, the note that it isn't advice,
// sharing, then cta (Join free, or what members can do) and more news.
export function NewsArticle({ post, more = [], onOpen, cta, share = true }) {
  return (
    <>
      <NewsBody text={post.body} />
      {post.sources.length > 0 && (
        <section aria-labelledby={`src-${post.slug}`} style={{ marginTop: 26 }}>
          <h2 id={`src-${post.slug}`} style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px" }}>{post.sources.length === 1 ? "Source" : "Sources"}</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.8 }}>
            {post.sources.map((s) => (
              <li key={s.url + s.name}><a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: INK, overflowWrap: "anywhere" }}>{s.name}</a></li>
            ))}
          </ul>
        </section>
      )}
      <p role="note" style={{ marginTop: 22, padding: "12px 14px", borderRadius: 10, background: "#FAFAF8", border: "1px solid #F0EFED", fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
        {NEWS_DISCLAIMER}
      </p>
      {share && post.published_at && <ShareRow post={post} />}
      {cta}
      {more.length > 0 && (
        <section aria-labelledby={`more-${post.slug}`}>
          <h2 id={`more-${post.slug}`} style={{ fontSize: 16, fontWeight: 700, color: MUTED, margin: "36px 0 10px" }}>More news</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {more.map((p) => <NewsCard key={p.slug} post={p} onOpen={onOpen} compact heading="h3" />)}
          </div>
        </section>
      )}
    </>
  );
}

// The list: chips for the topics there are (once there are two), then the posts.
export function NewsList({ posts, loaded, onOpen, missing }) {
  const [topic, setTopic] = useState("");
  const topics = useMemo(() => topicsOf(posts), [posts]);
  const shown = topic ? posts.filter((p) => p.topic === topic) : posts;
  const chip = (active) => ({
    minHeight: 40, padding: "0 14px", borderRadius: 999, fontSize: 14, fontWeight: active ? 600 : 500, cursor: "pointer", fontFamily: "inherit",
    border: `1px solid ${active ? INK : "#C9C8C5"}`, background: active ? INK : "#fff", color: active ? "#fff" : INK,
  });
  return (
    <>
      {missing && <p role="status" style={{ fontSize: 14, color: MUTED, margin: "0 0 16px" }}>That post isn't here any more. Here's the latest news.</p>}
      {topics.length > 1 && (
        <div role="group" aria-label="Topics" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          <button type="button" aria-pressed={!topic} onClick={() => setTopic("")} style={chip(!topic)}>All</button>
          {topics.map((k) => <button key={k} type="button" aria-pressed={topic === k} onClick={() => setTopic(k)} style={chip(topic === k)}>{NEWS_TOPICS[k]}</button>)}
        </div>
      )}
      {!loaded ? (
        <div aria-busy="true" style={{ display: "grid", gap: 12 }}>
          {[0, 1, 2].map((i) => <div key={i} style={{ height: 104, borderRadius: 12, background: "#F4F3F1" }} />)}
        </div>
      ) : shown.length ? (
        <div style={{ display: "grid", gap: 12 }}>
          {shown.map((p) => <NewsCard key={p.slug} post={p} onOpen={onOpen} />)}
        </div>
      ) : (
        <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, padding: "18px 20px", borderRadius: 12, border: "1px dashed #DDDCD8" }}>
          No news yet. We'll post changes to visas, citizenship and taxes, and news from the Indian embassy and consulates, as they come. Check back soon.
        </p>
      )}
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginTop: 22 }}>
        {NEWS_DISCLAIMER} {NEWS_SUBMIT} <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: INK }}>{SUPPORT_EMAIL}</a>
      </p>
    </>
  );
}

// The post at slug: from the list if it's there, else on its own.
// undefined while loading, null when there's no such published post.
export function useNewsPost(slug, posts, loaded) {
  const listed = slug ? posts.find((p) => p.slug === slug) : null;
  const [single, setSingle] = useState({ slug: "", post: undefined });
  useEffect(() => {
    if (!slug || listed || !loaded) return undefined;
    if (!isNewsSlug(slug)) { setSingle({ slug, post: null }); return undefined; }
    let alive = true;
    getNewsPost(slug).then((post) => { if (alive) setSingle({ slug, post }); }).catch(() => { if (alive) setSingle({ slug, post: null }); });
    return () => { alive = false; };
  }, [slug, listed, loaded]);
  if (!slug) return null;
  if (listed) return listed;
  return single.slug === slug ? single.post : undefined;
}

// The title of the browser's tab while a post or the list shows.
function useNewsTitle(post, slug) {
  useEffect(() => {
    document.title = post ? `${post.title} · NRIClub` : slug && post === undefined ? "News · NRIClub" : `${NEWS_TITLE} · NRIClub`;
    return () => { document.title = HOME_TITLE; };
  }, [post, slug]);
}

const ArticleSkeleton = () => (
  <div aria-busy="true">
    <div style={{ height: 14, width: 120, borderRadius: 6, background: "#F4F3F1", marginTop: 20 }} />
    <div style={{ height: 40, width: "80%", borderRadius: 8, background: "#F4F3F1", marginTop: 16 }} />
    <div style={{ height: 80, borderRadius: 8, background: "#F4F3F1", marginTop: 16 }} />
  </div>
);

// The members' News in the app (Dashboard.jsx): the list, or a post. onOpen
// opens a post (a slug) or the list (null); onAsk opens Ask & Guides.
export function NewsReader({ slug, onOpen, onAsk }) {
  const { posts, loaded } = useNews();
  const post = useNewsPost(slug, posts, loaded);
  useEffect(() => { window.scrollTo(0, 0); }, [slug]);
  if (slug && post === undefined) return <ArticleSkeleton />;
  if (slug && post) {
    const cta = onAsk && (
      <div style={{ marginTop: 28, padding: "18px 18px", borderRadius: 12, border: "1px solid #ECEBE8", background: "#FCFCFB" }}>
        <strong style={{ display: "block", fontSize: 15, marginBottom: 4 }}>Questions about this?</strong>
        <span style={{ display: "block", fontSize: 14, color: MUTED, marginBottom: 12 }}>Ask the community: members who've been through it often know the details.</span>
        <button type="button" onClick={onAsk} style={{ ...primaryBtn, padding: "10px 18px", fontSize: 14 }}>Ask a question</button>
      </div>
    );
    return (
      <article style={{ maxWidth: 720 }}>
        <NewsHead post={post} onOpen={onOpen} />
        <div style={{ marginTop: 22 }}>
          <NewsArticle post={post} more={posts.filter((p) => p.slug !== post.slug).slice(0, 3)} onOpen={onOpen} cta={cta} />
        </div>
      </article>
    );
  }
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>News</h1>
      <p style={{ fontSize: 14, color: MUTED, margin: "0 0 18px", lineHeight: 1.6 }}>{NEWS_LEAD}</p>
      <NewsList posts={posts} loaded={loaded} onOpen={onOpen} missing={!!slug} />
    </div>
  );
}

export default function NewsPage({ slug, onJoin, onLogin }) {
  const { posts, loaded } = useNews();
  const post = useNewsPost(slug, posts, loaded);
  useCanonical(post ? newsPath(post.slug) : NEWS_PATH);
  useNewsTitle(post, slug);
  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  const join = (
    <div style={{ marginTop: 32, padding: "22px 20px", borderRadius: 14, border: "1px solid #ECEBE8", background: "#FCFCFB", textAlign: "center" }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 6px" }}>{post ? "Questions about this? Ask Indians who've been through it." : "Get the news with your community."}</h2>
      <p style={{ fontSize: 14, color: MUTED, margin: "0 auto 16px", maxWidth: 460 }}>NRIClub is a free community for Indians abroad: a group for your city, answers from members, events and festivals.</p>
      <button type="button" onClick={onJoin} style={primaryBtn}>Join free</button>
      <p style={{ fontSize: 13, color: MUTED, margin: "12px 0 0" }}><Phrases text={TRUST_LINE} /></p>
    </div>
  );

  if (slug && post === undefined) {
    return (
      <PublicShell onLogin={onLogin} onJoin={onJoin} hero={<div style={{ ...section, maxWidth: 720, paddingBottom: 24 }}><ArticleSkeleton /></div>} />
    );
  }

  if (post) {
    const hero = (
      <div style={{ ...section, maxWidth: 720, paddingTop: "clamp(16px, 4vh, 40px)", paddingBottom: 28 }}>
        <NewsHead post={post} />
      </div>
    );
    return (
      <PublicShell onLogin={onLogin} onJoin={onJoin} hero={hero}>
        <article style={{ ...section, maxWidth: 720 }}>
          <NewsArticle post={post} more={posts.filter((p) => p.slug !== post.slug).slice(0, 3)} cta={join} />
        </article>
      </PublicShell>
    );
  }

  const hero = (
    <div style={{ ...section, paddingTop: "clamp(20px, 5vh, 48px)", paddingBottom: 32, textAlign: "center" }}>
      <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 800, letterSpacing: "-0.04em", margin: "0 0 12px" }}>{NEWS_TITLE}</h1>
      <p style={{ fontSize: 17, color: MUTED, maxWidth: 600, margin: "0 auto", lineHeight: 1.6 }}>{NEWS_LEAD}</p>
    </div>
  );
  return (
    <PublicShell onLogin={onLogin} onJoin={onJoin} hero={hero}>
      <section style={{ ...section, maxWidth: 720 }}>
        <NewsList posts={posts} loaded={loaded} missing={!!slug} />
        {join}
      </section>
    </PublicShell>
  );
}
