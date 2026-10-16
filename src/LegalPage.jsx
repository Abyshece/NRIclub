import { useEffect } from "react";
import PublicShell, { MUTED, section, useCanonical } from "./PublicShell";
import { LegalDoc } from "./member/LegalModals";
import { termsDoc, termsPath } from "./content/legal/terms";
import { privacyDoc } from "./content/legal/privacy";
import { HOME_TITLE } from "./content/slug";

// ============================================================================
// THE TERMS OF USE AND THE PRIVACY POLICY as pages: nriclub.app/terms (and
// earlier versions at /terms/<version>) and nriclub.app/privacy. Readable by
// anyone, signed in or not, so they can be linked, saved and printed. The
// text is in src/content/legal/; the build also writes it into the static
// pages (vite.config.js).
// ============================================================================

export default function LegalPage({ kind, version, onJoin, onLogin, signedIn }) {
  const doc = kind === "privacy" ? privacyDoc() : termsDoc(version);
  const path = kind === "privacy" ? "/privacy" : termsPath(version);
  useCanonical(path);

  useEffect(() => {
    document.title = `${doc.title} · NRIClub`;
    // An address with a section (/privacy#storage) opens at that section.
    const target = window.location.hash && document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
    return () => { document.title = HOME_TITLE; };
  }, [path]);

  const hero = (
    <div style={{ ...section, maxWidth: 760, paddingTop: "clamp(20px, 5vh, 48px)", paddingBottom: 8 }}>
      <h1 style={{ fontSize: "clamp(32px, 5vw, 44px)", fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 8px" }}>{doc.title}</h1>
      {doc.subtitle && <p style={{ fontSize: 15, color: MUTED, margin: 0 }}>{doc.subtitle}</p>}
    </div>
  );
  return (
    <PublicShell onLogin={onLogin} onJoin={signedIn ? null : onJoin} loginLabel={signedIn ? "Open NRIClub" : "Log in"} hero={hero}>
      <article style={{ ...section, maxWidth: 760, fontSize: 16, lineHeight: 1.7, color: "#45443F", overflowWrap: "break-word" }}>
        <LegalDoc doc={doc} />
      </article>
    </PublicShell>
  );
}
