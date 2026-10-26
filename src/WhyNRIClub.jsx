import { useEffect, useRef, useState } from "react";
import LogoMark from "./LogoMark";
import { INK, MUTED, GREEN, SAFFRON_TEXT, GREEN_TEXT, primaryBtn } from "./PublicShell";
import { WHY_STATS, WHY_METHOD, WHY_BUBBLES, WHY_CARD, WHY_COMPARE, WHY_COMPARE_HEAD } from "./content/why";

// ============================================================================
// WHY NRICLUB (homepage, #why): scattered chat groups, many with dead links,
// flowing into one NRIClub; our own count of WhatsApp group links for
// Indians in Germany (src/content/why.js); and WhatsApp groups vs NRIClub,
// side by side. The animation runs once when the section comes into view, and not
// at all for people who ask for less motion; without it everything simply
// shows.
// ============================================================================

const reducedMotion = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return true; }
};

// True once the element has been on screen (or at once where that can't be
// told, so nothing stays hidden).
function useSeen(ref) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setSeen(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return seen;
}

// Counts from 0 to `to` once `run` is true (at once with reduced motion).
function CountUp({ to, run }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return undefined;
    if (reducedMotion()) { setN(to); return undefined; }
    let frame;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 1400);
      setN(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to, run]);
  return n;
}

const Bubble = ({ name, dead, i }) => (
  <li className={`why-bubble${dead ? " why-dead" : ""}`} style={{ "--i": i }}>
    <span aria-hidden="true" className="why-avatar">{name.replace(/[^A-Za-z]/g, "").slice(0, 1)}</span>
    <span style={{ minWidth: 0 }}>
      <span className="why-name">{name}</span>
      <span className="why-status">{dead ? "Link reset" : "12 new messages"}</span>
    </span>
  </li>
);

