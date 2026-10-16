// Photo files nothing uses any more (of deleted posts, listings, events and
// accounts, replaced profile photos, content our team removed) are deleted
// from here, through Storage with the admin's own session
// (api.adminCleanUpPhotoFiles; the database lets an admin delete a file only
// while nothing shows it). The clean-up runs by itself once a day, for the
// first admin who opens the panel, and whenever "Clean up photo files" in
// Overview is pressed. The Privacy Policy promises these files go within a
// few days (RETENTION.photoCleanupDays in src/content/legal/privacy.js).
import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../supabaseApi";
import { Button, SectionTitle } from "./ui";
import { formatDate, friendlyError } from "./format";

const plural = (n, word) => `${n.toLocaleString("en-GB")} ${word}${n === 1 ? "" : "s"}`;

// "3 photo files deleted (2 of deleted accounts, 1 not used any more)."
export function cleanupSummary(result) {
  const gone = result.deleted.length;
  const ofAccounts = result.deleted.filter((f) => f.reason === "account_deleted").length;
  const parts = [];
  if (ofAccounts) parts.push(`${ofAccounts} of deleted accounts`);
  if (gone - ofAccounts) parts.push(`${gone - ofAccounts} not used any more`);
  let text = gone ? `${plural(gone, "photo file")} deleted (${parts.join(", ")}).` : result.failed ? "No photo files deleted." : "No photo files to delete.";
  if (result.failed) text += ` ${plural(result.failed, "file")} couldn't be deleted; the next clean-up tries again.`;
  return text;
}

// For AdminPanel: runs today's automatic clean-up once when the panel opens
// (quietly, with a toast only if it deleted something or failed partly),
// and gives Overview its state and the button's action.
export function usePhotoCleanup(showToast) {
  const [state, setState] = useState({ running: false, result: null, error: "", at: null, auto: false });
  const busy = useRef(false);
  const run = useCallback(async (auto) => {
    if (busy.current) return;
    busy.current = true;
    setState((s) => ({ ...s, running: true, error: "" }));
    try {
      const result = await api.adminCleanUpPhotoFiles({ auto });
      if (result) {
        setState({ running: false, result, error: "", at: Date.now(), auto });
        if (auto && (result.deleted.length || result.failed)) {
          showToast({ text: `Daily photo clean-up: ${cleanupSummary(result)}`, tone: result.failed ? "error" : undefined, duration: 8000 });
        }
      } else {
        setState((s) => ({ ...s, running: false }));
      }
    } catch (e) {
      // The automatic run says nothing if it couldn't start (the button
      // shows why). If it took today's turn and then failed, no admin runs
      // it again today: the panel says so, so someone presses the button.
      const failed = `The clean-up didn't finish: ${friendlyError(e)}`;
      setState((s) => ({ ...s, running: false, error: auto ? (e.claimed ? `Today's automatic run failed. ${failed}` : "") : e.missing ? e.message : failed }));
      if (auto && e.claimed) {
        showToast({ text: "Today's photo clean-up didn't finish. Run it again from Overview → Photo files.", tone: "error", duration: 8000 });
      }
    }
    busy.current = false;
  }, [showToast]);
  useEffect(() => { run(true); }, [run]);
  return { ...state, run: () => run(false) };
}

// Overview's "Photo files" section.
export function PhotoFilesSection({ cleanup }) {
  const { running, result, error, at, auto } = cleanup;
  return (
    <div style={{ marginTop: 40 }}>
      <SectionTitle>Photo files</SectionTitle>
      <p className="adm-muted adm-small" style={{ maxWidth: 640 }}>
        Files of deleted posts, listings, events and accounts, and replaced profile photos, are deleted here: once a day when an admin opens this panel, or now. A file that is still shown anywhere is never deleted.
      </p>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <Button icon="trash" onClick={cleanup.run} disabled={running}>{running ? "Cleaning up…" : "Clean up photo files"}</Button>
        {result && !running && (
          <span className="adm-small" role="status">
            {cleanupSummary(result)} <span className="adm-faint">{auto ? "Automatic, " : ""}{formatDate(at, { time: true })}</span>
          </span>
        )}
      </div>
      {error && <p className="adm-small" role="alert" style={{ color: "#D44C47", marginTop: 8 }}>{error}</p>}
      {result?.deleted.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary className="adm-small" style={{ cursor: "pointer" }}>Show the deleted files</summary>
          <ul className="adm-small adm-faint" style={{ margin: "8px 0 0", paddingLeft: 18, maxHeight: 240, overflow: "auto", overflowWrap: "anywhere" }}>
            {result.deleted.map((f) => (
              <li key={`${f.bucket}/${f.name}`}>{f.bucket}/{f.name} ({f.reason === "account_deleted" ? "account deleted" : "not used"})</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
