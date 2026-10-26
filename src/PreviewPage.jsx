import { useEffect, useState } from "react";
import * as api from "./supabaseApi";
import LogoMark from "./LogoMark";
import PublicShell, { INK, MUTED, section, primaryBtn } from "./PublicShell";
import { PAGE, answersText, pageTitle } from "./content/preview";
import { HOME_TITLE } from "./content/slug";

// ============================================================================
// THE PREVIEW PAGE: what people without an account see at the link to a
// Market listing (/market/<id>), an event (/events/<id>), a question
// (/help/<id>) or a trip (/travel/<id>) that a member shared. Members who
// open the same link get the item in the app. Only items whose author
// turned the preview on have one, and it holds only what the database gives
// (public.public_preview: the photo, the kind, the city, an event's day, a
// trip's month, a question's title and how many answers it has). Every
// other link, and every link before the database update, gets the same
// page: "This is on NRIClub, for members", so it never says whether the
// item exists. Join free and Log in keep the address: once logged in, an
// approved member lands on the item (Dashboard.jsx, parsePath).
// ============================================================================

// The item's photo, or the site's own placeholder: the logo on a soft glow
// of saffron and green (as behind the public pages' heroes).
function Photo({ preview }) {
  const [broken, setBroken] = useState(false);
  const tall = preview.kind === "market" || preview.kind === "event";
  if (preview.image && !broken) {
    return (
      <div style={{ aspectRatio: "16 / 10", background: "#F0EFED", overflow: "hidden" }}>
        <img src={preview.image} alt={`${PAGE.photo}: ${preview.label}`} onError={() => setBroken(true)}
          style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }
  return (
    <div aria-hidden="true" data-placeholder="" style={{ aspectRatio: tall ? "16 / 10" : "16 / 6", display: "flex", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(420px 220px at 0% 0%, rgba(255,153,51,0.16), transparent 70%), radial-gradient(380px 220px at 100% 100%, rgba(19,136,8,0.12), transparent 70%), #FAFAF8" }}>
      <LogoMark size={tall ? 64 : 48} />
    </div>
  );
}

export default function PreviewPage({ kind, id, onJoin, onLogin }) {
  const [state, setState] = useState({ loading: true, preview: null });

  useEffect(() => {
    let gone = false;
    setState({ loading: true, preview: null });
    api.getPublicPreview(kind, id)
      .then((preview) => { if (!gone) setState({ loading: false, preview }); })
      .catch(() => { if (!gone) setState({ loading: false, preview: null }); });
    return () => { gone = true; };
  }, [kind, id]);

  // Not for search engines (api/preview.js says so in the page too).
  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);
    window.scrollTo(0, 0);
    return () => robots.remove();
  }, []);

  const p = state.preview;
  useEffect(() => {
    document.title = pageTitle(p);
    return () => { document.title = HOME_TITLE; };
  }, [p]);

  const card = { borderRadius: 16, border: "1px solid #ECEBE8", background: "#fff", overflow: "hidden", boxShadow: "0 8px 24px rgba(55,53,47,0.06)" };
  const details = p && (p.kind === "question" ? [p.label, p.city] : [p.city, p.day || p.month]).filter(Boolean).join(" · ");
  const secondary = { ...primaryBtn, background: "#fff", color: INK, border: "1px solid #C9C8C5" };
  const hero = (
    <div style={{ ...section, maxWidth: 560, paddingTop: "clamp(20px, 5vh, 48px)", paddingBottom: 40 }}>
      {state.loading ? (
        <p role="status" style={{ ...card, padding: "48px 20px", textAlign: "center", color: MUTED, fontSize: 15, margin: 0 }}>{PAGE.loading}</p>
      ) : p ? (
        <article aria-labelledby="preview-title" style={card}>
          <Photo preview={p} />
          <div style={{ padding: "20px 22px 22px" }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED, margin: "0 0 8px" }}>{PAGE.eyebrow}</p>
            <h1 id="preview-title" style={{ fontSize: "clamp(24px, 4.5vw, 32px)", fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.02em", margin: 0, overflowWrap: "anywhere" }}>
              {p.kind === "question" ? p.title : p.label}
            </h1>
            {details && <p style={{ fontSize: 16, color: MUTED, margin: "8px 0 0", overflowWrap: "anywhere" }}>{details}</p>}
            {p.kind === "question" && <p style={{ fontSize: 15, fontWeight: 600, color: INK, margin: "12px 0 0" }}>{answersText(p.answers || 0)}</p>}
          </div>
        </article>
      ) : (
        <div style={{ ...card, padding: "36px 22px", textAlign: "center" }}>
          <div style={{ display: "inline-block", marginBottom: 16 }}><LogoMark size={52} /></div>
          <h1 style={{ fontSize: "clamp(24px, 4.5vw, 30px)", fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.02em", margin: "0 0 8px" }}>{PAGE.neutralTitle}</h1>
          <p style={{ fontSize: 17, color: MUTED, margin: 0 }}>{PAGE.neutralText}</p>
        </div>
      )}
      {!state.loading && (
        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={onJoin} style={{ ...primaryBtn, flex: "1 1 160px" }}>{PAGE.join}</button>
            <button type="button" onClick={onLogin} style={{ ...secondary, flex: "1 1 160px" }}>{PAGE.login}</button>
          </div>
          <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: "14px 0 0" }}>{PAGE.joinNote}</p>
        </div>
      )}
    </div>
  );
  return <PublicShell onLogin={onLogin} onJoin={onJoin} hero={hero} />;
}
