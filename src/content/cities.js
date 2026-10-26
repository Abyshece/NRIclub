// Cities with an NRIClub group (October 2026) that NRIClub shows publicly.
// The build writes a public page for each (nriclub.app/city/<slug>) and lists
// it in the sitemap (vite.config.js); new groups still get a working city
// page, just without their own link preview.
//
// The UK is paused (docs/compliance/uk-pause.md): while NRIClub has no UK
// representative (Art. 27 UK GDPR), it doesn't target people in the UK. The
// cities in UK_CITIES have groups in the database, which stay members-only,
// but no public page, no place in the sitemap, the homepage or the city
// search, and a city page at their address says NRIClub isn't open there.
// UK_CITIES also holds names that are as likely to mean a UK place as one
// elsewhere (UK_CITIES_UNSURE): take one out of both lists, and put it back
// into CITIES, once you know its group is for a city outside the UK.
export const UK_CITIES_UNSURE = ["Cambridge", "Chesterfield", "East London", "Halifax", "Kingston", "Morley", "Newport",
  "Richmond", "Southport", "Windsor"];
export const UK_CITIES = [
  "Aberdeen", "Barnet", "Belfast", "Birmingham", "Bolton", "Bradford", "Brent", "Cardiff", "Coventry", "Croydon",
  "Derby", "Dudley", "Dundee", "Ealing", "East Ham", "Edinburgh", "Enfield", "Glasgow", "Harrow", "Hounslow",
  "Ilford", "Kirklees", "Leeds", "Leicester", "Liverpool", "London", "Manchester", "Milton Keynes", "Northampton",
  "Nottingham", "Oldham", "Reading", "Redbridge", "Sandwell", "Sheffield", "Slough", "Solihull", "Southall",
  "Stockport", "Swansea", "Tooting", "Trafford", "Walsall", "Wembley", "Wokingham", "Wolverhampton",
  ...UK_CITIES_UNSURE,
];
const ukKeys = new Set(UK_CITIES.map((c) => c.toLowerCase()));
// Whether a city's name (as a group or a visitor writes it) is a paused UK
// city: "London", " london ", "Indians in London" (the group's name).
export const isPausedCity = (name) =>
  ukKeys.has(String(name || "").replace(/^\s*indians in\s+/i, "").trim().replace(/\s+/g, " ").toLowerCase());

