// ============================================================================
// NEWS (nriclub.app/news): short news for Indians in Germany that our team
// writes in the admin panel (News): changes to the rules for visas and
// citizenship, news from the Indian embassy and consulates, tax deadlines,
// NRIClub's own news. The posts are in public.news_posts
// (supabase/migrations/20261103000000_news.sql); anyone can read the
// published ones. The pages are src/NewsPage.jsx (members see the same in
// the app), the link preview and the text search engines read come from
// api/news.js, and the latest posts show on the homepage and in the
// members' Home.
//
// Every post is in our own words and names where its facts come from (one
// to three sources, each with a link): never copy a newspaper's article or
// its photos (German copyright, including the press publishers' right), and
// prefer official sources (BAMF, the Federal Foreign Office, the Indian
// embassy). Every post shows NEWS_DISCLAIMER.
// ============================================================================

import { guideBlocks } from "./guideBlocks.js";
import { slug as slugOf } from "./slug.js";

export const NEWS_PATH = "/news";
export const NEWS_TITLE = "News for Indians in Germany";
export const NEWS_LEAD = "Changes to visas, citizenship and taxes, news from the Indian embassy and consulates, and NRIClub's own news. In our own words, with the official source.";
export const NEWS_DESCRIPTION = "News for Indians in Germany: changes to visas, the Blue Card, citizenship and taxes, news from the Indian embassy and consulates, and what's new at NRIClub. Free, with the official source for every post.";
// Shown with every post (and on the list).
export const NEWS_DISCLAIMER = "General information, not legal or tax advice. Rules change and every case is different: check the official source, or ask the authority or an adviser before you act.";
export const NEWS_SUBMIT = "Have news for Indians in Germany, or spotted a mistake? Write to us:";

// The topics, as private.news_topics() in the database (the tests compare them).
export const NEWS_TOPICS = {
  visa: "Visa & residence",
  citizenship: "Citizenship",
  consulate: "Passport, OCI & consulates",
  money: "Tax & money",
  work: "Jobs & work",
  life: "Life in Germany",
  travel: "Travel to India",
  community: "NRIClub news",
};

// The columns anyone may read (the database grants only these).
export const NEWS_COLUMNS = "slug,title,topic,city,summary,body,sources,published_at,edited_at";

// The limits the database checks too (admin_save_news_post).
export const NEWS_LIMITS = { slugMin: 3, slugMax: 80, titleMin: 5, titleMax: 120, summaryMin: 20, summaryMax: 220, body: 12000, sources: 3, sourceName: 80, url: 2000 };

export const newsPath = (slug) => `${NEWS_PATH}/${slug}`;
// One of NEWS_TOPICS (not "toString" and the like).
export const isNewsTopic = (k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(NEWS_TOPICS, k);
export const isNewsSlug = (s) => typeof s === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)
  && s.length >= NEWS_LIMITS.slugMin && s.length <= NEWS_LIMITS.slugMax;

// "blue-card-salary-2027": a new post's address, from its title (cut at a
// dash, at most 80 characters).
export function newsSlug(title) {
  let s = slugOf(title);
  if (s.length > NEWS_LIMITS.slugMax) s = s.slice(0, NEWS_LIMITS.slugMax).replace(/-[^-]*$/, "") || s.slice(0, NEWS_LIMITS.slugMax);
  return s.replace(/-+$/, "");
}

