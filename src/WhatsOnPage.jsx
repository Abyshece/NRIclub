import { useEffect, useMemo, useRef, useState } from "react";
import LogoMark from "./LogoMark";
import PublicShell, { Phrases, useCanonical, INK, MUTED, SAFFRON_TEXT, GREEN_TEXT, section, primaryBtn, whatsappShare, SUPPORT_EMAIL } from "./PublicShell";
import { DateBadge, DetailsLink } from "./WhatsOnItems";
import { TRUST_LINE } from "./content/home";
import { findCity } from "./content/findCity";
import { HOME_TITLE } from "./content/slug";
import {
  WHATS_ON, CATEGORY_LABELS, WHATS_ON_PATH, WHATS_ON_TITLE, WHATS_ON_LEAD, WHATS_ON_NOTE, WHATS_ON_SUBMIT, whatsOnCta,
  upcoming, todayInGermany, citiesOf, citySlug, eventCitySlug, groupByMonth, whenText, placeText, isOnNow, whatsOnShareText,
} from "./content/whatson";

// ============================================================================
// WHAT'S ON (nriclub.app/whats-on): Indian events in Germany that other
// organisers run, from src/content/whatson.js, so a shared link shows them
// before anyone signs up. ?city=berlin opens the list at one city, and
// #<event id> at one event. The build writes the same list into the page's
// HTML (vite.config.js), for link previews and for browsers without
// JavaScript; past events never show in either.
// ============================================================================

const titleCase = (s) => s.replace(/(^|[\s-])(\p{L})/gu, (_, p, c) => p + c.toLocaleUpperCase());
const cityFromAddress = () => {
  try { return citySlug(new URLSearchParams(window.location.search).get("city") || ""); } catch (e) { return ""; }
};
const hashId = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)); } catch (e) { return ""; }
};

const chip = (active) => ({
  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, boxSizing: "border-box", padding: "0 16px", borderRadius: 999,
  fontSize: 14, fontWeight: active ? 600 : 500, textDecoration: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  border: `1px solid ${active ? INK : "#C9C8C5"}`, background: active ? INK : "#fff", color: active ? "#fff" : INK,
});

const ShareIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

function EventCard({ event: e, today, highlighted }) {
  const actionBase = { display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, boxSizing: "border-box", padding: "0 16px", borderRadius: 10, fontSize: 14, fontWeight: 600, textDecoration: "none" };
  return (
    <article id={e.id} tabIndex={-1} aria-labelledby={`wo-title-${e.id}`} className="wo-card" style={{
      display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: 16, padding: "18px 18px 16px", borderRadius: 14, background: "#fff", outline: "none",
      border: highlighted ? `2px solid ${SAFFRON_TEXT}` : "1px solid #ECEBE8", margin: highlighted ? -1 : 0,
      boxShadow: highlighted ? "0 6px 20px rgba(179,84,0,0.12)" : "none",
    }}>
      <DateBadge iso={e.start} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#45443F", background: "#F4F3F0", borderRadius: 999, padding: "3px 10px" }}>{CATEGORY_LABELS[e.category] || e.category}</span>
          {isOnNow(e, today) && <span style={{ fontSize: 12, fontWeight: 600, color: GREEN_TEXT, background: "#EDF7EC", borderRadius: 999, padding: "3px 10px" }}>On now</span>}
        </div>
        <h3 id={`wo-title-${e.id}`} style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, letterSpacing: "-0.01em", margin: "0 0 6px", overflowWrap: "anywhere" }}>{e.title}</h3>
        <p style={{ fontSize: 14, fontWeight: 600, margin: 0, lineHeight: 1.5 }}><time dateTime={e.start}>{whenText(e)}</time></p>
        <p style={{ fontSize: 14, color: MUTED, margin: "2px 0 0", lineHeight: 1.5, overflowWrap: "anywhere" }}>{placeText(e)}</p>
        <p style={{ fontSize: 14, color: MUTED, margin: "2px 0 0", lineHeight: 1.5, overflowWrap: "anywhere" }}>
          Organised by <span style={{ color: INK }}>{e.organiser}</span>
          {e.price && <> · <span style={{ color: INK, fontWeight: 600 }}>{e.price}</span></>}
          {e.language && <> · {e.language}</>}
        </p>
      </div>
      {/* Under the text column; on phones across the whole card. */}
      <div className="wo-card-more" style={{ gridColumn: 2, minWidth: 0 }}>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: "#45443F", margin: "10px 0 0", overflowWrap: "anywhere" }}>{e.summary}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          <DetailsLink event={e} style={{ ...actionBase, background: INK, color: "#fff", border: `1px solid ${INK}` }} />
          <a href={whatsappShare(whatsOnShareText(e))} target="_blank" rel="noopener noreferrer" style={{ ...actionBase, background: "#fff", color: INK, border: "1px solid #C9C8C5" }}>
            <ShareIcon /> Share<span className="nc-sr-only"> {e.title} on WhatsApp (opens in a new tab)</span>
          </a>
        </div>
      </div>
    </article>
  );
}

