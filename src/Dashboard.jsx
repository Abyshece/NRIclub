import { Fragment, useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import * as api from "./supabaseApi";
import FlagIcon from "./FlagIcon";
import "./member/base.css";
import GetVerified from "./member/GetVerified";
import CodeEntry from "./member/CodeEntry";
import { VerificationBanner, RejectedScreen, WaitingForReview } from "./member/VerificationBanner";
import ProfileChecklist, { setupSteps, useProfileCardDismissed } from "./member/ProfileChecklist";
import { TermsContent, PrivacyContent, ImpressumContent, TermsModal, PrivacyModal, TERMS_VERSION } from "./member/LegalModals";
import { hasImprint } from "./content/imprint";
import { WelcomeNotice, VerifiedNotice, NeedsInfoNotice, CatchUpNotice, ToastStack, welcomeDue, lastCatchUp, rememberNotice, CATCH_UP_EVERY_MS } from "./member/Notices";
import { downloadMyData, useAccountActions } from "./member/AccountActions";
import { rateLimiter } from "./rateLimiter";
import { upcomingFestival } from "./festivals";
import { slug, HOME_TITLE } from "./content/slug";
import { MentoringPage, MentorsList, BookingModal, MentorProfileCard, MentorBadge } from "./member/Mentoring";
import { mapProfile, linkedinProblem, authErrorMessage, apiErrorMessage, isNetworkError, NETWORK_MESSAGE, cityFromGroupName, isWaitingForReview } from "./member/profile";
import { findCity } from "./content/findCity";


// ============================================================================
// CONTEXT & STATE MANAGEMENT
// ============================================================================
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

// ============================================================================
// CONSTANTS
// ============================================================================
const INDIAN_CITIES = [
  "Mumbai",
  "Delhi",
  "Bangalore",
  "Hyderabad",
  "Chennai",
  "Kolkata",
  "Pune",
  "Ahmedabad",
  "Jaipur",
  "Surat",
  "Lucknow",
  "Chandigarh",
  "Indore",
  "Kochi",
];

// Helper to check if a user is NRI based on their current city
// Returns true if user lives OUTSIDE India, false if they live in an Indian city
// Sanitize user inputs to prevent XSS
// Security: Input sanitization
const sanitize = (str) => {
  if (typeof str !== "string") return str;
  return str
    .replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/javascript:/gi, "").replace(/on\w+=/gi, "")
    .replace(/data:/gi, "").replace(/vbscript:/gi, "")
    .replace(/eval\(/gi, "").replace(/expression\(/gi, "");
};

// Security: Validate and reject oversized/malformed input
const validateInput = (str, maxLen = 5000) => {
  if (typeof str !== "string") return "";
  if (str.length > maxLen) return str.substring(0, maxLen);
  return sanitize(str.trim());
};


// Older events keep the time in the date ("Mar 25, 2026 • 10:00 AM"); new
// ones have a date picker value ("2026-11-14") and a separate time.
const eventDate = (e) => {
  const d = (e.date || "").split("•")[0].trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return new Date(d + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const eventTime = (e) => (e.date || "").split("•")[1]?.trim() || e.time || "TBD";
// The day an event happens, as a time to sort by, or null if its date can't be read.
const eventDay = (e) => {
  const t = new Date(eventDate(e)).getTime();
  return Number.isNaN(t) ? null : t;
};
// An event's start and end for calendars: its date and, when it can be
// read, its time (two hours long); otherwise the whole day.
const calendarRange = (e) => {
  const day = eventDay(e);
  if (day === null) return null;
  const t = /(\d{1,2})[:.](\d{2})\s*(am|pm)?/i.exec(eventTime(e) || "");
  if (!t) return { start: new Date(day), allDay: true };
  let h = Number(t[1]);
  if (t[3]) h = (h % 12) + (/pm/i.test(t[3]) ? 12 : 0);
  const start = new Date(day);
  start.setHours(h, Number(t[2]), 0, 0);
  return { start, end: new Date(start.getTime() + 2 * 3600 * 1000), allDay: false };
};
const calStamp = (d, allDay) => {
  const p = (n) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  return allDay ? date : `${date}T${p(d.getHours())}${p(d.getMinutes())}00`;
};
const googleCalendarUrl = (e) => {
  const r = calendarRange(e);
  if (!r) return null;
  const end = r.allDay ? new Date(r.start.getTime() + 86400000) : r.end;
  const q = new URLSearchParams({ action: "TEMPLATE", text: e.title || "Event", dates: `${calStamp(r.start, r.allDay)}/${calStamp(end, r.allDay)}`, details: e.description || "", location: e.location || "" });
  return `https://calendar.google.com/calendar/render?${q}`;
};
const downloadIcs = (e) => {
  const r = calendarRange(e);
  if (!r) return;
  const esc = (v) => String(v || "").replace(/[\\,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const end = r.allDay ? new Date(r.start.getTime() + 86400000) : r.end;
  const val = r.allDay ? ";VALUE=DATE" : "";
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NRIClub//Events//EN", "BEGIN:VEVENT",
    `UID:${e.id}@nriclub`, `DTSTAMP:${calStamp(new Date(), false)}`, `DTSTART${val}:${calStamp(r.start, r.allDay)}`, `DTEND${val}:${calStamp(end, r.allDay)}`,
    `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.description)}`, `LOCATION:${esc(e.location)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${(e.title || "event").replace(/[^\w -]/g, "").slice(0, 40) || "event"}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const isPastEvent = (e) => {
  const t = eventDay(e);
  return t !== null && t < new Date().setHours(0, 0, 0, 0);
};
// Events from today on, soonest first (any whose date can't be read last),
// then past events, most recent first.
const orderEvents = (list) => {
  const byDay = (a, b) => {
    const x = eventDay(a), y = eventDay(b);
    if (x === null || y === null) return (x === null) - (y === null);
    return x - y;
  };
  return [...list.filter(e => !isPastEvent(e)).sort(byDay), ...list.filter(isPastEvent).sort((a, b) => byDay(b, a))];
};

// A listing's photos are stored as a JSON list of image links (older ones as
// a single link). Anything else gives no photos instead of breaking the page.
const listingPhotos = (value) => {
  if (!value || typeof value !== "string") return [];
  let parsed;
  try { parsed = JSON.parse(value); } catch (e) { parsed = [value]; }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(p => typeof p === "string" && /^https?:\/\//i.test(p));
};

// The tags stored with a post: its hashtags, each once, plus the
// "__external__" marker for posts with a link. Kept within the database's
// limits (30 tags, 1,500 characters in all) so a post can always be published.
const EXTERNAL_TAG = "__external__";
const postTags = (content, hasLink) => {
  const tags = [];
  let room = 30 - (hasLink ? 1 : 0);
  let chars = 1500 - (hasLink ? EXTERNAL_TAG.length : 0);
  for (const h of content.match(/#(\w+)/g) || []) {
    const tag = h.slice(1);
    if (!room) break;
    if (tags.includes(tag) || tag.length > chars) continue;
    tags.push(tag);
    room -= 1;
    chars -= tag.length;
  }
  if (hasLink) tags.push(EXTERNAL_TAG);
  return tags;
};

// Joined in the last 30 days: shown with a small "New" badge so others can
// welcome them.
const isNewMember = (createdAt) => !!createdAt && Date.now() - new Date(createdAt).getTime() < 30 * 86400000;
const NewBadge = () => (
  <span title="Joined in the last 30 days" style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, letterSpacing: "0.05em", background: "#FFF3E0", color: "#C2410C", border: "1px solid #FED7AA" }}>NEW</span>
);

// A city ambassador: welcomes newcomers and runs the city's group and events.
const AmbassadorBadge = ({ city }) => city ? (
  <span title={`NRIClub ambassador for ${city}`} style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, letterSpacing: "0.05em", background: "#EEF2FF", color: "#000080", border: "1px solid #C7D2FE", whiteSpace: "nowrap" }}>AMBASSADOR · {city.toUpperCase()}</span>
) : null;

// Market categories as members see them, and what each one asks for.
const MARKET_LABELS = { Housing: "Housing & roommates", Referrals: "Job referrals", Travel: "Travel companion" };
const marketLabel = (c) => MARKET_LABELS[c] || c;
const MARKET_FORM = {
  Housing: { title: "e.g. Room in a 2-bedroom flat, Kreuzberg", price: "Rent / month", pricePh: "e.g. €650", desc: "Area, move-in date, who you're looking for..." },
  Jobs: { title: "e.g. Hiring: Java developer", price: "Salary (optional)", pricePh: "e.g. €60k", desc: "Role, company, how to apply..." },
  Referrals: { title: "e.g. I can refer at Siemens (software roles)", price: null, desc: "Which company and roles, or which referral you're looking for..." },
  Travel: { title: "e.g. Delhi → Frankfurt, 12 Dec (LH 761)", price: null, desc: "Who is travelling (e.g. my parents), and what help they'd like..." },
};
const marketForm = (c) => MARKET_FORM[c] || { title: "What are you selling?", price: "Price", pricePh: "e.g. €50", desc: "Describe your item..." };

const isUserNRI = (userOrLocation) => {
  // The country chosen when getting verified decides when it's known.
  const countryCode = typeof userOrLocation === "object" && userOrLocation ? (userOrLocation.countryCode || userOrLocation.country_code) : "";
  if (countryCode) return countryCode !== "IN";
  const loc = typeof userOrLocation === "string" ? userOrLocation : (userOrLocation?.location || userOrLocation?.currentCity || "");
  if (/,\s*india\s*$/i.test(loc)) return false;
  if (!loc) {
    // No location - fall back to isNRI flag or yearsAbroad
    if (typeof userOrLocation === "object" && userOrLocation) {
      if (userOrLocation.isNRI === false) return false;
      if (userOrLocation.yearsAbroad === "Not lived abroad") return false;
      if (userOrLocation.isNRI === true) return true;
    }
    return false; // default to non-NRI if we can't tell
  }
  // Check if location matches any Indian city (case-insensitive, partial match)
  const locLower = loc.toLowerCase().trim();
  const isInIndianCity = INDIAN_CITIES.some(c => locLower.includes(c.toLowerCase()) || c.toLowerCase().includes(locLower));
  return !isInIndianCity;
};

const GLOBAL_CITIES = [
  "Aachen", "Augsburg", "Berlin", "Bielefeld", "Bochum",
  "Bonn", "Braunschweig", "Bremen", "Chemnitz", "Cologne",
  "Darmstadt", "Dortmund", "Dresden", "Duisburg", "Düsseldorf",
  "Erlangen", "Essen", "Frankfurt", "Freiburg", "Göttingen",
  "Hamburg", "Hannover", "Heidelberg", "Ingolstadt", "Jena",
  "Karlsruhe", "Kassel", "Kiel", "Leipzig", "Leverkusen",
  "Lübeck", "Magdeburg", "Mainz", "Mannheim", "Mönchengladbach",
  "Munich", "Münster", "Nuremberg", "Offenbach", "Oldenburg",
  "Osnabrück", "Paderborn", "Potsdam", "Regensburg", "Rostock",
  "Saarbrücken", "Stuttgart", "Ulm", "Wiesbaden", "Wolfsburg",
];

const OCCUPATION_TYPES = [
  "Working Professional",
  "Student",
  "Business Owner",
  "Homemaker",
  "Looking for Opportunities",
];

const YEARS_OPTIONS = [
  "Less than 1 year",
  "1-3 years",
  "3-5 years",
  "5-10 years",
  "10+ years",
  "Born Abroad",
];

// ============================================================================
// ICONS (inline SVG to avoid dependencies)
// ============================================================================
const Icon = ({ d, size = 20, fill = "none", stroke = "currentColor", strokeWidth = 1.8, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const Icons = {
  globe: (p) => <Icon {...p} d={["M12 2a10 10 0 100 20 10 10 0 000-20z", "M2 12h20", "M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"]} />,
  home: (p) => <Icon {...p} d={["M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z", "M9 22V12h6v10"]} />,
  users: (p) => <Icon {...p} d={["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2", "M9 7a4 4 0 100 8 4 4 0 000-8z", "M23 21v-2a4 4 0 00-3-3.87", "M16 3.13a4 4 0 010 7.75"]} />,
  calendar: (p) => <Icon {...p} d={["M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z", "M16 2v4", "M8 2v4", "M3 10h18"]} />,
  search: (p) => <Icon {...p} d={["M11 19a8 8 0 100-16 8 8 0 000 16z", "M21 21l-4.35-4.35"]} />,
  send: (p) => <Icon {...p} d={["M22 2L11 13", "M22 2l-7 20-4-9-9-4z"]} />,
  heart: (p) => <Icon {...p} d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />,
  message: (p) => <Icon {...p} d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
  plus: (p) => <Icon {...p} d={["M12 5v14", "M5 12h14"]} />,
  x: (p) => <Icon {...p} d={["M18 6L6 18", "M6 6l12 12"]} />,
  check: (p) => <Icon {...p} d="M20 6L9 17l-5-5" />,
  arrow: (p) => <Icon {...p} d={["M5 12h14", "M12 5l7 7-7 7"]} />,
  mapPin: (p) => <Icon {...p} d={["M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z", "M12 7a3 3 0 100 6 3 3 0 000-6z"]} />,
  logout: (p) => <Icon {...p} d={["M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4", "M16 17l5-5-5-5", "M21 12H9"]} />,
  menu: (p) => <Icon {...p} d={["M3 12h18", "M3 6h18", "M3 18h18"]} />,
  edit: (p) => <Icon {...p} d={["M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7", "M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"]} />,
  trash: (p) => <Icon {...p} d={["M3 6h18", "M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"]} />,
  image: (p) => <Icon {...p} d={["M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z", "M8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z", "M21 15l-5-5L5 21"]} />,
  trending: (p) => <Icon {...p} d={["M23 6l-9.5 9.5-5-5L1 18", "M17 6h6v6"]} />,
  bell: (p) => <Icon {...p} d={["M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9", "M13.73 21a2 2 0 01-3.46 0"]} />,
  settings: (p) => <Icon {...p} d={["M12 15a3 3 0 100-6 3 3 0 000 6z", "M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"]} />,
  share: (p) => <Icon {...p} d={["M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8", "M16 6l-4-4-4 4", "M12 2v13"]} />,
  briefcase: (p) => <Icon {...p} d={["M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z", "M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"]} />,
  shield: (p) => <Icon {...p} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  info: (p) => <Icon {...p} d={["M12 22a10 10 0 100-20 10 10 0 000 20z", "M12 16v-4", "M12 8h.01"]} />,
  star: (p) => <Icon {...p} d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />,
  user: (p) => <Icon {...p} d={["M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2", "M12 3a4 4 0 100 8 4 4 0 000-8z"]} />,
  shop: (p) => <Icon {...p} d={["M6 2L3 8v12a2 2 0 002 2h14a2 2 0 002-2V8l-3-6z", "M3 8h18", "M16 12a4 4 0 01-8 0"]} />,
  help: (p) => <Icon {...p} d={["M12 22a10 10 0 100-20 10 10 0 000 20z", "M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3", "M12 17h.01"]} />,
  file: (p) => <Icon {...p} d={["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8", "M10 9H8"]} />,
  link: (p) => <Icon {...p} d={["M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71", "M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"]} />,
  eye: (p) => <Icon {...p} d={["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "M12 9a3 3 0 100 6 3 3 0 000-6z"]} />,
  filter: (p) => <Icon {...p} d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />,
  chevronLeft: (p) => <Icon {...p} d="M15 18l-6-6 6-6" />,
  chevronRight: (p) => <Icon {...p} d="M9 18l6-6-6-6" />,
  dots: (p) => <Icon {...p} d={["M12 13a1 1 0 100-2 1 1 0 000 2z", "M19 13a1 1 0 100-2 1 1 0 000 2z", "M5 13a1 1 0 100-2 1 1 0 000 2z"]} fill="currentColor" stroke="none" />,
  linkedin: (p) => <Icon {...p} d={["M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z", "M2 9h4v12H2z", "M4 2a2 2 0 100 4 2 2 0 000-4z"]} />,
  clock: (p) => <Icon {...p} d={["M12 22a10 10 0 100-20 10 10 0 000 20z", "M12 6v6l4 2"]} />,
  external: (p) => <Icon {...p} d={["M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6", "M15 3h6v6", "M10 14L21 3"]} />,
  flag: (p) => <Icon {...p} d={["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22v-7"]} />,
};


function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function generateAvatar(name) {
  const colors = ["#E8D5B7", "#B8C9A3", "#A3B8C9", "#C9A3B8", "#C9B8A3", "#A3C9B8"];
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const color = colors[name.length % colors.length];
  return { initials, color };
}

const Avatar = ({ name, size = 40, url, className = "" }) => {
  const { initials, color } = generateAvatar(name || "U");
  return (
    <div
      className={className}
      style={{
        width: size, height: size, borderRadius: "50%", background: color,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.35, fontWeight: 700, color: "#37352F", flexShrink: 0,
        border: "1px solid rgba(55,53,47,0.08)", overflow: "hidden", position: "relative",
      }}
    >
      {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }} onError={(e) => { e.target.style.display = "none"; }} /> : initials}
    </div>
  );
};

const InfoBanner = ({ text }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#EDF4FF", borderRadius: 10, border: "1px solid #DBEAFE", marginBottom: 20 }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B9CFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
    <p style={{ fontSize: 12, color: "#3D5A9F", lineHeight: 1.4, fontFamily: "'DM Sans', sans-serif" }}>{text}</p>
  </div>
);

// Comments, chat messages, doc comments and help responses can be up to
// 5,000 characters (the database's limit). The count shows once a text gets
// close to it.
const TEXT_LIMIT = 5000;
const CharCount = ({ value, max = TEXT_LIMIT, style }) => (value || "").length < max - 500 ? null : (
  <div style={{ fontSize: 11, color: value.length >= max ? "#DC2626" : "#9B9A97", textAlign: "right", marginTop: 4, fontFamily: "'DM Sans', sans-serif", ...style }}>
    {value.length.toLocaleString("en-US")} / {max.toLocaleString("en-US")}
  </div>
);

// ============================================================================
// LOGIN PAGE
// ============================================================================
// notice: a confirmation to show above the form (e.g. after a new password).
// onBack: back to the landing page.
const LoginPage = ({ onComplete, onSignUp, onBack, initialEmail = "", notice = "" }) => {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  // Signed up but never entered the email code: offer a new one and take it
  // right here.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [codeMode, setCodeMode] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const font = "'DM Sans', sans-serif";
  const cleanEmail = email.trim().toLowerCase();

  // Load the profile for the session that was just started; on failure the
  // caller signs out again so no half-finished login is kept.
  const finishLogin = async () => {
    const dbProfile = await api.getMyProfile();
    if (!dbProfile) throw new Error("No profile");
    rateLimiter.reset("login_" + cleanEmail);
    onComplete(mapProfile({ ...dbProfile, email: dbProfile.email || cleanEmail }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setUnconfirmed(false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setError("Please enter a valid email address."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    // Rate limiting: max 5 attempts per 15 minutes
    const rl = rateLimiter.check("login_" + cleanEmail, 5, 900000);
    if (!rl.allowed) {
      setError(`Too many login attempts. Please wait ${Math.ceil(rl.waitSecs / 60)} minutes.`);
      return;
    }
    setLoading(true);
    try {
      await api.signIn(cleanEmail, password);
    } catch (err) {
      const msg = (err.message || "").toLowerCase();
      if (msg.includes("not confirmed")) {
        setUnconfirmed(true);
        setError("You haven't confirmed your email address yet. We'll send you a new 6-digit code.");
      } else if (msg.includes("invalid login credentials")) {
        setError("That email and password don't match. Try again, or reset your password.");
      } else {
        setError(authErrorMessage(err) || err.message || "We couldn't log you in. Please try again.");
      }
      setLoading(false);
      return;
    }
    try {
      await finishLogin();
    } catch (err) {
      await api.signOut();
      setError("We couldn't load your profile. Please try again in a moment.");
      setLoading(false);
    }
  };

  const sendCode = async () => {
    if (sendingCode) return;
    setSendingCode(true);
    try {
      await api.sendOtp(cleanEmail);
      setResendAt(Date.now() + 60000);
      setError("");
      setCodeMode(true);
    } catch (err) {
      // A code was sent moments ago: let them enter that one.
      const wait = /after (\d+) seconds?/i.exec(err.message || "");
      if (wait) {
        setResendAt(Date.now() + Number(wait[1]) * 1000);
        setError("");
        setCodeMode(true);
      } else {
        setError(authErrorMessage(err) || "We couldn't send a code. Please try again in a minute.");
      }
    }
    setSendingCode(false);
  };

  const verifyCode = async (code) => {
    let session = await api.verifyOtp(cleanEmail, code); // wrong codes throw here
    try {
      if (!session?.access_token) session = await api.signIn(cleanEmail, password).catch(() => null);
      if (!session?.access_token) throw Object.assign(new Error("No session"), { userMessage: "Your email is confirmed. Please log in." });
      await finishLogin();
    } catch (err) {
      if (err.userMessage) throw err;
      await api.signOut();
      throw Object.assign(new Error("Login failed"), {
        userMessage: isNetworkError(err) ? NETWORK_MESSAGE : "Your email is confirmed, but we couldn't load your profile. Please log in again.",
      });
    }
  };

  const handleResetPassword = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setError("Please enter your email first."); return; }
    setLoading(true);
    setError("");
    try {
      await api.resetPassword(cleanEmail);
      setResetSent(true);
    } catch(e) {
      setError(authErrorMessage(e) || e.message || "Failed to send reset email.");
    }
    setLoading(false);
  };

  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E0E0DE",
    fontSize: 14, background: "#FAFAF8", outline: "none", color: "#37352F",
    fontFamily: font, boxSizing: "border-box",
  };
  const labelStyle = { display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontFamily: font };
  const errorStyle = { padding: "12px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, marginBottom: 16, fontSize: 13, lineHeight: 1.5, color: "#B91C1C", fontFamily: font };

  if (codeMode) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 16px", background: "#FAFAF8" }}>
        <div style={{ maxWidth: 400, width: "100%" }}>
          <CodeEntry
            email={cleanEmail}
            onVerify={verifyCode}
            onResend={async () => { await api.sendOtp(cleanEmail); setResendAt(Date.now() + 60000); }}
            resendAt={resendAt}
            onChangeEmail={() => { setCodeMode(false); setUnconfirmed(false); setError(""); }}
            changeLabel="Back to login"
            submitLabel="Verify and log in"
          />
        </div>
      </div>
    );
  }

  if (resetMode) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 16px", background: "#FAFAF8" }}>
        <div style={{ maxWidth: 360, width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ width: 48, height: 48, background: "#F0EFED", borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
              {Icons.shield({ size: 24, stroke: "#37352F" })}
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#37352F", fontFamily: font }}>Reset your password</h2>
            {!resetSent && <p style={{ color: "#6B6A67", fontSize: 14, marginTop: 8, fontFamily: font }}>Enter your email and we'll send you a reset link</p>}
          </div>
          {error && <div role="alert" style={errorStyle}>{error}</div>}
          {resetSent ? (
            <div style={{ padding: "20px", background: "#E3FCEF", borderRadius: 10, textAlign: "center", marginBottom: 20 }}>
              <p style={{ fontSize: 14, lineHeight: 1.5, color: "#126B45", fontFamily: font, margin: 0, overflowWrap: "anywhere" }}>We sent a reset link to <strong>{cleanEmail}</strong>. It can take a few minutes. Can't find it? Check your spam folder.</p>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); handleResetPassword(); }} noValidate>
              <div style={{ marginBottom: 20 }}>
                <label htmlFor="reset-email" style={labelStyle}>Email</label>
                <input id="reset-email" style={inputStyle} type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoFocus />
              </div>
              <button type="submit" disabled={loading} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", fontSize: 15, fontWeight: 600, background: "#37352F", color: "#fff", cursor: "pointer", fontFamily: font }}>{loading ? "Sending..." : "Send reset link"}</button>
            </form>
          )}
          <p style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "#6B6A67", fontFamily: font }}>
            <button onClick={() => { setResetMode(false); setResetSent(false); setError(""); }} style={{ background: "none", border: "none", color: "#37352F", fontWeight: 600, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>Back to login</button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 16px", background: "#FAFAF8" }}>
      <div style={{ maxWidth: 360, width: "100%" }}>
        <button type="button" onClick={onBack} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: font, fontSize: 13, fontWeight: 500, color: "#6B6A67", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 20 }}>
          <span aria-hidden="true">←</span> Back
        </button>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "inline-block", marginBottom: 20 }}><FlagIcon size={48} /></div>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#37352F", fontFamily: font }}>Welcome back</h2>
          <p style={{ color: "#6B6A67", fontSize: 14, marginTop: 8, fontFamily: font }}>Log in to NRIClub</p>
        </div>

        {notice && !error && (
          <div role="status" style={{ padding: "12px 16px", background: "#E3FCEF", border: "1px solid #ABF5D1", borderRadius: 8, marginBottom: 16, fontSize: 13, lineHeight: 1.5, color: "#126B45", fontFamily: font }}>{notice}</div>
        )}
        {error && (
          unconfirmed ? (
            <div role="alert" style={{ ...errorStyle, background: "#FFF8E6", border: "1px solid #FCE7B2", color: "#7A4D00" }}>
              {error}
              <button type="button" onClick={sendCode} disabled={sendingCode} style={{ display: "block", marginTop: 10, padding: "8px 14px", borderRadius: 6, border: "none", background: "#37352F", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, opacity: sendingCode ? 0.7 : 1 }}>
                {sendingCode ? "Sending..." : "Send me a new code"}
              </button>
            </div>
          ) : (
            <div role="alert" style={errorStyle}>{error}</div>
          )
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="login-email" style={labelStyle}>Email</label>
            <input id="login-email" style={inputStyle} type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => { setEmail(e.target.value); if (unconfirmed) { setUnconfirmed(false); setError(""); } }} placeholder="you@email.com" autoFocus={!initialEmail} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label htmlFor="login-password" style={labelStyle}>Password</label>
            <div style={{ position: "relative" }}>
              <input id="login-password" style={{ ...inputStyle, paddingRight: 72 }} type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={!!initialEmail} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} aria-controls="login-password" style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#5F5E5B", fontSize: 13, fontWeight: 600, padding: "8px 10px", borderRadius: 6, fontFamily: font }}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <div style={{ textAlign: "right", marginBottom: 20 }}>
            <button type="button" onClick={() => { setResetMode(true); setError(""); }} style={{ background: "none", border: "none", color: "#2F6FD6", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, padding: "8px 4px" }}>Forgot password?</button>
          </div>
          <button
            type="submit" disabled={loading}
            style={{
              width: "100%", padding: "12px", borderRadius: 8, border: "none", fontSize: 15, fontWeight: 600,
              background: "#37352F", color: "#fff", cursor: loading ? "default" : "pointer", opacity: loading ? 0.75 : 1, fontFamily: font,
            }}
          >
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "#6B6A67", fontFamily: font }}>
          Don't have an account?{" "}
          <button onClick={onSignUp} style={{ background: "none", border: "none", color: "#37352F", fontWeight: 600, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
};

// The dashed card shown in place of a list that came up empty, with one way
// back to everything when filters or a search hid it.
// "Ask me about": the topics a member can help with (comma-separated, up to 5).
const topicList = (text) => [...new Set((text || "").split(",").map(t => t.trim().replace(/\s+/g, " ").slice(0, 40)).filter(Boolean))].slice(0, 5);
const TopicChips = ({ text, max = 5, onPick, center }) => {
  const topics = topicList(text).slice(0, max);
  if (!topics.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: center ? "center" : "flex-start" }}>
      {topics.map(t => onPick
        ? <button key={t} type="button" onClick={(e) => { e.stopPropagation(); onPick(t); }} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, border: "1px solid #C7D2FE", background: "#EEF2FF", color: "#3730A3", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>{t}</button>
        : <span key={t} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, border: "1px solid #C7D2FE", background: "#EEF2FF", color: "#3730A3", fontFamily: "'DM Sans', sans-serif" }}>{t}</span>)}
    </div>
  );
};

// Desi places: what members can add, and their signs.
const PLACE_KINDS = ["Grocery", "Restaurant", "Temple", "Shop", "Doctor", "Tax & accounts", "Lawyer", "Driving school", "Other"];
const PRO_KINDS = ["Doctor", "Tax & accounts", "Lawyer", "Driving school"];
const PLACE_ICON = { Grocery: "🛒", Restaurant: "🍛", Temple: "🛕", Shop: "🛍️", Doctor: "🩺", "Tax & accounts": "🧾", Lawyer: "⚖️", "Driving school": "🚗" };

// A question as the Ask page uses it (responses: the answer count, if known).
const toHelp = (h, responses) => ({
  id: h.id, userId: h.user_id, title: h.title, description: h.description, category: h.category, urgency: h.urgency, status: h.status,
  city: h.city || "", urgent: !!h.urgent || h.urgency === "High", bestResponseId: h.best_response_id || null,
  user: h.profiles?.name || "User", avatar: h.profiles?.avatar_url || "", timestamp: new Date(h.created_at).getTime(),
  responses: responses ?? (h.responses_count || 0),
});

// The small sign on a notification's avatar, by type.
const NOTIF_BADGE = { answer: "💬", thanks: "🙏", best: "✅", urgent: "🚨", rsvp: "📅", member: "👋", booking: "🤝", booking_cancelled: "✖️", review: "⭐" };

// For urgent questions: who to call first, and the Indian embassy's help.
const EmergencyHelp = () => (
  <div role="note" style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#7F1D1D", lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" }}>
    <strong>In an emergency, call the local emergency number first:</strong> 112 in Europe, 911 in the US and Canada, 999 in the UK, 000 in Australia, 111 in New Zealand.
    <br />Help from India: <a href="https://madad.gov.in" target="_blank" rel="noopener noreferrer" style={{ color: "#7F1D1D", fontWeight: 600 }}>MADAD consular help</a> · <a href="https://www.mea.gov.in/indian-missions-abroad-new.htm" target="_blank" rel="noopener noreferrer" style={{ color: "#7F1D1D", fontWeight: 600 }}>Find your Indian embassy or consulate</a>
  </div>
);

const EmptyCard = ({ text, action, onAction }) => (
  <div style={{ textAlign: "center", padding: 40, color: "#9B9A97", fontSize: 14, background: "#fff", borderRadius: 12, border: "1px dashed #E8E7E4", fontFamily: "'DM Sans', sans-serif" }}>
    <p>{text}</p>
    {action && (
      <button onClick={onAction} style={{ background: "none", border: "none", color: "#37352F", textDecoration: "underline", fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 6, padding: "6px 8px", fontFamily: "inherit" }}>{action}</button>
    )}
  </div>
);

// ============================================================================
// POST CARD
// ============================================================================
// The page an address points at. Every page has its own address, so links
// can be shared and the browser's Back and Forward buttons work.
//   /  /find  /groups[/id]  /events[/id]  /help  /docs[/id]  /market[/id]
//   /messages[/conversation id]  /profile  /u/<member id>  /post/<post id>
//   /city/<city> (the public city page's address; members get its group)
//   /guides[/<slug>] (the public guides; members get them in Guides)
//   /mentoring (your sessions and settings)  /mentors (Find → Mentors)
const parsePath = (path, selfId) => {
  const [, a = "", b = ""] = (path || "/").split("/");
  let id = "";
  try { id = decodeURIComponent(b); } catch (e) {}
  switch (a) {
    case "find": return { view: "network" };
    case "groups": return { view: "groups", pending: id ? { kind: "group", id } : null };
    case "events": return { view: "events", pending: id ? { kind: "event", id } : null };
    case "help": return { view: "help" };
    case "docs": return { view: "docs", pending: id ? { kind: "doc", id } : null };
    case "market": return { view: "market", pending: id ? { kind: "market", id } : null };
    case "messages": return { view: "messages", convo: id || null };
    case "profile": return { view: "profile" };
    case "u": return id && id !== selfId ? { view: "member", member: id } : { view: id ? "profile" : "network" };
    case "post": return { view: "home", post: id || null };
    case "city": return { view: "groups", pending: id ? { kind: "city", id } : null };
    case "guides": return { view: "docs", pending: id ? { kind: "guide", id } : null };
    case "mentoring": return { view: "mentoring" };
    case "mentors": return { view: "network", findTab: "mentors" };
    case "impressum": return { view: "home", legal: hasImprint() ? "impressum" : null };
    default: return { view: "home" };
  }
};

const PostCard = ({ post, user, onDelete, onLike, onReport, isReported, initialLiked, hideGroup, onOpenProfile, pinned, onPin }) => {
  const [liked, setLiked] = useState(initialLiked || false);
  const [likeCount, setLikeCount] = useState(post.likes || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState(post.comments || []);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const isOwner = user && post.userId === user.id;

  // Copies a link that opens this post (see the shared-link check in the
  // Dashboard). Without clipboard access the link is shown to copy by hand.
  const copyLink = async () => {
    const url = `${window.location.origin}/post/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch (e) {
      setShowMenu(false);
      prompt("Copy this link:", url);
      return;
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const toggleComments = async () => {
    const newShow = !showComments;
    setShowComments(newShow);
    if (newShow && !commentsLoaded) {
      setCommentsLoaded(true);
      try {
        const dbComments = await api.getComments(post.id);
        if (dbComments && dbComments.length) {
          setComments(dbComments.map(c => ({ id: c.id, user: c.profiles?.name || "User", avatar: c.profiles?.avatar_url || "", text: c.content, time: new Date(c.created_at).getTime() })));
        }
      } catch(e) {}
    }
  };

  const handleLike = async () => {
    setLiked(!liked);
    setLikeCount((p) => (liked ? p - 1 : p + 1));
    if (onLike) onLike(post.id, !liked);
    try {
      await api.toggleLike(post.id);
      if (!liked && post.userId && post.userId !== user?.id) {
        const actorId = user?.id && !user.id.startsWith("user_") ? user.id : null;
        try { await api.createNotification(post.userId, "like", `${user?.name || "Someone"} liked your post "${post.content.substring(0, 30)}..."`, actorId, post.id); } catch(ne) {}
      }
    } catch (e) {}
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    const c = { id: Date.now(), user: user?.name || "You", avatar: user?.avatar_url || "", text: newComment, time: Date.now() };
    setComments([...comments, c]);
    const commentText = newComment;
    setNewComment("");
    try {
      await api.addComment(post.id, commentText);
    } catch (e) {
      // Take the comment back out and give the text back.
      setComments(prev => prev.filter(x => x.id !== c.id));
      setNewComment(prev => prev || commentText);
      alert(isNetworkError(e) ? NETWORK_MESSAGE : "Your comment couldn't be posted. Please try again.");
      return;
    }
    if (post.userId && post.userId !== user?.id) {
      const actorId = user?.id && !user.id.startsWith("user_") ? user.id : null;
      try { await api.createNotification(post.userId, "comment", `${user?.name || "Someone"} commented: "${commentText.substring(0, 30)}..."`, actorId, post.id); } catch(ne) {}
    }
  };

  const author = post.author || {};
  const cardStyle = {
    background: "#fff", borderRadius: 12, border: "1px solid #E8E7E4",
    padding: 20, marginBottom: 16, transition: "box-shadow 0.15s",
    fontFamily: "'DM Sans', sans-serif",
  };

  return (
    <div data-post-id={post.id} style={{ ...cardStyle, position: "relative", opacity: isReported ? 0.4 : 1 }}>
      {pinned && <div style={{ fontSize: 11, fontWeight: 700, color: "#C2410C", letterSpacing: "0.04em", marginBottom: 10 }}>📌 PINNED · START HERE</div>}
      {isReported && <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.6)", borderRadius: 14, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}><span style={{ background: "#FEF2F2", color: "#DC2626", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>Reported — Under Review</span></div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" onClick={() => onOpenProfile?.(post.userId)} aria-label={`${author.name || "Member"}'s profile`} style={{ background: "none", border: "none", padding: 0, cursor: onOpenProfile ? "pointer" : "default", alignSelf: "flex-start" }}>
            <Avatar name={author.name || "User"} size={40} url={author.avatar_url} />
          </button>
          <div>
            <div onClick={() => onOpenProfile?.(post.userId)} style={{ fontWeight: 600, fontSize: 14, color: "#37352F", cursor: onOpenProfile ? "pointer" : "default" }}>{author.name}</div>
            <div style={{ fontSize: 12, color: "#9B9A97", marginTop: 2 }}>
              {author.profession} • {author.location}
            </div>
            {author.hometown && <div style={{ fontSize: 11, color: "#9B9A97", marginTop: 1 }}>From: {author.hometown}</div>}
            {post.groupName && !hideGroup && (
              <div style={{ fontSize: 10, color: "#5B9CFF", marginTop: 3, display: "flex", alignItems: "center", gap: 3, fontWeight: 600 }}>
                {Icons.users({ size: 10, stroke: "#5B9CFF" })} Posted in {post.groupName}
              </div>
            )}
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowMenu(!showMenu)} aria-label="Post options" aria-expanded={showMenu} style={{ background: "none", border: "none", cursor: "pointer", padding: 10, margin: -6, color: "#5F5E5B" }}>
            {Icons.dots({ size: 16 })}
          </button>
          {showMenu && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setShowMenu(false)} />
              <div style={{ position: "absolute", right: 0, top: "100%", background: "#fff", border: "1px solid #E8E7E4", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", zIndex: 20, minWidth: 140, overflow: "hidden" }}>
                <button onClick={copyLink} disabled={String(post.id).startsWith("p_")} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", color: "#37352F", fontSize: 13, whiteSpace: "nowrap" }}>
                  {linkCopied ? <>{Icons.check({ size: 14 })} Link copied</> : <>{Icons.link({ size: 14 })} Copy link</>}
                </button>
                {onPin && !String(post.id).startsWith("p_") && (
                  <button onClick={() => { setShowMenu(false); onPin(pinned ? null : post.id); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", color: "#37352F", fontSize: 13, textAlign: "left" }}>
                    📌 {pinned ? "Unpin" : "Pin to top"}
                  </button>
                )}
                {isOwner && onDelete ? (
                  <button onClick={() => { onDelete(post.id); setShowMenu(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", color: "#E00", fontSize: 13 }}>
                    {Icons.trash({ size: 14 })} Delete
                  </button>
                ) : (
                  <button onClick={() => { setShowMenu(false); if (onReport) onReport(post.id); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", color: "#37352F", fontSize: 13 }}>
                    {Icons.flag({ size: 14 })} Report
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <p style={{ fontSize: 14, lineHeight: 1.65, color: "#37352F", marginBottom: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{post.externalUrl ? post.content.replace(post.externalUrl, "").trim() : post.content}</p>

      {/* External Link Preview Card */}
      {post.externalUrl && (() => {
        const url = post.externalUrl;
        const getPlatform = (u) => {
          const lower = u.toLowerCase();
          if (lower.includes("tiktok.com")) return { name: "TikTok", color: "#000", emoji: "🎵", gradient: "linear-gradient(135deg, #25F4EE, #FE2C55)" };
          if (lower.includes("instagram.com")) return { name: "Instagram", color: "#E4405F", emoji: "📷", gradient: "linear-gradient(135deg, #833AB4, #FD1D1D, #FCB045)" };
          if (lower.includes("youtube.com") || lower.includes("youtu.be")) return { name: "YouTube", color: "#FF0000", emoji: "▶️", gradient: "linear-gradient(135deg, #FF0000, #CC0000)" };
          if (lower.includes("x.com") || lower.includes("twitter.com")) return { name: "X (Twitter)", color: "#000", emoji: "𝕏", gradient: "linear-gradient(135deg, #000, #333)" };
          if (lower.includes("linkedin.com")) return { name: "LinkedIn", color: "#0A66C2", emoji: "💼", gradient: "linear-gradient(135deg, #0A66C2, #004182)" };
          if (lower.includes("facebook.com") || lower.includes("fb.com")) return { name: "Facebook", color: "#1877F2", emoji: "👥", gradient: "linear-gradient(135deg, #1877F2, #0C5ECD)" };
          if (lower.includes("reddit.com")) return { name: "Reddit", color: "#FF4500", emoji: "🔺", gradient: "linear-gradient(135deg, #FF4500, #CC3700)" };
          if (lower.includes("spotify.com")) return { name: "Spotify", color: "#1DB954", emoji: "🎧", gradient: "linear-gradient(135deg, #1DB954, #169C46)" };
          try { const host = new URL(u).hostname.replace("www.", ""); return { name: host, color: "#5B9CFF", emoji: "🔗", gradient: "linear-gradient(135deg, #5B9CFF, #3B7BD8)" }; }
          catch { return { name: "Link", color: "#5B9CFF", emoji: "🔗", gradient: "linear-gradient(135deg, #5B9CFF, #3B7BD8)" }; }
        };
        const p = getPlatform(url);
        return (
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "block", maxWidth: "100%", marginBottom: 12, borderRadius: 12, overflow: "hidden", border: "1px solid #E8E7E4", textDecoration: "none", cursor: "pointer", transition: "box-shadow 0.15s" }} onMouseOver={(e) => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"} onMouseOut={(e) => e.currentTarget.style.boxShadow = "none"}>
            <div style={{ height: 110, background: p.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>
              <span>{p.emoji}</span>
            </div>
            <div style={{ padding: "12px 14px", background: "#fff", minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: p.color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#37352F", wordBreak: "break-all", lineHeight: 1.4 }}>Tap to open →</div>
              <div style={{ fontSize: 11, color: "#9B9A97", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url}</div>
            </div>
          </a>
        );
      })()}

      {/* Post Image */}
      {post.image && (
        <div style={{ marginBottom: 12, borderRadius: 10, overflow: "hidden", border: "1px solid #F0EFED" }}>
          <img src={post.image} alt="" style={{ width: "100%", height: "auto", display: "block", maxHeight: 400, objectFit: "cover" }} />
        </div>
      )}

      <div style={{ fontSize: 11, color: "#9B9A97", marginBottom: 12 }}>{timeAgo(post.timestamp)}</div>

      {/* Like and comment get larger tap areas; the margins take back the extra
          padding (buttons start with 1px 6px), so the row looks the same. */}
      <div style={{ display: "flex", gap: 20, paddingTop: 12, borderTop: "1px solid #F0EFED" }}>
        <button onClick={handleLike} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: liked ? "#E25555" : "#9B9A97", fontSize: 13, fontWeight: 500, padding: "10px 8px", margin: "-9px -2px" }}>
          {Icons.heart({ size: 16, fill: liked ? "#E25555" : "none", stroke: liked ? "#E25555" : "currentColor" })} {likeCount}
        </button>
        <button onClick={toggleComments} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#9B9A97", fontSize: 13, fontWeight: 500, padding: "10px 8px", margin: "-9px -2px" }}>
          {Icons.message({ size: 16 })} {comments.length || post.commentsCount || 0}
        </button>
      </div>

      {showComments && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #F0EFED" }}>
          {comments.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <Avatar name={c.user} size={28} url={c.avatar} />
              <div style={{ flex: 1, background: "#F7F7F5", padding: "8px 12px", borderRadius: "0 10px 10px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#37352F" }}>{c.user}</span>
                  <span style={{ fontSize: 10, color: "#9B9A97" }}>{timeAgo(c.time)}</span>
                </div>
                <p style={{ fontSize: 13, color: "#5F5E5B", margin: 0 }}>{c.text}</p>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newComment} onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addComment()}
              placeholder="Write a comment..." maxLength={TEXT_LIMIT}
              style={{ flex: 1, padding: "8px 14px", borderRadius: 20, border: "1px solid #E8E7E4", fontSize: 13, background: "#FAFAF8", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
            />
            <button onClick={addComment} disabled={!newComment.trim()} style={{ padding: "8px", borderRadius: "50%", background: newComment.trim() ? "#37352F" : "#E8E7E4", border: "none", cursor: newComment.trim() ? "pointer" : "default", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {Icons.send({ size: 14 })}
            </button>
          </div>
          <CharCount value={newComment} />
        </div>
      )}
    </div>
  );
};

// ============================================================================
// DASHBOARD
// ============================================================================
// Blocked Users Modal Component
const BlockedUsersModal = ({ onClose, onUnblocked, font }) => {
  const [blockedList, setBlockedList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.getBlockedUsers();
        setBlockedList(list || []);
      } catch(e) {}
      setLoading(false);
    })();
  }, []);

  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Blocked members</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
        </div>
        <div style={{ padding: 24 }}>
          {loading ? <div style={{ textAlign: "center", padding: 20, color: "#9B9A97", fontSize: 13 }}>Loading...</div>
          : blockedList.length === 0 ? <div style={{ textAlign: "center", padding: 32, color: "#9B9A97", fontSize: 13, fontFamily: font }}>You haven't blocked anyone.</div>
          : blockedList.map(b => (
            <div key={b.blocked_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid #F0EFED" }}>
              <Avatar name={b.blocked?.name || "User"} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font }}>{b.blocked?.name || "Unknown"}</div>
                <div style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>{b.blocked?.profession || ""}</div>
              </div>
              <button onClick={async () => {
                try { await api.unblockUser(b.blocked_id); } catch(e) {}
                setBlockedList(prev => prev.filter(x => x.blocked_id !== b.blocked_id));
                onUnblocked?.(b.blocked_id);
              }} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #E0E0DE", background: "#fff", color: "#5F5E5B", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Unblock</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Full-screen card for blocked members. Settings can't be reached from here,
// so the card also lets them download their data or delete their account.
const BlockedOverlay = ({ onSignOut, font }) => {
  const { busy, error, download, deleteAccount } = useAccountActions(onSignOut);
  const link = { background: "none", border: "none", padding: 4, cursor: busy ? "default" : "pointer", color: "#5F5E5B", fontSize: 13, fontWeight: 500, textDecoration: "underline", fontFamily: font };
  return (
    <div data-lock-overlay style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="alertdialog" aria-modal="true" aria-label="Profile blocked" style={{ background: "#fff", borderRadius: 16, maxWidth: 420, width: "100%", padding: 32, textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4" y1="4" x2="20" y2="20"/></svg>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#37352F", marginBottom: 8, fontFamily: font }}>Profile Blocked</h2>
        <p style={{ fontSize: 14, color: "#5F5E5B", lineHeight: 1.6, marginBottom: 20, fontFamily: font }}>
          Your profile has been blocked by our admin team.
        </p>
        <p style={{ fontSize: 13, color: "#6B6A67", lineHeight: 1.6, marginBottom: 24, fontFamily: font }}>
          If you believe this is an error, please contact <a href="mailto:hello@nriclub.app" style={{ color: "#37352F", fontWeight: 600 }}>hello@nriclub.app</a>.
        </p>
        <button onClick={onSignOut} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#37352F", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Sign Out</button>
        <p style={{ margin: "16px 0 0", fontSize: 13, color: "#6B6A67", fontFamily: font }}>
          <button type="button" onClick={download} aria-disabled={!!busy} style={link}>{busy === "download" ? "Preparing your data..." : "Download my data"}</button>
          <span aria-hidden="true"> · </span>
          <button type="button" onClick={deleteAccount} aria-disabled={!!busy} style={link}>{busy === "delete" ? "Deleting..." : "Delete my account"}</button>
        </p>
        {error && <p role="alert" style={{ fontSize: 13, color: "#B91C1C", margin: "12px 0 0", lineHeight: 1.5, fontFamily: font }}>{error}</p>}
      </div>
    </div>
  );
};

// The fields of the user object (mapProfile) that decide what the member may
// do: the ones api.refreshMyStatus reads.
const STATUS_FIELDS = ["verificationStatus", "status", "reviewFlag", "termsVersion", "ageConfirmedAt", "termsAcceptedAt"];

const Dashboard = ({ user, onLogout, onUserUpdate }) => {
  const [startRoute] = useState(() => parsePath(window.location.pathname, user?.id));
  const [findTab, setFindTab] = useState(startRoute.findTab || "people"); // Find: people | mentors
  const [view, setView] = useState(startRoute.view);
  // A group, event, doc or listing the address points at, opened once the
  // lists have loaded.
  const [pendingRoute, setPendingRoute] = useState(startRoute.pending || null);
  const [posts, setPosts] = useState([]);
  const [likedPostIds, setLikedPostIds] = useState(new Set());
  const [events, setEvents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [connections, setConnections] = useState([]);
  const [myFollowers, setMyFollowers] = useState([]);
  const [myFollowing, setMyFollowing] = useState([]);
  const [followModal, setFollowModal] = useState(null);
  // The member whose profile page is open (view "member").
  const [memberId, setMemberId] = useState(startRoute.member || null);
  const [memberPage, setMemberPage] = useState(null); // { id, profile, posts, groupIds, error }
  const [acceptedConnections, setAcceptedConnections] = useState(new Set());
  const [newPost, setNewPost] = useState("");
  const [createPostModal, setCreatePostModal] = useState(null); // "text" while "Create a post" is open
  const [postImage, setPostImage] = useState(null);
  const [postPhotoOpen, setPostPhotoOpen] = useState(false); // the composer's photo block is shown
  const [postPhotoUploading, setPostPhotoUploading] = useState(false);
  const postPhotoUploadRef = useRef(0); // counts uploads, so one cancelled with Cancel is dropped
  const [mobileMenu, setMobileMenu] = useState(false);
  const [rsvps, setRsvps] = useState(new Set());
  const [profileTab, setProfileTab] = useState("posts");
  const [chatTab, setChatTab] = useState("personal"); // 'personal' | 'marketplace'
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [eventModal, setEventModal] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: "", date: "", time: "", location: "", city: "", description: "", link: "" });
  const [eventPhoto, setEventPhoto] = useState(null); // { url, preview }
  const [helpRequests, setHelpRequests] = useState([]);
  // "Update details" (an admin asked for more information) opens Get verified.
  const [verifyOpen, setVerifyOpen] = useState(false);
  // Only while the admin's question is still open: a later decision closes it.
  useEffect(() => { if (user.verificationStatus !== "needs_info") setVerifyOpen(false); }, [user.verificationStatus]);
  const [profileCardDismissed, dismissProfileCard] = useProfileCardDismissed(user.id);
  const [helpModal, setHelpModal] = useState(false);
  const [selectedHelp, setSelectedHelp] = useState(null);
  const [helpResponse, setHelpResponse] = useState("");
  const [helpResponses, setHelpResponses] = useState({});
  const [helpFilter, setHelpFilter] = useState("all"); // all | open | answered
  const [myHelped, setMyHelped] = useState(0);
  const [myThanks, setMyThanks] = useState(() => new Set()); // answers I thanked
  const [newHelp, setNewHelp] = useState({ title: "", description: "", category: "General", urgent: false });
  const [profileModal, setProfileModal] = useState(false);
  const [editProfile, setEditProfile] = useState({ ...user });
  const [profileFocus, setProfileFocus] = useState(null); // field to focus when Edit Profile opens
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileErrors, setProfileErrors] = useState({});
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [feedSort, setFeedSort] = useState("new"); // "new" | "popular" (most liked)
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const [groupTab, setGroupTab] = useState("all");
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupRequestModal, setGroupRequestModal] = useState(false);
  const [newGroupCity, setNewGroupCity] = useState("");
  const [groupRequestSent, setGroupRequestSent] = useState(false);
  const [groupRequestError, setGroupRequestError] = useState("");
  const [guidelinesOpen, setGuidelinesOpen] = useState({}); // {groupId: boolean}, unset = open only for visitors
  const [communityTab, setCommunityTab] = useState("feed");
  const [eventViewMode, setEventViewMode] = useState("all");
  const [eventSearch, setEventSearch] = useState("");
  const [eventCityFilter, setEventCityFilter] = useState("All");
  // Messages state
  const [selectedConvo, setSelectedConvo] = useState(startRoute.convo || null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState({});
  const [convos, setConvos] = useState([]);
  const [convosLoaded, setConvosLoaded] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  // Unread messages per conversation, and in all ({ conversation id: count }).
  const [unreadCounts, setUnreadCounts] = useState({});
  const unreadTotal = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  const lastSeenMsgRef = useRef(null); // Track last seen conversation state
  const lastVerificationNotifRef = useRef(null); // Newest unread verification decision seen
  const pollCountRef = useRef(0);
  const dashboardRef = useRef(null);
  // Rejected and blocked members only see a full-screen card: make
  // everything behind it unreachable (Tab, screen readers) and focus the card.
  const locked = user?.status === "blocked" || user?.verificationStatus === "rejected";
  // Members waiting for review (pending or needs_info) see WaitingForReview
  // instead of the feed and the other pages until an admin approves them.
  const waiting = !locked && isWaitingForReview(user);
  // Whether the database lets this member see other members and what they
  // post (private.can_browse()): only approved members (and not while
  // locked). Nothing is loaded until then.
  const canBrowse = !locked && user?.verificationStatus === "approved";
  useEffect(() => {
    const root = dashboardRef.current;
    if (!locked || !root) return;
    const overlay = root.querySelector("[data-lock-overlay]");
    const behind = [...root.children].filter(el => el !== overlay);
    behind.forEach(el => { el.inert = true; });
    overlay?.querySelector("a[href], button")?.focus();
    return () => behind.forEach(el => { el.inert = false; });
  }, [locked, user?.status]);
  const [chatSettings, setChatSettings] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockTargetId, setBlockTargetId] = useState(null);
  const [blockedIds, setBlockedIds] = useState(new Set());
  // Notification & Settings state
  const [notifOpen, setNotifOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsModal, setSettingsModal] = useState(startRoute.legal ? "terms" : null); // 'account'|'privacy'|'notifications'|'activity'|'helpCenter'|'terms'
  const [notifications, setNotifications] = useState([]);
  const [notifsLoaded, setNotifsLoaded] = useState(false); // the list has been fetched at least once
  // The member's status as loaded after a verification decision arrived:
  // { id: the notification, status } (status null if that reload failed;
  // the next check tries again). The notices wait for it.
  const [verificationChecked, setVerificationChecked] = useState(null);
  const checkedDecision = (id, fresh) => {
    setVerificationChecked({ id, status: fresh ? fresh.verificationStatus : null });
    if (!fresh && lastVerificationNotifRef.current === id) lastVerificationNotifRef.current = null;
  };
  const [acceptedNotifs, setAcceptedNotifs] = useState([]); // Namaste requests just accepted, shown as "✓ Accepted" for a moment
  const [privSettings, setPrivSettings] = useState({ visibility: "Everyone", onlineStatus: true, namasteRequests: "Everyone", receiveMessages: "Everyone" });
  const [privSettingsLoaded, setPrivSettingsLoaded] = useState(false);
  const [notifPrefsLoaded, setNotifPrefsLoaded] = useState(false); // false | "ok" | "failed" (choices unknown)
  // In-app notices (user_settings): push = pop-ups for new things while the
  // member is here; email = the catch-up when they come back. (NRIClub sends
  // no notification emails; the column kept its old name.)
  const [notifSettings, setNotifSettings] = useState({ email: true, push: true });
  const [dataDownload, setDataDownload] = useState({ busy: false, error: "" });
  const [legalTab, setLegalTab] = useState(startRoute.legal || "terms"); // Settings > Terms & Policies: "terms" | "privacy" | "impressum"
  // Opening Account starts without an old download message. (Terms &
  // Policies opens on the tab its menu item names.)
  useEffect(() => {
    if (settingsModal === "account") setDataDownload({ busy: false, error: "" });
  }, [settingsModal]);
  const [accountName, setAccountName] = useState(user.name);
  const [accountPassword, setAccountPassword] = useState("");
  const [accountSave, setAccountSave] = useState({ busy: false, error: "" });
  const [deleteAccountText, setDeleteAccountText] = useState(null); // null = closed; otherwise what was typed
  const [settingsSaveError, setSettingsSaveError] = useState("");
  const [openFaq, setOpenFaq] = useState(null);
  const [bugError, setBugError] = useState("");
  const [feedbackKind, setFeedbackKind] = useState(null); // null (choose) | "bug" | "idea"
  const [feedbackSending, setFeedbackSending] = useState(false);
  // Privacy and email settings are saved the moment they change; a failed
  // save puts the row back.
  const saveSetting = async (setState, key, value, save) => {
    let before;
    setState(p => { before = p[key]; return { ...p, [key]: value }; });
    setSettingsSaveError("");
    try { await save(); } catch (e) {
      setState(p => ({ ...p, [key]: before }));
      setSettingsSaveError(isNetworkError(e) ? NETWORK_MESSAGE : "Couldn't save. Please try again.");
    }
  };
  // Filter modal state
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  // hometown: a city the author is from or lives in; occupation: their
  // occupation status from Edit Profile; livesIn: "Abroad" | "India";
  // tag: a hashtag picked on Trending.
  const noFeedFilters = { hometown: "", occupation: "All", livesIn: "All", community: "All", tag: "" };
  const [feedFilters, setFeedFilters] = useState(noFeedFilters);
  const feedFiltered = !!feedFilters.hometown || feedFilters.occupation !== "All" || feedFilters.livesIn !== "All" || feedFilters.community !== "All" || !!feedFilters.tag;
  const [feedPostType, setFeedPostType] = useState("all"); // 'all' | 'posts' | 'links'
  // Docs state
  const [docModal, setDocModal] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: "", city: "", category: "General", excerpt: "" });
  const [docs, setDocs] = useState([]);
  const [docCityFilter, setDocCityFilter] = useState("All");
  const [docSearch, setDocSearch] = useState("");
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docComment, setDocComment] = useState("");
  const [docLiked, setDocLiked] = useState(false);
  const [reportConfirm, setReportConfirm] = useState(null); // { type, id, name }
  const [reportedIds, setReportedIds] = useState(new Set());
  const [selectedMarketItem, setSelectedMarketItem] = useState(null);
  const [expandedMarketItem, setExpandedMarketItem] = useState(null);
  const [marketPhotoIdx, setMarketPhotoIdx] = useState(0);
  const marketTouchRef = useRef({ startX: 0, startY: 0 });
  
  // Keyboard navigation for market photo gallery
  useEffect(() => {
    if (!expandedMarketItem) return;
    const photos = expandedMarketItem.photos || [];
    if (photos.length <= 1) return;
    const handler = (e) => {
      if (e.key === "ArrowRight") setMarketPhotoIdx(p => (p + 1) % photos.length);
      else if (e.key === "ArrowLeft") setMarketPhotoIdx(p => (p - 1 + photos.length) % photos.length);
      else if (e.key === "Escape") { setExpandedMarketItem(null); setMarketPhotoIdx(0); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [expandedMarketItem]);
  const [contactMsg, setContactMsg] = useState("");
  // Market state
  const [marketSearch, setMarketSearch] = useState("");
  const [marketCategory, setMarketCategory] = useState("All");
  const [marketCityFilter, setMarketCityFilter] = useState("All");
  const [marketModal, setMarketModal] = useState(false);
  const [newMarket, setNewMarket] = useState({ title: "", price: "", category: "Items", city: "", description: "" });
  const [marketPhotos, setMarketPhotos] = useState([]);
  const [marketItems, setMarketItems] = useState([]);
  // Host Event, Create Doc and Post Item start at the member's own city (they can still change it).
  const myCity = GLOBAL_CITIES.find(c => c.toLowerCase() === (user.location || "").split(",")[0].trim().toLowerCase()) || "";
  useEffect(() => { if (eventModal && myCity) setNewEvent(prev => prev.city ? prev : { ...prev, city: myCity }); }, [eventModal, myCity]);
  useEffect(() => { if (docModal && myCity) setNewDoc(prev => prev.city ? prev : { ...prev, city: myCity }); }, [docModal, myCity]);
  useEffect(() => { if (marketModal && myCity) setNewMarket(prev => prev.city ? prev : { ...prev, city: myCity }); }, [marketModal, myCity]);
  // Help state with pre-populated data

  // Initialize help requests on mount
  useEffect(() => {}, []);
  const [networkSearch, setNetworkSearch] = useState("");
  const [networkCityFilter, setNetworkCityFilter] = useState("All");
  const [networkHometownFilter, setNetworkHometownFilter] = useState("All");
  const [networkShowCount, setNetworkShowCount] = useState(30); // Find lists 30 members, then "Show more"
  const [sentNamaste, setSentNamaste] = useState(new Set());

  // Network users loaded from DB
  const [networkUsers, setNetworkUsers] = useState([]);
  const [networkLoaded, setNetworkLoaded] = useState(false);
  const [networkReady, setNetworkReady] = useState(false); // the members list has finished loading

  const isNetworkFilterActive = networkSearch.trim() !== "" || networkCityFilter !== "All" || networkHometownFilter !== "All";

  const filteredNetworkUsers = networkUsers.filter((u) => {
    if (u.id === user.id) return false;
    if (blockedIds.has(u.id)) return false;
    const matchesSearch = networkSearch === "" ||
      u.name.toLowerCase().includes(networkSearch.toLowerCase()) ||
      u.profession.toLowerCase().includes(networkSearch.toLowerCase()) ||
      (u.askMeAbout || "").toLowerCase().includes(networkSearch.toLowerCase());
    const matchesCity = networkCityFilter === "All" || u.location.includes(networkCityFilter);
    const matchesHometown = networkHometownFilter === "All" || u.hometown.includes(networkHometownFilter);
    return matchesSearch && matchesCity && matchesHometown;
  });
  // With no filter, Find lists members in your current city first, then
  // those from your hometown, then everyone else.
  const networkCityKey = (s) => (s || "").split(",")[0].trim().toLowerCase();
  const networkNearRank = (u) => (networkCityKey(user.location) && networkCityKey(u.location) === networkCityKey(user.location) ? 0 : networkCityKey(user.hometown) && networkCityKey(u.hometown) === networkCityKey(user.hometown) ? 1 : 2);
  const networkList = isNetworkFilterActive ? filteredNetworkUsers : [...filteredNetworkUsers].sort((a, b) => networkNearRank(a) - networkNearRank(b));

  const clearNetworkFilters = () => {
    setNetworkSearch("");
    setNetworkCityFilter("All");
    setNetworkHometownFilter("All");
  };

  // Members for Find, the right sidebar and profile previews: loaded once
  // when the dashboard opens (again if the member may browse after all).
  const loadNetworkUsers = async () => {
    if (networkLoaded || !canBrowse) return;
    setNetworkLoaded(true);
    try {
      const dbUsers = await api.searchProfiles();
      if (dbUsers && dbUsers.length) {
        // Fetch all connections to count followers/following
        let connCounts = {};
        try {
          const allConns = await api.getAllConnections();
          if (allConns) {
            allConns.forEach(c => {
              if (!connCounts[c.recipient_id]) connCounts[c.recipient_id] = { followers: 0, following: 0 };
              if (!connCounts[c.requester_id]) connCounts[c.requester_id] = { followers: 0, following: 0 };
              connCounts[c.recipient_id].followers++;
              connCounts[c.requester_id].following++;
            });
          }
        } catch(ce) {}
        setNetworkUsers(dbUsers.map(u => ({
          id: u.id, name: u.name, profession: u.profession || "", location: u.location || "",
          hometown: u.hometown || "", yearsAbroad: u.years_abroad || "", linkedinUrl: u.linkedin_url || "",
          linkedin_verified: !!u.linkedin_verified, countryCode: u.country_code || "", createdAt: u.created_at || "", ambassadorCity: u.ambassador_city || "", askMeAbout: u.ask_me_about || "",
          mentorOpen: !!u.mentor_open, mentorAreas: u.mentor_areas || "", menteeOpen: !!u.mentee_open, menteeNeeds: u.mentee_needs || "",
          avatar_url: u.avatar_url || "",
          followers: connCounts[u.id]?.followers || 0, following: connCounts[u.id]?.following || 0,
        })));
      }
    } catch (e) {}
    setNetworkReady(true);
  };
  useEffect(() => { if (canBrowse) loadNetworkUsers(); }, [canBrowse]);

  const handleSendNamaste = async (userId) => {
    // Block self-requests
    if (userId === user.id) return;
    // Check if target user allows Namaste requests
    try {
      const targetSettings = await api.getOtherUserSettings(userId);
      if (targetSettings && targetSettings.namaste_requests === "Nobody") {
        alert("This user is not accepting connection requests.");
        return;
      }
    } catch(e) {}
    setSentNamaste((prev) => { const s = new Set(prev); s.add(userId); return s; });
    let connId = null;
    try {
      const result = await api.sendNamaste(userId);
      connId = result?.[0]?.id || null;
    } catch (e) {
      console.log("Connection may already exist:", e.message);
    }
    if (!connId) return;
    try {
      await api.createNotification(userId, "request", `${user.name} sent you a Namaste request`, user.id, connId);
    } catch(ne) { console.log("Notification failed:", ne.message); }
  };

  const handleUnfollow = async (userId) => {
    try {
      await api.unfollowUser(userId);
      setAcceptedConnections(prev => { const s = new Set(prev); s.delete(userId); return s; });
      setMyFollowing(prev => prev.filter(p => (p.id || p) !== userId));
    } catch(e) { console.error("Unfollow failed:", e); }
  };

  // Why another member can't get a message from this one, in plain words, or
  // null. Only what can't change behind this page's back is checked here:
  // the member's own blocks and a "Nobody" setting. "Connections only" is
  // left to the database, which knows about a Namaste accepted since the
  // page loaded; messageErrorText explains its refusal.
  const messageBlockedReason = async (otherUserId) => {
    if (blockedIds.has(otherUserId)) return "You've blocked this member. You can unblock them in Settings → Privacy & Safety.";
    try {
      const targetSettings = await api.getOtherUserSettings(otherUserId);
      if (targetSettings?.receive_messages === "Nobody") return "This user is not accepting messages.";
    } catch (e) {}
    return null;
  };

  // A message or new conversation the database refused, in plain words. A
  // refusal (42501) from a member who takes messages from connections only
  // means the two aren't connected (yet).
  const messageErrorText = async (e, otherUserId) => {
    if (isNetworkError(e)) return NETWORK_MESSAGE;
    if (!/42501/.test(e?.message || "")) return "Your message couldn't be sent. Please try again.";
    try {
      const targetSettings = otherUserId ? await api.getOtherUserSettings(otherUserId) : null;
      if (targetSettings?.receive_messages === "Connections Only") {
        return "This user only accepts messages from connections. Send a Namaste request first.";
      }
    } catch (x) {}
    return "You can't send messages to this member right now.";
  };

  // Opens the conversation with another member (starting one if needed) in
  // Messages. Says why instead when they don't take messages from this member.
  const openChatWith = async (other) => {
    const reason = await messageBlockedReason(other.id);
    if (reason) { alert(reason); return false; }
    try {
      const convo = await api.getOrCreateConversation(other.id);
      if (!convo) throw new Error("No conversation");
      setConvos(prev => {
        if (prev.find(c => c.id === convo.id)) return prev;
        return [{ id: convo.id, name: other.name, otherUserId: other.id, avatar_url: other.avatar_url || "", lastMsg: "", time: "", unread: false }, ...prev];
      });
      setSelectedConvo(convo.id);
      setView("messages");
      return true;
    } catch (e) {
      alert(await messageErrorText(e, other.id));
      return false;
    }
  };

  // A posts row (with its author's profile) as the feed shows it.
  const toPost = (p, groupList) => {
    const urlMatch = (p.content || "").match(/https?:\/\/[^\s]+/i);
    return {
      id: p.id, userId: p.user_id, content: p.content, image: p.image_url,
      tags: p.tags || [], likes: p.likes_count || 0, commentsCount: p.comments_count || 0, comments: [],
      timestamp: new Date(p.created_at).getTime(),
      groupName: p.group_id ? (groupList.find(g => g.id === p.group_id)?.name || null) : null,
      groupId: p.group_id || null,
      author: p.profiles ? { name: p.profiles.name, profession: p.profiles.profession, occupation_status: p.profiles.occupation_status || "", location: p.profiles.location, hometown: p.profiles.hometown, avatar_url: p.profiles.avatar_url || "" } : { name: "User" },
      externalUrl: urlMatch ? urlMatch[0] : null,
    };
  };

  // Set once everything below has loaded, so an empty list can say so
  // instead of looking blank while it loads.
  const [listsLoaded, setListsLoaded] = useState(false);
  const [groupsLoaded, setGroupsLoaded] = useState(false);

  // Load data on mount, and again if the member may browse after all (e.g.
  // a rejection was undone). Locked members load nothing. All requests go
  // out at once, so the wait is the slowest one, not the sum of them all.
  useEffect(() => {
    if (!canBrowse) return;
    (async () => {
      // A request that hasn't answered in 20 seconds counts as failed, so one
      // slow list can't keep the others from showing.
      const safe = (promise) => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), 20000)),
      ]).catch(e => { console.error("Load failed:", e?.message || e); return null; });
      const core = Promise.all([safe(api.getPosts()), safe(api.getGroups()), safe(api.getMyGroupIds())]);
      const rest = Promise.all([
        safe(api.getUserLikes()), safe(api.getMyReports()),
        safe(api.getEvents()), safe(api.getMyRsvps()), safe(api.getHelpRequests()), safe(api.getHelpResponses(null)),
        safe(api.getMyConnections()), safe(api.getSentNamastes()), safe(api.getDocs()), safe(api.getBlockedUsers()),
        safe(api.getNotifications()), safe(api.getMarketItems()),
      ]);
      // Groups and posts show as soon as they're here.
      const [dbPosts, dbGroups, myGids] = await core;
      const loadedGroups = (dbGroups || []).map(g => ({ id: g.id, name: g.name, description: g.description, members: g.members_count, category: g.category, pinnedPostId: g.pinned_post_id || null, joined: (myGids || []).includes(g.id) }));
      setGroups(loadedGroups);
      setPosts((dbPosts || []).map(p => toPost(p, loadedGroups)));
      setGroupsLoaded(true);
      const [myLikes, myReports, dbEvents, myR, dbHelp, allResponses, conns, sentData, dbDocs, blocked, dbNotifs, dbMarket] = await rest;
      if (myLikes && myLikes.length) setLikedPostIds(new Set(myLikes.map(l => l.post_id)));
      if (myReports && myReports.length) setReportedIds(new Set(myReports.filter(r => r.reported_post_id).map(r => r.reported_post_id)));
      setEvents((dbEvents || []).map(e => ({ id: e.id, organizerId: e.organizer_id, title: e.title, date: e.date, time: e.time, location: e.location, city: e.city || "", attendees: e.attendees_count, organizer: e.organizer_name, description: e.description, link: e.link || "", image: e.image_url || "" })));
      if (myR) setRsvps(new Set(myR));
      if (dbHelp && dbHelp.length) {
        const counts = {};
        (allResponses || []).forEach(r => { counts[r.request_id] = (counts[r.request_id] || 0) + 1; });
        setHelpRequests(dbHelp.map(h => toHelp(h, allResponses ? (counts[h.id] || 0) : undefined)));
      }
      // Followers and following ("Following" = I sent the request and they accepted)
      if (conns && conns.length) {
        setMyFollowers(conns.filter(c => c.recipient?.id === user.id || c.recipient_id === user.id).map(c => c.requester || { name: "User" }).filter(Boolean));
        setAcceptedConnections(new Set(conns.filter(c => c.requester_id === user.id && c.recipient?.id).map(c => c.recipient.id)));
        setMyFollowing(conns.filter(c => c.requester_id === user.id).map(c => c.recipient).filter(Boolean));
      }
      // Sent Namastes, so their buttons say "Sent" after a reload
      if (sentData && sentData.length) setSentNamaste(new Set(sentData.map(s => s.recipient_id)));
      if (dbDocs && dbDocs.length) {
        setDocs(dbDocs.map(d => ({ id: d.id, userId: d.user_id, title: d.title, excerpt: d.excerpt, content: d.content || d.excerpt, category: d.category, readTime: d.read_time, author: d.profiles?.name || "User", profession: d.profiles?.profession || "", authorLocation: d.profiles?.location || "", city: d.city, likes: d.likes_count || 0, timestamp: new Date(d.created_at).toLocaleDateString(), comments: [] })));
      }
      if (blocked && blocked.length) setBlockedIds(new Set(blocked.map(b => b.blocked_id)));
      if (dbNotifs && dbNotifs.length) {
        // A decision made while the dashboard was loading: reload the status.
        const decision = dbNotifs.find(n => n.type === "verification" && !n.read);
        if (decision && decision.id !== lastVerificationNotifRef.current) {
          lastVerificationNotifRef.current = decision.id;
          refreshMyProfile().then(fresh => checkedDecision(decision.id, fresh));
        }
        setNotifications(dbNotifs.map(n => ({
          id: n.id, type: n.type, actor: n.actor?.name || null, actor_id: n.actor?.id || n.actor_id || null,
          text: n.text, created_at: n.created_at,
          read: n.read, reference_id: n.reference_id,
        })));
      }
      if (dbNotifs) setNotifsLoaded(true);
      if (dbMarket && dbMarket.length) {
        setMarketItems(dbMarket.map(m => {
          const photos = listingPhotos(m.image_url);
          return { id: m.id, user_id: m.user_id, title: m.title, description: m.description, price: m.price, category: m.category, location: m.location, seller: m.profiles?.name || "User", date: new Date(m.created_at).toLocaleDateString(), photos, color: ["#2D1B4E","#1B3A4E","#3A2E1B","#1B4E3A"][Math.floor(Math.random()*4)] };
        }));
      }
      setListsLoaded(true);
    })();
  }, [canBrowse]);

  // Scrolls to a post on Home and outlines it for two seconds.
  const highlightPost = (id) => setTimeout(() => {
    const el = document.querySelector(`[data-post-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.boxShadow = "0 0 0 3px #5B9CFF";
    setTimeout(() => { el.style.boxShadow = ""; }, 2000);
  }, 300);

  // A shared link (#post=<id> from a post's "Copy link", #event=<id> from an
  // event's Share) opens that post or event once the lists have loaded.
  // Until then it stays in the address bar, so it still works after logging in.
  const readSharedLink = () => {
    const m = /^#(post|event)=([\w-]+)$/.exec(window.location.hash);
    if (m) return { kind: m[1], id: m[2] };
    const p = /^\/post\/([\w-]+)$/.exec(window.location.pathname);
    return p ? { kind: "post", id: p[1] } : null;
  };
  const [sharedLink, setSharedLink] = useState(readSharedLink);
  useEffect(() => {
    const onHashChange = () => setSharedLink(readSharedLink());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  useEffect(() => {
    if (!sharedLink || !canBrowse) return;
    const { kind, id } = sharedLink;
    const post = kind === "post" && posts.find(p => String(p.id) === id && !blockedIds.has(p.userId));
    const event = kind === "event" && events.find(e => String(e.id) === id);
    if (!post && !event && !listsLoaded) return;
    setSharedLink(null);
    try { window.history.replaceState(null, "", window.location.pathname.startsWith("/post/") ? "/" : window.location.pathname + window.location.search); } catch (e) {}
    if (kind === "event") {
      if (event) { setView("events"); setExpandedEvent(event); }
      else alert("This event isn't available any more.");
      return;
    }
    setView("home");
    setFeedFilters(noFeedFilters);
    setFeedPostType("all");
    if (post) { highlightPost(id); return; }
    // Older than the posts the feed loads: fetch it on its own.
    (async () => {
      let row = null;
      try { row = await api.getPost(id); } catch (e) {}
      if (!row || blockedIds.has(row.user_id)) { alert("This post isn't available any more."); return; }
      setPosts(prev => prev.some(p => p.id === row.id) ? prev : [...prev, toPost(row, groups)]);
      highlightPost(id);
    })();
  }, [sharedLink, canBrowse, posts, events, listsLoaded]);

  // The address of what's on screen. Moving to another page adds a browser
  // history entry; Back and Forward move between them.
  const currentPath = (() => {
    if (expandedEvent) return `/events/${expandedEvent.id}`;
    if (expandedMarketItem) return `/market/${expandedMarketItem.id}`;
    switch (view) {
      case "network": return findTab === "mentors" ? "/mentors" : "/find";
      case "mentoring": return "/mentoring";
      case "groups": return selectedGroup ? `/groups/${selectedGroup.id}` : "/groups";
      case "events": return "/events";
      case "help": return "/help";
      case "docs": return selectedDoc ? `/docs/${selectedDoc.id}` : "/docs";
      case "market": return "/market";
      case "messages": return selectedConvo ? `/messages/${selectedConvo}` : "/messages";
      case "profile": return "/profile";
      case "member": return memberId ? `/u/${memberId}` : "/find";
      default: return "/";
    }
  })();
  // nriclub.app/impressum opens the Impressum over the home page; the address
  // becomes the home page's (replaced, so Back doesn't come back to it).
  useEffect(() => {
    if (startRoute.legal) { try { window.history.replaceState(null, "", "/"); } catch (e) {} }
  }, []);
  useEffect(() => {
    if (pendingRoute || sharedLink) return; // still opening what the address points at
    if (window.location.pathname !== currentPath) {
      try { window.history.pushState(null, "", currentPath); } catch (e) {}
    }
  }, [currentPath, pendingRoute, sharedLink]);
  useEffect(() => {
    const onPop = () => {
      const r = parsePath(window.location.pathname, user.id);
      setExpandedEvent(null);
      setExpandedMarketItem(null);
      setSelectedGroup(null);
      setSelectedDoc(null);
      setSelectedConvo(r.convo || null);
      if (r.member) setMemberId(r.member);
      setFindTab(r.findTab || "people");
      setPendingRoute(r.pending || null);
      if (r.post) setSharedLink({ kind: "post", id: r.post });
      if (r.legal) { setLegalTab(r.legal); setSettingsModal("terms"); }
      setView(r.view);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (!pendingRoute || !canBrowse) return;
    const { kind, id } = pendingRoute;
    const list = kind === "group" || kind === "city" ? groups : kind === "event" ? events : kind === "doc" || kind === "guide" ? docs : marketItems;
    const item = kind === "city" ? list.find(x => x.category === "City" && slug(x.name) === slug(`Indians in ${id}`))
      : kind === "guide" ? list.find(x => x.category === "Essentials" && slug(x.title) === id)
      : list.find(x => String(x.id) === id);
    if (!item && !listsLoaded) return;
    if (!item) {
      try { window.history.replaceState(null, "", kind === "group" || kind === "city" ? "/groups" : kind === "event" ? "/events" : kind === "doc" || kind === "guide" ? "/docs" : "/market"); } catch (e) {}
      setPendingRoute(null);
      return;
    }
    setPendingRoute(null);
    // A city address becomes the group's own, so Back doesn't reopen it.
    if (kind === "city") { try { window.history.replaceState(null, "", `/groups/${item.id}`); } catch (e) {} }
    if (kind === "guide") { try { window.history.replaceState(null, "", `/docs/${item.id}`); } catch (e) {} }
    if (kind === "group" || kind === "city") { setGroupMembers([]); setSelectedGroup(item); }
    else if (kind === "event") setExpandedEvent(item);
    else if (kind === "doc" || kind === "guide") setSelectedDoc(item);
    else setExpandedMarketItem(item);
  }, [pendingRoute, canBrowse, groups, events, docs, marketItems, listsLoaded]);

  // Load the member's own settings (also while a member flagged for review
  // waits for approval, so saving them never overwrites them with defaults).
  useEffect(() => {
    if (locked) return;
    (async () => {
      try {
        const dbSettings = await api.getUserSettings();
        if (dbSettings) {
          setPrivSettings({
            visibility: dbSettings.profile_visibility || "Everyone",
            onlineStatus: dbSettings.online_status !== false,
            namasteRequests: dbSettings.namaste_requests || "Everyone",
            receiveMessages: dbSettings.receive_messages || "Everyone",
          });
          setNotifSettings(prev => ({
            ...prev,
            email: dbSettings.email_notifications !== false,
            push: dbSettings.push_notifications !== false,
          }));
          setPrivSettingsLoaded(true);
        }
        setNotifPrefsLoaded("ok");
      } catch (e) {
        setNotifPrefsLoaded("failed");
      }
    })();
  }, [locked]);

  // Locked while the dashboard is open: drop what other members posted, and
  // load it again if the member may browse later.
  useEffect(() => {
    if (canBrowse) return;
    setPosts([]); setGroups([]); setEvents([]); setHelpRequests([]); setDocs([]); setMarketItems([]);
    setMyFollowers([]); setMyFollowing([]); setNetworkUsers([]); setNetworkLoaded(false); setNetworkReady(false);
    setConvos([]); setConvosLoaded(false); setChatMessages({}); setSelectedConvo(null);
  }, [canBrowse]);

  const refreshMyProfile = async () => {
    try {
      const db = await api.getMyProfile();
      if (!db) return null;
      const fresh = mapProfile(db);
      onUserUpdate(fresh);
      return fresh;
    } catch (e) { return null; }
  };

  // The user as shown now, for the timers below (their effects don't re-run
  // when the profile changes).
  const userRef = useRef(user);
  userRef.current = user;

  // The regular status check: reads only the fields that decide what the
  // member may do (api.refreshMyStatus, which doesn't count as activity) and
  // reloads the whole profile only if one of them changed.
  const checkMyStatus = async () => {
    try {
      const row = await api.refreshMyStatus();
      if (!row) return;
      const latest = mapProfile(row);
      if (STATUS_FIELDS.some(k => latest[k] !== userRef.current[k])) refreshMyProfile();
    } catch (e) {}
  };

  // Live polling for messages and notifications (every 5 seconds)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (document.hidden) return; // nothing to update while the tab isn't seen
      try {
        // Poll for new conversations/messages
        const dbConvos = canBrowse ? await api.getConversations() : [];
        if (canBrowse) api.getUnreadCounts().then(c => setUnreadCounts(view === "messages" && selectedConvoRef.current ? { ...c, [selectedConvoRef.current]: 0 } : c)).catch(() => {});
        if (dbConvos && dbConvos.length) {
          const newConvos = dbConvos.map(c => ({
            id: c.id, name: c.otherUser?.name || "User", otherUserId: c.otherUser?.id,
            avatar_url: c.otherUser?.avatar_url || "",
            lastMsg: c.last_message_text || "", time: c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "",
            unread: false,
          }));
          setConvos(prev => {
            newConvos.forEach(nc => { nc.isMarketplace = prev.find(p => p.id === nc.id)?.isMarketplace || nc.lastMsg.includes("[MARKETPLACE:"); });
            // Only flag unread if this is NOT the first load and a message actually changed
            if (lastSeenMsgRef.current !== null) {
              const changed = newConvos.some(nc => {
                const old = lastSeenMsgRef.current.find(o => o.id === nc.id);
                return !old || old.lastMsg !== nc.lastMsg;
              });
              if (changed && view !== "messages") setHasUnreadMessages(true);
              // Mark individual convos as unread if their message changed
              newConvos.forEach(nc => {
                const old = lastSeenMsgRef.current.find(o => o.id === nc.id);
                if (old && old.lastMsg !== nc.lastMsg && nc.id !== selectedConvo) {
                  nc.unread = true;
                }
              });
            }
            // Store current state as "seen"
            lastSeenMsgRef.current = newConvos;
            return newConvos;
          });
        }
      } catch (e) {}
      try {
        // Poll for new notifications
        let reloaded = false;
        const dbNotifs = await api.getNotifications();
        if (dbNotifs && dbNotifs.length) {
          setNotifications(dbNotifs.map(n => ({
            id: n.id, type: n.type, actor: n.actor?.name || null, actor_id: n.actor?.id || n.actor_id || null,
            text: n.text, created_at: n.created_at,
            read: n.read, reference_id: n.reference_id,
          })));
          // An admin decided on this member's verification (including moving
          // them back to pending): reload their status.
          const decision = dbNotifs.find(n => n.type === "verification" && !n.read);
          if (decision && decision.id !== lastVerificationNotifRef.current) {
            lastVerificationNotifRef.current = decision.id;
            refreshMyProfile().then(fresh => checkedDecision(decision.id, fresh));
            reloaded = true;
          }
        }
        if (dbNotifs) setNotifsLoaded(true);
        // A block or unblock leaves no notification: check the member's own
        // status about once a minute as well.
        pollCountRef.current += 1;
        if (!reloaded && pollCountRef.current % 12 === 0) checkMyStatus();
      } catch (e) {}
    }, 5000);
    return () => clearInterval(interval);
  }, [view, canBrowse]);

  // The open conversation (for the 5-second poll above), kept read.
  const selectedConvoRef = useRef(selectedConvo);
  selectedConvoRef.current = view === "messages" ? selectedConvo : null;
  const markRead = (id) => {
    setUnreadCounts(prev => (prev[id] ? { ...prev, [id]: 0 } : prev));
    api.markConversationRead(id).catch(() => {});
  };
  const [unreadLoaded, setUnreadLoaded] = useState(false);
  useEffect(() => {
    if (canBrowse) api.getUnreadCounts().then(setUnreadCounts).catch(() => {}).finally(() => setUnreadLoaded(true));
  }, [canBrowse]);

  // Realtime messages via WebSocket + fast fallback polling
  useEffect(() => {
    if (view !== "messages" || !selectedConvo) return;
    setHasUnreadMessages(false);
    markRead(selectedConvo);
    
    // Subscribe to realtime inserts
    api.subscribeToMessages(selectedConvo, (record) => {
      const newMsg = {
        id: record.id, text: record.content,
        sender: record.sender_id === user.id ? "me" : "them",
        time: new Date(record.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      };
      setChatMessages(p => {
        const existing = p[selectedConvo] || [];
        if (existing.find(m => m.id === newMsg.id)) return p;
        return { ...p, [selectedConvo]: [...existing, newMsg] };
      });
    });
    
    // Also poll every 2s as fallback (realtime can be unreliable on free tier)
    let lastCount = 0;
    const interval = setInterval(async () => {
      if (document.hidden) return;
      try {
        const msgs = await api.getMessages(selectedConvo);
        if (msgs && msgs.length !== lastCount) {
          if (lastCount) markRead(selectedConvo);
          lastCount = msgs.length;
          setChatMessages(p => ({ ...p, [selectedConvo]: msgs.map(m => ({
            id: m.id, text: m.content,
            sender: m.sender_id === user.id ? "me" : "them",
            time: new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          })) }));
        }
      } catch (e) {}
    }, 2000);
    
    return () => {
      clearInterval(interval);
      api.unsubscribeFromMessages();
    };
  }, [view, selectedConvo]);

  const createPost = async () => {
    if (!newPost.trim() && !postImage) return;
    const cleanContent = validateInput(newPost, 5000);
    // Detect external URLs (TikTok, Instagram, YouTube, etc.)
    const urlMatch = newPost.match(/https?:\/\/[^\s]+/i);
    const externalUrl = urlMatch ? urlMatch[0] : null;
    const tags = postTags(cleanContent, !!externalUrl);
    const groupName = selectedGroup ? selectedGroup.name : null;
    const groupId = selectedGroup ? selectedGroup.id : null;
    const imageUrl = postImage?.url || null;
    const post = {
      id: "p_" + Date.now(), userId: user.id, content: newPost,
      author: { name: user.name, profession: user.profession, occupation_status: user.occupationStatus || "", location: user.location, hometown: user.hometown },
      likes: 0, comments: [], tags, timestamp: Date.now(), groupName, groupId,
      image: imageUrl, externalUrl,
    };
    setPosts([post, ...posts]);
    setNewPost("");
    setPostImage(null);
    try {
      const r = await api.createPost(cleanContent || newPost, tags, imageUrl, groupId);
      if (r?.[0]) setPosts(prev => prev.map(p => p.id === post.id ? { ...p, id: r[0].id } : p));
    } catch (e) {
      // Take the post back out and give the text back to the composer.
      setPosts(prev => prev.filter(p => p.id !== post.id));
      setNewPost(prev => prev || post.content);
      alert(isNetworkError(e) ? NETWORK_MESSAGE
        : /42501/.test(e.message || "") ? "Your account can't post right now. If you think this is a mistake, contact hello@nriclub.app."
        : "Your post couldn't be published. Please try again.");
    }
  };

  const deletePost = async (id) => {
    if (!confirm("Delete this post? This can't be undone.")) return;
    const at = posts.findIndex((p) => p.id === id);
    const removed = posts[at];
    setPosts(prev => prev.filter((p) => p.id !== id));
    try { await api.deletePost(id); } catch (e) {
      // Put the post back where it was.
      if (removed) setPosts(prev => prev.some(p => p.id === id) ? prev : [...prev.slice(0, at), removed, ...prev.slice(at)]);
      alert(isNetworkError(e) ? NETWORK_MESSAGE : "Couldn't delete the post. Please try again.");
    }
  };

  const createEvent = async () => {
    if (!newEvent.title || !newEvent.date) return;
    const e = {
      id: "e_" + Date.now(), organizerId: user.id, title: newEvent.title,
      date: newEvent.date, time: newEvent.time || "TBD",
      location: newEvent.location || "TBD", city: newEvent.city || "", attendees: 0,
      organizer: user.name, description: newEvent.description,
      link: newEvent.link || "", image: eventPhoto?.url || "",
    };
    setEvents([e, ...events]);
    setNewEvent({ title: "", date: "", time: "", location: "", city: "", description: "", link: "" }); setEventPhoto(null);
    setEventModal(false);
    try {
      const r = await api.createEvent({ title: e.title, date: e.date, time: e.time, location: newEvent.location, city: e.city, description: e.description, organizer_name: user.name, link: e.link, image_url: e.image });
      // Swap the temporary id for the saved one so RSVP and delete work.
      if (r?.[0]) setEvents(prev => prev.map(x => x.id === e.id ? { ...x, id: r[0].id, attendees: r[0].attendees_count } : x));
    } catch (er) {
      setEvents(prev => prev.filter(x => x.id !== e.id));
      alert(isNetworkError(er) ? NETWORK_MESSAGE : "Your event couldn't be saved. Please try again.");
    }
  };

  const toggleRsvp = async (id) => {
    const going = !rsvps.has(id);
    const bump = (delta) => setEvents(prev => prev.map(x => x.id === id ? { ...x, attendees: Math.max(0, (x.attendees || 0) + delta) } : x));
    setRsvps(prev => { const s = new Set(prev); if (going) s.add(id); else s.delete(id); return s; });
    bump(going ? 1 : -1);
    try { await api.toggleRsvp(id); } catch (e) {
      setRsvps(prev => { const s = new Set(prev); if (going) s.delete(id); else s.add(id); return s; });
      bump(going ? -1 : 1);
    }
  };

  const toggleGroup = async (id) => {
    const g = groups.find(x => x.id === id);
    const newJoined = !g?.joined;
    const apply = (joined) => {
      const change = (x) => ({ ...x, joined, members: Math.max(0, (x.members || 0) + (joined ? 1 : -1)) });
      setGroups(prev => prev.map((x) => x.id === id ? change(x) : x));
      // Also update selectedGroup if it's the one being toggled
      setSelectedGroup(prev => prev && prev.id === id ? change(prev) : prev);
    };
    apply(newJoined);
    try { if (g?.joined) await api.leaveGroup(id); else await api.joinGroup(id); } catch (e) { apply(!newJoined); }
  };

  // Invite link: opens the site with who invited them, which Get verified
  // passes on to the admins ("Can vouch").
  const inviteLink = `${window.location.origin}/?invite=${user.id}&from=${encodeURIComponent((user.name || "").split(" ")[0])}`;
  const inviteText = `I'm on NRIClub, a members-only community for Indians living abroad. Join me: ${inviteLink}`;

  // A new member's first day: their city's group, joined for them once, and
  // a welcome card with people nearby (until they dismiss it or follow someone).
  // Spelled any way ("Dusseldorf", "München", "nyc"): matched like city addresses are.
  const welcomeCity = (user.city || (user.location || "").split(",")[0] || "").trim();
  const cityGroup = (() => {
    if (!welcomeCity) return null;
    const cityGroups = groups.filter(g => cityFromGroupName(g.name));
    const name = findCity(welcomeCity, cityGroups.map(g => cityFromGroupName(g.name))) || welcomeCity;
    return cityGroups.find(g => slug(g.name) === slug(`Indians in ${name}`)) || null;
  })();
  const welcomeKey = `nriclub_welcome_done_${user.id}`;
  const [welcomeDone, setWelcomeDone] = useState(() => { try { return !!localStorage.getItem(welcomeKey); } catch (e) { return true; } });
  const dismissWelcome = () => { setWelcomeDone(true); try { localStorage.setItem(welcomeKey, "1"); } catch (e) {} };
  // A festival coming up in the next three weeks: find a celebration or host one.
  const [festival] = useState(() => upcomingFestival());
  const festivalKey = festival ? `nriclub_festival_${festival.date}` : "";
  const [festivalHidden, setFestivalHidden] = useState(() => { try { return !festivalKey || !!localStorage.getItem(festivalKey); } catch (e) { return false; } });
  const hideFestival = () => { setFestivalHidden(true); try { localStorage.setItem(festivalKey, "1"); } catch (e) {} };
  // "Introduce yourself": a ready-made first post for the city group.
  const introKey = `nriclub_intro_done_${user.id}`;
  const [introDone, setIntroDone] = useState(() => { try { return !!localStorage.getItem(introKey); } catch (e) { return false; } });
  const [introText, setIntroText] = useState(() => {
    const first = (user.name || "").split(" ")[0];
    const bits = [user.profession, user.hometown && `from ${user.hometown.split(",")[0]}`, (user.city || (user.location || "").split(",")[0]) && `living in ${user.city || (user.location || "").split(",")[0]}`].filter(Boolean);
    return `Hi everyone! I'm ${first || "new here"}${bits.length ? ", " + bits.join(", ") : ""}. Happy to connect and help where I can 🙏`;
  });
  const [introBusy, setIntroBusy] = useState(false);
  const postIntro = async () => {
    const text = validateInput(introText, 5000);
    if (!text.trim() || introBusy) return;
    setIntroBusy(true);
    try {
      const r = await api.createPost(text, postTags(text, false), null, cityGroup?.id || null);
      const row = r?.[0];
      setPosts(prev => [{ id: row?.id || "p_" + Date.now(), userId: user.id, content: text,
        author: { name: user.name, profession: user.profession, occupation_status: user.occupationStatus || "", location: user.location, hometown: user.hometown, avatar_url: user.avatar_url || "" },
        likes: 0, comments: [], tags: [], timestamp: Date.now(), groupName: cityGroup?.name || null, groupId: cityGroup?.id || null, image: null, externalUrl: null }, ...prev]);
      setIntroDone(true);
      try { localStorage.setItem(introKey, "1"); } catch (e) {}
    } catch (e) {
      alert(isNetworkError(e) ? NETWORK_MESSAGE : "Your post couldn't be published. Please try again.");
    }
    setIntroBusy(false);
  };
  useEffect(() => {
    if (!canBrowse || !listsLoaded || !cityGroup || cityGroup.joined) return;
    const key = `nriclub_city_group_${user.id}`;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1"); } catch (e) { return; }
    toggleGroup(cityGroup.id);
  }, [canBrowse, listsLoaded, cityGroup?.id]);
  // Open questions from members in the member's city (urgent first), for Home.
  const helpNearbyCity = (user.city || (user.location || "").split(",")[0] || "").trim();
  const helpNearby = helpNearbyCity ? helpRequests
    .filter(h => h.userId !== user.id && !blockedIds.has(h.userId) && (h.city || "").toLowerCase() === helpNearbyCity.toLowerCase() && !h.bestResponseId && h.status !== "Resolved" && Date.now() - h.timestamp < 30 * 86400000)
    .sort((a, b) => (b.urgent - a.urgent) || (b.timestamp - a.timestamp)).slice(0, 3) : [];
  const nearbyMembers = welcomeCity ? networkUsers.filter(u => u.id !== user.id && (u.location || "").toLowerCase().startsWith(welcomeCity.toLowerCase())).slice(0, 5) : [];

  const createHelp = async () => {
    if (!newHelp.title.trim() || !newHelp.description.trim()) return;
    const h = {
      id: "h_" + Date.now(), ...newHelp, user: user.name, avatar: user.avatar_url || "", userId: user.id,
      timestamp: Date.now(), responses: 0, status: "Open", city: user.city || "", bestResponseId: null,
    };
    const draft = newHelp;
    setHelpRequests([h, ...helpRequests]);
    setNewHelp({ title: "", description: "", category: "General", urgent: false });
    setHelpModal(false);
    try {
      const r = await api.createHelpRequest({ title: draft.title, description: draft.description, category: draft.category, urgency: draft.urgent ? "High" : "Low", urgent: draft.urgent });
      // Swap the temporary id for the saved one so responses and delete work.
      if (r?.[0]) setHelpRequests(prev => prev.map(x => x.id === h.id ? { ...x, id: r[0].id, userId: user.id, city: r[0].city ?? x.city } : x));
      if (draft.urgent && r?.alertsOff) alert("Your question is posted and marked urgent, but alerts to members in your city aren't switched on yet. If it's an emergency, call the local emergency number, or message members in your city group directly.");
    } catch (e) {
      setHelpRequests(prev => prev.filter(x => x.id !== h.id));
      if (/one urgent question a day/i.test(e.message || "")) {
        // Keep what they wrote, so they can post it without "Urgent".
        setNewHelp({ ...draft, urgent: false });
        setHelpModal(true);
        alert("You can post one urgent question a day. Post this one without “Urgent”, or message your city's ambassador directly.");
        return;
      }
      alert(isNetworkError(e) ? NETWORK_MESSAGE : "Your question couldn't be posted. Please try again.");
    }
  };

  // Opens a help request and loads its responses the first time.
  const openHelp = async (h, { force = false } = {}) => {
    setSelectedHelp(h.id);
    if (force || !helpResponses[h.id]) {
      try {
        const resp = await api.getHelpResponses(h.id);
        if (resp) {
          setHelpResponses(prev => ({ ...prev, [h.id]: resp.map(r => ({ id: r.id, userId: r.user_id, text: r.content, user: r.profiles?.name || "User", avatar: r.profiles?.avatar_url || "", thanks: r.thanks_count || 0, time: new Date(r.created_at).getTime() })) }));
          const mine = await api.getMyThanks(resp.map(r => r.id)).catch(() => []);
          if (mine.length) setMyThanks(prev => new Set([...prev, ...mine]));
        }
      } catch(e) {}
    }
  };

  useEffect(() => {
    if (view !== "profile" || !canBrowse) return;
    api.getHelpedCount(user.id).then(setMyHelped).catch(() => {});
  }, [view, canBrowse, user.id]);

  // Opens Ask at one question (from a notification or Home).
  // The question is read again, so a new answer or a question posted after
  // the page loaded (e.g. an urgent one) is there.
  const openQuestion = async (id) => {
    setSelectedDoc(null);
    setHelpFilter("all");
    setView("help");
    let h = helpRequests.find(x => x.id === id);
    try {
      const row = await api.getHelpRequest(id);
      if (row) {
        h = toHelp(row);
        setHelpRequests(prev => prev.some(x => x.id === id) ? prev.map(x => x.id === id ? { ...x, ...h } : x) : [h, ...prev]);
      }
    } catch (e) {}
    if (!h) { alert("This question isn't available any more."); return; }
    openHelp(h, { force: true });
    setTimeout(() => document.querySelector(`[data-help-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  };

  // The asker picks the answer that helped (again to undo).
  const chooseBestAnswer = async (h, responseId) => {
    const next = h.bestResponseId === responseId ? null : responseId;
    const before = { bestResponseId: h.bestResponseId, status: h.status };
    setHelpRequests(prev => prev.map(x => x.id === h.id ? { ...x, bestResponseId: next, status: next ? "Resolved" : "Open" } : x));
    try { await api.setBestAnswer(h.id, next); }
    catch (e) {
      setHelpRequests(prev => prev.map(x => x.id === h.id ? { ...x, ...before } : x));
      alert(isNetworkError(e) ? NETWORK_MESSAGE : "That didn't work. Please try again.");
    }
  };

  // 🙏 Thanks for an answer (again to take it back).
  const thankAnswer = async (requestId, r) => {
    const on = !myThanks.has(r.id);
    const flip = (yes) => {
      setMyThanks(prev => { const n = new Set(prev); if (yes) n.add(r.id); else n.delete(r.id); return n; });
      setHelpResponses(prev => ({ ...prev, [requestId]: (prev[requestId] || []).map(x => x.id === r.id ? { ...x, thanks: Math.max(0, (x.thanks || 0) + (yes ? 1 : -1)) } : x) }));
    };
    flip(on);
    try { await api.thankAnswer(r.id, on); }
    catch (e) {
      flip(!on);
      alert(isNetworkError(e) ? NETWORK_MESSAGE : "That didn't work. Please try again.");
    }
  };

  // An opened group shows its own latest posts (not only those among the
  // newest on the whole site) and its members from the start.
  useEffect(() => {
    if (!selectedGroup?.id || !canBrowse) return;
    const gid = selectedGroup.id;
    api.getPosts(30, gid).then(rows => {
      const fresh = (rows || []).map(p => toPost(p, groups));
      setPosts(prev => {
        const have = new Set(prev.map(p => p.id));
        const add = fresh.filter(p => !have.has(p.id));
        return add.length ? [...prev, ...add] : prev;
      });
    }).catch(() => {});
    api.getGroupMembers(gid).then(members => {
      if (members && members.length) setGroupMembers(members.map(m => ({
        id: m.profiles?.id || m.user_id, name: m.profiles?.name || "User",
        profession: m.profiles?.profession || "", location: m.profiles?.location || "",
        avatar_url: m.profiles?.avatar_url || "", yearsAbroad: "", linkedinUrl: "",
      })));
    }).catch(() => {});
  }, [selectedGroup?.id, canBrowse]);

  // Desi places for the open city group (Places tab).
  const [places, setPlaces] = useState({ city: null, list: [] });
  const [newPlace, setNewPlace] = useState({ name: "", kind: "Grocery", address: "", note: "", languages: "" });
  const [placeKind, setPlaceKind] = useState("All"); // filter in the Places tab
  const [groupKind, setGroupKind] = useState("all"); // filter on the Groups page
  const [newGroupKind, setNewGroupKind] = useState("City"); // City | University, when requesting a group
  const [cityAmbassadors, setCityAmbassadors] = useState({ city: "", list: [] });
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [bookingMentor, setBookingMentor] = useState(null);
  const [mentorRatings, setMentorRatings] = useState({});
  const [mentorsList, setMentorsList] = useState([]); // verified mentors
  const [seekersList, setSeekersList] = useState([]); // members looking for a mentor
  const [mentorsReady, setMentorsReady] = useState(false);
  const [mentoringKey, setMentoringKey] = useState(0); // reloads the Mentoring page
  const placesCity = selectedGroup?.category === "City" ? (selectedGroup.name || "").replace(/^Indians in /i, "") : null;
  useEffect(() => { setPlaceKind("All"); }, [placesCity]);
  useEffect(() => { api.isAdmin().then(setIsAdminUser).catch(() => {}); }, []);
  useEffect(() => { document.title = HOME_TITLE; }, []);
  const refreshRatings = () => api.getMentorRatings().then(setMentorRatings).catch(() => {});
  const asMentoringPerson = (p) => ({
    id: p.id, name: p.name, avatar_url: p.avatar_url || "", profession: p.profession || "", location: p.location || "",
    linkedin_verified: !!p.linkedin_verified, mentorOpen: !!p.mentor_open, mentorAreas: p.mentor_areas || "",
    menteeOpen: !!p.mentee_open, menteeNeeds: p.mentee_needs || "",
  });
  const loadMentoring = () => Promise.all([
    api.getMentors().then(rows => setMentorsList(rows.map(asMentoringPerson))).catch(() => {}),
    api.getSeekers().then(rows => setSeekersList(rows.map(asMentoringPerson))).catch(() => {}),
    refreshRatings(),
  ]).finally(() => setMentorsReady(true));
  // Mentors, seekers and ratings: on arrival, and again when the member
  // opens Find -> Mentors or Mentoring.
  useEffect(() => {
    if (!canBrowse) return;
    if (view === "mentoring" || (view === "network" && findTab === "mentors") || !mentorsReady) loadMentoring();
  }, [canBrowse, view, findTab]);
  // Leaving Find goes back to People next time.
  useEffect(() => { if (view !== "network") setFindTab("people"); }, [view]);
  // "Book" on a mentor (null: go to Find → Mentors).
  const bookMentor = (m) => {
    if (!m) { setFindTab("mentors"); setView("network"); return; }
    setBookingMentor({ id: m.id, name: m.name, avatar_url: m.avatar_url, mentorAreas: m.mentorAreas ?? m.mentor_areas ?? "" });
  };
  const messageMember = (m) => { if (m?.id) openChatWith({ id: m.id, name: m.name, avatar_url: m.avatar_url }); };
  // A city group: its ambassadors, and its pinned post even if it's older
  // than the posts already loaded.
  useEffect(() => {
    if (!placesCity || !canBrowse) return;
    let gone = false;
    api.getCityAmbassadors(placesCity)
      .then(list => { if (!gone) setCityAmbassadors({ city: placesCity, list }); })
      .catch(() => { if (!gone) setCityAmbassadors({ city: placesCity, list: [] }); });
    return () => { gone = true; };
  }, [placesCity, canBrowse]);
  useEffect(() => {
    const pid = selectedGroup?.pinnedPostId;
    if (!pid || !canBrowse || posts.some(p => p.id === pid)) return;
    api.getPost(pid).then(row => { if (row) setPosts(prev => prev.some(p => p.id === row.id) ? prev : [...prev, toPost(row, groups)]); }).catch(() => {});
  }, [selectedGroup?.pinnedPostId, canBrowse]);
  const canPinIn = (g) => !!g && g.category === "City" && (isAdminUser || (!!user.ambassadorCity && `indians in ${user.ambassadorCity}`.toLowerCase() === (g.name || "").toLowerCase()));
  const pinPost = async (g, postId) => {
    try {
      await api.pinGroupPost(g.id, postId);
      setGroups(prev => prev.map(x => x.id === g.id ? { ...x, pinnedPostId: postId } : x));
      setSelectedGroup(prev => prev && prev.id === g.id ? { ...prev, pinnedPostId: postId } : prev);
    } catch (e) {
      alert(isNetworkError(e) ? NETWORK_MESSAGE : "That post couldn't be pinned. Please try again.");
    }
  };
  useEffect(() => {
    if (!placesCity || communityTab !== "places" || !canBrowse) return;
    api.getPlaces(placesCity).then(list => setPlaces({ city: placesCity, list })).catch(() => setPlaces({ city: placesCity, list: [] }));
  }, [placesCity, communityTab, canBrowse]);
  const addNewPlace = async (city) => {
    const name = newPlace.name.trim();
    if (!name) return;
    try {
      const row = await api.addPlace({ city, name, kind: newPlace.kind, address: newPlace.address.trim(), note: newPlace.note.trim(), languages: PRO_KINDS.includes(newPlace.kind) ? newPlace.languages.trim() : "" });
      if (row) setPlaces(prev => ({ city, list: [{ ...row, recs: [] }, ...(prev.city === city ? prev.list : [])] }));
      setNewPlace({ name: "", kind: newPlace.kind, address: "", note: "", languages: "" });
    } catch (e) {
      alert(isNetworkError(e) ? NETWORK_MESSAGE : /42501|row-level/.test(e.message || "") ? "Places can be added once your membership is confirmed." : "Couldn't add the place. Please try again.");
    }
  };
  const togglePlaceRec = async (pl, on) => {
    const flip = (yes) => setPlaces(prev => ({ ...prev, list: prev.list.map(x => x.id === pl.id ? { ...x, recs: yes ? [...x.recs.filter(u => u !== user.id), user.id] : x.recs.filter(u => u !== user.id) } : x) }));
    flip(on);
    try { await api.recommendPlace(pl.id, on); } catch (e) { flip(!on); }
  };
  const removePlace = async (pl) => {
    if (!confirm(`Delete ${pl.name}?`)) return;
    try { await api.deletePlace(pl.id); setPlaces(prev => ({ ...prev, list: prev.list.filter(x => x.id !== pl.id) })); }
    catch (e) { alert(isNetworkError(e) ? NETWORK_MESSAGE : "Couldn't delete the place. Please try again."); }
  };

  // Who's going to the open event.
  const [eventAttendees, setEventAttendees] = useState({ id: null, list: [] });
  useEffect(() => {
    const id = expandedEvent?.id;
    if (!id || !canBrowse || String(id).startsWith("e_")) return;
    api.getEventAttendees(id).then(list => setEventAttendees({ id, list })).catch(() => {});
  }, [expandedEvent?.id, canBrowse, rsvps]);

  // A member's profile page; your own name opens your own profile.
  const openMember = (id) => {
    if (!id) return;
    if (id === user.id) { setView("profile"); return; }
    setMemberId(id);
    setView("member");
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    if (view !== "member" || !memberId || !canBrowse) return;
    let gone = false;
    setMemberPage(prev => (prev && prev.id === memberId ? prev : { id: memberId }));
    (async () => {
      try {
        const [profile, rows, groupIds, helped] = await Promise.all([
          api.getProfile(memberId), api.getUserPosts(memberId).catch(() => []), api.getUserGroupIds(memberId).catch(() => []),
          api.getHelpedCount(memberId).catch(() => 0),
        ]);
        if (gone) return;
        setMemberPage(profile
          ? { id: memberId, profile, posts: (rows || []).map(p => toPost(p, groups)), groupIds, helped }
          : { id: memberId, error: "This member isn't available." });
      } catch (e) {
        if (!gone) setMemberPage({ id: memberId, error: isNetworkError(e) ? NETWORK_MESSAGE : "We couldn't load this profile. Please try again." });
      }
    })();
    return () => { gone = true; };
  }, [view, memberId, canBrowse]);

  const openProfileEditor = (focusField = null) => {
    setEditProfile({ ...user });
    setProfileErrors({});
    setProfileFocus(focusField);
    setProfileModal(true);
  };

  const saveProfileChanges = async () => {
    if (profileSaving) return;
    const trim = (v) => (v || "").trim();
    const updates = {
      location: trim(editProfile.location), profession: trim(editProfile.profession),
      occupation_status: editProfile.occupationStatus || "",
    };
    // Only check and send the LinkedIn link when it was changed: older
    // accounts can hold links in other formats. An empty link is fine
    // (members verified without LinkedIn).
    const linkedinUrl = trim(editProfile.linkedinUrl);
    if (linkedinUrl !== (user.linkedinUrl || "")) {
      const linkedinError = linkedinUrl ? linkedinProblem(linkedinUrl) : null;
      if (linkedinError) { setProfileErrors({ linkedinUrl: linkedinError }); return; }
      updates.linkedin_url = linkedinUrl;
    }
    const topics = topicList(editProfile.askMeAbout).join(", ");
    if (user.hasTopics && topics !== (user.askMeAbout || "")) updates.ask_me_about = topics;
    if (isUserNRI(user)) {
      updates.hometown = trim(editProfile.hometown);
      updates.years_abroad = editProfile.yearsAbroad || "";
    }
    setProfileSaving(true);
    setProfileErrors({});
    try {
      await api.updateProfile(updates);
    } catch (e) {
      const msg = apiErrorMessage(e, "Your changes couldn't be saved. Please try again.");
      setProfileErrors(updates.linkedin_url !== undefined && /LinkedIn/.test(msg) ? { linkedinUrl: msg } : { form: msg });
      setProfileSaving(false);
      return;
    }
    let refreshed = null;
    try { refreshed = mapProfile(await api.getMyProfile()); } catch (e) {}
    onUserUpdate(refreshed || {
      ...user, location: updates.location, profession: updates.profession, linkedinUrl: updates.linkedin_url ?? user.linkedinUrl,
      occupationStatus: updates.occupation_status, askMeAbout: updates.ask_me_about ?? user.askMeAbout,
      ...(updates.hometown !== undefined ? { hometown: updates.hometown, yearsAbroad: updates.years_abroad } : {}),
    });
    setProfileSaving(false);
    setProfileModal(false);
  };

  // "Complete your profile" card
  const saidHello = posts.some(p => p.userId === user.id) || sentNamaste.size > 0 || acceptedConnections.size > 0;
  // (Joining groups and saying hello wait for approval, so no steps until then.)
  const profileItems = profileCardDismissed || waiting ? [] : setupSteps(user, groups, { said: saidHello });
  const handleProfileItem = (item) => {
    if (item.key === "photo") document.getElementById("avatar-upload")?.click();
    else if (item.key === "groups") { setSelectedGroup(null); setView("groups"); }
    else { setWelcomeDone(false); setView("home"); window.scrollTo(0, 0); setTimeout(() => document.getElementById("intro-text")?.focus(), 300); }
  };

  // Styles
  const font = "'DM Sans', sans-serif";
  const navBtn = (v) => ({
    padding: "7px 12px", borderRadius: 20, border: view === v ? "1px solid #E0E0DE" : "1px solid transparent",
    fontSize: 12, fontWeight: view === v ? 600 : 500,
    background: view === v ? "#fff" : "transparent",
    color: view === v ? "#37352F" : "#9B9A97",
    cursor: "pointer", fontFamily: font, transition: "all 0.2s ease",
    whiteSpace: "nowrap", boxShadow: view === v ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
  });
  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E0E0DE",
    fontSize: 14, background: "#FAFAF8", outline: "none", color: "#37352F",
    fontFamily: font, boxSizing: "border-box",
  };
  const btnPrimary = {
    padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600,
    background: "#37352F", color: "#fff", cursor: "pointer", fontFamily: font,
    display: "inline-flex", alignItems: "center", gap: 6,
  };

  // ---- RENDER CONTENT ----
  const renderContent = () => {
    switch (view) {
      case "home":
        const pinnedIds = new Set(groups.map(g => g.pinnedPostId).filter(Boolean));
        const feedPosts = posts.filter(p => {
          // Hide blocked users' posts
          if (blockedIds.has(p.userId)) return false;
          // A group's pinned "Start here" post is shown at the top of its group.
          if (pinnedIds.has(p.id)) return false;
          const a = p.author || {};
          if (feedFilters.hometown && !(a.hometown || "").toLowerCase().includes(feedFilters.hometown.toLowerCase()) && !(a.location || "").toLowerCase().includes(feedFilters.hometown.toLowerCase())) return false;
          if (feedFilters.occupation !== "All" && a.occupation_status !== feedFilters.occupation) return false;
          // Where the author lives: abroad (an NRI) or in India
          if (feedFilters.livesIn === "Abroad" && !isUserNRI(a)) return false;
          if (feedFilters.livesIn === "India" && isUserNRI(a)) return false;
          if (feedFilters.community !== "All" && p.groupName !== feedFilters.community) return false;
          // A hashtag from Trending: in the post's tags or its text
          if (feedFilters.tag && !(p.tags || []).includes(feedFilters.tag) && !((p.content || "").match(/#\w+/g) || []).includes(`#${feedFilters.tag}`)) return false;
          // Post type filter
          if (feedPostType === "links" && !p.externalUrl) return false;
          if (feedPostType === "posts" && p.externalUrl) return false;
          return true;
        }).sort((a, b) => feedSort === "popular" ? (b.likes || 0) - (a.likes || 0) : (b.timestamp || 0) - (a.timestamp || 0));
        return (
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            {festival && !festivalHidden && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "linear-gradient(90deg, rgba(255,153,51,0.10), rgba(19,136,8,0.07))", border: "1px solid #F3E3CF", borderRadius: 14, padding: "12px 14px", marginBottom: 16, fontFamily: font }}>
                <span style={{ fontSize: 24 }} aria-hidden="true">{festival.emoji}</span>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#37352F" }}>{festival.daysLeft === 0 ? `Happy ${festival.name}!` : `${festival.name} is on ${festival.when}`}</p>
                  <p style={{ fontSize: 12, color: "#6B6A67" }}>Celebrate with Indians near you.</p>
                </div>
                <button onClick={() => { setEventSearch(festival.search); setView("events"); }} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", fontSize: 12, fontWeight: 600, color: "#37352F", cursor: "pointer", fontFamily: font }}>Find one</button>
                <button onClick={() => { setNewEvent(prev => ({ ...prev, title: `${festival.name} celebration`, date: festival.date })); setEventModal(true); }} style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "#37352F", fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer", fontFamily: font }}>Host one</button>
                <button onClick={hideFestival} aria-label="Hide" style={{ padding: 4, background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 14 })}</button>
              </div>
            )}
            {/* Welcome: a new member's first steps */}
            {!welcomeDone && (myFollowing.length === 0 || !introDone) && (
              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8E7E4", padding: "20px 20px 16px", marginBottom: 20, position: "relative" }}>
                <button onClick={dismissWelcome} aria-label="Close" style={{ position: "absolute", top: 10, right: 10, padding: 6, background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 16 })}</button>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font, marginBottom: 4 }}>Welcome to NRIClub, {(user.name || "").split(" ")[0] || "friend"}! 🙏</h3>
                <p style={{ fontSize: 13, color: "#6B6A67", fontFamily: font, lineHeight: 1.5, marginBottom: 14 }}>
                  {cityGroup ? <>You're in <button onClick={() => { setGroupMembers([]); setSelectedGroup(cityGroup); setView("groups"); }} style={{ background: "none", border: "none", padding: 0, color: "#37352F", fontWeight: 600, textDecoration: "underline", cursor: "pointer", fontFamily: font, fontSize: 13 }}>{cityGroup.name}</button>. Say hello to people near you:</> : "Say hello to a few members to get started:"}
                </p>
                {nearbyMembers.length > 0 ? nearbyMembers.map(u => (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                    <button type="button" onClick={() => openMember(u.id)} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                      <Avatar name={u.name} size={36} url={u.avatar_url} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#37352F", fontFamily: font, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                        <span style={{ display: "block", fontSize: 11, color: "#9B9A97", fontFamily: font }}>{u.profession}</span>
                      </span>
                    </button>
                    <button onClick={() => handleSendNamaste(u.id)} disabled={sentNamaste.has(u.id) || acceptedConnections.has(u.id)} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", color: sentNamaste.has(u.id) ? "#9B9A97" : "#37352F", fontSize: 12, fontWeight: 600, cursor: sentNamaste.has(u.id) ? "default" : "pointer", fontFamily: font, flexShrink: 0 }}>{sentNamaste.has(u.id) || acceptedConnections.has(u.id) ? "Sent" : "🙏 Namaste"}</button>
                  </div>
                )) : <button onClick={() => setView("network")} style={{ ...btnPrimary, fontSize: 13, padding: "9px 16px" }}>Find members</button>}
                <div style={{ borderTop: "1px solid #F0EFED", marginTop: 12, paddingTop: 12 }}>
                  {introDone ? (
                    <p style={{ fontSize: 13, color: "#138808", fontWeight: 600, fontFamily: font, margin: 0 }}>✓ You've introduced yourself{cityGroup ? ` in ${cityGroup.name}` : ""}.</p>
                  ) : (<>
                    <label htmlFor="intro-text" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#37352F", fontFamily: font, marginBottom: 6 }}>Introduce yourself{cityGroup ? ` in ${cityGroup.name}` : ""}</label>
                    <textarea id="intro-text" value={introText} onChange={(e) => setIntroText(e.target.value)} maxLength={TEXT_LIMIT} rows={3} style={{ ...inputStyle, resize: "vertical", fontSize: 13, lineHeight: 1.5 }} />
                    <button onClick={postIntro} disabled={introBusy || !introText.trim()} style={{ ...btnPrimary, marginTop: 8, fontSize: 13, padding: "9px 16px", opacity: introBusy ? 0.7 : 1 }}>{introBusy ? "Posting..." : "Post"}</button>
                  </>)}
                </div>
                <div style={{ borderTop: "1px solid #F0EFED", marginTop: 12, paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "#6B6A67", fontFamily: font }}>Know other Indians abroad?</span>
                  <button onClick={() => setSettingsModal("invite")} style={{ background: "none", border: "none", padding: 0, color: "#37352F", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: font, textDecoration: "underline" }}>Invite a friend</button>
                </div>
              </div>
            )}
            {/* Can you help? Open questions from members in the same city */}
            {helpNearby.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8E7E4", padding: "16px 18px", marginBottom: 16, fontFamily: font }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#37352F" }}>Can you help?</h3>
                <p style={{ fontSize: 12, color: "#6B6A67", marginBottom: 8 }}>Questions from members in {helpNearbyCity}.</p>
                {helpNearby.map(h => (
                  <button key={h.id} onClick={() => openQuestion(h.id)} style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "9px 0", background: "none", border: "none", borderTop: "1px solid #F0EFED", cursor: "pointer", textAlign: "left", fontFamily: font }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#37352F", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.urgent && "🚨 "}{h.title}</span>
                      <span style={{ fontSize: 11, color: "#9B9A97" }}>{h.user} · {h.responses === 1 ? "1 answer" : `${h.responses || 0} answers`}</span>
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#37352F", flexShrink: 0 }}>Answer →</span>
                  </button>
                ))}
              </div>
            )}

            {/* Mentoring: mentors for members looking for one; people to help for mentors */}
            {(() => {
              const city = helpNearbyCity.toLowerCase();
              const near = (u) => (u.location || "").toLowerCase().startsWith(city);
              const ok = (u) => u.id !== user.id && !blockedIds.has(u.id);
              const mentors = user.menteeOpen ? mentorsList.filter(ok).sort((a, b) => (near(b) - near(a)) || ((mentorRatings[b.id]?.rating || 0) - (mentorRatings[a.id]?.rating || 0))).slice(0, 3) : [];
              const seekers = user.mentorOpen ? seekersList.filter(ok) : [];
              if (!mentors.length && !seekers.length) return null;
              return (
                <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #A7F3D0", padding: "16px 18px", marginBottom: 16, fontFamily: font }}>
                  {mentors.length > 0 && (<>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: "#37352F" }}>🤝 Mentors who could help you</h3>
                    {mentors.map(m => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid #F0EFED", marginTop: 6 }}>
                        <button type="button" onClick={() => openMember(m.id)} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                          <Avatar name={m.name} size={34} url={m.avatar_url} />
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#37352F" }}>{m.name}</span>
                            <span style={{ display: "block", fontSize: 11, color: "#9B9A97", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.mentorAreas || m.profession}</span>
                          </span>
                        </button>
                        <button onClick={() => bookMentor(m)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#37352F", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Book</button>
                      </div>
                    ))}
                    <button onClick={() => bookMentor(null)} style={{ background: "none", border: "none", padding: "6px 0 0", fontSize: 12, fontWeight: 600, color: "#37352F", textDecoration: "underline", cursor: "pointer", fontFamily: font }}>See all mentors</button>
                  </>)}
                  {seekers.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: mentors.length ? 12 : 0, paddingTop: mentors.length ? 12 : 0, borderTop: mentors.length ? "1px solid #F0EFED" : "none" }}>
                      <span style={{ flex: 1, fontSize: 13, color: "#37352F" }}>🌱 <b>{seekers.length}</b> {seekers.length === 1 ? "member is" : "members are"} looking for a mentor.</span>
                      <button onClick={() => setView("mentoring")} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", color: "#37352F", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>See who</button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Complete your profile (mobile; the left column has it on desktop) */}
            <div className="nc-mobile-only">
              <ProfileChecklist className="profile-checklist-feed" items={profileItems} onItem={handleProfileItem} onDismiss={dismissProfileCard} collapseAfter={2} style={{ marginBottom: 20 }} />
            </div>
            {/* Header with Filters + Add Post button */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", marginBottom: 2, fontFamily: font }}>Home Feed</h2>
                <p className="feed-subtitle" style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>Updates from the global community</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setCreatePostModal("text")} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                  borderRadius: 6, border: "none", background: "#37352F",
                  fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", fontFamily: font,
                  whiteSpace: "nowrap", flexShrink: 0,
                }}>
                  {Icons.plus({ size: 14 })} Add Post
                </button>
                <button onClick={() => setFilterModalOpen(true)} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                  borderRadius: 6, border: "1px solid #E0E0DE", background: "#fff",
                  fontSize: 13, fontWeight: 500, color: "#37352F", cursor: "pointer", fontFamily: font,
                  whiteSpace: "nowrap", flexShrink: 0,
                }}>
                  {Icons.filter({ size: 14 })} Filters
                </button>
              </div>
            </div>

            {/* Active Filters Status */}
            {feedFiltered && (
              <div style={{ background: "#E3FCEF", border: "1px solid #B5E4CA", borderRadius: 8, padding: "8px 14px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#22A06B", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: font }}>{Icons.filter({ size: 12, stroke: "#22A06B" })} Filters:</span>
                  {feedFilters.tag && <span style={{ fontSize: 12, color: "#22A06B", background: "#fff", padding: "2px 8px", borderRadius: 4, fontFamily: font }}>#{feedFilters.tag}</span>}
                  {feedFilters.hometown && <span style={{ fontSize: 12, color: "#22A06B", background: "#fff", padding: "2px 8px", borderRadius: 4, fontFamily: font }}>City: {feedFilters.hometown}</span>}
                  {feedFilters.occupation !== "All" && <span style={{ fontSize: 12, color: "#22A06B", background: "#fff", padding: "2px 8px", borderRadius: 4, fontFamily: font }}>Occupation: {feedFilters.occupation}</span>}
                  {feedFilters.livesIn !== "All" && <span style={{ fontSize: 12, color: "#22A06B", background: "#fff", padding: "2px 8px", borderRadius: 4, fontFamily: font }}>Lives in: {feedFilters.livesIn}</span>}
                  {feedFilters.community !== "All" && <span style={{ fontSize: 12, color: "#22A06B", background: "#fff", padding: "2px 8px", borderRadius: 4, fontFamily: font }}>Community: {feedFilters.community}</span>}
                </div>
                <button onClick={() => setFeedFilters(noFeedFilters)} style={{ background: "none", border: "none", color: "#DC2626", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font, whiteSpace: "nowrap" }}>Clear All</button>
              </div>
            )}

            {/* Post Type Filter + Newest/Popular - same row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", gap: 4, padding: 4, background: "#F0EFED", borderRadius: 8 }}>
                {[{ k: "all", l: "All" }, { k: "posts", l: "Posts" }, { k: "links", l: "Links" }].map(tab => (
                  <button key={tab.k} onClick={() => setFeedPostType(tab.k)} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: feedPostType === tab.k ? "#fff" : "transparent", color: feedPostType === tab.k ? "#37352F" : "#9B9A97", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font, boxShadow: feedPostType === tab.k ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}>{tab.l}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4, padding: 4, background: "#F0EFED", borderRadius: 8 }}>
                {[{ k: "new", l: "Newest" }, { k: "popular", l: "Popular" }].map(s => (
                  <button key={s.k} onClick={() => setFeedSort(s.k)} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: feedSort === s.k ? "#fff" : "transparent", color: feedSort === s.k ? "#37352F" : "#9B9A97", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font, boxShadow: feedSort === s.k ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}>{s.l}</button>
                ))}
              </div>
            </div>

            {/* Feed List */}
            {feedPosts.length > 0 ? feedPosts.map((p) => (
              <PostCard key={p.id} post={p} user={user} onDelete={deletePost} onReport={(id) => setReportConfirm({ type: "post", id })} isReported={reportedIds.has(p.id)} initialLiked={likedPostIds.has(p.id)} onOpenProfile={openMember} />
            )) : (feedFiltered || feedPostType !== "all") ? (
              <EmptyCard text="No posts match these filters." action="Clear filters" onAction={() => { setFeedFilters(noFeedFilters); setFeedPostType("all"); }} />
            ) : listsLoaded && (
              <EmptyCard text="No posts yet. Be the first to share something." />
            )}
          </div>
        );

      case "network": {
        const findTabs = (
          <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, background: "#F0EFED", borderRadius: 8, marginBottom: 18, width: "fit-content" }}>
            {[{ k: "people", l: "People" }, { k: "mentors", l: "🤝 Mentors" }].map(t => (
              <button key={t.k} role="tab" aria-selected={findTab === t.k} onClick={() => setFindTab(t.k)} style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: findTab === t.k ? "#fff" : "transparent", color: findTab === t.k ? "#37352F" : "#9B9A97", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>{t.l}</button>
            ))}
          </div>
        );
        if (findTab === "mentors") return (
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", fontFamily: font }}>Find a mentor</h2>
                <p style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>Free sessions with verified members who've been there.</p>
              </div>
              <button onClick={() => setView("mentoring")} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", color: "#37352F", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>My sessions</button>
            </div>
            {findTabs}
            <MentorsList user={user} people={mentorsList.filter(u => !blockedIds.has(u.id))} ready={mentorsReady} ratings={mentorRatings} onBook={bookMentor} openMember={openMember} Avatar={Avatar} />
          </div>
        );
        return (
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            {/* Header */}
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", marginBottom: 14, fontFamily: font }}>Find Indians Abroad</h2>
            {findTabs}
            <InfoBanner text="Tap Namaste to follow someone. They get a request to accept. You can also send them a message." />

            {/* Search & Filters Card */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8E7E4", padding: "20px 20px 16px", marginBottom: 24 }}>
              {/* Search Input */}
              <div style={{ position: "relative", marginBottom: 14 }}>
                <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}>
                  {Icons.search({ size: 16 })}
                </div>
                <input
                  type="text"
                  value={networkSearch}
                  onChange={(e) => setNetworkSearch(e.target.value)}
                  placeholder="Search by name, profession or topic, e.g. Blue Card"
                  style={{
                    width: "100%", padding: "12px 16px 12px 40px", borderRadius: 8,
                    border: "1px solid #E0E0DE", fontSize: 14, background: "#FAFAF8",
                    outline: "none", color: "#37352F", fontFamily: font, boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Filter Row */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {/* Current City dropdown */}
                <div style={{ position: "relative" }}>
                  <select
                    value={networkCityFilter}
                    onChange={(e) => setNetworkCityFilter(e.target.value)}
                    style={{
                      padding: "7px 28px 7px 12px", fontSize: 12, border: "1px solid #E0E0DE",
                      borderRadius: 6, background: "#fff", color: "#5F5E5B", cursor: "pointer",
                      fontFamily: font, appearance: "none", outline: "none",
                    }}
                  >
                    <option value="All">Current City: All</option>
                    {GLOBAL_CITIES.map((c) => <option key={c} value={c.split(",")[0]}>{c}</option>)}
                  </select>
                  <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#9B9A97" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </div>

                {/* Hometown dropdown */}
                <div style={{ position: "relative" }}>
                  <select
                    value={networkHometownFilter}
                    onChange={(e) => setNetworkHometownFilter(e.target.value)}
                    style={{
                      padding: "7px 28px 7px 12px", fontSize: 12, border: "1px solid #E0E0DE",
                      borderRadius: 6, background: "#fff", color: "#5F5E5B", cursor: "pointer",
                      fontFamily: font, appearance: "none", outline: "none",
                    }}
                  >
                    <option value="All">Hometown: All</option>
                    {INDIAN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#9B9A97" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </div>

                {/* Clear All */}
                {isNetworkFilterActive && (
                  <button
                    onClick={clearNetworkFilters}
                    style={{
                      background: "none", border: "none", color: "#E25555", fontSize: 12,
                      fontWeight: 500, cursor: "pointer", fontFamily: font, marginLeft: "auto",
                    }}
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Results (everyone until a filter is picked) */}
            {canBrowse && !networkReady ? (
              <p style={{ fontSize: 13, color: "#9B9A97", textAlign: "center", padding: "24px 0", fontFamily: font }}>Loading members…</p>
            ) : networkList.length > 0 ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }} className="network-grid">
                  {networkList.slice(0, networkShowCount).map((u) => (
                    <div key={u.id} style={{
                      background: "#fff", borderRadius: 16, border: "1px solid #E8E7E4",
                      padding: "28px 24px 20px", textAlign: "center", display: "flex", flexDirection: "column",
                      alignItems: "center", transition: "box-shadow 0.15s", position: "relative",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)")}
                    onMouseOut={(e) => (e.currentTarget.style.boxShadow = "none")}
                    >
                      {/* Report (small grey flag, top-right) */}
                      <button onClick={() => setReportConfirm({ type: "user", id: u.id })} aria-label="Report" style={{ position: "absolute", top: 12, right: 12, padding: 8, background: "none", border: "none", cursor: "pointer", color: "#D4D4D2", display: "flex" }}>
                        {Icons.flag({ size: 14 })}
                      </button>

                      {/* Avatar (opens their profile) */}
                      <button type="button" onClick={() => openMember(u.id)} aria-label={`${u.name}'s profile`} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                        <Avatar name={u.name} size={76} url={u.avatar_url} />
                      </button>

                      {/* Name + verified badge + NRI badge */}
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 14, marginBottom: 2, flexWrap: "wrap", justifyContent: "center" }}>
                        <h3 onClick={() => openMember(u.id)} style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font, cursor: "pointer" }}>{u.name}</h3>
                        {isNewMember(u.createdAt) && <NewBadge />}
                        <AmbassadorBadge city={u.ambassadorCity} />
                        {u.mentorOpen && u.linkedin_verified && <MentorBadge />}
                        {u.linkedin_verified && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="#22C55E" stroke="none" role="img" aria-label="Verified member">
                            <title>Verified member</title>
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                          </svg>
                        )}
                        <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 3, letterSpacing: "0.05em",
                          background: isUserNRI(u) ? "#E3FCEF" : "#FFF3E0",
                          color: isUserNRI(u) ? "#22A06B" : "#E65100",
                          border: `1px solid ${isUserNRI(u) ? "#B5E4CA" : "#FFE0B2"}`,
                        }}>{isUserNRI(u) ? "NRI" : "IN"}</span>
                      </div>

                      {/* Profession */}
                      <p style={{ fontSize: 13, color: "#5F5E5B", marginBottom: u.askMeAbout ? 8 : 14, fontFamily: font }}>{u.profession}</p>
                      {u.askMeAbout && <div style={{ marginBottom: 12 }}><TopicChips text={u.askMeAbout} max={3} center onPick={(t) => setNetworkSearch(t)} /></div>}

                      {/* Location pills */}
                      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{
                          fontSize: 11, color: "#5F5E5B", background: "#F7F7F5", border: "1px solid #EDEDEB",
                          padding: "4px 10px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 4, fontFamily: font,
                        }}>
                          {Icons.mapPin({ size: 10 })} {u.location.split(",")[0]}
                        </span>
                        <span style={{
                          fontSize: 11, color: "#5F5E5B", background: "#F7F7F5", border: "1px solid #EDEDEB",
                          padding: "4px 10px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 4, fontFamily: font,
                        }}>
                          {Icons.globe({ size: 10 })} From {u.hometown.split(",")[0]}
                        </span>
                      </div>
                      {u.yearsAbroad && (
                        <span style={{
                          fontSize: 11, color: "#5F5E5B", background: "#F7F7F5", border: "1px solid #EDEDEB",
                          padding: "4px 10px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 4, fontFamily: font, marginBottom: 16,
                        }}>
                          {Icons.clock({ size: 10 })} {u.yearsAbroad}
                        </span>
                      )}

                      {/* Followers / Following */}
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        fontSize: 13, fontFamily: font, padding: "14px 0", borderTop: "1px solid #F0EFED",
                        width: "100%", marginBottom: 16,
                      }}>
                        <span><b style={{ color: "#37352F" }}>{u.followers}</b> <span style={{ color: "#9B9A97" }}>{u.followers === 1 ? "follower" : "followers"}</span></span>
                        <span style={{ color: "#D4D4D2" }}>·</span>
                        <span><b style={{ color: "#37352F" }}>{u.following}</b> <span style={{ color: "#9B9A97" }}>following</span></span>
                      </div>

                      {/* Action buttons - Namaste + Message */}
                      <div style={{ display: "flex", alignItems: "stretch", gap: 10, width: "100%" }}>
                        <button
                          onClick={() => { 
                            if (acceptedConnections.has(u.id)) { if (confirm(`Unfollow ${u.name}?`)) handleUnfollow(u.id); }
                            else if (!sentNamaste.has(u.id)) handleSendNamaste(u.id);
                          }}
                          disabled={sentNamaste.has(u.id)}
                          style={{
                            flex: 1, padding: "10px 0", borderRadius: 8,
                            border: acceptedConnections.has(u.id) ? "1px solid #B5E4CA" : "1px solid transparent",
                            fontSize: 13, fontWeight: 600, fontFamily: font, cursor: sentNamaste.has(u.id) ? "default" : "pointer",
                            background: acceptedConnections.has(u.id) ? "#E3FCEF" : sentNamaste.has(u.id) ? "#F0EFED" : "#37352F",
                            color: acceptedConnections.has(u.id) ? "#22A06B" : sentNamaste.has(u.id) ? "#9B9A97" : "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                            transition: "all 0.15s",
                          }}
                        >
                          {acceptedConnections.has(u.id) ? (
                            <>{Icons.check({ size: 14 })} Following</>
                          ) : sentNamaste.has(u.id) ? (
                            <>{Icons.check({ size: 14 })} Request sent</>
                          ) : (
                            <>{Icons.users({ size: 14 })} Namaste</>
                          )}
                        </button>
                        <button onClick={() => openChatWith(u)} style={{
                          flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid #E0E0DE",
                          background: "#fff", cursor: "pointer", color: "#5F5E5B", display: "flex",
                          alignItems: "center", justifyContent: "center", gap: 7,
                          fontSize: 13, fontWeight: 600, fontFamily: font,
                          transition: "all 0.1s",
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.background = "#F7F7F5"; e.currentTarget.style.color = "#37352F"; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#5F5E5B"; }}
                        >
                          {Icons.message({ size: 14 })} Message
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {networkList.length > networkShowCount && (
                  <div style={{ textAlign: "center", marginTop: 16 }}>
                    <button
                      onClick={() => setNetworkShowCount(networkShowCount + 30)}
                      style={{ background: "none", border: "none", color: "#37352F", textDecoration: "underline", fontSize: 13, cursor: "pointer", padding: "12px 16px", fontFamily: font }}
                    >
                      Show more
                    </button>
                  </div>
                )}
              </>
            ) : isNetworkFilterActive ? (
              /* No results state */
              <div style={{ textAlign: "center", padding: 48, color: "#9B9A97", background: "#fff", borderRadius: 12, border: "1px solid #E8E7E4" }}>
                <p style={{ fontSize: 14, fontFamily: font }}>No users found matching your criteria.</p>
                <button
                  onClick={clearNetworkFilters}
                  style={{ background: "none", border: "none", color: "#37352F", textDecoration: "underline", fontSize: 13, cursor: "pointer", marginTop: 8, fontFamily: font }}
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              /* Nobody else to show yet */
              <div style={{ textAlign: "center", padding: 48, color: "#9B9A97", background: "#fff", borderRadius: 12, border: "1px solid #E8E7E4" }}>
                <p style={{ fontSize: 14, fontFamily: font }}>No members to show yet.</p>
              </div>
            )}
          </div>
        );
      }

      case "groups":
        if (selectedGroup) {
          const groupPosts = posts.filter((p) => p.groupId === selectedGroup.id && !blockedIds.has(p.userId)).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          const thumbColors = ["#5A6E55", "#4A5568", "#6B5B4E", "#3D5A80", "#7B6D4E", "#4A6741"];
          const sgColor = thumbColors[groups.findIndex((g) => g.id === selectedGroup.id) % thumbColors.length];
          const guidelinesShown = guidelinesOpen[selectedGroup.id] ?? !selectedGroup.joined;

          return (
            <div style={{ maxWidth: 700, margin: "0 auto" }}>
              {/* Back link */}
              <button onClick={() => { setSelectedGroup(null); setCommunityTab("feed"); }} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#9B9A97", background: "none", border: "none", cursor: "pointer", marginBottom: 16, fontFamily: font, fontWeight: 500 }}>
                {Icons.chevronLeft({ size: 16 })} Back to Groups
              </button>

              {/* Hero Banner */}
              <div style={{ borderRadius: 12, overflow: "hidden", marginBottom: 0, border: "1px solid #E8E7E4", background: "#fff" }}>
                <div style={{
                  height: 140, background: `linear-gradient(135deg, ${sgColor}CC, ${sgColor}88)`,
                  display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "20px 24px",
                  position: "relative",
                }}>
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)" }} />
                  <h1 style={{ fontSize: 26, fontWeight: 700, color: "#fff", position: "relative", zIndex: 1, fontFamily: font }}>{selectedGroup.name}</h1>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", position: "relative", zIndex: 1, fontFamily: font }}>{selectedGroup.category} Community</p>
                </div>

                {/* Description + Joined + Stats */}
                <div style={{ padding: "18px 24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                    <p style={{ fontSize: 14, color: "#5F5E5B", lineHeight: 1.55, fontFamily: font, flex: 1 }}>{selectedGroup.description}</p>
                    <button
                      onClick={() => { if (!selectedGroup.joined || confirm(`Leave ${selectedGroup.name}? You'll stop seeing its posts.`)) toggleGroup(selectedGroup.id); }}
                      style={{
                        padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: font, cursor: "pointer", flexShrink: 0,
                        border: selectedGroup.joined ? "1px solid #E0E0DE" : "none",
                        background: selectedGroup.joined ? "#fff" : "#37352F",
                        color: selectedGroup.joined ? "#5F5E5B" : "#fff",
                      }}
                    >
                      {selectedGroup.joined ? "✓ Joined" : "Join"}
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 12, color: "#9B9A97" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>{Icons.users({ size: 14 })} {(selectedGroup.members || 0).toLocaleString()} members</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>{Icons.shield({ size: 14 })} Admin Moderated</span>
                  </div>
                  {selectedGroup.category === "City" && cityAmbassadors.city === placesCity && cityAmbassadors.list.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap", fontSize: 12, color: "#5F5E5B", fontFamily: font }}>
                      <span style={{ fontWeight: 700, color: "#000080" }}>{cityAmbassadors.list.length === 1 ? "City ambassador:" : "City ambassadors:"}</span>
                      {cityAmbassadors.list.map(a => (
                        <button key={a.id} onClick={() => a.id === user.id ? setView("profile") : openMember(a.id)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: 20, padding: "2px 10px 2px 2px", cursor: "pointer", fontSize: 12, color: "#37352F", fontFamily: font }}>
                          <Avatar name={a.name} size={20} url={a.avatar_url} /> {a.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Community Guidelines: one quiet line, open by default only for visitors */}
                  <button onClick={() => setGuidelinesOpen(prev => ({ ...prev, [selectedGroup.id]: !guidelinesShown }))} aria-expanded={guidelinesShown}
                    style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, background: "none", border: "none", padding: "8px 0", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#5F5E5B", fontFamily: font }}>
                    {Icons.shield({ size: 13 })} Community guidelines <span style={{ display: "inline-block", transform: guidelinesShown ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>›</span>
                  </button>
                  {guidelinesShown && <div style={{ marginTop: 6, padding: "16px 18px", background: "#F7F7F5", borderRadius: 10, border: "1px solid #EDEDEB" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px" }}>
                      {[
                        "Be respectful and kind to all members. Harassment is not tolerated.",
                        "No spam, self-promotion, or irrelevant links. Keep it clean.",
                        "Verify information before sharing, especially regarding visas/legal.",
                        "Report inappropriate behavior to admins immediately.",
                      ].map((rule, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#5F5E5B", lineHeight: 1.5, fontFamily: font }}>
                          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#9B9A97", marginTop: 6, flexShrink: 0 }} />
                          {rule}
                        </div>
                      ))}
                    </div>
                  </div>}
                </div>
              </div>

              {/* Feed / Members Tabs */}
              <div style={{ display: "flex", gap: 24, borderBottom: "1px solid #E8E7E4", margin: "24px 0 20px" }}>
                {(selectedGroup.category === "City" ? ["feed", "members", "places"] : ["feed", "members"]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setCommunityTab(tab)}
                    style={{
                      padding: "0 0 12px", border: "none", background: "none", fontSize: 14, fontWeight: 500,
                      color: communityTab === tab ? "#37352F" : "#9B9A97", cursor: "pointer", fontFamily: font,
                      borderBottom: communityTab === tab ? "2px solid #37352F" : "2px solid transparent",
                      textTransform: "capitalize",
                    }}
                  >
                    {tab === "feed" ? "Feed" : tab === "members" ? "Members" : "Places"}
                  </button>
                ))}
              </div>

              {/* Members at a glance */}
              {communityTab === "feed" && groupMembers.length > 0 && (
                <button onClick={() => setCommunityTab("members")} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "#fff", border: "1px solid #E8E7E4", borderRadius: 12, padding: "10px 14px", marginBottom: 16, cursor: "pointer", fontFamily: font }}>
                  <span style={{ display: "flex" }}>
                    {groupMembers.slice(0, 6).map((m, i) => (
                      <span key={m.id} style={{ marginLeft: i ? -8 : 0, borderRadius: "50%", border: "2px solid #fff", display: "flex" }}><Avatar name={m.name} size={28} url={m.avatar_url} /></span>
                    ))}
                  </span>
                  <span style={{ fontSize: 13, color: "#37352F", fontWeight: 600 }}>{groupMembers.length} {groupMembers.length === 1 ? "member" : "members"}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "#9B9A97" }}>See all ›</span>
                </button>
              )}

              {communityTab === "feed" ? (
                <>
                  {/* Community post box (members only) */}
                  {!selectedGroup.joined ? (
                    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8E7E4", padding: "14px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 14, color: "#5F5E5B", fontFamily: font }}>Join this group to post</span>
                      <button onClick={() => toggleGroup(selectedGroup.id)} style={{ padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: font, cursor: "pointer", flexShrink: 0, border: "none", background: "#37352F", color: "#fff" }}>
                        Join
                      </button>
                    </div>
                  ) : (
                  <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8E7E4", padding: "16px 20px", marginBottom: 20 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <Avatar name={user.name} size={36} url={user.avatar_url} />
                      <input
                        value={newPost} onChange={(e) => setNewPost(e.target.value)}
                        placeholder={`Share something with ${selectedGroup.name}...`}
                        style={{ flex: 1, border: "none", background: "transparent", fontSize: 14, outline: "none", fontFamily: font }}
                        onKeyDown={(e) => e.key === "Enter" && createPost()}
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid #F0EFED" }}>
                      <button onClick={createPost} disabled={!newPost.trim()} style={{
                        padding: "7px 20px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 13, fontFamily: font,
                        background: newPost.trim() ? "#37352F" : "#fff", color: newPost.trim() ? "#fff" : "#9B9A97", cursor: newPost.trim() ? "pointer" : "default",
                      }}>
                        Post
                      </button>
                    </div>
                  </div>
                  )}

                  {groupPosts.length > 0 ? (
                    [...groupPosts].sort((a, b) => (b.id === selectedGroup.pinnedPostId) - (a.id === selectedGroup.pinnedPostId)).map((p) => <PostCard key={p.id} post={p} user={user} onDelete={deletePost} onReport={(id) => setReportConfirm({ type: "post", id })} isReported={reportedIds.has(p.id)} initialLiked={likedPostIds.has(p.id)} hideGroup onOpenProfile={openMember} pinned={p.id === selectedGroup.pinnedPostId} onPin={canPinIn(selectedGroup) ? (id) => pinPost(selectedGroup, id) : null} />)
                  ) : (
                    <div style={{ textAlign: "center", padding: 40, color: "#9B9A97", fontSize: 14, background: "#fff", borderRadius: 12, border: "1px dashed #E8E7E4", fontFamily: font }}>
                      No posts in this community yet. Be the first to say hello!
                    </div>
                  )}
                </>
              ) : communityTab === "places" ? (
                /* Places: desi groceries, restaurants, temples and shops in the city */
                (() => {
                  const city = (selectedGroup.name || "").replace(/^Indians in /i, "");
                  const list = places.city === city ? places.list : [];
                  const kindsHere = PLACE_KINDS.filter(k => list.some(pl => pl.kind === k));
                  const kindFilter = kindsHere.length > 1 && kindsHere.includes(placeKind) ? placeKind : "All";
                  const sorted = [...list].filter(pl => kindFilter === "All" || pl.kind === kindFilter).sort((a, b) => b.recs.length - a.recs.length);
                  return (
                    <div>
                      <p style={{ fontSize: 13, color: "#6B6A67", fontFamily: font, marginBottom: 12 }}>Indian groceries, restaurants and temples in {city}, and doctors, tax advisers and lawyers who know our needs, recommended by members.</p>
                      {kindsHere.length > 1 && (
                        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 10 }}>
                          {["All", ...kindsHere].map(k => (
                            <button key={k} onClick={() => setPlaceKind(k)} aria-pressed={kindFilter === k} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 16, border: "1px solid " + (kindFilter === k ? "#37352F" : "#E0E0DE"), background: kindFilter === k ? "#37352F" : "#fff", color: kindFilter === k ? "#fff" : "#5F5E5B", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>{k === "All" ? "All" : `${PLACE_ICON[k] || "📍"} ${k}`}</button>
                          ))}
                        </div>
                      )}
                      {sorted.map(pl => {
                        const mine = pl.recs.includes(user.id);
                        return (
                          <div key={pl.id} style={{ background: "#fff", border: "1px solid #E8E7E4", borderRadius: 12, padding: "12px 14px", marginBottom: 10, display: "flex", gap: 12, alignItems: "flex-start" }}>
                            <div style={{ fontSize: 22, lineHeight: 1 }} aria-hidden="true">{PLACE_ICON[pl.kind] || "📍"}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#37352F", fontFamily: font }}>{pl.name} <span style={{ fontSize: 11, fontWeight: 500, color: "#9B9A97" }}>· {pl.kind}</span></div>
                              {pl.address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pl.name + ", " + pl.address)}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#5F5E5B", fontFamily: font }}>{pl.address}</a>}
                              {pl.languages && <div style={{ fontSize: 12, color: "#3730A3", marginTop: 3, fontFamily: font }}>🗣️ Speaks {pl.languages}</div>}
                              {pl.note && <p style={{ fontSize: 13, color: "#5F5E5B", margin: "4px 0 0", fontFamily: font, overflowWrap: "anywhere" }}>{pl.note}</p>}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                              <button onClick={() => togglePlaceRec(pl, !mine)} style={{ padding: "6px 10px", borderRadius: 8, border: mine ? "1px solid #B5E4CA" : "1px solid #E0E0DE", background: mine ? "#E3FCEF" : "#fff", color: mine ? "#22A06B" : "#37352F", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>👍 {pl.recs.length}</button>
                              {pl.created_by === user.id && <button onClick={() => removePlace(pl)} style={{ background: "none", border: "none", padding: 0, color: "#9B9A97", fontSize: 11, cursor: "pointer", fontFamily: font, textDecoration: "underline" }}>Delete</button>}
                            </div>
                          </div>
                        );
                      })}
                      {sorted.length === 0 && <EmptyCard text={`No places in ${city} yet. Add the first one!`} />}
                      <div style={{ background: "#FAFAF8", border: "1px dashed #E0E0DE", borderRadius: 12, padding: 14, marginTop: 14 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#37352F", fontFamily: font, marginBottom: 8 }}>Add a place</div>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 8, marginBottom: 8 }}>
                          <input style={inputStyle} placeholder="Name, e.g. Spice Bazaar" value={newPlace.name} maxLength={200} onChange={e => setNewPlace({ ...newPlace, name: e.target.value })} />
                          <select style={{ ...inputStyle, cursor: "pointer" }} value={newPlace.kind} onChange={e => setNewPlace({ ...newPlace, kind: e.target.value })}>
                            {PLACE_KINDS.map(k => <option key={k}>{k}</option>)}
                          </select>
                        </div>
                        {PRO_KINDS.includes(newPlace.kind) && <input style={{ ...inputStyle, marginBottom: 8 }} placeholder="Languages they speak, e.g. Hindi, Tamil" value={newPlace.languages} maxLength={100} onChange={e => setNewPlace({ ...newPlace, languages: e.target.value })} />}
                        <input style={{ ...inputStyle, marginBottom: 8 }} placeholder="Address or area (optional)" value={newPlace.address} maxLength={300} onChange={e => setNewPlace({ ...newPlace, address: e.target.value })} />
                        <input style={{ ...inputStyle, marginBottom: 8 }} placeholder="Why you recommend it (optional)" value={newPlace.note} maxLength={500} onChange={e => setNewPlace({ ...newPlace, note: e.target.value })} />
                        <button onClick={() => addNewPlace(city)} disabled={!newPlace.name.trim()} style={{ ...btnPrimary, fontSize: 13, padding: "9px 16px", opacity: newPlace.name.trim() ? 1 : 0.5 }}>Add place</button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                /* Members Tab */
                (() => {
                  const cityName = (selectedGroup.name || "").replace("Indians in ", "");
                  // Load group members on first render of members tab
                  if (groupMembers.length === 0 && selectedGroup.id) {
                    (async () => {
                      try {
                        const members = await api.getGroupMembers(selectedGroup.id);
                        if (members && members.length) {
                          setGroupMembers(members.map(m => ({
                            id: m.profiles?.id || m.user_id, name: m.profiles?.name || "User",
                            profession: m.profiles?.profession || "", location: m.profiles?.location || "",
                            avatar_url: m.profiles?.avatar_url || "",
                            yearsAbroad: "", linkedinUrl: "",
                          })));
                        }
                      } catch(e) {}
                    })();
                  }
                  // Also include current user if they joined
                  const allMembers = groupMembers.length > 0 ? groupMembers : (selectedGroup.joined ? [{ id: user.id, name: user.name, profession: user.profession, location: user.location, yearsAbroad: user.yearsAbroad }] : []);
                  const localMembers = allMembers.filter(u => (u.location || "").toLowerCase().includes(cityName.toLowerCase()));
                  const outsideMembers = allMembers.filter(u => !(u.location || "").toLowerCase().includes(cityName.toLowerCase()));
                  // Group outside members by their city
                  const outsideByCities = {};
                  outsideMembers.forEach(u => {
                    const city = (u.location || "").split(",")[0].trim() || "Unknown";
                    if (!outsideByCities[city]) outsideByCities[city] = [];
                    outsideByCities[city].push(u);
                  });
                  const outsideCityNames = Object.keys(outsideByCities).sort();
                  const MemberCard = ({ u }) => (
                    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8E7E4", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                      <button type="button" onClick={() => openMember(u.id)} aria-label={`${u.name}'s profile`} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                        <Avatar name={u.name} size={44} url={u.avatar_url} />
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <h4 onClick={() => openMember(u.id)} style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font, cursor: "pointer" }}>{u.name}</h4>
                          <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 5px", borderRadius: 3,
                            background: isUserNRI(u) ? "#E3FCEF" : "#FFF3E0",
                            color: isUserNRI(u) ? "#22A06B" : "#E65100",
                            border: `1px solid ${isUserNRI(u) ? "#B5E4CA" : "#FFE0B2"}`,
                          }}>{isUserNRI(u) ? "NRI" : "IN"}</span>
                        </div>
                        <p style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>{u.profession}</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, fontSize: 11, color: "#9B9A97" }}>
                          {Icons.mapPin({ size: 10 })} {(u.location || "").split(",")[0] || "—"}
                        </div>
                      </div>
                      {u.id === user.id ? (
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#9B9A97", padding: "4px 10px", borderRadius: 6, background: "#F0EFED", flexShrink: 0, fontFamily: font }}>You</span>
                      ) : (
                        <button
                          onClick={() => {
                            if (acceptedConnections.has(u.id)) { if (confirm(`Unfollow ${u.name}?`)) handleUnfollow(u.id); }
                            else if (!sentNamaste.has(u.id)) handleSendNamaste(u.id);
                          }}
                          disabled={sentNamaste.has(u.id) && !acceptedConnections.has(u.id)}
                          style={{
                            padding: "7px 12px", borderRadius: 8, flexShrink: 0, whiteSpace: "nowrap",
                            border: acceptedConnections.has(u.id) ? "1px solid #B5E4CA" : "none",
                            fontSize: 12, fontWeight: 600, fontFamily: font, cursor: (sentNamaste.has(u.id) && !acceptedConnections.has(u.id)) ? "default" : "pointer",
                            background: acceptedConnections.has(u.id) ? "#E3FCEF" : sentNamaste.has(u.id) ? "#F0EFED" : "#37352F",
                            color: acceptedConnections.has(u.id) ? "#22A06B" : sentNamaste.has(u.id) ? "#9B9A97" : "#fff",
                            display: "flex", alignItems: "center", gap: 5,
                          }}
                        >
                          {acceptedConnections.has(u.id) ? (
                            <>{Icons.check({ size: 13 })} Following</>
                          ) : sentNamaste.has(u.id) ? (
                            <>{Icons.check({ size: 13 })} Request sent</>
                          ) : (
                            <>{Icons.users({ size: 13 })} Namaste</>
                          )}
                        </button>
                      )}
                    </div>
                  );
                  return (
                    <div>
                      {localMembers.length > 0 && (
                        <>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#22A06B", marginBottom: 10, fontFamily: font, display: "flex", alignItems: "center", gap: 6 }}>{Icons.mapPin({ size: 14, stroke: "#22A06B" })} Living in {cityName} ({localMembers.length})</h4>
                          <div className="members-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                            {localMembers.map(u => <MemberCard key={u.id} u={u} />)}
                          </div>
                        </>
                      )}
                      {outsideCityNames.map(city => (
                        <div key={city} style={{ marginBottom: 16 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#9B9A97", marginBottom: 10, fontFamily: font, display: "flex", alignItems: "center", gap: 6 }}>{Icons.mapPin({ size: 14, stroke: "#9B9A97" })} {city} ({outsideByCities[city].length})</h4>
                          <div className="members-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            {outsideByCities[city].map(u => <MemberCard key={u.id} u={u} />)}
                          </div>
                        </div>
                      ))}
                      {localMembers.length === 0 && outsideMembers.length === 0 && (
                        <div style={{ textAlign: "center", padding: 32, color: "#9B9A97", fontSize: 14, fontFamily: font }}>No members yet. Be the first to join!</div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          );
        }

        // Groups List View
        const myGroups = groups.filter(g => g.joined);
        const kindOf = (g) => g.category === "City" || g.category === "Language" || g.category === "University" ? g.category : "Other";
        const kindsPresent = ["City", "Language", "University", "Other"].filter(k => groups.some(g => kindOf(g) === k));
        const groupTabList = (groupTab === "my" ? myGroups : groups).filter((g) => g.name.toLowerCase().includes(groupSearchQuery.toLowerCase()) && (groupKind === "all" || kindOf(g) === groupKind));
        // On All groups, the member's own city comes first.
        const myCityGroupName = `indians in ${(user.location || "").split(",")[0].trim().toLowerCase()}`;
        if (groupTab !== "my") groupTabList.sort((a, b) => (b.name.toLowerCase() === myCityGroupName) - (a.name.toLowerCase() === myCityGroupName));
        // A search with no match can turn into a request for that city.
        const searchedCity = groupSearchQuery.trim().replace(/^indians in\s+/i, "");
        const openGroupRequest = (city) => { setNewGroupCity(city); setNewGroupKind("City"); setGroupRequestSent(false); setGroupRequestError(""); setGroupRequestModal(true); };
        const thumbColorsAll = ["#5A6E55", "#4A5568", "#6B5B4E", "#3D5A80", "#7B6D4E", "#4A6741"];

        return (
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            {/* Header with Search */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", fontFamily: font }}>Groups</h2>
              <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}>
                  {Icons.search({ size: 14 })}
                </div>
                <input
                  value={groupSearchQuery} onChange={(e) => setGroupSearchQuery(e.target.value)}
                  placeholder="Search groups or cities…"
                  style={{
                    padding: "7px 12px 7px 30px", fontSize: 12, border: "1px solid #E0E0DE",
                    borderRadius: 6, background: "#fff", outline: "none", width: "100%", fontFamily: font, color: "#37352F",
                  }}
                />
              </div>
            </div>

            {/* My Groups / All Groups tabs */}
            <div style={{ display: "flex", gap: 0, marginBottom: 20, background: "#fff", borderRadius: 8, border: "1px solid #E0E0DE", overflow: "hidden", width: "fit-content" }}>
              {[{ key: "all", label: "All groups" }, { key: "my", label: `My groups (${myGroups.length})` }].map(t => (
                <button key={t.key} onClick={() => setGroupTab(t.key)}
                  style={{ padding: "8px 18px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: font,
                    background: groupTab === t.key ? "#37352F" : "#fff", color: groupTab === t.key ? "#fff" : "#5F5E5B" }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Kind of group */}
            {kindsPresent.length > 1 && (
              <div style={{ display: "flex", gap: 6, marginTop: -8, marginBottom: 18, overflowX: "auto", paddingBottom: 2 }}>
                {[["all", "All"], ...kindsPresent.map(k => [k, { City: "🏙️ Cities", Language: "🗣️ Languages", University: "🎓 Students", Other: "✨ More" }[k]])].map(([k, l]) => (
                  <button key={k} onClick={() => setGroupKind(k)} aria-pressed={groupKind === k} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: "1px solid " + (groupKind === k ? "#37352F" : "#E0E0DE"), background: groupKind === k ? "#37352F" : "#fff", color: groupKind === k ? "#fff" : "#5F5E5B", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>{l}</button>
                ))}
              </div>
            )}

            {/* 2-column grid of community cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="groups-grid">
              {groupTabList.map((g, i) => (
                <div
                  key={g.id}
                  style={{
                    background: "#fff", borderRadius: 12, border: "1px solid #E8E7E4",
                    display: "flex", flexDirection: "column", cursor: "pointer", transition: "box-shadow 0.15s", overflow: "hidden",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.06)")}
                  onMouseOut={(e) => (e.currentTarget.style.boxShadow = "none")}
                >
                  {/* Card content - clickable to open */}
                  <div onClick={() => { setGroupMembers([]); setSelectedGroup(g); }} style={{ padding: "16px 18px", flex: 1 }}>
                    <div style={{ display: "flex", gap: 14, marginBottom: 8 }}>
                      {/* Thumbnail */}
                      <div style={{
                        width: 48, height: 48, borderRadius: 8, flexShrink: 0, overflow: "hidden",
                        background: `linear-gradient(135deg, ${thumbColorsAll[i % thumbColorsAll.length]}CC, ${thumbColorsAll[i % thumbColorsAll.length]}88)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5">
                          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                          <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#37352F", fontFamily: font, marginBottom: 3 }}>{g.name}</h3>
                        {g.category !== "City" && <span style={{ fontSize: 9, color: "#9B9A97", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.08em", border: "1px solid #EDEDEB", padding: "2px 6px", borderRadius: 3 }}>
                          {g.category}
                        </span>}
                      </div>
                    </div>
                    {/* The default "Community for Indians living in X." only repeats the name */}
                    {g.description && g.description !== `Community for Indians living in ${g.name.replace(/^Indians in /, "")}.` && <p style={{ fontSize: 12, color: "#9B9A97", lineHeight: 1.4, fontFamily: font, marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {g.description}
                    </p>}
                    <div style={{ fontSize: 12, color: "#9B9A97", display: "flex", alignItems: "center", gap: 4 }}>
                      {Icons.users({ size: 13 })} {g.members.toLocaleString()} members
                    </div>
                  </div>

                  {/* Join button - full width at bottom */}
                  <div style={{ padding: "0 18px 16px" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (g.joined) { setGroupMembers([]); setSelectedGroup(g); } else toggleGroup(g.id); }}
                      style={{
                        width: "100%", padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: font, cursor: "pointer",
                        border: g.joined ? "1px solid #E0E0DE" : "none",
                        background: g.joined ? "#fff" : "#37352F",
                        color: g.joined ? "#5F5E5B" : "#fff",
                        transition: "all 0.15s",
                      }}
                    >
                      {g.joined ? "✓ Joined" : "Join"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {groupTabList.length === 0 && !groupsLoaded && (
              <div role="status" style={{ textAlign: "center", padding: 40, color: "#9B9A97", fontSize: 14, fontFamily: font }}>Loading groups…</div>
            )}
            {groupTabList.length === 0 && groupsLoaded && (
              <div style={{ textAlign: "center", padding: 40, background: "#fff", borderRadius: 12, border: "1px dashed #E8E7E4", color: "#9B9A97", fontSize: 14, fontFamily: font }}>
                {groups.length === 0 ? "Groups couldn't be loaded. Please reload the page." : "No groups found."}
                {(groupSearchQuery || groupKind !== "all") && (<>
                  <br />
                  <button onClick={() => { setGroupSearchQuery(""); setGroupKind("all"); }} style={{ background: "none", border: "none", color: "#37352F", textDecoration: "underline", cursor: "pointer", marginTop: 8, fontSize: 13, fontFamily: font }}>
                    Clear Search
                  </button>
                </>)}
                {searchedCity && (
                  <>
                    <br />
                    <button onClick={() => openGroupRequest(searchedCity)} style={{ ...btnPrimary, marginTop: 14, maxWidth: "100%", overflowWrap: "anywhere" }}>
                      {Icons.plus({ size: 14 })} Request "Indians in {searchedCity}"
                    </button>
                  </>
                )}
              </div>
            )}
            {groupTabList.length > 0 && (
              <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#9B9A97", fontFamily: font }}>
                Can't find your city?{" "}
                <button onClick={() => openGroupRequest(newGroupCity)} style={{ background: "none", border: "none", padding: "8px 0", color: "#37352F", textDecoration: "underline", cursor: "pointer", fontSize: 13, fontFamily: font }}>
                  Request a group
                </button>
              </div>
            )}
          </div>
        );

      case "events":
        const evtColors = ["#3D6B5A", "#5A4A3D", "#3D5A80", "#6B5B4E", "#4A6741"];
        const filteredEvents = orderEvents(events.filter((e) => {
          const matchesView = eventViewMode === "all" || rsvps.has(e.id);
          const matchesCity = eventCityFilter === "All" || (e.city || "").split(",")[0].trim() === eventCityFilter || (e.location || "").includes(eventCityFilter);
          const q = eventSearch.trim().toLowerCase();
          const matchesSearch = !q || (e.title || "").toLowerCase().includes(q) || (e.description || "").toLowerCase().includes(q) || (e.location || "").toLowerCase().includes(q) || (e.organizer || "").toLowerCase().includes(q);
          return matchesView && matchesCity && matchesSearch;
        }));
        const firstPastEvent = filteredEvents.find(isPastEvent);

        return (
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", fontFamily: font }}>Events</h2>
                <p style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>Discover festivals, meetups, and networking events.</p>
              </div>
              <button onClick={() => setEventModal(true)} style={{ ...btnPrimary, whiteSpace: "nowrap", flexShrink: 0 }}>
                {Icons.plus({ size: 14 })} Host Event
              </button>
            </div>

            {/* Search Bar */}
            <div style={{ position: "relative", marginBottom: 12 }}>
              <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}>{Icons.search({ size: 16 })}</div>
              <input value={eventSearch} onChange={(ev) => setEventSearch(ev.target.value)} placeholder="Search events by name, description, location, or host..." style={{ width: "100%", padding: "12px 14px 12px 40px", borderRadius: 10, border: "1px solid #E8E7E4", background: "#fff", fontSize: 13, fontFamily: font, boxSizing: "border-box", outline: "none" }} />
              {eventSearch && (
                <button onClick={() => setEventSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9B9A97", padding: 4 }}>{Icons.x({ size: 14 })}</button>
              )}
            </div>

            {/* Filter bar - All Events / My RSVPs toggle + city filter */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
              background: "#fff", padding: "8px 12px", borderRadius: 10, border: "1px solid #E8E7E4",
            }}>
              <div style={{ display: "flex", background: "#F0EFED", borderRadius: 6, padding: 3 }}>
                <button
                  onClick={() => setEventViewMode("all")}
                  style={{
                    padding: "6px 14px", borderRadius: 5, border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: font, whiteSpace: "nowrap", flexShrink: 0,
                    background: eventViewMode === "all" ? "#fff" : "transparent",
                    color: eventViewMode === "all" ? "#37352F" : "#9B9A97",
                    boxShadow: eventViewMode === "all" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  All Events
                </button>
                <button
                  onClick={() => setEventViewMode("rsvped")}
                  style={{
                    padding: "6px 14px", borderRadius: 5, border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: font, whiteSpace: "nowrap", flexShrink: 0,
                    background: eventViewMode === "rsvped" ? "#fff" : "transparent",
                    color: eventViewMode === "rsvped" ? "#37352F" : "#9B9A97",
                    boxShadow: eventViewMode === "rsvped" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                  }}
                >
                  My RSVPs
                </button>
              </div>
              <div style={{ width: 1, height: 24, background: "#E8E7E4" }} />
              <div style={{ position: "relative" }}>
                <select
                  value={eventCityFilter}
                  onChange={(e) => setEventCityFilter(e.target.value)}
                  style={{
                    padding: "6px 28px 6px 10px", fontSize: 12, border: "none", background: "transparent",
                    color: "#37352F", fontWeight: 500, cursor: "pointer", fontFamily: font, appearance: "none", outline: "none",
                  }}
                >
                  <option value="All">All cities</option>
                  {GLOBAL_CITIES.map((c) => <option key={c} value={c.split(",")[0]}>{c}</option>)}
                </select>
                <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#9B9A97" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
              </div>
            </div>

            {/* Event Cards */}
            {filteredEvents.length > 0 ? filteredEvents.map((e, idx) => {
              const datePart = eventDate(e);
              const timePart = eventTime(e);
              const timeMain = timePart.split(" ")[0] || timePart;
              const timeAmPm = timePart.split(" ")[1] || "";
              const locMain = (e.location || "").split(",")[0].trim();
              const locCity = (e.location || "").split(",").slice(1).join(",").trim() || e.city || "";
              const evtColor = evtColors[idx % evtColors.length];

              return (
                <Fragment key={e.id}>
                {e === firstPastEvent && <h4 style={{ fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", margin: "28px 0 14px", fontFamily: font }}>Past events</h4>}
                <div className={e.image ? "event-card" : "event-card event-card-plain"} style={{
                  background: "#fff", borderRadius: 14, border: "1px solid #E8E7E4", overflow: "hidden",
                  display: "flex", flexDirection: "row", marginBottom: 16, transition: "box-shadow 0.15s",
                }}
                onMouseOver={(ev) => (ev.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)")}
                onMouseOut={(ev) => (ev.currentTarget.style.boxShadow = "none")}
                >
                  {/* Left Image */}
                  <div style={{
                    width: 220, minHeight: 240, flexShrink: 0, position: "relative",
                    background: e.image ? "#F0EFED" : `linear-gradient(160deg, ${evtColor}DD, ${evtColor}99)`,
                    overflow: "hidden",
                  }}>
                    {e.image && <img src={e.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }} />}
                    {/* Date badge */}
                    <div style={{
                      position: "absolute", top: 14, left: 14, background: "#fff", padding: "6px 12px",
                      borderRadius: 6, fontSize: 12, fontWeight: 700, color: "#37352F", fontFamily: font,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                    }}>
                      {datePart}
                    </div>
                  </div>

                  {/* Right Content */}
                  <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <div>
                      {/* Title + attendees */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                        <h3 onClick={() => setExpandedEvent(e)} style={{ fontSize: 20, fontWeight: 700, color: "#37352F", fontFamily: font, lineHeight: 1.25, flex: 1, cursor: "pointer" }}>{e.title}</h3>
                        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#22A06B" }}>{e.attendees}</div>
                          <div style={{ fontSize: 11, color: "#22A06B", fontWeight: 500 }}>going</div>
                        </div>
                      </div>

                      {/* Time + Location */}
                      <div style={{ display: "flex", gap: 28, marginBottom: 16 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ color: "#9B9A97", marginTop: 2 }}>{Icons.clock({ size: 16 })}</div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font }}>{timeMain}</div>
                            <div style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>{timeAmPm}</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ color: "#9B9A97", marginTop: 2 }}>{Icons.mapPin({ size: 16 })}</div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font }}>{locMain}</div>
                            <div style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>{locCity}</div>
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <p style={{ fontSize: 13, color: "#5F5E5B", lineHeight: 1.55, fontFamily: font, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {e.description || "Join us for this amazing community event. Connect with fellow Indians and enjoy a great time together."}
                      </p>
                    </div>

                    {/* Footer: Hosted by + Going button */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 16, borderTop: "1px solid #F0EFED", marginTop: 16 }}>
                      <div>
                        <div style={{ fontSize: 9, color: "#9B9A97", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.08em", fontFamily: font }}>Hosted by:</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#37352F", fontFamily: font }}>{e.organizer}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {!isPastEvent(e) && <button
                          onClick={() => toggleRsvp(e.id)}
                          disabled={String(e.id).startsWith("e_")}
                          style={{
                            padding: "9px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: font,
                            cursor: String(e.id).startsWith("e_") ? "default" : "pointer", opacity: String(e.id).startsWith("e_") ? 0.5 : 1,
                            border: "1px solid #B5E4CA",
                            background: rsvps.has(e.id) ? "#E3FCEF" : "#fff",
                            color: "#22A06B", transition: "all 0.15s",
                          }}
                        >
                          {rsvps.has(e.id) ? "✓ Going" : "RSVP"}
                        </button>}
                      </div>
                    </div>
                    {/* Report (and Delete for the host) / Share */}
                    <div style={{ display: "flex", alignItems: "center", gap: 4, paddingTop: 8, borderTop: "1px solid #F0EFED", marginTop: 12 }}>
                      <button onClick={() => setReportConfirm({ type: "event", id: e.id, name: e.title })} aria-label="Report" title="Report" style={{ background: "none", border: "none", cursor: "pointer", color: "#D4D4D2", padding: 8, display: "flex" }}>{Icons.flag({ size: 14 })}</button>
                      {e.organizerId === user.id && <button onClick={async () => { if (confirm("Delete this event?")) { try { await api.deleteEvent(e.id); } catch(e2) {} setEvents(prev => prev.filter(x => x.id !== e.id)); } }} aria-label="Delete event" title="Delete event" style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97", padding: 8, display: "flex" }}>{Icons.trash({ size: 14 })}</button>}
                      <button onClick={() => {
                        const shareUrl = `${window.location.origin}/events/${e.id}`;
                        const shareText = `${e.title}\n${eventDate(e)} at ${eventTime(e)}\n📍 ${e.location}\n\n${e.description}\n\n${e.link || shareUrl}`;
                        if (navigator.share) navigator.share({ title: e.title, text: shareText, url: e.link || shareUrl }).catch(() => {});
                        else { navigator.clipboard.writeText(shareText); alert("Event details copied to clipboard!"); }
                      }} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "#9B9A97", fontSize: 12, fontFamily: font, marginLeft: "auto" }}>{Icons.share({ size: 15 })} Share</button>
                    </div>
                  </div>
                </div>
                </Fragment>
              );
            }) : (
              <div style={{ textAlign: "center", padding: 40, background: "#fff", borderRadius: 12, border: "1px dashed #E8E7E4", color: "#9B9A97", fontSize: 14, fontFamily: font }}>
                No events found.
              </div>
            )}
          </div>
        );

      case "trending":
        // Compute trending hashtags from actual posts
        const tagCounts = {};
        const extractHashtags = (text) => {
          const matches = (text || "").match(/#(\w+)/g) || [];
          return matches.map(h => h.replace("#", ""));
        };
        posts.forEach(p => {
          const inline = extractHashtags(p.content);
          const fromTags = (p.tags || []).filter(t => t !== "__external__");
          const all = [...new Set([...inline, ...fromTags])];
          all.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        });
        const trendingTags = Object.entries(tagCounts)
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        return (
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", marginBottom: 20, fontFamily: font }}>Trending Topics</h2>
            <InfoBanner text="The 10 most-used #hashtags. Tap one to see its posts." />
            {trendingTags.length === 0 ? (
              <div style={{ textAlign: "center", padding: 48, color: "#9B9A97", fontSize: 14, background: "#fff", borderRadius: 12, border: "1px dashed #E8E7E4", fontFamily: font }}>
                {Icons.trending({ size: 32, stroke: "#D4D4D2" })}
                <p style={{ marginTop: 12 }}>No trending topics yet. Post with hashtags like #Diwali to start a trend!</p>
              </div>
            ) : (
              <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8E7E4", overflow: "hidden" }}>
                {trendingTags.map((t, i) => (
                  <div key={t.tag} onClick={() => { setFeedFilters(prev => ({ ...prev, tag: t.tag })); setView("home"); }} style={{ padding: "16px 20px", borderBottom: i < trendingTags.length - 1 ? "1px solid #F0EFED" : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}
                    onMouseOver={(e) => (e.currentTarget.style.background = "#FAFAF8")} onMouseOut={(e) => (e.currentTarget.style.background = "#fff")}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: i < 3 ? "#FFF3E0" : "#F0EFED", color: i < 3 ? "#E65100" : "#5F5E5B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, fontFamily: font, flexShrink: 0 }}>#{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#37352F", fontFamily: font }}>#{t.tag}</div>
                      <div style={{ fontSize: 12, color: "#9B9A97", marginTop: 2, fontFamily: font }}>{t.count} {t.count === 1 ? "post" : "posts"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case "help":
        return (
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", fontFamily: font }}>Ask & Guides</h2>
                <p style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>Ask the community, or read guides written by members.</p>
              </div>
              {"help" === "help"
                ? <button onClick={() => setHelpModal(true)} style={{ ...btnPrimary, whiteSpace: "nowrap", flexShrink: 0 }}>Ask a question</button>
                : <button onClick={() => setDocModal(true)} style={{ ...btnPrimary, whiteSpace: "nowrap", flexShrink: 0 }}>{Icons.plus({ size: 14 })} Write a guide</button>}
            </div>
            <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, background: "#F0EFED", borderRadius: 8, marginBottom: 20, width: "fit-content" }}>
              {[{ k: "help", l: "Questions" }, { k: "docs", l: "Guides" }].map(t => (
                <button key={t.k} role="tab" aria-selected={"help" === t.k} onClick={() => { setSelectedDoc(null); setView(t.k); }} style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: "help" === t.k ? "#fff" : "transparent", color: "help" === t.k ? "#37352F" : "#9B9A97", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, boxShadow: "help" === t.k ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}>{t.l}</button>
              ))}
            </div>
            {/* All / Still open / Answered */}
            {(() => {
              const answered = (h) => !!h.bestResponseId || h.status === "Resolved";
              const shown = helpRequests.filter(h => !blockedIds.has(h.userId) && (helpFilter === "all" || (helpFilter === "answered" ? answered(h) : !answered(h))));
              return (
                <>
                  <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                    {[{ k: "all", l: "All" }, { k: "open", l: "Still open" }, { k: "answered", l: "Answered" }].map(f => (
                      <button key={f.k} onClick={() => setHelpFilter(f.k)} aria-pressed={helpFilter === f.k} style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid " + (helpFilter === f.k ? "#37352F" : "#E0E0DE"), background: helpFilter === f.k ? "#37352F" : "#fff", color: helpFilter === f.k ? "#fff" : "#5F5E5B", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>{f.l}</button>
                    ))}
                  </div>
                  {shown.map((h) => {
                    const isMine = h.userId === user.id;
                    const answers = [...(helpResponses[h.id] || [])].sort((a, b) => (b.id === h.bestResponseId) - (a.id === h.bestResponseId));
                    return (
              <div key={h.id} data-help-id={h.id} style={{ background: "#fff", borderRadius: 14, border: `1px solid ${h.urgent && !answered(h) ? "#FECACA" : "#E8E7E4"}`, padding: "20px 24px", marginBottom: 14, scrollMarginTop: 80 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {h.urgent && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 4, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>🚨 Urgent</span>}
                    {answered(h)
                      ? <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 4, background: "#E3FCEF", color: "#1A7F52", border: "1px solid #ABF5D1" }}>✓ Answered</span>
                      : <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4, background: "#F7F6F3", color: "#6B6A67", border: "1px solid #ECEBE8" }}>Still open</span>}
                    <span style={{ fontSize: 11, color: "#9B9A97" }}>{h.category}{h.city ? ` · ${h.city}` : ""}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {isMine && <button aria-label="Delete question" onClick={async () => { if (confirm("Delete this question?")) { try { await api.deleteHelpRequest(h.id); } catch(e) {} setHelpRequests(prev => prev.filter(x => x.id !== h.id)); } }} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", padding: 2 }}>{Icons.trash({ size: 14 })}</button>}
                    <button aria-label="Report" onClick={async () => { setReportConfirm({ type: "help", id: h.id, name: h.title }); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#D4D4D2", padding: 2 }}>{Icons.flag({ size: 14 })}</button>
                  </div>
                </div>
                <h3 onClick={() => openHelp(h)} style={{ fontSize: 17, fontWeight: 700, color: "#37352F", marginBottom: 6, fontFamily: font, cursor: "pointer" }}>{h.title}</h3>
                <p onClick={() => openHelp(h)} style={{ fontSize: 13, color: "#5F5E5B", lineHeight: 1.6, marginBottom: 6, fontFamily: font, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: selectedHelp === h.id ? 999 : 2, WebkitBoxOrient: "vertical", cursor: "pointer", whiteSpace: "pre-wrap" }}>{h.description}</p>
                {h.urgent && selectedHelp === h.id && <div style={{ margin: "10px 0" }}><EmergencyHelp /></div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid #F0EFED" }}>
                  <button type="button" onClick={() => h.userId && h.userId !== user.id ? openMember(h.userId) : null} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: h.userId && !isMine ? "pointer" : "default" }}>
                    <Avatar name={h.user} size={24} url={h.avatar} />
                    <span style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>{h.user} · {timeAgo(h.timestamp)}</span>
                  </button>
                  <button onClick={() => { if (selectedHelp === h.id) setSelectedHelp(null); else openHelp(h); }} style={{ fontSize: 12, color: selectedHelp === h.id ? "#37352F" : "#9B9A97", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", background: "none", border: "none", fontFamily: font, fontWeight: selectedHelp === h.id ? 600 : 400 }}>
                    {Icons.message({ size: 14 })} {h.responses === 1 ? "1 answer" : `${h.responses || 0} answers`}
                  </button>
                </div>
                {selectedHelp === h.id && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #F0EFED" }}>
                    {isMine && answers.length > 0 && !h.bestResponseId && <p style={{ fontSize: 12, color: "#6B6A67", marginBottom: 10, fontFamily: font }}>Did an answer help? Mark it as the best answer, so others find it too.</p>}
                    {answers.map((r, ri) => {
                      const best = r.id === h.bestResponseId;
                      const own = r.userId === user.id;
                      return (
                      <div key={r.id || ri} style={{ display: "flex", gap: 10, marginBottom: 12, padding: "10px 12px", background: best ? "#F0FBF5" : "#FAFAF8", border: best ? "1px solid #ABF5D1" : "1px solid transparent", borderRadius: 8 }}>
                        <button type="button" onClick={() => r.userId && !own ? openMember(r.userId) : null} aria-label={r.user} style={{ background: "none", border: "none", padding: 0, cursor: r.userId && !own ? "pointer" : "default", alignSelf: "flex-start" }}><Avatar name={r.user} size={28} url={r.avatar} /></button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#37352F", fontFamily: font }}>{r.user}{best && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "#1A7F52" }}>✓ Best answer</span>}</span>
                            <span style={{ fontSize: 10, color: "#9B9A97", fontFamily: font, flexShrink: 0 }}>{timeAgo(r.time)}</span>
                          </div>
                          <p style={{ fontSize: 13, color: "#5F5E5B", marginTop: 4, lineHeight: 1.5, fontFamily: font, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.text}</p>
                          {typeof r.id === "string" && (
                            <div style={{ display: "flex", gap: 12, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                              {own
                                ? (r.thanks > 0 && <span style={{ fontSize: 12, color: "#6B6A67", fontFamily: font }}>🙏 {r.thanks === 1 ? "1 thanks" : `${r.thanks} thanks`}</span>)
                                : <button onClick={() => thankAnswer(h.id, r)} aria-pressed={myThanks.has(r.id)} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 14, border: "1px solid " + (myThanks.has(r.id) ? "#37352F" : "#E0E0DE"), background: myThanks.has(r.id) ? "#37352F" : "#fff", color: myThanks.has(r.id) ? "#fff" : "#5F5E5B", cursor: "pointer", fontFamily: font }}>🙏 Thanks{r.thanks > 0 ? ` · ${r.thanks}` : ""}</button>}
                              {isMine && !own && <button onClick={() => chooseBestAnswer(h, r.id)} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 14, border: "1px solid #ABF5D1", background: best ? "#fff" : "#E3FCEF", color: "#1A7F52", cursor: "pointer", fontFamily: font, fontWeight: 600 }}>{best ? "Undo best answer" : "✓ Best answer"}</button>}
                            </div>
                          )}
                        </div>
                      </div>
                      );
                    })}
                    {/* Write new response */}
                    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                      <Avatar name={user.name} size={28} url={user.avatar_url} />
                      <div style={{ flex: 1 }}>
                        <textarea value={helpResponse} onChange={(e) => setHelpResponse(e.target.value)} placeholder={isMine ? "Add more details..." : "Share what you know..."} maxLength={TEXT_LIMIT} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 13, background: "#FAFAF8", outline: "none", fontFamily: font, resize: "vertical", minHeight: 60, boxSizing: "border-box" }} />
                        <CharCount value={helpResponse} />
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                          <button disabled={!helpResponse.trim()} onClick={async () => {
                            const text = helpResponse;
                            let saved = null;
                            try { saved = (await api.addHelpResponse(h.id, text))?.[0] || null; } catch(e) {
                              alert(isNetworkError(e) ? NETWORK_MESSAGE : "Your answer couldn't be posted. Please try again.");
                              return;
                            }
                            setHelpRequests(prev => prev.map(x => x.id === h.id ? { ...x, responses: (x.responses || 0) + 1 } : x));
                            setHelpResponses(prev => ({ ...prev, [h.id]: [...(prev[h.id] || []), { id: saved?.id || Date.now(), userId: user.id, text, user: user.name, avatar: user.avatar_url || "", thanks: 0, time: Date.now() }] }));
                            setHelpResponse("");
                          }} style={{ ...btnPrimary, padding: "7px 16px", fontSize: 12, opacity: helpResponse.trim() ? 1 : 0.4 }}>{isMine ? "Post" : "Post answer"}</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
                    );
                  })}
                  {listsLoaded && shown.length === 0 && <EmptyCard text={helpRequests.length === 0 ? "No questions yet. Ask the first one." : helpFilter === "open" ? "Every question has an answer. 🙏" : "No answered questions yet."} />}
                </>
              );
            })()}
          </div>
        );

      case "docs":
        if (selectedDoc) {
          return (
            <div className="doc-article" style={{ maxWidth: 700, minWidth: 0, margin: "0 auto", background: "#fff", borderRadius: 14, border: "1px solid #E8E7E4", overflow: "hidden" }}>
              {/* Back to the list */}
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #F0EFED" }}>
                <button onClick={() => setSelectedDoc(null)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#9B9A97", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: font, fontWeight: 500 }}>
                  {Icons.chevronLeft({ size: 16 })} All guides
                </button>
              </div>
              {/* Article content */}
              <div className="doc-body" style={{ padding: "32px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 4, background: "#F0EFED", color: "#5F5E5B", fontFamily: font }}>{selectedDoc.category}</span>
                  <span style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>· {selectedDoc.readTime} · {selectedDoc.timestamp}</span>
                </div>
                <h1 className="doc-title" style={{ fontSize: 28, fontWeight: 700, color: "#37352F", lineHeight: 1.25, marginBottom: 24, fontFamily: font }}>{selectedDoc.title}</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32, paddingBottom: 32, borderBottom: "1px solid #F0EFED" }}>
                  <Avatar name={selectedDoc.author} size={44} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font }}>{selectedDoc.author}</div>
                    <div style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>{selectedDoc.profession || "Community Member"} · {selectedDoc.city}</div>
                  </div>
                </div>
                <div style={{ fontSize: 15, color: "#37352F", lineHeight: 1.8, whiteSpace: "pre-wrap", fontFamily: font }}>{selectedDoc.content}</div>
                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "20px 0", margin: "32px 0 24px", borderTop: "1px solid #F0EFED", borderBottom: "1px solid #F0EFED" }}>
                  <button onClick={() => { if (!docLiked) { setDocLiked(true); setSelectedDoc(prev => ({...prev, likes: (prev.likes || 0) + 1})); } else { setDocLiked(false); setSelectedDoc(prev => ({...prev, likes: Math.max(0, (prev.likes || 0) - 1)})); } }} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: docLiked ? "#DC2626" : "#9B9A97", fontSize: 14, fontFamily: font }}>{Icons.heart({ size: 18, fill: docLiked ? "#DC2626" : "none", stroke: docLiked ? "#DC2626" : "currentColor" })} {selectedDoc.likes}</button>
                  <button style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#9B9A97", fontSize: 14, fontFamily: font }}>{Icons.message({ size: 18 })} {(selectedDoc.comments || []).length}</button>
                  <button onClick={() => { if (navigator.share) navigator.share({ title: selectedDoc.title, url: window.location.href }); else { navigator.clipboard.writeText(window.location.href); alert("Link copied!"); } }} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#9B9A97", fontSize: 14, fontFamily: font, marginLeft: "auto" }}>{Icons.share({ size: 18 })} Share</button>
                </div>
                {/* Comments */}
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#37352F", marginBottom: 20, fontFamily: font }}>Comments ({(selectedDoc.comments || []).length})</h3>
                <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                  <Avatar name={user.name} size={32} url={user.avatar_url || user.avatarUrl} />
                  <div style={{ flex: 1 }}>
                    <textarea value={docComment} onChange={(e) => setDocComment(e.target.value)} placeholder="Add a comment..." maxLength={TEXT_LIMIT} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid #E0E0DE", fontSize: 13, background: "#FAFAF8", outline: "none", fontFamily: font, minHeight: 70, resize: "none", boxSizing: "border-box" }} />
                    <CharCount value={docComment} />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                      <button disabled={!docComment.trim()} onClick={async () => {
                        const text = docComment;
                        const docId = selectedDoc.id;
                        const newComment = { id: "c_" + Date.now(), user: user.name, text, time: Date.now() };
                        const updated = docs.map(d => d.id === docId ? { ...d, comments: [...(d.comments || []), newComment] } : d);
                        setDocs(updated);
                        setSelectedDoc(updated.find(d => d.id === docId));
                        setDocComment("");
                        try { await api.addDocComment(docId, text); } catch(e) {
                          // Take the comment back out and give the text back.
                          const without = (d) => d.id === docId ? { ...d, comments: (d.comments || []).filter(c => c.id !== newComment.id) } : d;
                          setDocs(prev => prev.map(without));
                          setSelectedDoc(prev => prev && without(prev));
                          setDocComment(prev => prev || text);
                          alert(isNetworkError(e) ? NETWORK_MESSAGE : "Your comment couldn't be posted. Please try again.");
                        }
                      }} style={{ ...btnPrimary, padding: "8px 18px", opacity: docComment.trim() ? 1 : 0.4 }}>Post Comment</button>
                    </div>
                  </div>
                </div>
                {(selectedDoc.comments || []).map(c => (
                  <div key={c.id} style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                    <Avatar name={c.user} size={32} />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#37352F", fontFamily: font }}>{c.user}</span>
                        <span style={{ fontSize: 11, color: "#9B9A97" }}>· {timeAgo(c.time)}</span>
                      </div>
                      <p style={{ fontSize: 14, color: "#5F5E5B", lineHeight: 1.6, fontFamily: font }}>{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        const essentials = docs.filter(d => d.category === "Essentials");
        const filteredDocs = docs.filter(d => {
          if (d.category === "Essentials" && !docSearch.trim()) return false; // pinned above
          if (docCityFilter !== "All" && !(d.city || "").includes(docCityFilter) && d.category !== "Essentials") return false;
          if (docSearch.trim()) {
            const q = docSearch.toLowerCase();
            return (d.title || "").toLowerCase().includes(q) || (d.excerpt || "").toLowerCase().includes(q) || (d.content || "").toLowerCase().includes(q) || (d.category || "").toLowerCase().includes(q) || (d.author || "").toLowerCase().includes(q);
          }
          return true;
        });
        return (
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", fontFamily: font }}>Ask & Guides</h2>
                <p style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>Ask the community, or read guides written by members.</p>
              </div>
              {"docs" === "help"
                ? <button onClick={() => setHelpModal(true)} style={{ ...btnPrimary, whiteSpace: "nowrap", flexShrink: 0 }}>Ask a question</button>
                : <button onClick={() => setDocModal(true)} style={{ ...btnPrimary, whiteSpace: "nowrap", flexShrink: 0 }}>{Icons.plus({ size: 14 })} Write a guide</button>}
            </div>
            <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, background: "#F0EFED", borderRadius: 8, marginBottom: 20, width: "fit-content" }}>
              {[{ k: "help", l: "Questions" }, { k: "docs", l: "Guides" }].map(t => (
                <button key={t.k} role="tab" aria-selected={"docs" === t.k} onClick={() => { setSelectedDoc(null); setView(t.k); }} style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: "docs" === t.k ? "#fff" : "transparent", color: "docs" === t.k ? "#37352F" : "#9B9A97", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, boxShadow: "docs" === t.k ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}>{t.l}</button>
              ))}
            </div>
            {/* Search Bar */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}>{Icons.search({ size: 15 })}</div>
                <input value={docSearch} onChange={(e) => setDocSearch(e.target.value)} placeholder="Search docs by title, content, category, or author..." style={{ ...inputStyle, paddingLeft: 36, paddingRight: docSearch ? 32 : 14 }} />
                {docSearch && (
                  <button onClick={() => setDocSearch("")} aria-label="Clear search" style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9B9A97", padding: 4 }}>{Icons.x({ size: 14 })}</button>
                )}
              </div>
              <div style={{ position: "relative", width: 160 }}>
                <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}>{Icons.mapPin({ size: 14 })}</div>
                <select value={docCityFilter} onChange={(e) => setDocCityFilter(e.target.value)} style={{ ...inputStyle, paddingLeft: 34, appearance: "none", cursor: "pointer" }}>
                  <option value="All">All cities</option>
                  {GLOBAL_CITIES.map(c => <option key={c} value={c.split(",")[0]}>{c}</option>)}
                </select>
              </div>
            </div>
            {essentials.length > 0 && !docSearch.trim() && (
              <div style={{ background: "#fff", border: "1px solid #E8E7E4", borderRadius: 14, padding: "14px 16px", marginBottom: 20 }}>
                <h4 style={{ fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>📌 NRI essentials</h4>
                {essentials.map(d => (
                  <button key={d.id} onClick={() => setSelectedDoc(d)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, width: "100%", padding: "9px 0", background: "none", border: "none", borderTop: "1px solid #F5F5F3", cursor: "pointer", textAlign: "left", fontFamily: font }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#37352F" }}>{d.title}</span>
                    <span style={{ fontSize: 11, color: "#9B9A97", flexShrink: 0 }}>{d.readTime}</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="docs-grid">
              {filteredDocs.map((d) => (
                <div key={d.id} onClick={async () => {
                  setSelectedDoc(d);
                  try {
                    const dbComments = await api.getDocComments(d.id);
                    if (dbComments && dbComments.length) {
                      const withComments = { ...d, comments: dbComments.map(c => ({ id: c.id, user: c.profiles?.name || "User", text: c.content, time: new Date(c.created_at).getTime() })) };
                      setSelectedDoc(withComments);
                    }
                  } catch(e) {}
                }} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8E7E4", padding: "20px 22px", cursor: "pointer", transition: "box-shadow 0.15s", display: "flex", flexDirection: "column" }}
                  onMouseOver={(e) => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)"}
                  onMouseOut={(e) => e.currentTarget.style.boxShadow = "none"}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "#F0EFED", color: "#5F5E5B", fontFamily: font }}>{d.category}</span>
                      {d.city && <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: "#E3FCEF", color: "#22A06B", fontFamily: font, display: "flex", alignItems: "center", gap: 3 }}>{Icons.mapPin({ size: 10, stroke: "#22A06B" })} {d.city}</span>}
                    </div>
                    <span style={{ fontSize: 11, color: "#9B9A97", fontFamily: font }}>{d.readTime}</span>
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: "#37352F", marginBottom: 6, lineHeight: 1.3, fontFamily: font }}>{d.title}</h3>
                  <p style={{ fontSize: 13, color: "#9B9A97", lineHeight: 1.5, marginBottom: 16, flex: 1, fontFamily: font, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{d.excerpt}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, borderTop: "1px solid #F0EFED" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={d.author} size={24} />
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#37352F", fontFamily: font }}>{d.author}</div>
                        <div style={{ fontSize: 10, color: "#9B9A97", fontFamily: font }}>{d.authorLocation || "—"}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "#9B9A97", display: "flex", alignItems: "center", gap: 4 }}>{Icons.heart({ size: 13 })} {d.likes}</span>
                      {d.userId === user.id && <button onClick={async (e) => { e.stopPropagation(); if (confirm("Delete this doc?")) { try { await api.deleteDoc(d.id); } catch(e2) {} setDocs(prev => prev.filter(x => x.id !== d.id)); } }} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", padding: 2 }}>{Icons.trash({ size: 12 })}</button>}
                      <button onClick={(e) => { e.stopPropagation(); setReportConfirm({ type: "doc", id: d.id, name: d.title }); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#D4D4D2", padding: 2 }}>{Icons.flag({ size: 12 })}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {filteredDocs.length === 0 && (docSearch.trim() || docCityFilter !== "All"
              ? <EmptyCard text="No docs match." action="Clear search" onAction={() => { setDocSearch(""); setDocCityFilter("All"); }} />
              : listsLoaded && <EmptyCard text="No docs yet." />)}
          </div>
        );

      case "market":
        const filteredMarket = marketItems.filter(i => {
          const catMatch = marketCategory === "All" || i.category === marketCategory;
          const cityMatch = marketCityFilter === "All" || i.location.includes(marketCityFilter);
          const searchMatch = i.title.toLowerCase().includes(marketSearch.toLowerCase()) || i.description.toLowerCase().includes(marketSearch.toLowerCase());
          return catMatch && cityMatch && searchMatch;
        });
        return (
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", fontFamily: font }}>Marketplace</h2>
                <p style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>Buy, sell, rent, and find services within the community.</p>
              </div>
              <button onClick={() => setMarketModal(true)} style={{ ...btnPrimary, whiteSpace: "nowrap", flexShrink: 0 }}>{Icons.plus({ size: 14 })} Post Item</button>
            </div>
            {/* Search + city */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}>{Icons.search({ size: 15 })}</div>
                <input value={marketSearch} onChange={(e) => setMarketSearch(e.target.value)} placeholder="Search items, vehicles, housing..." style={{ ...inputStyle, paddingLeft: 36 }} />
              </div>
              <div style={{ position: "relative", width: 160 }}>
                <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}>{Icons.mapPin({ size: 14 })}</div>
                <select value={marketCityFilter} onChange={(e) => setMarketCityFilter(e.target.value)} style={{ ...inputStyle, paddingLeft: 34, appearance: "none", cursor: "pointer" }}>
                  <option value="All">All cities</option>
                  {GLOBAL_CITIES.map(c => <option key={c} value={c.split(",")[0]}>{c}</option>)}
                </select>
              </div>
            </div>
            {/* Category pills */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {["All", "Housing", "Referrals", "Travel", "Jobs", "Items", "Vehicles", "Services"].map(c => (
                <button key={c} onClick={() => setMarketCategory(c)} style={{ padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: font, border: marketCategory === c ? "none" : "1px solid #E0E0DE", background: marketCategory === c ? "#37352F" : "#fff", color: marketCategory === c ? "#fff" : "#5F5E5B", transition: "all 0.1s" }}>
                  {marketLabel(c)}
                </button>
              ))}
            </div>
            {/* Items grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="market-grid">
              {filteredMarket.map(item => (
                <div key={item.id} onClick={() => { setMarketPhotoIdx(0); setExpandedMarketItem(item); }} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8E7E4", overflow: "hidden", transition: "box-shadow 0.15s", cursor: "pointer" }}
                  onMouseOver={(e) => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)"}
                  onMouseOut={(e) => e.currentTarget.style.boxShadow = "none"}>
                  {/* Image/Photo with price badge */}
                  <div style={{ height: 160, background: item.photos && item.photos.length > 0 ? "#F0EFED" : `linear-gradient(135deg, ${item.color}DD, ${item.color}88)`, position: "relative", overflow: "hidden" }}>
                    {item.photos && item.photos.length > 0 && (
                      <img src={item.photos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    )}
                    <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,0.9)", backdropFilter: "blur(4px)", padding: "5px 10px", borderRadius: 4, fontSize: 12, fontWeight: 700, color: "#37352F", display: item.price ? "block" : "none" }}>{item.price}</div>
                    <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(0,0,0,0.6)", padding: "3px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.05em" }}>{marketLabel(item.category)}</div>
                    {item.photos && item.photos.length > 1 && (
                      <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,0.5)", padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, color: "#fff" }}>{item.photos.length} photos</div>
                    )}
                  </div>
                  <div style={{ padding: "14px 16px" }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: "#37352F", marginBottom: 4, fontFamily: font, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</h3>
                    <p style={{ fontSize: 12, color: "#9B9A97", marginBottom: 10, lineHeight: 1.4, fontFamily: font, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.description}</p>
                    <div style={{ fontSize: 11, color: "#9B9A97", display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>{Icons.mapPin({ size: 10 })} {item.location} · {item.date}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid #F0EFED" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Avatar name={item.seller} size={22} />
                        <span style={{ fontSize: 12, fontWeight: 500, color: "#37352F", fontFamily: font }}>{item.seller}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {item.user_id === user.id ? (
                          <button onClick={async (e) => { e.stopPropagation(); if (confirm("Delete this listing?")) { try { await api.deleteMarketItem(item.id); } catch(e) {} setMarketItems(prev => prev.filter(m => m.id !== item.id)); } }} style={{ fontSize: 12, fontWeight: 500, padding: "5px 10px", borderRadius: 6, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", fontFamily: font, display: "flex", alignItems: "center", gap: 4 }}>{Icons.trash({ size: 11 })} Delete</button>
                        ) : (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); setSelectedMarketItem(item); setContactMsg(`Hi ${item.seller.split(" ")[0]}, is this still available?`); }} style={{ fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 6, border: "1px solid #E0E0DE", background: "#fff", color: "#37352F", cursor: "pointer", fontFamily: font }}>Contact</button>
                            <button onClick={(e) => { e.stopPropagation(); setReportConfirm({ type: "marketplace", id: item.id, name: item.title }); }} aria-label="Report" style={{ background: "none", border: "none", cursor: "pointer", color: "#D4D4D2", padding: 8, display: "flex" }}>{Icons.flag({ size: 12 })}</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {filteredMarket.length === 0 && (marketSearch.trim() || marketCityFilter !== "All" || marketCategory !== "All"
              ? <EmptyCard text="No listings match." action="Clear filters" onAction={() => { setMarketSearch(""); setMarketCityFilter("All"); setMarketCategory("All"); }} />
              : listsLoaded && <EmptyCard text="No listings yet." />)}
          </div>
        );

      case "messages":
        // Load conversations from DB on first visit
        if (!convosLoaded && canBrowse) {
          setConvosLoaded(true);
          (async () => {
            try {
              const dbConvos = await api.getConversations();
              if (dbConvos && dbConvos.length) {
                setConvos(dbConvos.map(c => ({
                  id: c.id,
                  name: c.otherUser?.name || "User",
                  otherUserId: c.otherUser?.id,
                  avatar_url: c.otherUser?.avatar_url || "",
                  lastMsg: c.last_message_text || "",
                  time: c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "",
                  unread: false,
                })));
              }
            } catch (e) {}
          })();
        }
        const activeConvo = convos.find(c => c.id === selectedConvo);
        const currentMsgs = selectedConvo ? (chatMessages[selectedConvo] || []) : [];

        // Load messages when a convo is selected
        const loadConvoMessages = async (convoId) => {
          setSelectedConvo(convoId);
          setChatSettings(false);
          if (!chatMessages[convoId]) {
            try {
              const msgs = await api.getMessages(convoId);
              if (msgs) {
                setChatMessages(p => ({ ...p, [convoId]: msgs.map(m => ({
                  id: m.id, text: m.content,
                  sender: m.sender_id === user.id ? "me" : "them",
                  time: new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                })) }));
              }
            } catch (e) {}
          }
        };

        const sendChatMessage = async () => {
          if (!chatInput.trim() || !selectedConvo) return;
          // Check if recipient allows messages
          const otherUser = activeConvo ? convos.find(c => c.id === selectedConvo) : null;
          if (otherUser?.otherUserId) {
            const reason = await messageBlockedReason(otherUser.otherUserId);
            if (reason) { alert(reason); return; }
          }
          const convoId = selectedConvo;
          const msg = { id: Date.now().toString(), text: chatInput, sender: "me", time: "Just now" };
          setChatMessages(p => ({ ...p, [convoId]: [...(p[convoId] || []), msg] }));
          const text = chatInput;
          setChatInput("");
          try {
            await api.sendMessage(convoId, text);
          } catch (e) {
            // Take the message back out and give the text back.
            setChatMessages(p => ({ ...p, [convoId]: (p[convoId] || []).filter(m => m.id !== msg.id) }));
            setChatInput(prev => prev || text);
            alert(await messageErrorText(e, otherUser?.otherUserId));
            return;
          }
          // Update convo list
          setConvos(p => p.map(c => c.id === convoId ? { ...c, lastMsg: text, time: "Just now" } : c));
        };

        return (
          <div>
          <div className={selectedConvo ? "msg-layout has-convo" : "msg-layout"} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8E7E4", overflow: "hidden", height: "calc(100vh - 220px)", minHeight: 500, maxHeight: 800, display: "flex" }}>
            {/* Conversation List */}
            <div className="msg-sidebar" style={{ width: 240, borderRight: "1px solid #E8E7E4", background: "#FAFAF8", display: "flex", flexDirection: "column", flexShrink: 0 }}>
              <div style={{ padding: "16px 18px", borderBottom: "1px solid #E8E7E4" }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#37352F", fontFamily: font, marginBottom: 10 }}>Messages</h3>
                {/* Personal / Marketplace Tabs */}
                <div style={{ display: "flex", gap: 4, background: "#F0EFED", padding: 3, borderRadius: 8 }}>
                  <button onClick={() => setChatTab("personal")} style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "none", background: chatTab === "personal" ? "#fff" : "transparent", color: chatTab === "personal" ? "#37352F" : "#9B9A97", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font, boxShadow: chatTab === "personal" ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}>Personal</button>
                  <button onClick={() => setChatTab("marketplace")} style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "none", background: chatTab === "marketplace" ? "#fff" : "transparent", color: chatTab === "marketplace" ? "#37352F" : "#9B9A97", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font, boxShadow: chatTab === "marketplace" ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}>Marketplace</button>
                </div>
              </div>
              <div style={{ flex: 1, overflow: "auto" }}>
                {(() => {
                  const filteredConvos = convos.filter(c => {
                    if (blockedIds.has(c.otherUserId)) return false;
                    const isMarket = (c.lastMsg || "").includes("[MARKETPLACE:") || (c.isMarketplace === true);
                    return chatTab === "marketplace" ? isMarket : !isMarket;
                  });
                  return filteredConvos.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: "#9B9A97", fontSize: 12, fontFamily: font }}>{chatTab === "marketplace" ? "No marketplace messages yet." : "No conversations yet. Connect with someone first!"}</div>
                  ) : filteredConvos.map(c => (
                    <div key={c.id} onClick={() => { loadConvoMessages(c.id); setConvos(prev => prev.map(x => x.id === c.id ? { ...x, unread: false } : x)); }} style={{ padding: "14px 18px", borderBottom: "1px solid #F0EFED", cursor: "pointer", background: selectedConvo === c.id ? "#fff" : c.unread ? "#F5F8FF" : "transparent", borderLeft: selectedConvo === c.id ? "3px solid #37352F" : "3px solid transparent" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <div style={{ position: "relative" }}>
                          <Avatar name={c.name} size={36} url={c.avatar_url} />
                          {unreadCounts[c.id] > 0 && selectedConvo !== c.id
                            ? <span style={{ position: "absolute", top: -4, right: -6, minWidth: 18, height: 18, padding: "0 5px", background: "#DC2626", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 9, border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{unreadCounts[c.id] > 9 ? "9+" : unreadCounts[c.id]}</span>
                            : c.unread ? <span style={{ position: "absolute", top: 0, right: 0, width: 8, height: 8, background: "#DC2626", borderRadius: "50%", border: "2px solid #fff" }}>{""}</span> : null}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 13, fontWeight: c.unread ? 700 : 500, color: "#37352F", fontFamily: font }}>{c.name}</span>
                            <span style={{ fontSize: 10, color: c.unread ? "#DC2626" : "#9B9A97" }}>{c.time}</span>
                          </div>
                          <p style={{ fontSize: 12, color: c.unread ? "#37352F" : "#9B9A97", fontWeight: c.unread ? 600 : 400, fontFamily: font, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{(c.lastMsg || "").replace(/^\[MARKETPLACE: [^\]]+\]\s*/, "🛒 ")}</p>
                        </div>
                      </div>
                  </div>
                ));
                })()}
              </div>
            </div>
            {/* Chat Area */}
            <div className="msg-chat" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              {selectedConvo && activeConvo ? (
                <>
                  <div style={{ padding: "12px 18px", borderBottom: "1px solid #E8E7E4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <button className="msg-back" onClick={() => setSelectedConvo(null)} aria-label="Back to conversations" style={{ background: "none", border: "none", cursor: "pointer", color: "#5F5E5B", padding: 8, margin: "-8px 0 -8px -8px", fontSize: 22, lineHeight: 1 }}>‹</button>
                      <button type="button" onClick={() => activeConvo.otherUserId && openMember(activeConvo.otherUserId)} style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                        <Avatar name={activeConvo.name} size={32} url={activeConvo.avatar_url} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#37352F", fontFamily: font, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeConvo.name}</span>
                      </button>
                    </div>
                    <div style={{ position: "relative" }}>
                      <button onClick={() => setChatSettings(!chatSettings)} aria-label="Chat options" style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>{Icons.dots({ size: 18 })}</button>
                      {chatSettings && (
                        <>
                          <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setChatSettings(false)} />
                          <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, width: 150, background: "#fff", border: "1px solid #E8E7E4", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", zIndex: 20, overflow: "hidden" }}>
                            <button onClick={() => { const _bid = convos.find(c => c.id === selectedConvo)?.otherUserId; setBlockTargetId(_bid); setBlockModalOpen(true); setChatSettings(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", color: "#37352F", fontSize: 13, fontFamily: font, borderBottom: "1px solid #F0EFED" }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4" y1="4" x2="20" y2="20"/></svg> Block User
                            </button>
                            <button onClick={() => { setReportConfirm({ type: "user", id: activeConvo.otherUserId, name: activeConvo.name }); setChatSettings(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", color: "#37352F", fontSize: 13, fontFamily: font, borderBottom: "1px solid #F0EFED" }}>
                              {Icons.flag({ size: 14 })} Report User
                            </button>
                            <button onClick={async () => {
                              setChatSettings(false);
                              if (!confirm(`Delete this conversation? It's removed from your list; ${activeConvo.name} keeps their copy.`)) return;
                              try {
                                await api.hideConversation(activeConvo.id);
                                setConvos(prev => prev.filter(c => c.id !== activeConvo.id));
                                setChatMessages(p => { const n = { ...p }; delete n[activeConvo.id]; return n; });
                                setUnreadCounts(prev => { const n = { ...prev }; delete n[activeConvo.id]; return n; });
                                setSelectedConvo(null);
                              } catch (e) { alert(isNetworkError(e) ? NETWORK_MESSAGE : "Couldn't delete the conversation. Please try again."); }
                            }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", color: "#DC2626", fontSize: 13, fontFamily: font, borderTop: "1px solid #F0EFED" }}>
                              {Icons.trash({ size: 14 })} Delete conversation
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ flex: 1, padding: 18, overflow: "auto", background: "#FAFAF8", display: "flex", flexDirection: "column", gap: 12 }}>
                    {currentMsgs.map(m => (
                      <div key={m.id} style={{ maxWidth: "75%", alignSelf: m.sender === "me" ? "flex-end" : "flex-start" }}>
                        <div style={{ padding: "10px 14px", borderRadius: m.sender === "me" ? "12px 12px 2px 12px" : "12px 12px 12px 2px", background: m.sender === "me" ? "#37352F" : "#fff", color: m.sender === "me" ? "#fff" : "#37352F", border: m.sender === "me" ? "none" : "1px solid #E8E7E4", fontSize: 14, lineHeight: 1.5, fontFamily: font, overflowWrap: "anywhere" }}>
                          {(() => {
                            const tag = (m.text || "").match(/^\[MARKETPLACE: ([^\]]+)\]\s*/);
                            if (!tag) return m.text;
                            return (<>
                              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🛒 {tag[1]}</div>
                              {m.text.slice(tag[0].length)}
                            </>);
                          })()}
                        </div>
                        <div style={{ fontSize: 10, color: "#9B9A97", marginTop: 4, textAlign: m.sender === "me" ? "right" : "left" }}>{m.time}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: "12px 18px", borderTop: "1px solid #E8E7E4" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") sendChatMessage(); }}
                        placeholder="Type a message..." maxLength={TEXT_LIMIT} style={{ flex: 1, padding: "10px 16px", borderRadius: 20, border: "1px solid #E0E0DE", fontSize: 13, outline: "none", fontFamily: font, background: "#FAFAF8" }} />
                      <button onClick={sendChatMessage} style={{ padding: "8px 12px", borderRadius: "50%", background: chatInput.trim() ? "#37352F" : "#E8E7E4", border: "none", cursor: chatInput.trim() ? "pointer" : "default", color: "#fff", display: "flex", alignItems: "center" }}>
                        {Icons.send({ size: 16 })}
                      </button>
                    </div>
                    <CharCount value={chatInput} />
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#D4D4D2" }}>
                  {Icons.message({ size: 40 })}
                  <p style={{ fontSize: 13, marginTop: 12, color: "#9B9A97", fontFamily: font }}>Select a conversation</p>
                </div>
              )}
            </div>
          </div>
          </div>
        );

      case "mentoring":
        return <MentoringPage key={mentoringKey} user={user} onUserUpdate={onUserUpdate} seekers={seekersList.filter(u => !blockedIds.has(u.id))} ratings={mentorRatings} onRated={refreshRatings} onBook={bookMentor} onMessage={messageMember} openMember={openMember} Avatar={Avatar} />;

      case "member": {
        const mp = memberPage && memberPage.id === memberId ? memberPage : null;
        const m = mp?.profile;
        const counts = networkUsers.find(u => u.id === memberId) || {};
        const following = acceptedConnections.has(memberId);
        const sent = sentNamaste.has(memberId);
        const shared = m ? groups.filter(g => g.joined && (mp.groupIds || []).includes(g.id)) : [];
        const chip = { fontSize: 12, color: "#5F5E5B", background: "#F0EFED", padding: "4px 12px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 4 };
        return (
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <button onClick={() => window.history.length > 1 ? window.history.back() : setView("network")} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#9B9A97", background: "none", border: "none", cursor: "pointer", padding: "0 0 14px", fontFamily: font, fontWeight: 500 }}>
              {Icons.chevronLeft({ size: 16 })} Back
            </button>
            {!mp || (!m && !mp.error) ? (
              <EmptyCard text="Loading the profile…" />
            ) : mp.error ? (
              <EmptyCard text={mp.error} action="Find members" onAction={() => setView("network")} />
            ) : (<>
              <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E8E7E4", padding: "28px 24px", textAlign: "center", position: "relative", marginBottom: 20 }}>
                <button onClick={() => setReportConfirm({ type: "user", id: m.id, name: m.name })} aria-label="Report" style={{ position: "absolute", top: 12, right: 12, padding: 8, background: "none", border: "none", cursor: "pointer", color: "#D4D4D2", display: "flex" }}>{Icons.flag({ size: 14 })}</button>
                <div style={{ display: "flex", justifyContent: "center" }}><Avatar name={m.name || "Member"} size={96} url={m.avatar_url} /></div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", fontFamily: font }}>{m.name || "Member"}</h2>
                  {isNewMember(m.created_at) && <NewBadge />}
                  <AmbassadorBadge city={m.ambassador_city} />
                  {m.mentor_open && m.linkedin_verified && <MentorBadge />}
                  {m.linkedin_verified && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#22C55E" role="img" aria-label="Verified member"><title>Verified member</title><path d="M12 2l2.4 2.2 3.3-.4.9 3.2 2.9 1.7-1.2 3.1 1.2 3.1-2.9 1.7-.9 3.2-3.3-.4L12 22l-2.4-2.2-3.3.4-.9-3.2-2.9-1.7L3.7 12 2.5 8.9l2.9-1.7.9-3.2 3.3.4z"/><path d="M8.5 12.5l2.2 2.2 4.8-4.8" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  )}
                  {(m.country_code || m.location) && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, letterSpacing: "0.05em", background: isUserNRI(m) ? "#E3FCEF" : "#FFF3E0", color: isUserNRI(m) ? "#22A06B" : "#E65100" }}>{isUserNRI(m) ? "NRI" : "IN"}</span>
                  )}
                </div>
                {m.profession && <p style={{ fontSize: 14, color: "#5F5E5B", marginTop: 4, fontFamily: font }}>{m.profession}</p>}
                <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  {m.location && <span style={chip}>{Icons.mapPin({ size: 11 })} Lives in {m.location.split(",")[0]}</span>}
                  {m.hometown && <span style={chip}>{Icons.globe({ size: 11 })} From {m.hometown.split(",")[0]}</span>}
                  {m.years_abroad && <span style={chip}>{m.years_abroad} abroad</span>}
                </div>
                {m.bio && <p style={{ fontSize: 14, color: "#37352F", lineHeight: 1.6, margin: "16px auto 0", maxWidth: 480, fontFamily: font, overflowWrap: "anywhere" }}>{m.bio}</p>}
                {m.ask_me_about && (
                  <div style={{ marginTop: 16 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Ask me about</p>
                    <TopicChips text={m.ask_me_about} center onPick={(t) => { setNetworkSearch(t); setView("network"); }} />
                  </div>
                )}
                {mp.helped > 0 && <p style={{ fontSize: 13, color: "#1A7F52", fontWeight: 600, marginTop: 12, fontFamily: font }}>🙏 Helped {mp.helped === 1 ? "1 member" : `${mp.helped} members`}</p>}
                {m.mentee_open && <p style={{ fontSize: 13, color: "#5F5E5B", marginTop: 10, fontFamily: font }}>🌱 Looking for a mentor{m.mentee_needs ? `: ${m.mentee_needs}` : ""}</p>}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, margin: "16px 0 0", fontSize: 13, fontFamily: font }}>
                  <span><b style={{ color: "#37352F" }}>{counts.followers || 0}</b> <span style={{ color: "#9B9A97" }}>{counts.followers === 1 ? "follower" : "followers"}</span></span>
                  <span style={{ color: "#D4D4D2" }}>·</span>
                  <span><b style={{ color: "#37352F" }}>{counts.following || 0}</b> <span style={{ color: "#9B9A97" }}>following</span></span>
                  {m.linkedin_url && (<>
                    <span style={{ color: "#D4D4D2" }}>·</span>
                    <a href={m.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: "#0077B5", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>{Icons.linkedin({ size: 13, stroke: "#0077B5" })} LinkedIn</a>
                  </>)}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "center", flexWrap: "wrap" }}>
                  <button onClick={() => { if (following) { if (confirm(`Unfollow ${m.name}?`)) handleUnfollow(m.id); } else if (!sent) handleSendNamaste(m.id); }} disabled={sent && !following}
                    style={{ ...btnPrimary, minWidth: 140, justifyContent: "center", background: following ? "#E3FCEF" : sent ? "#F0EFED" : "#37352F", color: following ? "#22A06B" : sent ? "#9B9A97" : "#fff", border: following ? "1px solid #B5E4CA" : "none", cursor: sent && !following ? "default" : "pointer" }}>
                    {following ? "✓ Following" : sent ? "Namaste sent" : "🙏 Namaste"}
                  </button>
                  <button onClick={() => openChatWith({ id: m.id, name: m.name, avatar_url: m.avatar_url })} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", color: "#37352F", cursor: "pointer", fontFamily: font, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    {Icons.message({ size: 14 })} Message
                  </button>
                </div>
              </div>
              {m.mentor_open && m.linkedin_verified && (
                <MentorProfileCard member={{ id: m.id, name: m.name, avatar_url: m.avatar_url, mentorAreas: m.mentor_areas }} rating={mentorRatings[m.id]} isSelf={m.id === user.id} me={user.id} onBook={() => bookMentor({ id: m.id, name: m.name, avatar_url: m.avatar_url, mentorAreas: m.mentor_areas })} Avatar={Avatar} />
              )}
              {shared.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, fontFamily: font }}>Groups you share</h4>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {shared.map(g => (
                      <button key={g.id} onClick={() => { setGroupMembers([]); setSelectedGroup(g); setView("groups"); }} style={{ ...chip, border: "1px solid #E8E7E4", background: "#fff", cursor: "pointer", fontFamily: font, padding: "6px 12px" }}>{Icons.users({ size: 12 })} {g.name}</button>
                    ))}
                  </div>
                </div>
              )}
              <h4 style={{ fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, fontFamily: font }}>Recent posts</h4>
              {mp.posts.length > 0
                ? mp.posts.filter(p => !blockedIds.has(p.userId)).map(p => <PostCard key={p.id} post={p} user={user} onDelete={deletePost} onReport={(id) => setReportConfirm({ type: "post", id })} isReported={reportedIds.has(p.id)} initialLiked={likedPostIds.has(p.id)} />)
                : <EmptyCard text={`${(m.name || "This member").split(" ")[0]} hasn't posted yet.`} />}
            </>)}
          </div>
        );
      }

      case "profile":
        return (
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E8E7E4", padding: 32, textAlign: "center" }}>
              <div style={{ position: "relative", display: "inline-block", marginBottom: 0 }}>
                <Avatar name={user.name} size={80} url={user.avatar_url || user.avatarUrl} />
                <input type="file" accept="image/*" id="profile-avatar-upload" style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) { alert("Photo must be under 5MB"); return; }
                    try {
                      const url = await api.uploadAvatar(file);
                      await api.updateProfile({ avatar_url: url });
                      const updatedUser = { ...user, avatar_url: url, avatarUrl: url };
                      localStorage.setItem("nriclub_profile_cache", JSON.stringify(updatedUser));
                      window.location.reload();
                    } catch (err) { alert(apiErrorMessage(err, "Your photo couldn't be uploaded. Please try a JPG or PNG under 5 MB.")); }
                  }}
                />
                <label htmlFor="profile-avatar-upload" style={{
                  position: "absolute", bottom: -2, right: -2,
                  width: 28, height: 28, borderRadius: "50%", background: "#fff",
                  border: "1px solid #E0E0DE", display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </label>
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", marginTop: 16, fontFamily: font }}>{user.name}</h2>
              {true && (
                <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 4, letterSpacing: "0.05em", marginTop: 6,
                  background: isUserNRI(user) ? "#E3FCEF" : "#FFF3E0",
                  color: isUserNRI(user) ? "#22A06B" : "#E65100",
                  border: `1px solid ${isUserNRI(user) ? "#B5E4CA" : "#FFE0B2"}`,
                }}>{isUserNRI(user) ? "NRI — Living Abroad" : "Based in India"}</span>
              )}
              <p style={{ fontSize: 14, color: "#5F5E5B", marginTop: 4, fontFamily: font }}>{user.profession}</p>
              <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
                {user.location ? (
                  <span style={{ fontSize: 12, color: "#5F5E5B", background: "#F0EFED", padding: "4px 12px", borderRadius: 20, display: "flex", alignItems: "center", gap: 4 }}>
                    {Icons.mapPin({ size: 12 })} {user.location}
                  </span>
                ) : null}
                {user.hometown ? (
                  <span style={{ fontSize: 12, color: "#5F5E5B", background: "#F0EFED", padding: "4px 12px", borderRadius: 20, display: "flex", alignItems: "center", gap: 4 }}>
                    {Icons.globe({ size: 12 })} From {user.hometown}
                  </span>
                ) : null}
                {user.yearsAbroad && (
                  <span style={{ fontSize: 12, color: "#5F5E5B", background: "#F0EFED", padding: "4px 12px", borderRadius: 20, display: "flex", alignItems: "center", gap: 4 }}>
                    {Icons.clock({ size: 12 })} {user.yearsAbroad}
                  </span>
                )}
              </div>
              {user.ambassadorCity && <div style={{ marginTop: 12 }}><AmbassadorBadge city={user.ambassadorCity} /></div>}
              {!user.hasTopics ? null : user.askMeAbout
                ? <div style={{ marginTop: 14 }}><p style={{ fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Ask me about</p><TopicChips text={user.askMeAbout} center /></div>
                : <button type="button" onClick={() => openProfileEditor("askMeAbout")} style={{ marginTop: 14, background: "none", border: "1px dashed #C7D2FE", borderRadius: 20, padding: "5px 12px", fontSize: 12, color: "#3730A3", cursor: "pointer", fontFamily: font }}>+ Add what people can ask you about</button>}
              {myHelped > 0 && <p style={{ fontSize: 13, color: "#1A7F52", fontWeight: 600, marginTop: 12, fontFamily: font }}>🙏 You've helped {myHelped === 1 ? "1 member" : `${myHelped} members`}</p>}
              {user.linkedin_verified && (
                <div style={{ marginTop: 16 }}>
                  <span style={{ fontSize: 12, color: "#1A7F52", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#22C55E" stroke="none" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                    Verified member
                  </span>
                </div>
              )}
              <button onClick={() => openProfileEditor()} style={{ ...btnPrimary, marginTop: 24 }}>
                {Icons.edit({ size: 14 })} Edit Profile
              </button>

              {/* Followers / Following */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 20, paddingTop: 16, borderTop: "1px solid #F0EFED" }}>
                <span onClick={() => setFollowModal("followers")} style={{ cursor: "pointer" }}><b style={{ color: "#37352F", fontSize: 16 }}>{myFollowers.length}</b> <span style={{ color: "#9B9A97", fontSize: 13 }}>followers</span></span>
                <span style={{ color: "#D4D4D2" }}>·</span>
                <span onClick={() => setFollowModal("following")} style={{ cursor: "pointer" }}><b style={{ color: "#37352F", fontSize: 16 }}>{myFollowing.length}</b> <span style={{ color: "#9B9A97", fontSize: 13 }}>following</span></span>
              </div>
            </div>

            {/* Posts / Photos Tabs */}
            <div style={{ display: "flex", gap: 8, background: "#F0EFED", padding: 4, borderRadius: 10, marginTop: 32, marginBottom: 16, maxWidth: 300 }}>
              <button onClick={() => setProfileTab("posts")} style={{ flex: 1, padding: "8px 16px", borderRadius: 8, border: "none", background: profileTab === "posts" ? "#fff" : "transparent", color: profileTab === "posts" ? "#37352F" : "#9B9A97", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, boxShadow: profileTab === "posts" ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}>My Posts</button>
              <button onClick={() => setProfileTab("photos")} style={{ flex: 1, padding: "8px 16px", borderRadius: 8, border: "none", background: profileTab === "photos" ? "#fff" : "transparent", color: profileTab === "photos" ? "#37352F" : "#9B9A97", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, boxShadow: profileTab === "photos" ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}>My Photos</button>
            </div>
            {profileTab === "posts" ? (
              posts.filter((p) => p.userId === user.id).length > 0 ? (
                posts.filter((p) => p.userId === user.id).map((p) => <PostCard key={p.id} post={p} user={user} onDelete={deletePost} onReport={(id) => setReportConfirm({ type: "post", id })} isReported={reportedIds.has(p.id)} initialLiked={likedPostIds.has(p.id)} onOpenProfile={openMember} />)
              ) : (
                <div style={{ textAlign: "center", padding: 32, color: "#9B9A97", fontSize: 14, background: "#fff", borderRadius: 12, border: "1px dashed #E8E7E4", fontFamily: font }}>
                  You haven't posted anything yet.
                </div>
              )
            ) : (
              (() => {
                const myPhotoPosts = posts.filter(p => p.userId === user.id && p.image);
                return myPhotoPosts.length > 0 ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {myPhotoPosts.map(p => (
                      <div key={p.id} style={{ aspectRatio: "1", overflow: "hidden", borderRadius: 8, background: "#F0EFED", cursor: "pointer" }}>
                        <img src={p.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: 32, color: "#9B9A97", fontSize: 14, background: "#fff", borderRadius: 12, border: "1px dashed #E8E7E4", fontFamily: font }}>
                    No photos yet. Photos from your posts will appear here.
                  </div>
                );
              })()
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // A notification from the bell (or from its pop-up): go where it points.
  const openNotification = (n) => {
    if (n.type === "like" || n.type === "comment") {
      setView("home");
      setNotifOpen(false);
      // Mark as read
      try { api.markNotificationHandled(n.id); } catch(e) {}
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      // Scroll to the post after a short delay for render
      if (n.reference_id) {
        setTimeout(() => {
          const el = document.querySelector(`[data-post-id="${n.reference_id}"]`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.style.boxShadow = "0 0 0 3px #5B9CFF";
            setTimeout(() => { el.style.boxShadow = ""; }, 2000);
          }
        }, 300);
      }
    } else if (n.type === "request") {
      // Don't navigate for requests - they have Accept/Ignore buttons
    } else if (["booking", "booking_cancelled", "review"].includes(n.type)) {
      setNotifOpen(false);
      Promise.resolve(api.markNotificationHandled(n.id)).catch(() => {});
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      setMentoringKey(k => k + 1);
      if (n.type === "review") refreshRatings();
      setView("mentoring");
    } else if (["answer", "thanks", "best", "urgent", "rsvp", "member"].includes(n.type)) {
      setNotifOpen(false);
      Promise.resolve(api.markNotificationHandled(n.id)).catch(() => {});
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      if (n.type === "rsvp") {
        const ev = events.find(e => e.id === n.reference_id);
        setView("events");
        if (ev) setExpandedEvent(ev);
      } else if (n.type === "member") {
        if (n.actor_id) openMember(n.actor_id);
      } else if (n.reference_id) {
        openQuestion(n.reference_id);
      }
    } else if (n.type === "event") {
      setView("events");
      setNotifOpen(false);
    } else if (n.type === "group") {
      setView("groups");
      setNotifOpen(false);
    } else if (n.type === "message") {
      setView("messages");
      setNotifOpen(false);
    } else if (n.type === "verification") {
      setNotifOpen(false);
      Promise.resolve(api.markNotificationHandled(n.id)).catch(() => {});
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      refreshMyProfile().then(fresh => {
        if (fresh?.verificationStatus === "needs_info") setVerifyOpen(true);
      });
    }
  };

  // ---------------------------------------------------------------------------
  // IN-APP NOTICES (member/Notices.jsx): NRIClub sends no notification emails,
  // so what they would have said shows here. One dialog at a time: the
  // verification result, else the welcome (first visit) or the catch-up (back
  // to unread things); and small pop-ups for new things while the member is here.
  // ---------------------------------------------------------------------------
  const [notice, setNotice] = useState(null); // null | { kind: "welcome" | "verified" | "info" | "catchup", verified?, notifId?, items? }
  const [toasts, setToasts] = useState([]);
  const firstNoticeRef = useRef(false); // the welcome or catch-up was decided for this visit
  const handledNoticesRef = useRef(new Set()); // notifications already shown as a notice (the next poll may still say unread)
  const pushToast = (t) => setToasts(prev => [...prev.filter(x => x.id !== t.id), t].slice(-3));
  const dismissToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  // Before going somewhere from a notice or a toast: close what only shows
  // something (nothing typed is lost), so the place it opens is in view.
  const leaveOverlays = () => {
    setExpandedEvent(null); setExpandedMarketItem(null); setMarketPhotoIdx(0);
    setSettingsModal(m => (m === "feedback" ? m : null)); setFollowModal(null); setHelpModal(false);
    setNotifOpen(false); setSettingsOpen(false); setMobileMenu(false); setChatSettings(false);
  };
  const openConversation = (cid) => {
    leaveOverlays();
    setView("messages");
    setSelectedConvo(cid);
    if (!chatMessages[cid]) {
      api.getMessages(cid).then(msgs => {
        if (msgs) setChatMessages(p => ({ ...p, [cid]: msgs.map(m => ({
          id: m.id, text: m.content,
          sender: m.sender_id === user.id ? "me" : "them",
          time: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        })) }));
      }).catch(() => {});
    }
  };
  // The member's city group (cityGroup, above), or asking for one when the
  // lists show there is none. Before the lists are in, /groups opens and the
  // group follows once it has loaded.
  const cityMissing = !!welcomeCity && listsLoaded && !cityGroup;
  const openMyCityGroup = () => {
    closeNotice();
    leaveOverlays();
    if (cityGroup) { setGroupMembers([]); setSelectedGroup(cityGroup); setView("groups"); return; }
    setSelectedGroup(null);
    setView("groups");
    if (cityMissing) {
      setNewGroupCity(welcomeCity); setNewGroupKind("City"); setGroupRequestSent(false); setGroupRequestError(""); setGroupRequestModal(true);
    } else if (welcomeCity) {
      try { if (window.location.pathname !== "/groups") window.history.pushState(null, "", "/groups"); } catch (e) {}
      setPendingRoute({ kind: "city", id: welcomeCity });
    }
  };

  const closeNotice = () => {
    const n = notice;
    setNotice(null);
    if (!n) return;
    if (n.notifId) {
      handledNoticesRef.current.add(n.notifId);
      Promise.resolve(api.markNotificationHandled(n.notifId)).catch(() => {});
      setNotifications(prev => prev.map(x => x.id === n.notifId ? { ...x, read: true } : x));
    }
    if (n.kind === "welcome") { rememberNotice("welcome", user.id); rememberNotice("catchup", user.id); }
  };

  // Our team decided (approved, or needs more information): say so once,
  // going by the status loaded after the decision arrived (never by the one
  // from before). While the welcome is open, it takes the approval (it then
  // says "You're verified" itself) instead of a second dialog.
  const verificationNotif = notifications.find(n => n.type === "verification" && !n.read && !handledNoticesRef.current.has(n.id));
  const decided = verificationNotif && verificationChecked?.id === verificationNotif.id ? verificationChecked.status : null;
  useEffect(() => {
    if (!verificationNotif || !decided || locked) return;
    if (notice) {
      if (notice.kind === "welcome" && decided === "approved" && notice.notifId !== verificationNotif.id) {
        setNotice(n => (n?.kind === "welcome" ? { ...n, verified: true, notifId: verificationNotif.id } : n));
      }
      return;
    }
    if (decided === "approved") {
      firstNoticeRef.current = true;
      setNotice(welcomeDue(user) ? { kind: "welcome", verified: true, notifId: verificationNotif.id } : { kind: "verified", notifId: verificationNotif.id });
    } else if (decided === "needs_info") {
      firstNoticeRef.current = true;
      setNotice({ kind: "info", notifId: verificationNotif.id });
    }
  }, [verificationNotif?.id, decided, notice, locked]);

  // Opening NRIClub: the welcome for a new member, else a catch-up with what
  // arrived since the last one (unread messages, Namaste requests,
  // notifications), at most every few hours. Decided once everything it
  // needs has loaded (a member held for review loads no lists; they get the
  // welcome only).
  const noticesReady = notifPrefsLoaded && (canBrowse ? listsLoaded && unreadLoaded : !locked);
  useEffect(() => {
    if (firstNoticeRef.current || !noticesReady || locked) return;
    if (notice) { firstNoticeRef.current = true; return; }
    // A decision our team just made: wait for the status loaded after it;
    // an approval or a request for information is shown by the effect above.
    if (verificationNotif && verificationChecked?.id !== verificationNotif.id) return;
    if (decided === "approved" || decided === "needs_info") return;
    firstNoticeRef.current = true;
    if (welcomeDue(user)) { setNotice({ kind: "welcome" }); return; }
    const since = lastCatchUp(user.id);
    // Not when the member's choice couldn't be loaded (they may have turned it off).
    if (!canBrowse || notifPrefsLoaded !== "ok" || notifSettings.email === false || since === null || Date.now() - since <= CATCH_UP_EVERY_MS) return;
    const isNew = (n) => !n.read && Date.parse(n.created_at || "") > since;
    const fresh = (id) => Math.min(unreadCounts[id] || 0, api.unreadSince(id, since));
    const chats = Object.keys(unreadCounts).filter(id => fresh(id) > 0);
    const messages = chats.reduce((sum, id) => sum + fresh(id), 0);
    const requests = notifications.filter(n => n.type === "request" && isNew(n)).length;
    const others = notifications.filter(n => isNew(n) && !["request", "verification"].includes(n.type)).length;
    const go = (fn) => () => { closeNotice(); leaveOverlays(); fn(); };
    const items = [];
    if (messages) items.push({ icon: "💬", text: messages === 1 ? "1 new message" : `${messages} new messages`, action: "Open", onClick: go(() => { if (chats.length === 1) openConversation(chats[0]); else setView("messages"); }) });
    if (requests) items.push({ icon: "🙏", text: requests === 1 ? "1 Namaste request" : `${requests} Namaste requests`, action: "See", onClick: go(() => setNotifOpen(true)) });
    if (others) items.push({ icon: "🔔", text: others === 1 ? "1 new notification" : `${others} new notifications`, action: "See", onClick: go(() => setNotifOpen(true)) });
    if (!items.length) return;
    rememberNotice("catchup", user.id);
    setNotice({ kind: "catchup", items });
  }, [noticesReady, verificationChecked]);

  // A locked member (blocked or rejected) sees only their card.
  useEffect(() => { if (locked) { setNotice(null); setToasts([]); } }, [locked]);

  // Pop-ups for new things while the member is here. Only the latest 20
  // notifications are loaded, so an older one can come back into the list
  // (when a newer one is deleted): only what is newer than the oldest one
  // seen at the start counts as new.
  const TOAST_SKIP = ["like", "verification", "trending"];
  const notifLine = (n) => (n.actor && !(n.text || "").startsWith(n.actor) ? `${n.actor} ${n.text || ""}` : n.text || "");
  const seenNotifsRef = useRef(null);
  const notifFloorRef = useRef(-Infinity);
  useEffect(() => {
    if (!notifsLoaded) return;
    if (!seenNotifsRef.current) {
      seenNotifsRef.current = new Set(notifications.map(n => n.id));
      if (notifications.length) notifFloorRef.current = Math.min(...notifications.map(n => Date.parse(n.created_at || "") || 0));
      return;
    }
    const fresh = notifications.filter(n => !seenNotifsRef.current.has(n.id));
    fresh.forEach(n => seenNotifsRef.current.add(n.id));
    if (notifSettings.push === false || notifPrefsLoaded !== "ok" || locked) return;
    fresh.filter(n => !n.read && !TOAST_SKIP.includes(n.type) && (Date.parse(n.created_at || "") || 0) >= notifFloorRef.current).slice(0, 3).forEach(n => pushToast({
      id: `n-${n.id}`,
      icon: n.type === "request" ? "🙏" : n.type === "comment" ? "💬" : NOTIF_BADGE[n.type] || "🔔",
      text: notifLine(n),
      onOpen: () => { leaveOverlays(); if (n.type === "request") setNotifOpen(true); else openNotification(n); },
    }));
  }, [notifications, notifsLoaded]);
  const lastUnreadRef = useRef(null);
  useEffect(() => {
    const before = lastUnreadRef.current;
    if (!unreadLoaded) return;
    lastUnreadRef.current = unreadCounts;
    if (!before || notifSettings.push === false || notifPrefsLoaded !== "ok" || locked) return;
    Object.keys(unreadCounts).forEach(cid => {
      if (unreadCounts[cid] > (before[cid] || 0) && view !== "messages") {
        const c = convos.find(x => x.id === cid);
        pushToast({ id: `m-${cid}`, icon: "💬", text: c?.name ? `New message from ${c.name}` : "New message", action: "Open", onOpen: () => openConversation(cid) });
      }
    });
  }, [unreadCounts, unreadLoaded]);

  return (
    <div ref={dashboardRef} style={{ minHeight: "100vh", background: "#FAFAF8", fontFamily: font }}>
      {/* Rejected verification: full-screen card (blocked members see the blocked overlay instead) */}
      {user?.verificationStatus === "rejected" && user?.status !== "blocked" && (
        <div data-lock-overlay><RejectedScreen user={user} onSignOut={onLogout} /></div>
      )}
      {/* Get verified again, when an admin asked for more information */}
      {verifyOpen && user.verificationStatus === "needs_info" && !locked && (
        <GetVerified
          user={user}
          mode="update"
          onCancel={() => setVerifyOpen(false)}
          onDone={(updated) => { onUserUpdate(updated); setVerifyOpen(false); }}
        />
      )}
      {/* NAV */}
      <nav style={{ background: "#fff", borderBottom: "1px solid #E8E7E4", position: "sticky", top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px", height: 56, display: "grid", gridTemplateColumns: "240px 1fr 210px", gap: 28, alignItems: "center" }} className="nav-grid">
          <div onClick={() => setView("home")} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <FlagIcon size={28} />
            <span style={{ fontSize: 18, fontWeight: 800, color: "#37352F", letterSpacing: -0.5 }}>NRI<span style={{fontStyle:'italic',fontFamily:'"Times New Roman",serif'}}>Club</span></span>
          </div>

          {/* Desktop Nav - aligned with center content column */}
          <div style={{ display: "flex", alignItems: "center", background: "#F5F5F3", borderRadius: 24, padding: "3px 4px", gap: 2, justifyContent: "center" }} className="desktop-nav">
            <button style={navBtn("home")} onClick={() => setView("home")}>Home</button>
            <button style={navBtn("network")} onClick={() => setView("network")}>Find</button>
            <button style={navBtn("groups")} onClick={() => { setView("groups"); setSelectedGroup(null); }}>Groups</button>
            <button style={navBtn("events")} onClick={() => setView("events")}>Events</button>
            <button style={navBtn(view === "docs" ? "docs" : "help")} onClick={() => setView("help")}>Ask & Guides</button>
            <button style={navBtn("market")} onClick={() => setView("market")}>Market</button>
          </div>

          {/* Right side icons */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
            {/* Notification Bell */}
            <div style={{ position: "relative" }}>
              <button onClick={() => { setNotifOpen(!notifOpen); setSettingsOpen(false); }} aria-label="Notifications" aria-expanded={notifOpen}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: "#9B9A97", position: "relative", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
                onMouseOver={(e) => (e.currentTarget.style.background = "#F0EFED")}
                onMouseOut={(e) => (e.currentTarget.style.background = "none")}>
                {Icons.bell({ size: 20 })}
                {notifications.some(n => !n.read) ? <span style={{ position: "absolute", top: 5, right: 6, width: 7, height: 7, background: "#E25555", borderRadius: "50%", border: "1.5px solid #fff" }}>{""}</span> : null}
              </button>
              {notifOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setNotifOpen(false)} />
                  <div className="notif-dropdown" style={{ position: "absolute", right: 0, top: "100%", marginTop: 8, width: 360, background: "#fff", border: "1px solid #E8E7E4", borderRadius: 14, boxShadow: "0 8px 24px rgba(0,0,0,0.1)", zIndex: 50, overflow: "hidden", maxHeight: 440 }}>
                    <div style={{ padding: "14px 18px", borderBottom: "1px solid #F0EFED", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FAFAF8" }}>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: "#37352F", fontFamily: font }}>Notifications</h3>
                      <button onClick={async () => { setNotifications(p => p.map(n => ({...n, read: true}))); try { await api.markNotificationsRead(); } catch(e) {} }} style={{ background: "none", border: "none", fontSize: 12, color: "#9B9A97", cursor: "pointer", fontFamily: font }}>Mark all read</button>
                    </div>
                    <div style={{ overflow: "auto", maxHeight: 380 }}>
                      {(acceptedNotifs.length ? [...notifications.filter(n => !acceptedNotifs.some(a => a.id === n.id)), ...acceptedNotifs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : notifications).map(n => (
                        <div key={n.id} onClick={() => openNotification(n)} style={{ padding: "14px 18px", borderBottom: "1px solid #F0EFED", display: "flex", gap: 12, background: n.read ? "#fff" : "#F5F8FF", cursor: n.type !== "request" ? "pointer" : "default" }}>
                          <div style={{ flexShrink: 0, marginTop: 2 }}>
                            {n.actor ? (
                              <div style={{ position: "relative" }}>
                                <Avatar name={n.actor} size={36} />
                                {n.type === "like" && <div style={{ position: "absolute", bottom: -2, left: -2, width: 16, height: 16, borderRadius: "50%", background: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>{Icons.heart({ size: 8, fill: "#fff", stroke: "#fff" })}</div>}
                                {n.type === "comment" && <div style={{ position: "absolute", bottom: -2, left: -2, width: 16, height: 16, borderRadius: "50%", background: "#22C55E", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>{Icons.message({ size: 8, stroke: "#fff" })}</div>}
                                {NOTIF_BADGE[n.type] && <div aria-hidden="true" style={{ position: "absolute", bottom: -3, left: -3, width: 18, height: 18, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, boxShadow: "0 0 0 1px #E8E7E4" }}>{NOTIF_BADGE[n.type]}</div>}
                              </div>
                            ) : (
                              <div style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: n.type === "event" ? "#FFF3E0" : n.type === "group" ? "#EDF4FF" : "#F0EFED", color: n.type === "event" ? "#E65100" : n.type === "group" ? "#5B9CFF" : "#5F5E5B" }}>
                                {n.type === "event" ? Icons.calendar({ size: 16 }) : n.type === "group" ? Icons.users({ size: 16 }) : n.type === "verification" ? Icons.shield({ size: 16 }) : Icons.trending({ size: 16 })}
                              </div>
                            )}
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13, color: "#37352F", lineHeight: 1.4, fontFamily: font, margin: 0 }}>
                              {n.actor && (n.text || "").startsWith(n.actor)
                                ? <><strong>{n.actor}</strong>{n.text.slice(n.actor.length)}</>
                                : <>{n.actor && <strong>{n.actor} </strong>}{n.text}</>}
                            </p>
                            <p style={{ fontSize: 11, color: "#9B9A97", marginTop: 3, fontFamily: font }}>{timeAgo(new Date(n.created_at).getTime())}</p>
                            {n.type === "request" && acceptedNotifs.some(a => a.id === n.id) ? (
                              <p role="status" style={{ fontSize: 13, fontWeight: 600, color: "#22A06B", marginTop: 8, fontFamily: font }}>
                                ✓ Accepted.{n.actor ? ` ${n.actor.split(" ")[0]} can now follow you.` : ""}
                              </p>
                            ) : n.type === "request" && (
                              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                <button onClick={async () => {
                                  // Accept the connection request. If that doesn't work, the request
                                  // stays here: the database refuses (42501) members who can't take
                                  // part yet, such as members held for review.
                                  if (n.reference_id) {
                                    try { await api.respondToNamaste(n.reference_id, true); }
                                    catch (e) {
                                      alert(isNetworkError(e) ? NETWORK_MESSAGE
                                        : /42501/.test(e.message || "") ? "You can accept this once your membership is confirmed."
                                        : "This request couldn't be accepted. Please try again.");
                                      return;
                                    }
                                  }
                                  // Say it worked in place of the buttons for a few seconds,
                                  // then remove the row
                                  setAcceptedNotifs(prev => [...prev, n]);
                                  setNotifications(p => p.filter(x => x.id !== n.id));
                                  setTimeout(() => setAcceptedNotifs(prev => prev.filter(x => x.id !== n.id)), 3000);
                                  // Mark as handled in DB so it never comes back
                                  try { await api.markNotificationHandled(n.id); } catch(e) {}
                                  // They sent the Namaste, so they now follow this member: reload
                                  // the followers (with their photos)
                                  try {
                                    const conns = await api.getMyConnections();
                                    setMyFollowers((conns || []).filter(c => c.recipient_id === user.id).map(c => c.requester).filter(Boolean));
                                  } catch (e) {
                                    if (n.actor) setMyFollowers(prev => [...prev, { id: n.actor_id, name: n.actor }]);
                                  }
                                }} style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: "#37352F", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Accept</button>
                                <button onClick={async () => {
                                  if (n.reference_id) {
                                    try { await api.respondToNamaste(n.reference_id, false); } catch(e) {}
                                  }
                                  setNotifications(p => p.filter(x => x.id !== n.id));
                                  // Mark as handled in DB
                                  try { await api.markNotificationHandled(n.id); } catch(e) {}
                                }} style={{ padding: "8px 18px", borderRadius: 6, border: "1px solid #E0E0DE", background: "#fff", color: "#5F5E5B", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Ignore</button>
                              </div>
                            )}
                          </div>
                          {!n.read ? <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#5B9CFF", marginTop: 6, flexShrink: 0 }}>{""}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* Messages (desktop; phones have it in the bottom bar) */}
            <button className="nav-messages-btn" aria-label="Messages" title="Messages"
              onClick={() => { setView("messages"); setHasUnreadMessages(false); setNotifOpen(false); setSettingsOpen(false); }}
              style={{ background: view === "messages" ? "#F0EFED" : "none", border: "none", cursor: "pointer", padding: 6, color: "#9B9A97", position: "relative", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
              onMouseOver={(e) => (e.currentTarget.style.background = "#F0EFED")}
              onMouseOut={(e) => (e.currentTarget.style.background = view === "messages" ? "#F0EFED" : "none")}>
              {Icons.message({ size: 20 })}
              {unreadTotal > 0 && view !== "messages"
                ? <span style={{ position: "absolute", top: 0, right: 0, minWidth: 16, height: 16, padding: "0 4px", background: "#E25555", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 8, border: "1.5px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{unreadTotal > 9 ? "9+" : unreadTotal}</span>
                : hasUnreadMessages ? <span style={{ position: "absolute", top: 5, right: 6, width: 7, height: 7, background: "#E25555", borderRadius: "50%", border: "1.5px solid #fff" }}>{""}</span> : null}
            </button>
            {/* Settings gear */}
            <div style={{ position: "relative" }}>
              <button onClick={() => { setSettingsOpen(!settingsOpen); setNotifOpen(false); }} aria-label="Settings" aria-expanded={settingsOpen}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 6, color: "#9B9A97", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
                onMouseOver={(e) => (e.currentTarget.style.background = "#F0EFED")}
                onMouseOut={(e) => (e.currentTarget.style.background = "none")}>
                {Icons.settings({ size: 20 })}
              </button>
              {settingsOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setSettingsOpen(false)} />
                  <div className="settings-dropdown" style={{ position: "absolute", right: 0, top: "100%", marginTop: 8, width: 220, background: "#fff", border: "1px solid #E8E7E4", borderRadius: 14, boxShadow: "0 8px 24px rgba(0,0,0,0.1)", zIndex: 50, overflow: "hidden", padding: "6px 0" }}>
                    {[
                      { key: "invite", icon: Icons.share, label: "Invite a friend" },
                      { key: "install", icon: Icons.home, label: "Add to Home Screen" },
                      { key: "account", icon: Icons.user, label: "Account Settings" },
                      { key: "privacy", icon: Icons.shield, label: "Privacy & Safety" },
                      { key: "notifications", icon: Icons.bell, label: "Notifications" },
                      { key: "activity", icon: Icons.trending, label: "Activity Log" },
                    ].map(item => (
                      <button key={item.key} onClick={() => {
                        setSettingsOpen(false);
                        if (item.key !== "install") { setSettingsModal(item.key); return; }
                        if (window.nriInstallPrompt) { window.nriInstallPrompt.prompt(); window.nriInstallPrompt = null; return; }
                        alert(/iphone|ipad|ipod/i.test(navigator.userAgent)
                          ? "On iPhone: tap the Share button in Safari, then \"Add to Home Screen\"."
                          : "Open your browser's menu (⋮) and choose \"Install app\" or \"Add to Home screen\". If you don't see it, NRIClub may already be on your home screen.");
                      }} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 18px", border: "none", background: "none", cursor: "pointer", color: "#37352F", fontSize: 13, fontFamily: font }}
                        onMouseOver={(e) => e.currentTarget.style.background = "#FAFAF8"}
                        onMouseOut={(e) => e.currentTarget.style.background = "none"}>
                        {item.icon({ size: 16, stroke: "#9B9A97" })} {item.label}
                      </button>
                    ))}
                    <div style={{ height: 1, background: "#F0EFED", margin: "4px 0" }} />
                    {[
                      { key: "mentoring", icon: Icons.users, label: "Mentoring" },
                      { key: "feedback", icon: Icons.message, label: "Send feedback" },
                      { key: "helpCenter", icon: Icons.help, label: "Support" },
                      { key: "terms", icon: Icons.file, label: "Terms & Policies" },
                      ...(hasImprint() ? [{ key: "impressum", icon: Icons.file, label: "Impressum" }] : []),
                    ].map(item => (
                      <button key={item.key} onClick={() => { setSettingsOpen(false); if (item.key === "mentoring") { setView("mentoring"); return; } if (item.key === "feedback") { setFeedbackKind(null); setBugError(""); } if (item.key === "terms" || item.key === "impressum") { setLegalTab(item.key); setSettingsModal("terms"); return; } setSettingsModal(item.key); }} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 18px", border: "none", background: "none", cursor: "pointer", color: "#37352F", fontSize: 13, fontFamily: font }}
                        onMouseOver={(e) => e.currentTarget.style.background = "#FAFAF8"}
                        onMouseOut={(e) => e.currentTarget.style.background = "none"}>
                        {item.icon({ size: 16, stroke: "#9B9A97" })} {item.label}
                      </button>
                    ))}
                    <div style={{ height: 1, background: "#F0EFED", margin: "4px 0" }} />
                    <button onClick={() => { setSettingsOpen(false); onLogout(); }} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 18px", border: "none", background: "none", cursor: "pointer", color: "#E25555", fontSize: 13, fontFamily: font }}
                      onMouseOver={(e) => e.currentTarget.style.background = "#FAFAF8"}
                      onMouseOut={(e) => e.currentTarget.style.background = "none"}>
                      {Icons.logout({ size: 16 })} Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
            {/* Avatar */}
            <button onClick={() => setView("profile")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <Avatar name={user.name} size={32} url={user.avatar_url || user.avatarUrl} />
            </button>
            <button onClick={() => setMobileMenu(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#37352F", display: "none", padding: 11, margin: "0 -5px" }} className="mobile-menu-btn">
              {Icons.menu({ size: 22 })}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileMenu && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.2)", zIndex: 40 }} onClick={() => setMobileMenu(false)}>
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 260, background: "#fff", padding: 20, boxShadow: "-4px 0 16px rgba(0,0,0,0.08)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Menu</span>
              <button onClick={() => setMobileMenu(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 20 })}</button>
            </div>
            {[
              { v: "home", icon: Icons.home, label: "Home" },
              { v: "network", icon: Icons.search, label: "Find" },
              { v: "groups", icon: Icons.users, label: "Groups" },
              { v: "events", icon: Icons.calendar, label: "Events" },
              { v: "help", icon: Icons.help, label: "Ask & Guides" },
              { v: "market", icon: Icons.shop, label: "Market" },
              { v: "messages", icon: Icons.message, label: "Messages" },
              { v: "profile", icon: Icons.user, label: "Profile" },
            ].map((item) => (
              <button
                key={item.v}
                onClick={() => { setView(item.v); setMobileMenu(false); if (item.v === "groups") setSelectedGroup(null); }}
                style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 12px", borderRadius: 8, border: "none", background: view === item.v ? "#EFEFED" : "transparent", color: view === item.v ? "#37352F" : "#9B9A97", cursor: "pointer", fontSize: 14, fontFamily: font, marginBottom: 4 }}
              >
                {item.icon({ size: 18 })} {item.label}
              </button>
            ))}
            <div style={{ borderTop: "1px solid #F0EFED", marginTop: 12, paddingTop: 12 }}>
              <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 12px", borderRadius: 8, border: "none", background: "transparent", color: "#E25555", cursor: "pointer", fontSize: 14, fontFamily: font }}>
                {Icons.logout({ size: 18 })} Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verification status: pending (blue) or needs_info (amber, with Update details) */}
      <VerificationBanner user={user} onUpdateDetails={() => setVerifyOpen(true)} />

      {/* Create Post Modal: closing it keeps what was written; Cancel clears it. */}
      {createPostModal && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setCreatePostModal(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 500, maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Create a post</h3>
              <button onClick={() => setCreatePostModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              {/* User info */}
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
                <Avatar name={user.name} size={40} url={user.avatar_url} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font }}>{user.name}</div>
                  <div style={{ fontSize: 11, color: "#9B9A97", fontFamily: font }}>{user.location}</div>
                </div>
              </div>

              <textarea
                value={newPost} onChange={(e) => setNewPost(e.target.value)}
                placeholder={`What's on your mind, ${user.name.split(" ")[0]}? You can paste a link too.`}
                style={{ width: "100%", padding: "14px", borderRadius: 10, border: "1px solid #E0E0DE", fontSize: 14, background: "#FAFAF8", outline: "none", color: "#37352F", fontFamily: font, boxSizing: "border-box", minHeight: 140, resize: "vertical" }}
                autoFocus
              />

              {/* Photo, once "Photo" is pressed (or one is attached) */}
              {(postPhotoOpen || postImage) && (
                <div style={{ marginTop: 14 }}>
                  <input type="file" accept="image/*" id="modal-photo-upload" style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const upload = ++postPhotoUploadRef.current;
                      setPostPhotoUploading(true);
                      try {
                        const preview = URL.createObjectURL(file);
                        const url = await api.uploadPostImage(file);
                        if (upload === postPhotoUploadRef.current) setPostImage({ url, preview });
                      } catch (err) {
                        if (upload === postPhotoUploadRef.current) alert(apiErrorMessage(err, "Your photo couldn't be uploaded. Please try a JPG or PNG under 5 MB."));
                      }
                      if (upload === postPhotoUploadRef.current) setPostPhotoUploading(false);
                    }}
                  />
                  {postImage ? (
                    <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
                      <img src={postImage.preview} alt="" style={{ width: "100%", maxHeight: 300, objectFit: "cover", borderRadius: 10 }} />
                      <button onClick={() => setPostImage(null)} style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icons.x({ size: 14 })}</button>
                    </div>
                  ) : postPhotoUploading ? (
                    <div role="status" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "32px 20px", borderRadius: 10, border: "2px dashed #E0E0DE", background: "#FAFAF8" }}>
                      {Icons.image({ size: 28, stroke: "#9B9A97" })}
                      <span style={{ fontSize: 13, color: "#9B9A97", fontWeight: 500, fontFamily: font }}>Uploading photo...</span>
                    </div>
                  ) : (
                    <label htmlFor="modal-photo-upload" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "32px 20px", borderRadius: 10, border: "2px dashed #E0E0DE", background: "#FAFAF8", cursor: "pointer" }}>
                      {Icons.image({ size: 28, stroke: "#9B9A97" })}
                      <span style={{ fontSize: 13, color: "#9B9A97", fontWeight: 500, fontFamily: font }}>Click to upload a photo</span>
                      <span style={{ fontSize: 11, color: "#D4D4D2", fontFamily: font }}>JPG, PNG up to 5MB</span>
                    </label>
                  )}
                </div>
              )}
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #F0EFED", display: "flex", justifyContent: "flex-end", gap: 12, background: "#FAFAF8", borderRadius: "0 0 16px 16px" }}>
              {!postPhotoOpen && !postImage && (
                <button onClick={() => setPostPhotoOpen(true)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font, display: "flex", alignItems: "center", gap: 6, marginRight: "auto" }}>{Icons.image({ size: 16 })} Photo</button>
              )}
              <button onClick={() => { setCreatePostModal(null); setNewPost(""); setPostImage(null); setPostPhotoOpen(false); setPostPhotoUploading(false); postPhotoUploadRef.current += 1; }} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font }}>Cancel</button>
              <button onClick={() => { createPost(); setCreatePostModal(null); setPostPhotoOpen(false); }} disabled={(!newPost.trim() && !postImage) || postPhotoUploading} style={{
                padding: "10px 24px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600,
                background: (newPost.trim() || postImage) && !postPhotoUploading ? "#37352F" : "#E8E7E4",
                color: (newPost.trim() || postImage) && !postPhotoUploading ? "#fff" : "#9B9A97",
                cursor: (newPost.trim() || postImage) && !postPhotoUploading ? "pointer" : "default", fontFamily: font,
              }}>Publish</button>
            </div>
          </div>
        </div>
      )}

      {/* Blocked user overlay */}
      {user?.status === "blocked" && <BlockedOverlay onSignOut={onLogout} font={font} />}

      {/* MAIN */}
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 16px 100px", display: "grid", gridTemplateColumns: (view === "profile" || view === "trending") ? "minmax(0,1fr)" : "240px minmax(0,1fr) 210px", gap: 28 }} className="main-grid">
        {view !== "profile" && view !== "trending" && (
          <aside className="sidebar-left" style={{ position: "sticky", top: 80, alignSelf: "start" }}>
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E8E7E4", padding: "24px 20px", textAlign: "center", position: "relative" }}>
              {/* Edit button top-right */}
              <button
                onClick={() => openProfileEditor()} aria-label="Edit profile"
                style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: "#9B9A97", padding: 4 }}
              >
                {Icons.edit({ size: 16 })}
              </button>

              {/* NRI/IN badge top-left */}
              <span style={{ position: "absolute", top: 14, left: 14, fontSize: 9, fontWeight: 700, padding: "3px 9px", borderRadius: 4, letterSpacing: "0.05em",
                background: isUserNRI(user) ? "#E3FCEF" : "#FFF3E0",
                color: isUserNRI(user) ? "#22A06B" : "#E65100",
                border: `1px solid ${isUserNRI(user) ? "#B5E4CA" : "#FFE0B2"}`,
              }}>{isUserNRI(user) ? "NRI" : "IN"}</span>

              {/* Profile photo with camera icon */}
              <div style={{ position: "relative", display: "inline-block", marginBottom: 12 }}>
                <Avatar name={user.name} size={80} url={user.avatar_url || user.avatarUrl} />
                <input type="file" accept="image/*" id="avatar-upload" style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) { alert("Photo must be under 5MB"); return; }
                    try {
                      const url = await api.uploadAvatar(file);
                      await api.updateProfile({ avatar_url: url });
                      const updatedUser = { ...user, avatar_url: url, avatarUrl: url };
                      localStorage.setItem("nriclub_profile_cache", JSON.stringify(updatedUser));
                      window.location.reload();
                    } catch (err) { alert(apiErrorMessage(err, "Your photo couldn't be uploaded. Please try a JPG or PNG under 5 MB.")); }
                  }}
                />
                <label htmlFor="avatar-upload" style={{
                  position: "absolute", bottom: -2, right: -2,
                  width: 24, height: 24, borderRadius: "50%", background: "#fff",
                  border: "1px solid #E0E0DE", display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer",
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </label>
              </div>

              {/* Name with green verified badge */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 2 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#37352F", fontFamily: font }}>{user.name}</h3>
                {user.linkedin_verified && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#22C55E" stroke="none" role="img" aria-label="Verified member">
                    <title>Verified member</title>
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                )}
              </div>
              <p style={{ fontSize: 13, color: "#5F5E5B", marginBottom: 14, fontFamily: font }}>{user.profession}</p>

              {/* Location pills */}
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, marginBottom: 6 }}>
                {user.location ? (
                  <span style={{
                    fontSize: 11, color: "#5F5E5B", background: "#fff", border: "1px solid #E0E0DE",
                    padding: "4px 10px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 4, fontFamily: font,
                  }}>
                    {Icons.mapPin({ size: 10 })} {user.location.split(",")[0]}
                  </span>
                ) : null}
                {user.hometown ? (
                  <span style={{
                    fontSize: 11, color: "#5F5E5B", background: "#fff", border: "1px solid #E0E0DE",
                    padding: "4px 10px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 4, fontFamily: font,
                  }}>
                    {Icons.globe({ size: 10 })} From {user.hometown.split(",")[0]}
                  </span>
                ) : null}
              </div>
              {user.yearsAbroad && (
                <span style={{
                  fontSize: 11, color: "#5F5E5B", background: "#fff", border: "1px solid #E0E0DE",
                  padding: "4px 10px", borderRadius: 20, display: "inline-flex", alignItems: "center", gap: 4, fontFamily: font,
                }}>
                  {Icons.clock({ size: 10 })} {user.yearsAbroad}
                </span>
              )}

              {/* Followers / Following */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, margin: "18px 0", fontSize: 13, fontFamily: font }}>
                <span onClick={() => setFollowModal("followers")} style={{ cursor: "pointer" }}><b style={{ color: "#37352F" }}>{myFollowers.length}</b> <span style={{ color: "#9B9A97" }}>followers</span></span>
                <span style={{ color: "#D4D4D2" }}>·</span>
                <span onClick={() => setFollowModal("following")} style={{ cursor: "pointer" }}><b style={{ color: "#37352F" }}>{myFollowing.length}</b> <span style={{ color: "#9B9A97" }}>following</span></span>
              </div>

              {/* Divider */}
              <div style={{ borderTop: "1px solid #F0EFED", margin: "0 0 16px" }} />

              {/* Shortcuts, labelled (LinkedIn only when a link is saved) */}
              <div style={{ display: "flex", gap: 0 }}>
                {[
                  { icon: Icons.message, label: "Messages", hasNotif: hasUnreadMessages, action: () => { setView("messages"); setHasUnreadMessages(false); } },
                  { icon: Icons.file, label: "My Posts", action: () => { setView("profile"); setProfileTab("posts"); } },
                  { icon: Icons.image, label: "My Photos", action: () => { setView("profile"); setProfileTab("photos"); } },
                  user.linkedinUrl ? { icon: Icons.linkedin, label: "LinkedIn", action: () => window.open(user.linkedinUrl.startsWith("http") ? user.linkedinUrl : `https://${user.linkedinUrl}`, "_blank") } : null,
                ].filter(Boolean).map((item) => (
                  <button key={item.label} onClick={item.action} aria-label={item.label} title={item.label} style={{
                    flex: 1, minWidth: 0, padding: "8px 0", borderRadius: 8, border: "none", background: "none",
                    cursor: "pointer", color: "#9B9A97", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
                    transition: "all 0.1s", fontSize: 10, fontWeight: 500, fontFamily: font, whiteSpace: "nowrap",
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = "#F0EFED"; e.currentTarget.style.color = "#37352F"; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#9B9A97"; }}
                  >
                    <span style={{ position: "relative", display: "flex" }}>
                      {item.icon({ size: 20 })}
                      {item.hasNotif ? <span style={{ position: "absolute", top: -2, right: -3, width: 7, height: 7, background: "#E25555", borderRadius: "50%", border: "1.5px solid #fff" }}>{""}</span> : null}
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Complete your profile (desktop; on mobile it sits at the top of the feed) */}
            <ProfileChecklist className="profile-checklist-side" items={profileItems} onItem={handleProfileItem} onDismiss={dismissProfileCard} style={{ marginTop: 16 }} />
          </aside>
        )}

        <div>{waiting ? <WaitingForReview user={user} onEditProfile={() => openProfileEditor()} onUpdateDetails={() => setVerifyOpen(true)} /> : renderContent()}</div>

        {view !== "profile" && view !== "trending" && !waiting && (
          <aside className="sidebar-right" style={{ position: "sticky", top: 80, alignSelf: "start" }}>
            <div style={{ marginBottom: 28 }}>
              <h4 style={{ fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, fontFamily: font }}>Groups</h4>
              {groups.slice(0, 3).map((g, i) => {
                // Generate a color-coded thumbnail
                const thumbColors = ["#C4B5A0", "#8B9E82", "#A0B0C4"];
                return (
                  <div key={g.id} onClick={() => { setView("groups"); setSelectedGroup(g); }} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "7px 0", cursor: "pointer",
                  }}
                  onMouseOver={(e) => e.currentTarget.querySelector("span").style.textDecoration = "underline"}
                  onMouseOut={(e) => e.currentTarget.querySelector("span").style.textDecoration = "none"}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, flexShrink: 0, overflow: "hidden",
                      background: thumbColors[i % 3], display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                        <path d="M16 3.13a4 4 0 010 7.75"/>
                      </svg>
                    </div>
                    <span style={{ fontSize: 13, color: "#37352F", fontWeight: 500, fontFamily: font }}>{g.name}</span>
                  </div>
                );
              })}
            </div>

            {/* EVENTS section */}
            <div>
              <h4 style={{ fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, fontFamily: font }}>Events</h4>
              {orderEvents(events.filter(e => !isPastEvent(e))).slice(0, 2).map((e) => (
                <div key={e.id} onClick={() => setView("events")} style={{ marginBottom: 14, cursor: "pointer" }}
                  onMouseOver={(ev) => ev.currentTarget.querySelector(".ev-title").style.textDecoration = "underline"}
                  onMouseOut={(ev) => ev.currentTarget.querySelector(".ev-title").style.textDecoration = "none"}
                >
                  <div style={{ fontSize: 11, color: "#9B9A97", fontFamily: font, marginBottom: 2 }}>{eventDate(e)}</div>
                  <div className="ev-title" style={{ fontSize: 14, color: "#37352F", fontWeight: 600, fontFamily: font, lineHeight: 1.3 }}>{e.title}</div>
                </div>
              ))}
            </div>

            {/* PEOPLE IN YOUR CITY */}
            {user.location && (
              <div style={{ marginTop: 28 }}>
                <h4 style={{ fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, fontFamily: font }}>People in {(user.location || "").split(",")[0]}</h4>
                {!networkReady ? null : networkUsers.filter(u => (u.location || "").toLowerCase().includes((user.location || "").split(",")[0].toLowerCase())).length > 0 ? (<>
                  {networkUsers.filter(u => (u.location || "").toLowerCase().includes((user.location || "").split(",")[0].toLowerCase())).slice(0, 4).map(u => (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                      <button type="button" onClick={() => openMember(u.id)} aria-label={`${u.name}'s profile`} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                        <Avatar name={u.name} size={32} url={u.avatar_url} />
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#37352F", fontFamily: font, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                        <div style={{ fontSize: 10, color: "#9B9A97", fontFamily: font }}>{u.profession}</div>
                      </div>
                      <button onClick={() => { 
                          if (acceptedConnections.has(u.id)) { if (confirm(`Unfollow ${u.name}?`)) handleUnfollow(u.id); }
                          else if (!sentNamaste.has(u.id)) handleSendNamaste(u.id);
                        }} disabled={sentNamaste.has(u.id)}
                        style={{ padding: "4px 10px", borderRadius: 6, border: acceptedConnections.has(u.id) ? "1px solid #B5E4CA" : "none", fontSize: 10, fontWeight: 600, cursor: sentNamaste.has(u.id) ? "default" : "pointer",
                          background: acceptedConnections.has(u.id) ? "#E3FCEF" : sentNamaste.has(u.id) ? "#F0EFED" : "#37352F",
                          color: acceptedConnections.has(u.id) ? "#22A06B" : sentNamaste.has(u.id) ? "#9B9A97" : "#fff", fontFamily: font }}>
                        {acceptedConnections.has(u.id) ? "Following" : sentNamaste.has(u.id) ? "Sent" : "Namaste"}
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setView("network")} style={{ background: "none", border: "none", color: "#5B9CFF", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: font, marginTop: 8, padding: 0 }}>See all →</button>
                </>) : (
                  <p style={{ fontSize: 11, color: "#9B9A97", fontFamily: font }}>No users found in your city yet. <button onClick={() => setView("network")} style={{ background: "none", border: "none", color: "#37352F", cursor: "pointer", textDecoration: "underline", fontSize: 11, fontFamily: font }}>Find people →</button></p>
                )}
              </div>
            )}
          </aside>
        )}
      </main>

      {/* Mobile Bottom Nav */}
      <div className="mobile-nav" style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #E8E7E4", padding: "6px 8px", display: "none", justifyContent: "space-around", zIndex: 30 }}>
        {[
          { v: "home", icon: Icons.home, label: "Home" },
          { v: "network", icon: Icons.search, label: "Find" },
          { v: "messages", icon: Icons.message, label: "Messages", notif: hasUnreadMessages || unreadTotal > 0 },
          { v: "groups", icon: Icons.users, label: "Groups" },
          { v: "profile", icon: Icons.user, label: "Profile" },
        ].map((item) => (
          <button
            key={item.v}
            onClick={() => { setView(item.v); if (item.v === "groups") setSelectedGroup(null); if (item.v === "messages") setHasUnreadMessages(false); }}
            style={{ flex: 1, minHeight: 48, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, background: "none", border: "none", cursor: "pointer", color: view === item.v ? "#37352F" : "#9B9A97", fontSize: 11, fontWeight: 500, fontFamily: font }}
          >
            <span style={{ position: "relative", display: "flex" }}>
              {item.icon({ size: 20 })}
              {item.notif ? <span style={{ position: "absolute", top: -2, right: -2, width: 7, height: 7, background: "#E25555", borderRadius: "50%", border: "1.5px solid #fff" }}>{""}</span> : null}
            </span>
            {item.label}
          </button>
        ))}
      </div>

      {/* Expanded Market Item Modal */}
      {expandedMarketItem && (() => {
        const photos = expandedMarketItem.photos || [];
        const hasPhotos = photos.length > 0;
        
        return (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => { setExpandedMarketItem(null); setMarketPhotoIdx(0); }}>
          <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 520, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
            {/* Photo Gallery with Touch Swipe */}
            <div
              style={{ height: hasPhotos ? 280 : 120, position: "relative", borderRadius: "18px 18px 0 0", overflow: "hidden", touchAction: "pan-y",
                background: hasPhotos ? "#F0EFED" : `linear-gradient(160deg, ${expandedMarketItem.color}EE, ${expandedMarketItem.color}AA)`,
              }}
              onTouchStart={(e) => { marketTouchRef.current.startX = e.touches[0].clientX; marketTouchRef.current.startY = e.touches[0].clientY; }}
              onTouchEnd={(e) => {
                if (!hasPhotos || photos.length <= 1) return;
                const dx = e.changedTouches[0].clientX - marketTouchRef.current.startX;
                const dy = e.changedTouches[0].clientY - marketTouchRef.current.startY;
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
                  if (dx < 0) setMarketPhotoIdx(p => (p + 1) % photos.length);
                  else setMarketPhotoIdx(p => (p - 1 + photos.length) % photos.length);
                }
              }}
            >
              {hasPhotos ? (
                <img src={photos[marketPhotoIdx]} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", background: "#F0EFED", userSelect: "none", pointerEvents: "none" }} />
              ) : null}
              
              {/* Left arrow */}
              {hasPhotos && photos.length > 1 && (
                <button onClick={(e) => { e.stopPropagation(); setMarketPhotoIdx(p => (p - 1 + photos.length) % photos.length); }} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.9)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
                  {Icons.chevronLeft({ size: 18 })}
                </button>
              )}
              {/* Right arrow */}
              {hasPhotos && photos.length > 1 && (
                <button onClick={(e) => { e.stopPropagation(); setMarketPhotoIdx(p => (p + 1) % photos.length); }} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.9)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              )}
              
              {/* Photo counter dots */}
              {hasPhotos && photos.length > 1 && (
                <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6 }}>
                  {photos.map((_, i) => (
                    <button key={i} onClick={(e) => { e.stopPropagation(); setMarketPhotoIdx(i); }} style={{ width: i === marketPhotoIdx ? 20 : 8, height: 8, borderRadius: 4, border: "none", background: i === marketPhotoIdx ? "#fff" : "rgba(255,255,255,0.5)", cursor: "pointer", transition: "all 0.2s" }} />
                  ))}
                </div>
              )}

              <button onClick={() => { setExpandedMarketItem(null); setMarketPhotoIdx(0); }} style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", border: "none", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {Icons.x({ size: 16 })}
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: "24px 28px" }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", marginBottom: 8, fontFamily: font, lineHeight: 1.3 }}>{expandedMarketItem.title}</h2>
              
              {/* Price highlight */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#F0EFED", borderRadius: 8, marginBottom: 20 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#37352F", fontFamily: font }}>{expandedMarketItem.price}</span>
              </div>

              {/* Description */}
              <p style={{ fontSize: 15, color: "#5F5E5B", lineHeight: 1.7, marginBottom: 20, fontFamily: font }}>{expandedMarketItem.description}</p>

              {/* Details grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
                <div style={{ padding: "12px 14px", background: "#FAFAF8", borderRadius: 8, border: "1px solid #EDEDEB" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, fontFamily: font }}>Location</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font, display: "flex", alignItems: "center", gap: 5 }}>{Icons.mapPin({ size: 13 })} {expandedMarketItem.location}</div>
                </div>
                <div style={{ padding: "12px 14px", background: "#FAFAF8", borderRadius: 8, border: "1px solid #EDEDEB" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, fontFamily: font }}>Posted</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font, display: "flex", alignItems: "center", gap: 5 }}>{Icons.clock({ size: 13 })} {expandedMarketItem.date}</div>
                </div>
                <div style={{ padding: "12px 14px", background: "#FAFAF8", borderRadius: 8, border: "1px solid #EDEDEB" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, fontFamily: font }}>Category</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font }}>{marketLabel(expandedMarketItem.category)}</div>
                </div>
                <div style={{ padding: "12px 14px", background: "#FAFAF8", borderRadius: 8, border: "1px solid #EDEDEB" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, fontFamily: font }}>Seller</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font, display: "flex", alignItems: "center", gap: 6 }}><Avatar name={expandedMarketItem.seller} size={18} /> {expandedMarketItem.seller}</div>
                </div>
              </div>

              {/* Action row, kept in view at the bottom (no Contact Seller on your own listing) */}
              <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", position: "sticky", bottom: 0, background: "#fff", padding: "12px 0", borderTop: "1px solid #F0EFED" }}>
                {expandedMarketItem.user_id !== user.id ? (
                  <button onClick={() => { setSelectedMarketItem(expandedMarketItem); setContactMsg(`Hi ${expandedMarketItem.seller.split(" ")[0]}, is this still available?`); setExpandedMarketItem(null); }} style={{ ...btnPrimary, flex: 1, justifyContent: "center", padding: "12px", fontSize: 14 }}>
                    {Icons.send({ size: 15 })} Contact Seller
                  </button>
                ) : (
                  <>
                    <span style={{ fontSize: 13, color: "#9B9A97", fontFamily: font }}>This is your listing</span>
                    <button onClick={async () => { const item = expandedMarketItem; if (confirm("Delete this listing?")) { try { await api.deleteMarketItem(item.id); } catch(e) {} setMarketItems(prev => prev.filter(m => m.id !== item.id)); setExpandedMarketItem(null); setMarketPhotoIdx(0); } }} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 13, fontWeight: 600, padding: "10px 0", fontFamily: font }}>
                      Delete listing
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Expanded Event Modal */}
      {expandedEvent && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setExpandedEvent(null)}>
          <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 560, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={(ev) => ev.stopPropagation()}>
            {/* Hero: the event photo when there is one */}
            <div style={{ height: 180, background: expandedEvent.image ? "#F0EFED" : "linear-gradient(135deg, #7BA88A, #5A8070)", position: "relative", borderRadius: "18px 18px 0 0", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {expandedEvent.image && <img src={expandedEvent.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }} />}
              <button onClick={() => setExpandedEvent(null)} style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.4)", border: "none", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {Icons.x({ size: 16 })}
              </button>
              <div style={{ position: "absolute", bottom: 16, left: 16, background: "rgba(255,255,255,0.95)", padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700, color: "#37352F", fontFamily: font }}>{eventDate(expandedEvent)}</div>
              <div style={{ position: "absolute", top: 16, left: 16, background: "rgba(0,0,0,0.5)", padding: "4px 10px", borderRadius: 12, fontSize: 11, color: "#fff", fontWeight: 600 }}>{expandedEvent.attendees} going</div>
            </div>
            <div style={{ padding: "24px 28px" }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: "#37352F", marginBottom: 12, fontFamily: font, lineHeight: 1.3 }}>{expandedEvent.title}</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
                <span style={{ fontSize: 13, color: "#5F5E5B", display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "#F0EFED", borderRadius: 6 }}>{Icons.clock({ size: 14 })} {eventTime(expandedEvent)}</span>
                <span style={{ fontSize: 13, color: "#5F5E5B", display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "#F0EFED", borderRadius: 6 }}>{Icons.mapPin({ size: 14 })} {expandedEvent.location}</span>
              </div>
              {!isPastEvent(expandedEvent) && <button onClick={() => { toggleRsvp(expandedEvent.id); }} style={{ ...btnPrimary, width: "100%", justifyContent: "center", padding: "12px", marginBottom: 20, background: rsvps.has(expandedEvent.id) ? "#E3FCEF" : "#37352F", color: rsvps.has(expandedEvent.id) ? "#22A06B" : "#fff", border: rsvps.has(expandedEvent.id) ? "1px solid #B5E4CA" : "none" }}>
                {rsvps.has(expandedEvent.id) ? "✓ Going" : "RSVP"}
              </button>}
              {!isPastEvent(expandedEvent) && calendarRange(expandedEvent) && (
                <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap", margin: "-8px 0 20px", fontSize: 13, fontFamily: font }}>
                  <span style={{ color: "#9B9A97" }}>{Icons.calendar({ size: 13 })} Add to calendar:</span>
                  <a href={googleCalendarUrl(expandedEvent)} target="_blank" rel="noopener noreferrer" style={{ color: "#37352F", fontWeight: 600 }}>Google</a>
                  <button onClick={() => downloadIcs(expandedEvent)} style={{ background: "none", border: "none", padding: 0, color: "#37352F", fontWeight: 600, textDecoration: "underline", cursor: "pointer", fontSize: 13, fontFamily: font }}>Apple / Outlook</button>
                </div>
              )}
              {eventAttendees.id === expandedEvent.id && eventAttendees.list.length > 0 && (() => {
                const going = [...eventAttendees.list].sort((a, b) => (b.id === user.id) - (a.id === user.id) || acceptedConnections.has(b.id) - acceptedConnections.has(a.id));
                const known = going.filter(g => acceptedConnections.has(g.id)).length;
                return (
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, fontFamily: font }}>
                      Who's going · {going.length}{known ? ` (${known} you follow)` : ""}
                    </h4>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {going.slice(0, 12).map(g => (
                        <button key={g.id} onClick={() => { if (g.id !== user.id) { setExpandedEvent(null); openMember(g.id); } }} title={g.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 58, background: "none", border: "none", padding: 0, cursor: g.id === user.id ? "default" : "pointer" }}>
                          <Avatar name={g.name} size={40} url={g.avatar_url} />
                          <span style={{ fontSize: 11, color: "#5F5E5B", fontFamily: font, maxWidth: 58, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.id === user.id ? "You" : (g.name || "").split(" ")[0]}</span>
                        </button>
                      ))}
                      {going.length > 12 && <span style={{ alignSelf: "center", fontSize: 12, color: "#9B9A97", fontFamily: font }}>+{going.length - 12} more</span>}
                    </div>
                  </div>
                );
              })()}
              <p style={{ fontSize: 14, color: "#5F5E5B", lineHeight: 1.7, marginBottom: 20, fontFamily: font, whiteSpace: "pre-wrap" }}>{expandedEvent.description}</p>
              {expandedEvent.link && (
                <a href={expandedEvent.link.startsWith("http") ? expandedEvent.link : `https://${expandedEvent.link}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 14, color: "#37352F", padding: "12px", background: "#fff", border: "1px solid #E0E0DE", borderRadius: 8, textDecoration: "none", fontWeight: 600, marginBottom: 16, fontFamily: font }}>
                  {Icons.link({ size: 15 })} Get Tickets / More Info
                </a>
              )}
              {expandedEvent.organizer && <div style={{ fontSize: 12, color: "#9B9A97", paddingTop: 14, borderTop: "1px solid #F0EFED" }}>Hosted by <strong style={{ color: "#37352F" }}>{expandedEvent.organizer}</strong></div>}
            </div>
          </div>
        </div>
      )}

      {/* Contact Seller Modal */}
      {selectedMarketItem && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setSelectedMarketItem(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Contact Seller</h3>
              <button onClick={() => setSelectedMarketItem(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              {/* Item preview */}
              <div style={{ display: "flex", gap: 12, padding: "12px 14px", background: "#FAFAF8", borderRadius: 10, border: "1px solid #EDEDEB", marginBottom: 20 }}>
                <div style={{ width: 56, height: 56, borderRadius: 8, background: `linear-gradient(135deg, ${selectedMarketItem.color}DD, ${selectedMarketItem.color}88)`, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedMarketItem.title}</h4>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#5F5E5B", marginTop: 2, fontFamily: font }}>{selectedMarketItem.price}</p>
                  <p style={{ fontSize: 11, color: "#9B9A97", marginTop: 1, fontFamily: font }}>Listed by {selectedMarketItem.seller}</p>
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Message</label>
                {/* The message carries the listing's title in front of it. */}
                <textarea value={contactMsg} onChange={(e) => setContactMsg(e.target.value)} maxLength={TEXT_LIMIT - `[MARKETPLACE: ${selectedMarketItem.title}] `.length} style={{ ...inputStyle, minHeight: 90, resize: "none" }} />
                <CharCount value={contactMsg} max={TEXT_LIMIT - `[MARKETPLACE: ${selectedMarketItem.title}] `.length} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button onClick={() => setSelectedMarketItem(null)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font }}>Cancel</button>
                <button onClick={async () => {
                  if (!contactMsg.trim()) return;
                  const sellerId = selectedMarketItem.user_id;
                  try {
                    if (!sellerId || sellerId === user.id) {
                      alert("You can't contact the seller of this listing.");
                      return;
                    }
                    const reason = await messageBlockedReason(sellerId);
                    if (reason) { alert(reason); return; }
                    // Tag message as marketplace with item title for filtering
                    const taggedMsg = `[MARKETPLACE: ${selectedMarketItem.title}] ${contactMsg}`;
                    const convo = await api.getOrCreateConversation(sellerId);
                    const cid = convo?.id || convo?.[0]?.id;
                    if (cid) {
                      await api.sendMessage(cid, taggedMsg);
                      // Refresh convo list so it shows up in Marketplace tab
                      try {
                        const dbConvos = await api.getConversations();
                        if (dbConvos) {
                          setConvos(prev => {
                            const oldMarketIds = new Set(prev.filter(c => c.isMarketplace).map(c => c.id));
                            return dbConvos.map(c => ({
                              id: c.id, name: c.otherUser?.name || "User", otherUserId: c.otherUser?.id,
                              avatar_url: c.otherUser?.avatar_url || "",
                              lastMsg: c.last_message_text || "", 
                              time: c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "",
                              unread: false,
                              isMarketplace: oldMarketIds.has(c.id) || (c.last_message_text || "").includes("[MARKETPLACE:"),
                            }));
                          });
                        }
                      } catch(re) {}
                      setChatTab("marketplace");
                      setSelectedMarketItem(null);
                      setContactMsg("");
                      setView("messages");
                      return;
                    } else {
                      alert("Your message couldn't be sent. Please try again.");
                      return;
                    }
                  } catch (e) {
                    // Keep the message so it can be sent again.
                    alert(await messageErrorText(e, sellerId));
                    return;
                  }
                }} style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 6 }}>{Icons.send({ size: 14 })} Send Message</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete account: one in-app confirmation */}
      {deleteAccountText !== null && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setDeleteAccountText(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, padding: 24, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "#DC2626" }}>{Icons.trash({ size: 20 })}</div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", marginBottom: 6, fontFamily: font }}>Delete your account?</h3>
            <p style={{ fontSize: 13, color: "#5F5E5B", marginBottom: 20, lineHeight: 1.5, fontFamily: font }}>Your posts, messages, connections and photos will be removed. This can't be undone.</p>
            <label htmlFor="delete-account-confirm" style={{ display: "block", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, fontFamily: font }}>Type DELETE to confirm</label>
            <input id="delete-account-confirm" value={deleteAccountText} onChange={(e) => setDeleteAccountText(e.target.value)} autoComplete="off" style={{ ...inputStyle, marginBottom: 20 }} />
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={() => setDeleteAccountText(null)} style={{ padding: "10px 24px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", fontSize: 13, color: "#5F5E5B", cursor: "pointer", fontFamily: font }}>Cancel</button>
              <button disabled={deleteAccountText.trim().toUpperCase() !== "DELETE"} onClick={async () => {
                try {
                  await api.deleteAccount();
                } catch(e) {
                  alert("Your account could not be deleted. Please try again, or contact support if it keeps failing.");
                  return;
                }
                localStorage.clear();
                setDeleteAccountText(null);
                setSettingsModal(null);
                onLogout();
              }} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: deleteAccountText.trim().toUpperCase() === "DELETE" ? "#DC2626" : "#FECACA", fontSize: 13, fontWeight: 600, color: "#fff", cursor: deleteAccountText.trim().toUpperCase() === "DELETE" ? "pointer" : "default", fontFamily: font }}>Delete account</button>
            </div>
          </div>
        </div>
      )}

      {/* Account Settings Modal */}
      {settingsModal === "account" && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setSettingsModal(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Account Settings</h3>
              <button onClick={() => setSettingsModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              <h4 style={{ fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16, fontFamily: font }}>Personal Information</h4>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Full Name</label>
                <input style={inputStyle} value={accountName} onChange={(e) => setAccountName(e.target.value)} />
              </div>
              <div style={{ marginBottom: 6 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Email Address</label>
                <input style={{ ...inputStyle, background: "#F0EFED", color: "#9B9A97" }} value={user.email || ""} readOnly disabled />
                <p style={{ fontSize: 11, color: "#9B9A97", marginTop: 4, fontFamily: font }}>Contact support to change email.</p>
              </div>
              <div style={{ borderTop: "1px solid #F0EFED", marginTop: 20, paddingTop: 20 }}>
                <h4 style={{ fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16, fontFamily: font }}>Security</h4>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>New Password</label>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
                    <input type="password" autoComplete="new-password" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} style={{ ...inputStyle, paddingLeft: 36 }} placeholder="Leave blank to keep your current password" />
                  </div>
                </div>
              </div>
              <div style={{ borderTop: "1px solid #F0EFED", paddingTop: 20 }}>
                <h4 style={{ fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontFamily: font, display: "flex", alignItems: "center", gap: 5 }}>
                  {Icons.shield({ size: 13 })} Data & Privacy (GDPR)
                </h4>
                <p style={{ fontSize: 12, color: "#9B9A97", marginBottom: 14, lineHeight: 1.5, fontFamily: font }}>Under EU GDPR, you have the right to access, export, and delete your personal data. Your download is a file with your account, profile, settings and verification history, and the posts, comments, messages and other activity in your account (photos as links).</p>
                <button onClick={async () => {
                  if (dataDownload.busy) return;
                  setDataDownload({ busy: true, error: "" });
                  try {
                    await downloadMyData();
                    setDataDownload({ busy: false, error: "" });
                  } catch (e) {
                    setDataDownload({ busy: false, error: apiErrorMessage(e, "We couldn't download your data. Please try again, or contact hello@nriclub.app.") });
                  }
                }} aria-disabled={dataDownload.busy} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", color: "#37352F", fontSize: 13, fontWeight: 600, cursor: dataDownload.busy ? "default" : "pointer", opacity: dataDownload.busy ? 0.7 : 1, fontFamily: font, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 10 }}>
                  {Icons.share({ size: 14 })} {dataDownload.busy ? "Preparing your data..." : "Download My Data"}
                </button>
                {dataDownload.error && <p role="alert" style={{ fontSize: 12, color: "#B91C1C", marginBottom: 10, lineHeight: 1.5, fontFamily: font }}>{dataDownload.error}</p>}
              </div>
              <div style={{ borderTop: "1px solid #F0EFED", paddingTop: 20, marginTop: 10 }}>
                <h4 style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontFamily: font, display: "flex", alignItems: "center", gap: 5 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  Danger Zone
                </h4>
                <p style={{ fontSize: 12, color: "#9B9A97", marginBottom: 10, lineHeight: 1.5, fontFamily: font }}>Permanently delete your account and all associated data. This action cannot be undone.</p>
                <button onClick={() => setDeleteAccountText("")} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {Icons.trash({ size: 14 })} Delete My Account
                </button>
              </div>
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #F0EFED", background: "#FAFAF8", position: "sticky", bottom: 0 }}>
              {accountSave.error && <p role="alert" style={{ fontSize: 12, color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", marginBottom: 12, lineHeight: 1.5, fontFamily: font }}>{accountSave.error}</p>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button onClick={() => { setSettingsModal(null); setAccountName(user.name); setAccountPassword(""); setAccountSave({ busy: false, error: "" }); }} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font }}>Cancel</button>
                <button disabled={accountSave.busy} onClick={async () => {
                  const name = accountName.trim();
                  if (!name) { setAccountSave({ busy: false, error: "Please enter your name." }); return; }
                  if (accountPassword && accountPassword.length < 8) { setAccountSave({ busy: false, error: "Use at least 8 characters." }); return; }
                  setAccountSave({ busy: true, error: "" });
                  try {
                    if (name !== user.name) {
                      await api.updateProfile({ name });
                      onUserUpdate({ ...user, name });
                    }
                    if (accountPassword) await api.updatePassword(accountPassword);
                  } catch (e) {
                    setAccountSave({ busy: false, error: authErrorMessage(e) || apiErrorMessage(e, "Your changes couldn't be saved. Please try again.") });
                    return;
                  }
                  setAccountPassword("");
                  setAccountSave({ busy: false, error: "" });
                  setSettingsModal(null);
                }} style={{ ...btnPrimary, opacity: accountSave.busy ? 0.7 : 1 }}>{accountSave.busy ? "Saving..." : "Save Changes"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Settings Modal */}
      {settingsModal === "privacy" && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setSettingsModal(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Privacy & Safety</h3>
                {settingsSaveError && <p role="alert" style={{ fontSize: 12, color: "#B91C1C", marginTop: 2, fontFamily: font }}>{settingsSaveError}</p>}
              </div>
              <button onClick={() => setSettingsModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              {[
                { label: "Namaste Requests", desc: "Who can send you connection requests.", key: "namasteRequests", dbKey: "namaste_requests", type: "select", options: ["Everyone", "Nobody"] },
                { label: "Receive Messages", desc: "Who can send you direct messages.", key: "receiveMessages", dbKey: "receive_messages", type: "select", options: ["Everyone", "Connections Only", "Nobody"] },
              ].map((item, i) => (
                <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: i < 1 ? "1px solid #F0EFED" : "none" }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font }}>{item.label}</h4>
                    <p style={{ fontSize: 12, color: "#9B9A97", marginTop: 2, fontFamily: font }}>{item.desc}</p>
                  </div>
                  {item.type === "toggle" ? (
                    <button onClick={() => saveSetting(setPrivSettings, item.key, !privSettings[item.key], () => api.saveUserSettings({ [item.dbKey]: !privSettings[item.key] }))} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: privSettings[item.key] ? "#22C55E" : "#D4D4D2", position: "relative", padding: 0, flexShrink: 0 }}>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: privSettings[item.key] ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }} />
                    </button>
                  ) : (
                    <select value={privSettings[item.key]} onChange={(e) => { const v = e.target.value; saveSetting(setPrivSettings, item.key, v, () => api.saveUserSettings({ [item.dbKey]: v })); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #E0E0DE", fontSize: 12, background: "#F0EFED", color: "#37352F", fontFamily: font, cursor: "pointer", flexShrink: 0 }}>
                      {item.options.map(o => <option key={o}>{o}</option>)}
                    </select>
                  )}
                </div>
              ))}
              {/* Blocked members (opens the Blocked members window) */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "16px 0 0", borderTop: "1px solid #F0EFED" }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font }}>Blocked members ({blockedIds.size})</h4>
                <button onClick={() => setSettingsModal("blocked")} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #E0E0DE", background: "#fff", color: "#5F5E5B", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font, flexShrink: 0 }}>Manage</button>
              </div>
              {/* The separate consent (Art. 9 GDPR) and how to withdraw it. */}
              {user.art9ConsentAt && (
                <div style={{ padding: "16px 0 0", marginTop: 16, borderTop: "1px solid #F0EFED" }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font }}>Your consent</h4>
                  <p style={{ fontSize: 12, color: "#6B6A67", marginTop: 4, lineHeight: 1.5, fontFamily: font }}>
                    On {new Date(user.art9ConsentAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} you agreed that NRIClub shows other members what you share that can say something about your origin, religion or health. To withdraw this, delete those posts, answers, places or group memberships, or delete your account under Account Settings.
                  </p>
                </div>
              )}
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #F0EFED", display: "flex", justifyContent: "flex-end", gap: 10, background: "#FAFAF8" }}>
              <button onClick={() => { setSettingsModal(null); setSettingsSaveError(""); }} style={{ ...btnPrimary, padding: "10px 20px" }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications: in-app pop-ups only (NRIClub sends no notification emails) */}
      {settingsModal === "notifications" && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setSettingsModal(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Notifications</h3>
                {settingsSaveError && <p role="alert" style={{ fontSize: 12, color: "#B91C1C", marginTop: 2, fontFamily: font }}>{settingsSaveError}</p>}
              </div>
              <button onClick={() => setSettingsModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              {[
                { label: "Pop-ups while I'm on NRIClub", desc: "A small pop-up for new messages, Namaste requests, answers and bookings.", key: "push", dbKey: "push_notifications" },
                { label: "Catch-up when I come back", desc: "A summary of unread messages and notifications when you open NRIClub.", key: "email", dbKey: "email_notifications" },
              ].map((item, i) => (
                <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: i < 1 ? "1px solid #F0EFED" : "none" }}>
                  <div>
                    <h4 id={`notif-${item.key}`} style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font }}>{item.label}</h4>
                    <p style={{ fontSize: 12, color: "#6B6A67", marginTop: 2, fontFamily: font }}>{item.desc}</p>
                  </div>
                  <button type="button" role="switch" aria-checked={notifSettings[item.key] !== false} aria-labelledby={`notif-${item.key}`} onClick={() => {
                    const v = !notifSettings[item.key];
                    saveSetting(setNotifSettings, item.key, v, () => api.saveUserSettings({ [item.dbKey]: v }));
                  }} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: notifSettings[item.key] ? "#37352F" : "#D4D4D2", position: "relative", padding: 0, flexShrink: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: notifSettings[item.key] ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }} />
                  </button>
                </div>
              ))}
              <p style={{ fontSize: 12, color: "#6B6A67", margin: "14px 0 0", lineHeight: 1.5, fontFamily: font }}>Everything also waits for you in Messages and under the bell. We only email you sign-in codes and password links.</p>
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #F0EFED", display: "flex", justifyContent: "flex-end", gap: 10, background: "#FAFAF8" }}>
              <button onClick={() => { setSettingsModal(null); setSettingsSaveError(""); }} style={{ ...btnPrimary, padding: "10px 20px" }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Activity Log Modal */}
      {settingsModal === "activity" && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setSettingsModal(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Activity Log</h3>
              <button onClick={() => setSettingsModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ maxHeight: 400, overflow: "auto" }}>
              {(() => {
                const activities = [];
                posts.filter(p => p.userId === user.id).forEach(p => activities.push({ action: "Posted", target: p.content.substring(0, 40) + (p.content.length > 40 ? "..." : ""), time: timeAgo(p.timestamp) }));
                groups.filter(g => g.joined).forEach(g => activities.push({ action: "Joined group", target: g.name, time: "" }));
                helpRequests.filter(h => h.user === user.name).forEach(h => activities.push({ action: "Asked for help", target: h.title, time: timeAgo(h.timestamp) }));
                if (activities.length === 0) activities.push({ action: "No activity yet", target: "Start posting or joining communities!", time: "" });
                return activities.slice(0, 10).map((log, i) => (
                  <div key={i} style={{ padding: "16px 24px", borderBottom: "1px solid #F0EFED" }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font }}>{log.action}</p>
                    <p style={{ fontSize: 12, color: "#9B9A97", marginTop: 2, fontFamily: font }}>"{log.target}"{log.time ? ` · ${log.time}` : ""}</p>
                  </div>
                ));
              })()}
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #F0EFED", display: "flex", justifyContent: "flex-end", background: "#FAFAF8" }}>
              <button onClick={() => setSettingsModal(null)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Invite a friend */}
      {settingsModal === "invite" && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setSettingsModal(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, padding: 24, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 34, marginBottom: 8 }} aria-hidden="true">🙏</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#37352F", marginBottom: 6, fontFamily: font }}>Invite a friend</h3>
            <p style={{ fontSize: 13, color: "#6B6A67", marginBottom: 20, lineHeight: 1.5, fontFamily: font }}>Know Indians living abroad? Send them your link. When they sign up, our team sees that you invited them.</p>
            <a href={`https://wa.me/?text=${encodeURIComponent(inviteText)}`} target="_blank" rel="noopener noreferrer" onClick={() => setSettingsModal(null)} style={{ ...btnPrimary, width: "100%", justifyContent: "center", textDecoration: "none", background: "#25D366", boxSizing: "border-box", marginBottom: 10 }}>Share on WhatsApp</a>
            <button onClick={async () => { try { await navigator.clipboard.writeText(inviteLink); alert("Link copied!"); } catch (e) { prompt("Copy your invite link:", inviteLink); } }} style={{ width: "100%", padding: "11px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", color: "#37352F", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Copy link</button>
          </div>
        </div>
      )}

      {/* Feedback: report a problem or suggest an idea (lands in the admin panel under Feedback) */}
      {settingsModal === "feedback" && (() => {
        const label = { display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, fontFamily: font };
        const pages = [["Feed", "Home / Feed"], ["Find", "Find / Search"], ["Groups", "Groups"], ["Events", "Events"], ["Messages", "Messages"], ["Ask", "Ask & Guides"], ["Marketplace", "Marketplace"], ["Profile", "Profile"], ["Other", "Somewhere else"]];
        const here = ({ home: "Feed", network: "Find", groups: "Groups", events: "Events", messages: "Messages", market: "Marketplace", docs: "Ask", help: "Ask", profile: "Profile", member: "Find" })[view] || "Other";
        const kinds = [
          { k: "bug", icon: "🐞", title: "Something isn't working", text: "A button, a page or a message that doesn't do what it should." },
          { k: "idea", icon: "💡", title: "I have an idea", text: "A feature or change that would make NRIClub better for you." },
        ];
        const send = async () => {
          const desc = (document.getElementById("feedback-desc")?.value || "").trim();
          if (!desc) { setBugError(feedbackKind === "bug" ? "Please tell us what went wrong." : "Please tell us your idea."); return; }
          const summary = desc.split("\n")[0].slice(0, 60);
          let reason;
          if (feedbackKind === "bug") {
            const page = document.getElementById("feedback-page")?.value || "Other";
            // Which browser and screen, to help us reproduce it.
            const device = `${(navigator.userAgent || "").slice(0, 160)} · ${window.innerWidth}×${window.innerHeight}`;
            reason = `[BUG] ${page}: ${summary} — ${desc}\n\nDevice: ${device}`;
          } else {
            reason = `[IDEA] ${summary} — ${desc}`;
          }
          setFeedbackSending(true);
          try {
            await api.reportPost(user.id, reason.slice(0, 5000));
            setBugError("");
            setSettingsModal(null);
            alert(feedbackKind === "bug" ? "Thanks! Your report was sent to the NRIClub team." : "Thanks for the idea! The NRIClub team reads every one.");
          } catch (e) {
            alert(isNetworkError(e) ? NETWORK_MESSAGE : "That couldn't be sent. Please try again.");
          }
          setFeedbackSending(false);
        };
        return (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setSettingsModal(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="feedback-title" style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
              <h3 id="feedback-title" style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>{feedbackKind === "bug" ? "Report a problem" : feedbackKind === "idea" ? "Suggest an idea" : "Send feedback"}</h3>
              <button onClick={() => setSettingsModal(null)} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              {!feedbackKind ? (
                <>
                  <p style={{ fontSize: 13, color: "#6B6A67", marginBottom: 14, fontFamily: font }}>NRIClub is built with its members. What would you like to tell us?</p>
                  <div style={{ display: "grid", gap: 10 }}>
                    {kinds.map(o => (
                      <button key={o.k} onClick={() => setFeedbackKind(o.k)} style={{ display: "flex", gap: 12, alignItems: "flex-start", textAlign: "left", padding: "14px 16px", borderRadius: 12, border: "1px solid #E8E7E4", background: "#fff", cursor: "pointer", fontFamily: font }}>
                        <span style={{ fontSize: 22 }} aria-hidden="true">{o.icon}</span>
                        <span><strong style={{ display: "block", fontSize: 14, color: "#37352F" }}>{o.title}</strong><span style={{ fontSize: 12, color: "#6B6A67" }}>{o.text}</span></span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div role="radiogroup" aria-label="Kind of feedback" style={{ display: "flex", gap: 4, padding: 4, background: "#F0EFED", borderRadius: 8, marginBottom: 16, width: "fit-content" }}>
                    {kinds.map(o => (
                      <button key={o.k} role="radio" aria-checked={feedbackKind === o.k} onClick={() => { setFeedbackKind(o.k); setBugError(""); }} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: feedbackKind === o.k ? "#fff" : "transparent", color: feedbackKind === o.k ? "#37352F" : "#6B6A67", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>{o.icon} {o.k === "bug" ? "Problem" : "Idea"}</button>
                    ))}
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label htmlFor="feedback-desc" style={label}>{feedbackKind === "bug" ? "What went wrong?" : "Your idea"}</label>
                    <textarea id="feedback-desc" key={feedbackKind} maxLength={4000} placeholder={feedbackKind === "bug" ? "Tell us what you tried and what happened" : "What would you like NRIClub to do, and how would it help you?"} onChange={() => bugError && setBugError("")} style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 14, minHeight: 110, resize: "vertical", outline: "none", fontFamily: font, boxSizing: "border-box", background: "#FAFAF8" }} />
                    {bugError && <p role="alert" style={{ fontSize: 12, color: "#B91C1C", marginTop: 4, fontFamily: font }}>{bugError}</p>}
                  </div>
                  {feedbackKind === "bug" && (
                    <div style={{ marginBottom: 20 }}>
                      <label htmlFor="feedback-page" style={label}>Where?</label>
                      <select id="feedback-page" defaultValue={here} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 14, background: "#FAFAF8", outline: "none", fontFamily: font, boxSizing: "border-box" }}>
                        {pages.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <p style={{ fontSize: 11, color: "#9B9A97", marginTop: 6, fontFamily: font }}>We also send your browser and screen size, so we can see the problem the way you do.</p>
                    </div>
                  )}
                  <button onClick={send} disabled={feedbackSending} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: "#37352F", color: "#fff", fontSize: 14, fontWeight: 600, cursor: feedbackSending ? "default" : "pointer", opacity: feedbackSending ? 0.7 : 1, fontFamily: font }}>{feedbackSending ? "Sending…" : feedbackKind === "bug" ? "Send report" : "Send idea"}</button>
                </>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Help Center Modal */}
      {settingsModal === "helpCenter" && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setSettingsModal(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Support</h3>
              <button onClick={() => setSettingsModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ background: "#EDF4FF", borderRadius: 10, padding: "18px 20px", marginBottom: 24, border: "1px solid #DBEAFE" }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: "#37352F", marginBottom: 8, fontFamily: font, display: "flex", alignItems: "center", gap: 6 }}>{Icons.help({ size: 16 })} Need assistance?</h4>
                <p style={{ fontSize: 13, color: "#5F5E5B", lineHeight: 1.5, marginBottom: 14, fontFamily: font }}>Our support team is here to help you with any issues or questions you might have.</p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <a href="mailto:hello@nriclub.app" style={{ ...btnPrimary, textDecoration: "none" }}>Contact support</a>
                  <button onClick={() => { setBugError(""); setFeedbackKind("bug"); setSettingsModal("feedback"); }} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", color: "#37352F", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Report a problem</button>
                  <button onClick={() => { setBugError(""); setFeedbackKind("idea"); setSettingsModal("feedback"); }} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", color: "#37352F", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Suggest an idea</button>
                </div>
              </div>
              <h4 style={{ fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontFamily: font }}>FAQs</h4>
              <div style={{ border: "1px solid #E8E7E4", borderRadius: 10, overflow: "hidden" }}>
                {[
                  { q: "How do I get verified?", a: "An admin checks your LinkedIn or short note. Your status shows at the top of Home." },
                  { q: "How do I change my name or password?", a: "Gear → Account Settings." },
                  { q: "How do I report someone?", a: "Use '…' on a post or in a chat, or the flag on a member's card." },
                ].map((f, i) => (
                  <div key={i} style={{ borderBottom: i < 2 ? "1px solid #F0EFED" : "none" }}>
                    <button onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "14px 18px", border: "none", background: "#fff", cursor: "pointer", fontSize: 14, color: "#37352F", fontFamily: font, textAlign: "left" }}>
                      {f.q} <span style={{ color: "#9B9A97", transform: openFaq === i ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>›</span>
                    </button>
                    {openFaq === i && <p style={{ padding: "0 18px 14px", fontSize: 13, color: "#5F5E5B", lineHeight: 1.5, fontFamily: font }}>{f.a}</p>}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #F0EFED", display: "flex", justifyContent: "flex-end", background: "#FAFAF8" }}>
              <button onClick={() => setSettingsModal(null)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Terms & Policies Modal */}
      {settingsModal === "terms" && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setSettingsModal(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED", flexShrink: 0 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Terms & Policies</h3>
              <button onClick={() => setSettingsModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24, overflow: "auto", flex: 1, fontSize: 13, color: "#5F5E5B", lineHeight: 1.7, fontFamily: font }}>
              <div role="tablist" aria-label="Terms and policies" style={{ display: "flex", gap: 4, background: "#F0EFED", padding: 3, borderRadius: 8, marginBottom: 20 }}>
                {[{ k: "terms", l: "Terms of Use" }, { k: "privacy", l: "Privacy Policy" }, ...(hasImprint() ? [{ k: "impressum", l: "Impressum" }] : [])].map(tab => (
                  <button key={tab.k} type="button" role="tab" aria-selected={legalTab === tab.k} onClick={() => setLegalTab(tab.k)} style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "none", background: legalTab === tab.k ? "#fff" : "transparent", color: legalTab === tab.k ? "#37352F" : "#6B6A67", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font, boxShadow: legalTab === tab.k ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}>{tab.l}</button>
                ))}
              </div>
              {legalTab === "terms" ? <TermsContent /> : legalTab === "impressum" ? <ImpressumContent headingStyle={{ fontSize: 14, fontWeight: 700, color: "#37352F", margin: "0 0 4px" }} /> : <PrivacyContent />}
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #F0EFED", display: "flex", justifyContent: "flex-end", background: "#FAFAF8", flexShrink: 0 }}>
              <button onClick={() => setSettingsModal(null)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Followers / Following Modal */}
      {followModal && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setFollowModal(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, maxHeight: "70vh", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED", flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 0, background: "#F5F5F3", borderRadius: 20, padding: "3px 4px" }}>
                {["followers", "following"].map(t => (
                  <button key={t} onClick={() => setFollowModal(t)} style={{ padding: "6px 16px", borderRadius: 18, border: followModal === t ? "1px solid #E0E0DE" : "1px solid transparent", fontSize: 13, fontWeight: followModal === t ? 600 : 500, background: followModal === t ? "#fff" : "transparent", color: followModal === t ? "#37352F" : "#9B9A97", cursor: "pointer", fontFamily: font, transition: "all 0.2s", textTransform: "capitalize", boxShadow: followModal === t ? "0 1px 3px rgba(0,0,0,0.06)" : "none" }}>
                    {t} ({t === "followers" ? myFollowers.length : myFollowing.length})
                  </button>
                ))}
              </div>
              <button onClick={() => setFollowModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ overflow: "auto", flex: 1 }}>
              {(followModal === "followers" ? myFollowers : myFollowing).length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#9B9A97", fontSize: 13, fontFamily: font }}>
                  {followModal === "followers" ? "No followers yet. Share your profile to get connected!" : "You're not following anyone yet. Send a Namaste request to connect!"}
                </div>
              ) : (
                (followModal === "followers" ? myFollowers : myFollowing).map((u, i) => (
                  <div key={u.id || i} onClick={() => { setFollowModal(null); openMember(u.id); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 24px", borderBottom: "1px solid #F0EFED", cursor: "pointer" }}>
                    <Avatar name={u.name || "User"} size={40} url={u.avatar_url} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font }}>{u.name || "User"}</div>
                      <div style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>{u.profession || ""}</div>
                    </div>
                    <button style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #E0E0DE", background: "#fff", fontSize: 11, fontWeight: 600, color: "#5F5E5B", cursor: "pointer", fontFamily: font }}>View</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Profile Preview Modal */}
      {/* Report Confirmation Modal */}
      {reportConfirm && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setReportConfirm(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 380, padding: 28, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              {Icons.flag({ size: 22, stroke: "#DC2626" })}
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", marginBottom: 6, fontFamily: font }}>Report this {reportConfirm.type}?</h3>
            {reportConfirm.name && <p style={{ fontSize: 12, color: "#5F5E5B", marginBottom: 8, fontFamily: font }}>"{reportConfirm.name}"</p>}
            <p style={{ fontSize: 13, color: "#9B9A97", marginBottom: 20, lineHeight: 1.5, fontFamily: font }}>This will be reviewed by our moderation team.</p>
            {reportConfirm.type === "user" && (
              <div style={{ textAlign: "left", marginBottom: 20 }}>
                <label htmlFor="report-reason" style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, fontFamily: font }}>Reason</label>
                <select id="report-reason" value={reportConfirm.reason || ""} onChange={(e) => setReportConfirm({ ...reportConfirm, reason: e.target.value })} style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="" disabled>Choose a reason</option>
                  {["Spam or misleading", "Harassment or hate speech", "Inappropriate content", "Violence or physical harm", "Impersonation", "Other"].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={() => setReportConfirm(null)} style={{ padding: "10px 24px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", fontSize: 13, color: "#5F5E5B", cursor: "pointer", fontFamily: font }}>Cancel</button>
              <button disabled={reportConfirm.type === "user" && !reportConfirm.reason} onClick={async () => {
                const reason = `[${reportConfirm.type.toUpperCase()}] ${reportConfirm.name ? reportConfirm.name + " — " : ""}${reportConfirm.reason || "Reported as inappropriate"}`;
                try {
                  if (reportConfirm.type === "user") {
                    await api.reportUser(reportConfirm.id, reason);
                  } else {
                    await api.reportPost(reportConfirm.id, reason);
                  }
                  setReportedIds(prev => { const s = new Set(prev); s.add(reportConfirm.id); return s; });
                  setReportConfirm(null);
                  alert("Reported successfully. Our team will review this content.");
                } catch(e) {
                  console.error("Report failed:", e);
                  alert(isNetworkError(e) ? NETWORK_MESSAGE : "Your report couldn't be sent. Please try again.");
                  setReportConfirm(null);
                }
              }} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: reportConfirm.type === "user" && !reportConfirm.reason ? "#FECACA" : "#DC2626", fontSize: 13, fontWeight: 600, color: "#fff", cursor: reportConfirm.type === "user" && !reportConfirm.reason ? "default" : "pointer", fontFamily: font }}>Report</button>
            </div>
          </div>
        </div>
      )}

      {/* Blocked Users Modal */}
      {settingsModal === "blocked" && (
        <BlockedUsersModal onClose={() => setSettingsModal("privacy")} font={font}
          onUnblocked={(id) => setBlockedIds(prev => { const s = new Set(prev); s.delete(id); return s; })} />
      )}

      {/* Block User Modal */}
      {blockModalOpen && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setBlockModalOpen(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FEF2F2" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#DC2626" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4" y1="4" x2="20" y2="20"/></svg>
                <h3 style={{ fontSize: 16, fontWeight: 700, fontFamily: font }}>Block User</h3>
              </div>
              <button onClick={() => setBlockModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", padding: 4 }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 14, color: "#5F5E5B", lineHeight: 1.6, marginBottom: 28, fontFamily: font }}>
                Block {convos.find(c => c.otherUserId === blockTargetId)?.name || networkUsers.find(u => u.id === blockTargetId)?.name || "this member"}? They won't be able to message you or see your profile. You can undo this in Settings → Privacy & Safety.
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button onClick={() => setBlockModalOpen(false)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font }}>Cancel</button>
                <button onClick={async () => {
                  const userIdToBlock = blockTargetId;
                  if (!userIdToBlock) { setBlockModalOpen(false); return; }
                  try { await api.blockUser(userIdToBlock); } catch(e) {}
                  setBlockedIds(prev => { const s = new Set(prev); s.add(userIdToBlock); return s; });
                  setBlockModalOpen(false);
                  setSelectedConvo(null);
                  alert("User blocked. You can unblock them in Settings → Privacy & Safety.");
                }} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, background: "#DC2626", color: "#fff", cursor: "pointer", fontFamily: font }}>Confirm Block</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Feed Modal */}
      {filterModalOpen && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setFilterModalOpen(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#37352F", fontFamily: font, display: "flex", alignItems: "center", gap: 8 }}>{Icons.filter({ size: 16 })} Filter Feed</h3>
              <button onClick={() => setFilterModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: "0 20px 20px" }}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>{Icons.mapPin({ size: 12 })} City</label>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}>{Icons.search({ size: 14 })}</div>
                  <input value={feedFilters.hometown} onChange={(e) => setFeedFilters({...feedFilters, hometown: e.target.value})} placeholder="Hometown or current city" style={{ ...inputStyle, paddingLeft: 34 }} />
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>{Icons.briefcase({ size: 12 })} Occupation</label>
                <select value={feedFilters.occupation} onChange={(e) => setFeedFilters({...feedFilters, occupation: e.target.value})} style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}>
                  {["All", ...OCCUPATION_TYPES].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>{Icons.globe({ size: 12 })} Lives in</label>
                <select value={feedFilters.livesIn} onChange={(e) => setFeedFilters({...feedFilters, livesIn: e.target.value})} style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}>
                  {["All", "Abroad", "India"].map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>{Icons.users({ size: 12 })} Community</label>
                <select value={feedFilters.community} onChange={(e) => setFeedFilters({...feedFilters, community: e.target.value})} style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}>
                  <option value="All">All Communities</option>
                  {groups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => setFeedFilters(noFeedFilters)} style={{ background: "none", border: "none", color: "#5F5E5B", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, padding: "12px 8px" }}>Clear</button>
                <button onClick={() => setFilterModalOpen(false)} style={{ ...btnPrimary, flex: 1, justifyContent: "center", padding: "12px" }}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Doc Modal */}
      {docModal && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setDocModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Create New Doc</h3>
              <button onClick={() => setDocModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Title</label>
                <input style={inputStyle} value={newDoc.title} onChange={(e) => setNewDoc({...newDoc, title: e.target.value})} placeholder="e.g. 10 steps to do when you're in Berlin" />
              </div>
              <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>City</label>
                  <select style={{ ...inputStyle, appearance: "none", cursor: "pointer" }} value={newDoc.city} onChange={(e) => setNewDoc({...newDoc, city: e.target.value})}>
                    <option value="">Select City</option>
                    {GLOBAL_CITIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Category</label>
                  <select style={{ ...inputStyle, appearance: "none", cursor: "pointer" }} value={newDoc.category} onChange={(e) => setNewDoc({...newDoc, category: e.target.value})}>
                    {["General", "Guide", "Food", "Finance", "Housing"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Your guide</label>
                <textarea className="doc-guide" style={{ ...inputStyle, minHeight: 200, resize: "none" }} value={newDoc.excerpt} onChange={(e) => setNewDoc({...newDoc, excerpt: e.target.value})} placeholder="Write the steps, tips and useful links…" />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, paddingTop: 16, borderTop: "1px solid #F0EFED" }}>
                <button onClick={() => setDocModal(false)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font }}>Cancel</button>
                <button onClick={async () => { if (!newDoc.title || !newDoc.city) return; const tempDoc = { id: "d_"+Date.now(), ...newDoc, content: newDoc.excerpt, readTime: "1 min read", author: user.name, authorLocation: user.location || "", likes: 0, timestamp: new Date().toLocaleDateString(), comments: [] }; setDocs([tempDoc, ...docs]); try { const r = await api.createDoc({ title: newDoc.title, city: newDoc.city, category: newDoc.category, excerpt: newDoc.excerpt, content: newDoc.excerpt }); if (r?.[0]) setDocs(prev => prev.map(d => d.id === tempDoc.id ? { ...d, id: r[0].id } : d)); } catch(e) {} setNewDoc({ title: "", city: "", category: "General", excerpt: "" }); setDocModal(false); }} disabled={!newDoc.title || !newDoc.city} style={{ ...btnPrimary, opacity: newDoc.title && newDoc.city ? 1 : 0.4 }}>Create Doc</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Post Market Item Modal */}
      {marketModal && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setMarketModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Post in Market</h3>
              <button onClick={() => setMarketModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Title</label>
                <input style={inputStyle} value={newMarket.title} onChange={(e) => setNewMarket({...newMarket, title: e.target.value})} placeholder={marketForm(newMarket.category).title} />
              </div>
              <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                {marketForm(newMarket.category).price ? (
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>{marketForm(newMarket.category).price}</label>
                  <input style={inputStyle} value={newMarket.price} onChange={(e) => setNewMarket({...newMarket, price: e.target.value})} placeholder={marketForm(newMarket.category).pricePh} />
                </div>) : <div />}
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Category</label>
                  <select style={{ ...inputStyle, appearance: "none", cursor: "pointer" }} value={newMarket.category} onChange={(e) => setNewMarket({...newMarket, category: e.target.value})}>
                    {["Housing", "Referrals", "Travel", "Jobs", "Items", "Vehicles", "Services"].map(c => <option key={c} value={c}>{marketLabel(c)}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>City</label>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={newMarket.city} onChange={(e) => setNewMarket({...newMarket, city: e.target.value})}>
                  <option value="">Select a city...</option>
                  {GLOBAL_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Description</label>
                <textarea style={{ ...inputStyle, minHeight: 100, resize: "none" }} value={newMarket.description} onChange={(e) => setNewMarket({...newMarket, description: e.target.value})} placeholder={marketForm(newMarket.category).desc} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Photos (max 4)</label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {marketPhotos.map((p, i) => (
                    <div key={i} style={{ width: 72, height: 72, borderRadius: 8, overflow: "hidden", position: "relative", border: "1px solid #E0E0DE" }}>
                      <img src={p} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button onClick={() => setMarketPhotos(prev => prev.filter((_, j) => j !== i))} style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                    </div>
                  ))}
                  {marketPhotos.length < 4 && (
                    <label style={{ width: 72, height: 72, borderRadius: 8, border: "2px dashed #E0E0DE", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#9B9A97" }}>
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => setMarketPhotos(prev => [...prev, ev.target.result].slice(0, 4));
                        reader.readAsDataURL(file);
                      }} />
                      {Icons.plus({ size: 20 })}
                      <span style={{ fontSize: 9, marginTop: 2 }}>Add</span>
                    </label>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, paddingTop: 16, borderTop: "1px solid #F0EFED" }}>
                <button onClick={() => { setMarketModal(false); setMarketPhotos([]); }} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font }}>Cancel</button>
                <button disabled={!newMarket.title || (marketForm(newMarket.category).price && !newMarket.price && newMarket.category !== "Jobs")} onClick={async () => {
                  // Upload photos to Supabase Storage
                  let imageUrls = [];
                  for (const photo of marketPhotos) {
                    try {
                      // Convert base64 to blob
                      const res = await fetch(photo);
                      const blob = await res.blob();
                      const file = new File([blob], `market_${Date.now()}_${imageUrls.length}.jpg`, { type: 'image/jpeg' });
                      const url = await api.uploadMarketImage(file);
                      if (url) imageUrls.push(url);
                    } catch(ue) {
                      alert("A photo couldn't be uploaded. Photos must be JPEG, PNG, WebP or GIF and under 5 MB.");
                      return;
                    }
                  }
                  try {
                    const created = await api.createMarketItem({ title: newMarket.title, price: marketForm(newMarket.category).price ? newMarket.price : "", category: newMarket.category, location: newMarket.city, description: newMarket.description, image_url: JSON.stringify(imageUrls) });
                    // Add to local state immediately
                    setMarketItems(prev => [{ id: created?.[0]?.id || "m_" + Date.now(), user_id: user.id, title: newMarket.title, price: newMarket.price, category: newMarket.category, location: newMarket.city, description: newMarket.description, seller: user.name, date: new Date().toLocaleDateString(), photos: imageUrls, color: "#2D1B4E" }, ...prev]);
                  } catch(e) {
                    alert("Your listing couldn't be posted. Please try again.");
                    return;
                  }
                  setNewMarket({ title: "", price: "", category: "Items", city: "", description: "" }); setMarketPhotos([]); setMarketModal(false);
                }} style={{ ...btnPrimary, opacity: newMarket.title && (!marketForm(newMarket.category).price || newMarket.price || newMarket.category === "Jobs") ? 1 : 0.4 }}>Post</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Request New Community Modal */}
      {groupRequestModal && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setGroupRequestModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Request a new group</h3>
              <button onClick={() => setGroupRequestModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97", padding: 4 }}>{Icons.x({ size: 18 })}</button>
            </div>
            {groupRequestSent ? (
              <div style={{ padding: 24 }}>
                <p style={{ fontSize: 14, color: "#37352F", lineHeight: 1.55, marginBottom: 20, fontFamily: font }}>Thanks, an admin will review this.</p>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => { setGroupRequestModal(false); setGroupRequestSent(false); }} style={btnPrimary}>Done</button>
                </div>
              </div>
            ) : (() => {
              const requestCity = newGroupCity.trim();
              const uni = newGroupKind === "University";
              const requestName = uni ? `Indians at ${requestCity}` : `Indians in ${requestCity}`;
              const existingGroup = requestCity ? groups.find(g => g.name.toLowerCase() === requestName.toLowerCase()) : null;
              const canSubmit = !!requestCity && !existingGroup;
              return (
            <div style={{ padding: 24 }}>
              {/* A city or a university */}
              <div role="radiogroup" aria-label="Kind of group" style={{ display: "flex", gap: 4, padding: 4, background: "#F0EFED", borderRadius: 8, marginBottom: 18, width: "fit-content" }}>
                {[["City", "🏙️ A city"], ["University", "🎓 A university"]].map(([k, l]) => (
                  <button key={k} role="radio" aria-checked={newGroupKind === k} onClick={() => { setNewGroupKind(k); setGroupRequestError(""); }} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: newGroupKind === k ? "#fff" : "transparent", color: newGroupKind === k ? "#37352F" : "#6B6A67", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>{l}</button>
                ))}
              </div>
              {/* City or university name */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>
                  {uni ? "University" : "City Name"}
                </label>
                <input
                  value={newGroupCity} onChange={(e) => { setNewGroupCity(e.target.value); setGroupRequestError(""); }}
                  placeholder={uni ? "e.g. TU Munich" : "e.g. Paris"}
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid #E0E0DE",
                    fontSize: 14, background: "#FAFAF8", outline: "none", color: "#37352F", fontFamily: font, boxSizing: "border-box",
                  }}
                  autoFocus
                />
                {existingGroup ? (
                  <p style={{ fontSize: 13, color: "#5F5E5B", marginTop: 8, fontFamily: font }}>
                    {existingGroup.name} already exists.{" "}
                    <button onClick={() => { setGroupRequestModal(false); setNewGroupCity(""); setGroupMembers([]); setCommunityTab("feed"); setSelectedGroup(existingGroup); }} style={{ background: "none", border: "none", padding: 0, color: "#37352F", fontWeight: 600, textDecoration: "underline", cursor: "pointer", fontSize: 13, fontFamily: font }}>
                      Open it
                    </button>
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: "#9B9A97", marginTop: 8, fontFamily: font, overflowWrap: "anywhere" }}>Your group will be called {uni ? "Indians at" : "Indians in"} {requestCity || "…"}</p>
                )}
                {groupRequestError && <p role="alert" style={{ fontSize: 13, color: "#B91C1C", marginTop: 8, fontFamily: font }}>{groupRequestError}</p>}
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button onClick={() => setGroupRequestModal(false)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font }}>
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!canSubmit) return;
                    setGroupRequestError("");
                    try {
                      await api.requestNewGroup(requestCity, newGroupKind);
                      setGroupRequestSent(true);
                      setNewGroupCity("");
                    } catch(e) {
                      setGroupRequestError(isNetworkError(e) ? NETWORK_MESSAGE
                        : /23505/.test(e.message || "") ? `There's already a group or a request for ${requestCity}.`
                        : "Your request couldn't be sent. Please try again.");
                    }
                  }}
                  disabled={!canSubmit}
                  style={{
                    padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600,
                    background: canSubmit ? "#37352F" : "#E8E7E4", color: canSubmit ? "#fff" : "#9B9A97",
                    cursor: canSubmit ? "pointer" : "default", fontFamily: font,
                  }}
                >
                  Submit Request
                </button>
              </div>
            </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Event Modal */}
      {eventModal && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setEventModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Host an Event</h3>
              <button onClick={() => setEventModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97", padding: 4 }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Event Title</label>
                <input style={inputStyle} value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="e.g. Diwali Night 2026" />
              </div>
              <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Date</label>
                  <input style={inputStyle} type="date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Time</label>
                  <input style={inputStyle} type="time" value={newEvent.time} onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })} />
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Location / Venue</label>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}>{Icons.mapPin({ size: 14 })}</div>
                  <input style={{ ...inputStyle, paddingLeft: 36 }} value={newEvent.location} onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })} placeholder="e.g. Kulturbrauerei, Berlin" />
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>City</label>
                <select style={inputStyle} value={newEvent.city || ""} onChange={(e) => setNewEvent({ ...newEvent, city: e.target.value })}>
                  <option value="">Select a city...</option>
                  {GLOBAL_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Description</label>
                <textarea style={{ ...inputStyle, minHeight: 100, resize: "none" }} value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} placeholder="Tell people what your event is about..." />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Ticket / Info Link (Optional)</label>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}>{Icons.link({ size: 14 })}</div>
                  <input style={{ ...inputStyle, paddingLeft: 36 }} value={newEvent.link} onChange={(e) => setNewEvent({ ...newEvent, link: e.target.value })} placeholder="https://eventbrite.com/..." />
                </div>
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Event Photo (Optional)</label>
                {eventPhoto ? (
                  <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: "1px solid #E0E0DE" }}>
                    <img src={eventPhoto.preview} alt="" style={{ width: "100%", height: 140, objectFit: "cover" }} />
                    <button onClick={() => setEventPhoto(null)} style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: "none", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icons.x({ size: 12 })}</button>
                  </div>
                ) : (
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "20px 16px", borderRadius: 10, border: "2px dashed #E0E0DE", cursor: "pointer", color: "#9B9A97", fontSize: 13, fontFamily: font, background: "#FAFAF8" }}>
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (ev) => {
                      const file = ev.target.files?.[0];
                      if (!file) return;
                      const preview = URL.createObjectURL(file);
                      try { const url = await api.uploadPostImage(file); setEventPhoto({ url, preview }); }
                      catch(err) { alert("The photo couldn't be uploaded. Photos must be JPEG, PNG, WebP or GIF and under 5 MB."); }
                    }} />
                    {Icons.image({ size: 18 })} Click to add a cover photo
                  </label>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, paddingTop: 16, borderTop: "1px solid #F0EFED" }}>
                <button onClick={() => setEventModal(false)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font }}>Cancel</button>
                <button onClick={createEvent} disabled={!newEvent.title || !newEvent.date} style={{ ...btnPrimary, opacity: newEvent.title && newEvent.date ? 1 : 0.4 }}>Host Event</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {helpModal && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setHelpModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Ask a question</h3>
              <button onClick={() => setHelpModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Title</label>
                <input style={inputStyle} value={newHelp.title} onChange={(e) => setNewHelp({ ...newHelp, title: e.target.value })} placeholder="Summarize your need..." />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Category</label>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={newHelp.category} onChange={(e) => setNewHelp({ ...newHelp, category: e.target.value })}>
                  {["General", "Housing", "Health", "Legal/Visa", "Education", "Jobs", "Travel", "Money & tax", "Family"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Description</label>
                <textarea style={{ ...inputStyle, minHeight: 100, resize: "none" }} value={newHelp.description} onChange={(e) => setNewHelp({ ...newHelp, description: e.target.value })} placeholder="Provide details..." />
              </div>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: newHelp.urgent ? 10 : 20, cursor: "pointer", fontFamily: font }}>
                <input type="checkbox" checked={!!newHelp.urgent} onChange={(e) => setNewHelp({ ...newHelp, urgent: e.target.checked })} style={{ marginTop: 3 }} />
                <span style={{ fontSize: 13, color: "#37352F", lineHeight: 1.5 }}>
                  <strong>🚨 This is urgent</strong>
                  <span style={{ display: "block", fontSize: 12, color: "#6B6A67" }}>A hospital visit, a lost passport, a death in the family. {user.verificationStatus === "approved" ? `Members in ${user.city || "your city"} and its ambassador get a notification.` : "Once you're verified, urgent questions also alert members in your city."} One urgent question a day.</span>
                </span>
              </label>
              {newHelp.urgent && <div style={{ marginBottom: 20 }}><EmergencyHelp /></div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button onClick={() => setHelpModal(false)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer" }}>Cancel</button>
                <button onClick={createHelp} disabled={!newHelp.title || !newHelp.description} style={{ ...btnPrimary, opacity: newHelp.title && newHelp.description ? 1 : 0.4 }}>Post question</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {bookingMentor && <BookingModal mentor={bookingMentor} onClose={() => setBookingMentor(null)} onMessage={messageMember} Avatar={Avatar} />}

      {!locked && (
        <>
          {/* A member waiting for review gets the welcome for members held for
              review: they can't join groups or say hello before approval. */}
          {notice?.kind === "welcome" && <WelcomeNotice user={waiting ? { ...user, reviewFlag: user.reviewFlag || "held" } : user} verified={!!notice.verified} cityGroup={cityGroup?.name} cityMissing={cityMissing} onClose={closeNotice} onCityGroup={openMyCityGroup} />}
          {notice?.kind === "verified" && <VerifiedNotice user={user} cityGroup={cityGroup?.name} cityMissing={cityMissing} onClose={closeNotice} onCityGroup={openMyCityGroup} />}
          {notice?.kind === "info" && <NeedsInfoNotice user={user} onClose={closeNotice} onUpdate={() => { closeNotice(); leaveOverlays(); setVerifyOpen(true); }} />}
          {notice?.kind === "catchup" && <CatchUpNotice user={user} items={notice.items} onClose={closeNotice} />}
          <ToastStack toasts={toasts} onDismiss={dismissToast} />
        </>
      )}

      {/* Edit Profile Modal */}
      {profileModal && (() => {
        const abroad = isUserNRI(user);
        const editLabel = { display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontFamily: font };
        const setField = (key, value) => { setEditProfile({ ...editProfile, [key]: value }); if (profileErrors[key] || profileErrors.form) setProfileErrors({}); };
        const textField = (key, label, placeholder, extra = {}) => (
          <div key={key} style={{ marginBottom: 16 }}>
            <label htmlFor={`edit-${key}`} style={editLabel}>{label}</label>
            <input id={`edit-${key}`} style={{ ...inputStyle, borderColor: profileErrors[key] ? "#DC2626" : "#E0E0DE" }} value={editProfile[key] || ""} placeholder={placeholder}
              onChange={(e) => setField(key, e.target.value)} autoFocus={profileFocus === key}
              aria-invalid={!!profileErrors[key]} aria-describedby={profileErrors[key] ? `edit-${key}-error` : extra.help ? `edit-${key}-help` : undefined} {...extra.input} />
            {profileErrors[key] ? <p id={`edit-${key}-error`} style={{ fontSize: 12, color: "#DC2626", marginTop: 6, fontFamily: font }}>{profileErrors[key]}</p>
              : extra.help ? <p id={`edit-${key}-help`} style={{ fontSize: 12, color: "#6B6A67", marginTop: 6, lineHeight: 1.45, fontFamily: font }}>{extra.help}</p> : null}
          </div>
        );
        const selectField = (key, label, placeholder, options) => (
          <div key={key} style={{ marginBottom: 16 }}>
            <label htmlFor={`edit-${key}`} style={editLabel}>{label}</label>
            <select id={`edit-${key}`} style={{ ...inputStyle, cursor: "pointer", color: editProfile[key] ? "#37352F" : "#6B6A67" }} value={editProfile[key] || ""}
              onChange={(e) => setField(key, e.target.value)} autoFocus={profileFocus === key}>
              <option value="">{placeholder}</option>
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        );
        return (
          <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setProfileModal(false)}>
            <div role="dialog" aria-modal="true" aria-labelledby="edit-profile-title" style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #F0EFED", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FAFAF8" }}>
                <h3 id="edit-profile-title" style={{ fontSize: 15, fontWeight: 600 }}>Edit Profile</h3>
                <button type="button" onClick={() => setProfileModal(false)} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6A67" }}>{Icons.x({ size: 18 })}</button>
              </div>
              <form style={{ padding: 24 }} noValidate onSubmit={(e) => { e.preventDefault(); saveProfileChanges(); }}>
                {textField("profession", "What do you do?", "e.g. Software Engineer at SAP")}
                {textField("location", "Location", "City, Country")}
                {abroad && textField("hometown", "Hometown in India", "e.g. Pune, Maharashtra")}
                {abroad && selectField("yearsAbroad", "Years abroad", "When did you move abroad?", YEARS_OPTIONS)}
                {selectField("occupationStatus", "Status", "Choose your status", OCCUPATION_TYPES)}
                {user.hasTopics && textField("askMeAbout", "Ask me about", "e.g. Blue Card, moving with kids, buying a flat", {
                  input: { maxLength: 300 },
                  help: "Up to 5 topics you can help with, separated by commas. Members can find you by them.",
                })}
                {textField("linkedinUrl", "LinkedIn profile", "linkedin.com/in/your-name", {
                  input: { inputMode: "url", autoCapitalize: "none", spellCheck: false },
                  help: user.verificationStatus === "approved" ? "Changing your LinkedIn sends your profile back for a quick review." : null,
                })}
                {profileErrors.form && <div role="alert" style={{ padding: "10px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, fontSize: 13, color: "#B91C1C", marginBottom: 12, fontFamily: font }}>{profileErrors.form}</div>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
                  <button type="button" onClick={() => setProfileModal(false)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer" }}>Cancel</button>
                  <button type="submit" disabled={profileSaving} style={{ ...btnPrimary, opacity: profileSaving ? 0.7 : 1 }}>{profileSaving ? "Saving..." : "Save Changes"}</button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Responsive CSS */}
      <style>{`
        * { box-sizing: border-box; margin: 0; }
        body { font-family: 'DM Sans', sans-serif; background: #FAFAF8; color: #37352F; }
        input:focus, select:focus, textarea:focus { border-color: #37352F !important; background: #fff !important; }
        button:hover { opacity: 0.92; }
        .sidebar-left, .sidebar-right { display: block; }
        .msg-back { display: none; }
        .desktop-nav { display: flex !important; }
        .mobile-menu-btn { display: none !important; }
        .mobile-nav { display: none !important; }

        @media (max-width: 900px) {
          .nav-grid { display: flex !important; justify-content: space-between !important; }
          .main-grid { grid-template-columns: minmax(0,1fr) !important; padding: 16px 12px 80px !important; }
          .sidebar-left, .sidebar-right { display: none !important; }
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
          .mobile-nav { display: flex !important; }
          .nav-messages-btn { display: none !important; }
          .docs-grid, .market-grid, .network-grid, .groups-grid { grid-template-columns: 1fr !important; }
          .members-grid { grid-template-columns: 1fr !important; }
        }

        @media (max-width: 600px) {
          /* Messages */
          .msg-layout { flex-direction: column !important; height: auto !important; min-height: 500px !important; }
          .msg-sidebar { width: 100% !important; border-right: none !important; overflow-y: auto !important; }
          .msg-layout:not(.has-convo) .msg-chat { display: none !important; }
          .msg-layout.has-convo .msg-sidebar { display: none !important; }
          .msg-layout.has-convo { height: calc(100dvh - 210px) !important; min-height: 0 !important; }
          .msg-back { display: block !important; }
          .msg-chat { min-height: 320px !important; }

          /* Event cards */
          .event-card { flex-direction: column !important; }
          .event-card > div:first-child { height: 160px !important; min-height: 0 !important; width: 100% !important; min-width: unset !important; border-radius: 12px 12px 0 0 !important; }
          .event-card-plain > div:first-child { height: 56px !important; }

          /* Notification dropdown */
          .notif-dropdown { position: fixed !important; top: 64px !important; left: 12px !important; right: 12px !important; width: auto !important; max-height: 70vh !important; overflow-y: auto !important; }

          /* Signup form grids */
          .form-grid-2, .form-grid-3 { grid-template-columns: 1fr !important; }

          /* Signup container */
          .signup-container { padding: 20px 16px !important; max-width: 100% !important; }

          /* All modals */
          .modal-overlay > div { max-width: calc(100vw - 24px) !important; max-height: 90vh !important; overflow-y: auto !important; margin: 12px !important; }

          /* Fix filter row wrapping */
          .filter-row { flex-wrap: wrap !important; gap: 8px !important; }

          /* Settings dropdown */
          .settings-dropdown { position: fixed !important; top: 64px !important; left: 12px !important; right: 12px !important; width: auto !important; }
          .settings-dropdown button { padding: 13px 18px !important; font-size: 14px !important; }

          /* Post composer */
          .post-actions { flex-wrap: wrap !important; }

          /* Home feed: posts start higher */
          .feed-subtitle { display: none !important; }

          /* Profile page */
          .profile-full { padding: 20px 16px !important; }

          /* Headings */
          h1 { font-size: 20px !important; }
          h2 { font-size: 18px !important; }

          /* Admin dashboard */
          .admin-stats { grid-template-columns: 1fr 1fr !important; }
          .admin-user-card .user-fields { grid-template-columns: 1fr 1fr !important; }

          /* Doc article mobile */
          .doc-article { border-radius: 0 !important; border-left: none !important; border-right: none !important; }
          .doc-body { padding: 20px 16px !important; }
          .doc-title { font-size: 20px !important; line-height: 1.35 !important; }
          .doc-guide { min-height: 160px !important; }
          .doc-body textarea { min-height: 50px !important; }
        }

        @media (max-width: 400px) {
          .form-grid-2, .form-grid-3 { grid-template-columns: 1fr !important; }
          .admin-stats { grid-template-columns: 1fr !important; }
          .admin-user-card .user-fields { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};

export { LoginPage };
export default Dashboard;
