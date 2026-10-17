import { MARK_INK, MARK_SAFFRON, MARK_RADIUS, MARK_N } from "./content/logo";

// The NRIClub mark: a saffron "N" on an ink rounded square (drawn in
// src/content/logo.js). `size` is its width and height. Next to the NRIClub
// wordmark it's decorative and hidden from screen readers; on its own, give
// it a `title` ("NRIClub") and it's read out as that.
export default function LogoMark({ size = 28, title }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title} style={{ display: "block", flexShrink: 0 }}>
      <rect width="100" height="100" rx={MARK_RADIUS} fill={MARK_INK} />
      <path d={MARK_N} fill={MARK_SAFFRON} />
    </svg>
  );
}
