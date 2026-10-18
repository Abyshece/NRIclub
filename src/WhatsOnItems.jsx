import { INK, MUTED, SAFFRON_TEXT } from "./PublicShell";
import { dayParts, whenText, placeText, safeUrl, isOnNow, todayInGermany } from "./content/whatson";

// ============================================================================
// Pieces of the "What's on" listings (src/content/whatson.js), shared by the
// page (WhatsOnPage.jsx), the city pages and the members' Events.
// ============================================================================

// The day as a small calendar leaf. Hidden from screen readers: the card says
// the date in words.
export function DateBadge({ iso, compact = false }) {
  const p = dayParts(iso);
  return (
    <div aria-hidden="true" style={{ width: compact ? 48 : 58, flexShrink: 0, alignSelf: "flex-start", borderRadius: compact ? 10 : 12, border: "1px solid #E6E4DF", background: "#fff", textAlign: "center", overflow: "hidden", fontVariantNumeric: "tabular-nums" }}>
      <div style={{ background: "#FFF3E6", color: SAFFRON_TEXT, fontSize: compact ? 10 : 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: compact ? "3px 0" : "4px 0" }}>{p.month}</div>
      <div style={{ fontSize: compact ? 18 : 24, fontWeight: 800, lineHeight: 1.1, color: INK, paddingTop: compact ? 3 : 5, letterSpacing: "-0.02em" }}>{p.day}</div>
      <div style={{ fontSize: compact ? 10 : 11, color: MUTED, paddingBottom: compact ? 4 : 6 }}>{p.weekday}</div>
    </div>
  );
}

const ExternalIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

// The link to the organiser's page: opens in a new tab, passes on no
// ranking ("nofollow ugc": we list it, we don't vouch for it).
export function DetailsLink({ event, style, children = "Details and tickets" }) {
  const href = safeUrl(event.url);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener nofollow ugc" style={{ display: "inline-flex", alignItems: "center", gap: 6, ...style }}>
      {children}<span className="nc-sr-only"> for {event.title}, on the organiser's site (opens in a new tab)</span> <ExternalIcon />
    </a>
  );
}

// One event in a short list (the city pages, the members' Events): the day,
// the title (a link to its place on /whats-on when `href` is given), when
// and where, who runs it, and the link to the organiser's page.
export function CompactEvent({ event: e, href, Title = "h3", font = "inherit", id, highlighted = false }) {
  const meta = { fontSize: 13, color: MUTED, margin: "2px 0 0", lineHeight: 1.5, overflowWrap: "anywhere" };
  return (
    <li id={id} style={{ display: "flex", gap: 12, padding: highlighted ? "14px 10px" : "14px 0", margin: highlighted ? "0 -10px" : 0, borderRadius: highlighted ? 10 : 0, background: highlighted ? "#FFF6EC" : "transparent", borderTop: "1px solid #F0EFED", fontFamily: font }}>
      <DateBadge iso={isOnNow(e, todayInGermany()) ? todayInGermany() : e.start} compact />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Title style={{ fontSize: 15, fontWeight: 650, lineHeight: 1.35, margin: 0, color: INK, display: "block", overflowWrap: "anywhere" }}>
          {href ? <a href={href} style={{ color: INK }}>{e.title}</a> : e.title}
        </Title>
        <p style={meta}><time dateTime={e.start}>{whenText(e)}</time> · {placeText(e)}</p>
        <p style={meta}>Organised by {e.organiser}{e.price ? ` · ${e.price}` : ""}</p>
        <DetailsLink event={e} style={{ fontSize: 13, fontWeight: 600, color: INK, padding: "8px 0 0", minHeight: 32 }} />
      </div>
    </li>
  );
}
