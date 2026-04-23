import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import * as api from "./supabaseApi";


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
const sanitize = (str) => {
  if (typeof str !== "string") return str;
  return str.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/javascript:/gi, "").replace(/on\w+=/gi, "");
};

const isUserNRI = (userOrLocation) => {
  const loc = typeof userOrLocation === "string" ? userOrLocation : (userOrLocation?.location || userOrLocation?.currentCity || "");
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


function getDefaultEvents() {
  return [
    { id: "e1", title: "Holi Festival 2026", date: "Mar 25, 2026 • 10:00 AM", location: "Central Park, New York", attendees: 450, organizer: "NYC Desi Club", description: "Celebrate the festival of colors with fellow Indians in NYC!" },
    { id: "e2", title: "Networking Night: Tech", date: "Apr 10, 2026 • 6:00 PM", location: "WeWork, Berlin", attendees: 120, organizer: "Indian Professionals DE", description: "Connect with Indian tech professionals working in Germany." },
    { id: "e3", title: "Bollywood Movie Night", date: "Apr 15, 2026 • 7:00 PM", location: "Hoyts Cinema, Melbourne", attendees: 85, organizer: "Melbourne Desi Club", description: "Watch the latest Bollywood blockbuster together!" },
  ];
}

function getDefaultGroups() {
  return [
    { id: "g1", name: "Indians in Berlin", description: "The largest community of Indians living in Berlin.", members: 12500, category: "City", joined: false },
    { id: "g2", name: "Techies Abroad", description: "Indian IT professionals working globally. Share referrals and tech news.", members: 45000, category: "Professional", joined: false },
    { id: "g3", name: "Desi Students USA", description: "Support group for MS/PhD students in the United States.", members: 8900, category: "Support", joined: false },
    { id: "g4", name: "Global Indian Foodies", description: "Sharing recipes and restaurant finds from around the world.", members: 32000, category: "Interest", joined: false },
    { id: "g5", name: "Indians in London", description: "Community hub for Indians living in London and surrounding areas.", members: 28000, category: "City", joined: false },
    { id: "g6", name: "Indians in Toronto", description: "Connect with the vibrant Indian community in Toronto.", members: 19000, category: "City", joined: false },
  ];
}

function getDefaultPosts() {
  return [
    {
      id: "p1", userId: "demo", content: "Finally found a place in London that serves authentic Gujarati Thali! If anyone is missing home food, check out 'Rasoi' near Wembley. 🍛 #DesiFood #LondonEats",
      author: { name: "Priya Patel", profession: "Architect", location: "London, UK", hometown: "Ahmedabad, GJ" },
      likes: 243, comments: [], tags: ["Food", "Recommendation"], timestamp: Date.now() - 7200000,
      image: "https://picsum.photos/600/400?random=10",
    },
    {
      id: "p2", userId: "demo", content: "Help needed regarding PR process in Canada. Has anyone recently applied under the STEM category? I have questions about the documentation.",
      author: { name: "Rahul Verma", profession: "Student", location: "Toronto, Canada", hometown: "Delhi, DL" },
      likes: 56, comments: [], tags: ["Visa", "Canada"], timestamp: Date.now() - 18000000,
    },
    {
      id: "p3", userId: "demo", content: "Hosting a small Diwali get-together this weekend! Bring your own sparklers. DM for details!",
      author: { name: "Sneha Gupta", profession: "Product Manager", location: "San Francisco, USA", hometown: "Bangalore, KA" },
      likes: 189, comments: [], tags: ["Events", "Community"], timestamp: Date.now() - 86400000,
    },
  ];
}

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

// ============================================================================
// LANDING PAGE
// ============================================================================

// Exact SVG icons matching the screenshot
const LandingIcons = {
  // Globe icon for logo - filled dark square with globe outline
  logoGlobe: () => (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="6" fill="#37352F"/>
      <circle cx="14" cy="14" r="7" stroke="white" strokeWidth="1.5" fill="none"/>
      <ellipse cx="14" cy="14" rx="3.5" ry="7" stroke="white" strokeWidth="1.2" fill="none"/>
      <line x1="7" y1="14" x2="21" y2="14" stroke="white" strokeWidth="1.2"/>
    </svg>
  ),
  // Community Groups icon - two people outline, matching screenshot
  communityGroups: () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#37352F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87"/>
      <path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
  // Mentorship icon - graduation cap, matching screenshot (purple)
  mentorship: () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10l-10-5L2 10l10 5 10-5z"/>
      <path d="M6 12v5c0 0 3 3 6 3s6-3 6-3v-5"/>
    </svg>
  ),
  // Verified Events icon - shield with checkmark, matching screenshot (green)
  verifiedEvents: () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  ),
  // Arrow right for button
  arrowRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  ),
};

const LandingPage = ({ onJoin, onLogin }) => (
  <div style={{
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    padding: "0 1.5rem",
    background: "#ffffff",
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  }}>
    {/* Top Navigation */}
    <nav style={{
      width: "100%",
      maxWidth: 1200,
      padding: "24px 24px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <LandingIcons.logoGlobe />
        <span style={{
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "#37352F",
        }}>NRI<span style={{fontStyle:'italic',fontFamily:'"Times New Roman",serif'}}>Club</span></span>
      </div>
      <button
        onClick={onLogin}
        style={{
          fontSize: 14,
          fontWeight: 500,
          padding: "8px 4px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: "#37352F",
          letterSpacing: "-0.01em",
        }}
      >
        Log in
      </button>
    </nav>

    {/* Hero Section */}
    <div style={{
      maxWidth: 780,
      textAlign: "center",
      marginTop: "clamp(60px, 10vh, 120px)",
      padding: "0 1rem",
    }}>
      {/* Main Heading */}
      <h1 style={{
        fontSize: "clamp(36px, 5.5vw, 60px)",
        fontWeight: 700,
        lineHeight: 1.12,
        letterSpacing: "-0.03em",
        color: "#37352F",
        marginBottom: 0,
      }}>
        Connect with your roots,
      </h1>
      <h1 style={{
        fontSize: "clamp(36px, 5.5vw, 60px)",
        fontWeight: 700,
        lineHeight: 1.12,
        letterSpacing: "-0.03em",
        color: "#9B9A97",
        marginTop: 0,
        marginBottom: 32,
      }}>
        wherever you are.
      </h1>

      {/* Subtitle paragraph - exact copy from screenshot */}
      <p style={{
        fontSize: "clamp(15px, 1.8vw, 18px)",
        color: "#6B6B6B",
        lineHeight: 1.7,
        maxWidth: 620,
        margin: "0 auto 40px",
        fontWeight: 400,
      }}>
        Tired of scattered WhatsApp, Facebook, and Telegram groups? We are
        uniting the Indian diaspora on one dedicated platform. A space for Indians,
        by Indians—to find community, local events, and support for life abroad in
        one umbrella network.
      </p>

      {/* CTA Button */}
      <button
        onClick={onJoin}
        style={{
          background: "#37352F",
          color: "#ffffff",
          padding: "16px 40px",
          borderRadius: 8,
          fontSize: 17,
          fontWeight: 500,
          border: "none",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          letterSpacing: "-0.01em",
          transition: "background 0.15s",
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = "#2A2926")}
        onMouseOut={(e) => (e.currentTarget.style.background = "#37352F")}
      >
        Join the Community
        <LandingIcons.arrowRight />
      </button>

      {/* Sub-text under button */}
      <p style={{
        marginTop: 20,
        fontSize: 12,
        color: "#B0B0B0",
        fontWeight: 400,
        letterSpacing: "0.01em",
      }}>
        Free to join · 10,000+ Indians abroad
      </p>
    </div>

    {/* Feature Cards - exact 3 cards from screenshot */}
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      gap: 24,
      marginTop: "clamp(60px, 8vh, 100px)",
      maxWidth: 900,
      width: "100%",
      padding: "0 1rem 60px",
    }}>
      {/* Card 1: Community Groups */}
      <div style={{
        padding: "32px 28px",
        borderRadius: 12,
        border: "1px solid #E5E5E3",
        background: "#FAFAF9",
      }}>
        <div style={{ marginBottom: 20 }}>
          <LandingIcons.communityGroups />
        </div>
        <h3 style={{
          fontWeight: 600,
          fontSize: 18,
          marginBottom: 8,
          color: "#37352F",
          letterSpacing: "-0.02em",
        }}>
          Community Groups
        </h3>
        <p style={{
          fontSize: 14,
          color: "#8C8C8C",
          lineHeight: 1.55,
          fontWeight: 400,
        }}>
          Find your tribe based on your city, hometown, or profession.
        </p>
      </div>

      {/* Card 2: Mentorship */}
      <div style={{
        padding: "32px 28px",
        borderRadius: 12,
        border: "1px solid #E5E5E3",
        background: "#FAFAF9",
      }}>
        <div style={{ marginBottom: 20 }}>
          <LandingIcons.mentorship />
        </div>
        <h3 style={{
          fontWeight: 600,
          fontSize: 18,
          marginBottom: 8,
          color: "#37352F",
          letterSpacing: "-0.02em",
        }}>
          Mentorship
        </h3>
        <p style={{
          fontSize: 14,
          color: "#8C8C8C",
          lineHeight: 1.55,
          fontWeight: 400,
        }}>
          Get guidance from seniors in your field who have been there.
        </p>
      </div>

      {/* Card 3: Verified Events */}
      <div style={{
        padding: "32px 28px",
        borderRadius: 12,
        border: "1px solid #E5E5E3",
        background: "#FAFAF9",
      }}>
        <div style={{ marginBottom: 20 }}>
          <LandingIcons.verifiedEvents />
        </div>
        <h3 style={{
          fontWeight: 600,
          fontSize: 18,
          marginBottom: 8,
          color: "#37352F",
          letterSpacing: "-0.02em",
        }}>
          Verified Events
        </h3>
        <p style={{
          fontSize: 14,
          color: "#8C8C8C",
          lineHeight: 1.55,
          fontWeight: 400,
        }}>
          Discover festivals, meetups, and networking events near you.
        </p>
      </div>
    </div>
  </div>
);

// ============================================================================
// SIGN UP PAGE
// ============================================================================

// Small inline SVG icons for signup labels (matching screenshot exactly)
const SignUpIcons = {
  home: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  mapPin: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="10" r="3"/>
      <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 10-16 0c0 3 2.7 7 8 11.7z"/>
    </svg>
  ),
  briefcase: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
      <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
    </svg>
  ),
  linkedin: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z"/>
      <rect x="2" y="9" width="4" height="12"/>
      <circle cx="4" cy="4" r="2"/>
    </svg>
  ),
  info: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B7FD6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  ),
  globe: () => (
    <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="#F0EFED"/>
      <circle cx="20" cy="20" r="8" stroke="#37352F" strokeWidth="1.5" fill="none"/>
      <ellipse cx="20" cy="20" rx="4" ry="8" stroke="#37352F" strokeWidth="1.2" fill="none"/>
      <line x1="12" y1="20" x2="28" y2="20" stroke="#37352F" strokeWidth="1.2"/>
    </svg>
  ),
  arrowRight: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  ),
};

