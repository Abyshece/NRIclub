import { CITIES } from "./cities";
import { slug } from "./slug";

// Other names people type for a city, by their slug: local spellings
// ("München"), short forms ("NYC") and long forms ("Frankfurt am Main").
// An exact match always wins, so an alias never hides a real group.
const ALIASES = {
  munchen: "Munich", muenchen: "Munich", koln: "Cologne", koeln: "Cologne",
  nurnberg: "Nuremberg", nuernberg: "Nuremberg", "frankfurt-am-main": "Frankfurt",
  duesseldorf: "Düsseldorf", wien: "Vienna", zuerich: "Zurich", geneve: "Geneva", genf: "Geneva",
  "den-haag": "The Hague", bruxelles: "Brussels", brussel: "Brussels", kobenhavn: "Copenhagen",
  goteborg: "Gothenburg", lisboa: "Lisbon", praha: "Prague", warszawa: "Warsaw", roma: "Rome",
  milano: "Milan", firenze: "Florence", torino: "Turin", napoli: "Naples",
  nyc: "New York City", ny: "New York City", "new-york": "New York City", "new-york-ny": "New York City", manhattan: "New York City",
  la: "Los Angeles", sf: "San Francisco", "washington-dc": "Washington D.C.", dc: "Washington D.C.",
  kl: "Kuala Lumpur", hongkong: "Hong Kong", hk: "Hong Kong", kuwait: "Kuwait City",
};

// The city's name as its group has it, or null: "berlin", "München" and
// "nyc" give "Berlin", "Munich" and "New York City". `names` are the live
// group names, checked before the built-in list.
export function findCity(text, names = []) {
  const key = slug(text);
  if (!key) return null;
  const all = [...names, ...CITIES];
  const exact = all.find((c) => slug(c) === key);
  if (exact) return exact;
  const alias = ALIASES[key];
  return alias ? all.find((c) => c === alias) || null : null;
}
