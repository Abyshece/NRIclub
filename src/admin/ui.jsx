// Shared building blocks for the admin panel: icons, avatar, pills, buttons,
// page header, empty state, dialog and toast, plus the panel's stylesheet.
import { useEffect, useRef, useState } from "react";

const PATHS = {
  shieldCheck: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "M9 12l2 2 4-4"],
  users: ["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2", "M9 7a4 4 0 100 8 4 4 0 000-8z", "M23 21v-2a4 4 0 00-3-3.87", "M16 3.13a4 4 0 010 7.75"],
  globe: ["M12 2a10 10 0 100 20 10 10 0 000-20z", "M2 12h20", "M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"],
  flag: ["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22v-7"],
  bug: ["M8 2l1.88 1.88", "M14.12 3.88L16 2", "M9 7.13v-1a3 3 0 016 0v1", "M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 014-4h4a4 4 0 014 4v3c0 3.3-2.7 6-6 6z", "M12 20v-9", "M6.53 9C4.6 8.8 3 7.1 3 5", "M6 13H2", "M3 21c0-2.1 1.7-3.9 3.8-4", "M20.97 5c0 2.1-1.6 3.8-3.5 4", "M22 13h-4", "M17.2 17c2.1.1 3.8 1.9 3.8 4"],
  chart: ["M3 3v18h18", "M7 16v-4", "M12 16V8", "M17 16v-7"],
  logout: ["M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  search: ["M11 19a8 8 0 100-16 8 8 0 000 16z", "M21 21l-4.35-4.35"],
  x: ["M18 6L6 18", "M6 6l12 12"],
  check: ["M20 6L9 17l-5-5"],
  chevronUp: ["M18 15l-6-6-6 6"],
  chevronDown: ["M6 9l6 6 6-6"],
  chevronsRight: ["M13 17l5-5-5-5", "M6 17l5-5-5-5"],
  external: ["M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6", "M15 3h6v6", "M10 14L21 3"],
  mail: ["M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z", "M22 6l-10 7L2 6"],
  mapPin: ["M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z", "M12 7a3 3 0 100 6 3 3 0 000-6z"],
  briefcase: ["M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z", "M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"],
  home: ["M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z", "M9 22V12h6v10"],
  calendar: ["M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z", "M16 2v4", "M8 2v4", "M3 10h18"],
  clock: ["M12 22a10 10 0 100-20 10 10 0 000 20z", "M12 6v6l4 2"],
  send: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4z"],
  alert: ["M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z", "M12 9v4", "M12 17h.01"],
  info: ["M12 22a10 10 0 100-20 10 10 0 000 20z", "M12 16v-4", "M12 8h.01"],
  linkedin: ["M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z", "M2 9h4v12H2z", "M4 2a2 2 0 100 4 2 2 0 000-4z"],
  note: ["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8"],
  copy: ["M20 9h-9a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2z", "M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"],
  user: ["M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2", "M12 3a4 4 0 100 8 4 4 0 000-8z"],
  ban: ["M12 22a10 10 0 100-20 10 10 0 000 20z", "M4.93 4.93l14.14 14.14"],
  undo: ["M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8", "M3 3v5h5"],
  checkCircle: ["M22 11.08V12a10 10 0 11-5.93-9.14", "M22 4L12 14.01l-3-3"],
  message: ["M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"],
  trash: ["M3 6h18", "M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"],
  eye: ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "M12 9a3 3 0 100 6 3 3 0 000-6z"],
  lock: ["M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z", "M7 11V7a5 5 0 0110 0v4"],
  star: ["M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"],
};

