import { useEffect } from "react";
import PublicShell, { INK, MUTED, section, primaryBtn } from "./PublicShell";
import { HOME_TITLE } from "./content/slug";

// ============================================================================
// PAGE NOT FOUND: an address that isn't one of the site's pages (App.jsx,
// isAppPath). On the live site Vercel answers such addresses with 404.html
// and the status 404 (vercel.json, vite.config.js); this is what that page
// shows once the app has started. Kept out of search results.
// ============================================================================

const link = { display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 16px", borderRadius: 999, border: "1px solid #C9C8C5", color: INK, textDecoration: "none", fontSize: 15, fontWeight: 500 };

export default function NotFoundPage({ onJoin, onLogin, signedIn }) {
  useEffect(() => {
    document.title = "Page not found · NRIClub";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    window.scrollTo(0, 0);
    return () => { document.title = HOME_TITLE; meta.remove(); };
  }, []);

  const hero = (
    <div style={{ ...section, maxWidth: 640, paddingTop: "clamp(28px, 8vh, 72px)", paddingBottom: 8, textAlign: "center" }}>
      <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED, margin: "0 0 10px" }}>Error 404</p>
      <h1 style={{ fontSize: "clamp(32px, 5.5vw, 46px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 14px" }}>Page not found</h1>
      <p style={{ fontSize: 17, lineHeight: 1.6, color: MUTED, margin: "0 auto", maxWidth: 480 }}>
        This page doesn't exist, or it has moved. Check the address, or try one of these.
      </p>
    </div>
  );

  return (
    <PublicShell onLogin={onLogin} onJoin={signedIn ? null : onJoin} loginLabel={signedIn ? "Open NRIClub" : "Log in"} hero={hero}>
      <section aria-label="Where to go" style={{ ...section, maxWidth: 640, textAlign: "center", paddingTop: 20 }}>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          <li><a href="/" style={link}>NRIClub home</a></li>
          <li><a href="/whats-on" style={link}>What's on in Germany</a></li>
          <li><a href="/guides" style={link}>NRI guides</a></li>
        </ul>
        {!signedIn && (
          <>
            <p style={{ fontSize: 15, color: MUTED, margin: "0 0 14px" }}>New here? NRIClub is a free community for Indians abroad.</p>
            <button type="button" onClick={onJoin} style={primaryBtn}>Join NRIClub free</button>
          </>
        )}
      </section>
    </PublicShell>
  );
}
