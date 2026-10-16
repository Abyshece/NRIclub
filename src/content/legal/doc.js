// The legal texts (Terms of Use, Privacy Policy) are plain data, so the same
// text is shown by the site (src/member/LegalModals.jsx renders it with
// React) and written into the static pages at build time (vite.config.js
// renders it with docToHtml below). Keep this file free of browser and React
// code: Node runs it during the build.
//
// A document: { title, subtitle, intro: [block], sections: [{ id, title, blocks: [block] }] }
// A block is one of:
//   { p: rich }                       a paragraph
//   { ul: [rich] } / { ol: [rich] }   a list
//   { h: "text" }                     a small heading inside a section
//   { entries: [{ title, fields: [[label, rich]] }] }
//                                     labelled items, e.g. what we process,
//                                     why, on what legal basis, how long
//   { box: { title, blocks: [block] } }  a framed notice (e.g. the right to object)
// Rich text is a string, or an array of strings, { text, href } links and
// { strong: "text" } bold parts.

export const CONTACT_EMAIL = "hello@nriclub.app";
export const SITE = "https://nriclub.app";

// A link to our address, optionally with a subject line.
export const mail = (subject = "", text = CONTACT_EMAIL) => ({
  text,
  href: `mailto:${CONTACT_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`,
});
export const a = (text, href) => ({ text, href });
export const strong = (text) => ({ strong: text });

// Site pages are linked by path ("/privacy"); the static pages and the site
// use them as they are.
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function richToHtml(rich) {
  const parts = Array.isArray(rich) ? rich : [rich];
  return parts.map((part) => {
    if (part == null || part === false) return "";
    if (typeof part === "string") return esc(part);
    if (part.href) {
      const external = /^https?:/.test(part.href);
      return `<a href="${esc(part.href)}"${external ? ' rel="noopener noreferrer"' : ""}>${esc(part.text)}</a>`;
    }
    if (part.strong) return `<strong>${esc(part.strong)}</strong>`;
    return "";
  }).join("");
}

function blockToHtml(block) {
  if (block.p) return `<p>${richToHtml(block.p)}</p>`;
  if (block.ul) return `<ul>${block.ul.map((r) => `<li>${richToHtml(r)}</li>`).join("")}</ul>`;
  if (block.ol) return `<ol>${block.ol.map((r) => `<li>${richToHtml(r)}</li>`).join("")}</ol>`;
  if (block.h) return `<h3>${esc(block.h)}</h3>`;
  if (block.entries) {
    return block.entries.map((e) => `<h3>${esc(e.title)}</h3><ul>${e.fields
      .map(([label, value]) => `<li><strong>${esc(label)}:</strong> ${richToHtml(value)}</li>`).join("")}</ul>`).join("");
  }
  if (block.box) {
    return `<div style="border:1px solid #D9D7D2;border-radius:10px;padding:4px 16px;margin:16px 0;background:#FAFAF8">`
      + `${block.box.title ? `<h3>${esc(block.box.title)}</h3>` : ""}${block.box.blocks.map(blockToHtml).join("")}</div>`;
  }
  return "";
}

// The whole document as HTML for a static page: title, version line,
// contents, sections.
export function docToHtml(doc) {
  const toc = doc.sections.length > 3
    ? `<nav aria-label="Contents"><p><strong>Contents</strong></p><ul>${doc.sections
      .map((s) => `<li><a href="#${esc(s.id)}">${esc(s.title)}</a></li>`).join("")}</ul></nav>`
    : "";
  return `<h1>${esc(doc.title)}</h1>`
    + (doc.subtitle ? `<p>${richToHtml(doc.subtitle)}</p>` : "")
    + (doc.intro || []).map(blockToHtml).join("")
    + toc
    + doc.sections.map((s) => `<section id="${esc(s.id)}"><h2>${esc(s.title)}</h2>${s.blocks.map(blockToHtml).join("")}</section>`).join("");
}
