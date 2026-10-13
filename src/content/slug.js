// A name as it appears in an address: "New York City" -> "new-york-city",
// "Düsseldorf" -> "dusseldorf". Used for city and guide pages.
export const slug = (text) => String(text || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// The site's own page title (public pages set their own, and put this back).
export const HOME_TITLE = "NRIClub · One home for Indians abroad";
