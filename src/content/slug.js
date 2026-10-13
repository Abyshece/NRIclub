// A name as it appears in an address: "New York City" -> "new-york-city",
// "Düsseldorf" -> "dusseldorf", "Gießen" -> "giessen". Used for city and
// guide pages. (Letters like ß and ø don't come apart into a letter and an
// accent, so they're spelled out.)
export const slug = (text) => String(text || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/ß/g, "ss").replace(/ø/g, "o").replace(/ł/g, "l").replace(/æ/g, "ae").replace(/œ/g, "oe").replace(/đ/g, "d").replace(/þ/g, "th")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// The site's own page title (public pages set their own, and put this back).
export const HOME_TITLE = "NRIClub · One home for NRIs and Indians abroad";
