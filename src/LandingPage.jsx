import { useEffect, useMemo, useState } from "react";
import * as api from "./supabaseApi";
import FlagIcon from "./FlagIcon";
import { slug } from "./content/slug";
import { CITIES } from "./content/cities";
import { findCity } from "./content/findCity";
import { HOME_PILL, HOME_LEAD, TRUST_LINE, POPULAR_CITIES, FEATURED_GUIDES, FOUNDER, SHARE_TEXT } from "./content/home";
import { TermsModal, PrivacyModal } from "./member/LegalModals";
import { PublicNav, Phrases, INK, MUTED, SAFFRON, GREEN, NAVY, SAFFRON_TEXT, GREEN_TEXT, AMBASSADOR_MAIL, SUPPORT_EMAIL, whatsappShare } from "./PublicShell";

// ============================================================================
// LANDING PAGE: what NRIClub is for, before anyone signs up. Everything is
// drawn here (no outside images), so the page loads nothing from other sites.
// ============================================================================

// Where members live, joined to India by an arc (x, y in the 600 x 380 box).
const MAP_CITIES = [
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
  <svg className="lp-map" viewBox="0 0 600 380" width="100%" role="img" aria-label="Indians in cities around the world, all connected to India" style={{ display: "block", maxWidth: 560, margin: "0 auto" }}>
    {MAP_CITIES.map((c, i) => {
      const mx = (c.x + HOME.x) / 2;
      const my = Math.min(c.y, HOME.y) - 60;
      return (
        <path key={c.name} className="lp-arc" d={`M${HOME.x} ${HOME.y} Q${mx} ${my} ${c.x} ${c.y}`} fill="none"
          stroke={i % 2 ? GREEN : SAFFRON} strokeOpacity="0.55" strokeWidth="1.4" strokeDasharray="4 6" style={{ animationDelay: `${-i * 0.35}s` }} />
      );
    })}
    {MAP_CITIES.map((c) => (
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
  <svg className="lp-skyline" viewBox="0 0 1200 170" width="100%" preserveAspectRatio="xMidYMax meet" aria-hidden="true" style={{ display: "block" }}>
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

// What members can do today; each card is a real need and a real feature.
const FEATURES = [
  { title: "A room or a flatmate", text: "Housing and flatmate posts from Indians in your city.", color: SAFFRON,
    icon: icon(["M3 10.5L12 3l9 7.5", "M5 9v12h14V9", "M10 21v-6h4v6"]) },
  { title: "Job referrals", text: "Members refer each other at the companies they work for.", color: GREEN,
    icon: icon(["M4 7h16a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z", "M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2", "M3 13h18"]) },
  { title: "Ask anything", text: "From visas to where to buy atta. The best answer is marked, and urgent questions show local emergency numbers.", color: NAVY,
    icon: icon(["M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z", "M9 9h6", "M9 13h4"]) },
  { title: "Desi places", text: "Groceries, restaurants and temples, plus doctors, tax advisers and lawyers who speak your language.", color: SAFFRON,
    icon: icon(["M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z", "M12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"]) },
  { title: "Festivals and meetups", text: "Diwali, Holi, cricket and chai near you, with RSVP and add to calendar.", color: GREEN,
    icon: icon(["M3 9h18", "M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z", "M8 2v4", "M16 2v4"]) },
  { title: "A free mentor", text: "Book a session with a member who has been through it: job search, CV, visas, studies and more.", color: NAVY,
    icon: icon(["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2", "M9 11a4 4 0 100-8 4 4 0 000 8z", "M23 21v-2a4 4 0 00-3-3.87", "M16 3.13a4 4 0 010 7.75"]) },
];

// Why NRIClub and not one more chat group: only things NRIClub really does.
const REASONS = [
  ["Real people", "A person on our team checks every new member."],
  ["Your number stays private", "Message members inside NRIClub. We never ask for your phone number."],
  ["Answers don't get lost", "The best answer to each question is marked, so the next person finds it."],
  ["Everything in one place", "Rooms, referrals, questions, desi places, events and guides for your city."],
];

const STEPS = [
  { title: "Join free", text: "Your name, email and a password. No phone number and no app store: NRIClub works in your browser and can sit on your home screen." },
  { title: "Get checked", text: "Paste your LinkedIn. No LinkedIn? Write a few words about yourself and name a member who knows you. A person on our team checks it, usually within a day; meanwhile you can join groups and say hello." },
  { title: "Meet your city", text: "Join your city's group, plus your language group, Indian students abroad or the parents' corner." },
];

const ArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);

const Check = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
    <circle cx="12" cy="12" r="10" /><path d="M8 12.5l2.5 2.5L16 9.5" />
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
const eyebrow = { fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: SAFFRON_TEXT, marginBottom: 12 };
const h2 = { fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.15, color: INK, margin: "0 0 16px" };
const section = { width: "100%", maxWidth: 1100, margin: "0 auto", padding: "0 24px", boxSizing: "border-box" };
const lead = { fontSize: 17, lineHeight: 1.7, color: MUTED, maxWidth: 640, margin: "0 auto" };
const trust = { fontSize: 14, color: MUTED, margin: "14px 0 0" };

export default function LandingPage({ onJoin, onLogin }) {
  const [legal, setLegal] = useState(null); // "terms" | "privacy"
  const [groups, setGroups] = useState([]); // [{ city, members }]: the live city groups
  const [cityQuery, setCityQuery] = useState("");
  const [guides, setGuides] = useState(null); // all guides, loaded after the page (they're long)
  useEffect(() => {
    api.getPublicCities().then((rows) => { if (Array.isArray(rows)) setGroups(rows); }).catch(() => {});
    import("./content/essentials").then((m) => setGuides(m.ESSENTIALS)).catch(() => {});
  }, []);
  const featured = (guides || []).length ? FEATURED_GUIDES.map((s) => guides.find((g) => g.slug === s)).filter(Boolean) : [];

  // A city with 5 or more members comes first; the rest are big cities
  // around the world (the live list is sorted by members, then by name, so
  // on its own it would show only the first cities of the alphabet).
  const liveNames = groups.map((g) => g.city);
  const chips = useMemo(() => {
    const seen = new Set();
    return [...groups.filter((g) => g.members >= 5).map((g) => g.city), ...POPULAR_CITIES]
      .filter((c) => { const k = slug(c); if (!k || seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 12);
  }, [groups]);
  const allCities = useMemo(() => {
    const seen = new Set();
    return [...groups.map((g) => g.city), ...CITIES]
      .filter((c) => { const k = slug(c); if (!k || seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.localeCompare(b));
  }, [groups]);
  const cityCount = Math.max(CITIES.length, groups.length);

  const openCity = (e) => {
    e.preventDefault();
    const typed = cityQuery.trim();
    if (!typed) return;
    const city = findCity(typed, liveNames) || typed;
    window.location.href = `/city/${slug(city) || encodeURIComponent(city)}`;
  };

  const footerLink = { background: "none", border: "none", padding: "10px 8px", cursor: "pointer", color: MUTED, fontSize: 13, fontFamily: "inherit", textDecoration: "underline", display: "inline-block" };
  return (
    <div className="lp-root" style={{ minHeight: "100vh", background: "#fff", color: INK, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <style>{`
        .lp-root { overflow-x: hidden; overflow-x: clip; }
        .lp-arc { animation: lp-flow 2.4s linear 2 both; }
        @keyframes lp-flow { to { stroke-dashoffset: -20; } }
        .lp-pulse { transform-origin: 330px 205px; animation: lp-pulse 2.4s ease-out 2 both; }
        @keyframes lp-pulse { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(2.2); opacity: 0; } }
        .lp-skyline path { vector-effect: non-scaling-stroke; }
        .lp-hero { display: grid; grid-template-columns: 1.05fr 1fr; gap: 40px; align-items: center; }
        .lp-card { padding: 24px; border-radius: 14px; border: 1px solid #ECEBE8; background: #FCFCFB; }
        .lp-card-icon { width: 42px; height: 42px; margin-bottom: 16px; }
        @media (max-width: 860px) {
          .lp-hero { grid-template-columns: 1fr; text-align: center; }
          .lp-hero-actions { justify-content: center; }
        }
        @media (max-width: 600px) {
          .lp-map { display: none !important; }
          .lp-card { display: grid; grid-template-columns: 36px 1fr; column-gap: 12px; padding: 14px 16px; }
          .lp-card-icon { width: 36px; height: 36px; margin-bottom: 0; grid-row: span 2; }
        }
        @media (prefers-reduced-motion: reduce) { .lp-arc, .lp-pulse { animation: none; } }
      `}</style>

      {/* The tricolour, as a thin line across the top */}
      <div aria-hidden="true" style={{ height: 4, background: `linear-gradient(90deg, ${SAFFRON} 0 33.3%, #fff 33.3% 66.6%, ${GREEN} 66.6%)` }} />
      <PublicNav onLogin={onLogin} onJoin={onJoin} />

      <main>
        {/* HERO */}
        <section aria-labelledby="lp-title" style={{ background: `radial-gradient(800px 400px at 0% 0%, rgba(255,153,51,0.10), transparent 70%), radial-gradient(700px 400px at 100% 10%, rgba(19,136,8,0.07), transparent 70%)` }}>
          <div className="lp-hero" style={{ ...section, paddingTop: "clamp(24px, 6vh, 64px)", paddingBottom: 24 }}>
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 8px", borderRadius: 999, background: "#fff", border: "1px solid #ECEBE8", fontSize: 13, fontWeight: 500, color: MUTED, marginBottom: 24 }}>
                <FlagIcon size={20} /> {HOME_PILL}
              </div>
              <h1 id="lp-title" style={{ fontSize: "clamp(38px, 6vw, 62px)", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.04em", margin: "0 0 20px" }}>
                One home for<br />Indians abroad.
              </h1>
              <p style={{ fontSize: "clamp(16px, 1.8vw, 19px)", lineHeight: 1.65, color: MUTED, maxWidth: 520, margin: "0 0 32px", marginInline: "inherit" }}>
                {HOME_LEAD}
              </p>
              <div className="lp-hero-actions" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" onClick={onJoin} style={primaryBtn}>Join free <ArrowRight /></button>
              </div>
              <p style={trust}><Phrases text={TRUST_LINE} /></p>
            </div>
            <WorldConnections />
          </div>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 12px" }}><Skyline /></div>
        </section>

        {/* FIND YOUR CITY */}
        <section aria-labelledby="lp-city" style={{ ...section, paddingTop: 56, paddingBottom: 56, textAlign: "center" }}>
          <div style={{ ...eyebrow, color: NAVY }}>Find your city</div>
          <h2 id="lp-city" style={h2}>Find your city's group</h2>
          <p style={{ ...lead, fontSize: 16 }}>Groups for {cityCount} cities. Many are brand new: join early and help shape yours.</p>
          <form role="search" aria-label="Find your city's group" onSubmit={openCity} style={{ display: "flex", gap: 8, maxWidth: 440, margin: "22px auto 18px" }}>
            <input type="search" value={cityQuery} onChange={(e) => setCityQuery(e.target.value)} placeholder="Your city, e.g. Munich" aria-label="Your city"
              list="lp-city-list" enterKeyHint="go" autoComplete="off" required maxLength={100}
              style={{ flex: 1, minWidth: 0, minHeight: 48, padding: "0 14px", borderRadius: 10, border: "1px solid #8F8E8B", fontSize: 16, fontFamily: "inherit", color: INK, background: "#fff" }} />
            <datalist id="lp-city-list">{allCities.map((c) => <option key={c} value={c} />)}</datalist>
            <button type="submit" style={{ ...primaryBtn, minHeight: 48, padding: "0 22px", fontSize: 15 }}>Find</button>
          </form>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 760, margin: "0 auto" }}>
            {chips.map((c) => (
              <a key={c} href={`/city/${slug(c)}`} style={{ display: "inline-flex", alignItems: "center", minHeight: 44, boxSizing: "border-box", fontSize: 14, padding: "0 16px", borderRadius: 999, border: "1px solid #C9C8C5", color: INK, textDecoration: "none", background: "#fff" }}>{c}</a>
            ))}
          </div>
        </section>

        {/* WHY NRICLUB */}
        <section aria-labelledby="lp-why" style={{ ...section, paddingTop: 40, paddingBottom: 56 }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ textAlign: "center" }}>
              <div style={eyebrow}>Why NRIClub</div>
              <h2 id="lp-why" style={h2}>Not another WhatsApp group.</h2>
              <p style={lead}>More than 35 million Indians and people of Indian origin live outside India, spread across countless WhatsApp, Facebook and Telegram groups.</p>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: "28px auto 0", display: "grid", gap: 14, maxWidth: 600 }}>
              {REASONS.map(([title, text]) => (
                <li key={title} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 16, lineHeight: 1.55 }}>
                  <Check />
                  <span><strong style={{ fontWeight: 650 }}>{title}:</strong> <span style={{ color: MUTED }}>{text}</span></span>
                </li>
              ))}
            </ul>
            <p style={{ textAlign: "center", fontSize: 15, fontWeight: 600, margin: "28px 0 6px" }}>
              {cityCount} city groups · language groups · free NRI guides
            </p>
            <p style={{ textAlign: "center", fontSize: 14, color: MUTED, margin: 0 }}>
              We will never message you asking for money, your passport or your login code.
            </p>
          </div>
        </section>

        {/* WHAT YOU CAN DO */}
        <section aria-labelledby="lp-features" style={{ ...section, paddingTop: 24, paddingBottom: 56 }}>
          <h2 id="lp-features" style={{ ...h2, textAlign: "center", marginBottom: 28 }}>What you can do on NRIClub</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            {FEATURES.map((f) => (
              <div key={f.title} className="lp-card">
                <div className="lp-card-icon" style={{ borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: f.color, background: `${f.color}14` }}>{f.icon}</div>
                <h3 style={{ fontSize: 17, fontWeight: 650, letterSpacing: "-0.02em", margin: "0 0 4px" }}>{f.title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: MUTED, margin: 0 }}>{f.text}</p>
              </div>
            ))}
          </div>
          <p style={{ textAlign: "center", fontSize: 15, color: MUTED, margin: "22px 0 0" }}>
            Plus your city's group, language groups, a group for Indian students abroad and the parents' corner.
          </p>
        </section>

        {/* FREE GUIDES */}
        <section aria-labelledby="lp-guides" style={{ ...section, maxWidth: 880, paddingTop: 24, paddingBottom: 64 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ ...eyebrow, color: GREEN_TEXT }}>Free NRI guides</div>
            <h2 id="lp-guides" style={h2}>Answers to the questions every NRI asks.</h2>
            <p style={{ ...lead, fontSize: 16, marginBottom: 22 }}>Short guides, no account needed.</p>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, minHeight: featured.length ? undefined : 120 }}>
            {featured.map((g) => (
              <li key={g.slug}>
                <a href={`/guides/${g.slug}`} style={{ display: "flex", alignItems: "center", minHeight: 48, boxSizing: "border-box", padding: "10px 16px", borderRadius: 12, border: "1px solid #ECEBE8", color: INK, textDecoration: "none", fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>
                  {g.title}
                </a>
              </li>
            ))}
          </ul>
          <p style={{ textAlign: "center", margin: "18px 0 0" }}>
            <a href="/guides" style={{ display: "inline-block", padding: "10px 8px", fontSize: 15, fontWeight: 600, color: INK }}>{guides ? `All ${guides.length} guides →` : "All guides →"}</a>
          </p>
        </section>

        {/* HOW IT WORKS, AND JOIN */}
        <section aria-labelledby="lp-how" style={{ background: "#FAFAF8", borderTop: "1px solid #F0EFED", borderBottom: "1px solid #F0EFED" }}>
          <div style={{ ...section, paddingTop: 64, paddingBottom: 64 }}>
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <div style={{ ...eyebrow, color: GREEN_TEXT }}>How it works</div>
              <h2 id="lp-how" style={{ ...h2, marginBottom: 0 }}>A trusted circle, in three steps.</h2>
            </div>
            <ol role="list" style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 28 }}>
              {STEPS.map((s, i) => (
                <li key={s.title} style={{ textAlign: "center" }}>
                  <div aria-hidden="true" style={{ width: 40, height: 40, borderRadius: "50%", margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: i === 0 ? INK : "#fff", background: [SAFFRON, NAVY, GREEN][i] }}>{i + 1}</div>
                  <h3 style={{ fontSize: 17, fontWeight: 650, margin: "0 0 6px" }}>{s.title}</h3>
                  <p style={{ fontSize: 14.5, lineHeight: 1.6, color: MUTED, margin: "0 auto", maxWidth: 300 }}>{s.text}</p>
                </li>
              ))}
            </ol>

            <div style={{ textAlign: "center", marginTop: 56 }}>
              <h2 style={h2}>Start your city's community.</h2>
              <p style={{ ...lead, maxWidth: 560, marginBottom: 26 }}>
                NRIClub is new and growing one city at a time. Join free, be one of the first members in your city, and help the next Indian who arrives.
              </p>
              <button type="button" onClick={onJoin} style={primaryBtn}>Join free <ArrowRight /></button>
              <p style={trust}><Phrases text={TRUST_LINE} /></p>
              <p style={{ fontSize: 15, margin: "26px 0 0" }}>
                <a href={whatsappShare(SHARE_TEXT)} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", padding: "10px 8px", color: INK, fontWeight: 600 }}>Know Indians abroad? Share NRIClub on WhatsApp</a>
              </p>
              <p style={{ fontSize: 14, color: MUTED, margin: "6px 0 0" }}>
                Know your city well? <a href={AMBASSADOR_MAIL} style={{ display: "inline-block", padding: "10px 4px", color: INK, fontWeight: 600 }}>Become its ambassador</a>
                <br />or write to {SUPPORT_EMAIL}
              </p>
            </div>
          </div>
        </section>

        {/* WHO'S BEHIND NRICLUB */}
        <section aria-labelledby="lp-about" style={{ ...section, maxWidth: 720, paddingTop: 48, paddingBottom: 24 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div aria-hidden="true" style={{ width: 48, height: 48, borderRadius: "50%", border: `1.5px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 700, fontSize: 16 }}>
              {FOUNDER ? FOUNDER.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() : <FlagIcon size={26} />}
            </div>
            <div>
              <h2 id="lp-about" style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 6px" }}>Who's behind NRIClub</h2>
              <p style={{ fontSize: 15, lineHeight: 1.65, color: MUTED, margin: 0 }}>
                {FOUNDER && `Run by ${FOUNDER.name}, an Indian living in ${FOUNDER.city}${FOUNDER.since ? ` since ${FOUNDER.since}` : ""}. `}
                NRIClub is independent: not an agency, a political group or a government office. Questions or ideas? Write to <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: INK, fontWeight: 600 }}>{SUPPORT_EMAIL}</a>.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer: the guides, a way to reach us, and the Terms and the Privacy Policy, readable before signing up */}
      <footer style={{ ...section, borderTop: "1px solid #F0EFED", marginTop: 32, paddingTop: 14, paddingBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 13, color: MUTED }}>
        <Logo />
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          <a href="/guides" style={footerLink}>NRI guides</a>
          <a href={`mailto:${SUPPORT_EMAIL}`} style={footerLink}>Contact</a>
          <button type="button" onClick={() => setLegal("terms")} style={footerLink}>Terms of Use</button>
          <button type="button" onClick={() => setLegal("privacy")} style={footerLink}>Privacy Policy</button>
        </div>
        <span>Made for Indians everywhere</span>
      </footer>
      {legal === "terms" && <TermsModal onClose={() => setLegal(null)} />}
      {legal === "privacy" && <PrivacyModal onClose={() => setLegal(null)} />}
    </div>
  );
}
