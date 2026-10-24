// German cities with a university, or a sizeable university of applied
// sciences (public or private), for "Ambassador coverage" in the admin
// panel (src/admin/AmbassadorCoverage.jsx): which of them have a city
// ambassador, and which still need one.
//
// Each city: its name (in English where that's usual: Munich, Cologne,
// Nuremberg, Hanover, Frankfurt), its state (STATES), its main universities
// (short names, up to four), its population in thousands (rough, only to
// order the list) and, where a university publishes one, the number of
// Indian students: indianStudents, with what it covers (indianNote), and
// whether it's an estimate or a lower bound ("more than"). A university with
// campuses in several cities counts where it has its seat, and the note
// says so. IU and other private universities with campuses in many cities
// publish no figures by city, so they aren't in them. Figures as of
// October 2026, from the universities' own statistics and press releases.
import { findCity } from "./findCity";
import { slug } from "./slug";

export const STATES = {
  BW: "Baden-Württemberg",
  BY: "Bavaria",
  BE: "Berlin",
  BB: "Brandenburg",
  HB: "Bremen",
  HH: "Hamburg",
  HE: "Hesse",
  NI: "Lower Saxony",
  MV: "Mecklenburg-Vorpommern",
  NW: "North Rhine-Westphalia",
  RP: "Rhineland-Palatinate",
  SL: "Saarland",
  SN: "Saxony",
  ST: "Saxony-Anhalt",
  SH: "Schleswig-Holstein",
  TH: "Thuringia",
};

