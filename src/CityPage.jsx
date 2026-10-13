import { useEffect, useState } from "react";
import * as api from "./supabaseApi";
import FlagIcon from "./FlagIcon";
import { TermsModal, PrivacyModal } from "./member/LegalModals";

// ============================================================================
// PUBLIC CITY PAGE (nriclub.app/city/<city>): what NRIClub has in one city,
// for people who aren't members yet. It shows counts only, never names or
// posts; members who open the same address get the city's group.
// ============================================================================

const INK = "#37352F";
const MUTED = "#6B6A67";
const SAFFRON = "#FF9933";
const GREEN = "#138808";
const NAVY = "#000080";

// The pinned NRI essentials guides every member can read.
const ESSENTIALS = [
  "Your first weeks abroad: a checklist",
  "Renewing your Indian passport abroad",
  "OCI card: the basics",
  "NRE, NRO and FCNR accounts explained",
  "Taxes in India when you live abroad",
  "Sending money home: getting a good deal",
  "Parents visiting you abroad",
  "Help from the Indian embassy or consulate",
];

const AMBASSADOR_MAIL = "mailto:support@nriclub.app?subject=" + encodeURIComponent("I'd like to be a city ambassador");

const cityHref = (city) => `/city/${encodeURIComponent(city)}`;

const titleCase = (s) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

const section = { width: "100%", maxWidth: 880, margin: "0 auto", padding: "0 24px" };
const primaryBtn = {
  background: INK, color: "#fff", padding: "14px 28px", borderRadius: 10, fontSize: 16, fontWeight: 600,
  border: "none", cursor: "pointer", fontFamily: "inherit",
};

const Stat = ({ value, label, color }) => (
  <div style={{ flex: "1 1 140px", padding: "18px 16px", borderRadius: 14, border: "1px solid #ECEBE8", background: "#FCFCFB", textAlign: "center" }}>
    <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", color }}>{value}</div>
    <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{label}</div>
  </div>
);

