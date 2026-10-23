import { Fragment, useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { FONT } from "./ui";
import { imprintSections } from "../content/imprint";
import { termsDoc, termsDocToAccept } from "../content/legal/terms";
import { privacyDoc } from "../content/legal/privacy";

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

// For a dialog: Escape closes it, Tab stays inside it, the element in
// closeRef gets focus when it opens, and focus goes back to where it was
// when it closes.
export function useDialogFocus(onClose) {
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
  return { closeRef, dialogRef };
}

// A simple centred dialog in the style of the app's other modals. Escape
// closes it, Tab stays inside it, and focus goes back to where it was.
export function LegalModal({ title, onClose, children }) {
  const { closeRef, dialogRef } = useDialogFocus(onClose);
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

// The version of the Terms of Use this site shows (the text is in
// src/content/legal/terms.js, whose TERMS_VERSION must be the same: the build
// checks). The database's private.current_terms_version() says which version
// members must have accepted; the site asks public.current_terms_version()
// rather than comparing with this constant, so deploying a new text before
// the database knows it never locks members out. Change both together, the
// database one in a new migration.
export const TERMS_VERSION = "2026-10-23";

export { TERMS_CHANGES, TERMS_NEEDED_FOR, PREVIOUS_TERMS_VERSION, TERMS_DATE } from "../content/legal/terms";
export { ART9_CONSENT_TEXT, ART9_CONSENT_VERSION, ART9_WITHDRAW_TEXT } from "../content/legal/consent";
export { REPORT_HREF, REPORT_LINK_LABEL, REPORT_LINK_TEXT } from "../content/legal/reporting";

const INK = "#37352F";

// Rich text from the legal texts (src/content/legal/doc.js): strings, links
// and bold parts. Links to other sites, and in a dialog also links to our own
// pages, open in a new tab, so a half-filled form stays as it is.
function Rich({ value, inDialog }) {
  const parts = Array.isArray(value) ? value : [value];
  return parts.map((part, i) => {
    if (part == null || part === false) return null;
    if (typeof part === "string") return <Fragment key={i}>{part}</Fragment>;
    if (part.href) {
      const newTab = /^https?:/.test(part.href) || (inDialog && part.href.startsWith("/"));
      return (
        <a key={i} href={part.href} {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          style={{ color: INK, fontWeight: 600, textDecoration: "underline", overflowWrap: "anywhere" }}>{part.text}</a>
      );
    }
    if (part.strong) return <strong key={i} style={{ color: INK }}>{part.strong}</strong>;
    return null;
  });
}

// Sizes for the two places the texts appear: a dialog (small print, the
// dialog's own title above) and the page (nriclub.app/terms, /privacy).
const SIZES = {
  dialog: { section: { ...h4, margin: "20px 0 6px" }, sub: { fontSize: 13, fontWeight: 700, color: INK, margin: "14px 0 4px" }, gap: 12 },
  page: { section: { fontSize: 22, fontWeight: 700, color: INK, letterSpacing: "-0.01em", margin: "36px 0 10px", lineHeight: 1.3 }, sub: { fontSize: 16, fontWeight: 700, color: INK, margin: "20px 0 6px" }, gap: 14 },
};

function Block({ block, inDialog }) {
  const z = inDialog ? SIZES.dialog : SIZES.page;
  const Sub = inDialog ? "h5" : "h3";
  const para = { margin: `0 0 ${z.gap}px` };
  if (block.p) return <p style={para}><Rich value={block.p} inDialog={inDialog} /></p>;
  if (block.ul || block.ol) {
    const List = block.ol ? "ol" : "ul";
    return (
      <List style={{ margin: `0 0 ${z.gap}px`, paddingLeft: 22 }}>
        {(block.ul || block.ol).map((item, i) => <li key={i} style={{ marginBottom: 6 }}><Rich value={item} inDialog={inDialog} /></li>)}
      </List>
    );
  }
  if (block.h) return <Sub style={z.sub}>{block.h}</Sub>;
  if (block.entries) {
    return block.entries.map((entry, i) => (
      <div key={i} id={!inDialog && entry.id ? entry.id : undefined} style={{ margin: `0 0 ${z.gap}px`, paddingLeft: 12, borderLeft: "3px solid #ECEBE8", scrollMarginTop: 80 }}>
        <Sub style={{ ...z.sub, marginTop: 0, overflowWrap: "anywhere" }}>{entry.title}</Sub>
        {entry.fields.map(([label, value]) => (
          <p key={label} style={{ margin: "0 0 4px" }}><strong style={{ color: INK }}>{label}:</strong> <Rich value={value} inDialog={inDialog} /></p>
        ))}
      </div>
    ));
  }
  if (block.box) {
    return (
      <div style={{ border: "1px solid #D9D7D2", borderRadius: 10, padding: inDialog ? "10px 14px 2px" : "14px 18px 4px", margin: `0 0 ${z.gap + 4}px`, background: "#FAFAF8" }}>
        {block.box.title && <Sub style={{ ...z.sub, marginTop: 0 }}>{block.box.title}</Sub>}
        {block.box.blocks.map((b, i) => <Block key={i} block={b} inDialog={inDialog} />)}
      </div>
    );
  }
  return null;
}

// A legal text (src/content/legal/doc.js). In a dialog: version line, then
// the sections. On the page (LegalPage.jsx shows the title and version line
// above it): a list of contents, then the sections with their anchors.
export function LegalDoc({ doc, inDialog = false }) {
  const z = inDialog ? SIZES.dialog : SIZES.page;
  const Section = inDialog ? "h4" : "h2";
  return (
    <>
      {inDialog && doc.subtitle && <p style={{ margin: "0 0 14px", fontSize: 12, color: "#6B6A67" }}><Rich value={doc.subtitle} inDialog /></p>}
      {(doc.intro || []).map((b, i) => <Block key={i} block={b} inDialog={inDialog} />)}
      {!inDialog && doc.sections.length > 3 && (
        <nav aria-label="Contents" style={{ margin: "8px 0 0" }}>
          <p style={{ margin: "0 0 6px", fontWeight: 700, color: INK }}>Contents</p>
          <ul style={{ margin: 0, paddingLeft: 22, columns: "16em 2", columnGap: 32 }}>
            {doc.sections.map((s) => <li key={s.id} style={{ marginBottom: 4, breakInside: "avoid" }}><a href={`#${s.id}`} style={{ color: INK }}>{s.title}</a></li>)}
          </ul>
        </nav>
      )}
      {doc.sections.map((s) => (
        <section key={s.id} id={inDialog ? undefined : s.id} aria-labelledby={inDialog ? undefined : `${s.id}-title`} style={{ scrollMarginTop: 80 }}>
          <Section id={inDialog ? undefined : `${s.id}-title`} style={z.section}>{s.title}</Section>
          {s.blocks.map((b, i) => <Block key={i} block={b} inDialog={inDialog} />)}
        </section>
      ))}
    </>
  );
}

// The Terms of Use and the Privacy Policy as shown in dialogs and in
// Settings > Terms & Policies. The same texts are pages at nriclub.app/terms
// and nriclub.app/privacy, which the dialogs link to.
export function TermsContent() {
  return <LegalDoc doc={termsDoc()} inDialog />;
}

export function PrivacyContent() {
  return <LegalDoc doc={privacyDoc()} inDialog />;
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

export const ImpressumModal = ({ onClose }) => (
  <LegalModal title="Impressum" onClose={onClose}><ImpressumContent /></LegalModal>
);

// The Terms in a dialog, where members accept them (signup, Get verified,
// the Terms screen): the version the database will record
// (api.getCurrentTermsVersion). Until the database knows a new version (the
// travel board's database update makes 2026-10-23 current), that is still
// the earlier one, so someone who signs up in between reads the version they
// accept. If the version can't be fetched, the current text.
export function TermsModal({ onClose }) {
  const [version, setVersion] = useState(null);
  useEffect(() => {
    let live = true;
    api.getCurrentTermsVersion()
      .then((v) => { if (live) setVersion(v || TERMS_VERSION); })
      .catch(() => { if (live) setVersion(TERMS_VERSION); });
    return () => { live = false; };
  }, []);
  return (
    <LegalModal title="Terms of Use" onClose={onClose}>
      {version ? <LegalDoc doc={termsDocToAccept(version)} inDialog /> : <p style={{ margin: 0 }}>Loading…</p>}
    </LegalModal>
  );
}

export const PrivacyModal = ({ onClose }) => (
  <LegalModal title="Privacy Policy" onClose={onClose}><PrivacyContent /></LegalModal>
);