export const UNIVERSITY_CITIES = [
  // Baden-Württemberg
  { city: "Stuttgart", state: "BW", population: 630, universities: ["Universität Stuttgart", "Universität Hohenheim", "HFT Stuttgart", "HdM Stuttgart"],
    indianStudents: 921, indianNote: "Universität Stuttgart, winter semester 2025/26" },
  { city: "Karlsruhe", state: "BW", population: 305, universities: ["KIT", "Hochschule Karlsruhe (HKA)"],
    indianStudents: 741, indianNote: "KIT, winter semester 2025/26" },
  { city: "Freiburg", state: "BW", population: 235, universities: ["Universität Freiburg"],
    indianStudents: 530, indianNote: "Universität Freiburg, winter semester 2025/26" },
  { city: "Heidelberg", state: "BW", population: 160, universities: ["Universität Heidelberg", "SRH University"],
    indianStudents: 405, indianNote: "Universität Heidelberg, winter semester 2025/26" },
  { city: "Weingarten", state: "BW", population: 25, universities: ["Hochschule Ravensburg-Weingarten (RWU)", "PH Weingarten"],
    indianStudents: 360, indianEstimate: true, indianNote: "RWU, 2025/26" },
  { city: "Tübingen", state: "BW", population: 92, universities: ["Universität Tübingen"],
    indianStudents: 261, indianNote: "Universität Tübingen, winter semester 2025/26" },
  { city: "Ulm", state: "BW", population: 128, universities: ["Universität Ulm", "TH Ulm (THU)"],
    indianStudents: 161, indianNote: "Universität Ulm, winter semester 2025/26" },
  { city: "Mannheim", state: "BW", population: 315, universities: ["Universität Mannheim", "Hochschule Mannheim"],
    indianStudents: 82, indianNote: "Universität Mannheim, autumn 2025" },
  { city: "Konstanz", state: "BW", population: 86, universities: ["Universität Konstanz", "HTWG Konstanz"],
    indianStudents: 56, indianNote: "Universität Konstanz, winter semester 2025/26" },
  { city: "Heilbronn", state: "BW", population: 128, universities: ["Hochschule Heilbronn (HHN)", "TUM Campus Heilbronn"] },
  { city: "Pforzheim", state: "BW", population: 127, universities: ["Hochschule Pforzheim"] },
  { city: "Reutlingen", state: "BW", population: 117, universities: ["Hochschule Reutlingen"] },
  { city: "Esslingen", state: "BW", population: 95, universities: ["Hochschule Esslingen"] },
  { city: "Aalen", state: "BW", population: 68, universities: ["Hochschule Aalen"] },
  { city: "Friedrichshafen", state: "BW", population: 62, universities: ["Zeppelin Universität", "DHBW Ravensburg (Friedrichshafen campus)"] },
  { city: "Offenburg", state: "BW", population: 61, universities: ["Hochschule Offenburg"] },
  { city: "Furtwangen", state: "BW", population: 9, universities: ["Hochschule Furtwangen (HFU)"] },

  // Bavaria
  { city: "Erlangen", state: "BY", population: 115, universities: ["FAU Erlangen-Nürnberg"],
    indianStudents: 2316, indianNote: "FAU as a whole, with its sites in Nuremberg; winter semester 2026/27 (provisional)" },
  { city: "Munich", state: "BY", population: 1510, universities: ["LMU München", "TUM", "Hochschule München (HM)"],
    indianStudents: 1745, indianNote: "TUM (1,684, winter semester 2025/26, with Garching, Freising, Heilbronn and Straubing) and HM (61, 2024)" },
  { city: "Hof", state: "BY", population: 46, universities: ["Hochschule Hof"],
    indianStudents: 1113, indianNote: "Hochschule Hof, winter semester 2023/24" },
  { city: "Würzburg", state: "BY", population: 128, universities: ["Universität Würzburg (JMU)", "THWS"],
    indianStudents: 900, indianEstimate: true, indianNote: "THWS as a whole, with Schweinfurt; winter semester 2024/25" },
  { city: "Regensburg", state: "BY", population: 155, universities: ["Universität Regensburg", "OTH Regensburg"],
    indianStudents: 389, indianNote: "OTH Regensburg (327, 2026) and Universität Regensburg (62, winter semester 2025/26)" },
  { city: "Passau", state: "BY", population: 53, universities: ["Universität Passau"],
    indianStudents: 144, indianNote: "Universität Passau, summer semester 2026" },
  { city: "Eichstätt", state: "BY", population: 13, universities: ["KU Eichstätt-Ingolstadt"],
    indianStudents: 132, indianNote: "KU as a whole, with Ingolstadt; summer semester 2026" },
  { city: "Nuremberg", state: "BY", population: 525, universities: ["TH Nürnberg", "FAU (Nuremberg sites)", "TU Nürnberg (UTN)"] },
  { city: "Augsburg", state: "BY", population: 300, universities: ["Universität Augsburg", "TH Augsburg (THA)"] },
  { city: "Ingolstadt", state: "BY", population: 140, universities: ["TH Ingolstadt (THI)", "KU Eichstätt-Ingolstadt (Ingolstadt campus)"] },
  { city: "Bamberg", state: "BY", population: 78, universities: ["Universität Bamberg"] },
  { city: "Landshut", state: "BY", population: 75, universities: ["Hochschule Landshut"] },
  { city: "Bayreuth", state: "BY", population: 74, universities: ["Universität Bayreuth"] },
  { city: "Aschaffenburg", state: "BY", population: 72, universities: ["TH Aschaffenburg"] },
  { city: "Kempten", state: "BY", population: 70, universities: ["Hochschule Kempten"] },
  { city: "Rosenheim", state: "BY", population: 64, universities: ["TH Rosenheim"] },
  { city: "Neu-Ulm", state: "BY", population: 60, universities: ["Hochschule Neu-Ulm (HNU)"] },
  { city: "Schweinfurt", state: "BY", population: 54, universities: ["THWS (Schweinfurt campus)"] },
  { city: "Freising", state: "BY", population: 49, universities: ["TUM (Weihenstephan)", "Hochschule Weihenstephan-Triesdorf (HSWT)"] },
  { city: "Weiden", state: "BY", population: 43, universities: ["OTH Amberg-Weiden"] },
  { city: "Amberg", state: "BY", population: 42, universities: ["OTH Amberg-Weiden"] },
  { city: "Ansbach", state: "BY", population: 42, universities: ["Hochschule Ansbach"] },
  { city: "Coburg", state: "BY", population: 41, universities: ["Hochschule Coburg"] },
  { city: "Deggendorf", state: "BY", population: 34, universities: ["TH Deggendorf (THD)"] },
  { city: "Pfarrkirchen", state: "BY", population: 13, universities: ["European Campus Rottal-Inn (THD)"] },

  // Berlin
  { city: "Berlin", state: "BE", population: 3800, universities: ["TU Berlin", "FU Berlin", "HU Berlin", "HTW Berlin"],
    indianStudents: 1020, indianNote: "TU Berlin (691, winter semester 2023/24) and FU Berlin (329, winter semester 2025/26) only" },

  // Brandenburg
  { city: "Cottbus", state: "BB", population: 98, universities: ["BTU Cottbus-Senftenberg"],
    indianStudents: 900, indianNote: "BTU as a whole, with Senftenberg; about winter semester 2024/25" },
  { city: "Frankfurt (Oder)", state: "BB", population: 57, universities: ["Europa-Universität Viadrina"],
    indianStudents: 196, indianNote: "Viadrina, winter semester 2024/25" },
  { city: "Potsdam", state: "BB", population: 185, universities: ["Universität Potsdam", "FH Potsdam"] },
  { city: "Brandenburg an der Havel", state: "BB", population: 73, universities: ["TH Brandenburg"] },
  { city: "Wildau", state: "BB", population: 10, universities: ["TH Wildau"] },

  // Bremen
  { city: "Bremen", state: "HB", population: 570, universities: ["Universität Bremen", "Hochschule Bremen", "Constructor University"],
    indianStudents: 585, indianNote: "Universität Bremen, winter semester 2025/26" },
  { city: "Bremerhaven", state: "HB", population: 115, universities: ["Hochschule Bremerhaven"] },

  // Hamburg
  { city: "Hamburg", state: "HH", population: 1900, universities: ["Universität Hamburg", "TU Hamburg (TUHH)", "HAW Hamburg"],
    indianStudents: 283, indianNote: "Universität Hamburg only, winter semester 2025/26" },

  // Hesse
  { city: "Darmstadt", state: "HE", population: 162, universities: ["TU Darmstadt", "Hochschule Darmstadt (h_da)"],
    indianStudents: 637, indianNote: "TU Darmstadt, winter semester 2023/24" },
  { city: "Kassel", state: "HE", population: 200, universities: ["Universität Kassel"],
    indianStudents: 408, indianNote: "Universität Kassel, winter semester 2026/27 (provisional)" },
  { city: "Frankfurt", state: "HE", population: 775, universities: ["Goethe-Universität", "Frankfurt UAS", "Frankfurt School"],
    indianStudents: 148, indianNote: "Goethe-Universität only, winter semester 2023/24" },
  { city: "Wiesbaden", state: "HE", population: 285, universities: ["Hochschule RheinMain"] },
  { city: "Giessen", state: "HE", population: 92, universities: ["Universität Gießen (JLU)", "TH Mittelhessen (THM)"] },
  { city: "Marburg", state: "HE", population: 77, universities: ["Universität Marburg"] },
  { city: "Fulda", state: "HE", population: 70, universities: ["Hochschule Fulda"] },

  // Lower Saxony
  { city: "Hanover", state: "NI", population: 545, universities: ["Leibniz Universität Hannover", "Hochschule Hannover", "MHH"],
    indianStudents: 578, indianNote: "Leibniz Universität Hannover, winter semester 2026/27 (provisional)" },
  { city: "Oldenburg", state: "NI", population: 172, universities: ["Universität Oldenburg", "Jade Hochschule (Oldenburg campus)"],
    indianStudents: 261, indianNote: "Universität Oldenburg, winter semester 2025/26" },
  { city: "Braunschweig", state: "NI", population: 250, universities: ["TU Braunschweig", "HBK Braunschweig"] },
  { city: "Osnabrück", state: "NI", population: 167, universities: ["Universität Osnabrück", "Hochschule Osnabrück"] },
  { city: "Göttingen", state: "NI", population: 118, universities: ["Universität Göttingen", "HAWK (Göttingen campus)"] },
  { city: "Hildesheim", state: "NI", population: 101, universities: ["Universität Hildesheim", "HAWK"] },
  { city: "Lüneburg", state: "NI", population: 78, universities: ["Leuphana Universität Lüneburg"] },
  { city: "Wilhelmshaven", state: "NI", population: 76, universities: ["Jade Hochschule"] },
  { city: "Wolfenbüttel", state: "NI", population: 52, universities: ["Ostfalia"] },
  { city: "Emden", state: "NI", population: 50, universities: ["Hochschule Emden/Leer"] },
  { city: "Vechta", state: "NI", population: 33, universities: ["Universität Vechta"] },
  { city: "Clausthal-Zellerfeld", state: "NI", population: 15, universities: ["TU Clausthal"] },

  // Mecklenburg-Vorpommern
  { city: "Greifswald", state: "MV", population: 60, universities: ["Universität Greifswald"],
    indianStudents: 49, indianNote: "Universität Greifswald, winter semester 2025/26" },
  { city: "Rostock", state: "MV", population: 210, universities: ["Universität Rostock"] },
  { city: "Neubrandenburg", state: "MV", population: 63, universities: ["Hochschule Neubrandenburg"] },
  { city: "Stralsund", state: "MV", population: 60, universities: ["Hochschule Stralsund"] },
  { city: "Wismar", state: "MV", population: 43, universities: ["Hochschule Wismar"] },

  // North Rhine-Westphalia
  { city: "Aachen", state: "NW", population: 250, universities: ["RWTH Aachen", "FH Aachen"],
    indianStudents: 2526, indianNote: "RWTH Aachen, winter semester 2025/26" },
  { city: "Dortmund", state: "NW", population: 595, universities: ["TU Dortmund", "FH Dortmund"],
    indianStudents: 610, indianNote: "TU Dortmund (about 500, winter semester 2025/26) and FH Dortmund (about 110, December 2025)" },
  { city: "Kleve", state: "NW", population: 53, universities: ["Hochschule Rhein-Waal (HSRW)"],
    indianStudents: 590, indianNote: "Hochschule Rhein-Waal as a whole, with Kamp-Lintfort; 2024" },
  { city: "Siegen", state: "NW", population: 102, universities: ["Universität Siegen"],
    indianStudents: 483, indianNote: "Universität Siegen, winter semester 2025/26" },
  { city: "Paderborn", state: "NW", population: 155, universities: ["Universität Paderborn"],
    indianStudents: 470, indianNote: "Universität Paderborn, winter semester 2024/25" },
  { city: "Bochum", state: "NW", population: 365, universities: ["Ruhr-Universität Bochum (RUB)", "Hochschule Bochum"],
    indianStudents: 357, indianEstimate: true, indianNote: "Ruhr-Universität Bochum, winter semester 2024/25" },
  { city: "Bonn", state: "NW", population: 335, universities: ["Universität Bonn"],
    indianStudents: 332, indianNote: "Universität Bonn, winter semester 2023/24" },
  { city: "Wuppertal", state: "NW", population: 360, universities: ["Universität Wuppertal"],
    indianStudents: 137, indianNote: "Universität Wuppertal, winter semester 2025/26" },
  { city: "Cologne", state: "NW", population: 1085, universities: ["Universität zu Köln", "TH Köln", "Deutsche Sporthochschule Köln", "CBS International Business School"] },
  { city: "Düsseldorf", state: "NW", population: 630, universities: ["HHU Düsseldorf", "Hochschule Düsseldorf"] },
  { city: "Essen", state: "NW", population: 585, universities: ["Universität Duisburg-Essen (UDE)", "Folkwang Universität der Künste"] },
  { city: "Duisburg", state: "NW", population: 500, universities: ["Universität Duisburg-Essen (UDE)"] },
  { city: "Bielefeld", state: "NW", population: 335, universities: ["Universität Bielefeld", "Hochschule Bielefeld (HSBI)"] },
  { city: "Münster", state: "NW", population: 320, universities: ["Universität Münster", "FH Münster"] },
  { city: "Mönchengladbach", state: "NW", population: 268, universities: ["Hochschule Niederrhein"] },
  { city: "Gelsenkirchen", state: "NW", population: 265, universities: ["Westfälische Hochschule"] },
  { city: "Krefeld", state: "NW", population: 228, universities: ["Hochschule Niederrhein"] },
  { city: "Hagen", state: "NW", population: 190, universities: ["FernUniversität in Hagen", "FH Südwestfalen"] },
  { city: "Hamm", state: "NW", population: 180, universities: ["Hochschule Hamm-Lippstadt (HSHL)"] },
  { city: "Mülheim an der Ruhr", state: "NW", population: 172, universities: ["Hochschule Ruhr West"] },
  { city: "Witten", state: "NW", population: 96, universities: ["Universität Witten/Herdecke"] },
  { city: "Iserlohn", state: "NW", population: 92, universities: ["FH Südwestfalen", "University of Europe (UE)"] },
  { city: "Lippstadt", state: "NW", population: 68, universities: ["Hochschule Hamm-Lippstadt (HSHL)"] },
  { city: "Sankt Augustin", state: "NW", population: 56, universities: ["Hochschule Bonn-Rhein-Sieg (H-BRS)"] },
  { city: "Lemgo", state: "NW", population: 41, universities: ["TH OWL"] },
  { city: "Kamp-Lintfort", state: "NW", population: 38, universities: ["Hochschule Rhein-Waal (HSRW)"] },

  // Rhineland-Palatinate
  { city: "Mainz", state: "RP", population: 220, universities: ["Universität Mainz (JGU)", "Hochschule Mainz"],
    indianStudents: 112, indianNote: "JGU Mainz, winter semester 2025/26" },
  { city: "Bingen", state: "RP", population: 26, universities: ["TH Bingen"],
    indianStudents: 70, indianAtLeast: true, indianNote: "TH Bingen, November 2023" },
  { city: "Ludwigshafen", state: "RP", population: 175, universities: ["Hochschule Ludwigshafen"] },
  { city: "Koblenz", state: "RP", population: 115, universities: ["Universität Koblenz", "Hochschule Koblenz"] },
  { city: "Trier", state: "RP", population: 111, universities: ["Universität Trier", "Hochschule Trier"] },
  { city: "Kaiserslautern", state: "RP", population: 100, universities: ["RPTU Kaiserslautern-Landau", "Hochschule Kaiserslautern"] },
  { city: "Worms", state: "RP", population: 84, universities: ["Hochschule Worms"] },
  { city: "Landau", state: "RP", population: 47, universities: ["RPTU Kaiserslautern-Landau"] },

  // Saarland
  { city: "Saarbrücken", state: "SL", population: 180, universities: ["Universität des Saarlandes", "htw saar"],
    indianStudents: 658, indianNote: "Universität des Saarlandes, winter semester 2025/26" },

  // Saxony
  { city: "Chemnitz", state: "SN", population: 250, universities: ["TU Chemnitz"],
    indianStudents: 1600, indianEstimate: true, indianNote: "TU Chemnitz, winter semester 2025/26 (between 1,200 and 2,000)" },
  { city: "Dresden", state: "SN", population: 565, universities: ["TU Dresden", "HTW Dresden"],
    indianStudents: 984, indianNote: "TU Dresden (870, winter semester 2024/25) and HTW Dresden (114, winter semester 2025/26)" },
  { city: "Leipzig", state: "SN", population: 615, universities: ["Universität Leipzig", "HTWK Leipzig", "HHL Leipzig"],
    indianStudents: 200, indianNote: "Universität Leipzig only, about winter semester 2025/26" },
  { city: "Zwickau", state: "SN", population: 87, universities: ["WHZ Zwickau"] },
  { city: "Görlitz", state: "SN", population: 56, universities: ["Hochschule Zittau/Görlitz"] },
  { city: "Freiberg", state: "SN", population: 40, universities: ["TU Bergakademie Freiberg"] },
  { city: "Zittau", state: "SN", population: 25, universities: ["Hochschule Zittau/Görlitz"] },
  { city: "Mittweida", state: "SN", population: 14, universities: ["Hochschule Mittweida"] },

  // Saxony-Anhalt
  { city: "Magdeburg", state: "ST", population: 240, universities: ["Universität Magdeburg (OVGU)", "Hochschule Magdeburg-Stendal"],
    indianStudents: 2200, indianAtLeast: true, indianNote: "OVGU, 2025" },
  { city: "Halle (Saale)", state: "ST", population: 240, universities: ["Universität Halle-Wittenberg (MLU)", "Burg Giebichenstein Kunsthochschule"] },
  { city: "Dessau-Roßlau", state: "ST", population: 75, universities: ["Hochschule Anhalt"] },
  { city: "Merseburg", state: "ST", population: 33, universities: ["Hochschule Merseburg"] },
  { city: "Wernigerode", state: "ST", population: 32, universities: ["Hochschule Harz"] },
  { city: "Köthen", state: "ST", population: 25, universities: ["Hochschule Anhalt"] },

  // Schleswig-Holstein
  { city: "Kiel", state: "SH", population: 248, universities: ["Universität Kiel (CAU)", "HAW Kiel"] },
  { city: "Lübeck", state: "SH", population: 218, universities: ["Universität zu Lübeck", "TH Lübeck"] },
  { city: "Flensburg", state: "SH", population: 92, universities: ["Europa-Universität Flensburg", "Hochschule Flensburg"] },

  // Thuringia
  { city: "Ilmenau", state: "TH", population: 39, universities: ["TU Ilmenau"],
    indianStudents: 550, indianAtLeast: true, indianNote: "TU Ilmenau, June 2026" },
  { city: "Jena", state: "TH", population: 110, universities: ["Universität Jena", "Ernst-Abbe-Hochschule Jena (EAH)"],
    indianStudents: 243, indianNote: "Universität Jena, winter semester 2022/23" },
  { city: "Erfurt", state: "TH", population: 215, universities: ["Universität Erfurt", "FH Erfurt"] },
  { city: "Weimar", state: "TH", population: 65, universities: ["Bauhaus-Universität Weimar"] },
  { city: "Nordhausen", state: "TH", population: 41, universities: ["Hochschule Nordhausen"] },
  { city: "Schmalkalden", state: "TH", population: 19, universities: ["Hochschule Schmalkalden"] },
];

