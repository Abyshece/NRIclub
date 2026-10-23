import { useEffect, useRef, useState } from "react";
import { INK, MUTED, SAFFRON, GREEN, NAVY, SAFFRON_TEXT, GREEN_TEXT, primaryBtn } from "./PublicShell";
import { MISSION } from "./content/home";

// ============================================================================
// OUR MISSION (homepage, #mission): why NRIClub exists, the four goals, and
// where we're going (now, next, the goal) as a line that fills in once the
// section comes into view (at once for people who ask for less motion).
// Texts: MISSION in src/content/home.js.
// ============================================================================

const ICONS = [
  // people joined
  ["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2", "M9 11a4 4 0 100-8 4 4 0 000 8z", "M23 21v-2a4 4 0 00-3-3.87", "M16 3.13a4 4 0 010 7.75"],
  // shield with tick
  ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "M9 12l2 2 4-4"],
  // open book
  ["M2 4h7a3 3 0 013 3v13a2 2 0 00-2-2H2z", "M22 4h-7a3 3 0 00-3 3v13a2 2 0 012-2h8z"],
  // hands / heart
  ["M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 000-7.8z"],
];
const COLORS = [SAFFRON, GREEN, NAVY, SAFFRON];

const Icon = ({ paths, color }) => (
  <div aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color, background: `${color}14`, flexShrink: 0 }}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  </div>
);

export default function MissionSection({ onJoin, onAmbassador }) {
  const path = useRef(null);
  const [go, setGo] = useState(false);
  useEffect(() => {
    const el = path.current;
    if (!el || typeof IntersectionObserver === "undefined") { setGo(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setGo(true); io.disconnect(); }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="mission" aria-labelledby="mission-title">
      <style>{`
        .ms-wrap { width: 100%; max-width: 1100px; margin: 0 auto; padding: 64px 24px 56px; box-sizing: border-box; }
        .ms-goals { list-style: none; margin: 36px auto 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; max-width: 940px; }
        .ms-goal { display: flex; gap: 14px; align-items: flex-start; padding: 20px; border-radius: 14px; border: 1px solid #ECEBE8; background: #fff; }
        .ms-path { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); position: relative; }
        .ms-path::before { content: ""; position: absolute; left: 16.66%; right: 16.66%; top: 13px; height: 4px; border-radius: 2px; background: #E6E4DF; }
        .ms-fill { position: absolute; left: 16.66%; top: 13px; height: 4px; border-radius: 2px; width: 0; background: linear-gradient(90deg, ${SAFFRON}, ${GREEN}); z-index: 1; transition: width 1.6s cubic-bezier(.3,.7,.2,1) 0.2s; }
        .ms-go .ms-fill { width: 66.68%; }
        .ms-step { text-align: center; padding: 0 10px; position: relative; }
        .ms-dot { width: 30px; height: 30px; border-radius: 50%; margin: 0 auto 12px; box-sizing: border-box; border: 4px solid #E6E4DF; background: #fff; position: relative; z-index: 2; transition: border-color 0.4s ease, background 0.4s ease; }
        .ms-go .ms-step:nth-child(1) .ms-dot { border-color: ${SAFFRON}; background: ${SAFFRON}; transition-delay: 0.2s; }
        .ms-go .ms-step:nth-child(2) .ms-dot { border-color: #8DB86F; transition-delay: 1s; }
        .ms-go .ms-step:nth-child(3) .ms-dot { border-color: ${GREEN}; transition-delay: 1.7s; }
        .ms-now { display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; color: #fff; background: ${SAFFRON_TEXT}; vertical-align: 2px; }
        @media (max-width: 760px) {
          .ms-goals { grid-template-columns: 1fr; }
          .ms-path { grid-template-columns: 1fr; gap: 18px; }
          .ms-path::before, .ms-fill { left: 13px; right: auto; top: 15px; bottom: 15px; width: 4px; height: auto; }
          .ms-fill { height: 0; background: linear-gradient(180deg, ${SAFFRON}, ${GREEN}); transition: height 1.6s cubic-bezier(.3,.7,.2,1) 0.2s; }
          .ms-go .ms-fill { width: 4px; height: calc(100% - 30px); }
          .ms-step { display: grid; grid-template-columns: 30px 1fr; gap: 14px; text-align: left; padding: 0; }
          .ms-dot { margin: 0; }
        }
        @media (max-width: 640px) { .ms-wrap { padding: 48px 16px 40px; } }
        @media (prefers-reduced-motion: reduce) { .ms-fill, .ms-dot { transition: none !important; } }
      `}</style>
      <div className="ms-wrap">
        <div style={{ textAlign: "center", maxWidth: 760, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: GREEN_TEXT, marginBottom: 12 }}>Our mission</div>
          <h2 id="mission-title" style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.12, margin: "0 0 14px" }}>{MISSION.title}</h2>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: MUTED, margin: 0 }}>{MISSION.lead}</p>
        </div>

        <ul className="ms-goals">
          {MISSION.goals.map((g, i) => (
            <li key={g.title} className="ms-goal">
              <Icon paths={ICONS[i % ICONS.length]} color={COLORS[i % COLORS.length]} />
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", margin: "2px 0 4px" }}>{g.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: MUTED, margin: 0 }}>{g.text}</p>
              </div>
            </li>
          ))}
        </ul>

        <div style={{ maxWidth: 900, margin: "48px auto 0" }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED, textAlign: "center", margin: "0 0 20px" }}>Where we're going</h3>
          <div ref={path} className={go ? "ms-go" : ""} style={{ position: "relative" }}>
          <div className="ms-fill" aria-hidden="true" />
          <ol className="ms-path">
            {MISSION.path.map((s, i) => (
              <li key={s.when} className="ms-step">
                <div className="ms-dot" aria-hidden="true" />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>
                    {s.when}{i === 0 && <span className="ms-now">We're here</span>}
                  </div>
                  <p style={{ fontSize: 14.5, lineHeight: 1.55, color: MUTED, margin: "4px 0 0" }}>{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "center", flexWrap: "wrap", marginTop: 40 }}>
          <button type="button" onClick={onJoin} style={primaryBtn}>Join free</button>
          {onAmbassador && (
            <button type="button" onClick={onAmbassador} style={{ ...primaryBtn, background: "#fff", color: INK, border: `1px solid #C9C8C5` }}>Become your city's ambassador</button>
          )}
        </div>
      </div>
    </section>
  );
}
