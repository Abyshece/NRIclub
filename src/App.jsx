import { useState, useEffect, useRef, lazy, Suspense } from "react";
import * as api from "./supabaseApi";
import LandingPage from "./LandingPage";
import FlagIcon from "./FlagIcon";
import "./member/base.css";
import { TermsModal, PrivacyModal, TERMS_VERSION } from "./member/LegalModals";
import { mapProfile, authErrorMessage, isNetworkError, NETWORK_MESSAGE } from "./member/profile";
import { rateLimiter } from "./rateLimiter";
import { hasImprint } from "./content/imprint";

// The landing page and this file load first; everything else (the member
// site, signup, the admin panel) loads when it's needed, so a visitor's
// first screen appears quickly.
const Dashboard = lazy(() => import("./Dashboard"));
const LoginPage = lazy(() => import("./Dashboard").then(m => ({ default: m.LoginPage })));
const SignUpFlow = lazy(() => import("./member/SignUpFlow"));
const GetVerified = lazy(() => import("./member/GetVerified"));
const TermsGate = lazy(() => import("./member/TermsGate"));
const AdminPanel = lazy(() => import("./admin/AdminPanel"));
const CityPage = lazy(() => import("./CityPage"));
const GuidePage = lazy(() => import("./GuidePage"));
const ImpressumPage = lazy(() => import("./ImpressumPage"));

// A public page's address: /city/<city>, /guides or /guides/<slug>.
const publicPage = () => {
  const path = window.location.pathname;
  const city = /^\/city\/([^/]+)/.exec(path);
  if (city) {
    try {
      const name = decodeURIComponent(city[1]).replace(/[-_+]+/g, " ").trim().slice(0, 100);
      if (name) return { kind: "city", city: name };
    } catch (e) {}
    return null;
  }
  const guide = /^\/guides(?:\/([a-z0-9-]+))?\/?$/.exec(path);
  if (guide) return { kind: "guide", slug: guide[1] || "" };
  if (/^\/impressum\/?$/.test(path) && hasImprint()) return { kind: "impressum" };
  return null;
};

const LoadingScreen = () => (
  <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAF8", fontFamily: "'DM Sans', sans-serif" }}>
    <div style={{ textAlign: "center" }}>
      <div style={{ display: "inline-block", marginBottom: 16 }}><FlagIcon size={48} /></div>
      <p style={{ color: "#9B9A97", fontSize: 14 }}>Loading...</p>
    </div>
  </div>
);

