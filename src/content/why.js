// ============================================================================
// WHY NRICLUB: the homepage section (WhyNRIClub.jsx) that shows why one place
// beats hunting through chat groups. The numbers come from our own count and
// must stay true: change them only after counting again, with the date.
//
// Our count (23 October 2026): public web pages that list WhatsApp group
// links for Indians in Germany (link lists, association and university
// pages, blogs), about 54 cities. Each invite page was opened without
// joining: a working link shows the group's name. 276 invite links, 124 of
// them no longer worked; 39 of the working ones are run by businesses
// (housing platforms, movie promoters). Munich: 35 links, 32 no longer
// worked. The spreadsheet is kept outside the repository.
// ============================================================================

export const WHY_COUNT_DATE = "23 October 2026";

// The stat tiles: value (counted up on screen), its suffix, and what it means.
export const WHY_STATS = [
  { value: 276, suffix: "", label: "WhatsApp group links for Indians in Germany, on public web pages" },
  { value: 45, suffix: "%", label: "of them no longer worked: the link was reset or the group was gone" },
  { value: 32, suffix: " of 35", label: "links for Munich alone were dead" },
  { value: 39, suffix: "", label: "of the working groups are run by businesses: housing platforms and promoters" },
];

export const WHY_METHOD = `Our own count on ${WHY_COUNT_DATE}: we opened every invite link we could find on public web pages for about 50 German cities, without joining. Groups shared only privately aren't counted.`;

// The illustration: made-up names of the kind people find (never real
// groups); dead: true shows the link as reset.
export const WHY_BUBBLES = [
  { name: "Indians in Munich 2", dead: true },
  { name: "Munich desi flats", dead: false },
  { name: "Munich Indians NEW", dead: true },
  { name: "Telugu Munich", dead: false },
  { name: "Indians MUC 2023", dead: true },
  { name: "Desi events Bavaria", dead: false },
  { name: "Students Munich", dead: true },
  { name: "Rooms + jobs MUC", dead: false },
];

// What one NRIClub account gives, in the illustration's card.
export const WHY_CARD = ["Your city's group", "Rooms and flatmates", "Events and festivals", "Questions with answers", "Job referrals", "Free NRI guides"];

// Scattered groups vs NRIClub: only what NRIClub really does.
export const WHY_COMPARE = [
  { topic: "Finding your people", groups: "Hunt through link lists, and many links are dead.", club: "Search your city once and join its group." },
  { topic: "Your phone number", groups: "In most groups, every member sees it.", club: "We never ask for it. Message members inside NRIClub." },
  { topic: "Who's there", groups: "Anyone who has the link can join.", club: "A person on our team checks every new member." },
  { topic: "Good answers", groups: "Scroll away in the chat.", club: "The person who asked marks the best answer, and the guides stay." },
  { topic: "Rooms, events, jobs", groups: "One more group for each.", club: "All in your city's group, with RSVP and a calendar." },
  { topic: "Moving to another city", groups: "Find and join new groups all over again.", club: "Change your city and keep your connections." },
];