// A city's name for matching: its slug, with ä, ö and ü written either way
// ("Muenster" and "Münster" both give "munster").
export const cityMatchKey = (text) => slug(text).replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u");

// Other names for cities on the list (as cityMatchKey gives them), on top of
// the ones findCity knows (München, Köln, Nürnberg, Frankfurt am Main).
// Frankfurt (Oder) is its own city, as are Erlangen and Nuremberg, and
// Duisburg and Essen.
const ALIASES = {
  hannover: "Hanover",
  "frankfurt-main": "Frankfurt", "frankfurt-a-m": "Frankfurt",
  "frankfurt-an-der-oder": "Frankfurt (Oder)", "frankfurt-o": "Frankfurt (Oder)",
  "freiburg-im-breisgau": "Freiburg",
  halle: "Halle (Saale)", "halle-an-der-saale": "Halle (Saale)",
  "landau-in-der-pfalz": "Landau", "landau-pfalz": "Landau",
  "bingen-am-rhein": "Bingen",
  "brandenburg-havel": "Brandenburg an der Havel",
  dessau: "Dessau-Roßlau",
  "kothen-anhalt": "Köthen",
  clausthal: "Clausthal-Zellerfeld",
  "st-augustin": "Sankt Augustin",
  mulheim: "Mülheim an der Ruhr", "mulheim-ruhr": "Mülheim an der Ruhr",
  "weiden-in-der-oberpfalz": "Weiden", "weiden-i-d-opf": "Weiden",
  "furtwangen-im-schwarzwald": "Furtwangen",
};

const BY_KEY = new Map(UNIVERSITY_CITIES.map((c) => [cityMatchKey(c.city), c]));
const NAMES = UNIVERSITY_CITIES.map((c) => c.city);

// The city on the list that a city as members write it means, or null:
// "München", "muenchen" and "Munich" all give Munich; "Hannover" gives
// Hanover. An ambassador's city (profiles.ambassador_city) or the city of
// an application to be one.
export function universityCity(text) {
  const key = cityMatchKey(text);
  if (!key) return null;
  if (BY_KEY.has(key)) return BY_KEY.get(key);
  if (ALIASES[key]) return BY_KEY.get(cityMatchKey(ALIASES[key])) || null;
  const known = findCity(text, NAMES);
  return known ? BY_KEY.get(cityMatchKey(known)) || null : null;
}

// How the list orders the cities that still need an ambassador: the most
// Indian students first, where we know them, then the cities with more
// universities, then the bigger ones.
export function byPriority(a, b) {
  return (b.indianStudents || 0) - (a.indianStudents || 0)
    || b.universities.length - a.universities.length
    || b.population - a.population
    || a.city.localeCompare(b.city, "en");
}
