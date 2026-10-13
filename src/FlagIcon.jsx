import { useId } from "react";

// The NRIClub logo: a rounded Indian flag, flat with a soft sheen like an
// emoji. `size` is the width; the flag keeps its 3:2 shape.
export default function FlagIcon({ size = 28, title }) {
  const id = useId().replace(/:/g, "");
  const spokes = Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12;
    return <line key={i} x1="30" y1="20" x2={30 + 5.3 * Math.cos(a)} y2={20 + 5.3 * Math.sin(a)} />;
  });
  return (
    <svg width={size} height={(size * 2) / 3} viewBox="0 0 60 40" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title} style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <clipPath id={`${id}c`}><rect width="60" height="40" rx="8" /></clipPath>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <rect width="60" height="13.4" fill="#FF9933" />
        <rect y="13.3" width="60" height="13.4" fill="#FFFFFF" />
        <rect y="26.6" width="60" height="13.4" fill="#138808" />
        <circle cx="30" cy="20" r="5.6" fill="none" stroke="#000080" strokeWidth="0.9" />
        <g stroke="#000080" strokeWidth="0.45">{spokes}</g>
        <circle cx="30" cy="20" r="1.1" fill="#000080" />
        <rect width="60" height="40" fill={`url(#${id}g)`} />
      </g>
      <rect x="0.4" y="0.4" width="59.2" height="39.2" rx="7.6" fill="none" stroke="#000" strokeOpacity="0.1" strokeWidth="0.8" />
    </svg>
  );
}
