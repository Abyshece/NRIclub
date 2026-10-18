import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ESSENTIALS } from './src/content/essentials.js';
import { CITIES } from './src/content/cities.js';
import { slug } from './src/content/slug.js';
import { guideBlocks } from './src/content/guideBlocks.js';
import { HOME_PILL, HOME_LEAD, TRUST_LINE, POPULAR_CITIES, FEATURED_GUIDES } from './src/content/home.js';
import { logoMarkSvg } from './src/content/logo.js';
import { IMPRINT, hasImprint, imprintSections } from './src/content/imprint.js';
import { docToHtml, CONTACT_EMAIL } from './src/content/legal/doc.js';
import { privacyDoc } from './src/content/legal/privacy.js';
import { termsDoc, TERMS_VERSION, TERMS_ARCHIVE } from './src/content/legal/terms.js';
import { REPORT_HREF, REPORT_LINK_TEXT, REPORT_MAILTO, REPORT_PAGE } from './src/content/legal/reporting.js';

const SITE = 'https://nriclub.app';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Hides the homepage text (below) when "/" is opened for something else: a
// link from one of our emails (in the hash or the query), the admin site, or
// a member who is signed in. Keep the storage key in step with TOKEN_KEY in
// src/supabaseApi.js. Until the app has loaded, a tap on Join free or Log in
// is remembered (window.nriStart, read by App.jsx) instead of reloading.
const HOME_GUARD = 'try{if(location.pathname!=="/"||location.hash||/[?&](code|token_hash|error|error_code)=/.test(location.search)'
  + '||/^admin\\./.test(location.hostname)||localStorage.getItem("nriclub_token"))document.documentElement.classList.add("app-start")}catch(e){}'
  + 'document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("#home-static [data-start]");'
  + 'if(a){e.preventDefault();window.nriStart=a.getAttribute("data-start")}},true);';

