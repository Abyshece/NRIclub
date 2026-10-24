import { useState, useEffect, useRef, lazy, Suspense } from "react";
import * as api from "./supabaseApi";
import LandingPage from "./LandingPage";
import LogoMark from "./LogoMark";
import "./member/base.css";
import { mapProfile, authErrorMessage, isNetworkError, NETWORK_MESSAGE, stillToAccept, termsLaterChosen, chooseTermsLater, forgetTermsLater } from "./member/profile";
import { hasImprint } from "./content/imprint";
import { moveOldInvite, rememberInvite } from "./member/invite";
import { isAppPath } from "./content/routes";
import { startAnalytics, setTrackingArea, trackStep } from "./analytics";

// NRIClub sets no cookies. Website analytics run only for visitors who
// accept them on the privacy banner (src/analytics.js, ConsentBanner.jsx;
// the Privacy Policy lists what the site keeps in the browser). Browsers
// that saw the old cookie banner still hold its choice, and older versions
// kept a copy of the member's profile that nothing read: remove both.
try { ["nriclub_cookie_consent", "nriclub_profile_cache"].forEach((key) => localStorage.removeItem(key)); } catch (e) {}
moveOldInvite();

// The landing page and this file load first; everything else (the member
// site, signup, the admin panel) loads when it's needed, so a visitor's
// first screen appears quickly.
const Dashboard = lazy(() => import("./Dashboard"));
const LoginPage = lazy(() => import("./Dashboard").then(m => ({ default: m.LoginPage })));
const SignUpFlow = lazy(() => import("./member/SignUpFlow"));
const GetVerified = lazy(() => import("./member/GetVerified"));
const TermsGate = lazy(() => import("./member/TermsGate"));
const AdminPanel = lazy(() => import("./admin/AdminPanel"));
const AdminLogin = lazy(() => import("./admin/AdminLogin"));
const CityPage = lazy(() => import("./CityPage"));
const GuidePage = lazy(() => import("./GuidePage"));
const ImpressumPage = lazy(() => import("./ImpressumPage"));
const LegalPage = lazy(() => import("./LegalPage"));
const ReportPage = lazy(() => import("./ReportPage"));
const WhatsOnPage = lazy(() => import("./WhatsOnPage"));
const NotFoundPage = lazy(() => import("./NotFoundPage"));

// An address the site has no page for (see src/content/routes.js); never on
// the admin site, which answers every address.
const unknownPath = () => !isAdminRoute() && !isAppPath(window.location.pathname);

// A public page's address: /city/<city>, /guides, /guides/<slug> or
// /whats-on (members who open it get Events, see Dashboard.jsx).
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
  if (/^\/whats-on\/?$/.test(path)) return { kind: "whats-on" };
  if (/^\/impressum\/?$/.test(path) && hasImprint()) return { kind: "impressum" };
  return null;
};

// The Terms of Use (/terms, earlier versions at /terms/<version>), the
// Privacy Policy (/privacy) and the page for reporting illegal content
// (/report): pages anyone can open, signed in or not.
const legalPage = () => {
  if (/^\/report\/?$/.test(window.location.pathname)) return { kind: "report", version: "" };
  const m = /^\/(terms|privacy)(?:\/([0-9]{4}-[0-9]{2}(?:-[0-9]{2})?))?\/?$/.exec(window.location.pathname);
  if (!m || (m[1] === "privacy" && m[2])) return null;
  return { kind: m[1], version: m[2] || "" };
};

const LoadingScreen = () => (
  <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAF8", fontFamily: "'DM Sans', sans-serif" }}>
    <div style={{ textAlign: "center" }}>
      <div style={{ display: "inline-block", marginBottom: 16 }}><LogoMark size={44} title="NRIClub" /></div>
      <p style={{ color: "#9B9A97", fontSize: 14 }}>Loading...</p>
    </div>
  </div>
);

