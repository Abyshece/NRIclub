import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { ESSENTIALS } from './src/content/essentials.js';
import { CITIES } from './src/content/cities.js';
import { slug } from './src/content/slug.js';
import { guideBlocks } from './src/content/guideBlocks.js';

const SITE = 'https://nriclub.app';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The public pages (guides and city pages) as their own HTML files, each
// with its own title, description and link preview, and the page's text for
// search engines. The site itself still renders them in the browser; the
// text in #root is replaced as soon as it starts.
function publicPages() {
  let outDir;
  return {
    name: 'nriclub-public-pages',
    apply: 'build',
    configResolved(config) { outDir = path.resolve(config.root, config.build.outDir); },
    // After the bundle (and index.html) is written; never on a failed build.
    writeBundle() {
      const shell = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
      const page = (route, title, description, body) => {
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
          .replace('</head>', () => `  <link rel="canonical" href="${SITE}${route}" />\n</head>`)
          .replace('<div id="root"></div>', () => `<div id="root"><main style="max-width:720px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif;color:#37352F;line-height:1.6">${body}</main></div>`);
        const file = path.join(outDir, route.slice(1), 'index.html');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, html);
      };
      const join = `<p><a href="/">Join NRIClub</a>: a free, verified community for Indians abroad.</p>`;
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
          `Meet Indians who live in ${city}: ask questions, find housing and job referrals, discover desi places and celebrate festivals together. Free, and every member is verified.`,
          `<h1>Indians in ${esc(city)}</h1><p>Meet Indians who live in ${esc(city)}. Ask questions, find a room or a referral, discover desi places and celebrate festivals together.</p>${join}<h2>NRI essentials</h2><ul>${guideLinks}</ul>`);
      }

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
