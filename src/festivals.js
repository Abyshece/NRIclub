// Festivals for the banner on Home, shown in the three weeks before each one.
// Dates follow the Indian calendar (moon-based ones can be a day out abroad);
// add next year's dates here before the list runs out.
export const FESTIVALS = [
  { name: "Dussehra", emoji: "🏹", date: "2026-10-20" },
  { name: "Diwali", emoji: "🪔", date: "2026-11-08" },
  { name: "Guru Nanak Jayanti", emoji: "🙏", date: "2026-11-24" },
  { name: "Pongal & Makar Sankranti", emoji: "🌾", date: "2027-01-14", search: "Pongal" },
  { name: "Republic Day", emoji: "🎉", date: "2027-01-26" },
  { name: "Eid al-Fitr", emoji: "🌙", date: "2027-03-10", search: "Eid" },
  { name: "Holi", emoji: "🎨", date: "2027-03-22" },
  { name: "Baisakhi", emoji: "🌾", date: "2027-04-14" },
  { name: "Eid al-Adha", emoji: "🌙", date: "2027-05-17", search: "Eid" },
  { name: "Independence Day", emoji: "🎆", date: "2027-08-15" },
  { name: "Raksha Bandhan", emoji: "🧵", date: "2027-08-17", search: "Rakhi" },
  { name: "Navratri", emoji: "💃", date: "2027-09-30" },
  { name: "Dussehra", emoji: "🏹", date: "2027-10-09" },
  { name: "Diwali", emoji: "🪔", date: "2027-10-29" },
  { name: "Guru Nanak Jayanti", emoji: "🙏", date: "2027-11-14" },
  { name: "Holi", emoji: "🎨", date: "2028-03-11" },
  { name: "Diwali", emoji: "🪔", date: "2028-10-17" },
];

const DAY = 86400000;

// The next festival within `days` days (today included), or null.
export function upcomingFestival(now = new Date(), days = 21) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const f of FESTIVALS) {
    const [y, m, d] = f.date.split("-").map(Number);
    const at = new Date(y, m - 1, d).getTime();
    const left = Math.round((at - today) / DAY);
    if (left >= 0 && left <= days) {
      return { ...f, search: f.search || f.name, daysLeft: left, when: new Date(at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) };
    }
  }
  return null;
}