// ============================================================================
// APP (Root)
// ============================================================================
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
  // An account with two-step login (admins) needs the 6-digit code from its
  // authenticator app before Supabase accepts a new password.
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState("");
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
    if (needCode && code.length !== 6) { setError("Enter the 6-digit code from your authenticator app."); return; }
    setSaving(true);
    setError("");
    try {
      if (needCode) {
        await api.confirmRecoveryCode(code);
        setNeedCode(false);
      }
      const result = await api.updatePassword(password);
      onDone(result?.email || account.email);
    } catch (err) {
      if (err.expired) { onExpired(); return; }
      if (err.code === "insufficient_aal") {
        setNeedCode(true);
        setSaving(false);
        return;
      }
      setError(authErrorMessage(err) || err.message || "Couldn't update your password. Please try again.");
      if (needCode) setCode("");
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
            {needCode && (
              <>
                <label htmlFor="reset-code" style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>6-digit code</label>
                <p id="reset-code-help" style={{ fontSize: 12, color: "#787774", margin: "0 0 8px", lineHeight: 1.5 }}>Your account uses two-step login. Enter the code your authenticator app shows for NRIClub.</p>
                <input id="reset-code" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus aria-describedby="reset-code-help" placeholder="123456"
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 18, letterSpacing: "0.3em", textAlign: "center", boxSizing: "border-box", outline: "none", fontFamily: font, marginBottom: 20 }} />
              </>
            )}
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

// The admin panel lives only on admin.nriclub.app, so an admin's session
// never shares the browser storage of the site that shows members' posts.
// On this computer (localhost, and the dev server) #admin opens it too, for
// testing. #admin on nriclub.app goes to admin.nriclub.app.
const ADMIN_HOST = "admin.nriclub.app";
const isLocalHost = (host) => host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
const isAdminRoute = () => {
  const host = window.location.hostname;
  if (host === ADMIN_HOST || host === "admin.localhost") return true;
  return window.location.hash === "#admin" && (isLocalHost(host) || !!import.meta.env.DEV);
};
try {
  if (window.location.hash === "#admin" && !isAdminRoute() && /(^|\.)nriclub\.app$/.test(window.location.hostname)) {
    window.location.replace(`https://${ADMIN_HOST}/`);
  }
} catch (e) {}
// Website analytics (with the visitor's consent): never on the admin site.
try { if (!isAdminRoute()) startAnalytics(); } catch (e) {}

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

// Signup was waiting for the email code in this tab (see SignUpFlow).
const pendingSignup = () => {
  try { return !!sessionStorage.getItem("nriclub_signup"); } catch (e) { return false; }
};

