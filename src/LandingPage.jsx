import { useState } from "react";
import FlagIcon from "./FlagIcon";
import { TermsModal, PrivacyModal } from "./member/LegalModals";

// ============================================================================
// LANDING PAGE: what NRIClub is for, before anyone signs up. Everything is
// drawn here (no outside images), so the page loads nothing from other sites.
// ============================================================================

const INK = "#37352F";
const MUTED = "#6B6A67";
const SAFFRON = "#FF9933";
const GREEN = "#138808";
const NAVY = "#000080";

// Where members live, joined to India by an arc (x, y in the 600 x 380 box).
const CITIES = [
  { name: "San Francisco", x: 40, y: 150 },
  { name: "Toronto", x: 95, y: 82 },
  { name: "New York", x: 120, y: 130 },
  { name: "London", x: 220, y: 60 },
  { name: "Berlin", x: 290, y: 44 },
  { name: "Dubai", x: 368, y: 150 },
  { name: "Singapore", x: 470, y: 250 },
  { name: "Sydney", x: 540, y: 330 },
  { name: "Nairobi", x: 250, y: 300 },
];
const HOME = { x: 330, y: 205 };

const WorldConnections = () => (
  <svg viewBox="0 0 600 380" width="100%" role="img" aria-label="Indians in cities around the world, all connected to India" style={{ display: "block", maxWidth: 560, margin: "0 auto" }}>
    {CITIES.map((c, i) => {
      const mx = (c.x + HOME.x) / 2;
      const my = Math.min(c.y, HOME.y) - 60;
      return (
        <path key={c.name} className="lp-arc" d={`M${HOME.x} ${HOME.y} Q${mx} ${my} ${c.x} ${c.y}`} fill="none"
          stroke={i % 2 ? GREEN : SAFFRON} strokeOpacity="0.55" strokeWidth="1.4" strokeDasharray="4 6" style={{ animationDelay: `${i * 0.35}s` }} />
      );
    })}
    {CITIES.map((c) => (
      <g key={c.name}>
        <circle cx={c.x} cy={c.y} r="4" fill="#fff" stroke={INK} strokeWidth="1.4" />
        <text x={c.x} y={c.y - 10} textAnchor="middle" fontSize="12" fill={MUTED} fontFamily="inherit">{c.name}</text>
      </g>
    ))}
    <circle className="lp-pulse" cx={HOME.x} cy={HOME.y} r="16" fill={SAFFRON} fillOpacity="0.18" />
    <circle cx={HOME.x} cy={HOME.y} r="9" fill="#fff" stroke={GREEN} strokeWidth="2" />
    <circle cx={HOME.x} cy={HOME.y} r="3.5" fill={NAVY} />
    <text x={HOME.x} y={HOME.y + 30} textAnchor="middle" fontSize="13" fontWeight="700" fill={INK} fontFamily="inherit">India</text>
  </svg>
);

// A line drawing of Indian landmarks: Qutub Minar, India Gate, the Taj Mahal,
// the Lotus Temple and the Gateway of India.
const Skyline = () => (
  <svg viewBox="0 0 1200 170" width="100%" preserveAspectRatio="xMidYMax meet" aria-hidden="true" style={{ display: "block" }}>
    <g fill="none" stroke={INK} strokeOpacity="0.28" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M0 160 H1200" />
      {/* Qutub Minar */}
      <path d="M128 160 L140 30 H150 L162 160" />
      <path d="M133 120 H157 M136 88 H154 M139 58 H151 M141 30 L145 18 L149 30" />
      {/* India Gate */}
      <path d="M270 160 V72 H370 V160 M290 160 V112 A30 30 0 0 1 350 112 V160" />
      <path d="M264 72 H376 M270 62 H370 V72 M300 62 V52 H340 V62 M312 52 A8 8 0 0 1 328 52" />
      {/* Taj Mahal */}
      <path d="M470 160 V140 H730 V160" />
      <path d="M535 140 V92 H665 V140 M585 140 V110 A15 15 0 0 1 615 110 V140" />
      <path d="M552 92 C552 58 584 52 600 30 C616 52 648 58 648 92" />
      <path d="M600 30 V16 M542 92 V80 A10 10 0 0 1 562 80 V92 M638 92 V80 A10 10 0 0 1 658 80 V92" />
      <path d="M495 140 V58 M505 140 V58 M492 58 H508 M494 58 A6 6 0 0 1 506 58" />
      <path d="M695 140 V58 M705 140 V58 M692 58 H708 M694 58 A6 6 0 0 1 706 58" />
      {/* Lotus Temple */}
      <path d="M800 160 C808 130 828 112 850 104 C872 112 892 130 900 160" />
      <path d="M822 160 C826 128 838 104 850 86 C862 104 874 128 878 160" />
      <path d="M786 160 C800 146 816 140 830 140 M914 160 C900 146 884 140 870 140" />
      {/* Gateway of India */}
      <path d="M1000 160 V84 H1100 V160 M1030 160 V120 A20 20 0 0 1 1070 120 V160" />
      <path d="M994 84 H1106 M1004 84 V66 H1018 V84 M1082 84 V66 H1096 V84 M1040 84 V72 H1060 V84" />
      <path d="M1004 66 L1011 56 L1018 66 M1082 66 L1089 56 L1096 66" />
    </g>
  </svg>
);

