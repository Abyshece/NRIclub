import { useEffect, useState } from "react";
import { WHATS_ON, mergeWhatsOn } from "./content/whatson";
import { getWhatsOnEvents } from "./supabaseApi";

// ============================================================================
// The What's on list as the site shows it: the list in the code
// (src/content/whatson.js) plus the events our team added in the admin panel
// (public.whats_on_events), fetched once per visit. If they can't be fetched
// (no connection, or before the 2026-10-25 database update), the list in the
// code alone. Used by the page (WhatsOnPage.jsx), the city pages and the
// members' Events.
// ============================================================================

let merged = null; // the list once fetched
let request = null;

// The whole list (never rejects).
export function loadWhatsOn() {
  if (merged) return Promise.resolve(merged);
  if (!request) {
    request = getWhatsOnEvents()
      .then((rows) => { merged = mergeWhatsOn(WHATS_ON, rows); return merged; })
      .catch(() => { request = null; return WHATS_ON; });
  }
  return request;
}

// { events, loaded }: the list in the code at first, then the whole list.
export function useWhatsOnState() {
  const [state, setState] = useState(() => ({ events: merged || WHATS_ON, loaded: !!merged }));
  useEffect(() => {
    if (merged) return undefined;
    let alive = true;
    loadWhatsOn().then((events) => { if (alive) setState({ events, loaded: true }); });
    return () => { alive = false; };
  }, []);
  return state;
}

export const useWhatsOn = () => useWhatsOnState().events;
