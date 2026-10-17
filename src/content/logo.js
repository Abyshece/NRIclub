// The NRIClub mark: a bold saffron "N" on an ink rounded square, drawn on a
// 100 x 100 grid. One drawing for the site (src/LogoMark.jsx), the homepage
// HTML the build writes (vite.config.js), and the icons in public/
// (favicon.svg, icon-192.png, icon-512.png, apple-touch-icon.png and
// og-image.png are drawn from it: change it here, then redraw those too,
// and raise the ?v= on their links in index.html and manifest.webmanifest so
// browsers and link previews fetch the new files).
//
// NRIClub's logo is its own monogram and the wordmark, never a national flag
// or anything that looks like one: no saffron, white and green bands, no
// wheel, no state emblem. Saffron and green are brand colours on their own.
export const MARK_INK = "#37352F";
export const MARK_SAFFRON = "#FF9933";
// Corner radius of the square (22 of 100).
export const MARK_RADIUS = 22;
// The "N": two stems and a diagonal, centred in the square.
export const MARK_N = "M27 76V24H45L60 56V24H73V76H55L40 44V76Z";

// The mark as an SVG string, for HTML written outside React. `size` is its
// width and height in pixels; it's decorative (hidden from screen readers).
export const logoMarkSvg = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true" style="display:block;flex-shrink:0">`
  + `<rect width="100" height="100" rx="${MARK_RADIUS}" fill="${MARK_INK}"/><path d="${MARK_N}" fill="${MARK_SAFFRON}"/></svg>`;