const SignUpPage = ({ onComplete, onLogin }) => {
  const [residencyStep, setResidencyStep] = useState(null); // null = show choice, 'abroad' | 'india'
  const [form, setForm] = useState({
    firstName: "", middleName: "", lastName: "", email: "",
    password: "", confirmPassword: "",
    location: "", hometown: "", profession: "",
    occupationStatus: "Working Professional", yearsAbroad: "", linkedinUrl: "",
    isNRI: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // OTP state
  const [otpStep, setOtpStep] = useState("form"); // "form" | "otp" | "complete"
  const [otpCode, setOtpCode] = useState(["", "", "", "", "", ""]);
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpTimer, setOtpTimer] = useState(0);
  const [otpSending, setOtpSending] = useState(false);
  const otpRefs = [useRef(null), useRef(null), useRef(null), useRef(null), useRef(null), useRef(null)];

  // GDPR consent state
  const [gdprConsent, setGdprConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const passwordsMatch = form.password && form.confirmPassword && form.password === form.confirmPassword;
  const passwordLongEnough = form.password.length >= 8;
  const valid = form.firstName && form.lastName && form.email && passwordLongEnough && passwordsMatch && form.location && form.hometown && form.profession && (residencyStep === "india" || form.yearsAbroad) && gdprConsent;

  // OTP timer countdown
  useEffect(() => {
    if (otpTimer > 0) {
      const t = setTimeout(() => setOtpTimer(otpTimer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [otpTimer]);

  const generateOtp = () => {
    return "";
  };

  const handleSendOtp = async () => {
    if (!form.email || !form.email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!valid) return;

    setOtpSending(true);
    setError("");

    try {
      const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ");
      
      // Step 1: Create user in Supabase
      try {
        const signUpResult = await api.signUp(form.email, form.password, {
          full_name: fullName, location: form.location,
          hometown: form.hometown, profession: form.profession,
        });
        // Double check: if signup returned but user already exists
        if (signUpResult?.user?.identities?.length === 0) {
          setError("An account with this email already exists. Please log in instead.");
          setOtpSending(false);
          return;
        }
      } catch (signUpErr) {
        const msg = (signUpErr.message || "").toLowerCase();
        if (msg.includes("already") || msg.includes("exists") || msg.includes("duplicate")) {
          setError("An account with this email already exists. Please log in instead.");
          setOtpSending(false);
          return;
        }
        // For other errors, throw to outer catch
        throw signUpErr;
      }

      // Step 2: Send OTP via Supabase
      try {
        await api.sendOtp(form.email);
      } catch (otpErr) {
        // OTP send failed - allow manual code entry
      }
      setGeneratedOtp("");

      setOtpStep("otp");
      setOtpTimer(60);
      setOtpCode(["", "", "", "", "", ""]);
      setOtpSending(false);

    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setOtpSending(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (value.length > 1) value = value[value.length - 1];
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otpCode];
    newOtp[index] = value;
    setOtpCode(newOtp);
    setOtpError("");

    // Auto-focus next input
    if (value && index < 5) {
      otpRefs[index + 1].current?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpCode[index] && index > 0) {
      otpRefs[index - 1].current?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const newOtp = pasted.split("");
      setOtpCode(newOtp);
      otpRefs[5].current?.focus();
    }
  };

  const handleVerifyOtp = async () => {
    const entered = otpCode.join("");
    if (entered.length !== 6) {
      setOtpError("Please enter the complete 6-digit code.");
      return;
    }

    setLoading(true);
    setOtpError("");

    try {
      // If we have a local OTP (sandbox mode), verify locally
      if (generatedOtp) {
        if (entered !== generatedOtp) {
          setOtpError("Invalid code. Please try again.");
          setLoading(false);
          return;
        }
        // Local verification passed
        const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ");
        const profile = {
          id: "user_" + Date.now(),
          name: fullName,
          email: form.email,
          password: form.password,
          location: form.location,
          hometown: form.hometown,
          profession: form.profession,
          occupationStatus: form.occupationStatus,
          yearsAbroad: form.yearsAbroad,
          linkedinUrl: form.linkedinUrl,
          emailVerified: true,
          gdprConsent: true,
          gdprConsentDate: new Date().toISOString(),
          marketingConsent: marketingConsent,
          isNRI: form.isNRI,
          createdAt: Date.now(),
        };
        localStorage.setItem("indin_profile_cache", JSON.stringify(profile));
        setLoading(false);
        onComplete(profile);
        return;
      }

      // Real Supabase verification
      try {
        let verifyData = await api.verifyOtp(form.email, entered);
        // If verify didn't return a token, try signing in with password
        if (!verifyData?.access_token) {
          try { verifyData = await api.signIn(form.email, form.password); } catch(si) {}
        }
        const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ");
        // Save ALL signup details to profile
        try {
          await api.updateProfile({
            name: fullName, location: form.location, hometown: form.hometown,
            profession: form.profession, occupation_status: form.occupationStatus,
            years_abroad: form.yearsAbroad, linkedin_url: form.linkedinUrl,
            email_verified: true, gdpr_consent: true, gdpr_consent_date: new Date().toISOString(),
            marketing_consent: marketingConsent,
          });
        } catch (ue) {
          // If updateProfile fails, try again after a short delay
          setTimeout(async () => {
            try { await api.updateProfile({ name: fullName, location: form.location, hometown: form.hometown, profession: form.profession, occupation_status: form.occupationStatus, years_abroad: form.yearsAbroad, linkedin_url: form.linkedinUrl }); } catch(e) {}
          }, 1000);
        }
        const profile = {
          id: verifyData?.user?.id || ("user_" + Date.now()),
          name: fullName, email: form.email, location: form.location,
          hometown: form.hometown, profession: form.profession,
          occupationStatus: form.occupationStatus, yearsAbroad: form.yearsAbroad,
          linkedinUrl: form.linkedinUrl, emailVerified: true,
          isNRI: form.isNRI, avatar_url: "",
        };
        localStorage.setItem("indin_profile_cache", JSON.stringify(profile));
        setLoading(false);
        onComplete(profile);
      } catch (verifyErr) {
        setOtpError(verifyErr.message || "Invalid or expired code.");
        setLoading(false);
      }

    } catch (err) {
      setOtpError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpTimer > 0) return;
    setOtpSending(true);
    setOtpError("");

    try {
      await api.sendOtp(form.email);
      setOtpTimer(60);
      setOtpCode(["", "", "", "", "", ""]);
    } catch {
      setOtpError("Failed to resend. Please try again.");
    }
    setOtpSending(false);
  };

  const font = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  const inputStyle = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 8,
    border: "1px solid #E0E0DE",
    fontSize: 15,
    background: "#fff",
    outline: "none",
    color: "#37352F",
    fontFamily: font,
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  };

  const labelStyle = {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    fontWeight: 700,
    color: "#5F5E5B",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 8,
    fontFamily: font,
  };

  // ---- RESIDENCY CHOICE SCREEN ----
  if (!residencyStep) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem", background: "#F7F7F5", fontFamily: font }}>
        <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#37352F", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "#fff" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "#37352F", marginBottom: 8 }}>Where do you live?</h2>
          <p style={{ fontSize: 14, color: "#9B9A97", marginBottom: 32 }}>This helps us personalize your experience on IndIn.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 320, margin: "0 auto" }}>
            <button onClick={() => { setResidencyStep("abroad"); update("isNRI", true); }} style={{ padding: "18px 24px", borderRadius: 12, border: "1px solid #E0E0DE", background: "#fff", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}
              onMouseOver={(e) => { e.currentTarget.style.borderColor = "#37352F"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
              onMouseOut={(e) => { e.currentTarget.style.borderColor = "#E0E0DE"; e.currentTarget.style.boxShadow = "none"; }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: "#E3FCEF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22A06B" strokeWidth="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#37352F" }}>I live outside India</div>
                  <div style={{ fontSize: 12, color: "#9B9A97", marginTop: 2 }}>NRI, student abroad, or recently moved</div>
                </div>
              </div>
            </button>
            <button onClick={() => { setResidencyStep("india"); update("isNRI", false); update("yearsAbroad", "Not lived abroad"); }} style={{ padding: "18px 24px", borderRadius: 12, border: "1px solid #E0E0DE", background: "#fff", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}
              onMouseOver={(e) => { e.currentTarget.style.borderColor = "#37352F"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
              onMouseOut={(e) => { e.currentTarget.style.borderColor = "#E0E0DE"; e.currentTarget.style.boxShadow = "none"; }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: "#FFF3E0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E65100" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#37352F" }}>I live in India</div>
                  <div style={{ fontSize: 12, color: "#9B9A97", marginTop: 2 }}>Connect with NRIs for advice & support</div>
                </div>
              </div>
            </button>
          </div>
          <p style={{ fontSize: 12, color: "#9B9A97", marginTop: 24 }}>Already have an account? <button onClick={onLogin} style={{ background: "none", border: "none", color: "#37352F", fontWeight: 600, cursor: "pointer", textDecoration: "underline", fontSize: 12 }}>Log in</button></p>
        </div>
      </div>
    );
  }

  // ---- OTP VERIFICATION SCREEN ----
  if (otpStep === "otp") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem", background: "#F7F7F5", fontFamily: font }}>
        <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
          <div style={{ marginBottom: 24, display: "inline-block" }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "#EDF4FF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5B9CFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/>
              </svg>
            </div>
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: "#37352F", marginBottom: 8 }}>Check your email</h2>
          <p style={{ fontSize: 14, color: "#9B9A97", marginBottom: 8, lineHeight: 1.6 }}>
            We sent a 6-digit verification code to<br />
            <strong style={{ color: "#37352F" }}>{form.email}</strong>
          </p>
          <p style={{ fontSize: 12, color: "#9B9A97", marginBottom: 24 }}>Check your inbox and spam folder for the 6-digit code.</p>

          {otpError && (
            <div style={{ padding: "10px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, marginBottom: 20, fontSize: 13, color: "#DC2626" }}>{otpError}</div>
          )}

          {/* OTP Input Boxes */}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 28 }}>
            {otpCode.map((digit, i) => (
              <input
                key={i}
                ref={otpRefs[i]}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                onPaste={i === 0 ? handleOtpPaste : undefined}
                style={{
                  width: 48, height: 56, borderRadius: 10,
                  border: digit ? "2px solid #37352F" : "1px solid #E0E0DE",
                  fontSize: 22, fontWeight: 700, textAlign: "center", outline: "none",
                  color: "#37352F", fontFamily: font, background: "#fff",
                  transition: "border-color 0.15s",
                }}
                autoFocus={i === 0}
              />
            ))}
          </div>

          {/* Verify Button */}
          <button
            onClick={handleVerifyOtp}
            disabled={otpCode.join("").length !== 6 || loading}
            style={{
              width: "100%", padding: "14px", borderRadius: 8, border: "none", fontSize: 15, fontWeight: 600,
              background: otpCode.join("").length === 6 ? "#37352F" : "#EDEDEB",
              color: otpCode.join("").length === 6 ? "#fff" : "#9B9A97",
              cursor: otpCode.join("").length === 6 ? "pointer" : "not-allowed",
              fontFamily: font, marginBottom: 20,
            }}
          >
            {loading ? "Verifying..." : "Verify & Create Account"}
          </button>

          {/* Resend */}
          <div style={{ fontSize: 13, color: "#9B9A97" }}>
            Didn't receive the code?{" "}
            {otpTimer > 0 ? (
              <span>Resend in <strong style={{ color: "#37352F" }}>{otpTimer}s</strong></span>
            ) : (
              <button onClick={handleResendOtp} disabled={otpSending} style={{ background: "none", border: "none", color: "#37352F", fontWeight: 600, cursor: "pointer", textDecoration: "underline", fontFamily: font, fontSize: 13 }}>
                {otpSending ? "Sending..." : "Resend Code"}
              </button>
            )}
          </div>

          {/* Back button */}
          <button
            onClick={() => { setOtpStep("form"); setOtpError(""); }}
            style={{ background: "none", border: "none", color: "#9B9A97", fontSize: 13, cursor: "pointer", marginTop: 20, fontFamily: font, display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            ← Back to form
          </button>
        </div>
      </div>
    );
  }

  // ---- MAIN FORM ----
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "48px 1rem 60px",
      background: "#F7F7F5",
      fontFamily: font,
    }}>
      <div style={{ maxWidth: 580, width: "100%" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ marginBottom: 20, display: "inline-block" }}>
            <SignUpIcons.globe />
          </div>
          <h2 style={{
            fontSize: 28,
            fontWeight: 700,
            color: "#37352F",
            letterSpacing: "-0.03em",
            marginBottom: 8,
          }}>Create your profile</h2>
          <p style={{
            color: "#9B9A97",
            fontSize: 15,
            fontWeight: 400,
          }}>Join the NRIClub network to start connecting.</p>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, marginBottom: 20, fontSize: 13, color: "#DC2626" }}>{error}</div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); handleSendOtp(); }}>

          {/* LEGAL NAME section */}
          <div style={{ marginBottom: 28 }}>
            <label style={{ ...labelStyle, marginBottom: 12 }}>
              LEGAL NAME
            </label>

            {/* Blue info banner */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 16px",
              background: "#EEF2FF",
              borderRadius: 8,
              marginBottom: 16,
              border: "1px solid #E0E7FF",
            }}>
              <div style={{ flexShrink: 0 }}>
                <SignUpIcons.info />
              </div>
              <p style={{
                fontSize: 13,
                color: "#4B5EAA",
                lineHeight: 1.45,
                margin: 0,
                fontWeight: 400,
              }}>
                Please provide your real name as it appears on your Indian or current nationality passport.
              </p>
            </div>

            {/* 3-column name fields */}
            <div className="form-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <input style={inputStyle} value={form.firstName} onChange={(e) => update("firstName", e.target.value)} placeholder="First Name" required />
              <input style={inputStyle} value={form.middleName} onChange={(e) => update("middleName", e.target.value)} placeholder="Middle (Optional)" />
              <input style={inputStyle} value={form.lastName} onChange={(e) => update("lastName", e.target.value)} placeholder="Last Name" required />
            </div>
          </div>

          {/* EMAIL */}
          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/>
              </svg>
              EMAIL ADDRESS
            </label>
            <input
              style={inputStyle}
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="you@email.com"
              required
            />
            <p style={{ fontSize: 11, color: "#9B9A97", marginTop: 6, fontFamily: font }}>
              A verification code will be sent to this email.
            </p>
          </div>

          {/* PASSWORD */}
          <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
            <div>
              <label style={labelStyle}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                PASSWORD
              </label>
              <div style={{ position: "relative" }}>
                <input
                  style={inputStyle}
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9B9A97", padding: 4 }}
                >
                  {showPassword ? Icons.eye({ size: 16 }) : Icons.eye({ size: 16 })}
                </button>
              </div>
              {form.password && form.password.length < 8 && (
                <p style={{ fontSize: 11, color: "#DC2626", marginTop: 5, fontFamily: font }}>Must be at least 8 characters</p>
              )}
              {form.password && form.password.length >= 8 && (
                <p style={{ fontSize: 11, color: "#22A06B", marginTop: 5, fontFamily: font, display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22A06B" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                  Strong enough
                </p>
              )}
            </div>
            <div>
              <label style={labelStyle}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                CONFIRM PASSWORD
              </label>
              <div style={{ position: "relative" }}>
                <input
                  style={{
                    ...inputStyle,
                    borderColor: form.confirmPassword ? (passwordsMatch ? "#22A06B" : "#DC2626") : "#E0E0DE",
                  }}
                  type={showConfirmPassword ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={(e) => update("confirmPassword", e.target.value)}
                  placeholder="Retype password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9B9A97", padding: 4 }}
                >
                  {showConfirmPassword ? Icons.eye({ size: 16 }) : Icons.eye({ size: 16 })}
                </button>
              </div>
              {form.confirmPassword && !passwordsMatch && (
                <p style={{ fontSize: 11, color: "#DC2626", marginTop: 5, fontFamily: font }}>Passwords do not match</p>
              )}
              {form.confirmPassword && passwordsMatch && (
                <p style={{ fontSize: 11, color: "#22A06B", marginTop: 5, fontFamily: font, display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22A06B" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                  Passwords match
                </p>
              )}
            </div>
          </div>

          {/* CURRENT CITY & HOMETOWN */}
          <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
            <div>
              <label style={labelStyle}><SignUpIcons.home /> CURRENT CITY</label>
              <input style={inputStyle} value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="Berlin, Germany" required />
            </div>
            <div>
              <label style={labelStyle}><SignUpIcons.mapPin /> HOMETOWN (INDIA)</label>
              <input style={inputStyle} value={form.hometown} onChange={(e) => update("hometown", e.target.value)} placeholder="Mumbai, MH" required />
            </div>
          </div>

          {/* CURRENT STATUS & LIVING ABROAD SINCE */}
          <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
            <div>
              <label style={labelStyle}>CURRENT STATUS</label>
              <div style={{ position: "relative" }}>
                <select style={{ ...inputStyle, cursor: "pointer", appearance: "none", paddingRight: 36 }} value={form.occupationStatus} onChange={(e) => update("occupationStatus", e.target.value)}>
                  {OCCUPATION_TYPES.map((o) => <option key={o}>{o}</option>)}
                </select>
                <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#9B9A97" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
              </div>
            </div>
            <div>
              <label style={labelStyle}>LIVING ABROAD SINCE?</label>
              <div style={{ position: "relative" }}>
                {residencyStep === "india" ? (
                  <div style={{ ...inputStyle, background: "#F0EFED", color: "#9B9A97", cursor: "not-allowed" }}>Not lived abroad</div>
                ) : (
                  <select style={{ ...inputStyle, cursor: "pointer", appearance: "none", paddingRight: 36, color: form.yearsAbroad ? "#37352F" : "#9B9A97" }} value={form.yearsAbroad} onChange={(e) => update("yearsAbroad", e.target.value)} required>
                    <option value="" disabled>Select duration</option>
                    {YEARS_OPTIONS.map((y) => <option key={y}>{y}</option>)}
                  </select>
                )}
                {residencyStep !== "india" && <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#9B9A97" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                </div>}
              </div>
            </div>
          </div>

          {/* JOB TITLE / INDUSTRY */}
          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>
              <SignUpIcons.briefcase />
              {form.occupationStatus === "Student" ? "MAJOR / UNIVERSITY" : "JOB TITLE / INDUSTRY"}
            </label>
            <input style={inputStyle} value={form.profession} onChange={(e) => update("profession", e.target.value)} placeholder={form.occupationStatus === "Student" ? "e.g. Computer Science, TU Munich" : "e.g. Software Engineer"} required />
          </div>

          {/* LINKEDIN PROFILE */}
          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>
              <SignUpIcons.linkedin /> LINKEDIN PROFILE (REQUIRED FOR VERIFICATION)
            </label>
            <input style={inputStyle} value={form.linkedinUrl} onChange={(e) => update("linkedinUrl", e.target.value)} placeholder="https://linkedin.com/in/..." required />
          </div>

          {/* GDPR CONSENT SECTION */}
          <div style={{
            padding: "20px", borderRadius: 10, border: "1px solid #E0E0DE",
            background: "#FAFAF8", marginBottom: 28,
          }}>
            <h4 style={{ fontSize: 12, fontWeight: 700, color: "#37352F", marginBottom: 14, fontFamily: font, display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Data Protection & Privacy
            </h4>

            {/* Required consent */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginBottom: 14 }}>
              <input
                type="checkbox"
                checked={gdprConsent}
                onChange={(e) => setGdprConsent(e.target.checked)}
                style={{ marginTop: 3, accentColor: "#37352F", width: 16, height: 16, flexShrink: 0 }}
              />
              <span style={{ fontSize: 13, color: "#37352F", lineHeight: 1.5, fontFamily: font }}>
                I agree to the{" "}
                <button type="button" onClick={() => setPrivacyModalOpen(true)} style={{ background: "none", border: "none", color: "#5B7FD6", cursor: "pointer", textDecoration: "underline", fontFamily: font, fontSize: 13, padding: 0 }}>
                  Privacy Policy
                </button>
                {" "}and{" "}
                <button type="button" onClick={() => setPrivacyModalOpen(true)} style={{ background: "none", border: "none", color: "#5B7FD6", cursor: "pointer", textDecoration: "underline", fontFamily: font, fontSize: 13, padding: 0 }}>
                  Terms of Service
                </button>
                . I consent to the processing of my personal data as described.
                <span style={{ color: "#DC2626" }}> *</span>
              </span>
            </label>

            {/* Optional marketing consent */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                style={{ marginTop: 3, accentColor: "#37352F", width: 16, height: 16, flexShrink: 0 }}
              />
              <span style={{ fontSize: 13, color: "#5F5E5B", lineHeight: 1.5, fontFamily: font }}>
                I'd like to receive community updates, event notifications, and tips for life abroad via email. <span style={{ color: "#9B9A97" }}>(Optional)</span>
              </span>
            </label>
          </div>

          {/* GDPR info note */}
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px",
            background: "#F0EFED", borderRadius: 8, marginBottom: 28, fontSize: 11, color: "#5F5E5B", lineHeight: 1.55, fontFamily: font,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9A97" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span>
              Your data is stored securely and processed in accordance with GDPR. You can request data export or deletion at any time from your account settings. We never sell your personal data to third parties.
            </span>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={!valid || otpSending}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 8,
              border: "none",
              fontSize: 15,
              fontWeight: 600,
              background: valid ? "#37352F" : "#EDEDEB",
              color: valid ? "#fff" : "#9B9A97",
              cursor: valid ? "pointer" : "not-allowed",
              fontFamily: font,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "background 0.15s",
            }}
          >
            {otpSending ? "Sending verification code..." : "Continue — Verify Email"}
            {!otpSending && <SignUpIcons.arrowRight />}
          </button>
        </form>

        {/* Bottom link */}
        <p style={{ textAlign: "center", marginTop: 28, fontSize: 13, color: "#9B9A97", fontWeight: 400 }}>
          <button onClick={onLogin} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3, fontFamily: font, fontSize: 13, fontWeight: 400 }}>
            Already have an account? Log in
          </button>
        </p>
      </div>

      {/* Privacy Policy Modal */}
      {privacyModalOpen && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setPrivacyModalOpen(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Privacy Policy & Terms</h3>
              <button onClick={() => setPrivacyModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97", padding: 4 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ padding: 24, fontSize: 13, color: "#5F5E5B", lineHeight: 1.7, fontFamily: font }}>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: "#37352F", marginBottom: 8 }}>1. Data We Collect</h4>
              <p style={{ marginBottom: 16 }}>We collect the personal information you provide during registration: your name, email, location, hometown, profession, LinkedIn URL, and occupation status. We also collect usage data such as posts, comments, and interactions within the platform.</p>

              <h4 style={{ fontSize: 15, fontWeight: 700, color: "#37352F", marginBottom: 8 }}>2. How We Use Your Data</h4>
              <p style={{ marginBottom: 16 }}>Your data is used to: provide and personalize the NRIClub service, connect you with relevant community members, send essential service notifications, and (with your consent) send marketing communications.</p>

              <h4 style={{ fontSize: 15, fontWeight: 700, color: "#37352F", marginBottom: 8 }}>3. Legal Basis (GDPR Art. 6)</h4>
              <p style={{ marginBottom: 16 }}>We process your data based on: your explicit consent (Art. 6(1)(a)), performance of our service contract (Art. 6(1)(b)), and our legitimate interest in operating the platform (Art. 6(1)(f)).</p>

              <h4 style={{ fontSize: 15, fontWeight: 700, color: "#37352F", marginBottom: 8 }}>4. Your Rights</h4>
              <p style={{ marginBottom: 16 }}>Under GDPR, you have the right to: access your personal data, rectify inaccurate data, request erasure ("right to be forgotten"), restrict processing, data portability (export your data), object to processing, and withdraw consent at any time. You can exercise these rights from your Account Settings.</p>

              <h4 style={{ fontSize: 15, fontWeight: 700, color: "#37352F", marginBottom: 8 }}>5. Data Retention</h4>
              <p style={{ marginBottom: 16 }}>We retain your data for as long as your account is active. Upon account deletion, all personal data is permanently erased within 30 days.</p>

              <h4 style={{ fontSize: 15, fontWeight: 700, color: "#37352F", marginBottom: 8 }}>6. Data Sharing</h4>
              <p style={{ marginBottom: 16 }}>We do not sell your personal data. Data is only shared with essential service providers (email delivery, hosting) under data processing agreements compliant with GDPR.</p>

              <h4 style={{ fontSize: 15, fontWeight: 700, color: "#37352F", marginBottom: 8 }}>7. Contact</h4>
              <p>For any data protection inquiries, contact our Data Protection Officer at privacy@indin.com.</p>

              <p style={{ marginTop: 20, fontSize: 11, color: "#9B9A97", fontStyle: "italic" }}>Last updated: April 2026</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// LOGIN PAGE
// ============================================================================
const LoginPage = ({ onComplete, onSignUp }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data = await api.signIn(email, password);
      const dbProfile = await api.getMyProfile();
      if (dbProfile) {
        const profile = {
          id: dbProfile.id, name: dbProfile.name, email: dbProfile.email || email,
          location: dbProfile.location, hometown: dbProfile.hometown,
          profession: dbProfile.profession, occupationStatus: dbProfile.occupation_status,
          yearsAbroad: dbProfile.years_abroad, linkedinUrl: dbProfile.linkedin_url,
          emailVerified: dbProfile.email_verified,
          linkedin_verified: dbProfile.linkedin_verified || false, avatar_url: dbProfile.avatar_url || "", status: dbProfile.status || "active",
          isNRI: dbProfile.years_abroad && dbProfile.years_abroad !== "Not lived abroad",
        };
        localStorage.setItem("indin_profile_cache", JSON.stringify(profile));
        setLoading(false);
        onComplete(profile);
        return;
      }
      const user = data?.user || {};
      const profile = {
        id: user.id || "user_" + Date.now(),
        name: user.user_metadata?.full_name || email.split("@")[0],
        email, location: "", hometown: "", profession: "",
        occupationStatus: "Working Professional", emailVerified: !!user.email_confirmed_at,
      };
      localStorage.setItem("indin_profile_cache", JSON.stringify(profile));
      setLoading(false);
      onComplete(profile);
    } catch (err) {
      const cached = JSON.parse(localStorage.getItem("indin_profile_cache") || "null");
      if (cached && cached.email === email) {
        setLoading(false);
        onComplete(cached);
        return;
      }
      setError(err.message || "Invalid email or password.");
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E0E0DE",
    fontSize: 14, background: "#FAFAF8", outline: "none", color: "#37352F",
    fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", background: "#FAFAF8" }}>
      <div style={{ maxWidth: 360, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ width: 48, height: 48, background: "#F0EFED", borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            {Icons.globe({ size: 24, stroke: "#37352F" })}
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#37352F", fontFamily: "'DM Sans', sans-serif" }}>Welcome back</h2>
          <p style={{ color: "#9B9A97", fontSize: 14, marginTop: 8, fontFamily: "'DM Sans', sans-serif" }}>Log in to NRIClub</p>
        </div>

        {error && <div style={{ padding: "12px 16px", background: "#FEE", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#C00" }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>Email</label>
            <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required autoFocus />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>Password</label>
            <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <button
            type="submit" disabled={!email || !password || loading}
            style={{
              width: "100%", padding: "12px", borderRadius: 8, border: "none", fontSize: 15, fontWeight: 600,
              background: email && password ? "#37352F" : "#E8E7E4", color: email && password ? "#fff" : "#9B9A97",
              cursor: email && password ? "pointer" : "not-allowed", fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {loading ? "Logging in..." : "Continue"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "#9B9A97", fontFamily: "'DM Sans', sans-serif" }}>
          Don't have an account?{" "}
          <button onClick={onSignUp} style={{ background: "none", border: "none", color: "#37352F", fontWeight: 600, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
};

// ============================================================================
// POST CARD
// ============================================================================
const PostCard = ({ post, user, onDelete, onLike, onReport, isReported, initialLiked }) => {
  const [liked, setLiked] = useState(initialLiked || false);
  const [likeCount, setLikeCount] = useState(post.likes || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState(post.comments || []);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const isOwner = user && post.userId === user.id;

  const toggleComments = async () => {
    const newShow = !showComments;
    setShowComments(newShow);
    if (newShow && !commentsLoaded) {
      setCommentsLoaded(true);
      try {
        const dbComments = await api.getComments(post.id);
        if (dbComments && dbComments.length) {
          setComments(dbComments.map(c => ({ id: c.id, user: c.profiles?.name || "User", text: c.content, time: new Date(c.created_at).getTime() })));
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
    const c = { id: Date.now(), user: user?.name || "You", text: newComment, time: Date.now() };
    setComments([c, ...comments]);
    const commentText = newComment;
    setNewComment("");
    try {
      await api.addComment(post.id, commentText);
      if (post.userId && post.userId !== user?.id) {
        const actorId = user?.id && !user.id.startsWith("user_") ? user.id : null;
        try { await api.createNotification(post.userId, "comment", `${user?.name || "Someone"} commented: "${commentText.substring(0, 30)}..."`, actorId, post.id); } catch(ne) {}
      }
    } catch (e) {}
  };

  const author = post.author || {};
  const cardStyle = {
    background: "#fff", borderRadius: 12, border: "1px solid #E8E7E4",
    padding: 20, marginBottom: 16, transition: "box-shadow 0.15s",
    fontFamily: "'DM Sans', sans-serif",
  };

  return (
    <div data-post-id={post.id} style={{ ...cardStyle, position: "relative", opacity: isReported ? 0.4 : 1 }}>
      {isReported && <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.6)", borderRadius: 14, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}><span style={{ background: "#FEF2F2", color: "#DC2626", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>Reported — Under Review</span></div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Avatar name={author.name || "User"} size={40} url={author.avatar_url} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: "#37352F" }}>{author.name}</div>
            <div style={{ fontSize: 12, color: "#9B9A97", marginTop: 2 }}>
              {author.profession} • {author.location}
            </div>
            <div style={{ fontSize: 11, color: "#9B9A97", marginTop: 1 }}>From: {author.hometown}</div>
            {post.groupName && (
              <div style={{ fontSize: 10, color: "#5B9CFF", marginTop: 3, display: "flex", alignItems: "center", gap: 3, fontWeight: 600 }}>
                {Icons.users({ size: 10, stroke: "#5B9CFF" })} Posted in {post.groupName}
              </div>
            )}
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowMenu(!showMenu)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9B9A97" }}>
            {Icons.dots({ size: 16 })}
          </button>
          {showMenu && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setShowMenu(false)} />
              <div style={{ position: "absolute", right: 0, top: "100%", background: "#fff", border: "1px solid #E8E7E4", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", zIndex: 20, minWidth: 120, overflow: "hidden" }}>
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

      <p style={{ fontSize: 14, lineHeight: 1.65, color: "#37352F", marginBottom: 12, whiteSpace: "pre-wrap" }}>{post.externalUrl ? post.content.replace(post.externalUrl, "").trim() : post.content}</p>

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
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "block", marginBottom: 12, borderRadius: 12, overflow: "hidden", border: "1px solid #E8E7E4", textDecoration: "none", cursor: "pointer", transition: "box-shadow 0.15s" }} onMouseOver={(e) => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"} onMouseOut={(e) => e.currentTarget.style.boxShadow = "none"}>
            <div style={{ height: 110, background: p.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44 }}>
              <span>{p.emoji}</span>
            </div>
            <div style={{ padding: "12px 14px", background: "#fff" }}>
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

      {post.tags?.filter(t => t !== "__external__").length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {post.tags.filter(t => t !== "__external__").map((t) => (
            <span key={t} style={{ fontSize: 11, background: "#F0EFED", color: "#5F5E5B", padding: "3px 8px", borderRadius: 4, fontWeight: 500 }}>
              #{t}
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: "#9B9A97", marginBottom: 12 }}>{timeAgo(post.timestamp)}</div>

      <div style={{ display: "flex", gap: 20, paddingTop: 12, borderTop: "1px solid #F0EFED" }}>
        <button onClick={handleLike} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: liked ? "#E25555" : "#9B9A97", fontSize: 13, fontWeight: 500 }}>
          {Icons.heart({ size: 16, fill: liked ? "#E25555" : "none", stroke: liked ? "#E25555" : "currentColor" })} {likeCount}
        </button>
        <button onClick={toggleComments} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#9B9A97", fontSize: 13, fontWeight: 500 }}>
          {Icons.message({ size: 16 })} {comments.length || post.commentsCount || 0}
        </button>
      </div>

      {showComments && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #F0EFED" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              value={newComment} onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addComment()}
              placeholder="Write a comment..."
              style={{ flex: 1, padding: "8px 14px", borderRadius: 20, border: "1px solid #E8E7E4", fontSize: 13, background: "#FAFAF8", outline: "none", fontFamily: "'DM Sans', sans-serif" }}
            />
            <button onClick={addComment} disabled={!newComment.trim()} style={{ padding: "8px", borderRadius: "50%", background: newComment.trim() ? "#37352F" : "#E8E7E4", border: "none", cursor: newComment.trim() ? "pointer" : "default", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {Icons.send({ size: 14 })}
            </button>
          </div>
          {comments.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <Avatar name={c.user} size={28} />
              <div style={{ flex: 1, background: "#F7F7F5", padding: "8px 12px", borderRadius: "0 10px 10px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#37352F" }}>{c.user}</span>
                  <span style={{ fontSize: 10, color: "#9B9A97" }}>{timeAgo(c.time)}</span>
                </div>
                <p style={{ fontSize: 13, color: "#5F5E5B", margin: 0 }}>{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// DASHBOARD
// ============================================================================
// Blocked Users Modal Component
const BlockedUsersModal = ({ onClose, font }) => {
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
          <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Blocked Users</h3>
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
              }} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #E0E0DE", background: "#fff", color: "#5F5E5B", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Unblock</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Dashboard = ({ user, onLogout }) => {
  const [view, setView] = useState("home");
  const [posts, setPosts] = useState([]);
  const [likedPostIds, setLikedPostIds] = useState(new Set());
  const [events, setEvents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [connections, setConnections] = useState([]);
  const [myFollowers, setMyFollowers] = useState([]);
  const [myFollowing, setMyFollowing] = useState([]);
  const [followModal, setFollowModal] = useState(null);
  const [profilePreview, setProfilePreview] = useState(null);
  const [acceptedConnections, setAcceptedConnections] = useState(new Set());
  const [newPost, setNewPost] = useState("");
  const [createPostDropdown, setCreatePostDropdown] = useState(false);
  const [createPostModal, setCreatePostModal] = useState(null); // "text" | "photo" | "link"
  const [postImage, setPostImage] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [rsvps, setRsvps] = useState(new Set());
  const [profileTab, setProfileTab] = useState("posts");
  const [chatTab, setChatTab] = useState("personal"); // 'personal' | 'marketplace'
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [eventLikes, setEventLikes] = useState({}); // {eventId: boolean}
  const [eventComment, setEventComment] = useState("");
  const [eventComments, setEventComments] = useState({}); // {eventId: [{user, text, time}]}
  const [eventModal, setEventModal] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: "", date: "", time: "", location: "", city: "", description: "", link: "" });
  const [eventPhoto, setEventPhoto] = useState(null); // { url, preview }
  const [helpRequests, setHelpRequests] = useState([]);
  const [linkedinBannerDismissed, setLinkedinBannerDismissed] = useState(false);
  const [linkedinReviewBannerDismissed, setLinkedinReviewBannerDismissed] = useState(false);

  // Check if profile is incomplete (no LinkedIn) and older than 72 hours
  const profileAge = user?.createdAt ? (Date.now() - user.createdAt) : (user?.created_at ? (Date.now() - new Date(user.created_at).getTime()) : 0);
  const hoursOld = profileAge / (1000 * 60 * 60);
  const hasLinkedin = user?.linkedinUrl && user.linkedinUrl.trim().length > 5;
  const isBlocked = !hasLinkedin && hoursOld > 72;
  const [helpModal, setHelpModal] = useState(false);
  const [selectedHelp, setSelectedHelp] = useState(null);
  const [helpResponse, setHelpResponse] = useState("");
  const [helpResponses, setHelpResponses] = useState({});
  const [newHelp, setNewHelp] = useState({ title: "", description: "", category: "General", urgency: "Low" });
  const [profileModal, setProfileModal] = useState(false);
  const [editProfile, setEditProfile] = useState({ ...user });
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [feedSort, setFeedSort] = useState("new");
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const [groupTab, setGroupTab] = useState("all");
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupRequestModal, setGroupRequestModal] = useState(false);
  const [newGroupCity, setNewGroupCity] = useState("");
  const [communityTab, setCommunityTab] = useState("feed");
  const [eventViewMode, setEventViewMode] = useState("all");
  const [eventSearch, setEventSearch] = useState("");
  const [eventCityFilter, setEventCityFilter] = useState("All");
  // Messages state
  const [selectedConvo, setSelectedConvo] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState({});
  const [convos, setConvos] = useState([]);
  const [convosLoaded, setConvosLoaded] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const lastSeenMsgRef = useRef(null); // Track last seen conversation state
  const [chatSettings, setChatSettings] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockTargetId, setBlockTargetId] = useState(null);
  const [blockedIds, setBlockedIds] = useState(new Set());
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  // Notification & Settings state
  const [notifOpen, setNotifOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsModal, setSettingsModal] = useState(null); // 'account'|'privacy'|'notifications'|'activity'|'helpCenter'|'terms'
  const [notifications, setNotifications] = useState([]);
  const [privSettings, setPrivSettings] = useState({ visibility: "Everyone", onlineStatus: true, namasteRequests: "Everyone", receiveMessages: "Everyone" });
  const [privSettingsLoaded, setPrivSettingsLoaded] = useState(false);
  const [notifSettings, setNotifSettings] = useState({ email: true, push: true, marketing: false });
  const [accountName, setAccountName] = useState(user.name);
  // Filter modal state
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [feedFilters, setFeedFilters] = useState({ hometown: "", occupation: "All", yearsAbroad: "All", community: "All" });
  const [feedPostType, setFeedPostType] = useState("all"); // 'all' | 'posts' | 'links'
  const [linkModal, setLinkModal] = useState(false);
  const [externalLinkInput, setExternalLinkInput] = useState("");
  const [externalLinkNote, setExternalLinkNote] = useState("");
  // Docs state
  const [docModal, setDocModal] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: "", city: "", category: "General", excerpt: "" });
  const MOCK_DOCS = [];
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
  const MOCK_MARKET = [];
  const [marketItems, setMarketItems] = useState([]);
  // Help state with pre-populated data
  const MOCK_HELP = [];

  // Initialize help requests on mount
  useEffect(() => {}, []);
  const [networkSearch, setNetworkSearch] = useState("");
  const [networkCityFilter, setNetworkCityFilter] = useState("All");
  const [networkHometownFilter, setNetworkHometownFilter] = useState("All");
  const [networkNearby, setNetworkNearby] = useState(false);
  const [sentNamaste, setSentNamaste] = useState(new Set());

  // Network users loaded from DB
  const [networkUsers, setNetworkUsers] = useState([]);
  const [networkLoaded, setNetworkLoaded] = useState(false);

  const isNetworkFilterActive = networkSearch.trim() !== "" || networkCityFilter !== "All" || networkHometownFilter !== "All" || networkNearby;

  const filteredNetworkUsers = networkUsers.filter((u) => {
    if (u.id === user.id) return false;
    if (blockedIds.has(u.id)) return false;
    const matchesSearch = networkSearch === "" ||
      u.name.toLowerCase().includes(networkSearch.toLowerCase()) ||
      u.profession.toLowerCase().includes(networkSearch.toLowerCase());
    const matchesCity = networkCityFilter === "All" || u.location.includes(networkCityFilter);
    const matchesHometown = networkHometownFilter === "All" || u.hometown.includes(networkHometownFilter);
    const matchesNearby = !networkNearby || u.location.split(",")[0] === (user.location || "").split(",")[0];
    return matchesSearch && matchesCity && matchesHometown && matchesNearby;
  });

  const clearNetworkFilters = () => {
    setNetworkSearch("");
    setNetworkCityFilter("All");
    setNetworkHometownFilter("All");
    setNetworkNearby(false);
  };

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
    try {
      const actorId = user.id && !user.id.startsWith("user_") ? user.id : null;
      await api.createNotification(userId, "request", `${user.name} sent you a Namaste request`, actorId, connId);
    } catch(ne) { console.log("Notification failed:", ne.message); }
  };

  const handleUnfollow = async (userId) => {
    try {
      await api.unfollowUser(userId);
      setAcceptedConnections(prev => { const s = new Set(prev); s.delete(userId); return s; });
      setMyFollowing(prev => prev.filter(id => id !== userId));
    } catch(e) { console.error("Unfollow failed:", e); }
  };

  // Load data on mount
  useEffect(() => {
    (async () => {
      try {
        const dbPosts = await api.getPosts();
        const dbGroups = await api.getGroups();
        let loadedGroups = [];
        if (dbGroups && dbGroups.length) {
          const myGids = await api.getMyGroupIds();
          loadedGroups = dbGroups.map(g => ({ id: g.id, name: g.name, description: g.description, members: g.members_count, category: g.category, joined: myGids.includes(g.id) }));
          setGroups(loadedGroups);
        } else { setGroups([]); }
        if (dbPosts && dbPosts.length) {
          setPosts(dbPosts.map(p => {
            const urlMatch = (p.content || "").match(/https?:\/\/[^\s]+/i);
            return {
              id: p.id, userId: p.user_id, content: p.content, image: p.image_url,
              tags: p.tags || [], likes: p.likes_count || 0, commentsCount: p.comments_count || 0, comments: [],
              timestamp: new Date(p.created_at).getTime(),
              groupName: p.group_id ? (loadedGroups.find(g => g.id === p.group_id)?.name || null) : null,
              groupId: p.group_id || null,
              author: p.profiles ? { name: p.profiles.name, profession: p.profiles.profession, location: p.profiles.location, hometown: p.profiles.hometown, avatar_url: p.profiles.avatar_url || "" } : { name: "User" },
              externalUrl: urlMatch ? urlMatch[0] : null,
            };
          }));
        } else { setPosts([]); }
        // Load which posts this user has liked
        try {
          const myLikes = await api.getUserLikes();
          if (myLikes && myLikes.length) setLikedPostIds(new Set(myLikes.map(l => l.post_id)));
        } catch(e) {}
        // Load IDs the user has reported
        try {
          const myReports = await api.getMyReports();
          if (myReports && myReports.length) setReportedIds(new Set(myReports.filter(r => r.reported_post_id).map(r => r.reported_post_id)));
        } catch(e) {}
        const dbEvents = await api.getEvents();
        if (dbEvents && dbEvents.length) {
          setEvents(dbEvents.map(e => ({ id: e.id, organizerId: e.organizer_id, title: e.title, date: e.date, time: e.time, location: e.location, attendees: e.attendees_count, organizer: e.organizer_name, description: e.description, link: e.link || "", image: e.image_url || "" })));
          const myR = await api.getMyRsvps();
          setRsvps(new Set(myR));
        } else { setEvents([]); }

        // Load help requests
        try {
          const dbHelp = await api.getHelpRequests();
          if (dbHelp && dbHelp.length) {
            setHelpRequests(dbHelp.map(h => ({ id: h.id, userId: h.user_id, title: h.title, description: h.description, category: h.category, urgency: h.urgency, status: h.status, user: h.profiles?.name || "User", timestamp: new Date(h.created_at).getTime(), responses: h.responses_count || 0 })));
            // Fix response counts by fetching actual counts
            try {
              const allResponses = await api.getHelpResponses(null);
              if (allResponses && allResponses.length) {
                const counts = {};
                allResponses.forEach(r => { counts[r.request_id] = (counts[r.request_id] || 0) + 1; });
                setHelpRequests(prev => prev.map(h => ({ ...h, responses: counts[h.id] || 0 })));
              }
            } catch(e) {}
          }
        } catch (e) {}

        // Load connections (followers/following) and sent namastes
        try {
          const dbConns = await api.getMyConnections();
          if (dbConns && dbConns.length) {
            const followers = dbConns.filter(c => c.recipient?.id === user.id || c.recipient_id === user.id).map(c => c.requester || { name: "User" }).filter(Boolean);
            const following = dbConns.filter(c => c.requester?.id === user.id || c.requester_id === user.id).map(c => c.recipient || { name: "User" }).filter(Boolean);
            setMyFollowers(followers);
            setMyFollowing(following);
          }
          // Load sent namastes so buttons show "Sent" after refresh
          const sentData = await api.getSentNamastes();
          if (sentData && sentData.length) {
            setSentNamaste(new Set(sentData.map(s => s.recipient_id)));
          }
          // Load accepted connections to show "Following" instead of "Sent"
          // "Following" = I sent the request AND they accepted
          const acceptedData = await api.getMyConnections();
          if (acceptedData && acceptedData.length) {
            const iFollowThem = new Set();
            const theyFollowMe = new Set();
            acceptedData.forEach(c => {
              if (c.requester_id === user.id) {
                // I sent the request → I follow them
                if (c.recipient?.id) iFollowThem.add(c.recipient.id);
              } else {
                // They sent the request → they follow me
                if (c.requester?.id) theyFollowMe.add(c.requester.id);
              }
            });
            setAcceptedConnections(iFollowThem);
            setMyFollowing(Array.from(iFollowThem));
          }
        } catch (e) {}

        // Load docs
        try {
          const dbDocs = await api.getDocs();
          if (dbDocs && dbDocs.length) {
            setDocs(dbDocs.map(d => ({ id: d.id, userId: d.user_id, title: d.title, excerpt: d.excerpt, content: d.content || d.excerpt, category: d.category, readTime: d.read_time, author: d.profiles?.name || "User", profession: d.profiles?.profession || "", authorLocation: d.profiles?.location || "", city: d.city, likes: d.likes_count || 0, timestamp: new Date(d.created_at).toLocaleDateString(), comments: [] })));
          }
        } catch (e) {}

        // Load blocked users
        try {
          const blocked = await api.getBlockedUsers();
          if (blocked && blocked.length) {
            setBlockedIds(new Set(blocked.map(b => b.blocked_id)));
          }
        } catch(e) {}

        // Load user settings from DB
        try {
          const dbSettings = await api.getUserSettings();
          if (dbSettings) {
            setPrivSettings({
              visibility: dbSettings.profile_visibility || "Everyone",
              onlineStatus: dbSettings.online_status !== false,
              namasteRequests: dbSettings.namaste_requests || "Everyone",
              receiveMessages: dbSettings.receive_messages || "Everyone",
            });
            setNotifSettings({
              email: dbSettings.email_notifications !== false,
              push: dbSettings.push_notifications !== false,
              marketing: dbSettings.marketing_emails === true,
            });
            setPrivSettingsLoaded(true);
          }
        } catch (e) {}

        // Load notifications
        try {
          const dbNotifs = await api.getNotifications();
          if (dbNotifs && dbNotifs.length) {
            setNotifications(dbNotifs.map(n => ({
              id: n.id, type: n.type, actor: n.actor?.name || null, actor_id: n.actor?.id || n.actor_id || null,
              text: n.text, time: new Date(n.created_at).toLocaleString(),
              read: n.read, reference_id: n.reference_id,
            })));
          }
        } catch (e) {}

        // Load marketplace
        try {
          const dbMarket = await api.getMarketItems();
          if (dbMarket && dbMarket.length) {
            setMarketItems(dbMarket.map(m => {
              let photos = [];
              try { photos = JSON.parse(m.image_url || "[]"); } catch(e) { if (m.image_url) photos = [m.image_url]; }
              return { id: m.id, user_id: m.user_id, title: m.title, description: m.description, price: m.price, category: m.category, location: m.location, seller: m.profiles?.name || "User", date: new Date(m.created_at).toLocaleDateString(), photos, color: ["#2D1B4E","#1B3A4E","#3A2E1B","#1B4E3A"][Math.floor(Math.random()*4)] };
            }));
          }
        } catch (e) {}
      } catch (err) {
        console.log("Falling back to defaults:", err.message);
        setPosts([]); setGroups([]); setEvents([]);
      }
    })();
  }, []);

  // Live polling for messages and notifications (every 5 seconds)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        // Poll for new conversations/messages
        const dbConvos = await api.getConversations();
        if (dbConvos && dbConvos.length) {
          const newConvos = dbConvos.map(c => ({
            id: c.id, name: c.otherUser?.name || "User", otherUserId: c.otherUser?.id,
            lastMsg: c.last_message_text || "", time: c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "",
            unread: false,
          }));
          setConvos(prev => {
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
        // Poll for new notifications
        const dbNotifs = await api.getNotifications();
        if (dbNotifs && dbNotifs.length) {
          setNotifications(dbNotifs.map(n => ({
            id: n.id, type: n.type, actor: n.actor?.name || null, actor_id: n.actor?.id || n.actor_id || null,
            text: n.text, time: new Date(n.created_at).toLocaleString(),
            read: n.read, reference_id: n.reference_id,
          })));
        }
      } catch (e) {}
    }, 5000);
    return () => clearInterval(interval);
  }, [view]);

  // Realtime messages via WebSocket + fast fallback polling
  useEffect(() => {
    if (view !== "messages" || !selectedConvo) return;
    setHasUnreadMessages(false);
    
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
      try {
        const msgs = await api.getMessages(selectedConvo);
        if (msgs && msgs.length !== lastCount) {
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
    const cleanContent = sanitize(newPost);
    const tags = [];
    const hashtags = cleanContent.match(/#(\w+)/g);
    if (hashtags) hashtags.forEach((h) => tags.push(h.replace("#", "")));
    // Detect external URLs (TikTok, Instagram, YouTube, etc.)
    const urlMatch = newPost.match(/https?:\/\/[^\s]+/i);
    const externalUrl = urlMatch ? urlMatch[0] : null;
    if (externalUrl) tags.push("__external__");
    const groupName = selectedGroup ? selectedGroup.name : null;
    const groupId = selectedGroup ? selectedGroup.id : null;
    const imageUrl = postImage?.url || null;
    const post = {
      id: "p_" + Date.now(), userId: user.id, content: newPost,
      author: { name: user.name, profession: user.profession, location: user.location, hometown: user.hometown },
      likes: 0, comments: [], tags, timestamp: Date.now(), groupName, groupId,
      image: imageUrl, externalUrl,
    };
    setPosts([post, ...posts]);
    setNewPost("");
    setPostImage(null);
    try { const r = await api.createPost(cleanContent || newPost, tags, imageUrl, groupId); if (r?.[0]) setPosts(prev => prev.map(p => p.id === post.id ? { ...p, id: r[0].id } : p)); } catch (e) { console.error("Post creation failed:", e.message); }
  };

  const deletePost = async (id) => {
    setPosts(posts.filter((p) => p.id !== id));
    try { await api.deletePost(id); } catch (e) {}
  };

  const createEvent = async () => {
    if (!newEvent.title || !newEvent.date) return;
    const e = {
      id: "e_" + Date.now(), title: newEvent.title,
      date: newEvent.date, time: newEvent.time || "TBD",
      location: newEvent.location || "TBD", attendees: 1,
      organizer: user.name, description: newEvent.description,
      link: newEvent.link || "", image: eventPhoto?.url || "",
    };
    setEvents([e, ...events]);
    setNewEvent({ title: "", date: "", time: "", location: "", city: "", description: "", link: "" }); setEventPhoto(null);
    setEventModal(false);
    try { await api.createEvent({ title: newEvent.title, date: newEvent.date, time: newEvent.time || "TBD", location: newEvent.location, description: newEvent.description, organizer_name: user.name, link: newEvent.link || "", image_url: eventPhoto?.url || "" }); } catch (er) {}
  };

  const toggleRsvp = async (id) => {
    const s = new Set(rsvps);
    if (s.has(id)) s.delete(id); else s.add(id);
    setRsvps(s);
    try { await api.toggleRsvp(id); } catch (e) {}
  };

  const toggleGroup = async (id) => {
    const g = groups.find(x => x.id === id);
    const newJoined = !g?.joined;
    const updated = groups.map((x) => x.id === id ? { ...x, joined: newJoined } : x);
    setGroups(updated);
    // Also update selectedGroup if it's the one being toggled
    if (selectedGroup && selectedGroup.id === id) {
      setSelectedGroup({ ...selectedGroup, joined: newJoined });
    }
    try { if (g?.joined) await api.leaveGroup(id); else await api.joinGroup(id); } catch (e) {}
  };

  const createHelp = async () => {
    if (!newHelp.title || !newHelp.description) return;
    const h = {
      id: "h_" + Date.now(), ...newHelp, user: user.name,
      timestamp: Date.now(), responses: 0, status: "Open",
    };
    setHelpRequests([h, ...helpRequests]);
    setNewHelp({ title: "", description: "", category: "General", urgency: "Low", city: "" });
    setHelpModal(false);
    try { await api.createHelpRequest({ title: newHelp.title, description: newHelp.description, category: newHelp.category, urgency: newHelp.urgency }); } catch (e) {}
  };

  const saveProfileChanges = async () => {
    const updated = { ...user, ...editProfile };
    try {
      await api.updateProfile({
        name: updated.name, location: updated.location, hometown: updated.hometown,
        profession: updated.profession, linkedin_url: updated.linkedinUrl,
      });
    } catch (e) { console.log("Profile update:", e.message); }
    localStorage.setItem("indin_profile_cache", JSON.stringify(updated));
    // Update the user state so UI reflects changes immediately
    Object.assign(user, updated);
    setProfileModal(false);
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
        return (
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            {/* Header with Filters + Add Post button */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", marginBottom: 2, fontFamily: font }}>Home Feed</h2>
                <p style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>Updates from the global community</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ position: "relative" }}>
                  <button onClick={() => setCreatePostDropdown(!createPostDropdown)} style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                    borderRadius: 6, border: "none", background: "#37352F",
                    fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", fontFamily: font,
                  }}>
                    {Icons.plus({ size: 14 })} Add Post
                  </button>
                  {createPostDropdown && (
                    <>
                      <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setCreatePostDropdown(false)} />
                      <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 6, width: 180, background: "#fff", border: "1px solid #E8E7E4", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.1)", zIndex: 50, overflow: "hidden", padding: "4px 0" }}>
                        {[
                          { key: "text", icon: Icons.file, label: "Write a Post" },
                          { key: "photo", icon: Icons.image, label: "Share a Photo" },
                          { key: "link", icon: Icons.link, label: "Share a Link" },
                        ].map(item => (
                          <button key={item.key} onClick={() => { setCreatePostModal(item.key); setCreatePostDropdown(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", border: "none", background: "none", cursor: "pointer", color: "#37352F", fontSize: 13, fontFamily: font }}
                            onMouseOver={(e) => e.currentTarget.style.background = "#FAFAF8"}
                            onMouseOut={(e) => e.currentTarget.style.background = "none"}>
                            {item.icon({ size: 15, stroke: "#9B9A97" })} {item.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <button onClick={() => setFilterModalOpen(true)} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                  borderRadius: 6, border: "1px solid #E0E0DE", background: "#fff",
                  fontSize: 13, fontWeight: 500, color: "#37352F", cursor: "pointer", fontFamily: font,
                }}>
                  {Icons.filter({ size: 14 })} Filters
                </button>
              </div>
            </div>

            {/* Active Filters Status */}
            {(feedFilters.hometown || feedFilters.occupation !== "All" || feedFilters.yearsAbroad !== "All" || feedFilters.community !== "All") && (
              <div style={{ background: "#E3FCEF", border: "1px solid #B5E4CA", borderRadius: 8, padding: "8px 14px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#22A06B", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: font }}>{Icons.filter({ size: 12, stroke: "#22A06B" })} Filters:</span>
                  {feedFilters.hometown && <span style={{ fontSize: 12, color: "#22A06B", background: "#fff", padding: "2px 8px", borderRadius: 4, fontFamily: font }}>City: {feedFilters.hometown}</span>}
                  {feedFilters.occupation !== "All" && <span style={{ fontSize: 12, color: "#22A06B", background: "#fff", padding: "2px 8px", borderRadius: 4, fontFamily: font }}>Profession: {feedFilters.occupation}</span>}
                  {feedFilters.yearsAbroad !== "All" && <span style={{ fontSize: 12, color: "#22A06B", background: "#fff", padding: "2px 8px", borderRadius: 4, fontFamily: font }}>Status: {feedFilters.yearsAbroad}</span>}
                  {feedFilters.community !== "All" && <span style={{ fontSize: 12, color: "#22A06B", background: "#fff", padding: "2px 8px", borderRadius: 4, fontFamily: font }}>Community: {feedFilters.community}</span>}
                </div>
                <button onClick={() => setFeedFilters({ hometown: "", occupation: "All", yearsAbroad: "All", community: "All" })} style={{ background: "none", border: "none", color: "#DC2626", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font, whiteSpace: "nowrap" }}>Clear All</button>
              </div>
            )}

            {/* Post Type Filter + Viral/New Toggle - same row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", gap: 4, padding: 4, background: "#F0EFED", borderRadius: 8 }}>
                {[{ k: "all", l: "All" }, { k: "posts", l: "Posts" }, { k: "links", l: "Links" }].map(tab => (
                  <button key={tab.k} onClick={() => setFeedPostType(tab.k)} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: feedPostType === tab.k ? "#fff" : "transparent", color: feedPostType === tab.k ? "#37352F" : "#9B9A97", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font, boxShadow: feedPostType === tab.k ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}>{tab.l}</button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: feedSort === "viral" ? "#37352F" : "#9B9A97", fontFamily: font }}>Viral</span>
                <button
                  onClick={() => setFeedSort(feedSort === "new" ? "viral" : "new")}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                    background: "#D4D4D2", position: "relative", padding: 0, transition: "background 0.2s",
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%", background: "#37352F",
                    position: "absolute", top: 3,
                    left: feedSort === "new" ? 23 : 3,
                    transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  }} />
                </button>
                <span style={{ fontSize: 13, fontWeight: 500, color: feedSort === "new" ? "#37352F" : "#9B9A97", fontFamily: font }}>New</span>
              </div>
            </div>

            {/* Feed List */}
            {[...posts].filter(p => {
              // Hide blocked users' posts
              if (blockedIds.has(p.userId)) return false;
              const a = p.author || {};
              if (feedFilters.hometown && !(a.hometown || "").toLowerCase().includes(feedFilters.hometown.toLowerCase()) && !(a.location || "").toLowerCase().includes(feedFilters.hometown.toLowerCase())) return false;
              if (feedFilters.occupation !== "All" && !(a.profession || "").toLowerCase().includes(feedFilters.occupation.toLowerCase())) return false;
              if (feedFilters.yearsAbroad !== "All") {
                // Filter by NRI vs non-NRI based on author location
                if (feedFilters.yearsAbroad === "NRI" && !isUserNRI(a)) return false;
                if (feedFilters.yearsAbroad === "Based in India" && isUserNRI(a)) return false;
              }
              if (feedFilters.community !== "All" && p.groupName !== feedFilters.community) return false;
              // Post type filter
              if (feedPostType === "links" && !p.externalUrl) return false;
              if (feedPostType === "posts" && p.externalUrl) return false;
              return true;
            }).sort((a, b) => feedSort === "viral" ? (b.likes || 0) - (a.likes || 0) : (b.timestamp || 0) - (a.timestamp || 0)).map((p) => (
              <PostCard key={p.id} post={p} user={user} onDelete={deletePost} onReport={(id) => setReportConfirm({ type: "post", id })} isReported={reportedIds.has(p.id)} initialLiked={likedPostIds.has(p.id)} />
            ))}
          </div>
        );

      case "network":
        // Load users from DB on first visit
        if (!networkLoaded) {
          setNetworkLoaded(true);
          (async () => {
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
                  avatar_url: u.avatar_url || "",
                  followers: connCounts[u.id]?.followers || 0, following: connCounts[u.id]?.following || 0,
                })));
              }
            } catch (e) {}
          })();
        }
        return (
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            {/* Header */}
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", marginBottom: 4, fontFamily: font }}>Find Indians Abroad</h2>
            <p style={{ fontSize: 12, color: "#9B9A97", marginBottom: 20, fontFamily: font }}>Connect with people from your community.</p>
            <InfoBanner text="Search and connect with Indians in your city. Send a Namaste request to start a conversation." />

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
                  placeholder="Search by name, profession, or keyword..."
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

                {/* Nearby button */}
                <button
                  onClick={() => setNetworkNearby(!networkNearby)}
                  style={{
                    padding: "7px 14px", fontSize: 12, borderRadius: 6, cursor: "pointer",
                    fontFamily: font, display: "flex", alignItems: "center", gap: 5, fontWeight: 500,
                    border: networkNearby ? "1px solid #37352F" : "1px solid #E0E0DE",
                    background: networkNearby ? "#37352F" : "#fff",
                    color: networkNearby ? "#fff" : "#5F5E5B",
                    transition: "all 0.15s",
                  }}
                >
                  {Icons.mapPin({ size: 12 })} Nearby
                </button>

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

            {/* Results */}
            {isNetworkFilterActive ? (
              filteredNetworkUsers.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }} className="network-grid">
                  {filteredNetworkUsers.map((u) => (
                    <div key={u.id} style={{
                      background: "#fff", borderRadius: 16, border: "1px solid #E8E7E4",
                      padding: "28px 24px 20px", textAlign: "center", display: "flex", flexDirection: "column",
                      alignItems: "center", transition: "box-shadow 0.15s",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)")}
                    onMouseOut={(e) => (e.currentTarget.style.boxShadow = "none")}
                    >
                      {/* Avatar */}
                      <Avatar name={u.name} size={76} url={u.avatar_url} />

                      {/* Name + verified badge + NRI badge */}
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 14, marginBottom: 2, flexWrap: "wrap", justifyContent: "center" }}>
                        <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>{u.name}</h3>
                        {u.linkedinUrl && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="#22C55E" stroke="none">
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
                      <p style={{ fontSize: 13, color: "#5F5E5B", marginBottom: 14, fontFamily: font }}>{u.profession}</p>

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
                        <span><b style={{ color: "#37352F" }}>{u.followers}</b> <span style={{ color: "#9B9A97" }}>followers</span></span>
                        <span style={{ color: "#D4D4D2" }}>·</span>
                        <span><b style={{ color: "#37352F" }}>{u.following}</b> <span style={{ color: "#9B9A97" }}>following</span></span>
                      </div>

                      {/* Action buttons - Namaste + Message */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
                        <button
                          onClick={() => { 
                            if (acceptedConnections.has(u.id)) { if (confirm(`Unfollow ${u.name}?`)) handleUnfollow(u.id); }
                            else if (!sentNamaste.has(u.id)) handleSendNamaste(u.id);
                          }}
                          disabled={sentNamaste.has(u.id)}
                          style={{
                            flex: 1, padding: "10px 0", borderRadius: 8,
                            border: acceptedConnections.has(u.id) ? "1px solid #B5E4CA" : "none",
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
                            <>{Icons.check({ size: 14 })} Sent</>
                          ) : (
                            <>{Icons.users({ size: 14 })} Namaste</>
                          )}
                        </button>
                        <button onClick={async () => {
                          try {
                            const convo = await api.getOrCreateConversation(u.id);
                            if (convo) {
                              setConvos(prev => {
                                if (prev.find(c => c.id === convo.id)) return prev;
                                return [{ id: convo.id, name: u.name, otherUserId: u.id, lastMsg: "", time: "", unread: false }, ...prev];
                              });
                              setSelectedConvo(convo.id);
                              setView("messages");
                            }
                          } catch(e) { setView("messages"); }
                        }} style={{
                          padding: "10px 12px", borderRadius: 8, border: "1px solid #E0E0DE",
                          background: "#fff", cursor: "pointer", color: "#5F5E5B", display: "flex",
                          alignItems: "center", justifyContent: "center",
                          transition: "all 0.1s",
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.background = "#F7F7F5"; e.currentTarget.style.color = "#37352F"; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#5F5E5B"; }}
                        >
                          {Icons.message({ size: 16 })}
                        </button>
                        <button onClick={async () => { setReportConfirm({ type: "user", id: u.id }); }} style={{ padding: "10px 8px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", cursor: "pointer", color: "#D4D4D2", display: "flex", alignItems: "center" }}>
                          {Icons.flag({ size: 14 })}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
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
              )
            ) : (
              /* Empty / Initial State - matching screenshot 2 */
              <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8E7E4", padding: "48px 32px", textAlign: "center" }}>
                {/* Blue search icon circle */}
                <div style={{
                  width: 72, height: 72, borderRadius: "50%", background: "#EDF4FF",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 20,
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5B9CFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </div>

                <h3 style={{ fontSize: 20, fontWeight: 700, color: "#37352F", marginBottom: 10, fontFamily: font }}>Find your community</h3>
                <p style={{ fontSize: 14, color: "#9B9A97", maxWidth: 440, margin: "0 auto 28px", lineHeight: 1.6, fontFamily: font }}>
                  Search for people by name, profession, or location. Use the filters to find people from your hometown or current city.
                </p>

                {/* Search Tips box */}
                <div style={{
                  background: "#F7F7F5", borderRadius: 10, padding: "18px 22px", maxWidth: 360, margin: "0 auto",
                  textAlign: "left", border: "1px solid #EDEDEB",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flexShrink: 0, marginTop: 1, color: "#9B9A97" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                      </svg>
                    </div>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#37352F", marginBottom: 8, fontFamily: font }}>Search Tips:</p>
                      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "#5F5E5B", lineHeight: 1.8, fontFamily: font }}>
                        <li>Type "Engineer" to find professionals</li>
                        <li>Select "Mumbai" in Hometown filter</li>
                        <li>Use "Nearby" to find locals</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case "groups":
        if (selectedGroup) {
          const groupPosts = posts.filter((p) => p.groupId === selectedGroup.id);
          const thumbColors = ["#5A6E55", "#4A5568", "#6B5B4E", "#3D5A80", "#7B6D4E", "#4A6741"];
          const sgColor = thumbColors[groups.findIndex((g) => g.id === selectedGroup.id) % thumbColors.length];

          return (
            <div style={{ maxWidth: 700, margin: "0 auto" }}>
              {/* Back link */}
              <button onClick={() => { setSelectedGroup(null); setCommunityTab("feed"); }} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#9B9A97", background: "none", border: "none", cursor: "pointer", marginBottom: 16, fontFamily: font, fontWeight: 500 }}>
                {Icons.chevronLeft({ size: 16 })} Back to Communities
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
                      onClick={() => toggleGroup(selectedGroup.id)}
                      style={{
                        padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: font, cursor: "pointer", flexShrink: 0,
                        border: selectedGroup.joined ? "1px solid #E0E0DE" : "none",
                        background: selectedGroup.joined ? "#fff" : "#37352F",
                        color: selectedGroup.joined ? "#5F5E5B" : "#fff",
                      }}
                    >
                      {selectedGroup.joined ? "Joined" : "Join Community"}
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 12, color: "#9B9A97" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>{Icons.users({ size: 14 })} {selectedGroup.joined ? (groups.filter(g => g.joined).length > 0 ? "You + others" : "1") : "0"} joined</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>{Icons.shield({ size: 14 })} Admin Moderated</span>
                  </div>

                  {/* Community Guidelines */}
                  <div style={{ marginTop: 20, padding: "16px 18px", background: "#F7F7F5", borderRadius: 10, border: "1px solid #EDEDEB" }}>
                    <h4 style={{ fontSize: 11, fontWeight: 800, color: "#37352F", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6, fontFamily: font }}>
                      {Icons.shield({ size: 13 })} Community Guidelines
                    </h4>
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
                  </div>
                </div>
              </div>

              {/* Feed / Members Tabs */}
              <div style={{ display: "flex", gap: 24, borderBottom: "1px solid #E8E7E4", margin: "24px 0 20px" }}>
                {["feed", "members"].map((tab) => (
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
                    {tab === "feed" ? "Feed" : "Members"}
                  </button>
                ))}
              </div>

              {communityTab === "feed" ? (
                <>
                  {/* Community post box */}
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
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid #F0EFED" }}>
                      <button style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "#9B9A97", fontSize: 12, fontFamily: font }}>
                        {Icons.image({ size: 14 })} Add Photo
                      </button>
                      <button onClick={createPost} disabled={!newPost.trim()} style={{
                        padding: "7px 20px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 13, fontFamily: font,
                        background: newPost.trim() ? "#37352F" : "#fff", color: newPost.trim() ? "#fff" : "#9B9A97", cursor: newPost.trim() ? "pointer" : "default",
                      }}>
                        Post
                      </button>
                    </div>
                  </div>

                  {groupPosts.length > 0 ? (
                    groupPosts.map((p) => <PostCard key={p.id} post={p} user={user} onDelete={deletePost} onReport={(id) => setReportConfirm({ type: "post", id })} isReported={reportedIds.has(p.id)} initialLiked={likedPostIds.has(p.id)} />)
                  ) : (
                    <div style={{ textAlign: "center", padding: 40, color: "#9B9A97", fontSize: 14, background: "#fff", borderRadius: 12, border: "1px dashed #E8E7E4", fontFamily: font }}>
                      No posts in this community yet. Be the first to say hello!
                    </div>
                  )}
                </>
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
                  const MemberCard = ({ u, isLocal }) => (
                    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8E7E4", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                      <Avatar name={u.name} size={44} url={u.avatar_url} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <h4 style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font }}>{u.name}</h4>
                          {isLocal && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "#E3FCEF", color: "#22A06B", border: "1px solid #B5E4CA" }}>LOCAL</span>}
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
                      <button onClick={() => handleSendNamaste(u.id)} disabled={sentNamaste.has(u.id) || u.id === user.id}
                        style={{ padding: 8, borderRadius: "50%", border: "none", cursor: (sentNamaste.has(u.id) || u.id === user.id) ? "default" : "pointer", flexShrink: 0, background: (sentNamaste.has(u.id) || u.id === user.id) ? "#F0EFED" : "#37352F", color: (sentNamaste.has(u.id) || u.id === user.id) ? "#9B9A97" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {(sentNamaste.has(u.id) || u.id === user.id) ? Icons.check({ size: 16 }) : Icons.users({ size: 16 })}
                      </button>
                    </div>
                  );
                  return (
                    <div>
                      {localMembers.length > 0 && (
                        <>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#22A06B", marginBottom: 10, fontFamily: font, display: "flex", alignItems: "center", gap: 6 }}>{Icons.mapPin({ size: 14, stroke: "#22A06B" })} Living in {cityName} ({localMembers.length})</h4>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                            {localMembers.map(u => <MemberCard key={u.id} u={u} isLocal={true} />)}
                          </div>
                        </>
                      )}
                      {outsideCityNames.map(city => (
                        <div key={city} style={{ marginBottom: 16 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#9B9A97", marginBottom: 10, fontFamily: font, display: "flex", alignItems: "center", gap: 6 }}>{Icons.mapPin({ size: 14, stroke: "#9B9A97" })} {city} ({outsideByCities[city].length})</h4>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            {outsideByCities[city].map(u => <MemberCard key={u.id} u={u} isLocal={false} />)}
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
        const groupTabList = groupTab === "my" ? myGroups.filter(g => g.name.toLowerCase().includes(groupSearchQuery.toLowerCase())) : groups.filter((g) => g.name.toLowerCase().includes(groupSearchQuery.toLowerCase()));
        const thumbColorsAll = ["#5A6E55", "#4A5568", "#6B5B4E", "#3D5A80", "#7B6D4E", "#4A6741"];

        return (
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            {/* Header with Request New + Search */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", fontFamily: font }}>Communities</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => setGroupRequestModal(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 6,
                    border: "1px solid #E0E0DE", background: "#fff", fontSize: 12, fontWeight: 600, color: "#37352F",
                    cursor: "pointer", fontFamily: font,
                  }}
                >
                  {Icons.plus({ size: 13 })} Request New
                </button>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}>
                    {Icons.search({ size: 14 })}
                  </div>
                  <input
                    value={groupSearchQuery} onChange={(e) => setGroupSearchQuery(e.target.value)}
                    placeholder="Search..."
                    style={{
                      padding: "7px 12px 7px 30px", fontSize: 12, border: "1px solid #E0E0DE",
                      borderRadius: 6, background: "#fff", outline: "none", width: 160, fontFamily: font, color: "#37352F",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* My Groups / All Groups tabs */}
            <div style={{ display: "flex", gap: 0, marginBottom: 20, background: "#fff", borderRadius: 8, border: "1px solid #E0E0DE", overflow: "hidden", width: "fit-content" }}>
              {[{ key: "all", label: "All Communities" }, { key: "my", label: `My Groups (${myGroups.length})` }].map(t => (
                <button key={t.key} onClick={() => setGroupTab(t.key)}
                  style={{ padding: "8px 18px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: font,
                    background: groupTab === t.key ? "#37352F" : "#fff", color: groupTab === t.key ? "#fff" : "#5F5E5B" }}>
                  {t.label}
                </button>
              ))}
            </div>

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
                        <span style={{ fontSize: 9, color: "#9B9A97", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.08em", border: "1px solid #EDEDEB", padding: "2px 6px", borderRadius: 3 }}>
                          {g.category}
                        </span>
                      </div>
                    </div>
                    <p style={{ fontSize: 12, color: "#9B9A97", lineHeight: 1.4, fontFamily: font, marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {g.description}
                    </p>
                    <div style={{ fontSize: 12, color: "#9B9A97", display: "flex", alignItems: "center", gap: 4 }}>
                      {Icons.users({ size: 13 })} {g.members.toLocaleString()} members
                    </div>
                  </div>

                  {/* Join button - full width at bottom */}
                  <div style={{ padding: "0 18px 16px" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleGroup(g.id); }}
                      style={{
                        width: "100%", padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: font, cursor: "pointer",
                        border: g.joined ? "1px solid #E0E0DE" : "none",
                        background: g.joined ? "#fff" : "#37352F",
                        color: g.joined ? "#5F5E5B" : "#fff",
                        transition: "all 0.15s",
                      }}
                    >
                      {g.joined ? "Joined" : "Join Community"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {groupTabList.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, background: "#fff", borderRadius: 12, border: "1px dashed #E8E7E4", color: "#9B9A97", fontSize: 14, fontFamily: font }}>
                No communities found.
                <br />
                <button onClick={() => setGroupSearchQuery("")} style={{ background: "none", border: "none", color: "#37352F", textDecoration: "underline", cursor: "pointer", marginTop: 8, fontSize: 13, fontFamily: font }}>
                  Clear Search
                </button>
              </div>
            )}
          </div>
        );

      case "events":
        const evtColors = ["#3D6B5A", "#5A4A3D", "#3D5A80", "#6B5B4E", "#4A6741"];
        const filteredEvents = events.filter((e) => {
          const matchesView = eventViewMode === "all" || rsvps.has(e.id);
          const matchesCity = eventCityFilter === "All" || (e.location || "").includes(eventCityFilter);
          const q = eventSearch.trim().toLowerCase();
          const matchesSearch = !q || (e.title || "").toLowerCase().includes(q) || (e.description || "").toLowerCase().includes(q) || (e.location || "").toLowerCase().includes(q) || (e.organizer || "").toLowerCase().includes(q);
          return matchesView && matchesCity && matchesSearch;
        });

        return (
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", fontFamily: font }}>Events</h2>
                <p style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>Discover festivals, meetups, and networking events.</p>
              </div>
              <button onClick={() => setEventModal(true)} style={btnPrimary}>
                {Icons.plus({ size: 14 })} Host Event
              </button>
            </div>
            <InfoBanner text="Browse and RSVP to events in your city. Host your own to bring the community together." />

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
                    padding: "6px 14px", borderRadius: 5, border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: font,
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
                    padding: "6px 14px", borderRadius: 5, border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: font,
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
                  <option value="All">All</option>
                  {GLOBAL_CITIES.map((c) => <option key={c} value={c.split(",")[0]}>{c}</option>)}
                </select>
                <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#9B9A97" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
              </div>
            </div>

            {/* Event Cards */}
            {filteredEvents.length > 0 ? filteredEvents.map((e, idx) => {
              const datePart = (e.date || "").split("•")[0].trim();
              const timePart = (e.date || "").split("•")[1]?.trim() || "TBD";
              const timeMain = timePart.split(" ")[0] || timePart;
              const timeAmPm = timePart.split(" ")[1] || "";
              const locMain = (e.location || "").split(",")[0].trim();
              const locCity = (e.location || "").split(",").slice(1).join(",").trim();
              const evtColor = evtColors[idx % evtColors.length];

              return (
                <div key={e.id} className="event-card" style={{
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
                        <button
                          onClick={() => toggleRsvp(e.id)}
                          style={{
                            padding: "9px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: font, cursor: "pointer",
                            border: "1px solid #B5E4CA",
                            background: rsvps.has(e.id) ? "#E3FCEF" : "#fff",
                            color: "#22A06B", transition: "all 0.15s",
                          }}
                        >
                          Going
                        </button>
                        {e.organizerId === user.id && <button onClick={async () => { if (confirm("Delete this event?")) { try { await api.deleteEvent(e.id); } catch(e2) {} setEvents(prev => prev.filter(x => x.id !== e.id)); } }} style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", cursor: "pointer", color: "#DC2626" }}>{Icons.trash({ size: 14 })}</button>}
                        <button onClick={() => setReportConfirm({ type: "event", id: e.id, name: e.title })} style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", cursor: "pointer", color: "#D4D4D2" }}>{Icons.flag({ size: 14 })}</button>
                      </div>
                    </div>
                    {/* Like / Comment / Share */}
                    <div style={{ display: "flex", alignItems: "center", gap: 16, paddingTop: 12, borderTop: "1px solid #F0EFED", marginTop: 12 }}>
                      <button onClick={() => setEventLikes(prev => ({ ...prev, [e.id]: !prev[e.id] }))} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: eventLikes[e.id] ? "#DC2626" : "#9B9A97", fontSize: 12, fontFamily: font }}>{Icons.heart({ size: 15, fill: eventLikes[e.id] ? "#DC2626" : "none", stroke: eventLikes[e.id] ? "#DC2626" : "currentColor" })} {eventLikes[e.id] ? "Liked" : "Like"}</button>
                      <button onClick={() => setExpandedEvent(e)} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "#9B9A97", fontSize: 12, fontFamily: font }}>{Icons.message({ size: 15 })} Comment {eventComments[e.id]?.length ? `(${eventComments[e.id].length})` : ""}</button>
                      <button onClick={() => {
                        const shareUrl = `${window.location.origin}${window.location.pathname}#event=${e.id}`;
                        const shareText = `${e.title}\n${e.date} at ${e.time}\n📍 ${e.location}\n\n${e.description}\n\n${e.link || shareUrl}`;
                        if (navigator.share) navigator.share({ title: e.title, text: shareText, url: e.link || shareUrl }).catch(() => {});
                        else { navigator.clipboard.writeText(shareText); alert("Event details copied to clipboard!"); }
                      }} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "#9B9A97", fontSize: 12, fontFamily: font, marginLeft: "auto" }}>{Icons.share({ size: 15 })} Share</button>
                    </div>
                  </div>
                </div>
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
        const tagCategories = {};
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
            if (!tagCategories[tag]) {
              // Guess category based on post author profession
              tagCategories[tag] = p.author?.profession || "Community";
            }
          });
        });
        const trendingTags = Object.entries(tagCounts)
          .map(([tag, count]) => ({ tag, count, category: tagCategories[tag] || "Community" }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        return (
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", marginBottom: 20, fontFamily: font }}>Trending Topics</h2>
            <InfoBanner text="Top 10 trending hashtags in the community. Post with #hashtags to start a trend." />
            {trendingTags.length === 0 ? (
              <div style={{ textAlign: "center", padding: 48, color: "#9B9A97", fontSize: 14, background: "#fff", borderRadius: 12, border: "1px dashed #E8E7E4", fontFamily: font }}>
                {Icons.trending({ size: 32, stroke: "#D4D4D2" })}
                <p style={{ marginTop: 12 }}>No trending topics yet. Post with hashtags like #Diwali to start a trend!</p>
              </div>
            ) : (
              <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8E7E4", overflow: "hidden" }}>
                {trendingTags.map((t, i) => (
                  <div key={t.tag} onClick={() => { setFeedFilters(prev => ({ ...prev })); setView("home"); }} style={{ padding: "16px 20px", borderBottom: i < trendingTags.length - 1 ? "1px solid #F0EFED" : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}
                    onMouseOver={(e) => (e.currentTarget.style.background = "#FAFAF8")} onMouseOut={(e) => (e.currentTarget.style.background = "#fff")}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: i < 3 ? "#FFF3E0" : "#F0EFED", color: i < 3 ? "#E65100" : "#5F5E5B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, fontFamily: font, flexShrink: 0 }}>#{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: "#9B9A97", marginBottom: 2, fontFamily: font, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{t.category}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#37352F", fontFamily: font }}>#{t.tag}</div>
                      <div style={{ fontSize: 12, color: "#9B9A97", marginTop: 2, fontFamily: font }}>{t.count} {t.count === 1 ? "post" : "posts"}</div>
                    </div>
                    {Icons.trending({ size: 18, stroke: "#22A06B" })}
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case "help":
        return (
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", fontFamily: font, display: "flex", alignItems: "center", gap: 8 }}>
                  {Icons.help({ size: 22, stroke: "#E25555" })} Community Help
                </h2>
                <p style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>Ask questions, share advice, and help fellow Indians.</p>
              </div>
              <button onClick={() => setHelpModal(true)} style={btnPrimary}>Ask for Help</button>
            </div>
            <InfoBanner text="Need advice on housing, visas, or daily life? Ask the community. Your city members will see it first." />
            {helpRequests.map((h) => (
              <div key={h.id} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8E7E4", padding: "20px 24px", marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4, background: h.urgency === "High" ? "#FEE" : h.urgency === "Medium" ? "#FFF3E0" : "#E3FCEF", color: h.urgency === "High" ? "#DC2626" : h.urgency === "Medium" ? "#E65100" : "#22A06B", border: `1px solid ${h.urgency === "High" ? "#FECACA" : h.urgency === "Medium" ? "#FFE0B2" : "#B5E4CA"}` }}>
                      {h.urgency} Priority
                    </span>
                    <span style={{ fontSize: 11, color: "#9B9A97" }}>· {h.category}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {h.userId === user.id && <button onClick={async () => { if (confirm("Delete this help request?")) { try { await api.deleteHelpRequest(h.id); } catch(e) {} setHelpRequests(prev => prev.filter(x => x.id !== h.id)); } }} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", padding: 2 }}>{Icons.trash({ size: 14 })}</button>}
                    <button onClick={async () => { setReportConfirm({ type: "help", id: h.id, name: h.title }); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#D4D4D2", padding: 2 }}>{Icons.flag({ size: 14 })}</button>
                  </div>
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", marginBottom: 6, fontFamily: font }}>{h.title}</h3>
                <p style={{ fontSize: 13, color: "#5F5E5B", lineHeight: 1.6, marginBottom: 6, fontFamily: font, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: selectedHelp === h.id ? 999 : 2, WebkitBoxOrient: "vertical" }}>{h.description}</p>
                {h.description && h.description.length > 100 && selectedHelp !== h.id && (
                  <button onClick={() => setSelectedHelp(h.id)} style={{ background: "none", border: "none", color: "#5B9CFF", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 10, fontFamily: font }}>Read more</button>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid #F0EFED" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Avatar name={h.user} size={24} />
                    <span style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>{h.user} · {timeAgo(h.timestamp)}</span>
                  </div>
                  <button onClick={async () => {
                    const newId = selectedHelp === h.id ? null : h.id;
                    setSelectedHelp(newId);
                    if (newId && !helpResponses[newId]) {
                      try {
                        const resp = await api.getHelpResponses(newId);
                        if (resp) setHelpResponses(prev => ({ ...prev, [newId]: resp.map(r => ({ id: r.id, text: r.content, user: r.profiles?.name || "User", time: new Date(r.created_at).toLocaleString() })) }));
                      } catch(e) {}
                    }
                  }} style={{ fontSize: 12, color: selectedHelp === h.id ? "#37352F" : "#9B9A97", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", background: "none", border: "none", fontFamily: font, fontWeight: selectedHelp === h.id ? 600 : 400 }}>{Icons.message({ size: 14 })} {h.responses} responses</button>
                </div>
                {selectedHelp === h.id && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #F0EFED" }}>
                    {/* Existing responses */}
                    {(helpResponses[h.id] || []).map((r, ri) => (
                      <div key={r.id || ri} style={{ display: "flex", gap: 10, marginBottom: 14, padding: "10px 12px", background: "#FAFAF8", borderRadius: 8 }}>
                        <Avatar name={r.user} size={28} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#37352F", fontFamily: font }}>{r.user}</span>
                            <span style={{ fontSize: 10, color: "#9B9A97", fontFamily: font }}>{r.time}</span>
                          </div>
                          <p style={{ fontSize: 13, color: "#5F5E5B", marginTop: 4, lineHeight: 1.5, fontFamily: font }}>{r.text}</p>
                        </div>
                      </div>
                    ))}
                    {/* Write new response */}
                    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                      <Avatar name={user.name} size={28} url={user.avatar_url} />
                      <div style={{ flex: 1 }}>
                        <textarea value={helpResponse} onChange={(e) => setHelpResponse(e.target.value)} placeholder="Write a response to help..." style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 13, background: "#FAFAF8", outline: "none", fontFamily: font, minHeight: 60, resize: "none", boxSizing: "border-box" }} />
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                          <button disabled={!helpResponse.trim()} onClick={async () => {
                            const text = helpResponse;
                            try { await api.addHelpResponse(h.id, text); } catch(e) {}
                            setHelpRequests(prev => prev.map(x => x.id === h.id ? { ...x, responses: (x.responses || 0) + 1 } : x));
                            setHelpResponses(prev => ({ ...prev, [h.id]: [...(prev[h.id] || []), { id: Date.now(), text, user: user.name, time: "Just now" }] }));
                            setHelpResponse("");
                          }} style={{ ...btnPrimary, padding: "7px 16px", fontSize: 12, opacity: helpResponse.trim() ? 1 : 0.4 }}>Post Response</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        );

      case "docs":
        if (selectedDoc) {
          return (
            <div className="doc-article" style={{ maxWidth: 700, margin: "0 auto", background: "#fff", borderRadius: 14, border: "1px solid #E8E7E4", overflow: "hidden" }}>
              {/* Header bar */}
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #F0EFED", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 56, background: "#fff", zIndex: 5 }}>
                <button onClick={() => setSelectedDoc(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97", padding: 4 }}>{Icons.chevronLeft({ size: 18 })}</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#37352F", fontFamily: font, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedDoc.title}</h3>
                  <p style={{ fontSize: 11, color: "#9B9A97", fontFamily: font }}>By {selectedDoc.author}</p>
                </div>
                <button style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.dots({ size: 18 })}</button>
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
                    <textarea value={docComment} onChange={(e) => setDocComment(e.target.value)} placeholder="Add a comment..." style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid #E0E0DE", fontSize: 13, background: "#FAFAF8", outline: "none", fontFamily: font, minHeight: 70, resize: "none", boxSizing: "border-box" }} />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                      <button disabled={!docComment.trim()} onClick={async () => {
                        const text = docComment;
                        const newComment = { id: "c_" + Date.now(), user: user.name, text, time: "Just now" };
                        const updated = docs.map(d => d.id === selectedDoc.id ? { ...d, comments: [...(d.comments || []), newComment] } : d);
                        setDocs(updated);
                        setSelectedDoc(updated.find(d => d.id === selectedDoc.id));
                        setDocComment("");
                        try { await api.addDocComment(selectedDoc.id, text); } catch(e) {}
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
                        <span style={{ fontSize: 11, color: "#9B9A97" }}>· {c.time}</span>
                      </div>
                      <p style={{ fontSize: 14, color: "#5F5E5B", lineHeight: 1.6, fontFamily: font }}>{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        const filteredDocs = docs.filter(d => {
          if (docCityFilter !== "All" && !(d.city || "").includes(docCityFilter)) return false;
          if (docSearch.trim()) {
            const q = docSearch.toLowerCase();
            return (d.title || "").toLowerCase().includes(q) || (d.excerpt || "").toLowerCase().includes(q) || (d.content || "").toLowerCase().includes(q) || (d.category || "").toLowerCase().includes(q) || (d.author || "").toLowerCase().includes(q);
          }
          return true;
        });
        return (
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", fontFamily: font }}>Community Docs</h2>
                <p style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>Essential guides and tips for your city.</p>
              </div>
              <button onClick={() => setDocModal(true)} style={btnPrimary}>{Icons.plus({ size: 14 })} Create Doc</button>
            </div>
            <InfoBanner text="Share guides, tips, and local knowledge. Help newcomers settle in your city." />
            {/* Search Bar */}
            <div style={{ position: "relative", marginBottom: 12 }}>
              <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}>{Icons.search({ size: 16 })}</div>
              <input value={docSearch} onChange={(e) => setDocSearch(e.target.value)} placeholder="Search docs by title, content, category, or author..." style={{ width: "100%", padding: "12px 14px 12px 40px", borderRadius: 10, border: "1px solid #E8E7E4", background: "#fff", fontSize: 13, fontFamily: font, boxSizing: "border-box", outline: "none" }} />
              {docSearch && (
                <button onClick={() => setDocSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9B9A97", padding: 4 }}>{Icons.x({ size: 14 })}</button>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, background: "#fff", padding: "10px 16px", borderRadius: 10, border: "1px solid #E8E7E4" }}>
              <span style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>Filter by City:</span>
              <div style={{ position: "relative" }}>
                <select value={docCityFilter} onChange={(e) => setDocCityFilter(e.target.value)} style={{ padding: "4px 24px 4px 8px", fontSize: 13, border: "none", background: "transparent", fontWeight: 600, color: "#37352F", cursor: "pointer", fontFamily: font, appearance: "none", outline: "none" }}>
                  <option value="All">All</option>
                  {GLOBAL_CITIES.map(c => <option key={c} value={c.split(",")[0]}>{c}</option>)}
                </select>
                <div style={{ position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#9B9A97" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="docs-grid">
              {filteredDocs.map((d) => (
                <div key={d.id} onClick={async () => {
                  setSelectedDoc(d);
                  try {
                    const dbComments = await api.getDocComments(d.id);
                    if (dbComments && dbComments.length) {
                      const withComments = { ...d, comments: dbComments.map(c => ({ id: c.id, user: c.profiles?.name || "User", text: c.content, time: new Date(c.created_at).toLocaleString() })) };
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", fontFamily: font }}>Marketplace</h2>
                <p style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>Buy, sell, rent, and find services within the community.</p>
              </div>
              <button onClick={() => setMarketModal(true)} style={btnPrimary}>{Icons.plus({ size: 14 })} Post Item</button>
            </div>
            <InfoBanner text="List housing, jobs, items, or services. Posts are visible to users in your city first." />
            {/* Search + city */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}>{Icons.search({ size: 15 })}</div>
                <input value={marketSearch} onChange={(e) => setMarketSearch(e.target.value)} placeholder="Search items, vehicles, housing..." style={{ ...inputStyle, paddingLeft: 36 }} />
              </div>
              <div style={{ position: "relative", width: 160 }}>
                <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}>{Icons.mapPin({ size: 14 })}</div>
                <select value={marketCityFilter} onChange={(e) => setMarketCityFilter(e.target.value)} style={{ ...inputStyle, paddingLeft: 34, appearance: "none", cursor: "pointer" }}>
                  <option value="All">All</option>
                  {GLOBAL_CITIES.map(c => <option key={c} value={c.split(",")[0]}>{c}</option>)}
                </select>
              </div>
            </div>
            {/* Category pills */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {["All", "Housing", "Jobs", "Items", "Vehicles", "Services"].map(c => (
                <button key={c} onClick={() => setMarketCategory(c)} style={{ padding: "7px 16px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: font, border: marketCategory === c ? "none" : "1px solid #E0E0DE", background: marketCategory === c ? "#37352F" : "#fff", color: marketCategory === c ? "#fff" : "#5F5E5B", transition: "all 0.1s" }}>
                  {c}
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
                    <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,0.9)", backdropFilter: "blur(4px)", padding: "5px 10px", borderRadius: 4, fontSize: 12, fontWeight: 700, color: "#37352F" }}>{item.price}</div>
                    <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(0,0,0,0.6)", padding: "3px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.category}</div>
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
                      <div style={{ display: "flex", gap: 6 }}>
                        {item.user_id === user.id && <button onClick={async (e) => { e.stopPropagation(); if (confirm("Delete this listing?")) { try { await api.deleteMarketItem(item.id); } catch(e) {} setMarketItems(prev => prev.filter(m => m.id !== item.id)); } }} style={{ fontSize: 12, fontWeight: 500, padding: "5px 10px", borderRadius: 6, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", fontFamily: font }}>{Icons.trash({ size: 11 })}</button>}
                        <button onClick={(e) => { e.stopPropagation(); setSelectedMarketItem(item); setContactMsg(`Hi ${item.seller.split(" ")[0]}, is this still available?`); }} style={{ fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 6, border: "1px solid #E0E0DE", background: "#fff", color: "#37352F", cursor: "pointer", fontFamily: font }}>Contact</button>
                        <button onClick={(e) => { e.stopPropagation(); setReportConfirm({ type: "marketplace", id: item.id, name: item.title }); }} style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #E0E0DE", background: "#fff", cursor: "pointer", color: "#D4D4D2" }}>{Icons.flag({ size: 12 })}</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case "messages":
        // Load conversations from DB on first visit
        if (!convosLoaded) {
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
            try {
              const targetSettings = await api.getOtherUserSettings(otherUser.otherUserId);
              if (targetSettings?.receive_messages === "Nobody") {
                alert("This user is not accepting messages.");
                return;
              }
              if (targetSettings?.receive_messages === "Connections Only" && !acceptedConnections.has(otherUser.otherUserId)) {
                alert("This user only accepts messages from connections. Send a Namaste request first.");
                return;
              }
            } catch(e) {}
          }
          const msg = { id: Date.now().toString(), text: chatInput, sender: "me", time: "Just now" };
          setChatMessages(p => ({ ...p, [selectedConvo]: [...(p[selectedConvo] || []), msg] }));
          const text = chatInput;
          setChatInput("");
          try { await api.sendMessage(selectedConvo, text); } catch (e) {}
          // Update convo list
          setConvos(p => p.map(c => c.id === selectedConvo ? { ...c, lastMsg: text, time: "Just now" } : c));
        };

        return (
          <div>
          <InfoBanner text="Send direct messages to your connections. Start a conversation after sending a Namaste request." />
          <div className="msg-layout" style={{ background: "#fff", borderRadius: 14, border: "1px solid #E8E7E4", overflow: "hidden", height: "calc(100vh - 220px)", minHeight: 500, maxHeight: 800, display: "flex" }}>
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
                          {c.unread ? <span style={{ position: "absolute", top: 0, right: 0, width: 8, height: 8, background: "#DC2626", borderRadius: "50%", border: "2px solid #fff" }}>{""}</span> : null}
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
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              {selectedConvo && activeConvo ? (
                <>
                  <div style={{ padding: "12px 18px", borderBottom: "1px solid #E8E7E4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ position: "relative" }}>
                        <Avatar name={activeConvo.name} size={32} url={activeConvo.avatar_url} />
                        <span style={{ position: "absolute", bottom: 0, right: 0, width: 8, height: 8, background: "#22C55E", borderRadius: "50%", border: "2px solid #fff" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#37352F", fontFamily: font }}>{activeConvo.name}</div>
                        <div style={{ fontSize: 11, color: "#22C55E", fontWeight: 500 }}>Online</div>
                      </div>
                    </div>
                    <div style={{ position: "relative" }}>
                      <button onClick={() => setChatSettings(!chatSettings)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97", padding: 4 }}>{Icons.settings({ size: 16 })}</button>
                      {chatSettings && (
                        <>
                          <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setChatSettings(false)} />
                          <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, width: 150, background: "#fff", border: "1px solid #E8E7E4", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", zIndex: 20, overflow: "hidden" }}>
                            <button onClick={() => { const _bid = convos.find(c => c.id === selectedConvo)?.otherUserId; setBlockTargetId(_bid); setBlockModalOpen(true); setChatSettings(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", color: "#37352F", fontSize: 13, fontFamily: font, borderBottom: "1px solid #F0EFED" }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4" y1="4" x2="20" y2="20"/></svg> Block User
                            </button>
                            <button onClick={() => { setReportModalOpen(true); setChatSettings(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", color: "#37352F", fontSize: 13, fontFamily: font, borderBottom: "1px solid #F0EFED" }}>
                              {Icons.flag({ size: 14 })} Report User
                            </button>
                            <button onClick={() => { setChatMessages(p => ({ ...p, [selectedConvo]: [] })); setChatSettings(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", color: "#DC2626", fontSize: 13, fontFamily: font }}>
                              {Icons.trash({ size: 14 })} Clear Chat
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ flex: 1, padding: 18, overflow: "auto", background: "#FAFAF8", display: "flex", flexDirection: "column", gap: 12 }}>
                    {currentMsgs.map(m => (
                      <div key={m.id} style={{ maxWidth: "75%", alignSelf: m.sender === "me" ? "flex-end" : "flex-start" }}>
                        <div style={{ padding: "10px 14px", borderRadius: m.sender === "me" ? "12px 12px 2px 12px" : "12px 12px 12px 2px", background: m.sender === "me" ? "#37352F" : "#fff", color: m.sender === "me" ? "#fff" : "#37352F", border: m.sender === "me" ? "none" : "1px solid #E8E7E4", fontSize: 14, lineHeight: 1.5, fontFamily: font }}>
                          {m.text}
                        </div>
                        <div style={{ fontSize: 10, color: "#9B9A97", marginTop: 4, textAlign: m.sender === "me" ? "right" : "left" }}>{m.time}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: "12px 18px", borderTop: "1px solid #E8E7E4" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") sendChatMessage(); }}
                        placeholder="Type a message..." style={{ flex: 1, padding: "10px 16px", borderRadius: 20, border: "1px solid #E0E0DE", fontSize: 13, outline: "none", fontFamily: font, background: "#FAFAF8" }} />
                      <button onClick={sendChatMessage} style={{ padding: "8px 12px", borderRadius: "50%", background: chatInput.trim() ? "#37352F" : "#E8E7E4", border: "none", cursor: chatInput.trim() ? "pointer" : "default", color: "#fff", display: "flex", alignItems: "center" }}>
                        {Icons.send({ size: 16 })}
                      </button>
                    </div>
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
                      localStorage.setItem("indin_profile_cache", JSON.stringify(updatedUser));
                      window.location.reload();
                    } catch (err) { alert("Upload failed: " + (err.message || "Unknown error")); }
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
              {user.linkedinUrl && (
                <div style={{ marginTop: 16 }}>
                  <span style={{ fontSize: 12, color: "#0077B5", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    {Icons.linkedin({ size: 14, stroke: "#0077B5" })} LinkedIn Verified
                  </span>
                </div>
              )}
              <button onClick={() => { setEditProfile({ ...user }); setProfileModal(true); }} style={{ ...btnPrimary, marginTop: 24 }}>
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
                posts.filter((p) => p.userId === user.id).map((p) => <PostCard key={p.id} post={p} user={user} onDelete={deletePost} onReport={(id) => setReportConfirm({ type: "post", id })} isReported={reportedIds.has(p.id)} initialLiked={likedPostIds.has(p.id)} />)
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

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF8", fontFamily: font }}>
      {/* LinkedIn block overlay - blocks after 72 hours without LinkedIn */}
      {isBlocked && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(255,255,255,0.85)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 18, padding: "40px 32px", maxWidth: 420, width: "100%", textAlign: "center", boxShadow: "0 12px 40px rgba(0,0,0,0.1)", border: "1px solid #E8E7E4" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              {Icons.shield({ size: 28, stroke: "#DC2626" })}
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#37352F", marginBottom: 8, fontFamily: font }}>Complete Your Profile</h2>
            <p style={{ fontSize: 14, color: "#9B9A97", lineHeight: 1.6, marginBottom: 24, fontFamily: font }}>Your account has been temporarily restricted because your LinkedIn profile is missing. Please add your LinkedIn URL to verify your identity and continue using NRIClub.</p>
            <button onClick={() => { setView("profile"); setEditProfile({ ...user }); setProfileModal(true); }} style={{ ...btnPrimary, width: "100%", justifyContent: "center", padding: "14px", fontSize: 15 }}>
              {Icons.edit({ size: 16 })} Complete Profile Now
            </button>
            <button onClick={onLogout} style={{ background: "none", border: "none", color: "#9B9A97", cursor: "pointer", fontSize: 12, marginTop: 16, fontFamily: font }}>Sign Out</button>
          </div>
        </div>
      )}
      {/* NAV */}
      <nav style={{ background: "#fff", borderBottom: "1px solid #E8E7E4", position: "sticky", top: 0, zIndex: 30 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px", height: 56, display: "grid", gridTemplateColumns: "240px 1fr 210px", gap: 28, alignItems: "center" }} className="nav-grid">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ background: "#37352F", color: "#fff", padding: 4, borderRadius: 6 }}>
              {Icons.globe({ size: 16 })}
            </div>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#37352F", letterSpacing: -0.5 }}>NRI<span style={{fontStyle:'italic',fontFamily:'"Times New Roman",serif'}}>Club</span></span>
          </div>

          {/* Desktop Nav - aligned with center content column */}
          <div style={{ display: "flex", alignItems: "center", background: "#F5F5F3", borderRadius: 24, padding: "3px 4px", gap: 2, justifyContent: "center" }} className="desktop-nav">
            <button style={navBtn("home")} onClick={() => setView("home")}>Feed</button>
            <button style={navBtn("network")} onClick={() => setView("network")}>Find</button>
            <button style={navBtn("groups")} onClick={() => { setView("groups"); setSelectedGroup(null); }}>Groups</button>
            <button style={navBtn("events")} onClick={() => setView("events")}>Events</button>
            <button style={navBtn("trending")} onClick={() => setView("trending")}>Trending</button>
            <button style={navBtn("docs")} onClick={() => setView("docs")}>Doc</button>
            <button style={navBtn("market")} onClick={() => setView("market")}>Market</button>
            <button style={navBtn("help")} onClick={() => setView("help")}>Help</button>
          </div>

          {/* Right side icons */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
            {/* Notification Bell */}
            <div style={{ position: "relative" }}>
              <button onClick={() => { setNotifOpen(!notifOpen); setSettingsOpen(false); }}
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
                      {notifications.map(n => (
                        <div key={n.id} onClick={() => {
                          // Navigate based on notification type
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
                          } else if (n.type === "event") {
                            setView("events");
                            setNotifOpen(false);
                          } else if (n.type === "group") {
                            setView("groups");
                            setNotifOpen(false);
                          } else if (n.type === "message") {
                            setView("messages");
                            setNotifOpen(false);
                          }
                        }} style={{ padding: "14px 18px", borderBottom: "1px solid #F0EFED", display: "flex", gap: 12, background: n.read ? "#fff" : "#F5F8FF", cursor: n.type !== "request" ? "pointer" : "default" }}>
                          <div style={{ flexShrink: 0, marginTop: 2 }}>
                            {n.actor ? (
                              <div style={{ position: "relative" }}>
                                <Avatar name={n.actor} size={36} />
                                {n.type === "like" && <div style={{ position: "absolute", bottom: -2, left: -2, width: 16, height: 16, borderRadius: "50%", background: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>{Icons.heart({ size: 8, fill: "#fff", stroke: "#fff" })}</div>}
                                {n.type === "comment" && <div style={{ position: "absolute", bottom: -2, left: -2, width: 16, height: 16, borderRadius: "50%", background: "#22C55E", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>{Icons.message({ size: 8, stroke: "#fff" })}</div>}
                              </div>
                            ) : (
                              <div style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: n.type === "event" ? "#FFF3E0" : n.type === "group" ? "#EDF4FF" : "#F0EFED", color: n.type === "event" ? "#E65100" : n.type === "group" ? "#5B9CFF" : "#5F5E5B" }}>
                                {n.type === "event" ? Icons.calendar({ size: 16 }) : n.type === "group" ? Icons.users({ size: 16 }) : Icons.trending({ size: 16 })}
                              </div>
                            )}
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13, color: "#37352F", lineHeight: 1.4, fontFamily: font, margin: 0 }}>
                              {n.actor && <strong>{n.actor} </strong>}{n.text}
                            </p>
                            <p style={{ fontSize: 11, color: "#9B9A97", marginTop: 3, fontFamily: font }}>{n.time}</p>
                            {n.type === "request" && (
                              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                <button onClick={async () => {
                                  // Accept the connection request
                                  if (n.reference_id) {
                                    try { await api.respondToNamaste(n.reference_id, true); } catch(e) {}
                                  }
                                  // Add to followers
                                  if (n.actor) {
                                    setMyFollowers(prev => [...prev, { name: n.actor }]);
                                    setAcceptedConnections(prev => { const s = new Set(prev); if (n.actor_id) s.add(n.actor_id); return s; });
                                  }
                                  // Remove from local state
                                  setNotifications(p => p.filter(x => x.id !== n.id));
                                  // Mark as handled in DB so it never comes back
                                  try { await api.markNotificationHandled(n.id); } catch(e) {}
                                }} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: "#37352F", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Accept</button>
                                <button onClick={async () => {
                                  if (n.reference_id) {
                                    try { await api.respondToNamaste(n.reference_id, false); } catch(e) {}
                                  }
                                  setNotifications(p => p.filter(x => x.id !== n.id));
                                  // Mark as handled in DB
                                  try { await api.markNotificationHandled(n.id); } catch(e) {}
                                }} style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid #E0E0DE", background: "#fff", color: "#5F5E5B", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Ignore</button>
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
            {/* Settings gear */}
            <div style={{ position: "relative" }}>
              <button onClick={() => { setSettingsOpen(!settingsOpen); setNotifOpen(false); }}
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
                      { key: "account", icon: Icons.user, label: "Account Settings" },
                      { key: "privacy", icon: Icons.shield, label: "Privacy & Safety" },
                      { key: "blocked", icon: Icons.x, label: "Blocked Users" },
                      { key: "notifications", icon: Icons.bell, label: "Notifications" },
                      { key: "activity", icon: Icons.trending, label: "Activity Log" },
                    ].map(item => (
                      <button key={item.key} onClick={() => { setSettingsModal(item.key); setSettingsOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 18px", border: "none", background: "none", cursor: "pointer", color: "#37352F", fontSize: 13, fontFamily: font }}
                        onMouseOver={(e) => e.currentTarget.style.background = "#FAFAF8"}
                        onMouseOut={(e) => e.currentTarget.style.background = "none"}>
                        {item.icon({ size: 16, stroke: "#9B9A97" })} {item.label}
                      </button>
                    ))}
                    <div style={{ height: 1, background: "#F0EFED", margin: "4px 0" }} />
                    {[
                      { key: "helpCenter", icon: Icons.help, label: "Help Center" },
                      { key: "terms", icon: Icons.file, label: "Terms & Policy" },
                    ].map(item => (
                      <button key={item.key} onClick={() => { setSettingsModal(item.key); setSettingsOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 18px", border: "none", background: "none", cursor: "pointer", color: "#37352F", fontSize: 13, fontFamily: font }}
                        onMouseOver={(e) => e.currentTarget.style.background = "#FAFAF8"}
                        onMouseOut={(e) => e.currentTarget.style.background = "none"}>
                        {item.icon({ size: 16, stroke: "#9B9A97" })} {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* Avatar */}
            <button onClick={() => setView("profile")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <Avatar name={user.name} size={32} url={user.avatar_url || user.avatarUrl} />
            </button>
            <button onClick={() => setMobileMenu(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#37352F", display: "none" }} className="mobile-menu-btn">
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
              { v: "home", icon: Icons.home, label: "Feed" },
              { v: "network", icon: Icons.search, label: "Find" },
              { v: "groups", icon: Icons.users, label: "Communities" },
              { v: "events", icon: Icons.calendar, label: "Events" },
              { v: "trending", icon: Icons.trending, label: "Trending" },
              { v: "docs", icon: Icons.file, label: "Docs" },
              { v: "market", icon: Icons.shop, label: "Marketplace" },
              { v: "help", icon: Icons.help, label: "Help" },
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

      {/* LinkedIn warning banner */}
      {!hasLinkedin && !linkedinBannerDismissed && !isBlocked && (
        <div style={{ background: "#FEF2F2", borderBottom: "1px solid #FECACA", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          <p style={{ fontSize: 12, color: "#991B1B", margin: 0, fontFamily: font }}>
            {Icons.info({ size: 14, stroke: "#DC2626" })} Your profile is incomplete. Please add your LinkedIn URL within {Math.max(0, Math.ceil(72 - hoursOld))} hours to keep your account active.
          </p>
          <button onClick={() => { setView("profile"); setEditProfile({ ...user }); setProfileModal(true); setLinkedinBannerDismissed(true); }} style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: "#DC2626", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: font }}>Add LinkedIn</button>
          <button onClick={() => setLinkedinBannerDismissed(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#991B1B", padding: 2 }}>{Icons.x({ size: 14 })}</button>
        </div>
      )}

      {/* Profile under review banner (blue) - shows until admin approves */}
      {!user?.linkedin_verified && (
        <div style={{ background: "#EFF6FF", borderBottom: "1px solid #BFDBFE", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#DBEAFE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {Icons.shield({ size: 14, stroke: "#2563EB" })}
          </div>
          <p style={{ fontSize: 12, color: "#1E40AF", margin: 0, fontFamily: font, lineHeight: 1.5 }}>
            Your profile is pending review by our team. Once approved, this banner will disappear. Please ensure your LinkedIn profile is up-to-date and your signup details are accurate.
          </p>
        </div>
      )}

      {/* Create Post Modal */}
      {createPostModal && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => { setCreatePostModal(null); setNewPost(""); setPostImage(null); }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 500, maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>
                {createPostModal === "text" ? "Write a Post" : createPostModal === "photo" ? "Share a Photo" : "Share a Link"}
              </h3>
              <button onClick={() => { setCreatePostModal(null); setNewPost(""); setPostImage(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
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

              {/* Text area - always shown */}
              <textarea
                value={newPost} onChange={(e) => setNewPost(e.target.value)}
                placeholder={createPostModal === "link" ? "Paste a link and add your thoughts..." : createPostModal === "photo" ? "Add a caption for your photo..." : `What's on your mind, ${user.name.split(" ")[0]}?`}
                style={{ width: "100%", padding: "14px", borderRadius: 10, border: "1px solid #E0E0DE", fontSize: 14, background: "#FAFAF8", outline: "none", color: "#37352F", fontFamily: font, boxSizing: "border-box", minHeight: createPostModal === "text" ? 140 : 80, resize: "vertical" }}
                autoFocus
              />

              {/* Photo upload - for photo mode */}
              {createPostModal === "photo" && (
                <div style={{ marginTop: 14 }}>
                  <input type="file" accept="image/*" id="modal-photo-upload" style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const preview = URL.createObjectURL(file);
                        const url = await api.uploadPostImage(file);
                        setPostImage({ url, preview });
                      } catch (err) { alert("Upload failed: " + err.message); }
                    }}
                  />
                  {postImage ? (
                    <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
                      <img src={postImage.preview} alt="" style={{ width: "100%", maxHeight: 300, objectFit: "cover", borderRadius: 10 }} />
                      <button onClick={() => setPostImage(null)} style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icons.x({ size: 14 })}</button>
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

              {/* Link hint for link mode */}
              {createPostModal === "link" && (
                <p style={{ fontSize: 11, color: "#9B9A97", marginTop: 6, fontFamily: font }}>Paste any URL — YouTube, Instagram, TikTok, articles, etc. A preview will be shown automatically.</p>
              )}
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #F0EFED", display: "flex", justifyContent: "flex-end", gap: 12, background: "#FAFAF8", borderRadius: "0 0 16px 16px" }}>
              <button onClick={() => { setCreatePostModal(null); setNewPost(""); setPostImage(null); }} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font }}>Cancel</button>
              <button onClick={() => { createPost(); setCreatePostModal(null); }} disabled={!newPost.trim() && !postImage} style={{
                padding: "10px 24px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600,
                background: (newPost.trim() || postImage) ? "#37352F" : "#E8E7E4",
                color: (newPost.trim() || postImage) ? "#fff" : "#9B9A97",
                cursor: (newPost.trim() || postImage) ? "pointer" : "default", fontFamily: font,
              }}>Publish</button>
            </div>
          </div>
        </div>
      )}

      {/* Blocked user overlay */}
      {user?.status === "blocked" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, maxWidth: 420, width: "100%", padding: 32, textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4" y1="4" x2="20" y2="20"/></svg>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#37352F", marginBottom: 8, fontFamily: font }}>Profile Blocked</h2>
            <p style={{ fontSize: 14, color: "#5F5E5B", lineHeight: 1.6, marginBottom: 20, fontFamily: font }}>
              Your profile has been blocked by our admin team. You have <strong>72 hours</strong> to update your LinkedIn profile and ensure your signup details are accurate.
            </p>
            <p style={{ fontSize: 13, color: "#9B9A97", marginBottom: 24, fontFamily: font }}>
              Once you've updated your details, our team will review and reactivate your profile. If you believe this is an error, please contact support.
            </p>
            <button onClick={onLogout} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#37352F", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Sign Out</button>
          </div>
        </div>
      )}

      {/* MAIN */}
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 16px 100px", display: "grid", gridTemplateColumns: (view === "profile" || view === "trending") ? "1fr" : "240px 1fr 210px", gap: 28 }} className="main-grid">
        {view !== "profile" && view !== "trending" && (
          <aside className="sidebar-left" style={{ position: "sticky", top: 80, alignSelf: "start" }}>
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E8E7E4", padding: "24px 20px", textAlign: "center", position: "relative" }}>
              {/* Edit button top-right */}
              <button
                onClick={() => { setEditProfile({ ...user }); setProfileModal(true); }}
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
                      localStorage.setItem("indin_profile_cache", JSON.stringify(updatedUser));
                      window.location.reload();
                    } catch (err) { alert("Upload failed: " + (err.message || "Unknown error")); }
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
                {user.linkedinUrl && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#22C55E" stroke="none">
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

              {/* Icon Grid - 4 across, 2 rows matching screenshot */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 12 }}>
                {[
                  { icon: Icons.message, view: "messages", label: "Messages", hasNotif: hasUnreadMessages },
                  { icon: Icons.calendar, view: "events", label: "Events" },
                  { icon: Icons.users, view: "groups", label: "Groups" },
                  { icon: Icons.linkedin, view: null, label: "LinkedIn", action: () => { if (user.linkedinUrl) window.open(user.linkedinUrl.startsWith("http") ? user.linkedinUrl : `https://${user.linkedinUrl}`, "_blank"); } },
                ].map((item, i) => (
                  <button key={i} onClick={() => { if (item.action) item.action(); else if (item.view) { setView(item.view); if (item.view === "messages") setHasUnreadMessages(false); } }} style={{
                    padding: 10, borderRadius: 8, border: "none", background: "none",
                    cursor: "pointer", color: "#9B9A97", display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.1s", position: "relative",
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = "#F0EFED"; e.currentTarget.style.color = "#37352F"; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#9B9A97"; }}
                  >
                    {item.icon({ size: 20 })}
                    {item.hasNotif ? <span style={{ position: "absolute", top: 6, right: 6, width: 7, height: 7, background: "#E25555", borderRadius: "50%", border: "1.5px solid #fff" }}>{""}</span> : null}
                  </button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                {[
                  { icon: Icons.file, tab: "posts", label: "Posts" },
                  { icon: Icons.image, tab: "photos", label: "Gallery" },
                ].map((item, i) => (
                  <button key={i} onClick={() => { setView("profile"); setProfileTab(item.tab); }} style={{
                    padding: 10, borderRadius: 8, border: "none", background: "none",
                    cursor: "pointer", color: "#9B9A97", display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.1s",
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = "#F0EFED"; e.currentTarget.style.color = "#37352F"; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#9B9A97"; }}
                  >
                    {item.icon({ size: 20 })}
                  </button>
                ))}
              </div>
            </div>

            {/* Sign Out link */}
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button onClick={onLogout} style={{
                background: "none", border: "none", cursor: "pointer", color: "#9B9A97",
                fontSize: 12, fontFamily: font, display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 500,
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = "#E25555")}
              onMouseOut={(e) => (e.currentTarget.style.color = "#9B9A97")}
              >
                {Icons.logout({ size: 14 })} Sign Out
              </button>
            </div>
          </aside>
        )}

        <div>{renderContent()}</div>

        {view !== "profile" && view !== "trending" && (
          <aside className="sidebar-right" style={{ position: "sticky", top: 80, alignSelf: "start" }}>
            <div style={{ marginBottom: 28 }}>
              <h4 style={{ fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, fontFamily: font }}>Communities</h4>
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
              {events.slice(0, 2).map((e) => (
                <div key={e.id} onClick={() => setView("events")} style={{ marginBottom: 14, cursor: "pointer" }}
                  onMouseOver={(ev) => ev.currentTarget.querySelector(".ev-title").style.textDecoration = "underline"}
                  onMouseOut={(ev) => ev.currentTarget.querySelector(".ev-title").style.textDecoration = "none"}
                >
                  <div style={{ fontSize: 11, color: "#9B9A97", fontFamily: font, marginBottom: 2 }}>{e.date.split("•")[0].trim()}</div>
                  <div className="ev-title" style={{ fontSize: 14, color: "#37352F", fontWeight: 600, fontFamily: font, lineHeight: 1.3 }}>{e.title}</div>
                </div>
              ))}
            </div>

            {/* PEOPLE IN YOUR CITY */}
            {user.location && (
              <div style={{ marginTop: 28 }}>
                <h4 style={{ fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, fontFamily: font }}>People in {(user.location || "").split(",")[0]}</h4>
                {networkUsers.filter(u => (u.location || "").toLowerCase().includes((user.location || "").split(",")[0].toLowerCase())).length > 0 ? (
                  networkUsers.filter(u => (u.location || "").toLowerCase().includes((user.location || "").split(",")[0].toLowerCase())).slice(0, 4).map(u => (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                      <Avatar name={u.name} size={32} url={u.avatar_url} />
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
                  ))
                ) : (
                  <p style={{ fontSize: 11, color: "#9B9A97", fontFamily: font }}>No users found in your city yet. <button onClick={() => setView("network")} style={{ background: "none", border: "none", color: "#37352F", cursor: "pointer", textDecoration: "underline", fontSize: 11, fontFamily: font }}>Find people</button></p>
                )}
                <button onClick={() => setView("network")} style={{ background: "none", border: "none", color: "#5B9CFF", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: font, marginTop: 8, padding: 0 }}>See all →</button>
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
          { v: "messages", icon: Icons.message, label: "Chat", notif: hasUnreadMessages },
          { v: "groups", icon: Icons.users, label: "Groups" },
          { v: "profile", icon: Icons.user, label: "Me" },
        ].map((item) => (
          <button
            key={item.v}
            onClick={() => { setView(item.v); if (item.v === "groups") setSelectedGroup(null); if (item.v === "messages") setHasUnreadMessages(false); }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none", border: "none", cursor: "pointer", color: view === item.v ? "#37352F" : "#9B9A97", fontSize: 9, fontWeight: 500, fontFamily: font, position: "relative" }}
          >
            {item.icon({ size: 20 })}
            {item.notif ? <span style={{ position: "absolute", top: -2, right: -2, width: 7, height: 7, background: "#E25555", borderRadius: "50%", border: "1.5px solid #fff" }}>{""}</span> : null}
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
              style={{ height: 280, position: "relative", borderRadius: "18px 18px 0 0", overflow: "hidden", touchAction: "pan-y",
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

              {/* Thumbnail strip */}
              {hasPhotos && photos.length > 1 && (
                <div style={{ position: "absolute", bottom: 28, right: 14, display: "flex", gap: 4 }}>
                  {photos.map((p, i) => (
                    <button key={i} onClick={(e) => { e.stopPropagation(); setMarketPhotoIdx(i); }} style={{ width: 36, height: 36, borderRadius: 6, border: i === marketPhotoIdx ? "2px solid #fff" : "2px solid transparent", overflow: "hidden", cursor: "pointer", padding: 0, opacity: i === marketPhotoIdx ? 1 : 0.6, transition: "all 0.2s" }}>
                      <img src={p} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </button>
                  ))}
                </div>
              )}

              <button onClick={() => { setExpandedMarketItem(null); setMarketPhotoIdx(0); }} style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", border: "none", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {Icons.x({ size: 16 })}
              </button>
              <div style={{ position: "absolute", top: 14, left: 14, background: "rgba(255,255,255,0.95)", backdropFilter: "blur(4px)", padding: "6px 14px", borderRadius: 6, fontSize: 14, fontWeight: 700, color: "#37352F" }}>{expandedMarketItem.price}</div>
              <div style={{ position: "absolute", bottom: hasPhotos && photos.length > 1 ? 70 : 14, left: 14, background: "rgba(0,0,0,0.6)", padding: "4px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em" }}>{expandedMarketItem.category}</div>
              {hasPhotos && photos.length > 1 && (
                <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.5)", padding: "3px 10px", borderRadius: 10, fontSize: 11, color: "#fff", fontWeight: 600 }}>{marketPhotoIdx + 1} / {photos.length}</div>
              )}
            </div>

            {/* Content */}
            <div style={{ padding: "24px 28px" }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", marginBottom: 8, fontFamily: font, lineHeight: 1.3 }}>{expandedMarketItem.title}</h2>
              
              {/* Price highlight */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#F0EFED", borderRadius: 8, marginBottom: 20 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#37352F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
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
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font }}>{expandedMarketItem.category}</div>
                </div>
                <div style={{ padding: "12px 14px", background: "#FAFAF8", borderRadius: 8, border: "1px solid #EDEDEB" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, fontFamily: font }}>Seller</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font, display: "flex", alignItems: "center", gap: 6 }}><Avatar name={expandedMarketItem.seller} size={18} /> {expandedMarketItem.seller}</div>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={() => { setSelectedMarketItem(expandedMarketItem); setContactMsg(`Hi ${expandedMarketItem.seller.split(" ")[0]}, is this still available?`); setExpandedMarketItem(null); }} style={{ ...btnPrimary, flex: 1, justifyContent: "center", padding: "12px", fontSize: 14 }}>
                  {Icons.send({ size: 15 })} Contact Seller
                </button>
                <button onClick={() => setExpandedMarketItem(null)} style={{ padding: "12px 20px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", color: "#5F5E5B", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: font }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Expanded Event Modal */}
      {expandedEvent && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => { setExpandedEvent(null); setEventComment(""); }}>
          <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 560, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={(ev) => ev.stopPropagation()}>
            {/* Hero */}
            <div style={{ height: 180, background: "linear-gradient(135deg, #7BA88A, #5A8070)", position: "relative", borderRadius: "18px 18px 0 0", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <button onClick={() => { setExpandedEvent(null); setEventComment(""); }} style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.4)", border: "none", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {Icons.x({ size: 16 })}
              </button>
              <div style={{ position: "absolute", bottom: 16, left: 16, background: "rgba(255,255,255,0.95)", padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700, color: "#37352F", fontFamily: font }}>{expandedEvent.date}</div>
              <div style={{ position: "absolute", top: 16, left: 16, background: "rgba(0,0,0,0.5)", padding: "4px 10px", borderRadius: 12, fontSize: 11, color: "#fff", fontWeight: 600 }}>{expandedEvent.attendees} going</div>
            </div>
            <div style={{ padding: "24px 28px" }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: "#37352F", marginBottom: 12, fontFamily: font, lineHeight: 1.3 }}>{expandedEvent.title}</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
                <span style={{ fontSize: 13, color: "#5F5E5B", display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "#F0EFED", borderRadius: 6 }}>{Icons.clock({ size: 14 })} {expandedEvent.time}</span>
                <span style={{ fontSize: 13, color: "#5F5E5B", display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "#F0EFED", borderRadius: 6 }}>{Icons.mapPin({ size: 14 })} {expandedEvent.location}</span>
              </div>
              <p style={{ fontSize: 14, color: "#5F5E5B", lineHeight: 1.7, marginBottom: 20, fontFamily: font, whiteSpace: "pre-wrap" }}>{expandedEvent.description}</p>
              {expandedEvent.link && (
                <a href={expandedEvent.link.startsWith("http") ? expandedEvent.link : `https://${expandedEvent.link}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 14, color: "#fff", padding: "12px", background: "#5B9CFF", borderRadius: 8, textDecoration: "none", fontWeight: 600, marginBottom: 16, fontFamily: font }}>
                  {Icons.link({ size: 15 })} Get Tickets / More Info
                </a>
              )}
              <div style={{ fontSize: 12, color: "#9B9A97", paddingTop: 14, borderTop: "1px solid #F0EFED", marginBottom: 14 }}>Hosted by <strong style={{ color: "#37352F" }}>{expandedEvent.organizer}</strong></div>
              <button onClick={() => { toggleRsvp(expandedEvent.id); }} style={{ ...btnPrimary, width: "100%", justifyContent: "center", padding: "12px", background: rsvps.has(expandedEvent.id) ? "#E3FCEF" : "#37352F", color: rsvps.has(expandedEvent.id) ? "#22A06B" : "#fff", border: rsvps.has(expandedEvent.id) ? "1px solid #B5E4CA" : "none" }}>
                {rsvps.has(expandedEvent.id) ? "✓ Going" : "RSVP to Event"}
              </button>
              
              {/* Comments section */}
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #F0EFED" }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: "#37352F", marginBottom: 14, fontFamily: font }}>Comments ({(eventComments[expandedEvent.id] || []).length})</h4>
                {(eventComments[expandedEvent.id] || []).map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12, padding: "10px 12px", background: "#FAFAF8", borderRadius: 8 }}>
                    <Avatar name={c.user} size={28} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#37352F", fontFamily: font }}>{c.user}</span>
                        <span style={{ fontSize: 10, color: "#9B9A97" }}>{c.time}</span>
                      </div>
                      <p style={{ fontSize: 13, color: "#5F5E5B", marginTop: 3, fontFamily: font, lineHeight: 1.5 }}>{c.text}</p>
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <Avatar name={user.name} size={28} url={user.avatar_url} />
                  <div style={{ flex: 1 }}>
                    <textarea value={eventComment} onChange={(ev) => setEventComment(ev.target.value)} placeholder="Write a comment..." style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 13, background: "#FAFAF8", outline: "none", fontFamily: font, minHeight: 50, resize: "none", boxSizing: "border-box" }} />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                      <button disabled={!eventComment.trim()} onClick={() => {
                        const newC = { user: user.name, text: eventComment, time: "Just now" };
                        setEventComments(prev => ({ ...prev, [expandedEvent.id]: [...(prev[expandedEvent.id] || []), newC] }));
                        setEventComment("");
                      }} style={{ ...btnPrimary, padding: "6px 14px", fontSize: 12, opacity: eventComment.trim() ? 1 : 0.4 }}>Post</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share External Link Modal */}
      {linkModal && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => { setLinkModal(false); setExternalLinkInput(""); setExternalLinkNote(""); }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid #F0EFED", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Share an External Link</h3>
              <button onClick={() => { setLinkModal(false); setExternalLinkInput(""); setExternalLinkNote(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#5F5E5B", fontFamily: font, display: "block", marginBottom: 6 }}>Paste a link (TikTok, Instagram, YouTube, X, etc.)</label>
              <input value={externalLinkInput} onChange={(e) => setExternalLinkInput(e.target.value)} placeholder="https://..." style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 13, background: "#FAFAF8", outline: "none", fontFamily: font, boxSizing: "border-box", marginBottom: 14 }} />
              <label style={{ fontSize: 12, fontWeight: 600, color: "#5F5E5B", fontFamily: font, display: "block", marginBottom: 6 }}>Add a caption (optional)</label>
              <textarea value={externalLinkNote} onChange={(e) => setExternalLinkNote(e.target.value)} placeholder="What's this about?" style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 13, background: "#FAFAF8", outline: "none", fontFamily: font, boxSizing: "border-box", minHeight: 70, resize: "none" }} />
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #F0EFED", display: "flex", justifyContent: "flex-end", gap: 10, background: "#FAFAF8" }}>
              <button onClick={() => { setLinkModal(false); setExternalLinkInput(""); setExternalLinkNote(""); }} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 13, color: "#5F5E5B", background: "#fff", cursor: "pointer", fontFamily: font }}>Cancel</button>
              <button disabled={!externalLinkInput.trim() || !externalLinkInput.match(/^https?:\/\//i)} onClick={async () => {
                const url = externalLinkInput.trim();
                const content = externalLinkNote.trim() ? `${externalLinkNote.trim()}\n\n${url}` : url;
                const tags = ["__external__"];
                const hashtags = content.match(/#(\w+)/g);
                if (hashtags) hashtags.forEach((h) => tags.push(h.replace("#", "")));
                const post = {
                  id: "p_" + Date.now(), userId: user.id, content,
                  author: { name: user.name, profession: user.profession, location: user.location, hometown: user.hometown },
                  likes: 0, comments: [], tags, timestamp: Date.now(), groupName: null,
                  image: null, externalUrl: url,
                };
                setPosts([post, ...posts]);
                setLinkModal(false);
                setExternalLinkInput("");
                setExternalLinkNote("");
                try { const r = await api.createPost(content, tags, null); if (r?.[0]) setPosts(prev => prev.map(p => p.id === post.id ? { ...p, id: r[0].id } : p)); } catch(e) {}
              }} style={{ ...btnPrimary, padding: "10px 20px", opacity: (externalLinkInput.trim() && externalLinkInput.match(/^https?:\/\//i)) ? 1 : 0.4 }}>Share Link</button>
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
                <textarea value={contactMsg} onChange={(e) => setContactMsg(e.target.value)} style={{ ...inputStyle, minHeight: 90, resize: "none" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button onClick={() => setSelectedMarketItem(null)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font }}>Cancel</button>
                <button onClick={async () => {
                  if (!contactMsg.trim()) return;
                  try {
                    const sellerId = selectedMarketItem.user_id;
                    if (!sellerId) {
                      alert("Could not find seller's user ID. Please try again.");
                      return;
                    }
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
                      alert("Could not create conversation. Please try again.");
                    }
                  } catch (e) { alert("Failed to send: " + (e.message || "")); }
                  setSelectedMarketItem(null);
                  setContactMsg("");
                }} style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 6 }}>{Icons.send({ size: 14 })} Send Message</button>
              </div>
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
              <h4 style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16, fontFamily: font }}>Personal Information</h4>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Full Name</label>
                <input style={inputStyle} value={accountName} onChange={(e) => setAccountName(e.target.value)} />
              </div>
              <div style={{ marginBottom: 6 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Email Address</label>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}>{Icons.message({ size: 14 })}</div>
                  <input style={{ ...inputStyle, paddingLeft: 36, background: "#F0EFED", color: "#9B9A97" }} value={user.email || `${user.name.toLowerCase().replace(/\s+/g, ".")}@indin.com`} readOnly disabled />
                </div>
                <p style={{ fontSize: 11, color: "#9B9A97", marginTop: 4, fontFamily: font }}>Contact support to change email.</p>
              </div>
              <div style={{ borderTop: "1px solid #F0EFED", marginTop: 20, paddingTop: 20 }}>
                <h4 style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16, fontFamily: font }}>Security</h4>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Current Password</label>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
                    <input type="password" style={{ ...inputStyle, paddingLeft: 36 }} placeholder="••••••••" />
                  </div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>New Password</label>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
                    <input type="password" style={{ ...inputStyle, paddingLeft: 36 }} placeholder="••••••••" />
                  </div>
                </div>
              </div>
              <div style={{ borderTop: "1px solid #F0EFED", paddingTop: 20 }}>
                <h4 style={{ fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontFamily: font, display: "flex", alignItems: "center", gap: 5 }}>
                  {Icons.shield({ size: 13 })} Data & Privacy (GDPR)
                </h4>
                <p style={{ fontSize: 12, color: "#9B9A97", marginBottom: 14, lineHeight: 1.5, fontFamily: font }}>Under EU GDPR, you have the right to access, export, and delete your personal data.</p>
                <button onClick={() => {
                  const data = {
                    profile: { name: user.name, email: user.email, location: user.location, hometown: user.hometown, profession: user.profession, linkedinUrl: user.linkedinUrl, yearsAbroad: user.yearsAbroad, createdAt: user.createdAt || user.created_at },
                    exportDate: new Date().toISOString(),
                    note: "This file contains all personal data stored by NRIClub. Posts, comments, and messages are stored separately in the database."
                  };
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = "nriclub-my-data.json"; a.click();
                  URL.revokeObjectURL(url);
                }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", color: "#37352F", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 10 }}>
                  {Icons.share({ size: 14 })} Download My Data
                </button>
              </div>
              <div style={{ borderTop: "1px solid #F0EFED", paddingTop: 20, marginTop: 10 }}>
                <h4 style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontFamily: font, display: "flex", alignItems: "center", gap: 5 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  Danger Zone
                </h4>
                <p style={{ fontSize: 12, color: "#9B9A97", marginBottom: 10, lineHeight: 1.5, fontFamily: font }}>Permanently delete your account and all associated data. This action cannot be undone.</p>
                <button onClick={async () => { 
                  if (confirm("Are you absolutely sure you want to delete your account? ALL your data — posts, likes, comments, messages, connections, photos — will be permanently removed. This cannot be undone.")) {
                    if (confirm("This is your final warning. Type OK in the next prompt to confirm.") && prompt("Type DELETE to confirm account deletion:") === "DELETE") {
                      try {
                        await api.deleteAccount();
                      } catch(e) {}
                      localStorage.clear();
                      setSettingsModal(null);
                      onLogout();
                    }
                  }
                }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {Icons.trash({ size: 14 })} Delete My Account
                </button>
              </div>
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #F0EFED", display: "flex", justifyContent: "flex-end", gap: 12, background: "#FAFAF8" }}>
              <button onClick={() => setSettingsModal(null)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font }}>Cancel</button>
              <button onClick={() => setSettingsModal(null)} style={btnPrimary}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Settings Modal */}
      {settingsModal === "privacy" && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setSettingsModal(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Privacy Settings</h3>
              <button onClick={() => setSettingsModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              {[
                { label: "Profile Visibility", desc: "Control who can see your profile details.", key: "visibility", type: "select", options: ["Everyone", "Connections Only", "Only Me"] },
                { label: "Online Status", desc: "Show when you are active.", key: "onlineStatus", type: "toggle" },
                { label: "Namaste Requests", desc: "Who can send you connection requests.", key: "namasteRequests", type: "select", options: ["Everyone", "Nobody"] },
                { label: "Receive Messages", desc: "Who can send you direct messages.", key: "receiveMessages", type: "select", options: ["Everyone", "Connections Only", "Nobody"] },
              ].map((item, i) => (
                <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: i < 3 ? "1px solid #F0EFED" : "none" }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font }}>{item.label}</h4>
                    <p style={{ fontSize: 12, color: "#9B9A97", marginTop: 2, fontFamily: font }}>{item.desc}</p>
                  </div>
                  {item.type === "toggle" ? (
                    <button onClick={() => setPrivSettings(p => ({...p, [item.key]: !p[item.key]}))} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: privSettings[item.key] ? "#22C55E" : "#D4D4D2", position: "relative", padding: 0, flexShrink: 0 }}>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: privSettings[item.key] ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }} />
                    </button>
                  ) : (
                    <select value={privSettings[item.key]} onChange={(e) => setPrivSettings(p => ({...p, [item.key]: e.target.value}))} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #E0E0DE", fontSize: 12, background: "#F0EFED", color: "#37352F", fontFamily: font, cursor: "pointer", flexShrink: 0 }}>
                      {item.options.map(o => <option key={o}>{o}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #F0EFED", display: "flex", justifyContent: "flex-end", gap: 10, background: "#FAFAF8" }}>
              <button onClick={() => setSettingsModal(null)} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 13, color: "#5F5E5B", background: "#fff", cursor: "pointer", fontFamily: font }}>Cancel</button>
              <button onClick={async () => {
                try {
                  await api.saveUserSettings({
                    profile_visibility: privSettings.visibility,
                    online_status: privSettings.onlineStatus,
                    namaste_requests: privSettings.namasteRequests,
                    receive_messages: privSettings.receiveMessages,
                  });
                } catch(e) {}
                setSettingsModal(null);
              }} style={{ ...btnPrimary, padding: "10px 20px" }}>Save Settings</button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Preferences Modal */}
      {settingsModal === "notifications" && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setSettingsModal(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Notification Preferences</h3>
              <button onClick={() => setSettingsModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              {[
                { label: "Email Notifications", desc: "Receive updates via email.", key: "email" },
                { label: "Push Notifications", desc: "Receive push notifications on your device.", key: "push" },
                { label: "Marketing Emails", desc: "Receive news and special offers.", key: "marketing" },
              ].map((item, i) => (
                <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: i < 2 ? "1px solid #F0EFED" : "none" }}>
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font }}>{item.label}</h4>
                    <p style={{ fontSize: 12, color: "#9B9A97", marginTop: 2, fontFamily: font }}>{item.desc}</p>
                  </div>
                  <button onClick={() => setNotifSettings(p => ({...p, [item.key]: !p[item.key]}))} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: notifSettings[item.key] ? "#37352F" : "#D4D4D2", position: "relative", padding: 0, flexShrink: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: notifSettings[item.key] ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }} />
                  </button>
                </div>
              ))}
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid #F0EFED", display: "flex", justifyContent: "flex-end", gap: 10, background: "#FAFAF8" }}>
              <button onClick={() => setSettingsModal(null)} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 13, color: "#5F5E5B", background: "#fff", cursor: "pointer", fontFamily: font }}>Cancel</button>
              <button onClick={async () => {
                try {
                  await api.saveUserSettings({
                    email_notifications: notifSettings.email,
                    push_notifications: notifSettings.push,
                    marketing_emails: notifSettings.marketing,
                  });
                } catch(e) {}
                setSettingsModal(null);
              }} style={{ ...btnPrimary, padding: "10px 20px" }}>Save Settings</button>
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
                posts.filter(p => p.userId === user.id).forEach(p => activities.push({ action: "Posted", target: p.content.substring(0, 40) + (p.content.length > 40 ? "..." : ""), time: new Date(p.timestamp).toLocaleString() }));
                groups.filter(g => g.joined).forEach(g => activities.push({ action: "Joined group", target: g.name, time: "Recently" }));
                helpRequests.filter(h => h.user === user.name).forEach(h => activities.push({ action: "Asked for help", target: h.title, time: new Date(h.timestamp).toLocaleString() }));
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

      {/* Help Center Modal */}
      {settingsModal === "helpCenter" && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setSettingsModal(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F0EFED" }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Help & Support</h3>
              <button onClick={() => setSettingsModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ background: "#EDF4FF", borderRadius: 10, padding: "18px 20px", marginBottom: 24, border: "1px solid #DBEAFE" }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: "#37352F", marginBottom: 8, fontFamily: font, display: "flex", alignItems: "center", gap: 6 }}>{Icons.help({ size: 16 })} Need assistance?</h4>
                <p style={{ fontSize: 13, color: "#5F5E5B", lineHeight: 1.5, marginBottom: 14, fontFamily: font }}>Our support team is here to help you with any issues or questions you might have.</p>
                <button style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#3B5EDB", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Contact Support</button>
              </div>
              <h4 style={{ fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontFamily: font }}>FAQs</h4>
              <div style={{ border: "1px solid #E8E7E4", borderRadius: 10, overflow: "hidden" }}>
                {["How do I verify my account?", "Can I change my username?", "How to report a user?"].map((q, i) => (
                  <div key={i} style={{ padding: "14px 18px", borderBottom: i < 2 ? "1px solid #F0EFED" : "none", cursor: "pointer", fontSize: 14, color: "#37352F", fontFamily: font }}
                    onMouseOver={(e) => e.currentTarget.style.background = "#FAFAF8"}
                    onMouseOut={(e) => e.currentTarget.style.background = "#fff"}>
                    {q}
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
            <div style={{ padding: 24, overflow: "auto", flex: 1, fontSize: 14, color: "#5F5E5B", lineHeight: 1.7, fontFamily: font }}>
              <p><strong style={{ color: "#37352F" }}>1. Acceptance of Terms</strong><br/>By accessing and using this platform, you accept and agree to be bound by the terms and provision of this agreement.</p>
              <p style={{ marginTop: 16 }}><strong style={{ color: "#37352F" }}>2. Community Guidelines</strong><br/>We are committed to maintaining a safe and respectful community. Hate speech, harassment, and spam are strictly prohibited.</p>
              <p style={{ marginTop: 16 }}><strong style={{ color: "#37352F" }}>3. Privacy Policy</strong><br/>We respect your privacy and are committed to protecting your personal data. Please review our full Privacy Policy to understand how we collect and use your information.</p>
              <p style={{ marginTop: 16 }}><strong style={{ color: "#37352F" }}>4. User Content</strong><br/>You retain ownership of the content you post, but grant us a license to use, store, and display that content in connection with the service.</p>
              <p style={{ marginTop: 16, fontSize: 11, color: "#9B9A97", fontStyle: "italic" }}>Last updated: October 2024</p>
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
                  <div key={u.id || i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 24px", borderBottom: "1px solid #F0EFED" }}>
                    <Avatar name={u.name || "User"} size={40} url={u.avatar_url} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#37352F", fontFamily: font }}>{u.name || "User"}</div>
                      <div style={{ fontSize: 12, color: "#9B9A97", fontFamily: font }}>{u.profession || ""}</div>
                    </div>
                    <button onClick={() => { setFollowModal(null); setProfilePreview(u); }} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #E0E0DE", background: "#fff", fontSize: 11, fontWeight: 600, color: "#5F5E5B", cursor: "pointer", fontFamily: font }}>View</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Profile Preview Modal */}
      {profilePreview && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", zIndex: 55, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setProfilePreview(null)}>
          <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 380, padding: "32px 28px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setProfilePreview(null)} style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            
            {/* NRI Badge */}
            <span style={{ position: "absolute", top: 14, left: 14, fontSize: 9, fontWeight: 700, padding: "3px 9px", borderRadius: 4, letterSpacing: "0.05em",
              background: isUserNRI(profilePreview) ? "#E3FCEF" : "#FFF3E0",
              color: isUserNRI(profilePreview) ? "#22A06B" : "#E65100",
              border: `1px solid ${isUserNRI(profilePreview) ? "#B5E4CA" : "#FFE0B2"}`,
            }}>{isUserNRI(profilePreview) ? "NRI" : "IN"}</span>

            <Avatar name={profilePreview.name || "User"} size={80} />
            <h3 style={{ fontSize: 20, fontWeight: 700, color: "#37352F", marginTop: 14, fontFamily: font }}>{profilePreview.name}</h3>
            <p style={{ fontSize: 14, color: "#5F5E5B", marginTop: 4, fontFamily: font }}>{profilePreview.profession || ""}</p>
            
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              {(profilePreview.location || profilePreview.location) && (
                <span style={{ fontSize: 12, color: "#5F5E5B", background: "#F0EFED", padding: "4px 12px", borderRadius: 20, display: "flex", alignItems: "center", gap: 4 }}>
                  {Icons.mapPin({ size: 11 })} {(profilePreview.location || "").split(",")[0]}
                </span>
              )}
              {(profilePreview.hometown) && (
                <span style={{ fontSize: 12, color: "#5F5E5B", background: "#F0EFED", padding: "4px 12px", borderRadius: 20, display: "flex", alignItems: "center", gap: 4 }}>
                  {Icons.globe({ size: 11 })} From {(profilePreview.hometown || "").split(",")[0]}
                </span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, margin: "16px 0", fontSize: 13, fontFamily: font }}>
              <span><b style={{ color: "#37352F" }}>{profilePreview.followers || 0}</b> <span style={{ color: "#9B9A97" }}>followers</span></span>
              <span style={{ color: "#D4D4D2" }}>·</span>
              <span><b style={{ color: "#37352F" }}>{profilePreview.following || 0}</b> <span style={{ color: "#9B9A97" }}>following</span></span>
            </div>

            {profilePreview.linkedinUrl && (
              <div style={{ marginBottom: 16 }}>
                <a href={profilePreview.linkedinUrl.startsWith("http") ? profilePreview.linkedinUrl : `https://${profilePreview.linkedinUrl}`} target="_blank" style={{ fontSize: 12, color: "#0077B5", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  {Icons.linkedin({ size: 14, stroke: "#0077B5" })} LinkedIn Profile
                </a>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => { setProfilePreview(null); if (!acceptedConnections.has(profilePreview.id) && !sentNamaste.has(profilePreview.id)) handleSendNamaste(profilePreview.id); }}
                disabled={sentNamaste.has(profilePreview.id) || acceptedConnections.has(profilePreview.id)}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: acceptedConnections.has(profilePreview.id) ? "1px solid #B5E4CA" : "none", fontSize: 13, fontWeight: 600, cursor: (sentNamaste.has(profilePreview.id) || acceptedConnections.has(profilePreview.id)) ? "default" : "pointer",
                  background: acceptedConnections.has(profilePreview.id) ? "#E3FCEF" : sentNamaste.has(profilePreview.id) ? "#F0EFED" : "#37352F",
                  color: acceptedConnections.has(profilePreview.id) ? "#22A06B" : sentNamaste.has(profilePreview.id) ? "#9B9A97" : "#fff", fontFamily: font }}>
                {acceptedConnections.has(profilePreview.id) ? "Following" : sentNamaste.has(profilePreview.id) ? "Sent" : "Namaste"}
              </button>
              <button onClick={async () => {
                try {
                  const convo = await api.getOrCreateConversation(profilePreview.id);
                  if (convo) { setConvos(prev => { if (prev.find(c => c.id === convo.id)) return prev; return [{ id: convo.id, name: profilePreview.name, otherUserId: profilePreview.id, lastMsg: "", time: "", unread: false }, ...prev]; }); setSelectedConvo(convo.id); }
                } catch(e) {}
                setProfilePreview(null); setView("messages");
              }} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", color: "#5F5E5B", cursor: "pointer", fontFamily: font, display: "flex", alignItems: "center", gap: 6 }}>
                {Icons.message({ size: 14 })} Message
              </button>
            </div>
          </div>
        </div>
      )}

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
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={() => setReportConfirm(null)} style={{ padding: "10px 24px", borderRadius: 8, border: "1px solid #E0E0DE", background: "#fff", fontSize: 13, color: "#5F5E5B", cursor: "pointer", fontFamily: font }}>Cancel</button>
              <button onClick={async () => {
                const reason = `[${reportConfirm.type.toUpperCase()}] ${reportConfirm.name ? reportConfirm.name + " — " : ""}Reported as inappropriate`;
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
                  alert("Report failed: " + (e.message || "Please try again."));
                  setReportConfirm(null);
                }
              }} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#DC2626", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", fontFamily: font }}>Report</button>
            </div>
          </div>
        </div>
      )}

      {/* Blocked Users Modal */}
      {settingsModal === "blocked" && (
        <BlockedUsersModal onClose={() => setSettingsModal(null)} font={font} />
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
                Are you sure you want to block this user? They will no longer be able to message you or see your profile. This action is reversible in settings.
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
                  alert("User blocked. You can unblock them in Settings → Blocked Users.");
                }} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, background: "#DC2626", color: "#fff", cursor: "pointer", fontFamily: font }}>Confirm Block</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report User Modal */}
      {reportModalOpen && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }} onClick={() => setReportModalOpen(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FEF2F2" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#DC2626" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <h3 style={{ fontSize: 16, fontWeight: 700, fontFamily: font }}>Report User</h3>
              </div>
              <button onClick={() => setReportModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#DC2626", padding: 4 }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 14, color: "#5F5E5B", marginBottom: 20, fontFamily: font }}>Please select a reason for reporting this user:</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                {["Spam or misleading", "Harassment or hate speech", "Inappropriate content", "Violence or physical harm", "Impersonation", "Other"].map(reason => (
                  <label key={reason} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, cursor: "pointer", border: reportReason === reason ? "1px solid #37352F" : "1px solid transparent", background: reportReason === reason ? "#FAFAF8" : "transparent", transition: "all 0.1s" }}
                    onMouseOver={(e) => { if (reportReason !== reason) e.currentTarget.style.background = "#FAFAF8"; }}
                    onMouseOut={(e) => { if (reportReason !== reason) e.currentTarget.style.background = "transparent"; }}>
                    <input type="radio" name="reportReason" value={reason} checked={reportReason === reason} onChange={() => setReportReason(reason)} style={{ accentColor: "#37352F", width: 16, height: 16 }} />
                    <span style={{ fontSize: 14, color: "#37352F", fontFamily: font }}>{reason}</span>
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button onClick={() => { setReportModalOpen(false); setReportReason(""); }} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font }}>Cancel</button>
                <button onClick={async () => { try { if (activeConvo) await api.reportUser(activeConvo.id, reportReason); } catch(e) {} setReportModalOpen(false); setReportReason(""); }} disabled={!reportReason} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, background: reportReason ? "#DC2626" : "#FECACA", color: "#fff", cursor: reportReason ? "pointer" : "default", fontFamily: font, transition: "background 0.15s" }}>Submit Report</button>
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
                <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>{Icons.mapPin({ size: 12 })} Hometown</label>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}>{Icons.search({ size: 14 })}</div>
                  <input value={feedFilters.hometown} onChange={(e) => setFeedFilters({...feedFilters, hometown: e.target.value})} placeholder="Search city..." style={{ ...inputStyle, paddingLeft: 34 }} />
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>{Icons.briefcase({ size: 12 })} Occupation</label>
                <select value={feedFilters.occupation} onChange={(e) => setFeedFilters({...feedFilters, occupation: e.target.value})} style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}>
                  {["All", ...OCCUPATION_TYPES].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>{Icons.globe({ size: 12 })} NRI / Based in India</label>
                <select value={feedFilters.yearsAbroad} onChange={(e) => setFeedFilters({...feedFilters, yearsAbroad: e.target.value})} style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}>
                  {["All", "NRI", "Based in India"].map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>{Icons.users({ size: 12 })} Specific Community</label>
                <select value={feedFilters.community} onChange={(e) => setFeedFilters({...feedFilters, community: e.target.value})} style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}>
                  <option value="All">All Communities</option>
                  {groups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                </select>
              </div>
              <button onClick={() => setFilterModalOpen(false)} style={{ ...btnPrimary, width: "100%", justifyContent: "center", padding: "12px" }}>Apply Filters</button>
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
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Excerpt / Summary</label>
                <textarea style={{ ...inputStyle, minHeight: 100, resize: "none" }} value={newDoc.excerpt} onChange={(e) => setNewDoc({...newDoc, excerpt: e.target.value})} placeholder="Brief summary of your doc..." />
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
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Post an Item</h3>
              <button onClick={() => setMarketModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Title</label>
                <input style={inputStyle} value={newMarket.title} onChange={(e) => setNewMarket({...newMarket, title: e.target.value})} placeholder="What are you selling?" />
              </div>
              <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Price</label>
                  <input style={inputStyle} value={newMarket.price} onChange={(e) => setNewMarket({...newMarket, price: e.target.value})} placeholder="e.g. €50" />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Category</label>
                  <select style={{ ...inputStyle, appearance: "none", cursor: "pointer" }} value={newMarket.category} onChange={(e) => setNewMarket({...newMarket, category: e.target.value})}>
                    {["Housing", "Jobs", "Items", "Vehicles", "Services"].map(c => <option key={c}>{c}</option>)}
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
                <textarea style={{ ...inputStyle, minHeight: 100, resize: "none" }} value={newMarket.description} onChange={(e) => setNewMarket({...newMarket, description: e.target.value})} placeholder="Describe your item..." />
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
                <button disabled={!newMarket.title || !newMarket.price} onClick={async () => {
                  try {
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
                      } catch(ue) { imageUrls.push(photo); } // Fallback: store base64
                    }
                    await api.createMarketItem({ title: newMarket.title, price: newMarket.price, category: newMarket.category, location: newMarket.city, description: newMarket.description, image_url: JSON.stringify(imageUrls) });
                    // Add to local state immediately
                    setMarketItems(prev => [{ id: "m_" + Date.now(), title: newMarket.title, price: newMarket.price, category: newMarket.category, location: newMarket.city, description: newMarket.description, seller: user.name, date: new Date().toLocaleDateString(), photos: imageUrls, color: "#2D1B4E" }, ...prev]);
                  } catch(e) {}
                  setNewMarket({ title: "", price: "", category: "Items", city: "", description: "" }); setMarketPhotos([]); setMarketModal(false);
                }} style={{ ...btnPrimary, opacity: newMarket.title && newMarket.price ? 1 : 0.4 }}>Post Item</button>
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
              <h3 style={{ fontSize: 17, fontWeight: 700, color: "#37352F", fontFamily: font }}>Request New Community</h3>
              <button onClick={() => setGroupRequestModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97", padding: 4 }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              {/* Yellow info box */}
              <div style={{
                background: "#FFFDE7", border: "1px solid #FFF9C4", borderRadius: 8, padding: "16px 18px", marginBottom: 24,
              }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#8D6E00", marginBottom: 6, fontFamily: font }}>Standard Naming Convention</p>
                <p style={{ fontSize: 13, color: "#8D6E00", lineHeight: 1.55, fontFamily: font }}>
                  All community groups follow the format: <b>"Indians in [City Name]"</b>. This helps everyone find their local community easily.
                </p>
              </div>

              {/* City Name input */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>
                  City Name
                </label>
                <input
                  value={newGroupCity} onChange={(e) => setNewGroupCity(e.target.value)}
                  placeholder="e.g. Paris"
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid #E0E0DE",
                    fontSize: 14, background: "#FAFAF8", outline: "none", color: "#37352F", fontFamily: font, boxSizing: "border-box",
                  }}
                  autoFocus
                />
              </div>

              {/* Preview */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>
                  Preview
                </label>
                <div style={{
                  padding: "12px 14px", borderRadius: 8, background: "#F0EFED", fontSize: 14, color: "#9B9A97", fontWeight: 500, fontFamily: font,
                }}>
                  Indians in {newGroupCity || "..."}
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button onClick={() => setGroupRequestModal(false)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font }}>
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!newGroupCity.trim()) return;
                    try {
                      await api.requestNewGroup(newGroupCity.trim());
                      alert(`Your request to create "Indians in ${newGroupCity}" has been sent to the admin for approval.`);
                    } catch(e) {
                      alert("Failed to submit request: " + (e.message || "Please try again."));
                    }
                    setNewGroupCity("");
                    setGroupRequestModal(false);
                  }}
                  disabled={!newGroupCity.trim()}
                  style={{
                    padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600,
                    background: newGroupCity.trim() ? "#37352F" : "#E8E7E4", color: newGroupCity.trim() ? "#fff" : "#9B9A97",
                    cursor: newGroupCity.trim() ? "pointer" : "default", fontFamily: font,
                  }}
                >
                  Submit Request
                </button>
              </div>
            </div>
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
                <input style={inputStyle} value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="e.g. Diwali Night 2024" />
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
                  <input style={{ ...inputStyle, paddingLeft: 36 }} value={newEvent.location} onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })} placeholder="e.g. Central Park, NY" />
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
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Ticket / Info Link (Optional)</label>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9B9A97" }}>{Icons.link({ size: 14 })}</div>
                  <input style={{ ...inputStyle, paddingLeft: 36 }} value={newEvent.link} onChange={(e) => setNewEvent({ ...newEvent, link: e.target.value })} placeholder="https://eventbrite.com/..." />
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
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
                      catch(err) { setEventPhoto({ url: preview, preview }); }
                    }} />
                    {Icons.image({ size: 18 })} Click to add a cover photo
                  </label>
                )}
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#5F5E5B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: font }}>Description</label>
                <textarea style={{ ...inputStyle, minHeight: 100, resize: "none" }} value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} placeholder="Tell people what your event is about..." />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, paddingTop: 16, borderTop: "1px solid #F0EFED" }}>
                <button onClick={() => setEventModal(false)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer", fontFamily: font }}>Cancel</button>
                <button onClick={createEvent} disabled={!newEvent.title || !newEvent.date} style={{ ...btnPrimary, opacity: newEvent.title && newEvent.date ? 1 : 0.4 }}>Share Event</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {helpModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setHelpModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #F0EFED", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FAFAF8" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Ask for Help</h3>
              <button onClick={() => setHelpModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Title</label>
                <input style={inputStyle} value={newHelp.title} onChange={(e) => setNewHelp({ ...newHelp, title: e.target.value })} placeholder="Summarize your need..." />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Category</label>
                  <select style={{ ...inputStyle, cursor: "pointer" }} value={newHelp.category} onChange={(e) => setNewHelp({ ...newHelp, category: e.target.value })}>
                    {["General", "Housing", "Health", "Legal/Visa", "Education", "Jobs", "Travel"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Urgency</label>
                  <select style={{ ...inputStyle, cursor: "pointer" }} value={newHelp.urgency} onChange={(e) => setNewHelp({ ...newHelp, urgency: e.target.value })}>
                    {["Low", "Medium", "High"].map((u) => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>City</label>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={newHelp.city || ""} onChange={(e) => setNewHelp({ ...newHelp, city: e.target.value })}>
                  <option value="">Select a city...</option>
                  {GLOBAL_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Description</label>
                <textarea style={{ ...inputStyle, minHeight: 100, resize: "none" }} value={newHelp.description} onChange={(e) => setNewHelp({ ...newHelp, description: e.target.value })} placeholder="Provide details..." />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button onClick={() => setHelpModal(false)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer" }}>Cancel</button>
                <button onClick={createHelp} disabled={!newHelp.title || !newHelp.description} style={{ ...btnPrimary, opacity: newHelp.title && newHelp.description ? 1 : 0.4 }}>Post Request</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {profileModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setProfileModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #F0EFED", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FAFAF8" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Edit Profile</h3>
              <button onClick={() => setProfileModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9A97" }}>{Icons.x({ size: 18 })}</button>
            </div>
            <div style={{ padding: 24 }}>
              {[
                { key: "profession", label: "Profession" },
                { key: "location", label: "Location" },
                { key: "hometown", label: "Hometown" },
                { key: "linkedinUrl", label: "LinkedIn URL" },
              ].map((f) => (
                <div key={f.key} style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{f.label}</label>
                  <input style={inputStyle} value={editProfile[f.key] || ""} onChange={(e) => setEditProfile({ ...editProfile, [f.key]: e.target.value })} />
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
                <button onClick={() => setProfileModal(false)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", fontSize: 13, color: "#5F5E5B", background: "transparent", cursor: "pointer" }}>Cancel</button>
                <button onClick={saveProfileChanges} style={btnPrimary}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Responsive CSS */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; }
        body { font-family: 'DM Sans', sans-serif; background: #FAFAF8; color: #37352F; }
        input:focus, select:focus, textarea:focus { border-color: #37352F !important; background: #fff !important; }
        button:hover { opacity: 0.92; }
        .sidebar-left, .sidebar-right { display: block; }
        .desktop-nav { display: flex !important; }
        .mobile-menu-btn { display: none !important; }
        .mobile-nav { display: none !important; }

        @media (max-width: 900px) {
          .nav-grid { display: flex !important; justify-content: space-between !important; }
          .main-grid { grid-template-columns: 1fr !important; padding: 16px 12px 80px !important; }
          .sidebar-left, .sidebar-right { display: none !important; }
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: block !important; }
          .mobile-nav { display: flex !important; }
          .docs-grid, .market-grid, .network-grid, .groups-grid { grid-template-columns: 1fr !important; }
        }

        @media (max-width: 600px) {
          /* Messages */
          .msg-layout { flex-direction: column !important; height: auto !important; min-height: 500px !important; }
          .msg-sidebar { width: 100% !important; max-height: 180px !important; border-right: none !important; border-bottom: 1px solid #E8E7E4 !important; overflow-y: auto !important; }
          .msg-chat { min-height: 320px !important; }

          /* Event cards */
          .event-card { flex-direction: column !important; }
          .event-card > div:first-child { height: 160px !important; width: 100% !important; min-width: unset !important; border-radius: 12px 12px 0 0 !important; }

          /* Notification dropdown */
          .notif-dropdown { width: calc(100vw - 24px) !important; right: -80px !important; max-height: 70vh !important; overflow-y: auto !important; }

          /* Signup form grids */
          .form-grid-2, .form-grid-3 { grid-template-columns: 1fr !important; }

          /* Signup container */
          .signup-container { padding: 20px 16px !important; max-width: 100% !important; }

          /* All modals */
          .modal-overlay > div { max-width: calc(100vw - 24px) !important; max-height: 90vh !important; overflow-y: auto !important; margin: 12px !important; }

          /* Fix filter row wrapping */
          .filter-row { flex-wrap: wrap !important; gap: 8px !important; }

          /* Settings dropdown */
          .settings-dropdown { width: calc(100vw - 32px) !important; right: -40px !important; }

          /* Post composer */
          .post-actions { flex-wrap: wrap !important; }

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
          .doc-body textarea { min-height: 50px !important; }
        }

        @media (max-width: 400px) {
          .form-grid-2, .form-grid-3 { grid-template-columns: 1fr !important; }
          .admin-stats { grid-template-columns: 1fr !important; }
          .admin-user-card .user-fields { grid-template-columns: 1fr !important; }
          .notif-dropdown { right: -100px !important; }
        }
      `}</style>
    </div>
  );
};

// ============================================================================
// APP (Root)
// ============================================================================
// Cookie Consent Banner Component
const CookieConsent = () => {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = localStorage.getItem("indin_cookie_consent");
        if (!result) setVisible(true);
      } catch {
        setVisible(true);
      }
    })();
  }, []);

  const acceptAll = async () => {
    try { localStorage.setItem("indin_cookie_consent", JSON.stringify({ essential: true, analytics: true, date: new Date().toISOString() })); } catch (e) {}
    setVisible(false);
  };
  const acceptEssential = async () => {
    try { localStorage.setItem("indin_cookie_consent", JSON.stringify({ essential: true, analytics: analyticsConsent, date: new Date().toISOString() })); } catch (e) {}
    setVisible(false);
  };

  if (!visible) return null;

  const font = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
      background: "#fff", borderTop: "1px solid #E0E0DE",
      boxShadow: "0 -4px 24px rgba(0,0,0,0.08)", padding: "0",
      fontFamily: font,
    }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#37352F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: "#37352F", margin: 0 }}>We value your privacy</h4>
            </div>
            <p style={{ fontSize: 13, color: "#5F5E5B", lineHeight: 1.6, margin: 0 }}>
              We use essential cookies to make NRIClub work. With your consent, we may also use analytics cookies to improve your experience.
              {" "}
              <button onClick={() => setShowDetails(!showDetails)} style={{ background: "none", border: "none", color: "#5B7FD6", cursor: "pointer", textDecoration: "underline", fontFamily: font, fontSize: 13, padding: 0 }}>
                {showDetails ? "Hide details" : "Learn more"}
              </button>
            </p>

            {showDetails && (
              <div style={{ marginTop: 14, padding: "14px 16px", background: "#F7F7F5", borderRadius: 8, border: "1px solid #EDEDEB" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#37352F" }}>Essential Cookies</span>
                    <p style={{ fontSize: 11, color: "#9B9A97", margin: "2px 0 0" }}>Required for the platform to function. Cannot be disabled.</p>
                  </div>
                  <span style={{ fontSize: 11, color: "#22A06B", fontWeight: 600, background: "#E3FCEF", padding: "3px 8px", borderRadius: 4 }}>Always on</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid #E8E7E4" }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#37352F" }}>Analytics Cookies</span>
                    <p style={{ fontSize: 11, color: "#9B9A97", margin: "2px 0 0" }}>Help us understand how you use NRIClub to improve the experience.</p>
                  </div>
                  <button
                    onClick={() => setAnalyticsConsent(!analyticsConsent)}
                    style={{
                      width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer",
                      background: analyticsConsent ? "#37352F" : "#D4D4D2", position: "relative", padding: 0, flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: 14, height: 14, borderRadius: "50%", background: "#fff",
                      position: "absolute", top: 3,
                      left: analyticsConsent ? 19 : 3,
                      transition: "left 0.2s",
                    }} />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
            <button onClick={acceptEssential} style={{
              padding: "10px 18px", borderRadius: 8, border: "1px solid #E0E0DE",
              background: "#fff", fontSize: 13, fontWeight: 500, color: "#37352F", cursor: "pointer", fontFamily: font,
            }}>
              Essential Only
            </button>
            <button onClick={acceptAll} style={{
              padding: "10px 18px", borderRadius: 8, border: "none",
              background: "#37352F", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", fontFamily: font,
            }}>
              Accept All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Admin credentials
const ADMIN_USER = "admin@nriclub.com";
const ADMIN_PASS = "NRIClub@2026!";

export default function App() {
  const [authState, setAuthState] = useState("loading");
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [adminErr, setAdminErr] = useState("");

  useEffect(() => {
    // Check for admin route
    if (window.location.hash === "#admin") {
      // Check if already logged in as admin
      if (localStorage.getItem("indin_admin") === "true") {
        setIsAdmin(true);
        setAuthState("admin");
      } else {
        setAuthState("admin-login");
      }
      return;
    }
    (async () => {
      try {
        const session = await api.getSession();
        if (session && session.user) {
          const dbProfile = await api.getMyProfile();
          const cached = JSON.parse(localStorage.getItem("indin_profile_cache") || "null");
          if (dbProfile) {
            // Merge: prefer DB values, but fall back to cache for fields that might be empty in DB
            const mapped = {
              id: dbProfile.id,
              name: dbProfile.name || cached?.name || "",
              email: dbProfile.email || cached?.email || "",
              location: dbProfile.location || cached?.location || "",
              hometown: dbProfile.hometown || cached?.hometown || "",
              profession: dbProfile.profession || cached?.profession || "",
              occupationStatus: dbProfile.occupation_status || cached?.occupationStatus || "",
              yearsAbroad: dbProfile.years_abroad || cached?.yearsAbroad || "",
              linkedinUrl: dbProfile.linkedin_url || cached?.linkedinUrl || "",
              isNRI: !!(dbProfile.years_abroad || cached?.yearsAbroad) && (dbProfile.years_abroad || cached?.yearsAbroad) !== "Not lived abroad",
              emailVerified: dbProfile.email_verified,
              linkedin_verified: dbProfile.linkedin_verified || false, avatar_url: dbProfile.avatar_url || "", status: dbProfile.status || "active",
            };
            // If DB has empty fields but cache has them, push cache values to DB
            if (!dbProfile.location && cached?.location) {
              try { await api.updateProfile({ location: cached.location, hometown: cached.hometown, profession: cached.profession, occupation_status: cached.occupationStatus, years_abroad: cached.yearsAbroad, linkedin_url: cached.linkedinUrl }); } catch(e) {}
            }
            setUser(mapped);
            localStorage.setItem("indin_profile_cache", JSON.stringify(mapped));
            setAuthState("authenticated");
            return;
          }
        }
      } catch (e) {}
      // Fallback: check local cache
      try {
        const cached = JSON.parse(localStorage.getItem("indin_profile_cache") || "null");
        if (cached) { setUser(cached); setAuthState("authenticated"); return; }
      } catch (e) {}
      setAuthState("landing");
    })();
  }, []);

  const handleAuthComplete = (userData) => {
    setUser(userData);
    setAuthState("authenticated");
  };

  const handleLogout = async () => {
    try { await api.signOut(); } catch (e) {}
    try { localStorage.removeItem("indin_profile_cache"); } catch (e) {}
    try { localStorage.removeItem("indin_token"); localStorage.removeItem("indin_refresh"); localStorage.removeItem("indin_profile_cache"); } catch (e) {}
    setUser(null);
    setAuthState("landing");
  };

  if (authState === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAF8", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, background: "#37352F", borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16, color: "#fff" }}>
            {Icons.globe({ size: 24 })}
          </div>
          <p style={{ color: "#9B9A97", fontSize: 14 }}>Loading...</p>
        </div>
      </div>
    );
  }

  const content = (() => {
    if (authState === "admin-login") {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1A1A1A", fontFamily: "'DM Sans', sans-serif" }}>
          <div style={{ maxWidth: 360, width: "100%", background: "#fff", borderRadius: 16, padding: 32 }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#37352F" }}>NRI<span style={{ fontStyle: "italic", fontFamily: '"Times New Roman",serif' }}>Club</span></h2>
              <p style={{ fontSize: 12, color: "#9B9A97", marginTop: 4 }}>Admin Panel Login</p>
            </div>
            {adminErr && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", padding: "8px 12px", borderRadius: 8, fontSize: 12, marginBottom: 16 }}>{adminErr}</div>}
            <input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="Admin email" style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 14, marginBottom: 12, boxSizing: "border-box", outline: "none" }} />
            <input type="password" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} placeholder="Password" style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E0E0DE", fontSize: 14, marginBottom: 20, boxSizing: "border-box", outline: "none" }} onKeyDown={(e) => { if (e.key === "Enter") { if (adminEmail === ADMIN_USER && adminPass === ADMIN_PASS) { setIsAdmin(true); setAuthState("admin"); localStorage.setItem("indin_admin", "true"); } else setAdminErr("Invalid credentials"); } }} />
            <button onClick={() => { if (adminEmail === ADMIN_USER && adminPass === ADMIN_PASS) { setIsAdmin(true); setAuthState("admin"); localStorage.setItem("indin_admin", "true"); } else setAdminErr("Invalid credentials"); }} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: "#37352F", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Sign In</button>
            <p style={{ fontSize: 11, color: "#9B9A97", textAlign: "center", marginTop: 16 }}><a href="#" onClick={(e) => { e.preventDefault(); window.location.hash = ""; setAuthState("landing"); }} style={{ color: "#5B9CFF" }}>← Back to NRIClub</a></p>
          </div>
        </div>
      );
    }
    if (authState === "admin" && isAdmin) return <AdminDashboard onLogout={() => { setIsAdmin(false); setAuthState("landing"); localStorage.removeItem("indin_admin"); window.location.hash = ""; }} />;
    if (authState === "landing") return <LandingPage onJoin={() => setAuthState("signup")} onLogin={() => setAuthState("login")} />;
    if (authState === "signup") return <SignUpPage onComplete={handleAuthComplete} onLogin={() => setAuthState("login")} />;
    if (authState === "login") return <LoginPage onComplete={handleAuthComplete} onSignUp={() => setAuthState("signup")} />;
    if (authState === "authenticated" && user) return <Dashboard user={user} onLogout={handleLogout} />;
    return <LandingPage onJoin={() => setAuthState("signup")} onLogin={() => setAuthState("login")} />;
  })();

  return (
    <>
      {content}
      <CookieConsent />
    </>
  );
}

// ============================================================================
// ADMIN DASHBOARD
// ============================================================================
const AdminDashboard = ({ onLogout }) => {
  const [tab, setTab] = useState("overview");
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState({ users: 0, posts: 0, groups: 0, events: 0 });
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState("");
  const font = "'DM Sans', sans-serif";
  const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6emtkbXlic2J3a25wc3VjdXZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MjE1NDUsImV4cCI6MjA5MDk5NzU0NX0.tolTpKSToyH_DtUfKYbKdWVyJiWC25RDBQlHVu140hQ";
  const URL = "https://uzzkdmybsbwknpsucuvv.supabase.co";
  const hdrs = { apikey: KEY, "Content-Type": "application/json", Authorization: `Bearer ${KEY}`, Prefer: "return=representation" };

  useEffect(() => {
    (async () => {
      try {
        const h = { apikey: KEY };
        const [u, g, r, posts, docs, events, helpReqs, marketItems] = await Promise.all([
          fetch(`${URL}/rest/v1/profiles?select=*&order=created_at.desc`, { headers: h }).then(r => r.json()),
          fetch(`${URL}/rest/v1/groups?select=*&order=members_count.desc`, { headers: h }).then(r => r.json()),
          fetch(`${URL}/rest/v1/reports?select=*&order=created_at.desc`, { headers: h }).then(r => r.json()),
          fetch(`${URL}/rest/v1/posts?select=id,content,image_url,user_id,created_at&order=created_at.desc&limit=200`, { headers: h }).then(r => r.json()).catch(() => []),
          fetch(`${URL}/rest/v1/docs?select=id,title,excerpt,user_id&order=created_at.desc&limit=100`, { headers: h }).then(r => r.json()).catch(() => []),
          fetch(`${URL}/rest/v1/events?select=id,title,description,date,organizer_id&order=created_at.desc&limit=100`, { headers: h }).then(r => r.json()).catch(() => []),
          fetch(`${URL}/rest/v1/help_requests?select=id,title,description,user_id&order=created_at.desc&limit=100`, { headers: h }).then(r => r.json()).catch(() => []),
          fetch(`${URL}/rest/v1/marketplace?select=id,title,description,price,user_id,image_url&order=created_at.desc&limit=100`, { headers: h }).then(r => r.json()).catch(() => []),
        ]);
        console.log("Admin data loaded:", { users: Array.isArray(u) ? u.length : u, groups: Array.isArray(g) ? g.length : g, reports: Array.isArray(r) ? r.length : r });
        const allUsers = Array.isArray(u) ? u : [];
        const allPosts = Array.isArray(posts) ? posts : [];
        const allDocs = Array.isArray(docs) ? docs : [];
        const allEvents = Array.isArray(events) ? events : [];
        const allHelp = Array.isArray(helpReqs) ? helpReqs : [];
        const allMarket = Array.isArray(marketItems) ? marketItems : [];
        setUsers(allUsers); setGroups(Array.isArray(g) ? g : []);
        // Build content lookup
        const contentMap = {};
        allPosts.forEach(p => { contentMap[p.id] = { type: "post", content: p.content, image: p.image_url, authorId: p.user_id }; });
        allDocs.forEach(d => { contentMap[d.id] = { type: "doc", content: d.title, excerpt: d.excerpt, authorId: d.user_id }; });
        allEvents.forEach(e => { contentMap[e.id] = { type: "event", content: e.title, excerpt: e.description, date: e.date, authorId: e.organizer_id }; });
        allHelp.forEach(h2 => { contentMap[h2.id] = { type: "help", content: h2.title, excerpt: h2.description, authorId: h2.user_id }; });
        allMarket.forEach(m => { contentMap[m.id] = { type: "marketplace", content: m.title, excerpt: m.description, price: m.price, image: m.image_url, authorId: m.user_id }; });
        // Enrich reports
        const reportsArr = Array.isArray(r) ? r : [];
        const enrichedReports = reportsArr.map(rep => {
          const reporter = allUsers.find(x => x.id === rep.reporter_id);
          const reported = allUsers.find(x => x.id === rep.reported_user_id);
          const contentId = rep.reported_post_id || rep.reported_user_id;
          const reportedContent = contentMap[contentId] || null;
          const contentAuthor = reportedContent ? allUsers.find(x => x.id === reportedContent.authorId) : null;
          return { ...rep, reporter: reporter ? { name: reporter.name, email: reporter.email } : null, reported_user: reported ? { name: reported.name, email: reported.email } : null, reportedContent, contentAuthor: contentAuthor ? { name: contentAuthor.name, email: contentAuthor.email } : null };
        });
        setReports(enrichedReports);
        setStats({ users: allUsers.length, posts: 0, groups: (Array.isArray(g) ? g : []).filter(x => x.is_approved).length, events: 0, pending: allUsers.filter(x => !x.linkedin_verified).length });
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  const rpc = async (fn, params) => {
    const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(params) });
    console.log(`RPC ${fn}:`, res.status, res.ok);
    return res.ok;
  };

  const updateReportStatus = async (id, newStatus) => {
    // Direct REST update
    try {
      const res = await fetch(`${URL}/rest/v1/reports?id=eq.${id}`, {
        method: "PATCH",
        headers: { apikey: KEY, "Content-Type": "application/json", Authorization: `Bearer ${KEY}`, Prefer: "return=minimal" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        // Try RPC as fallback
        const res2 = await fetch(`${URL}/rest/v1/rpc/admin_update_report`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ target_id: id, new_status: newStatus }) });
        return res2.ok;
      }
      return true;
    } catch(e) { return false; }
  };

  const approveUser = async (id) => {
    await rpc("admin_update_user", { target_id: id, verified: true, user_status: "active" });
    setUsers(prev => prev.map(u => u.id === id ? { ...u, linkedin_verified: true, status: "active" } : u));
  };

  const blockUser = async (id) => {
    await rpc("admin_update_user", { target_id: id, verified: false, user_status: "blocked" });
    setUsers(prev => prev.map(u => u.id === id ? { ...u, linkedin_verified: false, status: "blocked" } : u));
  };

  const approveGroup = async (id) => {
    await rpc("admin_approve_group", { target_id: id, approved: true });
    const group = groups.find(g => g.id === id);
    if (group?.created_by) {
      try { await fetch(`${URL}/rest/v1/notifications`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ user_id: group.created_by, type: "group", message: `Your community "${group.name}" has been approved!`, read: false }) }); } catch(e) {}
    }
    setGroups(prev => prev.map(g => g.id === id ? { ...g, is_approved: true } : g));
  };

  const rejectGroup = async (id) => {
    const group = groups.find(g => g.id === id);
    if (group?.created_by) {
      try { await fetch(`${URL}/rest/v1/notifications`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ user_id: group.created_by, type: "group", message: `Your community request "${group.name}" was not approved.`, read: false }) }); } catch(e) {}
    }
    try { await fetch(`${URL}/rest/v1/groups?id=eq.${id}`, { method: "DELETE", headers: { apikey: KEY, "Content-Type": "application/json" } }); } catch(e) {}
    setGroups(prev => prev.filter(g => g.id !== id));
  };

  const dismissReport = async (id) => {
    await rpc("admin_delete_report", { target_id: id });
    setReports(prev => prev.filter(r => r.id !== id));
  };

  const deleteReportContent = async (id) => {
    const report = reports.find(r => r.id === id);
    if (report?.reported_post_id) {
      const contentId = report.reported_post_id;
      const reason = (report.reason || "").toUpperCase();
      const table = reason.startsWith("[MARKETPLACE]") ? "marketplace" : reason.startsWith("[DOC]") ? "docs" : reason.startsWith("[EVENT]") ? "events" : reason.startsWith("[HELP]") ? "help_requests" : "posts";
      await rpc("admin_delete_content", { table_name: table, content_id: contentId });
    }
    await rpc("admin_delete_report", { target_id: id });
    setReports(prev => prev.filter(r => r.id !== id));
  };

  const navItems = [
    { key: "overview", label: "Overview" },
    { key: "approvals", label: "Pending Approvals" },
    { key: "users", label: "All Users" },
    { key: "blocked", label: "Blocked Users" },
    { key: "groups", label: "Communities" },
    { key: "reports", label: "Reports" },
  ];

  const pendingUsers = users.filter(u => !u.linkedin_verified && u.status !== "blocked");
  const blockedUsers = users.filter(u => u.status === "blocked");
  const approvedUsers = users.filter(u => u.linkedin_verified && u.status !== "blocked");
  const filteredUsers = users.filter(u => u.status !== "blocked" && (!userSearch || (u.name || "").toLowerCase().includes(userSearch.toLowerCase()) || (u.email || "").toLowerCase().includes(userSearch.toLowerCase())));

  const fieldStyle = { fontSize: 12, color: "#37352F", padding: "6px 10px", background: "#FAFAF8", borderRadius: 4, border: "1px solid #F0EFED" };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 };

  return (
    <div className="admin-layout" style={{ display: "flex", minHeight: "100vh", fontFamily: font, background: "#FAFAF8" }}>
      {/* Sidebar */}
      <div className="admin-sidebar" style={{ width: 220, background: "#fff", borderRight: "1px solid #EDEDEB", padding: "20px 0", flexShrink: 0 }}>
        <div style={{ padding: "0 16px 20px" }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#37352F", margin: 0 }}>NRI<span style={{ fontStyle: "italic", fontFamily: '"Times New Roman",serif' }}>Club</span></h2>
          <p style={{ fontSize: 10, color: "#9B9A97", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.1em" }}>Admin</p>
        </div>
        <div className="admin-nav" style={{ padding: "0 8px" }}>
          {navItems.map(n => (
            <button key={n.key} onClick={() => setTab(n.key)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", borderRadius: 6, background: tab === n.key ? "#F5F5F3" : "transparent", color: tab === n.key ? "#37352F" : "#9B9A97", cursor: "pointer", fontSize: 13, fontWeight: tab === n.key ? 600 : 400, fontFamily: font, textAlign: "left", marginBottom: 2, transition: "all 0.1s" }}>
              {n.label}
              {n.key === "approvals" && pendingUsers.length > 0 && <span style={{ marginLeft: "auto", background: "#DC2626", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10 }}>{pendingUsers.length}</span>}
              {n.key === "blocked" && blockedUsers.length > 0 && <span style={{ marginLeft: "auto", background: "#9B9A97", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10 }}>{blockedUsers.length}</span>}
              {n.key === "reports" && reports.filter(r => r.status === "pending").length > 0 && <span style={{ marginLeft: "auto", background: "#E65100", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10 }}>{reports.filter(r => r.status === "pending").length}</span>}
              {n.key === "groups" && groups.filter(g => !g.is_approved).length > 0 && <span style={{ marginLeft: "auto", background: "#E65100", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10 }}>{groups.filter(g => !g.is_approved).length}</span>}
            </button>
          ))}
        </div>
        <div style={{ position: "absolute", bottom: 20, padding: "0 16px" }}>
          <button onClick={onLogout} style={{ background: "none", border: "none", color: "#9B9A97", cursor: "pointer", fontSize: 12, fontFamily: font }}>Sign out</button>
        </div>
      </div>

      {/* Main */}
      <div className="admin-main" style={{ flex: 1, padding: "28px 36px", overflow: "auto", maxWidth: 900 }}>
        {loading ? <div style={{ padding: 60, textAlign: "center", color: "#9B9A97" }}>Loading...</div>

        : tab === "overview" ? (() => {
          const now = Date.now();
          const mins = (ms) => (now - new Date(ms).getTime()) / 60000;
          const onlineUsers = users.filter(u => u.last_active && mins(u.last_active) < 5);
          const activeToday = users.filter(u => u.last_active && mins(u.last_active) < 1440);
          const activeWeek = users.filter(u => u.last_active && mins(u.last_active) < 10080);
          const activeMonth = users.filter(u => u.last_active && mins(u.last_active) < 43200);
          const activeQuarter = users.filter(u => u.last_active && mins(u.last_active) < 129600);
          const activeYear = users.filter(u => u.last_active && mins(u.last_active) < 525600);
          // Signups per month for chart
          const monthCounts = {};
          users.forEach(u => {
            if (!u.created_at) return;
            const d = new Date(u.created_at);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
            monthCounts[key] = (monthCounts[key] || 0) + 1;
          });
          const sortedMonths = Object.keys(monthCounts).sort();
          const maxCount = Math.max(...Object.values(monthCounts), 1);
          return (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", marginBottom: 24 }}>Overview</h1>
            
            {/* Top Stats */}
            <div className="admin-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Total Users", value: stats.users, color: "#37352F" },
                { label: "Approved", value: approvedUsers.length, color: "#22A06B" },
                { label: "Pending Review", value: pendingUsers.length, color: "#E65100" },
                { label: "Blocked", value: blockedUsers.length, color: "#DC2626" },
              ].map((s, i) => (
                <div key={i} style={{ background: "#fff", borderRadius: 8, border: "1px solid #EDEDEB", padding: "16px 18px" }}>
                  <div style={{ fontSize: 10, color: "#9B9A97", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.08em", marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Online / Active Users */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #EDEDEB", padding: "18px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22C55E", animation: "pulse 2s infinite" }}>{""}</div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#37352F", textTransform: "uppercase", letterSpacing: "0.08em" }}>Online Now</span>
                </div>
                <div style={{ fontSize: 36, fontWeight: 700, color: "#22C55E", marginBottom: 8 }}>{onlineUsers.length}</div>
                <div style={{ fontSize: 11, color: "#9B9A97" }}>Users active in last 5 minutes</div>
                {onlineUsers.length > 0 && (
                  <div style={{ display: "flex", gap: -8, marginTop: 10 }}>
                    {onlineUsers.slice(0, 5).map((u, i) => (
                      <div key={u.id} style={{ width: 28, height: 28, borderRadius: "50%", background: "#A3C9B8", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700, border: "2px solid #fff", marginLeft: i > 0 ? -6 : 0 }} title={u.name}>{(u.name || "U").substring(0, 2).toUpperCase()}</div>
                    ))}
                    {onlineUsers.length > 5 && <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#F0EFED", display: "flex", alignItems: "center", justifyContent: "center", color: "#9B9A97", fontSize: 9, fontWeight: 700, border: "2px solid #fff", marginLeft: -6 }}>+{onlineUsers.length - 5}</div>}
                  </div>
                )}
              </div>
              <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #EDEDEB", padding: "18px 20px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#37352F", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Active Users</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { label: "Today", value: activeToday.length, color: "#22A06B" },
                    { label: "This Week", value: activeWeek.length, color: "#5B9CFF" },
                    { label: "This Month", value: activeMonth.length, color: "#E65100" },
                    { label: "This Quarter", value: activeQuarter.length, color: "#7C3AED" },
                  ].map((a, i) => (
                    <div key={i} style={{ padding: "8px 10px", background: "#FAFAF8", borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: "#9B9A97", fontWeight: 600, marginBottom: 4 }}>{a.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: a.color }}>{a.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, padding: "8px 10px", background: "#FAFAF8", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "#9B9A97", fontWeight: 600 }}>This Year</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "#37352F" }}>{activeYear.length}</span>
                </div>
              </div>
            </div>

            {/* Signups Chart */}
            <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #EDEDEB", padding: "18px 20px", marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#37352F", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Signups Over Time</div>
              {sortedMonths.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: "#9B9A97", fontSize: 12 }}>No signup data yet.</div>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
                  {sortedMonths.map(m => (
                    <div key={m} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#37352F" }}>{monthCounts[m]}</span>
                      <div style={{ width: "100%", maxWidth: 40, height: Math.max(8, (monthCounts[m] / maxCount) * 100), background: "linear-gradient(180deg, #5B9CFF, #3B7BD8)", borderRadius: "4px 4px 0 0", transition: "height 0.3s" }}>{""}</div>
                      <span style={{ fontSize: 9, color: "#9B9A97", whiteSpace: "nowrap" }}>{m.substring(5)}/{m.substring(2,4)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#37352F", marginBottom: 10 }}>Recent Signups</h3>
            <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #EDEDEB", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr", padding: "8px 16px", background: "#FAFAF8", borderBottom: "1px solid #EDEDEB", fontSize: 10, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                <span>Name</span><span>Email</span><span>Location</span><span>Status</span>
              </div>
              {users.slice(0, 8).map((u, i) => (
                <div key={u.id || i} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr", padding: "10px 16px", borderBottom: "1px solid #F5F5F3", alignItems: "center", fontSize: 13 }}>
                  <span style={{ fontWeight: 500, color: "#37352F" }}>{u.name || "—"}</span>
                  <span style={{ color: "#9B9A97" }}>{u.email || "—"}</span>
                  <span style={{ color: "#9B9A97" }}>{u.location || "—"}</span>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: u.linkedin_verified ? "#E3FCEF" : "#FFF3E0", color: u.linkedin_verified ? "#22A06B" : "#E65100", fontWeight: 600, width: "fit-content" }}>{u.linkedin_verified ? "Approved" : "Pending"}</span>
                </div>
              ))}
            </div>
          </div>
          );
        })()

        : tab === "approvals" ? (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", marginBottom: 6 }}>Pending Approvals</h1>
            <p style={{ fontSize: 13, color: "#9B9A97", marginBottom: 24 }}>Review and approve new user profiles. Users see a "pending review" banner until approved.</p>
            {pendingUsers.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 8, border: "1px dashed #EDEDEB", padding: 40, textAlign: "center", color: "#9B9A97", fontSize: 13 }}>No pending approvals. All users are verified.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {pendingUsers.map((u) => (
                  <div key={u.id} style={{ background: "#fff", borderRadius: 8, border: "1px solid #EDEDEB", padding: "16px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#A3C9B8", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14 }}>{(u.name || "U").substring(0, 2).toUpperCase()}</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#37352F" }}>{u.name || "—"}</div>
                          <div style={{ fontSize: 11, color: "#9B9A97" }}>{u.email} · Joined {new Date(u.created_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => approveUser(u.id)} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#22A06B", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Approve</button>
                        <button onClick={() => blockUser(u.id)} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #FECACA", background: "#fff", color: "#DC2626", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Block</button>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <div><div style={labelStyle}>Location</div><div style={fieldStyle}>{u.location || "—"}</div></div>
                      <div><div style={labelStyle}>Hometown</div><div style={fieldStyle}>{u.hometown || "—"}</div></div>
                      <div><div style={labelStyle}>Profession</div><div style={fieldStyle}>{u.profession || "—"}</div></div>
                      <div><div style={labelStyle}>LinkedIn</div><div style={fieldStyle}>{u.linkedin_url ? <a href={u.linkedin_url.startsWith("http") ? u.linkedin_url : `https://${u.linkedin_url}`} target="_blank" rel="noopener noreferrer" style={{ color: "#5B9CFF", textDecoration: "none", fontSize: 11 }}>View Profile →</a> : "Not provided"}</div></div>
                      <div><div style={labelStyle}>Years Abroad</div><div style={fieldStyle}>{u.years_abroad || "—"}</div></div>
                      <div><div style={labelStyle}>Type</div><div style={fieldStyle}><span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: isUserNRI(u) ? "#E3FCEF" : "#FFF3E0", color: isUserNRI(u) ? "#22A06B" : "#E65100", fontWeight: 600 }}>{isUserNRI(u) ? "NRI" : "IN"}</span></div></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        ) : tab === "users" ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", margin: 0 }}>All Users ({users.length})</h1>
              <div style={{ position: "relative" }}>
                <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search users..." style={{ padding: "8px 14px 8px 32px", borderRadius: 6, border: "1px solid #EDEDEB", fontSize: 12, background: "#fff", outline: "none", width: 200, fontFamily: font }} />
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9B9A97", fontSize: 12 }}>🔍</span>
              </div>
            </div>
            <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #EDEDEB", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 80px", padding: "8px 16px", background: "#FAFAF8", borderBottom: "1px solid #EDEDEB", fontSize: 10, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                <span>User</span><span>Details</span><span>Location</span><span>Status</span><span>Actions</span>
              </div>
              {filteredUsers.map((u, i) => (
                <div key={u.id || i} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 80px", padding: "12px 16px", borderBottom: "1px solid #F5F5F3", alignItems: "center", fontSize: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: "#37352F", fontSize: 13 }}>{u.name || "—"}</div>
                    <div style={{ color: "#9B9A97", fontSize: 11 }}>{u.email}</div>
                  </div>
                  <div>
                    <div style={{ color: "#5F5E5B" }}>{u.profession || "—"}</div>
                    {u.linkedin_url && <a href={u.linkedin_url.startsWith("http") ? u.linkedin_url : `https://${u.linkedin_url}`} target="_blank" rel="noopener noreferrer" style={{ color: "#5B9CFF", fontSize: 10, textDecoration: "none" }}>LinkedIn →</a>}
                  </div>
                  <div style={{ color: "#9B9A97" }}>{u.location || "—"}</div>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: u.linkedin_verified ? "#E3FCEF" : "#FFF3E0", color: u.linkedin_verified ? "#22A06B" : "#E65100", fontWeight: 600, width: "fit-content" }}>{u.linkedin_verified ? "Approved" : "Pending"}</span>
                  <div>
                    {!u.linkedin_verified ? <button onClick={() => approveUser(u.id)} style={{ padding: "4px 10px", borderRadius: 4, border: "none", background: "#22A06B", color: "#fff", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>Approve</button>
                    : <button onClick={() => blockUser(u.id)} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #FECACA", background: "#fff", color: "#DC2626", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>Block</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>

        ) : tab === "blocked" ? (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", marginBottom: 24 }}>Blocked Users ({blockedUsers.length})</h1>
            {blockedUsers.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 8, border: "1px dashed #EDEDEB", padding: 40, textAlign: "center", color: "#9B9A97", fontSize: 13 }}>No blocked users.</div>
            ) : (
              <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #EDEDEB", overflow: "hidden" }}>
                {blockedUsers.map((u, i) => (
                  <div key={u.id || i} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 100px", padding: "12px 16px", borderBottom: "1px solid #F5F5F3", alignItems: "center", fontSize: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "#37352F", fontSize: 13 }}>{u.name || "—"}</div>
                      <div style={{ color: "#9B9A97", fontSize: 11 }}>{u.email}</div>
                    </div>
                    <div style={{ color: "#9B9A97" }}>{u.profession || "—"}</div>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#FEF2F2", color: "#DC2626", fontWeight: 600, width: "fit-content" }}>Blocked</span>
                    <button onClick={() => approveUser(u.id)} style={{ padding: "4px 10px", borderRadius: 4, border: "none", background: "#22A06B", color: "#fff", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>Unblock</button>
                  </div>
                ))}
              </div>
            )}
          </div>

        ) : tab === "groups" ? (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", marginBottom: 24 }}>Communities</h1>
            {groups.filter(g => !g.is_approved).length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: "#E65100", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Pending ({groups.filter(g => !g.is_approved).length})</h3>
                <div style={{ display: "grid", gap: 8 }}>
                  {groups.filter(g => !g.is_approved).map(g => (
                    <div key={g.id} style={{ background: "#fff", borderRadius: 8, border: "1px solid #EDEDEB", padding: "14px 18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#37352F" }}>{g.name}</div>
                          <div style={{ fontSize: 11, color: "#9B9A97" }}>{g.description} · {g.category}</div>
                          {g.created_by && <div style={{ fontSize: 10, color: "#9B9A97", marginTop: 4 }}>Created by: {g.created_by.substring(0, 8)}...</div>}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => approveGroup(g.id)} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#22A06B", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Approve</button>
                          <button onClick={() => rejectGroup(g.id)} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #FECACA", background: "#fff", color: "#DC2626", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Reject</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#22A06B", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Active ({groups.filter(g => g.is_approved).length})</h3>
            <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #EDEDEB", overflow: "hidden" }}>
              {groups.filter(g => g.is_approved).map(g => (
                <div key={g.id} style={{ padding: "10px 16px", borderBottom: "1px solid #F5F5F3", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                  <span style={{ fontWeight: 500, color: "#37352F" }}>{g.name}</span>
                  <span style={{ fontSize: 11, color: "#9B9A97" }}>{g.members_count} members</span>
                </div>
              ))}
            </div>
          </div>

        ) : tab === "reports" ? (
          <div>
            {(() => {
              const pendingReports = reports.filter(r => r.status === "pending" || !r.status);
              const handledReports = reports.filter(r => r.status === "resolved" || r.status === "dismissed");
              const getCategory = (r) => {
                const reason = (r.reason || "").toUpperCase();
                if (reason.startsWith("[MARKETPLACE]")) return "Marketplace";
                if (reason.startsWith("[DOC]")) return "Docs";
                if (reason.startsWith("[EVENT]")) return "Events";
                if (reason.startsWith("[HELP]")) return "Help Requests";
                if (reason.startsWith("[USER]")) return "Profiles";
                if (reason.startsWith("[POST]")) return "Feed Posts";
                if (r.reported_user_id && !r.reported_post_id) return "Profiles";
                return "Feed Posts";
              };
              const categories = ["Feed Posts", "Marketplace", "Docs", "Events", "Help Requests", "Profiles"];
              const renderReportCards = (list) => {
                const grouped = {};
                list.forEach(r => { const c = getCategory(r); if (!grouped[c]) grouped[c] = []; grouped[c].push(r); });
                return categories.filter(c => grouped[c]?.length > 0).map(cat => (
                <div key={cat} style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: "#37352F", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 8 }}>
                    {cat}
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#FEF2F2", color: "#DC2626", fontWeight: 700 }}>{grouped[cat].length}</span>
                  </h3>
                  <div style={{ display: "grid", gap: 8 }}>
                    {grouped[cat].map((r, i) => (
                      <div key={r.id || i} style={{ background: "#fff", borderRadius: 8, border: "1px solid #EDEDEB", padding: "16px 18px" }}>
                        {/* Header: reason + actions */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#37352F", marginBottom: 4 }}>{(r.reason || "No reason").replace(/^\[\w+\]\s*/, "")}</div>
                            <div style={{ fontSize: 11, color: "#9B9A97" }}>Reported: {new Date(r.created_at).toLocaleString()}</div>
                          </div>
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            {r.status === "pending" ? (
                              <>
                                <button onClick={() => deleteReportContent(r.id)} style={{ padding: "5px 12px", borderRadius: 4, border: "none", background: "#DC2626", color: "#fff", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>Remove Content</button>
                                <button onClick={() => dismissReport(r.id)} style={{ padding: "5px 12px", borderRadius: 4, border: "1px solid #EDEDEB", background: "#fff", color: "#5F5E5B", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>Dismiss</button>
                              </>
                            ) : (
                              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: r.status === "resolved" ? "#FEF2F2" : "#E3FCEF", color: r.status === "resolved" ? "#DC2626" : "#22A06B", fontWeight: 600 }}>{r.status === "resolved" ? "Removed" : "Dismissed"}</span>
                            )}
                          </div>
                        </div>

                        {/* Reported content preview */}
                        {r.reportedContent && (
                          <div style={{ background: "#FAFAF8", border: "1px solid #F0EFED", borderRadius: 8, padding: "14px 16px", marginBottom: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#9B9A97", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Reported Content</div>
                            {r.reportedContent.image && (
                              <img src={r.reportedContent.image} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 6, marginBottom: 8 }} />
                            )}
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#37352F", marginBottom: 4 }}>
                              {r.reportedContent.type === "post" ? (r.reportedContent.content || "").substring(0, 200) : r.reportedContent.content}
                              {r.reportedContent.type === "post" && (r.reportedContent.content || "").length > 200 && "..."}
                            </div>
                            {r.reportedContent.excerpt && (
                              <div style={{ fontSize: 12, color: "#5F5E5B", lineHeight: 1.5, marginTop: 4 }}>{(r.reportedContent.excerpt || "").substring(0, 150)}{(r.reportedContent.excerpt || "").length > 150 ? "..." : ""}</div>
                            )}
                            {r.reportedContent.price && (
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#22A06B", marginTop: 6 }}>{r.reportedContent.price}</div>
                            )}
                            {r.reportedContent.date && (
                              <div style={{ fontSize: 11, color: "#9B9A97", marginTop: 4 }}>Date: {r.reportedContent.date}</div>
                            )}
                            {r.contentAuthor && (
                              <div style={{ fontSize: 11, color: "#9B9A97", marginTop: 6, paddingTop: 6, borderTop: "1px solid #F0EFED" }}>Author: <strong>{r.contentAuthor.name}</strong> ({r.contentAuthor.email})</div>
                            )}
                          </div>
                        )}

                        {/* Reported user profile preview (for profile reports) */}
                        {!r.reportedContent && r.reported_user && (
                          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "14px 16px", marginBottom: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Reported Profile</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#37352F" }}>{r.reported_user.name}</div>
                            <div style={{ fontSize: 12, color: "#9B9A97" }}>{r.reported_user.email}</div>
                          </div>
                        )}

                        {/* Reporter info */}
                        {r.reporter && (
                          <div style={{ fontSize: 11, color: "#9B9A97" }}>
                            Reported by: <strong>{r.reporter.name}</strong> ({r.reporter.email})
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ));
              };
              return (
                <>
                  <h1 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", marginBottom: 24 }}>Reports ({reports.length})</h1>
                  {reports.length === 0 ? (
                    <div style={{ background: "#fff", borderRadius: 8, border: "1px dashed #EDEDEB", padding: 40, textAlign: "center", color: "#9B9A97", fontSize: 13 }}>No pending reports. All clear!</div>
                  ) : renderReportCards(reports)}
                </>
              );
            })()}
          </div>
        ) : null}
      </div>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @media (max-width: 768px) {
          .admin-layout { flex-direction: column !important; }
          .admin-sidebar { width: 100% !important; position: relative !important; }
          .admin-nav { display: flex !important; flex-wrap: wrap !important; gap: 4px !important; }
          .admin-nav button { flex: 1 !important; min-width: 0 !important; padding: 8px 6px !important; font-size: 11px !important; justify-content: center !important; }
          .admin-main { padding: 16px !important; }
          .admin-stats { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
};