export default function WhatsOnPage({ onJoin, onLogin }) {
  useCanonical(WHATS_ON_PATH);
  const today = useMemo(() => todayInGermany(), []);
  // Past events never show, also when the page was built before they ended.
  const events = useMemo(() => upcoming(WHATS_ON, today), [today]);
  const cities = useMemo(() => citiesOf(events), [events]);
  const [city, setCity] = useState(cityFromAddress);
  const [category, setCategory] = useState("all");
  const [target, setTarget] = useState(""); // the event #<id> points at
  const [gone, setGone] = useState(false); // #<id> points at an event that's no longer listed
  const cityRef = useRef(city);
  cityRef.current = city;

  useEffect(() => {
    document.title = `${WHATS_ON_TITLE} · NRIClub`;
    return () => { document.title = HOME_TITLE; };
  }, []);

  // A link to one event (/whats-on#<id>, from Share): open the list at it,
  // whatever city the address names.
  useEffect(() => {
    const open = () => {
      const id = hashId();
      if (!id) return;
      const e = events.find((x) => x.id === id);
      if (!e) { setGone(true); return; }
      setGone(false);
      setCategory("all");
      if (cityRef.current && cityRef.current !== eventCitySlug(e)) {
        setCity("");
        try { window.history.replaceState(window.history.state, "", `${WHATS_ON_PATH}#${encodeURIComponent(id)}`); } catch (err) {}
      }
      setTarget(id);
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [events]);
  useEffect(() => {
    if (!target) return;
    const el = document.getElementById(target);
    if (el) { el.scrollIntoView({ block: "start" }); el.focus({ preventScroll: true }); }
  }, [target]);

  const chooseCity = (next) => (ev) => {
    ev.preventDefault();
    setCity(next);
    setCategory("all");
    setTarget("");
    setGone(false);
    try { window.history.replaceState(window.history.state, "", next ? `${WHATS_ON_PATH}?city=${encodeURIComponent(next)}` : WHATS_ON_PATH); } catch (e) {}
  };

  const cityName = city ? (cities.find((c) => c.slug === city)?.name || findCity(city) || titleCase(city.replace(/-/g, " "))) : "";
  const inCity = city ? events.filter((e) => eventCitySlug(e) === city) : events;
  const categories = Object.keys(CATEGORY_LABELS).filter((k) => inCity.some((e) => e.category === k));
  const activeCategory = categories.includes(category) ? category : "all";
  const shown = activeCategory === "all" ? inCity : inCity.filter((e) => e.category === activeCategory);
  const months = groupByMonth(shown, today);
  const selectedHasNone = city && !cities.some((c) => c.slug === city);

  const hero = (
    <div style={{ ...section, paddingTop: "clamp(20px, 5vh, 48px)", paddingBottom: 28, textAlign: "center" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 8px", borderRadius: 999, background: "#fff", border: "1px solid #ECEBE8", fontSize: 13, fontWeight: 500, color: MUTED, marginBottom: 20 }}>
        <LogoMark size={18} /> What's on in Germany
      </div>
      <h1 style={{ fontSize: "clamp(32px, 5.5vw, 52px)", fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.04em", margin: "0 auto 14px", maxWidth: 720 }}>{WHATS_ON_TITLE}</h1>
      <p style={{ fontSize: "clamp(16px, 1.8vw, 18px)", lineHeight: 1.6, color: MUTED, maxWidth: 600, margin: "0 auto" }}>{WHATS_ON_LEAD}</p>
    </div>
  );

  const join = (
    <div style={{ marginTop: 32, padding: "24px 20px", borderRadius: 14, border: "1px solid #ECEBE8", background: "#FCFCFB", textAlign: "center" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", margin: "0 auto 6px", maxWidth: 520 }}>
        {shown.length ? whatsOnCta(cityName) : `Meet Indians in ${cityName || "your city"}`}
      </h2>
      <p style={{ fontSize: 14, color: MUTED, margin: "0 auto 16px", maxWidth: 480, lineHeight: 1.6 }}>NRIClub is a free community for Indians abroad: your city's group, meetups and festivals with members, desi places and answers from people who've been there.</p>
      <button type="button" onClick={onJoin} style={primaryBtn}>Join NRIClub free</button>
      <p style={{ fontSize: 13, color: MUTED, margin: "12px 0 0" }}><Phrases text={TRUST_LINE} /></p>
    </div>
  );

  return (
    <PublicShell onLogin={onLogin} onJoin={onJoin} hero={hero}>
      {/* Phones: summary and buttons across the card; the types scroll sideways. */}
      <style>{`@media (max-width: 520px) {
        .wo-card { column-gap: 14px !important; padding: 16px 14px 14px !important; }
        .wo-card .wo-card-more { grid-column: 1 / -1 !important; }
        .wo-types { flex-wrap: nowrap !important; overflow-x: auto; margin: 0 -24px; padding: 2px 24px 4px; scrollbar-width: none; }
        .wo-types::-webkit-scrollbar { display: none; }
        .wo-types > button { flex-shrink: 0; }
      }`}</style>
      <section aria-label="Events" style={{ ...section, paddingBottom: 16 }}>
        <p role="note" style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "0 0 20px", padding: "12px 14px", borderRadius: 12, background: "#FAFAF8", border: "1px solid #ECEBE8", fontSize: 14, lineHeight: 1.55, color: "#45443F" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
          <span>{WHATS_ON_NOTE}</span>
        </p>

        {gone && <p role="status" style={{ fontSize: 14, color: MUTED, margin: "0 0 16px" }}>That event has passed or isn't listed any more. Here's what's on now.</p>}

        {events.length > 0 && (
          <div style={{ display: "grid", gap: 10, marginBottom: 8 }}>
            <nav aria-label="Events by city">
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <li><a href={WHATS_ON_PATH} onClick={chooseCity("")} aria-current={!city ? "true" : undefined} style={chip(!city)}>All cities</a></li>
                {cities.map((c) => (
                  <li key={c.slug}>
                    <a href={`${WHATS_ON_PATH}?city=${encodeURIComponent(c.slug)}`} onClick={chooseCity(c.slug)} aria-current={city === c.slug ? "true" : undefined} style={chip(city === c.slug)}>
                      {c.name} <span style={{ fontSize: 12, opacity: 0.75 }}>{c.count}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            {categories.length > 1 && (
              <div role="group" aria-label="Type of event" className="wo-types" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {["all", ...categories].map((k) => (
                  <button key={k} type="button" aria-pressed={activeCategory === k} onClick={() => { setCategory(k); setTarget(""); }}
                    style={{ ...chip(activeCategory === k), minHeight: 40, padding: "0 14px", fontSize: 13, background: activeCategory === k ? "#F4F3F0" : "#fff", color: INK, border: `1px solid ${activeCategory === k ? "#8F8E8B" : "#E0DFDB"}` }}>
                    {k === "all" ? "All types" : CATEGORY_LABELS[k]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <p aria-live="polite" style={{ fontSize: 13, color: MUTED, margin: "10px 0 0", minHeight: 20 }}>
          {events.length > 0 && shown.length > 0 && `${shown.length} ${shown.length === 1 ? "event" : "events"}${cityName ? ` in ${cityName}` : " across Germany"}${activeCategory !== "all" ? ` · ${CATEGORY_LABELS[activeCategory]}` : ""}`}
        </p>

        {events.length === 0 ? (
          <div style={{ marginTop: 8, padding: "28px 20px", borderRadius: 14, border: "1px dashed #D9D8D4", textAlign: "center" }}>
            <h2 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 6px" }}>No events listed right now</h2>
            <p style={{ fontSize: 15, color: MUTED, margin: "0 auto", maxWidth: 460, lineHeight: 1.6 }}>We list Indian festivals, concerts and meetups across Germany as organisers announce them. Check back soon.</p>
          </div>
        ) : shown.length === 0 ? (
          <div style={{ marginTop: 8, padding: "24px 20px", borderRadius: 14, border: "1px dashed #D9D8D4", textAlign: "center" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>{selectedHasNone ? `Nothing listed in ${cityName} right now` : "Nothing of this type listed right now"}</h2>
            <p style={{ fontSize: 15, margin: 0 }}><a href={WHATS_ON_PATH} onClick={chooseCity("")} style={{ display: "inline-block", padding: "8px 4px", color: INK, fontWeight: 600 }}>See what's on across Germany</a></p>
          </div>
        ) : months.map((m) => (
          <section key={m.key} aria-labelledby={`wo-month-${m.key}`} style={{ marginTop: 18 }}>
            <h2 id={`wo-month-${m.key}`} style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: SAFFRON_TEXT, margin: "0 0 10px" }}>{m.label}</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
              {m.events.map((e) => <li key={e.id}><EventCard event={e} today={today} highlighted={e.id === target} /></li>)}
            </ul>
          </section>
        ))}

        {join}

        <p style={{ fontSize: 14, color: MUTED, textAlign: "center", margin: "24px auto 0", maxWidth: 560, lineHeight: 1.6 }}>
          {WHATS_ON_SUBMIT}{" "}
          <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("An event for What's on")}`} style={{ color: INK, fontWeight: 600, display: "inline-block", padding: "4px 0" }}>{SUPPORT_EMAIL}</a>
        </p>
      </section>
    </PublicShell>
  );
}
