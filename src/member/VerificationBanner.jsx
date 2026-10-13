import { useEffect, useRef } from "react";
import { useAccountActions } from "./AccountActions";
import { firstName } from "./profile";

const font = "'DM Sans', sans-serif";

// The banner's id: Get verified moves focus here after "Update details" is
// sent, because the button that opened it is gone by then.
export const VERIFICATION_BANNER_ID = "verification-banner";

// The strip under the dashboard nav while a member's verification is open.
// pending: blue thank-you; needs_info: amber, with the admin's question and a
// button to update the details. Nothing for approved members.
export function VerificationBanner({ user, onUpdateDetails }) {
  const status = user?.verificationStatus;
  if (status === "pending") {
    return (
      <div id={VERIFICATION_BANNER_ID} tabIndex={-1} role="status" style={{ background: "#EFF6FF", borderBottom: "1px solid #BFDBFE", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, outline: "none" }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#DBEAFE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
        </div>
        <p style={{ fontSize: 13, color: "#1E40AF", margin: 0, fontFamily: font, lineHeight: 1.5 }}>
          {/* A member flagged for review can't use NRIClub until approved. */}
          {user.reviewFlag
            ? <>Thanks, {firstName(user.name)}! We're reviewing your profile. You can use NRIClub once it's approved.</>
            : <>Thanks, {firstName(user.name)}! We're reviewing your profile, usually within 24 hours.</>}
        </p>
      </div>
    );
  }
  if (status === "needs_info") {
    return (
      <div id={VERIFICATION_BANNER_ID} tabIndex={-1} role="status" style={{ background: "#FFF8E6", borderBottom: "1px solid #FCE7B2", padding: "12px 16px", outline: "none" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#FDECC8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
          </div>
          <p style={{ fontSize: 13, color: "#7A4D00", margin: 0, fontFamily: font, lineHeight: 1.5, flex: "1 1 240px", maxWidth: 720 }}>
            We need a little more information: {user.verificationMessage || "please check your details."}
          </p>
          <button type="button" onClick={onUpdateDetails} style={{ padding: "7px 14px", borderRadius: 6, border: "none", background: "#37352F", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: font }}>
            Update details
          </button>
        </div>
      </div>
    );
  }
  return null;
}

// Full-screen card for members whose verification was rejected (the
// database no longer lets them post, contact anyone or see other members).
// Same look as the blocked overlay. Settings can't be reached from here, so
// the account actions are on the card.
export function RejectedScreen({ user, onSignOut }) {
  const { busy, error, download, deleteAccount } = useAccountActions(onSignOut);
  const overlayRef = useRef(null);
  const titleRef = useRef(null);
  // The app focuses the card's first button when it opens, which scrolls a
  // long message's card past its title. Start at the top, on the title.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (overlayRef.current) overlayRef.current.scrollTop = 0;
      titleRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const button = { width: "100%", padding: "11px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: font, boxSizing: "border-box", display: "block", textAlign: "center", textDecoration: "none" };
  return (
    // Top-aligned with an auto margin on the card: centred when it fits, and
    // a long message on a small screen scrolls from the top, title included.
    <div ref={overlayRef} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="rejected-title" aria-describedby="rejected-text" style={{ background: "#fff", borderRadius: 16, maxWidth: 420, width: "100%", padding: 32, textAlign: "center", boxSizing: "border-box", margin: "auto" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9.5 9.5l5 5" /><path d="M14.5 9.5l-5 5" /></svg>
        </div>
        <h2 id="rejected-title" ref={titleRef} tabIndex={-1} style={{ fontSize: 20, fontWeight: 700, color: "#37352F", margin: "0 0 10px", fontFamily: font, outline: "none" }}>We couldn't verify your membership</h2>
        <div id="rejected-text">
          {user.verificationMessage ? (
            <p style={{ fontSize: 14, color: "#37352F", lineHeight: 1.6, margin: "0 0 12px", fontFamily: font, padding: "12px 14px", background: "#F7F7F5", borderRadius: 8, textAlign: "left", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {user.verificationMessage}
            </p>
          ) : null}
          <p style={{ fontSize: 13, color: "#6B6A67", lineHeight: 1.6, margin: "0 0 24px", fontFamily: font }}>
            If you think this is a mistake, contact our support team and we'll take another look.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <a href="mailto:support@nriclub.app?subject=My%20NRIClub%20membership" style={{ ...button, border: "none", background: "#37352F", color: "#fff" }}>Contact support</a>
          <button type="button" onClick={download} aria-disabled={!!busy} style={{ ...button, border: "1px solid #E0E0DE", background: "#fff", color: "#37352F", opacity: busy === "download" ? 0.7 : 1 }}>
            {busy === "download" ? "Preparing your data..." : "Download my data"}
          </button>
          <button type="button" onClick={deleteAccount} aria-disabled={!!busy} style={{ ...button, border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C", opacity: busy === "delete" ? 0.7 : 1 }}>
            {busy === "delete" ? "Deleting..." : "Delete my account"}
          </button>
          {error && <p role="alert" style={{ fontSize: 13, color: "#B91C1C", margin: 0, lineHeight: 1.5, fontFamily: font }}>{error}</p>}
          <button type="button" onClick={onSignOut} style={{ ...button, border: "none", background: "none", color: "#5F5E5B", fontWeight: 500 }}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