// ============================================================================
// APP (Root)
// ============================================================================
// Cookie Consent Banner Component
const CookieConsent = () => {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [legal, setLegal] = useState(null); // "terms" | "privacy"
  const bannerRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const result = localStorage.getItem("nriclub_cookie_consent");
        if (!result) setVisible(true);
      } catch {
        setVisible(true);
      }
    })();
  }, []);

  // While the banner shows, pad the page by its height so it never covers
  // the last buttons on a page (Continue, Log in...).
  useEffect(() => {
    if (!visible || !bannerRef.current) return;
    const el = bannerRef.current;
    const pad = () => { document.body.style.paddingBottom = `${el.offsetHeight}px`; };
    pad();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(pad) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); document.body.style.paddingBottom = ""; };
  }, [visible]);

  const acceptAll = async () => {
    try { localStorage.setItem("nriclub_cookie_consent", JSON.stringify({ essential: true, analytics: true, date: new Date().toISOString() })); } catch (e) {}
    setVisible(false);
  };
  const acceptEssential = async () => {
    try { localStorage.setItem("nriclub_cookie_consent", JSON.stringify({ essential: true, analytics: false, date: new Date().toISOString() })); } catch (e) {}
    setVisible(false);
  };

  if (!visible) return null;

  const font = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  return (
    <div ref={bannerRef} role="region" aria-label="Cookie consent" style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
      background: "#fff", borderTop: "1px solid #E0E0DE",
      boxShadow: "0 -4px 24px rgba(0,0,0,0.08)", padding: "0",
      fontFamily: font,
    }}>
      <div className="nc-cookie-inner" style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div className="nc-cookie-text" style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#37352F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: "#37352F", margin: 0 }}>We value your privacy</h4>
            </div>
            <p style={{ fontSize: 13, color: "#5F5E5B", lineHeight: 1.6, margin: 0 }}>
              We use essential cookies to make NRIClub work. With your consent, we may also use analytics cookies to improve your experience.
              {" "}
              <button onClick={() => setShowDetails(!showDetails)} style={{ background: "none", border: "none", color: "#5B7FD6", cursor: "pointer", textDecoration: "underline", fontFamily: font, fontSize: 13, padding: 0 }}>
                {showDetails ? "Hide details" : "Learn more"}
              </button>
              {" · "}
              <button type="button" onClick={() => setLegal("privacy")} style={{ background: "none", border: "none", color: "#5B7FD6", cursor: "pointer", textDecoration: "underline", fontFamily: font, fontSize: "inherit", padding: 0 }}>Privacy Policy</button>
              {" · "}
              <button type="button" onClick={() => setLegal("terms")} style={{ background: "none", border: "none", color: "#5B7FD6", cursor: "pointer", textDecoration: "underline", fontFamily: font, fontSize: "inherit", padding: 0 }}>Terms of Use</button>
            </p>

            {showDetails && (
              <div style={{ marginTop: 14, padding: "14px 16px", background: "#F7F7F5", borderRadius: 8, border: "1px solid #EDEDEB" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#37352F" }}>Essential Cookies</span>
                    <p style={{ fontSize: 11, color: "#9B9A97", margin: "2px 0 0" }}>Required for the platform to function. Cannot be disabled.</p>
                  </div>
                  <span style={{ fontSize: 11, color: "#22A06B", fontWeight: 600, background: "#E3FCEF", padding: "3px 8px", borderRadius: 4 }}>Always on</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid #E8E7E4" }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#37352F" }}>Analytics Cookies</span>
                    <p style={{ fontSize: 11, color: "#9B9A97", margin: "2px 0 0" }}>Help us understand how you use NRIClub to improve the experience.</p>
                  </div>
                  <span style={{ fontSize: 11, color: "#6B6A67", fontWeight: 600, background: "#F0EFED", padding: "3px 8px", borderRadius: 4 }}>Optional</span>
                </div>
              </div>
            )}
          </div>

          <div className="nc-cookie-actions" style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
            <button onClick={acceptEssential} style={{
              padding: "10px 18px", borderRadius: 8, border: "1px solid #E0E0DE",
              background: "#fff", fontSize: 13, fontWeight: 500, color: "#37352F", cursor: "pointer", fontFamily: font,
            }}>
              Essential Only
            </button>
            <button onClick={acceptAll} style={{
              padding: "10px 18px", borderRadius: 8, border: "none",
              background: "#37352F", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", fontFamily: font,
            }}>
              Accept All
            </button>
          </div>
        </div>
      </div>
      {legal === "terms" && <TermsModal onClose={() => setLegal(null)} />}
      {legal === "privacy" && <PrivacyModal onClose={() => setLegal(null)} />}
    </div>
  );
};

// "a***@example.com": enough to recognise an email address without showing it.
const maskEmail = (email) => {
  const [local, domain] = String(email || "").split("@");
  if (!domain) return email || "";
  return `${local.slice(0, 1)}***@${domain}`;
};

