// Security: two-step login for the signed-in admin (an authenticator app's
// 6-digit code), and the switch that makes admin rights need it. The
// database enforces the switch (private.is_admin); this page sets it up.
import { useCallback, useEffect, useState } from "react";
import * as api from "../supabaseApi";
import { Button, ConfirmDialog, ErrorNote, PageHeader, Pill, SectionTitle, SkeletonRows } from "./ui";
import { formatDate, friendlyError } from "./format";
import { CodeField, TotpQr } from "./TwoStep";

export default function SecurityView({ showToast }) {
  const [state, setState] = useState(null); // { access, factors }
  const [loadError, setLoadError] = useState("");
  const [enrol, setEnrol] = useState(null); // { id, qr, secret } while setting up
  const [stepUp, setStepUp] = useState(false); // asking for a code to confirm this session
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(null); // "on" | "off"
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [access, factors] = await Promise.all([api.adminAccess(), api.getTotpFactors()]);
      setState({ access, factors });
    } catch (e) {
      setLoadError(`Couldn't load your security settings: ${friendlyError(e)}`);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!state) {
    return (
      <>
        <PageHeader title="Security" description="Two-step login keeps the admin panel safe even if a password gets out." />
        {loadError ? <ErrorNote onRetry={load}>{loadError}</ErrorNote> : <SkeletonRows rows={3} />}
      </>
    );
  }

  const { access, factors } = state;
  const factor = factors.verified[0] || null;
  const twoStepSession = api.sessionAal() === "aal2";

  const startEnrol = async () => {
    setBusy(true);
    setError("");
    try {
      setEnrol(await api.enrollTotp());
      setCode("");
    } catch (e) {
      setError(`Couldn't start setting up two-step login: ${friendlyError(e)}`);
    }
    setBusy(false);
  };

  // The code from the app: finishes setting up (enrol), or confirms this
  // session (stepUp). Either way the session is a two-step one afterwards.
  const confirmCode = async () => {
    if (busy) return;
    if (code.length !== 6) { setError("Enter the 6-digit code from your authenticator app."); return; }
    setBusy(true);
    setError("");
    try {
      await api.verifyTotp(enrol ? enrol.id : factor.id, code);
    } catch (e) {
      setError(e.message || friendlyError(e));
      setCode("");
      setBusy(false);
      return;
    }
    const finished = !!enrol;
    setEnrol(null);
    setStepUp(false);
    setCode("");
    setBusy(false);
    showToast({ text: finished ? "Two-step login is set up" : "Confirmed with your code", icon: "check" });
    load();
  };

  const setRequired = async () => {
    const on = confirm === "on";
    setConfirmBusy(true);
    setConfirmError("");
    try {
      await api.adminSetMfaRequired(on);
    } catch (e) {
      setConfirmError(friendlyError(e));
      setConfirmBusy(false);
      return;
    }
    setConfirmBusy(false);
    setConfirm(null);
    showToast({ text: on ? "Admin rights now need two-step login" : "Admin rights no longer need two-step login", icon: "check" });
    load();
  };

  // Why the switch can't be used right now, if it can't.
  const switchBlocked = access.before
    ? "This switch works once the database update for admin access has run."
    : !factor ? "Set up two-step login for your account first (above)."
    : !twoStepSession ? "Confirm with a code from your app first (above)."
    : "";

  const codeEntry = (label) => (
    <div className="adm-composer" style={{ marginTop: 14, alignItems: "flex-start" }}>
      <label htmlFor="security-code" className="adm-field-label">{label}</label>
      <CodeField id="security-code" value={code} onChange={setCode} onEnter={confirmCode} autoFocus />
      <div className="adm-actions">
        <Button variant="primary" onClick={confirmCode} disabled={busy}>{busy ? "Checking…" : "Confirm"}</Button>
        <Button variant="secondary" onClick={() => { setEnrol(null); setStepUp(false); setCode(""); setError(""); }} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader title="Security" description="Two-step login keeps the admin panel safe even if a password gets out." />

      <SectionTitle>Your two-step login</SectionTitle>
      {error && <ErrorNote>{error}</ErrorNote>}
      {factor ? (
        <div>
          <p style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "8px 0 4px" }}>
            <Pill tone="green">On</Pill>
            <span>You sign in with your password and a 6-digit code from your authenticator app.</span>
          </p>
          <p className="adm-muted adm-small" style={{ margin: "4px 0 0" }}>
            {twoStepSession ? "This session was signed in with the code." : "This session was signed in with your password only."}
          </p>
          {!twoStepSession && !stepUp && (
            <div className="adm-actions" style={{ marginTop: 12 }}>
              <Button variant="secondary" onClick={() => { setStepUp(true); setCode(""); setError(""); }}>Confirm with a code</Button>
            </div>
          )}
          {stepUp && codeEntry("Code from your app")}
        </div>
      ) : enrol ? (
        <div style={{ maxWidth: 460 }}>
          <p style={{ margin: "8px 0 14px" }}>Scan this QR code with your authenticator app (for example Google Authenticator, Microsoft Authenticator, 1Password or Aegis), then enter the 6-digit code it shows.</p>
          <TotpQr qr={enrol.qr} secret={enrol.secret} />
          <div className="adm-callout">Keep the key somewhere safe, for example in your password manager: with it you can add NRIClub to a new phone.</div>
          {codeEntry("Code from the app")}
        </div>
      ) : (
        <div>
          <p style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "8px 0 4px" }}>
            <Pill tone="gray">Off</Pill>
            <span>Set it up so a stolen password alone can't open the admin panel.</span>
          </p>
          <p className="adm-muted adm-small" style={{ margin: "4px 0 12px" }}>You need an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator, 1Password or Aegis.</p>
          <Button variant="primary" icon="lock" onClick={startEnrol} disabled={busy}>{busy ? "Starting…" : "Set up two-step login"}</Button>
        </div>
      )}

      <SectionTitle>Require two-step login for admin rights</SectionTitle>
      <p style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "8px 0 4px" }}>
        {access.mfaRequired ? <Pill tone="green">On</Pill> : <Pill tone="gray">Off</Pill>}
        <span>
          {access.mfaRequired
            ? "Admin rights work only in sessions signed in with the 6-digit code."
            : "Admin rights work with a password alone."}
        </span>
        {access.changedAt && <span className="adm-faint adm-small">Changed {formatDate(access.changedAt)}</span>}
      </p>
      <p className="adm-muted" style={{ margin: "8px 0 0", maxWidth: 640 }}>
        When this is on, the database gives admin rights only to sessions signed in with the code. It applies to every admin: those without two-step login are asked to set it up when they next sign in.
      </p>
      {!access.mfaRequired && (
        <div className="adm-callout" style={{ maxWidth: 640 }}>
          <strong>Before you turn it on:</strong> keep your key somewhere safe. If you lose your phone and the key, nobody can open the admin panel until the site owner turns this off in the Supabase SQL editor.
        </div>
      )}
      <div className="adm-actions" style={{ marginTop: 14 }}>
        <Button variant={access.mfaRequired ? "secondary" : "primary"} onClick={() => { setConfirmError(""); setConfirm(access.mfaRequired ? "off" : "on"); }} disabled={!!switchBlocked}>
          {access.mfaRequired ? "Turn off" : "Turn on"}
        </Button>
        {switchBlocked && <span className="adm-muted adm-small">{switchBlocked}</span>}
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm === "on" ? "Require two-step login?" : "Stop requiring two-step login?"}
          confirmLabel={confirm === "on" ? "Turn on" : "Turn off"}
          tone={confirm === "on" ? "primary" : "danger"}
          busy={confirmBusy}
          error={confirmError}
          onConfirm={setRequired}
          onCancel={() => setConfirm(null)}>
          {confirm === "on"
            ? "From now on admin rights need the 6-digit code. You stay signed in here. Make sure your key is somewhere safe first."
            : "Admin rights then work with a password alone again. Your own two-step login stays set up."}
        </ConfirmDialog>
      )}
    </>
  );
}