const Tick = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const Cross = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A3A29F" strokeWidth="3" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }}>
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function WhyNRIClub({ onJoin }) {
  const art = useRef(null);
  const stats = useRef(null);
  const artSeen = useSeen(art);
  const statsSeen = useSeen(stats);

  return (
    <section id="why" aria-labelledby="why-title" style={{ background: "#FAFAF8", borderTop: "1px solid #F0EFED", borderBottom: "1px solid #F0EFED" }}>
      <style>{`
        .why-wrap { width: 100%; max-width: 1100px; margin: 0 auto; padding: 64px 24px; box-sizing: border-box; }
        .why-art { display: grid; grid-template-columns: 1fr auto 1fr; gap: 20px; align-items: center; margin: 36px auto 0; max-width: 940px; }
        .why-cloud { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .why-bubble { display: flex; gap: 8px; align-items: center; padding: 8px 10px; border-radius: 12px 12px 12px 4px; background: #fff; border: 1px solid #E6E4DF; font-size: 12.5px; line-height: 1.3; min-width: 0; }
        .why-avatar { width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; background: #8F8E8B; }
        .why-name { display: block; font-weight: 600; color: ${INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .why-status { display: block; color: ${MUTED}; font-size: 11.5px; }
        .why-dead .why-name { text-decoration: line-through; color: #A3A29F; }
        .why-dead .why-status { color: #B42318; font-weight: 600; }
        .why-dead .why-avatar { background: #D6D5D2; }
        .why-arrow { color: ${SAFFRON_TEXT}; }
        .why-card { background: #fff; border-radius: 18px; border: 2px solid ${INK}; padding: 18px 18px 14px; box-shadow: 0 18px 40px rgba(55,53,47,0.12); }
        .why-card ul { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 8px; }
        .why-card li { display: flex; gap: 8px; align-items: flex-start; font-size: 14px; font-weight: 500; }
        .why-stats { list-style: none; margin: 40px auto 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; max-width: 980px; }
        .why-stat { background: #fff; border: 1px solid #ECEBE8; border-radius: 14px; padding: 18px 16px; }
        .why-num { font-size: clamp(30px, 4vw, 40px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; font-variant-numeric: tabular-nums; }
        .why-cmp { margin: 44px auto 0; max-width: 940px; border-radius: 16px; overflow: hidden; border: 1px solid #ECEBE8; background: #fff; }
        .why-row { display: grid; grid-template-columns: 1.1fr 1.5fr 1.5fr; border-top: 1px solid #F0EFED; }
        .why-row > div { padding: 14px 16px; font-size: 14.5px; line-height: 1.5; display: flex; gap: 8px; align-items: flex-start; }
        .why-row.why-head > div { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding-top: 12px; padding-bottom: 12px; }
        .why-row.why-head { border-top: 0; background: #F4F3F0; }
        .why-club { background: #F6FBF5; }
        .why-label { display: none; }

        /* The animation: groups pop in, dead links fade, the arrow flows, the card lands. */
        .why-anim .why-bubble { opacity: 0; transform: translateY(10px) scale(0.96); }
        .why-anim .why-card { opacity: 0; transform: translateY(14px) scale(0.97); }
        .why-anim .why-arrow path { stroke-dasharray: 6 6; }
        .why-anim.why-go .why-bubble { animation: why-pop 0.45s ease-out forwards; animation-delay: calc(var(--i) * 90ms); }
        .why-anim.why-go .why-dead .why-name { animation: why-strike 0.6s ease-out both; animation-delay: calc(900ms + var(--i) * 90ms); }
        .why-anim.why-go .why-arrow path { animation: why-flow 1.2s linear 3; animation-delay: 1.2s; }
        .why-anim.why-go .why-card { animation: why-land 0.6s cubic-bezier(.2,.8,.2,1) forwards; animation-delay: 1.5s; }
        @keyframes why-pop { to { opacity: 1; transform: none; } }
        @keyframes why-strike { from { color: ${INK}; text-decoration-color: transparent; } to { color: #A3A29F; text-decoration-color: currentColor; } }
        @keyframes why-flow { to { stroke-dashoffset: -24; } }
        @keyframes why-land { to { opacity: 1; transform: none; } }

        @media (max-width: 860px) {
          .why-art { grid-template-columns: 1fr; max-width: 460px; }
          .why-arrow { transform: rotate(90deg); justify-self: center; }
          .why-stats { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 640px) {
          .why-wrap { padding: 48px 16px; }
          .why-row { grid-template-columns: 1fr; }
          .why-row.why-head { display: none; }
          .why-row > div { padding: 6px 16px; }
          .why-row > div:first-child { padding-top: 14px; font-weight: 700; }
          .why-row > div:last-child { padding-bottom: 14px; }
          .why-club { background: transparent; }
          .why-label { display: inline; font-weight: 600; }
        }
        @media (max-width: 380px) { .why-cloud { grid-template-columns: 1fr; } }
        @media (prefers-reduced-motion: reduce) {
          .why-anim .why-bubble, .why-anim .why-card { opacity: 1; transform: none; animation: none !important; }
          .why-anim .why-arrow path, .why-anim .why-dead .why-name { animation: none !important; }
        }
      `}</style>
      <div className="why-wrap">
        <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: SAFFRON_TEXT, marginBottom: 12 }}>Why NRIClub</div>
          <h2 id="why-title" style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.12, margin: "0 0 14px" }}>
            Hundreds of groups.<br />One home.
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.65, color: MUTED, margin: 0 }}>
            Finding Indians in a new city often means hunting through WhatsApp groups: one for your city, one for flats, one for events, one more for your language. We counted them for Indians in Germany.
          </p>
        </div>

        {/* The picture: scattered groups → NRIClub. A drawing, not real groups. */}
        <div ref={art} className={`why-art why-anim${artSeen ? " why-go" : ""}`} role="img"
          aria-label="Many separate chat groups, several with reset links, next to one NRIClub account with your city's group, rooms, events, answers, referrals and guides.">
          <ul className="why-cloud" aria-hidden="true">
            {WHY_BUBBLES.map((b, i) => <Bubble key={b.name} {...b} i={i} />)}
          </ul>
          <svg className="why-arrow" width="64" height="32" viewBox="0 0 64 32" fill="none" aria-hidden="true">
            <path d="M2 16h52" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <path d="M46 6l12 10-12 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: "none" }} />
          </svg>
          <div className="why-card" aria-hidden="true">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <LogoMark size={34} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em" }}>NRI<span style={{ fontStyle: "italic", fontFamily: '"Times New Roman",serif' }}>Club</span></div>
                <div style={{ fontSize: 12.5, color: MUTED }}>One account, every city</div>
              </div>
            </div>
            <ul>{WHY_CARD.map((t) => <li key={t}><Tick color={GREEN_TEXT} />{t}</li>)}</ul>
          </div>
        </div>

        {/* Our count */}
        <ul ref={stats} className="why-stats">
          {WHY_STATS.map((s, i) => (
            <li key={s.label} className="why-stat">
              <div className="why-num" style={{ color: i === 1 || i === 2 ? "#B42318" : INK }}>
                <span aria-hidden="true"><CountUp to={s.value} run={statsSeen} />{s.suffix}</span>
                <span className="nc-sr-only">{s.value}{s.suffix}</span>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.5, color: MUTED, margin: "8px 0 0" }}>{s.label}</p>
            </li>
          ))}
        </ul>
        <p style={{ fontSize: 12.5, color: MUTED, textAlign: "center", maxWidth: 720, margin: "14px auto 0", lineHeight: 1.55 }}>{WHY_METHOD}</p>

        {/* WhatsApp groups vs NRIClub */}
        <div className="why-cmp" role="table" aria-label={`${WHY_COMPARE_HEAD} compared with NRIClub`}>
          <div className="why-row why-head" role="row">
            <div role="columnheader" style={{ color: MUTED }}>&nbsp;</div>
            <div role="columnheader" style={{ color: MUTED }}>{WHY_COMPARE_HEAD}</div>
            <div role="columnheader" className="why-club" style={{ color: GREEN_TEXT }}>NRIClub</div>
          </div>
          {WHY_COMPARE.map((r) => (
            <div key={r.topic} className="why-row" role="row">
              <div role="rowheader" style={{ fontWeight: 650 }}>{r.topic}</div>
              <div role="cell" style={{ color: MUTED }}><Cross /><span><span className="why-label">{WHY_COMPARE_HEAD}: </span>{r.groups}</span></div>
              <div role="cell" className="why-club"><Tick color={GREEN} /><span><span className="why-label">NRIClub: </span>{r.club}</span></div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 36 }}>
          <p style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", margin: "0 0 16px" }}>That's one country. Wherever you move next, your NRIClub comes with you.</p>
          <button type="button" onClick={onJoin} style={primaryBtn}>Join free</button>
          <p style={{ fontSize: 13.5, color: MUTED, margin: "14px 0 0" }}>
            We will never message you asking for your password, your login code or your passport.
          </p>
        </div>
      </div>
    </section>
  );
}

