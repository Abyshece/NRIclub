import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { subscribe, getSnapshot, chooseConsent, closePrivacySettings, openPrivacySettings } from "./analytics";

// ============================================================================
// THE PRIVACY BANNER: asks once whether we may record visits for website
// analytics (src/analytics.js), on every page of the site and the member app
// (never on the admin site). A sheet along the bottom of the screen that
// leaves the page usable: nothing is blocked until the visitor chooses.
// Accept and Decline look the same and sit side by side; nothing is chosen in
// advance. "Privacy settings" (PrivacySettingsLink, in the footers and in
// Settings → Privacy & Safety) opens it again to change the choice.
// It comes first in the page, so the keyboard and screen readers reach it first.
// ============================================================================

const CSS = `
.nri-consent { position:fixed; left:0; right:0; bottom:var(--nri-consent-offset, 0px); z-index:45; padding:0 16px 16px; box-sizing:border-box; pointer-events:none;
  font-family:Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
/* (The member app sets every h2's size on phones: the banner keeps its own.) */
.nri-consent.is-reopened { z-index:1000; }
.nri-consent-box { pointer-events:auto; position:relative; max-width:640px; margin:0 auto; box-sizing:border-box; background:#fff; color:#37352F;
  border:1px solid #E3E2DF; border-radius:14px; box-shadow:0 8px 28px rgba(15,15,15,0.14); padding:16px 18px; }
.nri-consent h2 { font-size:15px !important; font-weight:700; line-height:1.35; margin:0 0 4px; padding-right:36px; outline:none; color:#37352F; letter-spacing:0; }
.nri-consent p { font-size:13.5px; line-height:1.55; color:#5F5E5B; margin:0; }
.nri-consent a { color:#37352F; font-weight:600; text-decoration:underline; }
.nri-consent-now { margin-top:8px !important; font-size:13px !important; }
.nri-consent-id { font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; overflow-wrap:anywhere; }
.nri-consent-actions { display:flex; gap:10px; margin-top:12px; }
.nri-consent-actions button { flex:1 1 0; min-width:0; min-height:44px; padding:0 12px; border-radius:10px; border:1px solid #37352F; background:#37352F; color:#fff;
  font:600 15px/1.2 Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; cursor:pointer; }
.nri-consent-actions button:hover { background:#4A4842; }
.nri-consent button:focus-visible, .nri-consent a:focus-visible { outline:3px solid #5B9CFF; outline-offset:2px; }
.nri-consent-close { position:absolute; top:8px; right:8px; width:40px; height:40px; border:0; border-radius:8px; background:none; color:#6B6A67;
  font-size:22px; line-height:1; cursor:pointer; }
.nri-consent-close:hover { background:#F1F1EF; }
@media (max-width: 600px) {
  .nri-consent { padding:0; }
  .nri-consent-box { max-width:none; border-radius:16px 16px 0 0; border-left:0; border-right:0; border-bottom:0; padding:14px 16px calc(14px + env(safe-area-inset-bottom)); }
}
@media print { .nri-consent { display:none; } }
`;

const longDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// The bar along the bottom of the member app on phones (Dashboard.jsx), if
// it shows: the banner sits above it.
function bottomBarHeight() {
  const bar = document.querySelector(".mobile-nav");
  if (!bar) return 0;
  const style = window.getComputedStyle(bar);
  return style.display === "none" || style.position !== "fixed" ? 0 : bar.offsetHeight;
}

export default function ConsentBanner() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const boxRef = useRef(null);
  const titleRef = useRef(null);
  const [offset, setOffset] = useState(0);

  // Opened from "Privacy settings": focus moves to it. (Shown by itself on a
  // first visit, it doesn't take the focus from the page.)
  useEffect(() => {
    if (s.visible && s.reopened) titleRef.current?.focus();
  }, [s.visible, s.reopened]);

  // Escape closes it when it was opened from "Privacy settings".
  useEffect(() => {
    if (!s.visible || !s.reopened || !s.choice) return undefined;
    const onKey = (e) => { if (e.key === "Escape") closePrivacySettings(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [s.visible, s.reopened, s.choice]);

  // Above the member app's bottom bar on phones.
  useEffect(() => {
    if (!s.visible) return undefined;
    const check = () => setOffset(bottomBarHeight());
    check();
    const timer = setInterval(check, 1000);
    window.addEventListener("resize", check);
    return () => { clearInterval(timer); window.removeEventListener("resize", check); };
  }, [s.visible]);

  // Room at the foot of the page, so its last lines can be scrolled above
  // the banner.
  useLayoutEffect(() => {
    if (!s.visible || !boxRef.current) return undefined;
    const body = document.body;
    const before = body.style.paddingBottom;
    const fit = () => { body.style.paddingBottom = `${Math.ceil(boxRef.current.getBoundingClientRect().height) + offset}px`; };
    fit();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    ro?.observe(boxRef.current);
    return () => { ro?.disconnect(); body.style.paddingBottom = before; };
  }, [s.visible, offset]);

  if (!s.visible) return null;
  const changing = s.reopened && s.choice;
  return (
    <section className={`nri-consent${s.reopened ? " is-reopened" : ""}`} aria-labelledby="nri-consent-title" data-track-off
      style={{ "--nri-consent-offset": `${offset}px` }}>
      <style>{CSS}</style>
      <div className="nri-consent-box" ref={boxRef}>
        <h2 id="nri-consent-title" ref={titleRef} tabIndex={-1}>Help us improve NRIClub?</h2>
        <p>
          With your OK we record which pages you visit and which buttons you click, with a shortened IP address and your approximate location.
          {" "}No ads, no other companies' trackers. <a href="/privacy#analytics">Privacy Policy</a>
        </p>
        {changing && (
          <p className="nri-consent-now">
            {s.choice === "accepted"
              ? <>You accepted on {longDate(s.at)}. Decline stops it straight away and deletes this browser's visitor ID.</>
              : <>You declined on {longDate(s.at)}. Nothing is recorded.</>}
          </p>
        )}
        {changing && s.choice === "accepted" && s.visitor && (
          <p className="nri-consent-now">
            Your visitor ID: <span className="nri-consent-id">{s.visitor}</span>. To have what we recorded deleted, send it to hello@nriclub.app before you decline.
          </p>
        )}
        <div className="nri-consent-actions">
          <button type="button" onClick={() => chooseConsent("accepted")}>Accept</button>
          <button type="button" onClick={() => chooseConsent("declined")}>Decline</button>
        </div>
        {changing && (
          <button type="button" className="nri-consent-close" onClick={closePrivacySettings} aria-label="Close without changing">×</button>
        )}
      </div>
    </section>
  );
}

// "Privacy settings": opens the banner again. Styled like the links around it.
export function PrivacySettingsLink({ style, className, children = "Privacy settings" }) {
  return (
    <button type="button" className={className} style={style} onClick={(e) => openPrivacySettings(e.currentTarget)}>
      {children}
    </button>
  );
}
