import { MARK_INK, MARK_BG, MARK_VIEWBOX, MARK_RADIUS, MARK_LION_TRANSFORM, MARK_LION } from "./content/logo";

// The NRIClub mark: a black lion's head on a white rounded square (drawn in
// src/content/logo.js). `size` is its width and height. Next to the NRIClub
// wordmark it's decorative and hidden from screen readers; on its own, give
// it a `title` ("NRIClub") and it's read out as that.
export default function LogoMark({ size = 28, title }) {
  return (
    <svg width={size} height={size} viewBox={MARK_VIEWBOX} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title} style={{ display: "block", flexShrink: 0 }}>
      <rect width="1024" height="1024" rx={MARK_RADIUS} fill={MARK_BG} />
      <g transform={MARK_LION_TRANSFORM} fill={MARK_INK}>
        {MARK_LION.map((p, i) => <path key={i} d={p.d} transform={`translate(${p.x},${p.y})`} />)}
      </g>
    </svg>
  );
}
