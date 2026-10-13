import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { ESSENTIALS } from './src/content/essentials.js';
import { CITIES } from './src/content/cities.js';
import { slug } from './src/content/slug.js';
import { guideBlocks } from './src/content/guideBlocks.js';
import { HOME_PILL, HOME_LEAD, TRUST_LINE, POPULAR_CITIES, FEATURED_GUIDES } from './src/content/home.js';
import { hasImprint, imprintSections } from './src/content/imprint.js';

const SITE = 'https://nriclub.app';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Hides the homepage text (below) when this page is opened for something
// else: another address of the app, a link from one of our emails (in the
// hash or the query), the admin site, or a member who is signed in. Keep the
// storage key in step with TOKEN_KEY in src/supabaseApi.js.
const HOME_GUARD = 'try{if(location.pathname!=="/"||location.hash||/[?&](code|token_hash|error|error_code)=/.test(location.search)'
  + '||/^admin\\./.test(location.hostname)||localStorage.getItem("nriclub_token"))document.documentElement.classList.add("app-start")}catch(e){}';

// The homepage's top part as plain HTML, laid out like LandingPage.jsx so the
// switch to the app doesn't move anything, plus the city and guide links for
// search engines. The app replaces it as soon as it starts.
function homeStatic() {
  const guides = FEATURED_GUIDES.map((s) => ESSENTIALS.find((g) => g.slug === s)).filter(Boolean);
  const flag = (w) => `<svg width="${w}" height="${(w * 2) / 3}" viewBox="0 0 60 40" aria-hidden="true" style="display:block;flex-shrink:0"><rect width="60" height="40" rx="8" fill="#FF9933"/><rect y="13.3" width="60" height="13.4" fill="#fff"/><path d="M0 26.6h60V32a8 8 0 0 1-8 8H8a8 8 0 0 1-8-8z" fill="#138808"/><circle cx="30" cy="20" r="5.6" fill="none" stroke="#000080" stroke-width="0.9"/><circle cx="30" cy="20" r="1.1" fill="#000080"/></svg>`;
  const css = `
#home-static{min-height:100vh;background:#fff;color:#37352F;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.app-start #home-static{display:none}
#home-static a{color:#37352F}
.hs-w{width:100%;max-width:1100px;margin:0 auto;padding:0 24px;box-sizing:border-box}
.hs-tri{height:4px;background:linear-gradient(90deg,#FF9933 0 33.3%,#fff 33.3% 66.6%,#138808 66.6%)}
.hs-nav{border-bottom:1px solid #F0EFED}
.hs-nav .hs-w{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:10px;padding-bottom:10px}
.hs-logo{display:flex;align-items:center;gap:10px;min-height:44px;font-size:20px;font-weight:700;letter-spacing:-.02em;text-decoration:none}
.hs-logo i{font-family:"Times New Roman",serif}
.hs-navb{display:flex;gap:8px}
.hs-navb a{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;box-sizing:border-box;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;border:1px solid #C9C8C5;white-space:nowrap}
#home-static .hs-navb a+a,#home-static .hs-btn{background:#37352F;color:#fff;border-color:#37352F}
.hs-top{background:radial-gradient(800px 400px at 0% 0%,rgba(255,153,51,.10),transparent 70%),radial-gradient(700px 400px at 100% 10%,rgba(19,136,8,.07),transparent 70%)}
.hs-hero{display:grid;grid-template-columns:1.05fr 1fr;gap:40px;align-items:center;padding-top:clamp(24px,6vh,64px);padding-bottom:24px}
.hs-pill{display:inline-flex;align-items:center;gap:8px;padding:6px 12px 6px 8px;border-radius:999px;background:#fff;border:1px solid #ECEBE8;font-size:13px;font-weight:500;color:#6B6A67;margin-bottom:24px}
#home-static h1{font-size:clamp(38px,6vw,62px);font-weight:800;line-height:1.05;letter-spacing:-.04em;margin:0 0 20px}
.hs-lead{font-size:clamp(16px,1.8vw,19px);line-height:1.65;color:#6B6A67;max-width:520px;margin:0 0 32px}
#home-static .hs-btn{display:inline-flex;align-items:center;gap:10px;padding:15px 30px;border-radius:10px;font-size:16px;font-weight:600;text-decoration:none}
.hs-trust{font-size:14px;color:#6B6A67;margin:14px 0 0}
.hs-map{width:100%;max-width:560px;aspect-ratio:600/380;margin:0 auto}
.hs-sky{max-width:1176px;margin:0 auto;aspect-ratio:1200/170}
.hs-sec{padding-top:56px;text-align:center}
#home-static h2{font-size:clamp(28px,4vw,40px);font-weight:700;letter-spacing:-.03em;line-height:1.15;margin:0 0 16px}
.hs-links{list-style:none;padding:0;margin:18px auto 0;max-width:760px;display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.hs-links a{display:inline-flex;align-items:center;min-height:44px;box-sizing:border-box;padding:0 16px;border:1px solid #C9C8C5;border-radius:999px;font-size:14px;text-decoration:none}
@media (max-width:860px){.hs-hero{grid-template-columns:1fr;text-align:center}.hs-lead{margin-left:auto;margin-right:auto}}
@media (max-width:600px){.hs-map{display:none}}
@media (max-width:359px){.hs-logo span{display:none}}`.replace(/\n/g, '');
  return `<div id="home-static"><style>${css}</style>`
    + `<div class="hs-tri"></div>`
    + `<header class="hs-nav"><nav class="hs-w"><a class="hs-logo" href="/">${flag(30)}<span>NRI<i>Club</i></span></a>`
    + `<span class="hs-navb"><a href="/">Log in</a><a href="/">Join free</a></span></nav></header>`
    + `<main><section class="hs-top"><div class="hs-w hs-hero"><div>`
    + `<div class="hs-pill">${flag(20)} ${esc(HOME_PILL)}</div>`
    + `<h1>One home for<br>Indians abroad.</h1><p class="hs-lead">${esc(HOME_LEAD)}</p>`
    + `<a class="hs-btn" href="/">Join free →</a><p class="hs-trust">${TRUST_LINE.split(' · ').map((t, i, all) => `<span style="white-space:nowrap">${esc(t)}${i < all.length - 1 ? ' ·' : ''}</span>`).join(' ')}</p>`
    + `</div><div class="hs-map"></div></div><div class="hs-sky"></div></section>`
    + `<section class="hs-w hs-sec"><h2>Find your city's group</h2><ul class="hs-links">`
    + POPULAR_CITIES.map((c) => `<li><a href="/city/${slug(c)}">${esc(c)}</a></li>`).join('')
    + `</ul></section><section class="hs-w hs-sec"><h2>Free NRI guides</h2><ul class="hs-links">`
    + guides.map((g) => `<li><a href="/guides/${g.slug}">${esc(g.title)}</a></li>`).join('')
    + `<li><a href="/guides">All ${ESSENTIALS.length} guides</a></li></ul></section></main></div>`;
}

