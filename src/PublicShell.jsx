import { useState } from "react";
import FlagIcon from "./FlagIcon";
import { TermsModal, PrivacyModal } from "./member/LegalModals";

// ============================================================================
// The frame of the public pages (city pages and guides): the tricolour line,
// the logo with Log in, a hero, and a footer with the Terms and Privacy.
// ============================================================================

export const INK = "#37352F";
export const MUTED = "#6B6A67";
export const SAFFRON = "#FF9933";
export const GREEN = "#138808";
export const NAVY = "#000080";

export const section = { width: "100%", maxWidth: 880, margin: "0 auto", padding: "0 24px", boxSizing: "border-box" };
export const primaryBtn = {
  background: INK, color: "#fff", padding: "14px 28px", borderRadius: 10, fontSize: 16, fontWeight: 600,
  border: "none", cursor: "pointer", fontFamily: "inherit",
};

export const AMBASSADOR_MAIL = "mailto:support@nriclub.app?subject=" + encodeURIComponent("I'd like to be a city ambassador");

export default function PublicShell({ onLogin, hero, children }) {
  const [legal, setLegal] = useState(null); // "terms" | "privacy"
  const footerLink = { background: "none", border: "none", padding: 4, cursor: "pointer", color: MUTED, fontSize: 13, fontFamily: "inherit", textDecoration: "underline" };
  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: INK, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", overflowX: "hidden" }}>
      <div aria-hidden="true" style={{ height: 4, background: `linear-gradient(90deg, ${SAFFRON} 0 33.3%, #fff 33.3% 66.6%, ${GREEN} 66.6%)`, borderBottom: "1px solid #F0EFED" }} />
      <header style={{ background: "radial-gradient(700px 360px at 0% 0%, rgba(255,153,51,0.10), transparent 70%), radial-gradient(600px 360px at 100% 10%, rgba(19,136,8,0.07), transparent 70%)" }}>
        <nav style={{ ...section, maxWidth: 1100, display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 22, paddingBottom: 22 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: INK }}>
            <FlagIcon size={30} />
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>NRI<span style={{ fontStyle: "italic", fontFamily: '"Times New Roman",serif' }}>Club</span></span>
          </a>
          <button onClick={onLogin} style={{ fontSize: 14, fontWeight: 600, padding: "9px 18px", border: "1px solid #E0E0DE", borderRadius: 8, background: "#fff", cursor: "pointer", color: INK, fontFamily: "inherit" }}>Log in</button>
        </nav>
        {hero}
      </header>
      <main>{children}</main>
      <footer style={{ ...section, maxWidth: 1100, borderTop: "1px solid #F0EFED", marginTop: 32, paddingTop: 22, paddingBottom: 30, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, fontSize: 13, color: MUTED }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <a href="/" style={{ color: MUTED }}>NRIClub home</a>
          <a href="/guides" style={{ color: MUTED }}>NRI guides</a>
        </div>
        <div>
          <button type="button" onClick={() => setLegal("terms")} style={footerLink}>Terms of Use</button>
          <span aria-hidden="true"> · </span>
          <button type="button" onClick={() => setLegal("privacy")} style={footerLink}>Privacy Policy</button>
        </div>
      </footer>
      {legal === "terms" && <TermsModal onClose={() => setLegal(null)} />}
      {legal === "privacy" && <PrivacyModal onClose={() => setLegal(null)} />}
    </div>
  );
}