// The homepage's top part as plain HTML, laid out like LandingPage.jsx so the
// switch to the app doesn't move anything, plus the city and guide links for
// search engines. The app replaces it as soon as it starts.
function homeStatic() {
  const guides = FEATURED_GUIDES.map((s) => ESSENTIALS.find((g) => g.slug === s)).filter(Boolean);
  const arrow = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
  const css = `
#home-static{min-height:100vh;background:#fff;color:#37352F;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.app-start #home-static{display:none}
#home-static a{color:#37352F}
.hs-w{width:100%;max-width:1100px;margin:0 auto;padding:0 24px;box-sizing:border-box}
.hs-line{height:4px;background:linear-gradient(90deg,#FF9933,#fff 50%,#138808)}
.hs-nav{border-bottom:1px solid #F0EFED}
.hs-nav .hs-w{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:10px;padding-bottom:10px}
.hs-logo{display:flex;align-items:center;gap:10px;min-height:44px;font-size:20px;font-weight:700;letter-spacing:-.02em;text-decoration:none}
.hs-logo i{font-family:"Times New Roman",serif}
.hs-navb{display:flex;gap:8px}
.hs-navb a{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;box-sizing:border-box;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;border:1px solid #C9C8C5;white-space:nowrap}
#home-static .hs-navb a+a,#home-static .hs-btn{background:#37352F;color:#fff;border-color:#37352F}
.hs-top{background:radial-gradient(700px 360px at 0% 0%,rgba(255,153,51,.10),transparent 70%),radial-gradient(600px 360px at 100% 10%,rgba(19,136,8,.07),transparent 70%)}
.hs-hero{display:grid;grid-template-columns:1.05fr 1fr;gap:40px;align-items:center;padding-top:clamp(24px,6vh,64px);padding-bottom:24px}
.hs-pill{display:inline-flex;align-items:center;gap:8px;padding:6px 12px 6px 8px;border-radius:999px;background:#fff;border:1px solid #ECEBE8;font-size:13px;font-weight:500;color:#6B6A67;margin-bottom:24px}
#home-static h1{font-size:clamp(38px,6vw,62px);font-weight:800;line-height:1.05;letter-spacing:-.04em;margin:0 0 20px}
.hs-lead{font-size:clamp(16px,1.8vw,19px);line-height:1.65;color:#6B6A67;max-width:520px;margin:0 0 32px}
#home-static .hs-btn{display:inline-flex;align-items:center;gap:10px;padding:15px 30px;border-radius:10px;font-size:16px;font-weight:600;text-decoration:none}
.hs-trust{font-size:14px;color:#6B6A67;margin:14px 0 0}
.hs-map{width:100%;max-width:560px;aspect-ratio:600/380;margin:0 auto}
.hs-skyw{max-width:1200px;margin:0 auto;padding:0 12px}
.hs-sky{aspect-ratio:1200/170}
.hs-eye{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#000080;margin-bottom:12px}
.hs-sub{font-size:16px;line-height:1.7;color:#6B6A67;max-width:640px;margin:0 auto}
.hs-form{display:flex;gap:8px;max-width:440px;margin:22px auto 18px}
.hs-input{flex:1;min-width:0;min-height:48px;box-sizing:border-box;display:flex;align-items:center;padding:0 14px;border:1px solid #8F8E8B;border-radius:10px;font-size:16px;color:#757575;text-align:left}
.hs-find{display:flex;align-items:center;min-height:48px;padding:0 16px;border-radius:10px;background:#37352F;color:#fff;font-size:15px;font-weight:600}
.hs-sec{padding-top:56px;text-align:center}
#home-static h2{font-size:clamp(28px,4vw,40px);font-weight:700;letter-spacing:-.03em;line-height:1.15;margin:0 0 16px}
.hs-links{list-style:none;padding:0;margin:0 auto;max-width:760px;display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.hs-links a{display:inline-flex;align-items:center;min-height:44px;box-sizing:border-box;padding:0 16px;border:1px solid #C9C8C5;border-radius:999px;font-size:14px;text-decoration:none}
@media (max-width:860px){.hs-hero{grid-template-columns:1fr;text-align:center}.hs-lead{margin-left:auto;margin-right:auto}}
@media (max-width:600px){.hs-map{display:none}}
@media (max-width:359px){.hs-logo span{display:none}}`.replace(/\n/g, '');
  return `<div id="home-static"><style>${css}</style>`
    + `<div class="hs-line"></div>`
    + `<header class="hs-nav"><nav class="hs-w"><a class="hs-logo" href="/" aria-label="NRIClub home">${logoMarkSvg(28)}<span>NRI<i>Club</i></span></a>`
    + `<span class="hs-navb"><a href="/" data-start="login">Log in</a><a href="/" data-start="signup">Join free</a></span></nav></header>`
    + `<main><section class="hs-top"><div class="hs-w hs-hero"><div>`
    + `<div class="hs-pill">${logoMarkSvg(18)} ${esc(HOME_PILL)}</div>`
    + `<h1>One home for<br>Indians abroad.</h1><p class="hs-lead">${esc(HOME_LEAD)}</p>`
    + `<a class="hs-btn" href="/" data-start="signup">Join free ${arrow}</a><p class="hs-trust">${TRUST_LINE.split(' · ').map((t, i, all) => `<span style="white-space:nowrap">${esc(t)}${i < all.length - 1 ? ' ·' : ''}</span>`).join(' ')}</p>`
    + `</div><div class="hs-map"></div></div><div class="hs-skyw"><div class="hs-sky"></div></div></section>`
    + `<section class="hs-w hs-sec"><div class="hs-eye">Find your city</div><h2>Find your city's group</h2>`
    + `<p class="hs-sub">Groups for ${CITIES.length} cities. Many are brand new: join early and help shape yours.</p>`
    + `<div class="hs-form" aria-hidden="true"><span class="hs-input">Your city, e.g. Munich</span><span class="hs-find">Find</span></div><ul class="hs-links">`
    + POPULAR_CITIES.map((c) => `<li><a href="/city/${slug(c)}">${esc(c)}</a></li>`).join('')
    + `</ul></section><section class="hs-w hs-sec"><h2>Free NRI guides</h2><ul class="hs-links" style="margin-top:18px">`
    + guides.map((g) => `<li><a href="/guides/${g.slug}">${esc(g.title)}</a></li>`).join('')
    + `<li><a href="/guides">All ${ESSENTIALS.length} guides</a></li></ul></section></main></div>`;
}

