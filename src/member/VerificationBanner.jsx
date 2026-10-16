import { useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { useAccountActions } from "./AccountActions";
import { firstName } from "./profile";
import { ESSENTIALS } from "../content/essentials";
import { guideBlocks } from "../content/guideBlocks";

const font = "'DM Sans', sans-serif";

// The banner's id: Get verified moves focus here after "Update details" is
// sent, because the button that opened it is gone by then.
export const VERIFICATION_BANNER_ID = "verification-banner";

// The strip under the dashboard nav while a member's verification is open.
// pending: blue thank-you; needs_info: amber, with the admin's question and a
// button to update the details. Nothing for approved members. Members
// waiting for review can't take part yet (the dashboard shows them
// WaitingForReview below instead of the feed).
export function VerificationBanner({ user, onUpdateDetails }) {
  const status = user?.verificationStatus;
  if (status === "pending") {
    return (
      <div id={VERIFICATION_BANNER_ID} tabIndex={-1} role="status" style={{ background: "#EFF6FF", borderBottom: "1px solid #BFDBFE", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, outline: "none" }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#DBEAFE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
        </div>
        <p style={{ fontSize: 13, color: "#1E40AF", margin: 0, fontFamily: font, lineHeight: 1.5 }}>
          {/* A member held for review is told it was an automatic match, not
              what matched (that's for the admins). */}
          {user.reviewFlag
            ? <>Thanks, {firstName(user.name)}! Your details match an account our team declined or blocked before (we check this automatically), so a person on our team will look at your membership before you can take part. This usually takes a day.</>
            : <>Thanks, {firstName(user.name)}! Our team checks every new member before they can take part, usually within a day.</>}
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

// The NRI essentials (the guides every visitor can read), each opening in
// place. For members waiting for review, on their home page and on Guides.
export function EssentialGuides() {
  const [openGuide, setOpenGuide] = useState(null); // slug
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {ESSENTIALS.map((g) => (
        <li key={g.slug} style={{ borderTop: "1px solid #F0EFED" }}>
          <button
            type="button" onClick={() => setOpenGuide(openGuide === g.slug ? null : g.slug)} aria-expanded={openGuide === g.slug}
            style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "10px 0", cursor: "pointer", fontFamily: font }}
          >
            <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#37352F" }}>{g.title}</span>
            <span style={{ display: "block", fontSize: 12, color: "#6B6A67", marginTop: 2 }}>{g.excerpt} · {g.readTime}</span>
          </button>
          {openGuide === g.slug && (
            <div style={{ padding: "0 0 12px", fontSize: 14, color: "#37352F", lineHeight: 1.6 }}>
              {guideBlocks(g.content).map((b, i) => {
                if (b.type === "h") return <h4 key={i} style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "#9A5B13", margin: "14px 0 6px" }}>{b.text}</h4>;
                if (b.type === "ul") return <ul key={i} style={{ margin: "0 0 10px", paddingLeft: 20 }}>{b.items.map((t, j) => <li key={j} style={{ marginBottom: 3 }}>{t}</li>)}</ul>;
                return <p key={i} style={{ margin: "0 0 10px" }}>{b.text}</p>;
              })}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

// Guides, for a member waiting for review: the NRI essentials. (Guides and
// questions from members come once they're approved.)
export function WaitingGuides() {
  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <section aria-labelledby="waiting-guides-title" style={{ background: "#fff", borderRadius: 16, border: "1px solid #E8E7E4", padding: "20px 20px 18px", fontFamily: font }}>
        <h2 id="waiting-guides-title" style={{ fontSize: 19, fontWeight: 700, color: "#37352F", margin: "0 0 6px" }}>NRI essentials</h2>
        <p style={{ fontSize: 14, color: "#5F5E5B", lineHeight: 1.6, margin: "0 0 12px" }}>Our guides to life abroad. Guides and questions from other members open up once our team has approved you.</p>
        <EssentialGuides />
      </section>
    </div>
  );
}

// What a member waiting for review (pending or needs_info) sees instead of
// the feed and the other pages: what happens next, and what they can do
// meanwhile (finish their profile, read the guides, look at the groups).
// The database shows them nothing about other members until an admin has
// approved them. onEditProfile opens Edit profile; onUpdateDetails answers
// the team's question (needs_info).
export function WaitingForReview({ user, onEditProfile, onUpdateDetails }) {
  const needsInfo = user?.verificationStatus === "needs_info";
  const [groups, setGroups] = useState(null); // names of the approved groups, or null while loading / if they can't be read
  useEffect(() => {
    let alive = true;
    api.getGroups().then((rows) => { if (alive) setGroups((rows || []).map((g) => g.name)); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const card = { background: "#fff", borderRadius: 16, border: "1px solid #E8E7E4", padding: "20px 20px 18px", marginBottom: 16, fontFamily: font };
  const h3 = { fontSize: 15, fontWeight: 700, color: "#37352F", margin: "0 0 8px" };
  const text = { fontSize: 14, color: "#5F5E5B", lineHeight: 1.6, margin: 0 };
  const button = { padding: "9px 16px", borderRadius: 8, border: "none", background: "#37352F", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font };
  const shownGroups = (groups || []).slice(0, 12);
  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <section aria-labelledby="waiting-title" style={card}>
        <h2 id="waiting-title" style={{ fontSize: 19, fontWeight: 700, color: "#37352F", margin: "0 0 8px" }}>Waiting for review</h2>
        <p style={text}>
          {needsInfo
            ? "Our team needs a little more information before they can approve you: see their note at the top of the page."
            : "Our team is checking your membership, usually within a day, and you'll see here when you're approved."}
          {" "}Then you can see other members, post, message, say Namaste, join groups and events, and use the Market, places and mentoring.
        </p>
        {needsInfo && <button type="button" onClick={onUpdateDetails} style={{ ...button, marginTop: 14 }}>Update details</button>}
      </section>

      <section aria-labelledby="waiting-profile" style={card}>
        <h3 id="waiting-profile" style={h3}>Meanwhile, finish your profile</h3>
        <p style={{ ...text, marginBottom: 12 }}>A photo, your hometown and what you do help members recognise you once you're in.</p>
        <button type="button" onClick={onEditProfile} style={button}>Edit profile</button>
      </section>

      <section aria-labelledby="waiting-guides" style={card}>
        <h3 id="waiting-guides" style={h3}>Read the NRI essentials</h3>
        <EssentialGuides />
      </section>

      {shownGroups.length > 0 && (
        <section aria-labelledby="waiting-groups" style={card}>
          <h3 id="waiting-groups" style={h3}>Groups you can join once you're approved</h3>
          <p style={{ ...text, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {shownGroups.map((name) => (
              <span key={name} style={{ fontSize: 12, color: "#5F5E5B", background: "#F7F7F5", border: "1px solid #E8E7E4", borderRadius: 20, padding: "4px 10px" }}>{name}</span>
            ))}
            {groups.length > shownGroups.length && <span style={{ fontSize: 12, color: "#6B6A67", padding: "4px 2px" }}>and {groups.length - shownGroups.length} more</span>}
          </p>
        </section>
      )}
    </div>
  );
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
          <a href="mailto:hello@nriclub.app?subject=My%20NRIClub%20membership" style={{ ...button, border: "none", background: "#37352F", color: "#fff" }}>Contact support</a>
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
