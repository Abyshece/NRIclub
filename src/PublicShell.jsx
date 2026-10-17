import { Fragment, useEffect } from "react";
import LogoMark from "./LogoMark";
import { hasImprint } from "./content/imprint";
import { REPORT_HREF, REPORT_LINK_TEXT } from "./content/legal/reporting";

// ============================================================================
// The frame of the public pages (city pages, guides and the legal pages): a
// thin saffron line, a header that stays in view with Log in and Join free, a
// hero, and a footer with the Terms, the Privacy Policy, the Impressum and
// how to report illegal content.
// ============================================================================

export const INK = "#37352F";
export const MUTED = "#6B6A67";
// Saffron and green are brand colours, each used on its own. Never put them
// together with white as bands or stripes, and never use a wheel: that reads
// as the Indian flag, which may not be used as a mark (see src/content/logo.js).
export const SAFFRON = "#FF9933";
export const GREEN = "#138808";
export const NAVY = "#000080";
// Saffron and green dark enough to read as text (4.5:1 or more on white and
// on #FAFAF8); the bright ones are for lines, dots and fills.
export const SAFFRON_TEXT = "#B35400";
export const GREEN_TEXT = "#117A07";

export const section = { width: "100%", maxWidth: 880, margin: "0 auto", padding: "0 24px", boxSizing: "border-box" };
export const primaryBtn = {
  background: INK, color: "#fff", padding: "14px 28px", borderRadius: 10, fontSize: 16, fontWeight: 600,
  border: "none", cursor: "pointer", fontFamily: "inherit",
};

export const SUPPORT_EMAIL = "hello@nriclub.app";
export const AMBASSADOR_MAIL = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("I'd like to be a city ambassador")}`
  + `&body=${encodeURIComponent("My city: \nMy LinkedIn (or a few words about me): \nHow I'd help: \n")}`;
// "Free · Our team checks… · Your phone…", wrapping only between the parts.
// (The spaces sit between the spans, where a line may break.)
export const Phrases = ({ text }) => text.split(" · ").map((part, i, all) => (
  <Fragment key={part}>{i > 0 && " "}<span style={{ whiteSpace: "nowrap" }}>{part}{i < all.length - 1 && " ·"}</span></Fragment>
));
export const whatsappShare = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;

// The page's own address for search engines: set while the page shows, then
// put back. Public pages that aren't written at build time (newer city
// groups, other spellings, the landing page at the app's other addresses)
// come from a plain page without one.
export function useCanonical(path) {
  useEffect(() => {
    let link = document.querySelector('link[rel="canonical"]');
    const before = link?.getAttribute("href");
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.setAttribute("href", `https://nriclub.app${path}`);
    return () => { if (before) link.setAttribute("href", before); else link.remove(); };
  }, [path]);
}

// The bar along the top of the public pages; it stays in view while the page
// scrolls (the page around it must not have overflow hidden, or it won't).
export function PublicNav({ onLogin, onJoin, maxWidth = 1100, loginLabel = "Log in" }) {
  const btn = { fontSize: 14, fontWeight: 600, minHeight: 44, padding: "0 16px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 20, background: "#fff", borderBottom: "1px solid #F0EFED" }}>
      <style>{`html { scroll-padding-top: 72px; } @media (max-width: 359px) { .pub-logo-text { display: none; } }`}</style>
      <nav aria-label="NRIClub" style={{ ...section, maxWidth, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, paddingTop: 10, paddingBottom: 10 }}>
        <a href="/" aria-label="NRIClub home" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: INK, minHeight: 44 }}>
          <LogoMark size={28} />
          <span className="pub-logo-text" style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>NRI<span style={{ fontStyle: "italic", fontFamily: '"Times New Roman",serif' }}>Club</span></span>
        </a>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onLogin} style={{ ...btn, border: "1px solid #C9C8C5", background: "#fff", color: INK }}>{loginLabel}</button>
          {onJoin && <button type="button" onClick={onJoin} style={{ ...btn, border: "1px solid " + INK, background: INK, color: "#fff" }}>Join free</button>}
        </div>
      </nav>
    </header>
  );
}

export default function PublicShell({ onLogin, onJoin, loginLabel, hero, children }) {
  const footerLink = { background: "none", border: "none", padding: "10px 8px", cursor: "pointer", color: MUTED, fontSize: 13, fontFamily: "inherit", textDecoration: "underline", display: "inline-block" };
  return (
    <div className="pub-root" style={{ minHeight: "100vh", background: "#fff", color: INK, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <style>{`.pub-root { overflow-x: hidden; overflow-x: clip; }`}</style>
      <div aria-hidden="true" style={{ height: 4, background: SAFFRON }} />
      <PublicNav onLogin={onLogin} onJoin={onJoin} loginLabel={loginLabel} />
      <main>
        <div style={{ background: "radial-gradient(700px 360px at 0% 0%, rgba(255,153,51,0.10), transparent 70%)" }}>
          {hero}
        </div>
        {children}
      </main>
      <footer style={{ ...section, maxWidth: 1100, borderTop: "1px solid #F0EFED", marginTop: 32, paddingTop: 14, paddingBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 13, color: MUTED }}>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          <a href="/" style={footerLink}>NRIClub home</a>
          <a href="/guides" style={footerLink}>NRI guides</a>
          <a href={`mailto:${SUPPORT_EMAIL}`} style={footerLink}>Contact: {SUPPORT_EMAIL}</a>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          <a href="/terms" style={footerLink}>Terms of Use</a>
          <a href="/privacy" style={footerLink}>Privacy Policy</a>
          {hasImprint() && <a href="/impressum" style={footerLink}>Impressum</a>}
          <a href={REPORT_HREF} style={footerLink}>{REPORT_LINK_TEXT}</a>
        </div>
      </footer>
    </div>
  );
}