// Shown after following a password-reset email link. The link's session is
// kept in memory only (supabaseApi), so the page says which account the new
// password is for, warns when this browser is signed in to a different
// account, and afterwards sends the member to log in. onDone(email) after the
// password is set; onCancel to leave it; onExpired when the link no longer works.
const ResetPasswordPage = ({ onDone, onCancel, onExpired }) => {
  const [account, setAccount] = useState(null); // { email, signedInAsSomeoneElse }
  const [checkError, setCheckError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const font = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  useEffect(() => {
    let active = true;
    setCheckError("");
    api.getRecoveryUser().then((a) => { if (active) setAccount(a); }).catch((err) => {
      if (!active) return;
      if (err.expired) onExpired();
      else setCheckError(isNetworkError(err) ? NETWORK_MESSAGE : "We couldn't check your reset link. Please try again.");
    });
    return () => { active = false; };
  }, [attempt]);

  const save = async (e) => {
    e.preventDefault();
    if (saving || !account) return;
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    setSaving(true);
    setError("");
    try {
      const result = await api.updatePassword(password);
      onDone(result?.email || account.email);
    } catch (err) {
      if (err.expired) { onExpired(); return; }
      setError(authErrorMessage(err) || err.message || "Couldn't update your password. Please try again.");
      setSaving(false);
    }
  };
  const cancel = () => {
    api.cancelRecovery();
    onCancel();
  };

  const linkButton = { background: "none", border: "none", color: "#5F5E5B", fontSize: 13, fontWeight: 500, cursor: "pointer", textDecoration: "underline", fontFamily: font, padding: 4 };
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem", background: "#F7F7F5", fontFamily: font }}>
      <form onSubmit={save} noValidate style={{ maxWidth: 380, width: "100%", background: "#fff", borderRadius: 16, padding: 32, border: "1px solid #EDEDEB" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", marginBottom: 6 }}>Set a new password</h2>
        {!account ? (
          checkError ? (
            <>
              <div role="alert" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", padding: "8px 12px", borderRadius: 8, fontSize: 12, margin: "14px 0 16px" }}>{checkError}</div>
              <button type="button" onClick={() => setAttempt(a => a + 1)} style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#37352F", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Try again</button>
            </>
          ) : (
            <p role="status" style={{ fontSize: 13, color: "#787774", marginBottom: 20 }}>Checking your link...</p>
          )
        ) : (
          <>
            <p style={{ fontSize: 13, color: "#787774", marginBottom: 20, lineHeight: 1.5 }}>
              Set a new password for <strong style={{ color: "#37352F" }}>{maskEmail(account.email)}</strong>. Use at least 8 characters.
            </p>
            {account.signedInAsSomeoneElse && (
              <div role="note" style={{ background: "#FFF8E6", border: "1px solid #FCE7B2", color: "#7A4D00", padding: "10px 12px", borderRadius: 8, fontSize: 12, lineHeight: 1.5, marginBottom: 16 }}>
                This browser is signed in to a different NRIClub account. This link changes the password of {maskEmail(account.email)} only. If you didn't ask for it, cancel.
              </div>
            )}
            {error && <div role="alert" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", padding: "8px 12px", borderRadius: 8, fontSize: 12, marginBottom: 16 }}>{error}</div>}
            <label htmlFor="new-password" style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>New password</label>
            <div style={{ position: "relative", marginBottom: 20 }}>
              <input id="new-password" type={show ? "text" : "password"} autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%", padding: "12px 64px 12px 14px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 15, boxSizing: "border-box", outline: "none", fontFamily: font }} />
              <button type="button" onClick={() => setShow(!show)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#787774", fontSize: 12, cursor: "pointer" }}>{show ? "Hide" : "Show"}</button>
            </div>
            <button type="submit" disabled={saving} style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#37352F", color: "#fff", fontSize: 14, fontWeight: 600, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Save password"}</button>
          </>
        )}
        <p style={{ textAlign: "center", marginTop: 16, marginBottom: 0 }}>
          <button type="button" onClick={cancel} disabled={saving} style={linkButton}>Cancel</button>
        </p>
      </form>
    </div>
  );
};

// Shown for a link from one of our emails that has expired, was already used
// or isn't valid.
const ExpiredLinkPage = ({ onContinue }) => {
  const font = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem", background: "#F7F7F5", fontFamily: font }}>
      <div role="alert" style={{ maxWidth: 380, width: "100%", background: "#fff", borderRadius: 16, padding: 32, border: "1px solid #EDEDEB" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", marginBottom: 6 }}>This link has expired</h2>
        <p style={{ fontSize: 13, color: "#787774", marginBottom: 20, lineHeight: 1.6 }}>
          Links in our emails work only once and only for a limited time. To reset your password, ask for a new link: choose “Forgot password?” on the login page.
        </p>
        <button type="button" onClick={onContinue} style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#37352F", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Go to log in</button>
      </div>
    </div>
  );
};

const isAdminRoute = () => {
  const isAdminDomain = window.location.hostname === "admin.nriclub.app" || window.location.hostname.startsWith("admin.");
  return isAdminDomain || window.location.hash === "#admin";
};

// Nobody is signed in in this browser and the page wasn't opened from one of
// our emails: show the landing page at once (index.html already has its
// text, see vite.config.js) instead of "Loading..." first.
const startsSignedOut = () => {
  try {
    const link = api.takeAuthRedirect().kind;
    return link !== "recovery" && link !== "expired" && !isAdminRoute() && !api.hasStoredSession();
  } catch (e) {
    return false;
  }
};

export default function App() {
  const [authState, setAuthState] = useState(() => (startsSignedOut() ? "landing" : "loading"));
  const [user, setUser] = useState(null);
  const [loginEmail, setLoginEmail] = useState(""); // prefilled after "Log in instead" or a reset this browser asked for
  const [loginNotice, setLoginNotice] = useState(""); // e.g. after a new password
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [adminErr, setAdminErr] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminNotice, setAdminNotice] = useState("");

  // Admins sign in with their normal NRIClub account; the database decides
  // whether that account is an admin (public.admins), so nothing here can be
  // faked from the browser.
  const handleAdminLogin = async () => {
    if (adminLoading) return;
    const rl = rateLimiter.check("admin_login", 5, 900000);
    if (!rl.allowed) { setAdminErr(`Too many attempts. Wait ${Math.ceil(rl.waitSecs / 60)} min.`); return; }
    setAdminLoading(true);
    setAdminErr("");
    try {
      await api.signIn(adminEmail.trim().toLowerCase(), adminPass);
    } catch (e) {
      setAdminErr(e.message || "Invalid email or password.");
      setAdminLoading(false);
      return;
    }
    let admin = false;
    try {
      admin = await api.isAdmin();
    } catch (e) {
      await api.signOut();
      setAdminErr("Couldn't check admin access. Please try again.");
      setAdminLoading(false);
      return;
    }
    if (admin) {
      rateLimiter.reset("admin_login");
      setAdminPass("");
      setIsAdmin(true);
      setAuthState("admin");
    } else {
      await api.signOut();
      setAdminErr("This account does not have admin access.");
    }
    setAdminLoading(false);
  };

  const handleAdminForgotPassword = async () => {
    const email = adminEmail.trim().toLowerCase();
    if (!email.includes("@")) { setAdminErr("Enter your email first, then click Forgot password."); return; }
    try {
      await api.resetPassword(email);
      setAdminErr("");
      setAdminNotice("If that account exists, we've emailed it a link to set a new password.");
    } catch (e) {
      setAdminErr(e.message || "Couldn't send the reset email. Please try again.");
    }
  };

  // Signs out at once; the server is told in the background.
  const handleAdminLogout = () => {
    api.signOut().catch(() => {});
    setIsAdmin(false);
    setAuthState("admin-login");
  };

  // Leave the signed-in screens if the session ends by itself (revoked,
  // expired, or another tab signed out or signed in as someone else).
  useEffect(() => { api.onSessionEnded(() => window.location.reload()); }, []);
  // An invite link (?invite=<member id>&from=<first name>): remembered for
  // Get verified, then taken out of the address bar.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const inviter = q.get("invite");
    if (!inviter) return;
    if (/^[0-9a-f-]{36}$/i.test(inviter)) {
      try { localStorage.setItem("nriclub_invite", JSON.stringify({ id: inviter, from: (q.get("from") || "").slice(0, 40) })); } catch (e) {}
    }
    try { window.history.replaceState(null, "", window.location.pathname + window.location.hash); } catch (e) {}
  }, []);

  // Restores this browser's session, or shows `fallback` when nobody is
  // signed in. If the session is fine but the profile can't be read, the
  // member gets a retry: they are never shown as signed out or unverified
  // because of one failed request.
  const restoreSession = async (fallback = "landing") => {
    // Already on the landing page with no session to check (see
    // startsSignedOut): stay there rather than flash "Loading...".
    setAuthState((state) => (state === "landing" && fallback === "landing" && !isAdminRoute() && !api.hasStoredSession() ? state : "loading"));
    if (isAdminRoute()) {
      try {
        const session = await api.getSession();
        if (session?.user && await api.isAdmin()) {
          setIsAdmin(true);
          setAuthState("admin");
          return;
        }
      } catch (e) {}
      setAuthState("admin-login");
      return;
    }
    let session = null;
    try { session = await api.getSession(); } catch (e) {}
    if (session?.user) {
      try {
        const dbProfile = await api.getMyProfile();
        if (dbProfile) {
          setUser(mapProfile(dbProfile));
          setAuthState("authenticated");
          return;
        }
      } catch (e) {
        setAuthState("profile-error");
        return;
      }
    }
    // No valid session: never treat cached profile data as a login.
    try { localStorage.removeItem("nriclub_profile_cache"); } catch (e) {}
    setAuthState(fallback);
  };

  useEffect(() => {
    // Links from our emails: the API took the auth data out of the address
    // bar as the site loaded. A password-reset link opens the reset page; an
    // expired or used link says so.
    const link = api.takeAuthRedirect();
    if (link.kind === "recovery" && api.takeRecoverySession()) {
      setAuthState("reset-password");
      return;
    }
    if (link.kind === "expired") {
      setAuthState("link-expired");
      return;
    }
    // Nobody signed in: the landing page is already showing, and there is no
    // session to restore (doing it anyway would undo a tap on Join free made
    // just as the app appeared). A Join free or Log in tapped on the
    // homepage's text before the app had loaded (see vite.config.js) opens now.
    const start = window.nriStart;
    window.nriStart = null;
    if (startsSignedOut()) {
      try { localStorage.removeItem("nriclub_profile_cache"); } catch (e) {}
      if (start === "signup" || start === "login") setAuthState(start);
      return;
    }
    restoreSession();
  }, []);

  // After a new password: log in with it. The email is filled in only if this
  // browser asked for the reset link: someone else may have made the link,
  // for their own account, so their address must not be offered.
  const handlePasswordReset = (email) => {
    const notice = "Your password has been changed. Log in with your new password.";
    const knownEmail = email && api.resetWasRequestedFor(email) ? email : "";
    if (isAdminRoute()) {
      setAdminEmail(knownEmail);
      setAdminErr("");
      setAdminNotice(notice);
      setAuthState("admin-login");
      return;
    }
    setLoginEmail(knownEmail);
    setLoginNotice(notice);
    setAuthState("login");
  };

  const handleAuthComplete = (userData) => {
    setLoginNotice("");
    setUser(userData);
    setAuthState("authenticated");
  };

  // Shows the signed-out screen at once; the server is told in the background.
  const handleLogout = () => {
    api.signOut().catch(() => {});
    try { localStorage.removeItem("nriclub_profile_cache"); } catch (e) {}
    setUser(null);
    setAuthState("landing");
  };

  if (authState === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAF8", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "inline-block", marginBottom: 16 }}><FlagIcon size={48} /></div>
          <p style={{ color: "#9B9A97", fontSize: 14 }}>Loading...</p>
        </div>
      </div>
    );
  }

  // Signed in, but the profile couldn't be read (e.g. a network hiccup).
  if (authState === "profile-error") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 16px", background: "#FAFAF8", fontFamily: "'DM Sans', sans-serif" }}>
        <div role="alert" style={{ textAlign: "center", maxWidth: 360 }}>
          <div style={{ display: "inline-block", marginBottom: 16 }}><FlagIcon size={48} /></div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#37352F", marginBottom: 8 }}>We couldn't load your profile</h2>
          <p style={{ color: "#6B6A67", fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>Please check your connection and try again.</p>
          <button type="button" onClick={() => restoreSession()} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#37352F", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Try again</button>
          <p style={{ marginTop: 12 }}>
            <button type="button" onClick={handleLogout} style={{ background: "none", border: "none", color: "#5F5E5B", fontSize: 13, fontWeight: 500, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit", padding: 4 }}>Sign out</button>
          </p>
        </div>
      </div>
    );
  }

  const content = (() => {
    if (authState === "admin-login") {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1A1A1A", fontFamily: "'DM Sans', sans-serif" }}>
          <div style={{ maxWidth: 360, width: "100%", background: "#fff", borderRadius: 16, padding: 32 }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#37352F" }}>NRI<span style={{ fontStyle: "italic", fontFamily: '"Times New Roman",serif' }}>Club</span></h2>
              <p style={{ fontSize: 12, color: "#9B9A97", marginTop: 4 }}>Admin Panel Login</p>
            </div>
            {adminErr && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", padding: "8px 12px", borderRadius: 8, fontSize: 12, marginBottom: 16 }}>{adminErr}</div>}
            {adminNotice && !adminErr && <div style={{ background: "#E3FCEF", border: "1px solid #ABF5D1", color: "#22A06B", padding: "8px 12px", borderRadius: 8, fontSize: 12, marginBottom: 16 }}>{adminNotice}</div>}
            <input type="email" autoComplete="username" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="Admin email" style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 14, marginBottom: 12, boxSizing: "border-box", outline: "none" }} />
            <input type="password" autoComplete="current-password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} placeholder="Password" style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 14, marginBottom: 20, boxSizing: "border-box", outline: "none" }} onKeyDown={(e) => { if (e.key === "Enter") handleAdminLogin(); }} />
            <button onClick={handleAdminLogin} disabled={adminLoading} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: "#37352F", color: "#fff", fontSize: 14, fontWeight: 600, cursor: adminLoading ? "default" : "pointer", opacity: adminLoading ? 0.7 : 1 }}>{adminLoading ? "Signing in..." : "Sign In"}</button>
            <p style={{ fontSize: 11, textAlign: "center", marginTop: 12 }}><button type="button" onClick={handleAdminForgotPassword} style={{ background: "none", border: "none", color: "#5B9CFF", fontSize: 11, cursor: "pointer", padding: 0 }}>Forgot password?</button></p>
            <p style={{ fontSize: 11, color: "#9B9A97", textAlign: "center", marginTop: 16 }}><a href="#" onClick={(e) => { e.preventDefault(); window.location.hash = ""; setAuthState("landing"); }} style={{ color: "#5B9CFF" }}>← Back to NRIClub</a></p>
          </div>
        </div>
      );
    }
    if (authState === "reset-password") {
      return <ResetPasswordPage onDone={handlePasswordReset} onCancel={() => restoreSession()} onExpired={() => setAuthState("link-expired")} />;
    }
    if (authState === "link-expired") return <ExpiredLinkPage onContinue={() => restoreSession("login")} />;
    if (authState === "admin" && isAdmin) return <AdminPanel onLogout={handleAdminLogout} />;
    const landing = () => {
      const page = publicPage();
      const join = () => setAuthState("signup");
      const login = () => setAuthState("login");
      if (page?.kind === "city") return <CityPage city={page.city} onJoin={join} onLogin={login} />;
      if (page?.kind === "guide") return <GuidePage slug={page.slug} onJoin={join} onLogin={login} />;
      if (page?.kind === "impressum") return <ImpressumPage onJoin={join} onLogin={login} />;
      return <LandingPage onJoin={join} onLogin={login} />;
    };
    if (authState === "landing") return landing();
    if (authState === "signup") return <SignUpFlow onComplete={handleAuthComplete} onBack={() => setAuthState("landing")} onLogin={(email) => { setLoginEmail(email || ""); setLoginNotice(""); setAuthState("login"); }} />;
    if (authState === "login") return <LoginPage initialEmail={loginEmail} notice={loginNotice} onComplete={handleAuthComplete} onBack={() => setAuthState("landing")} onSignUp={() => { setLoginNotice(""); setAuthState("signup"); }} />;
    if (authState === "authenticated" && user) {
      // In this order: blocked members only see the blocked card (whatever
      // their verification status); members who haven't given their
      // verification details do that first; then anyone who hasn't confirmed
      // they're 18+ and accepted the current Terms (TERMS_VERSION: the
      // database doesn't count them as active members until they have).
      // Rejected members see the rejected card in the dashboard (a Terms
      // screen would be pointless). The dashboard loads nothing behind a
      // blocked or rejected card.
      if (user.status === "blocked") return <Dashboard user={user} onLogout={handleLogout} onUserUpdate={setUser} />;
      if (user.verificationStatus === "incomplete") return <GetVerified user={user} onDone={setUser} onSignOut={handleLogout} />;
      if (user.verificationStatus !== "rejected" && (!user.ageConfirmedAt || !user.termsAcceptedAt || user.termsVersion !== TERMS_VERSION)) {
        return <TermsGate user={user} onDone={setUser} onSignOut={handleLogout} />;
      }
      return <Dashboard user={user} onLogout={handleLogout} onUserUpdate={setUser} />;
    }
    return landing();
  })();

  return (
    <>
      <Suspense fallback={<LoadingScreen />}>{content}</Suspense>
      <CookieConsent />
    </>
  );
}