const icon = (paths) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths.map((d) => <path key={d} d={d} />)}
  </svg>
);

const FEATURES = [
  { title: "Find your people", text: "Groups for your city, your hometown and your profession.", color: SAFFRON,
    icon: icon(["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2", "M9 11a4 4 0 100-8 4 4 0 000 8z", "M23 21v-2a4 4 0 00-3-3.87", "M16 3.13a4 4 0 010 7.75"]) },
  { title: "Ask and help", text: "Questions answered by people who have already been through it.", color: GREEN,
    icon: icon(["M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z", "M9 9h6", "M9 13h4"]) },
  { title: "Celebrate together", text: "Diwali, Holi, cricket and meetups near you.", color: NAVY,
    icon: icon(["M3 9h18", "M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z", "M8 2v4", "M16 2v4"]) },
  { title: "Guides from members", text: "Visas, housing, jobs and taxes, explained by those who live there.", color: SAFFRON,
    icon: icon(["M4 19.5A2.5 2.5 0 016.5 17H20", "M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"]) },
  { title: "Marketplace", text: "Buy, sell and rent among people you can trust.", color: GREEN,
    icon: icon(["M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z", "M3 6h18", "M16 10a4 4 0 01-8 0"]) },
  { title: "Verified members", text: "Every member is checked, so you know who you're talking to.", color: NAVY,
    icon: icon(["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "M9 12l2 2 4-4"]) },
];

const STEPS = [
  { title: "Join", text: "Create a free account in a minute." },
  { title: "Get verified", text: "Share your LinkedIn or a short note. Our team checks every member." },
  { title: "Connect", text: "Find your city, your people and your place." },
];

const ArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);

const Logo = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <FlagIcon size={30} />
    <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: INK }}>
      NRI<span style={{ fontStyle: "italic", fontFamily: '"Times New Roman",serif' }}>Club</span>
    </span>
  </div>
);

const primaryBtn = {
  background: INK, color: "#fff", padding: "15px 30px", borderRadius: 10, fontSize: 16, fontWeight: 600,
  border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10, fontFamily: "inherit",
};
const eyebrow = { fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: SAFFRON, marginBottom: 12 };
const h2 = { fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.15, color: INK, margin: "0 0 16px" };
const section = { width: "100%", maxWidth: 1100, margin: "0 auto", padding: "0 24px" };

