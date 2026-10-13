import { useEffect } from "react";
import PublicShell, { MUTED, section } from "./PublicShell";
import { ImpressumContent } from "./member/LegalModals";
import { HOME_TITLE } from "./content/slug";

// ============================================================================
// IMPRESSUM (nriclub.app/impressum): the legal notice, readable without an
// account. Its details are in src/content/imprint.js; App.jsx opens this page
// only when they're filled in.
// ============================================================================

export default function ImpressumPage({ onJoin, onLogin }) {
  useEffect(() => {
    document.title = "Impressum · NRIClub";
    window.scrollTo(0, 0);
    return () => { document.title = HOME_TITLE; };
  }, []);

  const hero = (
    <div style={{ ...section, maxWidth: 720, paddingTop: "clamp(20px, 5vh, 48px)", paddingBottom: 24 }}>
      <h1 style={{ fontSize: "clamp(32px, 5vw, 44px)", fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 8px" }}>Impressum</h1>
      <p style={{ fontSize: 17, color: MUTED, margin: 0 }}>Legal notice</p>
    </div>
  );
  return (
    <PublicShell onLogin={onLogin} onJoin={onJoin} hero={hero}>
      <section style={{ ...section, maxWidth: 720, fontSize: 16, lineHeight: 1.7 }}>
        <ImpressumContent headingStyle={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px" }} />
      </section>
    </PublicShell>
  );
}