const isHttps = (u) => {
  try { return typeof u === "string" && /^https:\/\/[^\s/?#]+\S*$/.test(u) && new URL(u).protocol === "https:"; } catch { return false; }
};

// A post's text as blocks (guideBlocks: a short line in CAPITALS is a
// heading, "• " starts a bullet), where "- " and "* " start a bullet too.
export const newsBlocks = (body) => guideBlocks(String(body || "").split("\n")
  .map((line) => line.replace(/^\s*[-*]\s+/, "• ")).join("\n"));

// "26 October 2026", the day in Germany.
export function newsDate(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" }).format(d);
}
// The day in Germany as YYYY-MM-DD (for <time datetime>).
export function newsDay(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Berlin" }).format(d);
}

// "Published 26 October 2026 · Updated 28 October 2026" (the update only
// when it's on a later day).
export function newsDates(post) {
  const published = newsDate(post?.published_at);
  const edited = post?.edited_at && newsDay(post.edited_at) !== newsDay(post.published_at) ? newsDate(post.edited_at) : "";
  return [published && `Published ${published}`, edited && `Updated ${edited}`].filter(Boolean).join(" · ");
}

// Text as one line: no control characters, single spaces, at most max.
const line = (value, max) => {
  if (typeof value !== "string") return "";
  return [...value.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").replace(/\s+/g, " ").trim()].slice(0, max).join("");
};

// A post as the database gives it, checked: only the fields of NEWS_COLUMNS,
// text where text belongs, sources only with https:// links; null for
// anything that isn't a post (e.g. a row without a valid slug or title).
export function cleanNews(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !isNewsSlug(raw.slug)) return null;
  const title = line(raw.title, NEWS_LIMITS.titleMax);
  if (!title) return null;
  const sources = (Array.isArray(raw.sources) ? raw.sources : [])
    .map((s) => ({ name: line(s?.name, NEWS_LIMITS.sourceName), url: typeof s?.url === "string" ? s.url.trim() : "" }))
    .filter((s) => s.name && isHttps(s.url) && s.url.length <= NEWS_LIMITS.url)
    .slice(0, NEWS_LIMITS.sources);
  const date = (v) => (typeof v === "string" && !Number.isNaN(new Date(v).getTime()) ? v : null);
  return {
    slug: raw.slug,
    title,
    topic: isNewsTopic(raw.topic) ? raw.topic : "community",
    city: line(raw.city, 100),
    summary: line(raw.summary, NEWS_LIMITS.summaryMax),
    body: typeof raw.body === "string" ? raw.body.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").slice(0, NEWS_LIMITS.body) : "",
    sources,
    published_at: date(raw.published_at),
    edited_at: date(raw.edited_at),
  };
}

// What's wrong with a post the admin panel is about to save, in words (the
// rules of public.admin_save_news_post), or "".
export function newsProblem(post) {
  const p = post || {};
  const t = (v) => String(v || "").trim();
  const L = NEWS_LIMITS;
  if (!isNewsSlug(t(p.slug))) return `The address may have only a-z, 0-9 and single dashes (${L.slugMin} to ${L.slugMax} characters).`;
  if (!t(p.title) || !t(p.summary) || !t(p.body) || !t(p.topic)) return "Fill in the title, topic, summary and text.";
  if (t(p.title).length < L.titleMin || t(p.title).length > L.titleMax) return `Keep the title between ${L.titleMin} and ${L.titleMax} characters.`;
  if (!isNewsTopic(t(p.topic))) return "Choose a topic.";
  if (t(p.city).length > 100 || (t(p.city) && !/\p{L}/u.test(t(p.city)))) return "Give the city by its name, or leave it empty for all of Germany.";
  if (t(p.summary).length < L.summaryMin || t(p.summary).length > L.summaryMax) return `Keep the summary between ${L.summaryMin} and ${L.summaryMax} characters (it has ${t(p.summary).length}).`;
  if (t(p.body).length > L.body) return `Keep the text to ${L.body.toLocaleString("en-GB")} characters (it has ${t(p.body).length.toLocaleString("en-GB")}).`;
  const sources = (p.sources || []).filter((s) => t(s?.name) || t(s?.url));
  if (!sources.length) return "Add at least one source: where the facts come from, e.g. the BAMF or the Indian embassy.";
  if (sources.length > L.sources) return `At most ${L.sources} sources.`;
  for (const s of sources) {
    if (!t(s.name) || t(s.name).length > L.sourceName) return `Give each source a name (up to ${L.sourceName} characters), e.g. "BAMF".`;
    if (!isHttps(t(s.url)) || t(s.url).length > L.url) return `The link of "${t(s.name)}" must be a full https:// address.`;
  }
  return "";
}

// A post's link for sharing, with where it was shared (website analytics
// count visits by campaign: Admin → Analytics → Campaigns).
export const newsShareUrl = (post, site = "https://nriclub.app", source = "whatsapp") =>
  `${site}${newsPath(post.slug)}?utm_source=${encodeURIComponent(source)}&utm_medium=share&utm_campaign=news&utm_content=${encodeURIComponent(post.slug)}`;

// The text a WhatsApp share starts with, then the post's link.
export const newsShareText = (post, site = "https://nriclub.app") =>
  `${post.title}\n\n${post.summary}\n\n${newsShareUrl(post, site)}`;

// The topics the posts have, in the order of NEWS_TOPICS.
export const topicsOf = (posts) => Object.keys(NEWS_TOPICS).filter((k) => (posts || []).some((p) => p.topic === k));
