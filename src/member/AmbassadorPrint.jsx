import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import LogoMark from "../LogoMark";
import { posterLine, cityJoinUrl, cityJoinText, AMBASSADOR_QUESTIONS } from "../content/ambassador";

// ============================================================================
// THE AMBASSADOR'S PRINT TOOLKIT: an A4 poster and an A4 sheet of 8 stickers
// for the city, with the NRIClub mark, a short line and a QR code to the
// city's page (nriclub.app/city/<city>?ref=ambassador). The QR code is drawn
// here, in the browser, with the qrcode package (loaded only when this opens):
// nothing comes from other sites, and the image is an inline SVG (a data:
// address, which the site's Content-Security-Policy allows for images).
// kind: "poster" | "stickers". Shown over the whole page; Print uses the
// browser's print dialog, which prints only the sheet (A4, no margins).
// ============================================================================

const font = "'DM Sans', sans-serif";
const INK = "#111111";
const STICKERS = 8;

// The QR code for a web address, as a data: address of an SVG image (null
// while it's drawn, "error" if it couldn't be).
function useQrCode(url) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    import("qrcode")
      .then((m) => (m.default || m).toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: INK, light: "#FFFFFF" } }))
      .then((svg) => { if (alive) setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`); })
      .catch(() => { if (alive) setSrc("error"); });
    return () => { alive = false; };
  }, [url]);
  return src;
}

function Qr({ src, size, city }) {
  if (src === "error") return <p style={{ fontSize: "1em", color: "#B91C1C", margin: 0 }}>The QR code couldn't be drawn. Please close this and try again.</p>;
  if (!src) return <div role="status" style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.9em", color: "#6B6A67" }}>Drawing the QR code…</div>;
  return <img src={src} alt={`QR code: the NRIClub page for Indians in ${city}`} data-qr style={{ width: size, height: size, display: "block" }} />;
}

function Poster({ city, qr }) {
  return (
    <div className="amb-sheet" data-sheet="poster" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "3.5em 3em", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.7em" }}>
        <div style={{ width: "3.6em", height: "3.6em", border: `0.08em solid ${INK}`, borderRadius: "0.8em", overflow: "hidden" }}><LogoMark size="100%" /></div>
        <span style={{ fontSize: "2.2em", fontWeight: 800, letterSpacing: "-0.02em", color: INK }}>NRIClub</span>
      </div>
      <div>
        <h1 style={{ fontSize: "3.6em", lineHeight: 1.1, fontWeight: 800, color: INK, margin: "0 0 0.3em", overflowWrap: "anywhere" }}>Indians in {city}?</h1>
        <p style={{ fontSize: "2em", fontWeight: 600, color: INK, margin: 0 }}>Join your city's group.</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.8em" }}>
        <Qr src={qr} size="20em" city={city} />
        <p style={{ fontSize: "1.5em", fontWeight: 700, color: INK, margin: 0, overflowWrap: "anywhere" }}>{cityJoinText(city)}</p>
        <p style={{ fontSize: "1.1em", color: "#37352F", margin: 0 }}>Scan the code to join. Free; our team checks every member.</p>
      </div>
      <p style={{ fontSize: "1em", color: "#5F5E5B", margin: 0 }}>{AMBASSADOR_QUESTIONS}</p>
    </div>
  );
}

function Stickers({ city, qr }) {
  return (
    <div className="amb-sheet" data-sheet="stickers" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: `repeat(${STICKERS / 2}, 1fr)`, gap: "1em", padding: "2em" }}>
      {Array.from({ length: STICKERS }, (_, i) => (
        <div key={i} style={{ border: "0.08em dashed #9B9A97", borderRadius: "1em", display: "flex", alignItems: "center", gap: "1em", padding: "1em", minWidth: 0 }}>
          <Qr src={qr} size="8em" city={city} />
          <div style={{ minWidth: 0, textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4em", marginBottom: "0.5em" }}>
              <div style={{ width: "1.8em", height: "1.8em", border: `0.06em solid ${INK}`, borderRadius: "0.4em", overflow: "hidden", flexShrink: 0 }}><LogoMark size="100%" /></div>
              <span style={{ fontSize: "1.2em", fontWeight: 800, color: INK }}>NRIClub</span>
            </div>
            <p style={{ fontSize: "1.15em", fontWeight: 700, lineHeight: 1.25, color: INK, margin: "0 0 0.3em", overflowWrap: "anywhere" }}>{posterLine(city)}</p>
            <p style={{ fontSize: "0.85em", color: "#37352F", margin: 0, overflowWrap: "anywhere" }}>{cityJoinText(city)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AmbassadorPrint({ city, kind, onClose }) {
  const qr = useQrCode(cityJoinUrl(city));
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const title = kind === "poster" ? "Poster (A4)" : "Stickers (A4 sheet of 8)";
  return createPortal(
    <div className="amb-print" role="dialog" aria-modal="true" aria-label={title}>
      <style>{`
        .amb-print { position: fixed; inset: 0; z-index: 80; background: #EDEDEB; overflow-y: auto; overflow-x: hidden; font-family: ${font}; }
        .amb-print-bar { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 16px; background: #fff; border-bottom: 1px solid #E0E0DE; }
        .amb-sheet { box-sizing: border-box; width: min(210mm, calc(100vw - 32px)); aspect-ratio: 210 / 297; margin: 16px auto 32px;
          background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,0.12); font-size: calc(min(210mm, 100vw - 32px) / 50); overflow: hidden; }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { background: #fff !important; }
          body > *:not(.amb-print) { display: none !important; }
          .amb-print { position: static; inset: auto; overflow: visible; background: #fff; }
          .amb-print-bar { display: none !important; }
          .amb-sheet { width: 210mm; height: 296mm; aspect-ratio: auto; margin: 0; box-shadow: none; font-size: 4.2mm; }
        }
      `}</style>
      <div className="amb-print-bar">
        <strong style={{ fontSize: 14, color: "#37352F", marginRight: "auto" }}>{title} · Indians in {city}</strong>
        <button type="button" onClick={() => window.print()} disabled={!qr || qr === "error"}
          style={{ padding: "8px 16px", minHeight: 40, borderRadius: 8, border: "none", background: "#37352F", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, opacity: qr && qr !== "error" ? 1 : 0.5 }}>Print</button>
        <button type="button" ref={closeRef} onClick={onClose}
          style={{ padding: "8px 16px", minHeight: 40, borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", color: "#37352F", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Close</button>
      </div>
      {kind === "poster" ? <Poster city={city} qr={qr} /> : <Stickers city={city} qr={qr} />}
    </div>,
    document.body,
  );
}
