// ============================================================================
// Profile completeness, and the reminders our team sends about it from the
// admin panel (Members' progress, src/admin/ProgressView.jsx). This is the
// one place for their words: the admin panel shows them and sends them to the
// database (public.admin_send_profile_reminders in
// supabase/migrations/20261028000000_profile_completeness.sql), which fills
// in each member's percentage, missing items and city, and sends the
// reminder as an in-app notification. The member app recognises a reminder
// about one item by its text, to open the right field.
// ============================================================================

// The seven items, in this order everywhere, each worth the same. key: the
// name the database uses (the profiles column, "photo" for avatar_url).
// label: in the admin panel. words: in the general reminder's list
// ("Add a profile photo and your hometown …"). reminder: the reminder about
// this item alone. field: the field in the member app's Edit profile that
// opens with the focus (photo: the photo picker).
export const PROFILE_ITEMS = [
  {
    key: "photo", column: "avatar_url", member: "avatar_url", field: "photo",
    label: "Photo", words: "a profile photo",
    reminder: "Your profile photo is missing. Add one so members recognise you.",
  },
  {
    key: "profession", column: "profession", member: "profession", field: "profession",
    label: "Profession", words: "what you do",
    reminder: "Your profile doesn't say what you do yet. Add your profession so members in the same line of work can find you.",
  },
  {
    key: "occupation_status", column: "occupation_status", member: "occupationStatus", field: "occupationStatus",
    label: "Work status", words: "your work status",
    reminder: "Your profile has no work status yet. Add it so members know if you're working, studying or looking for work.",
  },
  {
    key: "bio", column: "bio", member: "bio", field: "bio",
    label: "About me", words: "a few words about you",
    reminder: "Your profile has no \"About me\" yet. Add a few words so members know who you are.",
  },
  {
    key: "hometown", column: "hometown", member: "hometown", field: "hometown",
    label: "Hometown", words: "your hometown in India",
    reminder: "Your hometown in India is missing. Add it so members from the same place can find you.",
  },
  {
    key: "ask_me_about", column: "ask_me_about", member: "askMeAbout", field: "askMeAbout",
    label: "Ask me about", words: "what members can ask you about",
    reminder: "Add what members can ask you about, for example the Blue Card or moving with children. Members find you by these topics.",
  },
  {
    key: "years_abroad", column: "years_abroad", member: "yearsAbroad", field: "yearsAbroad",
    label: "Years abroad", words: "how long you've lived abroad",
    reminder: "Add how long you've lived abroad, so newcomers can find members who know the ropes.",
  },
];

export const PROFILE_ITEM_KEYS = PROFILE_ITEMS.map((i) => i.key);
export const itemByKey = (key) => PROFILE_ITEMS.find((i) => i.key === key) || null;

// The general reminder: {percent}, {missing} (the words of the missing
// items, "a, b and c") and {city} (the member's city, or NO_CITY) are filled
// in for each member.
export const GENERAL_REMINDER = "Your NRIClub profile is {percent}% complete. Add {missing} so members in {city} know who you are.";
export const NO_CITY = "your city";

// A member gets at most one profile reminder in this many days (the
// database refuses more and skips them in a bulk send).
export const REMINDER_DAYS = 7;

// 0, 14, 29, 43, 57, 71, 86 or 100.
export const percentOf = (filled) => Math.round((filled / PROFILE_ITEMS.length) * 100);

// The keys of the items missing from a profile: a database row (avatar_url,
// occupation_status, …) or the member app's user object (occupationStatus,
// askMeAbout, …).
export function missingItems(profile) {
  const p = profile || {};
  return PROFILE_ITEMS.filter((i) => !String((i.member in p ? p[i.member] : p[i.column]) ?? "").trim()).map((i) => i.key);
}

// "a, b and c".
export function listWords(words) {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

// What the database sends with a reminder of this kind ("general" or an
// item's key): the text, and for the general one the words of every item
// and the word for a member without a city.
export function reminderPayload(kind) {
  if (kind === "general") {
    return { text: GENERAL_REMINDER, words: { items: Object.fromEntries(PROFILE_ITEMS.map((i) => [i.key, i.words])), no_city: NO_CITY } };
  }
  return { text: itemByKey(kind)?.reminder || "", words: {} };
}

// The reminder a member gets, as the database writes it (the admin panel
// shows it before sending). missing: the keys of their missing items.
export function reminderText(kind, { missing = [], city = "" } = {}) {
  const { text, words } = reminderPayload(kind);
  const filled = PROFILE_ITEMS.length - missing.length;
  const names = PROFILE_ITEM_KEYS.filter((k) => missing.includes(k)).map((k) => words.items?.[k] || "");
  return text
    .replaceAll("{percent}", String(percentOf(filled)))
    .replaceAll("{missing}", listWords(names))
    .replaceAll("{city}", String(city || "").trim() || NO_CITY);
}

// Which item a reminder is about, from its text: the item's key, or
// "general" for any other reminder.
export function reminderKind(text) {
  return PROFILE_ITEMS.find((i) => i.reminder === String(text || "").trim())?.key || "general";
}
