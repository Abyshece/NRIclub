// Tests for the housing search's words and checks (src/content/housing.js).
// No network, no database: the database's side is in supabase/tests/rls_test.py.
//
//     node --test tests/housing.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOUSING_KIND_KEYS, addDays, rangeText, availability, money, kindsText, fitLabel, lookingSummary, lookingState,
  listingState, listingProblem, lookingProblem, marketTag,
} from "../src/content/housing.js";

const TODAY = "2026-10-30";
const listing = (f = {}) => ({ kind: "wg_room", city: "Munich", from: "2026-11-01", until: "2026-12-31", openEnded: false,
  rent: "650", deposit: "1300", size: "", ...f });
const looking = (f = {}) => ({ kinds: ["wg_room"], city: "Munich", from: "2026-11-01", until: "", rent: "", note: "", ...f });

test("the kinds of place, in the site's order", () => {
  assert.deepEqual(HOUSING_KIND_KEYS, ["wg_room", "sublet", "flat", "short_stay", "house"]);
});

test("dates and money in words", () => {
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(rangeText("2027-03-01", "2027-03-31"), "1–31 Mar 2027");
  assert.equal(rangeText("2027-03-01", "2027-05-31"), "1 Mar – 31 May 2027");
  assert.equal(rangeText("2026-12-01", "2027-02-28"), "1 Dec 2026 – 28 Feb 2027");
  assert.equal(availability("2027-03-01", null), "Free from 1 Mar 2027, open-ended");
  assert.equal(availability("2027-03-01", "2027-05-31"), "Free 1 Mar – 31 May 2027");
  assert.equal(money(1250), "€1,250");
  assert.equal(kindsText(["sublet", "wg_room"]), "WG room or Sublet");
  assert.equal(kindsText(["house", "flat", "wg_room"]), "WG room, Whole flat or House");
  assert.equal(marketTag("Room [near] Ostbahnhof"), "[MARKETPLACE: Room near Ostbahnhof] ");
});

test("how a search result fits the dates", () => {
  assert.equal(fitLabel({ fit: "full" }, 20), "Free for all your dates");
  assert.equal(fitLabel({ fit: "flexible" }, 20), "Within a week of your dates");
  assert.equal(fitLabel({ fit: "partial", free_days: 12 }, 20), "Free 12 of your 20 days");
  // Without an end date: when it's free.
  assert.equal(fitLabel({ fit: "partial", free_from: "2027-03-01", free_until: "2027-05-31", available_from: "2027-02-01" }, null), "Free until 31 May 2027");
  assert.equal(fitLabel({ fit: "partial", free_from: "2027-03-05", free_until: null, available_from: "2027-03-05" }, null), "Free from 5 Mar 2027");
  assert.equal(fitLabel({ fit: null }, null), "");
});

test("a looking post and a listing in words", () => {
  const w = { kinds: ["wg_room", "sublet"], city: "Munich", date_from: "2027-03-01", date_to: "2027-05-31", max_rent: 700, active: true, expires_on: "2027-05-31" };
  assert.equal(lookingSummary(w), "WG room or Sublet in Munich · 1 Mar – 31 May 2027 · up to €700 warm");
  assert.equal(lookingSummary({ ...w, date_to: null, max_rent: null }), "WG room or Sublet in Munich · from 1 Mar 2027, no end date");
  assert.deepEqual(lookingState(w, TODAY), { key: "active", text: "Active until 31 May 2027" });
  assert.equal(lookingState({ ...w, active: false }, TODAY).key, "off");
  assert.equal(lookingState({ ...w, expires_on: "2026-10-29" }, TODAY).key, "expired");
  assert.equal(listingState({ expires_on: "2026-11-02" }, TODAY).key, "soon");
  assert.equal(listingState({ expires_on: "2026-12-30" }, TODAY).text, "Shown until 30 Dec 2026");
  assert.equal(listingState({ expires_on: "2026-10-29" }, TODAY).key, "expired");
});

test("a listing's details are checked before saving, as the database does", () => {
  assert.equal(listingProblem(listing(), TODAY), "");
  assert.equal(listingProblem(listing({ openEnded: true, until: "" }), TODAY), "");
  assert.match(listingProblem(listing({ kind: "" }), TODAY), /what kind of place/);
  assert.match(listingProblem(listing({ city: " " }), TODAY), /city/);
  assert.match(listingProblem(listing({ until: "" }), TODAY), /open-ended/);
  assert.match(listingProblem(listing({ until: "2026-10-31" }), TODAY), /before the "from" date/);
  assert.match(listingProblem(listing({ from: "2026-10-29" }), TODAY), /has passed/);
  assert.equal(listingProblem(listing({ from: "2026-10-29" }), TODAY, "2026-10-29"), "", "a listing being changed keeps its start");
  assert.match(listingProblem(listing({ until: "2027-11-30" }), TODAY), /12 months/);
  assert.match(listingProblem(listing({ rent: "" }), TODAY), /warm rent/);
  assert.match(listingProblem(listing({ rent: "6.5" }), TODAY), /warm rent/);
  assert.match(listingProblem(listing({ rent: "25000" }), TODAY), /warm rent/);
  assert.match(listingProblem(listing({ deposit: "" }), TODAY), /deposit/);
  assert.equal(listingProblem(listing({ deposit: "0" }), TODAY), "");
  assert.match(listingProblem(listing({ size: "0" }), TODAY), /size/);
});

test("a looking post is checked before saving", () => {
  assert.equal(lookingProblem(looking(), TODAY), "");
  assert.match(lookingProblem(looking({ kinds: [] }), TODAY), /at least one kind/);
  assert.match(lookingProblem(looking({ city: "Munich 80331" }), TODAY), /in letters/);
  assert.match(lookingProblem(looking({ city: "pay-rent.com" }), TODAY), /in letters/);
  assert.match(lookingProblem(looking({ until: "2026-10-31" }), TODAY), /before the "from" date/);
  assert.match(lookingProblem(looking({ rent: "0" }), TODAY), /highest warm rent/);
  assert.match(lookingProblem(looking({ note: "x".repeat(501) }), TODAY), /500 characters/);
});
