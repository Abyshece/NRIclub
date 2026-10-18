import { lazy, Suspense, useEffect, useState } from "react";
import * as api from "./supabaseApi";
import LogoMark from "./LogoMark";
import PublicShell, { Phrases, useCanonical, INK, MUTED, SAFFRON_TEXT, GREEN_TEXT, section, primaryBtn, whatsappShare } from "./PublicShell";
import { ESSENTIALS } from "./content/essentials";
import { CITIES } from "./content/cities";
import { findCity } from "./content/findCity";
import { TRUST_LINE } from "./content/home";
import { slug, HOME_TITLE } from "./content/slug";

// ============================================================================
// PUBLIC CITY PAGE (nriclub.app/city/<city>): what NRIClub has in one city,
// for people who aren't members yet. It shows counts only, never names or
// posts; members who open the same address get the city's group. Until a
// group has a few members it says so, instead of showing zeros.
// ============================================================================

const titleCase = (s) => s.replace(/(^|[\s-])(\p{L})/gu, (_, p, c) => p + (c === "ß" ? c : c.toLocaleUpperCase()));
// Below this many members the page says the group is just starting. The
// database doesn't give out smaller numbers of members or events either
// (they come as null since the 2026-10-20 database update), so a page never
// shows that one or two members live in a small town.
const SHOW_COUNTS_FROM = 5;

// The ambassador application form, loaded when it is opened.
const AmbassadorApply = lazy(() => import("./AmbassadorApply"));

const Stat = ({ value, label, color }) => (
  <div style={{ flex: "1 1 140px", padding: "18px 16px", borderRadius: 14, border: "1px solid #ECEBE8", background: "#FCFCFB", textAlign: "center" }}>
    <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", color }}>{value}</div>
    <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{label}</div>
  </div>
);