// Every city with a group, UK ones included (CITIES leaves those out).
const CITY_GROUPS = [
  "Abbotsford", "Aberdeen", "Abha", "Abidjan", "Abu Dhabi", "Abuja", "Accra", "Adelaide", "Ahmadi", "Ajman",
  "Al Ain", "Al Khobar", "Al Khor", "Al Rayyan", "Al Wakrah", "Alicante", "Alor Setar", "Alpharetta",
  "Amstelveen", "Amsterdam", "Anaheim", "Ann Arbor", "Anna Regina", "Antwerp", "Arima", "Artesia", "Arusha",
  "Ashburn", "Athens", "Atlanta", "Auckland", "Aurora", "Austin", "Bali", "Bangkok", "Barcelona", "Barnet",
  "Basel", "Beau Bassin-Rose Hill", "Beijing", "Belfast", "Bellevue", "Berkeley", "Berlin", "Bern",
  "Birmingham", "Blacktown", "Blantyre", "Bobigny", "Bologna", "Bolton", "Bonn", "Boston", "Bothell",
  "Bradford", "Brampton", "Brent", "Brescia", "Brickfields", "Bridgetown", "Brisbane", "Brossard", "Brussels",
  "Budapest", "Bulawayo", "Buraimi", "Burlington", "Burnaby", "Butterworth", "Calgary", "Cambridge",
  "Canberra", "Canning Vale", "Cape Town", "Cardiff", "Carmel", "Cary", "Castries", "Cebu City",
  "Centreville", "Centurion", "Cergy", "Chaguanas", "Chandler", "Chantilly", "Charlotte", "Chatsworth",
  "Chermside", "Chesterfield", "Chiang Mai", "Chicago", "Christchurch", "Cincinnati", "Clayton", "Cleveland",
  "Cologne", "Columbus", "Concord", "Copenhagen", "Coquitlam", "Cork", "Corriverton", "Couva", "Coventry",
  "Craigieburn", "Croydon", "Cumming", "Cupertino", "Curepipe", "Dallas", "Dammam", "Dandenong",
  "Dar es Salaam", "Darwin", "Delta", "Denver", "Derby", "Detroit", "Doha", "Dollard-des-Ormeaux", "Dubai",
  "Dublin", "Dudley", "Dukhan", "Dundee", "Dunedin", "Duqm", "Durban", "Düsseldorf", "Ealing", "East Ham",
  "East London", "Eden Prairie", "Edinburgh", "Edison", "Edmonton", "Eindhoven", "Eldoret", "Enfield",
  "Entebbe", "Espoo", "Evanston", "Fahaheel", "Fairfax", "Farmington Hills", "Faro", "Farwaniya", "Flacq",
  "Florence", "Forchheim", "Frankfurt", "Fremantle", "Fremont", "Frisco", "Fujairah", "Gaborone", "Galway",
  "Gatesville", "Geneva", "Genoa", "George Town", "Georgetown", "Ghent", "Glasgow", "Glen Waverley",
  "Gold Coast", "Goodlands", "Gothenburg", "Graz", "Groningen", "Guelph", "Haarlem", "Halifax", "Hamad Town",
  "Hamburg", "Hamilton", "Hanoi", "Harare", "Harris Park", "Harrow", "Hawalli", "Heidelberg", "Helsinki",
  "Henderson", "Herndon", "Ho Chi Minh City", "Hobart", "Hoboken", "Hoffman Estates", "Hong Kong", "Hornsby",
  "Hounslow", "Houston", "Ibri", "Ilford", "Indianapolis", "Ipoh", "Irvine", "Irving", "Isa Town", "Iselin",
  "Jakarta", "Jeddah", "Jersey City", "Jinja", "Jizan", "Jleeb Al-Shuyoukh", "Johannesburg", "Johns Creek",
  "Johor Bahru", "Joondalup", "Jubail", "Kamloops", "Kampala", "Kanata", "Kansas City", "Karlsruhe", "Katy",
  "Kelowna", "Kigali", "King of Prussia", "Kingston", "Kirkland", "Kirklees", "Kisumu", "Kitchener", "Klang",
  "Kobe", "Kowloon", "Krakow", "Kuala Lumpur", "Kuantan", "Kuwait City", "Kyoto", "La Courneuve", "Lagos",
  "Lausanne", "Leeds", "Leicester", "Lelydorp", "Lenasia", "Lexington", "Lilongwe", "Limerick", "Linden",
  "Lisbon", "Liverpool", "London", "Los Angeles", "Lower Hutt", "Lusaka", "Lyon", "Maastricht", "Madrid",
  "Mahboula", "Mahébourg", "Makati", "Malaga", "Malmö", "Manama", "Manchester", "Mandalay", "Mangaf",
  "Manila", "Manukau", "Maputo", "Marion", "Markham", "Marseille", "Mason", "Mecca", "Medan", "Medina",
  "Melaka", "Melbourne", "Mesaieed", "Miami", "Midrand", "Milan", "Milpitas", "Milton", "Milton Keynes",
  "Minneapolis", "Mississauga", "Mombasa", "Montego Bay", "Montreal", "Morley", "Morrisville",
  "Mount Gravatt", "Mount Roskill", "Mountain View", "Muharraq", "Munich", "Muscat", "Mwanza", "Nairobi",
  "Najran", "Nakuru", "Nanaimo", "Naperville", "Napier", "Naples", "Ndola", "Nepean", "New Amsterdam",
  "New Westminster", "New York City", "Newark", "Newport", "Nice", "Nieuw Nickerie", "Nizwa", "Northampton",
  "Nottingham", "Novi", "Nuremberg", "Oak Brook", "Oakville", "Oldham", "Orlando", "Osaka", "Oslo", "Ottawa",
  "Overland Park", "Palmerston North", "Palo Alto", "Papatoetoe", "Paramaribo", "Paris", "Parramatta",
  "Parsippany", "Pattaya", "Penal", "Penrith", "Perth", "Petaling Jaya", "Philadelphia", "Phoenix", "Phuket",
  "Pietermaritzburg", "Plano", "Point Cook", "Point Fortin", "Porirua", "Port Elizabeth", "Port Harcourt",
  "Port Louis", "Port of Spain", "Porto", "Prague", "Pretoria", "Princeton", "Quatre Bornes", "Raleigh",
  "Ras Al Khaimah", "Reading", "Redbridge", "Redmond", "Regina", "Riccarton", "Richmond", "Richmond Hill",
  "Riffa", "Riverside", "Riyadh", "Rome", "Rotterdam", "Round Rock", "Ryde", "Rylands", "Saanich", "Salalah",
  "Salisbury", "Salmiya", "Salzburg", "San Antonio", "San Diego", "San Fernando", "San Francisco", "San Jose",
  "Sandringham", "Sandton", "Sandwell", "Santa Clara", "Saskatoon", "Schaumburg", "Seattle", "Seoul",
  "Seremban", "Seville", "Shah Alam", "Shanghai", "Sharjah", "Sheffield", "Singapore", "Siparia", "Sitra",
  "Slough", "Sohar", "Solihull", "Southall", "Southport", "Spanish Town", "Springvale", "St. John's",
  "St. Louis", "Stavanger", "Stockholm", "Stockport", "Strathfield", "Stuttgart", "Subang Jaya", "Sugar Land",
  "Sungai Petani", "Sunnybank", "Sunnyvale", "Sur", "Surabaya", "Surrey", "Suwanee", "Swansea", "Sydney",
  "Tabuk", "Taif", "Taipei", "Taiping", "Tampa", "Tarneit", "Tauranga", "Tempe", "The Hague", "Tokyo",
  "Tooting", "Toronto", "Toulouse", "Trafford", "Triolet", "Troy", "Turin", "Umm Salal", "Utrecht",
  "Vacoas-Phoenix", "Valencia", "Vancouver", "Vantaa", "Vaughan", "Verona", "Victoria", "Vienna", "Walsall",
  "Waltham", "Warsaw", "Washington D.C.", "Waterford", "Waterloo", "Wellington", "Wembley", "Werribee",
  "West Chester", "Westmead", "Windsor", "Winnipeg", "Wokingham", "Wolverhampton", "Woodbridge", "Yanbu",
  "Yangon", "Yokohama", "Zurich"
];

export const CITIES = CITY_GROUPS.filter((c) => !isPausedCity(c));
