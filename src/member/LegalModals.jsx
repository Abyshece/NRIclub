import { useEffect, useRef, useState } from "react";
import { FONT, linkButtonStyle } from "./ui";
import { IMPRINT, hasImprint, imprintSections } from "../content/imprint";

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

// A simple centred dialog in the style of the app's other modals. Escape
// closes it, Tab stays inside it, and focus goes back to where it was.
export function LegalModal({ title, onClose, children }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      const outside = !dialogRef.current.contains(document.activeElement);
      if (outside || (e.shiftKey ? i <= 0 : i === items.length - 1)) {
        e.preventDefault();
        items[e.shiftKey ? items.length - 1 : 0].focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previous && previous.focus) previous.focus();
    };
  }, []);
  const titleId = `legal-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <h3 id={titleId} style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: FONT, margin: 0 }}>{title}</h3>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6A67", padding: 6, borderRadius: 6, display: "flex" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: 24, fontSize: 13, color: "#5F5E5B", lineHeight: 1.7, fontFamily: FONT }}>{children}</div>
        <div style={{ padding: "12px 24px 20px", display: "flex", justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#37352F", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>Close</button>
        </div>
      </div>
    </div>
  );
}

const h4 = { fontSize: 15, fontWeight: 700, color: "#37352F", margin: "0 0 6px" };
const para = { margin: "0 0 16px" };

// DRAFT: plain-language Terms of Use written for the product. It has NOT been
// reviewed by a lawyer and must get legal review before launch (together with
// TERMS_VERSION below, which signup stores with each member).
// TERMS_VERSION must always equal private.current_terms_version() in the
// database (migration 20261013000000_review_fixes.sql): change both together,
// the database one in a new migration. Members whose accepted version is a
// different one see the Terms screen again and can't take part until they
// accept the current one (accept_terms only records the database's version).
export const TERMS_VERSION = "2026-10";

// The Privacy Policy can be opened from inside the Terms, so it can be read
// wherever the Terms are shown (also Settings > Terms & Policies).
export function TermsContent() {
  const [showPrivacy, setShowPrivacy] = useState(false);
  return (
    <>
      <h4 style={h4}>1. Who NRIClub is for</h4>
      <p style={para}>NRIClub is a community for people with a real connection to the Indian community, whether you live abroad or in India and want to connect with those who do.</p>
      <h4 style={h4}>2. You must be 18 or older</h4>
      <p style={para}>You can only create an account if you are at least 18 years old.</p>
      <h4 style={h4}>3. Be yourself</h4>
      <p style={para}>Use your real name and your own details. Our admins verify new members using a LinkedIn profile or, if you don't have one, a short explanation of how you're connected to the community. Until then you can use NRIClub, but your profile won't show the Verified badge. We may decline or remove accounts we can't verify.</p>
      <h4 style={h4}>4. Be respectful</h4>
      <p style={para}>Treat other members with respect. No harassment, hate speech, discrimination or threats. Don't share other people's private information.</p>
      <h4 style={h4}>5. No spam or scams</h4>
      <p style={para}>No spam, misleading offers, fake listings, pyramid schemes or attempts to get money or personal data from members under false pretences.</p>
      <h4 style={h4}>6. Marketplace</h4>
      <p style={para}>Marketplace listings and any deals are between the members involved. NRIClub isn't a party to them and can't guarantee items, payments or housing. Meet safely and never pay in advance to someone you don't know.</p>
      <h4 style={h4}>7. Your content</h4>
      <p style={para}>You're responsible for what you post. You keep ownership of it and allow us to show it to other members as part of the service.</p>
      <h4 style={h4}>8. Moderation</h4>
      <p style={para}>Admins may remove content or restrict, block or delete accounts that break these rules or put other members at risk.</p>
      <h4 style={h4}>9. Leaving</h4>
      <p style={para}>You can delete your account at any time from your account settings.</p>
      <h4 style={h4}>10. Privacy</h4>
      <p style={para}>
        Our Privacy Policy explains what data we collect, how we use it and your rights.{" "}
        <button type="button" onClick={() => setShowPrivacy((v) => !v)} aria-expanded={showPrivacy} aria-controls="terms-privacy-policy" style={{ ...linkButtonStyle, color: "#37352F" }}>
          {showPrivacy ? "Hide the Privacy Policy" : "Read the Privacy Policy"}
        </button>
      </p>
      {showPrivacy && (
        <div id="terms-privacy-policy" style={{ background: "#F7F7F5", borderRadius: 8, padding: "16px 18px", margin: "0 0 16px" }}>
          <PrivacyContent />
        </div>
      )}
      <h4 style={h4}>11. Contact</h4>
      <p style={{ margin: 0 }}>Questions? Write to <a href="mailto:support@nriclub.app" style={{ color: "#37352F", fontWeight: 600 }}>support@nriclub.app</a>.</p>
    </>
  );
}

export function PrivacyContent() {
  return (
    <>
      <h4 style={h4}>1. Data We Collect</h4>
      <p style={para}>We collect the personal information you provide when you sign up and verify your profile: your name, email, city and country, and either your LinkedIn profile link or a short note on how you're connected to the community (and, if you give one, the member who can vouch for you). Optional profile details such as hometown, profession and status are added by you later. We also collect usage data such as posts, comments, and interactions within the platform.</p>
      <h4 style={h4}>2. How We Use Your Data</h4>
      <p style={para}>Your data is used to: provide and personalize the NRIClub service, verify that members are real people, connect you with relevant community members, send essential service notifications, and (with your consent) send marketing communications.</p>
      <h4 style={h4}>3. Legal Basis (GDPR Art. 6)</h4>
      <p style={para}>We process your data based on: your explicit consent (Art. 6(1)(a)), performance of our service contract (Art. 6(1)(b)), and our legitimate interest in operating the platform (Art. 6(1)(f)).</p>
      <h4 style={h4}>4. Your Rights</h4>
      <p style={para}>Under GDPR, you have the right to: access your personal data, rectify inaccurate data, request erasure ("right to be forgotten"), restrict processing, data portability (export your data), object to processing, and withdraw consent at any time. You can exercise these rights from your Account Settings, where “Download my data” gives you a copy of what your account holds. Notes our team wrote about you (for example while checking your membership) and the moderation record described below aren't in that file; you can ask for them at privacy@nriclub.app.</p>
      <h4 style={h4}>5. Data Retention</h4>
      <p style={para}>We retain your data for as long as your account is active. Upon account deletion, all personal data is permanently erased within 30 days.</p>
      {/* LEGAL REVIEW NEEDED: the moderation record (private.moderation_record,
          migration 20261013000000_review_fixes.sql) is kept after the account
          is deleted. Confirm the legal basis (legitimate interest, Art.
          6(1)(f)), set a retention period, and decide whether the admin's
          note may be kept in it. Also confirm that a keyed hash of the
          email address is enough, and whether admins' notes about a member
          must be in "Download my data" instead of on request (section 4). */}
      <p style={para}>One exception: if our team rejected or blocked an account, we keep a minimal record so the same person can't simply sign up again. It holds a coded form of the email address if the account confirmed it (and of any address the account changes to afterwards), the LinkedIn profile link the account had when our team last reviewed its details (or, if we never had, when we blocked it), and our decision with its date and any note we made on it. The email address itself isn't kept: the coded form is made with a secret key, so we can only check whether an address we already know matches it. The record is linked to the account until the account is deleted, and then that link is removed. We use the record only when someone signs up, sends their verification details or is moved back into review by our team: if their email address or LinkedIn link matches it, our team checks their membership before they can take part.</p>
      <h4 style={h4}>6. Data Sharing</h4>
      <p style={para}>We do not sell your personal data. Data is only shared with essential service providers (email delivery, hosting) under data processing agreements compliant with GDPR.</p>
      <h4 style={h4}>7. Contact</h4>
      {hasImprint() && <p style={para}>The controller responsible for your data is {[IMPRINT.name, ...IMPRINT.address].map((l) => l.trim()).filter(Boolean).join(", ")}.</p>}
      <p style={{ margin: 0 }}>For any data protection inquiries, contact our Data Protection Officer at privacy@nriclub.app.</p>
      <p style={{ marginTop: 20, marginBottom: 0, fontSize: 11, color: "#6B6A67", fontStyle: "italic" }}>Last updated: October 2026</p>
    </>
  );
}

// The Impressum (legal notice), from src/content/imprint.js. Only shown
// where hasImprint() is true.
export function ImpressumContent({ headingStyle = h4 }) {
  return imprintSections().map((section) => (
    <div key={section.title} style={{ marginBottom: 16 }}>
      <h4 style={headingStyle}>{section.title}</h4>
      <p style={{ margin: 0 }}>
        {section.lines.map((line, i) => (
          <span key={i}>{i > 0 && <br />}{line.href ? <a href={line.href} style={{ color: "#37352F", fontWeight: 600 }}>{line.text}</a> : line.text}</span>
        ))}
      </p>
    </div>
  ));
}

export const TermsModal = ({ onClose }) => (
  <LegalModal title="Terms of Use" onClose={onClose}><TermsContent /></LegalModal>
);

export const PrivacyModal = ({ onClose }) => (
  <LegalModal title="Privacy Policy" onClose={onClose}><PrivacyContent /></LegalModal>
);