export function Icon({ name, size = 16, strokeWidth = 1.7, style, className }) {
  const d = PATHS[name] || [];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" style={style} className={className} aria-hidden="true" focusable="false">
      {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

const AVATAR_COLORS = ["#E8D5B7", "#B8C9A3", "#A3B8C9", "#C9A3B8", "#C9B8A3", "#A3C9B8"];

export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const s = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return s.toUpperCase();
}

export function Avatar({ name, url, size = 28 }) {
  // Remember which url failed, so a new url (e.g. the next member in the peek) gets a fresh try.
  const [brokenUrl, setBrokenUrl] = useState(null);
  const color = AVATAR_COLORS[String(name || "").length % AVATAR_COLORS.length];
  return (
    <span className="adm-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: color }} aria-hidden="true">
      {url && url !== brokenUrl ? <img src={url} alt="" onError={() => setBrokenUrl(url)} /> : initials(name)}
    </span>
  );
}

const TONES = {
  gray: ["#F1F1EF", "#787774"],
  orange: ["#FAEBDD", "#D9730D"],
  yellow: ["#FBF3DB", "#CB912F"],
  green: ["#DDEDEA", "#0F7B6C"],
  red: ["#FBE4E4", "#E03E3E"],
  blue: ["#DDEBF1", "#0B6E99"],
};

export function Pill({ tone = "gray", dot = true, children, title }) {
  const [bg, fg] = TONES[tone] || TONES.gray;
  return (
    <span className="adm-pill" style={{ background: bg, color: fg }} title={title}>
      {dot && <span className="adm-pill-dot" style={{ background: fg }} />}
      {children}
    </span>
  );
}

export function Kbd({ children }) {
  return <kbd className="adm-kbd">{children}</kbd>;
}

export function Button({ variant = "secondary", size = "md", icon, kbd, children, className = "", type = "button", ...rest }) {
  return (
    <button type={type} className={`adm-btn adm-btn-${variant} adm-btn-${size} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 15} />}
      {children != null && <span>{children}</span>}
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}

export function PageHeader({ title, description, children }) {
  return (
    <header className="adm-head">
      <h1 className="adm-title">{title}</h1>
      {description && <p className="adm-desc">{description}</p>}
      {children}
    </header>
  );
}

export function SectionTitle({ children, count, tone }) {
  return (
    <h2 className="adm-section-title">
      <span>{children}</span>
      {count != null && <span className={`adm-section-count${tone ? ` adm-tone-${tone}` : ""}`}>{count}</span>}
    </h2>
  );
}

export function EmptyState({ icon = "checkCircle", title, children }) {
  return (
    <div className="adm-empty">
      <div className="adm-empty-icon"><Icon name={icon} size={20} /></div>
      <div className="adm-empty-title">{title}</div>
      {children && <div className="adm-empty-text">{children}</div>}
    </div>
  );
}

export function ErrorNote({ children, onRetry }) {
  return (
    <div className="adm-error" role="alert">
      <Icon name="alert" size={15} />
      <span style={{ flex: 1 }}>{children}</span>
      {onRetry && <button type="button" className="adm-link" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }) {
  return (
    <div className="adm-skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="adm-skeleton-row">
          <span className="adm-skel adm-skel-circle" />
          <span className="adm-skel" style={{ width: `${28 + ((i * 17) % 20)}%` }} />
          <span className="adm-skel" style={{ width: "18%", marginLeft: "auto" }} />
        </div>
      ))}
    </div>
  );
}

// A small modal for confirmations. Cancel has the focus when it opens, so
// Enter or a stray key never confirms something that can't be undone. Keys
// pressed inside it don't reach the panel's keyboard shortcuts. wide: for a
// form (e.g. the reasons for a moderation decision); confirmDisabled keeps
// the confirm button off until the form is complete.
export function ConfirmDialog({ title, children, confirmLabel = "Confirm", tone = "danger", busy = false, error = "", onConfirm, onCancel, wide = false, confirmDisabled = false }) {
  const cancelRef = useRef(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  return (
    <div className={`adm-overlay${wide ? " adm-overlay-top" : ""}`} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className={`adm-dialog${wide ? " adm-dialog-wide" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="adm-dialog-title"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape" && !busy) { e.preventDefault(); onCancel(); }
        }}>
        <h3 id="adm-dialog-title" className="adm-dialog-title">{title}</h3>
        {children && <div className="adm-dialog-text">{children}</div>}
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="adm-dialog-actions">
          <button type="button" ref={cancelRef} className="adm-btn adm-btn-secondary adm-btn-md" onClick={onCancel} disabled={busy}><span>Cancel</span></button>
          <Button variant={tone === "danger" ? "danger-solid" : "primary"} onClick={onConfirm} disabled={busy || confirmDisabled}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Toast({ toast, onUndo, onClose }) {
  if (!toast) return null;
  return (
    <div className={`adm-toast${toast.tone === "error" ? " adm-toast-error" : ""}`} role="status" aria-live="polite" key={toast.id}>
      {toast.tone === "error" ? <Icon name="alert" size={15} /> : toast.icon ? <Icon name={toast.icon} size={15} /> : null}
      <span className="adm-toast-text">{toast.text}</span>
      {toast.undo && !toast.busy && (
        <>
          <span className="adm-toast-sep" aria-hidden="true">·</span>
          <button type="button" className="adm-toast-undo" onClick={onUndo}>Undo</button>
        </>
      )}
      <button type="button" className="adm-toast-close" onClick={onClose} aria-label="Dismiss"><Icon name="x" size={14} /></button>
    </div>
  );
}

// Inter is served by the site itself (no Google Fonts request).
export const ADMIN_CSS = `
.adm { --text:#37352F; --muted:#787774; --faint:#9B9A97; --line:#EDEDEB; --line-strong:#E0E0DE; --side:#F7F7F5; --hover:rgba(55,53,47,0.08); --row-hover:rgba(55,53,47,0.035); --select:rgba(91,156,255,0.12);
  display:flex; min-height:100vh; background:#fff; color:var(--text);
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size:14px; line-height:1.5; -webkit-font-smoothing:antialiased; }
body { margin:0; background:#fff; }
.adm *, .adm *::before, .adm *::after { box-sizing:border-box; }
:where(.adm) :where(h1, h2, h3, p, blockquote) { margin:0; }
:where(.adm) :where(button, input, textarea) { font-family:inherit; font-size:inherit; color:inherit; }
:where(.adm) a { color:inherit; }
:where(.adm) :focus-visible { outline:2px solid rgba(91,156,255,0.7); outline-offset:1px; }
.adm-peek:focus, .adm-peek:focus-visible { outline:none; }

/* Sidebar */
.adm-side { width:240px; flex-shrink:0; background:var(--side); border-right:1px solid var(--line); position:sticky; top:0; height:100vh; display:flex; flex-direction:column; padding:10px 8px 12px; }
.adm-ws { display:flex; align-items:center; gap:8px; padding:6px 10px 6px; margin-bottom:10px; font-weight:600; font-size:14px; min-height:34px; }
.adm-ws-name { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.adm-side .adm-ws-signout { display:none; }
.adm-nav { display:flex; flex-direction:column; gap:1px; }
.adm-nav-item { display:flex; align-items:center; gap:9px; width:100%; min-height:30px; padding:4px 10px; border:0; border-radius:6px; background:transparent; color:rgba(55,53,47,0.85); font-size:14px; cursor:pointer; text-align:left; white-space:nowrap; }
.adm-nav-item svg { flex-shrink:0; color:rgba(55,53,47,0.6); }
.adm-nav-item:hover { background:var(--hover); }
.adm-nav-item[aria-current="page"] { background:var(--hover); color:var(--text); font-weight:600; }
.adm-nav-item[aria-current="page"] svg { color:var(--text); }
.adm-nav-count { margin-left:auto; padding-left:8px; font-size:12px; color:var(--faint); font-weight:400; font-variant-numeric:tabular-nums; }
.adm-nav-count.hot { color:#D9730D; background:#FAEBDD; border-radius:10px; padding:0 7px; font-weight:600; line-height:18px; }
.adm-nav-divider { height:1px; background:var(--line); margin:8px 10px; }
.adm-side-foot { margin-top:auto; padding-top:8px; }
.adm-side-user { padding:2px 10px 6px; font-size:12px; color:var(--faint); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* Page */
.adm-main { flex:1; min-width:0; }
.adm-page { max-width:900px; margin:0 auto; padding:72px 64px 120px; }
.adm-head { margin-bottom:28px; }
.adm-title { font-size:32px; font-weight:700; line-height:1.2; letter-spacing:-0.015em; }
.adm-desc { color:var(--muted); font-size:14px; margin-top:6px; }
.adm-section-title { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:600; color:var(--text); margin:32px 0 6px; padding-bottom:6px; border-bottom:1px solid var(--line); }
.adm-head + .adm-section-title, .adm-head + section > .adm-section-title { margin-top:0; }
.adm-section-count { font-size:12px; color:var(--faint); font-weight:400; }
.adm-tone-orange { color:#D9730D; }
.adm-muted { color:var(--muted); }
.adm-faint { color:var(--faint); }
.adm-small { font-size:12px; }
.adm-link { background:none; border:0; padding:0; color:#0B6E99; cursor:pointer; text-decoration:underline; text-underline-offset:2px; font-size:inherit; }

/* Pills, kbd, avatar */
.adm-pill { display:inline-flex; align-items:center; gap:5px; height:20px; padding:0 8px; border-radius:10px; font-size:12px; font-weight:500; white-space:nowrap; line-height:1; }
.adm-pill-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
.adm-kbd { display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px; padding:0 4px; margin-left:2px; border-radius:4px; border:1px solid rgba(55,53,47,0.16); font:500 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color:var(--faint); background:transparent; }
.adm-avatar { display:inline-flex; align-items:center; justify-content:center; border-radius:50%; color:#37352F; font-weight:600; flex-shrink:0; overflow:hidden; position:relative; border:1px solid rgba(55,53,47,0.06); }
.adm-avatar img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }

/* Buttons */
.adm-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; height:32px; padding:0 12px; border-radius:6px; border:1px solid transparent; font-size:14px; font-weight:500; cursor:pointer; white-space:nowrap; transition:background .1s, border-color .1s; text-decoration:none; }
.adm-btn:disabled { opacity:.5; cursor:default; }
.adm-btn-sm { height:28px; padding:0 10px; font-size:13px; }
.adm-btn-primary { background:#37352F; color:#fff; }
.adm-btn-primary:hover:not(:disabled) { background:#2B2A26; }
.adm-btn-approve { background:#22A06B; color:#fff; }
.adm-btn-approve:hover:not(:disabled) { background:#1B8A5B; }
.adm-btn-approve .adm-kbd, .adm-btn-primary .adm-kbd, .adm-btn-danger-solid .adm-kbd { border-color:rgba(255,255,255,0.35); color:rgba(255,255,255,0.85); }
.adm-btn-secondary { background:#fff; color:var(--text); border-color:rgba(55,53,47,0.16); }
.adm-btn-secondary:hover:not(:disabled) { background:var(--row-hover); }
.adm-btn-danger { background:#fff; color:#E03E3E; border-color:rgba(224,62,62,0.3); }
.adm-btn-danger:hover:not(:disabled) { background:#FBE4E4; }
.adm-btn-danger-solid { background:#E03E3E; color:#fff; }
.adm-btn-danger-solid:hover:not(:disabled) { background:#C93434; }
.adm-btn-ghost { background:transparent; color:var(--muted); }
.adm-btn-ghost:hover:not(:disabled) { background:var(--hover); color:var(--text); }
.adm-btn-ghost-danger:hover:not(:disabled) { color:#E03E3E; }
.adm-sr { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
.adm-btn-icon { width:28px; height:28px; padding:0; }

/* Filter pills */
.adm-filters { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px; }
.adm-filter { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 11px; border-radius:14px; border:1px solid rgba(55,53,47,0.16); background:#fff; color:var(--muted); font-size:13px; cursor:pointer; white-space:nowrap; }
.adm-filter:hover { background:var(--row-hover); color:var(--text); }
.adm-filter[aria-pressed="true"] { background:#37352F; border-color:#37352F; color:#fff; }
.adm-filter-count { font-size:12px; opacity:.7; font-variant-numeric:tabular-nums; }

/* Toolbar + search */
.adm-toolbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
.adm-toolbar .adm-filters { margin-bottom:0; }
.adm-search { display:flex; align-items:center; gap:6px; height:32px; padding:0 10px; border-radius:6px; background:rgba(55,53,47,0.04); color:var(--faint); min-width:240px; flex:0 1 300px; }
.adm-search:focus-within { background:#fff; box-shadow:0 0 0 1px rgba(91,156,255,0.6), 0 0 0 3px rgba(91,156,255,0.15); }
.adm-search input { border:0; outline:0; background:transparent; flex:1; min-width:0; color:var(--text); height:100%; }
.adm-search input::placeholder { color:var(--faint); }

/* Lists */
.adm-list { border-top:1px solid var(--line); }
.adm-list-head { display:grid; align-items:center; gap:12px; padding:6px 8px; border-bottom:1px solid var(--line); font-size:12px; color:var(--faint); }
.adm-row { display:grid; align-items:center; gap:12px; padding:9px 8px; border-bottom:1px solid var(--line); cursor:pointer; position:relative; }
.adm-row:hover { background:var(--row-hover); }
.adm-row.is-selected { background:var(--select); }
.adm-row:focus-visible { outline:2px solid rgba(91,156,255,0.7); outline-offset:-2px; }
.adm-row-name { font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:8px; min-width:0; }
.adm-row-name > span:first-child { overflow:hidden; text-overflow:ellipsis; }
.adm-ellipsis { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }

.adm-vrow, .adm-vhead { grid-template-columns: 28px minmax(0,1.3fr) minmax(0,1.1fr) 84px 52px; }
.adm-vrow-time { text-align:right; font-variant-numeric:tabular-nums; color:var(--muted); font-size:13px; }
.adm-vrow-time.is-late { color:#D9730D; font-weight:600; }
.adm-icons { display:flex; gap:6px; align-items:center; }
.adm-ci { display:inline-flex; width:22px; height:22px; border-radius:5px; align-items:center; justify-content:center; }
.adm-ci-ok { color:#0F7B6C; background:#EEF6F4; }
.adm-ci-warn { color:#D9730D; background:#FBF0E6; }
.adm-ci-off { color:var(--faint); background:#F4F4F2; }

.adm-mrow, .adm-mhead { grid-template-columns: minmax(0,1.6fr) minmax(0,1.1fr) 104px 84px 92px 112px; }
.adm-mrow { cursor:default; }
.adm-mrow-actions { display:flex; gap:2px; justify-content:flex-end; }
.adm-mrow-email { font-size:12px; color:var(--faint); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:400; }
.adm-more { display:flex; justify-content:center; padding:12px 0; }

/* Generic item rows (communities, reports, bugs) */
.adm-item { display:flex; gap:16px; align-items:flex-start; padding:14px 8px; border-bottom:1px solid var(--line); }
.adm-item:hover { background:var(--row-hover); }
.adm-item-main { flex:1; min-width:0; }
.adm-item-title { font-weight:600; font-size:14px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.adm-item-text { color:var(--muted); margin-top:2px; overflow-wrap:anywhere; }
.adm-item-meta { color:var(--faint); font-size:12px; margin-top:6px; }
.adm-item-actions { display:flex; gap:6px; flex-shrink:0; align-items:center; }
.adm-preview { margin-top:10px; padding:10px 12px; background:#F7F7F5; border-radius:6px; font-size:13px; overflow-wrap:anywhere; }
.adm-preview-title { font-weight:600; color:var(--text); }
.adm-preview-text { color:var(--muted); margin-top:2px; }
.adm-preview img { display:block; max-width:100%; max-height:180px; border-radius:4px; margin-bottom:8px; object-fit:cover; }
.adm-simple-row { display:flex; align-items:center; gap:12px; padding:8px 8px; border-bottom:1px solid var(--line); }
.adm-simple-row:hover { background:var(--row-hover); }

/* Empty / error / skeleton */
.adm-empty { text-align:center; padding:64px 16px; color:var(--muted); }
.adm-empty-icon { width:44px; height:44px; border-radius:50%; background:#F1F1EF; color:var(--muted); display:inline-flex; align-items:center; justify-content:center; margin-bottom:12px; }
.adm-empty-title { font-size:16px; font-weight:600; color:var(--text); }
.adm-empty-text { margin-top:4px; font-size:14px; max-width:380px; margin-left:auto; margin-right:auto; }
.adm-error { display:flex; align-items:flex-start; gap:8px; padding:10px 12px; border-radius:6px; background:#FBE4E4; color:#B42318; font-size:13px; margin:0 0 14px; }
.adm-error svg { margin-top:2px; flex-shrink:0; }
.adm-skeleton-row { display:flex; align-items:center; gap:12px; padding:12px 8px; border-bottom:1px solid var(--line); }
.adm-skel { display:inline-block; height:10px; border-radius:5px; background:#EFEFED; animation:adm-pulse 1.4s ease-in-out infinite; }
.adm-skel-circle { width:24px; height:24px; border-radius:50%; flex-shrink:0; }
@keyframes adm-pulse { 0%,100% { opacity:1; } 50% { opacity:.55; } }

/* Peek */
.adm-peek { position:fixed; top:0; right:0; bottom:0; width:min(580px, calc(100vw - 240px)); background:#fff; z-index:40; display:flex; flex-direction:column;
  box-shadow: rgba(15,15,15,0.04) 0 0 0 1px, rgba(15,15,15,0.05) 0 3px 6px, rgba(15,15,15,0.1) 0 9px 24px; animation:adm-slide .14s ease-out; outline:none; }
@keyframes adm-slide { from { transform:translateX(16px); opacity:.6; } to { transform:none; opacity:1; } }
.adm-peek-bar { display:flex; align-items:center; gap:2px; height:44px; padding:0 10px; flex-shrink:0; }
.adm-peek-pos { font-size:12px; color:var(--faint); margin-left:6px; font-variant-numeric:tabular-nums; }
.adm-peek-hints { margin-left:auto; display:flex; align-items:center; gap:3px; font-size:12px; color:var(--faint); white-space:nowrap; }
.adm-peek-util { display:flex; align-items:center; flex-wrap:wrap; gap:4px 8px; margin-top:8px; margin-left:-8px; }
.adm-peek-body { flex:1; overflow-y:auto; padding:12px 40px 28px; }
.adm-peek-head { display:flex; align-items:center; gap:14px; margin-bottom:6px; }
.adm-peek-name { font-size:26px; font-weight:700; line-height:1.2; letter-spacing:-0.01em; overflow-wrap:anywhere; }
.adm-peek-pills { display:flex; gap:6px; flex-wrap:wrap; margin:10px 0 18px; }
.adm-hold { margin:-8px 0 18px; padding:10px 12px; background:#FBE4E4; color:#5D1715; border-radius:6px; font-size:13px; overflow-wrap:anywhere; }
.adm-hold-note { margin-top:4px; white-space:pre-wrap; }
.adm-props { display:grid; grid-template-columns:150px minmax(0,1fr); column-gap:8px; }
.adm-prop-label { display:flex; align-items:center; gap:8px; color:var(--muted); min-height:32px; }
.adm-prop-label svg { color:var(--faint); flex-shrink:0; }
.adm-prop-value { display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-height:32px; padding:4px 0; overflow-wrap:anywhere; }
.adm-verified-mark { display:inline-flex; align-items:center; gap:3px; font-size:12px; color:#0F7B6C; }
.adm-peek-section { margin-top:26px; }
.adm-peek-section-title { font-size:12px; font-weight:600; color:var(--faint); text-transform:uppercase; letter-spacing:.04em; margin-bottom:10px; }
.adm-linkedin { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.adm-linkedin-url { font-size:12px; color:var(--faint); overflow-wrap:anywhere; }
.adm-quote { margin:0; border-left:3px solid #37352F; padding:2px 0 2px 14px; font-size:15px; line-height:1.55; white-space:pre-wrap; overflow-wrap:anywhere; }
.adm-quote-meta { margin-top:10px; font-size:13px; color:var(--muted); display:flex; gap:6px; align-items:flex-start; }
.adm-checks { list-style:none; padding:0; margin:0; }
.adm-check { display:flex; gap:10px; align-items:flex-start; padding:4px 0; }
.adm-check-mark { width:18px; height:18px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:1px; font-size:11px; font-weight:700; }
.adm-check-ok { background:#DDEDEA; color:#0F7B6C; }
.adm-check-warn { background:#FAEBDD; color:#D9730D; }
.adm-check-info { background:#F1F1EF; color:#787774; }
.adm-check-detail { color:var(--faint); font-size:12px; margin-left:6px; }
.adm-callout { margin-top:12px; padding:10px 12px; background:#F7F7F5; border-radius:6px; font-size:13px; }
.adm-callout-label { font-size:12px; color:var(--faint); margin-bottom:2px; }
.adm-peek-foot { flex-shrink:0; border-top:1px solid var(--line); padding:12px 40px 14px; background:#fff; }
.adm-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.adm-composer { display:flex; flex-direction:column; gap:10px; }
.adm-composer-title { font-weight:600; display:flex; align-items:center; gap:8px; }
.adm-chips { display:flex; flex-wrap:wrap; gap:6px; }
.adm-chip { border:1px solid rgba(55,53,47,0.16); background:#fff; border-radius:12px; padding:3px 10px; font-size:12px; line-height:1.4; color:var(--muted); cursor:pointer; text-align:left; }
.adm-chip:hover { background:var(--row-hover); color:var(--text); }
.adm-chip.is-on { background:#DDEBF1; border-color:#DDEBF1; color:#0B6E99; }
.adm-textarea, .adm-input { width:100%; border:1px solid rgba(55,53,47,0.16); border-radius:6px; padding:8px 10px; outline:0; resize:vertical; background:#fff; line-height:1.5; }
.adm-textarea { min-height:76px; }
.adm-textarea:focus, .adm-input:focus { border-color:rgba(91,156,255,0.8); box-shadow:0 0 0 3px rgba(91,156,255,0.15); }
.adm-field-label { font-size:12px; color:var(--muted); margin-bottom:4px; display:block; }
.adm-help { font-size:12px; color:var(--faint); }

/* Dialog + toast */
.adm-overlay { position:fixed; inset:0; background:rgba(15,15,15,0.35); z-index:70; display:flex; align-items:center; justify-content:center; padding:16px; }
.adm-dialog { background:#fff; border-radius:10px; width:100%; max-width:400px; padding:20px; box-shadow:rgba(15,15,15,0.1) 0 5px 10px, rgba(15,15,15,0.2) 0 15px 40px; }
.adm-dialog-title { font-size:16px; font-weight:600; margin-bottom:6px; }
.adm-dialog-text { color:var(--muted); margin-bottom:16px; }
.adm-dialog-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:4px; flex-wrap:wrap; }
.adm-overlay-top { align-items:flex-start; overflow-y:auto; }
.adm-dialog-wide { max-width:540px; margin:auto 0; }
.adm-dialog-wide .adm-dialog-text { color:var(--text); }
.adm-form { display:flex; flex-direction:column; gap:12px; margin-top:12px; }
.adm-radio-row { display:flex; gap:14px; flex-wrap:wrap; }
.adm-radio { display:inline-flex; align-items:center; gap:6px; cursor:pointer; color:var(--text); }
.adm-select { width:100%; border:1px solid rgba(55,53,47,0.16); border-radius:6px; padding:7px 8px; background:#fff; font:inherit; color:var(--text); }
.adm-statement { padding:10px 12px; background:#F7F7F5; border-radius:6px; font-size:13px; line-height:1.55; color:var(--text); white-space:pre-wrap; overflow-wrap:anywhere; }
.adm-warn-note { padding:8px 10px; border-radius:6px; background:#FBF0E6; color:#7A3E06; font-size:13px; line-height:1.5; }
.adm-safety { margin-top:10px; padding:10px 12px; border-radius:6px; background:#FBE4E4; color:#5D1715; font-size:13px; line-height:1.5; }
.adm-safety ol { margin:6px 0 0; padding-left:18px; }
.adm-history { list-style:none; padding:0; margin:0; }
.adm-history li { padding:8px 0; border-bottom:1px solid var(--line); font-size:13px; line-height:1.5; }
.adm-history li:last-child { border-bottom:0; }
.adm-toast { position:fixed; left:calc(240px + 32px); bottom:28px; z-index:80; display:flex; align-items:center; gap:10px; max-width:min(520px, calc(100vw - 32px)); padding:10px 10px 10px 14px; border-radius:8px; background:#37352F; color:#fff; font-size:14px; box-shadow:0 6px 24px rgba(15,15,15,0.22); animation:adm-rise .16s ease-out; }
.adm-toast-error { background:#B42318; }
.adm-toast-text { min-width:0; }
.adm-toast-sep { opacity:.5; }
.adm-toast-undo { background:none; border:0; color:#9CC3FF; font-weight:600; cursor:pointer; padding:2px 4px; border-radius:4px; }
.adm-toast-undo:hover { background:rgba(255,255,255,0.1); }
.adm-toast-close { margin-left:auto; background:none; border:0; color:rgba(255,255,255,0.6); cursor:pointer; padding:2px; display:inline-flex; border-radius:4px; }
.adm-toast-close:hover { color:#fff; background:rgba(255,255,255,0.1); }
@keyframes adm-rise { from { transform:translateY(8px); opacity:0; } to { transform:none; opacity:1; } }

/* Overview */
.adm-stats { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:1px; background:var(--line); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
.adm-stat { background:#fff; padding:16px 18px; text-align:left; border:0; cursor:default; }
button.adm-stat { cursor:pointer; }
button.adm-stat:hover { background:#FBFBFA; }
.adm-stat-label { font-size:13px; color:var(--muted); }
.adm-stat-value { font-size:28px; font-weight:600; line-height:1.25; margin-top:4px; font-variant-numeric:tabular-nums; }
.adm-activity { display:flex; flex-wrap:wrap; gap:6px 22px; margin-top:14px; color:var(--muted); font-size:13px; }
.adm-activity b { color:var(--text); font-weight:600; font-variant-numeric:tabular-nums; }
.adm-online-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:#22A06B; margin-right:6px; vertical-align:1px; }
.adm-chart { display:flex; align-items:flex-end; gap:8px; height:150px; padding-top:18px; }
.adm-bar-col { flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; gap:6px; }
.adm-bar-val { font-size:11px; color:var(--muted); font-variant-numeric:tabular-nums; }
.adm-bar { width:100%; max-width:36px; background:#5B9CFF; border-radius:4px 4px 0 0; min-height:2px; }
.adm-bar.is-zero { background:#EDEDEB; }
.adm-bar-label { font-size:11px; color:var(--faint); white-space:nowrap; }

@media (max-width: 1100px) {
  .adm-page { padding:56px 40px 120px; }
}
@media (max-width: 767px) {
  .adm { flex-direction:column; }
  .adm-side { width:100%; height:auto; position:sticky; top:0; z-index:30; border-right:0; border-bottom:1px solid var(--line); padding:6px 0 0; }
  .adm-ws { margin:0; padding:4px 8px 2px 16px; }
  .adm-side .adm-ws-signout { display:inline-flex; }
  .adm-nav { flex-direction:row; overflow-x:auto; gap:2px; padding:4px 12px 8px; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
  .adm-nav::-webkit-scrollbar { display:none; }
  .adm-nav-item { width:auto; flex-shrink:0; padding:4px 10px; font-size:13px; gap:7px; }
  .adm-nav-divider, .adm-side-foot { display:none; }
  .adm-page { padding:24px 16px 110px; }
  .adm-head { margin-bottom:18px; }
  .adm-title { font-size:26px; }
  .adm-filters { flex-wrap:nowrap; overflow-x:auto; margin-left:-16px; margin-right:-16px; padding:0 16px 2px; scrollbar-width:none; }
  .adm-filters::-webkit-scrollbar { display:none; }
  .adm-search { min-width:0; flex:1 1 100%; }
  .adm-list-head { display:none; }
  .adm-vrow { grid-template-columns:32px minmax(0,1fr) auto; grid-template-areas:"av name time" "av place icons"; row-gap:3px; column-gap:10px; padding:10px 4px; }
  .adm-vrow > .adm-avatar { grid-area:av; align-self:start; margin-top:2px; }
  .adm-vrow > .adm-vrow-name { grid-area:name; }
  .adm-vrow > .adm-vrow-place { grid-area:place; font-size:13px; }
  .adm-vrow > .adm-vrow-icons { grid-area:icons; justify-content:flex-end; }
  .adm-vrow > .adm-vrow-time { grid-area:time; }
  .adm-mrow { grid-template-columns:minmax(0,1fr) auto; grid-template-areas:"name actions" "meta actions"; row-gap:4px; padding:10px 4px; }
  .adm-mrow > .adm-mcell-name { grid-area:name; }
  .adm-mrow > .adm-mcell-meta { grid-area:meta; display:flex !important; gap:6px; flex-wrap:wrap; align-items:center; }
  .adm-mrow > .adm-mcell-loc, .adm-mrow > .adm-mcell-ver, .adm-mrow > .adm-mcell-acc, .adm-mrow > .adm-mcell-joined, .adm-mrow-held { display:none; }
  .adm-mrow > .adm-mrow-actions { grid-area:actions; }
  .adm-item { flex-direction:column; gap:10px; padding:14px 4px; }
  .adm-item-actions { width:100%; }
  .adm-peek { width:100%; left:0; animation:none; }
  .adm-peek-hints { display:none; }
  .adm-peek-body { padding:8px 16px 24px; }
  .adm-peek-foot { padding:10px 16px calc(12px + env(safe-area-inset-bottom)); }
  .adm-props { grid-template-columns:118px minmax(0,1fr); }
  .adm-peek-name { font-size:22px; }
  .adm-kbd { display:none; }
  .adm-toast { left:16px; right:16px; bottom:16px; max-width:none; }
  .adm:has(.adm-peek) .adm-toast { bottom:84px; }
  .adm-stats { grid-template-columns:repeat(2, minmax(0,1fr)); }
  .adm-stat-value { font-size:24px; }
  .adm-chart { gap:4px; }
  .adm-bar-val { font-size:10px; }
}
`;