export default function App() {
  const [authState, setAuthState] = useState(() => (startsSignedOut() ? "landing" : "loading"));
  const [user, setUser] = useState(null);
  // The version of the Terms members must have accepted, as the database
  // says (api.getCurrentTermsVersion); null until known. And the version
  // before it, which still applies to members who accepted it until they
  // accept the current one (api.getPreviousTermsVersion; "" if none).
  const [termsVersion, setTermsVersion] = useState(null);
  const [previousTermsVersion, setPreviousTermsVersion] = useState("");
  // { key: "<member id>:<version>" } once the member answered "Later" on the
  // Terms screen (also kept for the browser session: termsLaterChosen). A new
  // object each time, so the screen updates even when the key doesn't.
  const [termsLater, setTermsLater] = useState({ key: "" });
  const [loginEmail, setLoginEmail] = useState(""); // prefilled after "Log in instead" or a reset this browser asked for
  const [loginNotice, setLoginNotice] = useState(""); // e.g. after a new password
  const [isAdmin, setIsAdmin] = useState(false);
  // The admin login (admin/AdminLogin.jsx): the email to fill in and a notice
  // (after a password reset), and whether a session is already there to
  // check (a reload). adminLoginKey starts it afresh.
  const [adminEmail, setAdminEmail] = useState("");
  const [adminNotice, setAdminNotice] = useState("");
  const [adminResume, setAdminResume] = useState(false);
  const [adminLoginKey, setAdminLoginKey] = useState(0);

  // Admins sign in with their normal NRIClub account (and, with two-step
  // login, the code from their app); the database decides whether that
  // account has admin rights, so nothing here can be faked from the browser.
  const showAdminLogin = ({ resume = false, email = "", notice = "" } = {}) => {
    setAdminResume(resume);
    setAdminEmail(email);
    setAdminNotice(notice);
    setAdminLoginKey((k) => k + 1);
    setIsAdmin(false);
    setAuthState("admin-login");
  };

  // Signs out at once; the server is told in the background.
  const handleAdminLogout = () => {
    api.signOut().catch(() => {});
    showAdminLogin();
  };

  // "Back to NRIClub" from the admin login: the site itself (on this
  // computer, the landing page here).
  const leaveAdmin = () => {
    if (window.location.hostname === ADMIN_HOST) { window.location.assign("https://nriclub.app/"); return; }
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch (e) {}
    setAuthState("landing");
  };

  // Leave the signed-in screens if the session ends by itself (revoked,
  // expired, or another tab signed out or signed in as someone else).
  useEffect(() => { api.onSessionEnded(() => window.location.reload()); }, []);

  // Website analytics: what clicks may record depends on where the visitor
  // is (src/analytics.js): signed out, signed in (or about to be), or the
  // admin panel (nothing). Opening the login page is a step of logging in.
  useEffect(() => {
    setTrackingArea(authState === "admin" || authState === "admin-login" ? "off"
      : authState === "landing" || authState === "signup" || authState === "login" || authState === "link-expired" ? "public" : "member");
    if (authState === "login") trackStep("login_start");
  }, [authState]);

  // Signup and login get a browser history entry of their own (one for
  // both), so the browser's or phone's Back button goes back to the page
  // they were opened from instead of leaving the site. Their own Back
  // button does the same (leaveAuthPage).
  useEffect(() => {
    if (authState !== "signup" && authState !== "login") return;
    try {
      const here = window.location.pathname + window.location.search + window.location.hash;
      if (window.history.state?.nriAuth) window.history.replaceState({ nriAuth: authState }, "", here);
      else window.history.pushState({ nriAuth: authState }, "", here);
    } catch (e) {}
    const onPop = () => setAuthState((s) => (s === "signup" || s === "login" ? "landing" : s));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [authState]);
  const leaveAuthPage = () => {
    if (window.history.state?.nriAuth) {
      try { window.history.back(); return; } catch (e) {}
    }
    setAuthState("landing");
  };
  // An invite link (?invite=<code>; links from before invite codes:
  // ?invite=<member id>&from=<first name>): remembered for Get verified,
  // then taken out of the address bar.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (!q.get("invite")) return;
    rememberInvite(q.get("invite"), q.get("from"));
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
      // With a session, the login finds the next step itself (the panel, or
      // the code from the app); without one it asks for the password.
      let session = null;
      try { session = await api.getSession(); } catch (e) {}
      showAdminLogin({ resume: !!session?.user });
      return;
    }
    let session = null;
    try { session = await api.getSession(); } catch (e) {}
    if (session?.user) {
      try {
        // With the current Terms version, so a tab opened before the Terms
        // changed asks for them again once reloaded.
        const [dbProfile, version, previous] = await Promise.all([api.getMyProfile(), api.getCurrentTermsVersion(), api.getPreviousTermsVersion()]);
        if (dbProfile) {
          setPreviousTermsVersion(previous);
          setTermsVersion(version);
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
      // A reload while signup waited for the email code: back to that step
      // (SignUpFlow keeps it for this tab).
      else if (pendingSignup()) setAuthState("signup");
      return;
    }
    restoreSession();
  }, []);

  // Signed in on the login or signup page: the current Terms version is
  // asked for here (restoreSession asks along with the profile). If it can't
  // be, the member gets the retry screen, as for a profile that can't be read.
  useEffect(() => {
    if (authState !== "authenticated" || termsVersion) return;
    let active = true;
    Promise.all([api.getCurrentTermsVersion(), api.getPreviousTermsVersion()])
      .then(([version, previous]) => { if (active) { setPreviousTermsVersion(previous); setTermsVersion(version); } })
      .catch(() => { if (active) setAuthState("profile-error"); });
    return () => { active = false; };
  }, [authState, termsVersion]);
  // Coming back to the tab, and every few minutes while it's open, ask again:
  // when the Terms change (e.g. with the database update that follows a new
  // version of the site), a member with NRIClub open gets the Terms screen
  // without having to reload. With a new version the profile is read again
  // too, so that screen asks in one go for anything else the update added
  // (such as the separate consent).
  const termsVersionRef = useRef(termsVersion);
  termsVersionRef.current = termsVersion;
  useEffect(() => {
    if (authState !== "authenticated") return;
    let active = true;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      Promise.all([api.getCurrentTermsVersion({ refresh: true }), api.getPreviousTermsVersion({ refresh: true })]).then(async ([version, previous]) => {
        if (termsVersionRef.current && version !== termsVersionRef.current) {
          try {
            const dbProfile = await api.getMyProfile();
            if (active && dbProfile) setUser(mapProfile(dbProfile));
          } catch {}
        }
        if (active) { setPreviousTermsVersion(previous); setTermsVersion(version); }
      }).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(onVisible, 5 * 60000);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [authState]);

  // After a new password: log in with it. The email is filled in only if this
  // browser asked for the reset link: someone else may have made the link,
  // for their own account, so their address must not be offered.
  const handlePasswordReset = (email) => {
    const notice = "Your password has been changed. Log in with your new password.";
    const knownEmail = email && api.resetWasRequestedFor(email) ? email : "";
    // The new password is set: this browser needn't remember the request.
    api.forgetResetRequest();
    if (isAdminRoute()) {
      showAdminLogin({ email: knownEmail, notice });
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
    if (user?.id) forgetTermsLater(user.id);
    setTermsLater({ key: "" });
    api.signOut().catch(() => {});
    try { localStorage.removeItem("nriclub_profile_cache"); } catch (e) {}
    // The address of the page the member was on (e.g. /u/<member id>) goes
    // too: the landing page shows at the home address.
    try { window.history.replaceState(null, "", "/"); } catch (e) {}
    setUser(null);
    setAuthState("landing");
  };

  // The Terms, the Privacy Policy and the report page show for anyone who
  // opens their address, whatever else is going on (except on the admin
  // site). Log in and Join free move to the app's own address first; a
  // member who is signed in gets "Open NRIClub", which loads the app.
  const legal = !isAdminRoute() && legalPage();
  if (legal) {
    const leave = (state) => {
      try { window.history.replaceState(null, "", "/"); } catch (e) {}
      setAuthState(state);
    };
    const signedIn = api.hasStoredSession();
    const onLogin = signedIn ? () => window.location.assign("/") : () => leave("login");
    return (
      <Suspense fallback={<LoadingScreen />}>
        {legal.kind === "report"
          ? <ReportPage signedIn={signedIn} onLogin={onLogin} onJoin={() => leave("signup")} />
          : <LegalPage kind={legal.kind} version={legal.version} signedIn={signedIn} onLogin={onLogin} onJoin={() => leave("signup")} />}
      </Suspense>
    );
  }

  if (authState === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAF8", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "inline-block", marginBottom: 16 }}><LogoMark size={44} title="NRIClub" /></div>
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
          <div style={{ display: "inline-block", marginBottom: 16 }}><LogoMark size={44} title="NRIClub" /></div>
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
        <AdminLogin key={adminLoginKey} initialEmail={adminEmail} notice={adminNotice} resume={adminResume}
          onSignedIn={() => { setIsAdmin(true); setAuthState("admin"); }} onBack={leaveAdmin} />
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
      // Page not found: Log in and Join free move to the homepage's address first.
      if (unknownPath()) {
        const leave = (state) => {
          try { window.history.replaceState(null, "", "/"); } catch (e) {}
          setAuthState(state);
        };
        return <NotFoundPage onJoin={() => leave("signup")} onLogin={() => leave("login")} />;
      }
      if (page?.kind === "city") return <CityPage city={page.city} onJoin={join} onLogin={login} />;
      if (page?.kind === "guide") return <GuidePage slug={page.slug} onJoin={join} onLogin={login} />;
      if (page?.kind === "whats-on") return <WhatsOnPage onJoin={join} onLogin={login} />;
      if (page?.kind === "impressum") return <ImpressumPage onJoin={join} onLogin={login} />;
      return <LandingPage onJoin={join} onLogin={login} />;
    };
    if (authState === "landing") return landing();
    if (authState === "signup") return <SignUpFlow onComplete={handleAuthComplete} onBack={leaveAuthPage} onLogin={(email) => { setLoginEmail(email || ""); setLoginNotice(""); setAuthState("login"); }} />;
    if (authState === "login") return <LoginPage initialEmail={loginEmail} notice={loginNotice} onComplete={(u) => { trackStep("login_ok"); handleAuthComplete(u); }} onBack={leaveAuthPage} onSignUp={() => { setLoginNotice(""); setAuthState("signup"); }} />;
    if (authState === "authenticated" && user) {
      if (unknownPath()) return <NotFoundPage signedIn onLogin={() => window.location.assign("/")} />;
      // In this order: blocked members only see the blocked card (whatever
      // their verification status); members who haven't given their
      // verification details do that first; then anyone who hasn't confirmed
      // they're 18+, accepted the current Terms (the version the database
      // gives) and given the Art. 9 consent (the database doesn't let them
      // take part until they have). Rejected members see the rejected card
      // in the dashboard (a Terms screen would be pointless). The dashboard
      // loads nothing behind a blocked or rejected card, and members waiting
      // for review see only what they can use until an admin approves them.
      if (user.status === "blocked") return <Dashboard user={user} onLogout={handleLogout} onUserUpdate={setUser} />;
      if (!termsVersion) return <LoadingScreen />;
      if (user.verificationStatus === "incomplete") return <GetVerified user={user} termsVersion={termsVersion} onDone={setUser} onSignOut={handleLogout} />;
      const toAccept = stillToAccept(user, termsVersion, previousTermsVersion);
      // A member on the previous version may answer "Later" (the Terms they
      // accepted still apply, section 14): asked again next time NRIClub is
      // opened, and from the travel board, which needs the current version.
      const laterKey = `${user.id}:${termsVersion}`;
      const later = toAccept.later && (termsLater.key === laterKey || termsLaterChosen(user.id, termsVersion));
      if (user.verificationStatus !== "rejected" && (toAccept.terms || toAccept.art9) && !later) {
        // A fresh screen whenever what's asked for changes (e.g. the consent
        // after the Terms, when the database was updated in between).
        return <TermsGate key={`${termsVersion}:${toAccept.terms}:${toAccept.art9}:${toAccept.later}`} user={user} termsVersion={termsVersion}
          onDone={setUser} onSignOut={handleLogout}
          onLater={toAccept.later ? () => { chooseTermsLater(user.id, termsVersion); setTermsLater({ key: laterKey }); } : null} />;
      }
      return <Dashboard user={user} onLogout={handleLogout} onUserUpdate={setUser} termsVersion={termsVersion}
        onReviewTerms={later ? () => { forgetTermsLater(user.id); setTermsLater({ key: "" }); } : null} />;
    }
    return landing();
  })();

  return (
    <>
      <Suspense fallback={<LoadingScreen />}>{content}</Suspense>
    </>
  );
}


