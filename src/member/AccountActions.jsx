import { useState } from "react";
import { ImpressumModal } from "./LegalModals";
import { hasImprint } from "../content/imprint";
import * as api from "../supabaseApi";
import { apiErrorMessage } from "./profile";
import { FONT, COLORS, linkButtonStyle, ErrorBox } from "./ui";

// Saves data as a JSON file in the browser's downloads.
export function saveJsonFile(data, fileName) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Some browsers start the download only after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Everything NRIClub stores about the signed-in member (api.exportMyData),
// saved as nriclub-my-data.json.
export async function downloadMyData() {
  const data = await api.exportMyData();
  saveJsonFile(data, "nriclub-my-data.json");
}

// "Download my data" and "Delete my account" for the screens that stand in
// front of the dashboard (Get verified, the Terms screen, the rejected
// screen), where Settings can't be reached. Each screen draws its own
// buttons. onSignOut runs after the account is deleted.
export function useAccountActions(onSignOut) {
  const [busy, setBusy] = useState(""); // "" | "download" | "delete"
  const [error, setError] = useState("");

  const download = async () => {
    if (busy) return;
    setBusy("download");
    setError("");
    try {
      await downloadMyData();
    } catch (err) {
      setError(apiErrorMessage(err, "We couldn't download your data. Please try again, or contact hello@nriclub.app."));
    }
    setBusy("");
  };

  const deleteAccount = async () => {
    if (busy) return;
    if (!window.confirm("Delete your NRIClub account? Your profile and everything you've posted will be removed. This can't be undone.")) return;
    setBusy("delete");
    setError("");
    try {
      await api.deleteAccount();
    } catch (err) {
      setError(apiErrorMessage(err, "Your account couldn't be deleted. Please try again, or contact hello@nriclub.app."));
      setBusy("");
      return;
    }
    try { localStorage.removeItem("nriclub_profile_cache"); } catch {}
    onSignOut();
  };

  return { busy, error, download, deleteAccount };
}

// The footer of the full-page member screens (Get verified, the Terms
// screen): who is signed in, Sign out, and the account actions.
export function AccountFooter({ email, onSignOut }) {
  const { busy, error, download, deleteAccount } = useAccountActions(onSignOut);
  const [impressum, setImpressum] = useState(() => hasImprint() && /^\/impressum\/?$/.test(window.location.pathname));
  const link = { ...linkButtonStyle, fontWeight: 500, color: COLORS.label };
  return (
    <div style={{ textAlign: "center", marginTop: 28, fontSize: 13, color: COLORS.helper, lineHeight: 1.6, fontFamily: FONT }}>
      <p style={{ margin: 0 }}>
        {email && <>Signed in as {email}. </>}
        <button type="button" onClick={onSignOut} style={link}>Sign out</button>
      </p>
      <p style={{ margin: "8px 0 0" }}>
        <button type="button" onClick={download} aria-disabled={!!busy} style={link}>
          {busy === "download" ? "Preparing your data..." : "Download my data"}
        </button>
        <span aria-hidden="true"> · </span>
        <button type="button" onClick={deleteAccount} aria-disabled={!!busy} style={link}>
          {busy === "delete" ? "Deleting..." : "Delete my account"}
        </button>
      </p>
      {hasImprint() && (
        <p style={{ margin: "8px 0 0" }}>
          <button type="button" onClick={() => setImpressum(true)} style={link}>Impressum</button>
        </p>
      )}
      {error && <ErrorBox style={{ marginTop: 12, textAlign: "left" }}>{error}</ErrorBox>}
      {impressum && <ImpressumModal onClose={() => setImpressum(false)} />}
    </div>
  );
}