export default function LandingPage({ onJoin, onLogin }) {
  const [legal, setLegal] = useState(null); // "terms" | "privacy"
  const footerLink = { background: "none", border: "none", padding: 4, cursor: "pointer", color: MUTED, fontSize: 13, fontFamily: "inherit", textDecoration: "underline" };
  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: INK, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", overflowX: "hidden" }}>
      <style>{`
        .lp-arc { animation: lp-flow 2.4s linear infinite; }
        @keyframes lp-flow { to { stroke-dashoffset: -20; } }
        .lp-pulse { transform-origin: 330px 205px; animation: lp-pulse 2.6s ease-out infinite; }
        @keyframes lp-pulse { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(2.2); opacity: 0; } }
        .lp-hero { display: grid; grid-template-columns: 1.05fr 1fr; gap: 40px; align-items: center; }
        .lp-card { transition: transform 0.15s, box-shadow 0.15s; }
        .lp-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(55,53,47,0.07); }
        @media (max-width: 860px) {
          .lp-hero { grid-template-columns: 1fr; text-align: center; }
          .lp-hero-actions { justify-content: center; }
        }
        @media (prefers-reduced-motion: reduce) { .lp-arc, .lp-pulse { animation: none; } }
      `}</style>

      {/* The tricolour, as a thin line across the top */}
      <div aria-hidden="true" style={{ height: 4, background: `linear-gradient(90deg, ${SAFFRON} 0 33.3%, #fff 33.3% 66.6%, ${GREEN} 66.6%)`, borderBottom: "1px solid #F0EFED" }} />

      {/* HERO */}
      <header style={{ background: `radial-gradient(800px 400px at 0% 0%, rgba(255,153,51,0.10), transparent 70%), radial-gradient(700px 400px at 100% 10%, rgba(19,136,8,0.07), transparent 70%)` }}>
        <nav style={{ ...section, display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 22, paddingBottom: 22 }}>
          <Logo />
          <button onClick={onLogin} style={{ fontSize: 14, fontWeight: 600, padding: "9px 18px", border: "1px solid #E0E0DE", borderRadius: 8, background: "#fff", cursor: "pointer", color: INK, fontFamily: "inherit" }}>
            Log in
          </button>
        </nav>

        <div className="lp-hero" style={{ ...section, paddingTop: "clamp(24px, 6vh, 64px)", paddingBottom: 24 }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 8px", borderRadius: 999, background: "#fff", border: "1px solid #ECEBE8", fontSize: 13, fontWeight: 500, color: MUTED, marginBottom: 24 }}>
              <FlagIcon size={20} /> For every Indian living outside India
            </div>
            <h1 style={{ fontSize: "clamp(38px, 6vw, 62px)", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.04em", margin: "0 0 20px" }}>
              One home for<br />Indians abroad.
            </h1>
            <p style={{ fontSize: "clamp(16px, 1.8vw, 19px)", lineHeight: 1.65, color: MUTED, maxWidth: 520, margin: "0 0 32px", marginInline: "inherit" }}>
              NRIClub brings Indians from every country onto one trusted platform: to meet people from home, ask questions, share what you've learned and help each other build a life outside India.
            </p>
            <div className="lp-hero-actions" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={onJoin} style={primaryBtn}>Join the Community <ArrowRight /></button>
              <span style={{ fontSize: 13, color: "#9B9A97" }}>Free to join · Every member is verified</span>
            </div>
          </div>
          <WorldConnections />
        </div>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 12px" }}><Skyline /></div>
      </header>

      {/* OUR GOAL */}
      <section style={{ ...section, paddingTop: 88, paddingBottom: 40, textAlign: "center" }}>
        <div style={eyebrow}>Our goal</div>
        <h2 style={h2}>Bring every NRI in the world together.</h2>
        <p style={{ fontSize: 17, lineHeight: 1.75, color: MUTED, maxWidth: 680, margin: "0 auto" }}>
          More than 35 million Indians and people of Indian origin live outside India. Most of us are spread across countless WhatsApp, Facebook and Telegram groups. NRIClub is one place for all of us: one community in every city, for everything that comes with living away from home.
        </p>
      </section>

      {/* WHAT YOU CAN DO */}
      <section style={{ ...section, paddingTop: 32, paddingBottom: 80 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="lp-card" style={{ padding: "26px 24px", borderRadius: 14, border: "1px solid #ECEBE8", background: "#FCFCFB" }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: f.color, background: `${f.color}14`, marginBottom: 16 }}>{f.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 650, letterSpacing: "-0.02em", margin: "0 0 6px" }}>{f.title}</h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: MUTED, margin: 0 }}>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ background: "#FAFAF8", borderTop: "1px solid #F0EFED", borderBottom: "1px solid #F0EFED" }}>
        <div style={{ ...section, paddingTop: 72, paddingBottom: 72 }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ ...eyebrow, color: GREEN }}>How it works</div>
            <h2 style={{ ...h2, marginBottom: 0 }}>A trusted circle, in three steps.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 28 }}>
            {STEPS.map((s, i) => (
              <div key={s.title} style={{ textAlign: "center" }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff", background: [SAFFRON, NAVY, GREEN][i] }}>{i + 1}</div>
                <h3 style={{ fontSize: 17, fontWeight: 650, margin: "0 0 6px" }}>{s.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: MUTED, margin: "0 auto", maxWidth: 260 }}>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CLOSING */}
      <section style={{ ...section, paddingTop: 88, paddingBottom: 72, textAlign: "center" }}>
        <div style={{ display: "inline-block", marginBottom: 20 }}><FlagIcon size={54} /></div>
        <h2 style={h2}>Far from home, never alone.</h2>
        <p style={{ fontSize: 17, lineHeight: 1.7, color: MUTED, maxWidth: 520, margin: "0 auto 30px" }}>
          Wherever you live, there's a community of Indians nearby. Come and meet them.
        </p>
        <button onClick={onJoin} style={primaryBtn}>Join the Community <ArrowRight /></button>
      </section>

      {/* Footer: the Terms and the Privacy Policy, readable before signing up */}
      <footer style={{ ...section, borderTop: "1px solid #F0EFED", paddingTop: 22, paddingBottom: 30, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, fontSize: 13, color: MUTED }}>
        <Logo />
        <div>
          <button type="button" onClick={() => setLegal("terms")} style={footerLink}>Terms of Use</button>
          <span aria-hidden="true"> · </span>
          <button type="button" onClick={() => setLegal("privacy")} style={footerLink}>Privacy Policy</button>
        </div>
        <span>Made for Indians everywhere</span>
      </footer>
      {legal === "terms" && <TermsModal onClose={() => setLegal(null)} />}
      {legal === "privacy" && <PrivacyModal onClose={() => setLegal(null)} />}
    </div>
  );
}
