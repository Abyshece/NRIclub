import { useState } from "react";
import * as api from "../supabaseApi";
import { firstName, apiErrorMessage } from "./profile";

const font = "'DM Sans', sans-serif";

// The strip under the dashboard nav while a member's verification is open.
// pending: blue thank-you; needs_info: amber, with the admin's question and a
// button to update the details. Nothing for approved members.
export function VerificationBanner({ user, onUpdateDetails }) {
  const status = user?.verificationStatus;
  if (status === "pending") {
    return (
      <div role="status" style={{ background: "#EFF6FF", borderBottom: "1px solid #BFDBFE", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#DBEAFE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
        </div>
        <p style={{ fontSize: 13, color: "#1E40AF", margin: 0, fontFamily: font, lineHeight: 1.5 }}>
          Thanks, {firstName(user.name)}! We're reviewing your profile, usually within 24 hours.
        </p>
      </div>
    );
  }
  if (status === "needs_info") {
    return (
      <div role="status" style={{ background: "#FFF8E6", borderBottom: "1px solid #FCE7B2", padding: "12px 16px" }}>
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
// database no longer lets them post or contact anyone). Same look as the
// blocked overlay.
export function RejectedScreen({ user, onSignOut }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const deleteAccount = async () => {
    if (!window.confirm("Delete your NRIClub account? Your profile and everything you've posted will be removed. This can't be undone.")) return;
    setDeleting(true);
    setError("");
    try {
      await api.deleteAccount();
    } catch (err) {
      setError(apiErrorMessage(err, "Your account couldn't be deleted. Please try again, or contact support@nriclub.app."));
      setDeleting(false);
      return;
    }
    try { localStorage.removeItem("nriclub_profile_cache"); } catch {}
    onSignOut();
  };

  const button = { width: "100%", padding: "11px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: font, boxSizing: "border-box", display: "block", textAlign: "center", textDecoration: "none" };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="rejected-title" aria-describedby="rejected-text" style={{ background: "#fff", borderRadius: 16, maxWidth: 420, width: "100%", padding: 32, textAlign: "center", boxSizing: "border-box" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9.5 9.5l5 5" /><path d="M14.5 9.5l-5 5" /></svg>
        </div>
        <h2 id="rejected-title" style={{ fontSize: 20, fontWeight: 700, color: "#37352F", margin: "0 0 10px", fontFamily: font }}>We couldn't verify your membership</h2>
        <div id="rejected-text">
          {user.verificationMessage ? (
            <p style={{ fontSize: 14, color: "#37352F", lineHeight: 1.6, margin: "0 0 12px", fontFamily: font, padding: "12px 14px", background: "#F7F7F5", borderRadius: 8, textAlign: "left", whiteSpace: "pre-wrap" }}>
              {user.verificationMessage}
            </p>
          ) : null}
          <p style={{ fontSize: 13, color: "#6B6A67", lineHeight: 1.6, margin: "0 0 24px", fontFamily: font }}>
            If you think this is a mistake, contact our support team and we'll take another look.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <a href="mailto:support@nriclub.app?subject=My%20NRIClub%20membership" style={{ ...button, border: "none", background: "#37352F", color: "#fff" }}>Contact support</a>
          <button type="button" onClick={deleteAccount} disabled={deleting} style={{ ...button, border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C", opacity: deleting ? 0.7 : 1 }}>
            {deleting ? "Deleting..." : "Delete my account"}
          </button>
          {error && <p role="alert" style={{ fontSize: 13, color: "#B91C1C", margin: 0, lineHeight: 1.5, fontFamily: font }}>{error}</p>}
          <button type="button" onClick={onSignOut} style={{ ...button, border: "none", background: "none", color: "#5F5E5B", fontWeight: 500 }}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
