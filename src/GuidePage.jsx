import { useEffect } from "react";
import PublicShell, { INK, MUTED, SAFFRON, section, primaryBtn } from "./PublicShell";
import { ESSENTIALS } from "./content/essentials";
import { guideBlocks } from "./content/guideBlocks";

// ============================================================================
// PUBLIC GUIDES: nriclub.app/guides (the list) and /guides/<slug> (one
// guide), readable without an account. Members see the same guides pinned
// in Guides.
// ============================================================================

export function GuideBody({ text }) {
  return guideBlocks(text).map((b, i) => {
    if (b.type === "h") return <h2 key={i} style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: SAFFRON, margin: "28px 0 8px" }}>{b.text}</h2>;
    if (b.type === "ul") return <ul key={i} style={{ margin: "0 0 12px", paddingLeft: 22, fontSize: 16, lineHeight: 1.7 }}>{b.items.map((t, j) => <li key={j} style={{ marginBottom: 4 }}>{t}</li>)}</ul>;
    return <p key={i} style={{ fontSize: 16, lineHeight: 1.75, margin: "0 0 14px" }}>{b.text}</p>;
  });
}

export default function GuidePage({ slug, onJoin, onLogin }) {
  const guide = slug ? ESSENTIALS.find((g) => g.slug === slug) : null;

  useEffect(() => {
    const title = document.title;
    document.title = guide ? `${guide.title} · NRIClub` : "NRI essentials guides · NRIClub";
    window.scrollTo(0, 0);
    return () => { document.title = title; };
  }, [guide]);

  const join = (
    <div style={{ marginTop: 36, padding: "22px 20px", borderRadius: 14, border: "1px solid #ECEBE8", background: "#FCFCFB", textAlign: "center" }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 6px" }}>Questions? Ask Indians who've done it.</h2>
      <p style={{ fontSize: 14, color: MUTED, margin: "0 auto 16px", maxWidth: 460 }}>NRIClub is a free, verified community for Indians abroad: one group in every city, answers from members, desi places and festivals.</p>
      <button onClick={onJoin} style={primaryBtn}>Join NRIClub</button>
    </div>
  );

  if (!guide) {
    const hero = (
      <div style={{ ...section, paddingTop: "clamp(20px, 5vh, 48px)", paddingBottom: 36, textAlign: "center" }}>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 800, letterSpacing: "-0.04em", margin: "0 0 12px" }}>NRI essentials</h1>
        <p style={{ fontSize: 17, color: MUTED, maxWidth: 560, margin: "0 auto", lineHeight: 1.6 }}>Short, practical guides for Indians living abroad: passports, OCI, bank accounts, taxes, sending money home and more.</p>
      </div>
    );
    return (
      <PublicShell onLogin={onLogin} hero={hero}>
        <section style={{ ...section, maxWidth: 720 }}>
          {slug && <p role="status" style={{ fontSize: 14, color: MUTED, marginBottom: 16 }}>That guide isn't here any more. Here are all our guides.</p>}
          <div style={{ display: "grid", gap: 12 }}>
            {ESSENTIALS.map((g) => (
              <a key={g.slug} href={`/guides/${g.slug}`} style={{ display: "block", padding: "16px 18px", borderRadius: 12, border: "1px solid #ECEBE8", textDecoration: "none", color: INK }}>
                <strong style={{ fontSize: 16 }}>{g.title}</strong>
                <span style={{ display: "block", fontSize: 14, color: MUTED, marginTop: 4 }}>{g.excerpt} · {g.readTime}</span>
              </a>
            ))}
          </div>
          {join}
        </section>
      </PublicShell>
    );
  }

  const others = ESSENTIALS.filter((g) => g.slug !== guide.slug).slice(0, 5);
  const hero = (
    <div style={{ ...section, maxWidth: 720, paddingTop: "clamp(16px, 4vh, 40px)", paddingBottom: 28 }}>
      <a href="/guides" style={{ fontSize: 13, color: MUTED }}>← NRI essentials</a>
      <h1 style={{ fontSize: "clamp(30px, 5vw, 44px)", fontWeight: 800, lineHeight: 1.12, letterSpacing: "-0.03em", margin: "14px 0 10px" }}>{guide.title}</h1>
      <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.6, margin: 0 }}>{guide.excerpt}</p>
      <p style={{ fontSize: 13, color: "#9B9A97", marginTop: 10 }}>{guide.readTime} · From the NRIClub team</p>
    </div>
  );
  return (
    <PublicShell onLogin={onLogin} hero={hero}>
      <article style={{ ...section, maxWidth: 720 }}>
        <GuideBody text={guide.content} />
        {join}
        <h2 style={{ fontSize: 16, fontWeight: 700, color: MUTED, margin: "36px 0 10px" }}>More guides</h2>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.9 }}>
          {others.map((g) => <li key={g.slug}><a href={`/guides/${g.slug}`} style={{ color: INK }}>{g.title}</a></li>)}
        </ul>
      </article>
    </PublicShell>
  );
}