// The public pages (guides and city pages) as their own HTML files, each
// with its own title, description and link preview, and the page's text for
// search engines. The site itself still renders them in the browser; the
// text in #root is replaced as soon as it starts. The homepage gets its top
// part too (homeStatic, below), so it shows before the app has loaded.
function publicPages() {
  let outDir, root;
  return {
    name: 'nriclub-public-pages',
    apply: 'build',
    configResolved(config) { root = config.root; outDir = path.resolve(config.root, config.build.outDir); },
    // Mistakes that would break the live site quietly stop the build instead.
    // (An empty Impressum never does: the texts then say who runs NRIClub
    // without a name, see src/content/imprint.js.)
    buildStart() {
      // The Terms version the site shows: the text (src/content/legal/terms.js)
      // and the constant the app uses (src/member/LegalModals.jsx).
      const modals = fs.readFileSync(path.join(root, 'src/member/LegalModals.jsx'), 'utf8');
      const shown = /export const TERMS_VERSION = "([^"]+)"/.exec(modals)?.[1];
      if (shown !== TERMS_VERSION) {
        throw new Error(`TERMS_VERSION is "${shown}" in src/member/LegalModals.jsx but "${TERMS_VERSION}" in src/content/legal/terms.js: make them the same.`);
      }
      // The homepage's start-up script is allowed by its hash in the
      // Content-Security-Policy (vercel.json); a changed script would be
      // blocked on the live site.
      const hash = `'sha256-${crypto.createHash('sha256').update(HOME_GUARD).digest('base64')}'`;
      if (!fs.readFileSync(path.join(root, 'vercel.json'), 'utf8').includes(hash)) {
        throw new Error(`The homepage script (HOME_GUARD in vite.config.js) changed: put ${hash} in place of the old hash in script-src in vercel.json.`);
      }
      if (!hasImprint()) {
        this.warn('src/content/imprint.js has no name and address yet: no Impressum page, and the Terms and Privacy Policy say NRIClub is run by its founder in Germany.');
      }
    },
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
          .replace('<div id="root"></div>', () => `<div id="root"><main style="max-width:720px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif;color:#37352F;line-height:1.6">${body}${legalLinks}</main></div>`);
        const file = path.join(outDir, route.slice(1), 'index.html');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, html);
      };
      // At the foot of every page written here, as in the site's footer.
      const legalLinks = `<p style="font-size:14px;margin-top:32px"><a href="/terms">Terms of Use</a> · <a href="/privacy">Privacy Policy</a>`
        + `${hasImprint() ? ' · <a href="/impressum">Impressum</a>' : ''} · <a href="${esc(REPORT_HREF)}">${esc(REPORT_LINK_TEXT)}</a>`
        + ` · <a href="mailto:${CONTACT_EMAIL}">Contact: ${CONTACT_EMAIL}</a></p>`;
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
        if (IMPRINT.representative.trim() && !IMPRINT.contentResponsible.trim()) {
          throw new Error('src/content/imprint.js: for a company, contentResponsible must name the person responsible for the content (name and address in Germany).');
        }
        const body = imprintSections().map((sec) => `<h2>${esc(sec.title)}</h2><p>${sec.lines
          .map((l) => (l.href ? `<a href="${esc(l.href)}">${esc(l.text)}</a>` : esc(l.text))).join('<br>')}</p>`).join('');
        page('/impressum', 'Impressum · NRIClub', 'Legal notice (Impressum) of NRIClub.',
          `<h1>Impressum</h1><p>Legal notice</p>${body}`, '<meta name="robots" content="noindex" />');
      }

      // The Terms of Use (and each earlier version) and the Privacy Policy,
      // from src/content/legal/. Out of search results and the sitemap like
      // the Impressum: they name the operator with a postal address.
      const noindex = '<meta name="robots" content="noindex" />';
      page('/privacy', 'Privacy Policy · NRIClub',
        'How NRIClub handles your data: what we process and why, who can see it, how long we keep it, and your rights.',
        docToHtml(privacyDoc()), noindex);
      page('/terms', 'Terms of Use · NRIClub',
        `The Terms of Use of NRIClub, the free members-only community for Indians abroad (version ${TERMS_VERSION}).`,
        docToHtml(termsDoc()), noindex);
      for (const version of Object.keys(TERMS_ARCHIVE)) {
        page(`/terms/${version}`, `Terms of Use, version ${version} · NRIClub`,
          `An earlier version (${version}) of the Terms of Use of NRIClub.`, docToHtml(termsDoc(version)), noindex);
      }

      // The page for reporting illegal content: the form needs the app, so
      // the static page says what to send and where (by email until then).
      page(REPORT_HREF, `${REPORT_PAGE.title} · NRIClub`,
        'Report content on NRIClub you believe is illegal. Anyone can send a report, member or not; a person on our team looks at every one.',
        `<h1>${esc(REPORT_PAGE.title)}</h1><p>${esc(REPORT_PAGE.intro)}</p><p><strong>${esc(REPORT_PAGE.emergency)}</strong></p>`
        + `<h2>${esc(REPORT_PAGE.needs.title)}</h2><ul>${REPORT_PAGE.needs.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
        + `<p>${esc(REPORT_PAGE.anonymousNote)}</p><p>${esc(REPORT_PAGE.confidentiality)} ${esc(REPORT_PAGE.afterwards)}</p>`
        + `<p>${esc(REPORT_PAGE.emailInstead)} <a href="${esc(REPORT_MAILTO)}">${esc(CONTACT_EMAIL)}</a></p><p>${esc(REPORT_PAGE.membersNote)}</p>`);

      // The plain page, for every other address of the app (vercel.json
      // rewrites to it): no canonical, no og:url, no homepage text.
      fs.writeFileSync(path.join(outDir, 'app.html'), shell.replace(/\s*<meta property="og:url"[^>]*>/, ''));

      // The homepage, last: the pages above are copies of the plain
      // index.html, and only the homepage gets this text and this canonical.
      // The head script hides the text for anyone signed in, who goes
      // straight to the app.
      fs.writeFileSync(path.join(outDir, 'index.html'), shell
        .replace('</head>', () => `  <link rel="canonical" href="${SITE}/" />\n  <script>${HOME_GUARD}</script>\n</head>`)
        .replace('<div id="root"></div>', () => `<div id="root">${homeStatic()}</div>`));

      const urls = ['/', '/guides', ...ESSENTIALS.map((g) => `/guides/${g.slug}`), ...CITIES.map((c) => `/city/${slug(c)}`), REPORT_HREF];
      fs.writeFileSync(path.join(outDir, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
    },
  };
}

export default defineConfig({
  plugins: [react(), publicPages()],
  server: { port: 3000 }
});