export default function CityPage({ city: rawCity, onJoin, onLogin }) {
  const [summary, setSummary] = useState(null);
  const [cities, setCities] = useState([]);
  const [applying, setApplying] = useState(false); // the ambassador application form is open

  // The address can be "berlin", "new-york-city", "Düsseldorf" or another
  // spelling ("munchen", "nyc"): find the city's real name in the groups.
  const key = slug(rawCity);
  const known = findCity(rawCity, cities.map((c) => c.city));
  const city = known || titleCase(rawCity);
  const citySlug = slug(city);
  const cityPath = `/city/${citySlug || encodeURIComponent(city)}`;

  useEffect(() => {
    api.getPublicCities().then(setCities).catch(() => {});
  }, []);
  useEffect(() => {
    let gone = false;
    setSummary(null);
    api.getCitySummary(city).then((s) => { if (!gone) setSummary(s); }).catch(() => { if (!gone) setSummary({ error: true }); });
    return () => { gone = true; };
  }, [city]);

  // Another spelling of a known city: show the city's own address, so a
  // shared link is the one with the city's link preview.
  useEffect(() => {
    if (known && citySlug && citySlug !== key) {
      try { window.history.replaceState(window.history.state, "", `/city/${citySlug}${window.location.search}${window.location.hash}`); } catch (e) {}
    }
  }, [known, citySlug, key]);

  useCanonical(cityPath);

  useEffect(() => {
    document.title = `Indians in ${city} · NRIClub`;
    return () => { document.title = HOME_TITLE; };
  }, [city]);

  const members = summary?.members || 0;
  const hasGroup = !!summary?.group;
  const noGroup = summary && !summary.error && !hasGroup;
  const showCounts = hasGroup && members >= SHOW_COUNTS_FROM;
  const others = (cities.length ? cities.map((c) => c.city) : CITIES).filter((c) => slug(c) !== citySlug).slice(0, 18);

  const hero = (
    <div style={{ ...section, paddingTop: "clamp(24px, 6vh, 56px)", paddingBottom: 48, textAlign: "center" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 8px", borderRadius: 999, background: "#fff", border: "1px solid #ECEBE8", fontSize: 13, fontWeight: 500, color: MUTED, marginBottom: 22 }}>
        <LogoMark size={18} /> NRIClub {city}
      </div>
      <h1 style={{ fontSize: "clamp(36px, 6vw, 56px)", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.04em", margin: "0 0 18px", overflowWrap: "anywhere" }}>Indians in {city}</h1>
      <p style={{ fontSize: "clamp(16px, 1.8vw, 18px)", lineHeight: 1.65, color: MUTED, maxWidth: 560, margin: "0 auto 28px" }}>
        {!noGroup
          ? `Ask questions, find a room or a referral, discover desi places and celebrate festivals with Indians in ${city}.`
          : `There's no ${city} group yet. Join NRIClub and be one of the first: we'll set up the ${city} group for you.`}
      </p>
      <button onClick={onJoin} style={primaryBtn}>{noGroup ? "Join NRIClub free" : `Join Indians in ${city}`}</button>
      <p style={{ fontSize: 14, color: MUTED, marginTop: 14 }}><Phrases text={TRUST_LINE} /></p>
    </div>
  );

  return (
    <PublicShell onLogin={onLogin} onJoin={onJoin} hero={hero}>
      {showCounts && (
        <section style={{ ...section, paddingTop: 8, paddingBottom: 40 }}>
          {/* Ink between saffron and green: never saffron, navy and green side
              by side, which echoes the flag (see src/content/logo.js). */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Stat value={members} label="members" color={SAFFRON_TEXT} />
            {summary.events != null && summary.events >= SHOW_COUNTS_FROM && <Stat value={summary.events} label="events" color={INK} />}
            <Stat value={summary.places || 0} label={summary.places === 1 ? "desi place" : "desi places"} color={GREEN_TEXT} />
          </div>
        </section>
      )}
      {hasGroup && !showCounts && (
        <section style={{ ...section, paddingTop: 8, paddingBottom: 32 }}>
          <p style={{ margin: 0, padding: "16px 18px", borderRadius: 14, border: "1px solid #ECEBE8", background: "#FCFCFB", fontSize: 15, lineHeight: 1.6 }}>
            <strong>NRIClub {city} is just starting.</strong> Join now as one of its first members: the first members shape the group, its meetups and its list of desi places.
          </p>
        </section>
      )}

      <section style={{ ...section, paddingTop: 24, paddingBottom: 48 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 16px" }}>What members in {city} get</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {[
            [`The ${city} group`, "Ask anything, from where to buy atta to which areas to live in."],
            ["Answers from people who've been there", "Every question can be marked answered, so the best answers are easy to find."],
            ["Housing and job referrals", "Rooms, flatmates and referrals from people who already work there."],
            ["Desi places and trusted professionals", "Indian groceries, restaurants and temples, and doctors, tax advisers and lawyers who speak your language."],
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
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>📌 NRI essentials</h2>
          <p style={{ fontSize: 14, color: MUTED, margin: "0 0 14px" }}>Short guides for life abroad, free to read.</p>
          <ul style={{ margin: 0, paddingLeft: 20, columns: "2 260px", fontSize: 14, lineHeight: 1.9 }}>
            {ESSENTIALS.map((g) => <li key={g.slug}><a href={`/guides/${g.slug}`} style={{ color: INK }}>{g.title}</a></li>)}
          </ul>
        </div>
      </section>

      <section style={{ ...section, paddingTop: 40, paddingBottom: 16, textAlign: "center" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>Bring Indians in {city} together</h2>
        <p style={{ fontSize: 14, color: MUTED, margin: "0 auto 14px", maxWidth: 520 }}>City ambassadors welcome newcomers and host the first meetups. It takes an hour or two a month.</p>
        <button type="button" onClick={() => setApplying(true)} style={{ display: "inline-block", padding: "10px 8px", minHeight: 44, fontSize: 14, fontWeight: 600, color: INK, background: "none", border: "none", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>Become a city ambassador →</button>
        <p style={{ fontSize: 14, margin: "10px 0 0" }}>
          <a href={whatsappShare(`Indians in ${city} on NRIClub, a free community for Indians abroad: https://nriclub.app${cityPath}`)} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", padding: "10px 8px", fontWeight: 600, color: INK }}>Share the {city} page on WhatsApp</a>
        </p>
      </section>

      {others.length > 0 && (
        <section style={{ ...section, paddingTop: 32, paddingBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: MUTED }}>Other cities</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {others.map((c) => (
              <a key={c} href={`/city/${slug(c)}`} style={{ display: "inline-flex", alignItems: "center", minHeight: 44, boxSizing: "border-box", fontSize: 14, padding: "0 16px", borderRadius: 999, border: "1px solid #C9C8C5", color: INK, textDecoration: "none" }}>{c}</a>
            ))}
          </div>
        </section>
      )}
      {applying && (
        <Suspense fallback={null}>
          <AmbassadorApply city={city} onClose={() => setApplying(false)} onJoin={onJoin} />
        </Suspense>
      )}
    </PublicShell>
  );
}
