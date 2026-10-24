import { slug } from "../content/slug";
import { HOSTED_LABEL } from "../content/ambassador";

// Small parts of the ambassador panel the rest of the app shows too (the
// panel itself loads only when it's opened).

// Two city names for the same city, as the site's addresses write them
// ("Düsseldorf" and "Dusseldorf"); the database compares them the same way
// (private.same_city).
export const sameCity = (a, b) => !!slug(a) && slug(a) === slug(b);

// The mark on an event its organiser, the city's ambassador, hosts
// (events.ambassador_hosted).
export const HostedBadge = ({ style }) => (
  <span title="The city's NRIClub ambassador organises this event" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, letterSpacing: "0.03em", background: "#EEF2FF", color: "#000080", border: "1px solid #C7D2FE", whiteSpace: "nowrap", ...style }}>
    ★ {HOSTED_LABEL}
  </span>
);