// The public pages (guides and city pages) as their own HTML files, each
// with its own title, description and link preview, and the page's text for
// search engines. The site itself still renders them in the browser; the
// text in #root is replaced as soon as it starts. The homepage gets its top
// part too (homeStatic, below), so it shows before the app has loaded.
function publicPages() {
  let outDir;
  return {
    name: 'nriclub-public-pages',
    apply: 'build',
    configResolved(config) { outDir = path.resolve(config.root, config.build.outDir); },
    // After the bundle (and index.html) is written; never on a failed build.
    writeBundle() {
      const shell = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
      const page = (route, title, description, body, head = '') => {
        // Function replacements, so a "$" in a title is kept as it is.
        const meta = (re, value) => (h) => h.replace(re, (_, start) => start + value);
        let html = [
          meta(/(<meta name="description" content=")[^"]*/, esc(description)),
          meta(/(<meta property="og:title" content=")[^"]*/, esc(title)),
          meta(/(<meta property="og:description" content=")[^"]*/, esc(description)),
          meta(/(<meta property="og:url" content=")[^"]*/, SITE + route),
          meta(/(<meta name="twitter:title" content=")[^"]*/, esc(title)),
          meta(/(<meta name="twitter:description" content=")[^"]*/, esc(description)),
        ].reduce((h, f) => f(h), shell)
          .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)}</title>`)
          .replace('</head>', () => `  <link rel="canonical" href="${SITE}${route}" />\n${head ? `  ${head}\n` : ''}</head>`)
          .replace('<div id="root"></div>', () => `<div id="root"><main style="max-width:720px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif;color:#37352F;line-height:1.6">${body}</main></div>`);
        const file = path.join(outDir, route.slice(1), 'index.html');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, html);
      };
      const join = `<p><a href="/">Join NRIClub</a>: a free community for Indians abroad. Our team checks every new member.</p>`;
      const guideLinks = ESSENTIALS.map((g) => `<li><a href="/guides/${g.slug}">${esc(g.title)}</a></li>`).join('');

      page('/guides', 'NRI essentials guides · NRIClub',
        'Short, practical guides for Indians living abroad: passports, OCI, NRE and NRO accounts, taxes, sending money home and more.',
        `<h1>NRI essentials</h1><p>Short, practical guides for Indians living abroad.</p><ul>${guideLinks}</ul>${join}`);
      for (const g of ESSENTIALS) {
        const body = guideBlocks(g.content).map((b) => b.type === 'h' ? `<h2>${esc(b.text)}</h2>`
          : b.type === 'ul' ? `<ul>${b.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : `<p>${esc(b.text)}</p>`).join('');
        page(`/guides/${g.slug}`, `${g.title} · NRIClub`, g.excerpt,
          `<h1>${esc(g.title)}</h1><p>${esc(g.excerpt)}</p>${body}${join}<h2>More guides</h2><ul>${guideLinks}</ul>`);
      }
      for (const city of CITIES) {
        page(`/city/${slug(city)}`, `Indians in ${city} · NRIClub`,
          `Indians in ${city}: ask questions, find housing and job referrals, discover desi places and celebrate festivals together. Free, and our team checks every new member.`,
          `<h1>Indians in ${esc(city)}</h1><p>Ask questions, find a room or a referral, discover desi places and celebrate festivals with Indians in ${esc(city)}.</p>${join}<h2>NRI essentials</h2><ul>${guideLinks}</ul>`);
      }

      // The Impressum, once its details are filled in (src/content/imprint.js).
      // Kept out of search results and the sitemap: it holds a home address.
      if (hasImprint()) {
        const body = imprintSections().map((sec) => `<h2>${esc(sec.title)}</h2><p>${sec.lines
          .map((l) => (l.href ? `<a href="${esc(l.href)}">${esc(l.text)}</a>` : esc(l.text))).join('<br>')}</p>`).join('');
        page('/impressum', 'Impressum · NRIClub', 'Legal notice (Impressum) of NRIClub.',
          `<h1>Impressum</h1><p>Legal notice</p>${body}`, '<meta name="robots" content="noindex" />');
      }

      // The homepage, last: the pages above are copies of the plain
      // index.html, and only the homepage gets this text and this canonical.
      // The same index.html is also served for the app's other addresses
      // (vercel.json), so the head script hides the text there, and for
      // anyone signed in, who goes straight to the app.
      fs.writeFileSync(path.join(outDir, 'index.html'), shell
        .replace('</head>', () => `  <link rel="canonical" href="${SITE}/" />\n  <script>${HOME_GUARD}</script>\n</head>`)
        .replace('<div id="root"></div>', () => `<div id="root">${homeStatic()}</div>`));

      const urls = ['/', '/guides', ...ESSENTIALS.map((g) => `/guides/${g.slug}`), ...CITIES.map((c) => `/city/${slug(c)}`)];
      fs.writeFileSync(path.join(outDir, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
    },
  };
}

export default defineConfig({
  plugins: [react(), publicPages()],
  server: { port: 3000 }
});