export default function CityPage({ city: rawCity, onJoin, onLogin }) {
  const [summary, setSummary] = useState(null);
  const [cities, setCities] = useState([]);
  const [legal, setLegal] = useState(null);

  const known = cities.find((c) => c.city.toLowerCase() === rawCity.toLowerCase());
  const city = known ? known.city : titleCase(rawCity);

  useEffect(() => {
    api.getCitySummary(rawCity).then(setSummary).catch(() => setSummary({ error: true }));
    api.getPublicCities().then(setCities).catch(() => {});
  }, [rawCity]);

  useEffect(() => {
    const title = document.title;
    document.title = `Indians in ${city} · NRIClub`;
    return () => { document.title = title; };
  }, [city]);

  const members = summary?.members || 0;
  const hasGroup = !!summary?.group;
  const noGroup = summary && !summary.error && !hasGroup;
  const others = cities.filter((c) => c.city.toLowerCase() !== rawCity.toLowerCase()).slice(0, 18);
  const footerLink = { background: "none", border: "none", padding: 4, cursor: "pointer", color: MUTED, fontSize: 13, fontFamily: "inherit", textDecoration: "underline" };

  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: INK, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div aria-hidden="true" style={{ height: 4, background: `linear-gradient(90deg, ${SAFFRON} 0 33.3%, #fff 33.3% 66.6%, ${GREEN} 66.6%)`, borderBottom: "1px solid #F0EFED" }} />
      <header style={{ background: `radial-gradient(700px 360px at 0% 0%, rgba(255,153,51,0.10), transparent 70%), radial-gradient(600px 360px at 100% 10%, rgba(19,136,8,0.07), transparent 70%)` }}>
        <nav style={{ ...section, maxWidth: 1100, display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 22, paddingBottom: 22 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: INK }}>
            <FlagIcon size={30} />
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>NRI<span style={{ fontStyle: "italic", fontFamily: '"Times New Roman",serif' }}>Club</span></span>
          </a>
          <button onClick={onLogin} style={{ fontSize: 14, fontWeight: 600, padding: "9px 18px", border: "1px solid #E0E0DE", borderRadius: 8, background: "#fff", cursor: "pointer", color: INK, fontFamily: "inherit" }}>Log in</button>
        </nav>
        <div style={{ ...section, paddingTop: "clamp(24px, 6vh, 56px)", paddingBottom: 48, textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 8px", borderRadius: 999, background: "#fff", border: "1px solid #ECEBE8", fontSize: 13, fontWeight: 500, color: MUTED, marginBottom: 22 }}>
            <FlagIcon size={20} /> NRIClub {city}
          </div>
          <h1 style={{ fontSize: "clamp(36px, 6vw, 56px)", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.04em", margin: "0 0 18px" }}>Indians in {city}</h1>
          <p style={{ fontSize: "clamp(16px, 1.8vw, 18px)", lineHeight: 1.65, color: MUTED, maxWidth: 560, margin: "0 auto 28px" }}>
            {!noGroup
              ? `Meet Indians who live in ${city}. Ask questions, find a room or a referral, discover desi places and celebrate festivals together.`
              : `There's no ${city} group yet. Join NRIClub and be one of the first: we'll set up the ${city} group for you.`}
          </p>
          <button onClick={onJoin} style={primaryBtn}>{noGroup ? "Join NRIClub" : `Join Indians in ${city}`}</button>
          <p style={{ fontSize: 13, color: "#9B9A97", marginTop: 12 }}>Free to join · Every member is verified</p>
        </div>
      </header>

      {summary && hasGroup && (
        <section style={{ ...section, paddingTop: 8, paddingBottom: 40 }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Stat value={members} label={members === 1 ? "member" : "members"} color={SAFFRON} />
            <Stat value={summary.events || 0} label={summary.events === 1 ? "event" : "events"} color={NAVY} />
            <Stat value={summary.places || 0} label={summary.places === 1 ? "desi place" : "desi places"} color={GREEN} />
          </div>
        </section>
      )}

      <section style={{ ...section, paddingTop: 24, paddingBottom: 48 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 16px" }}>What members in {city} get</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {[
            [`The ${city} group`, "Ask anything, from where to buy atta to which areas to live in."],
            ["Housing and job referrals", "Rooms, flatmates and referrals from people who already work there."],
            ["Desi places", "Indian groceries, restaurants and temples, recommended by members."],
            ["Festivals and meetups", "Diwali, Holi, cricket and chai, with Indians near you."],
          ].map(([t, d]) => (
            <li key={t} style={{ padding: "14px 16px", borderRadius: 12, border: "1px solid #ECEBE8" }}>
              <strong style={{ fontSize: 15 }}>{t}</strong>
              <span style={{ display: "block", fontSize: 14, color: MUTED, marginTop: 2 }}>{d}</span>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ background: "#FAFAF8", borderTop: "1px solid #F0EFED", borderBottom: "1px solid #F0EFED" }}>
        <div style={{ ...section, paddingTop: 40, paddingBottom: 40 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>📌 NRI essentials, for members</h2>
          <p style={{ fontSize: 14, color: MUTED, margin: "0 0 14px" }}>Short guides for life abroad, written by the NRIClub team.</p>
          <ul style={{ margin: 0, paddingLeft: 20, columns: "2 260px", fontSize: 14, lineHeight: 1.9, color: INK }}>
            {ESSENTIALS.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
      </section>

      <section style={{ ...section, paddingTop: 40, paddingBottom: 16, textAlign: "center" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>Bring Indians in {city} together</h2>
        <p style={{ fontSize: 14, color: MUTED, margin: "0 auto 14px", maxWidth: 520 }}>City ambassadors welcome newcomers and host the first meetups. It takes an hour or two a month.</p>
        <a href={AMBASSADOR_MAIL} style={{ fontSize: 14, fontWeight: 600, color: INK }}>Become a city ambassador →</a>
      </section>

      {others.length > 0 && (
        <section style={{ ...section, paddingTop: 32, paddingBottom: 48 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: MUTED }}>Other cities</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {others.map((c) => (
              <a key={c.city} href={cityHref(c.city)} style={{ fontSize: 13, padding: "6px 12px", borderRadius: 999, border: "1px solid #E0E0DE", color: INK, textDecoration: "none" }}>{c.city}</a>
            ))}
          </div>
        </section>
      )}

      <footer style={{ ...section, maxWidth: 1100, borderTop: "1px solid #F0EFED", paddingTop: 22, paddingBottom: 30, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, fontSize: 13, color: MUTED }}>
        <a href="/" style={{ color: MUTED }}>NRIClub home</a>
        <div>
          <button type="button" onClick={() => setLegal("terms")} style={footerLink}>Terms of Use</button>
          <span aria-hidden="true"> · </span>
          <button type="button" onClick={() => setLegal("privacy")} style={footerLink}>Privacy Policy</button>
        </div>
      </footer>
      {legal === "terms" && <TermsModal onClose={() => setLegal(null)} />}
      {legal === "privacy" && <PrivacyModal onClose={() => setLegal(null)} />}
    </div>
  );
}
