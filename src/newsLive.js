import { useEffect, useState } from "react";
import { getNews } from "./supabaseApi";

// ============================================================================
// The published news (public.news_posts), the latest first: fetched once per
// visit and shared by the News page (NewsPage.jsx), the homepage and the
// members' Home. [] when it can't be fetched (no connection, or before the
// 2026-11-03 database update): those pages then say there's no news yet, or
// leave the news out.
// ============================================================================

const LIMIT = 30;
let cached = null; // the list once fetched
let request = null;

// The list (never rejects).
export function loadNews() {
  if (cached) return Promise.resolve(cached);
  if (!request) {
    request = getNews(LIMIT)
      .then((posts) => { cached = posts; return posts; })
      .catch(() => { request = null; return []; });
  }
  return request;
}

// { posts, loaded }: [] at first, then the list.
export function useNews() {
  const [state, setState] = useState(() => ({ posts: cached || [], loaded: !!cached }));
  useEffect(() => {
    if (cached) return undefined;
    let alive = true;
    loadNews().then((posts) => { if (alive) setState({ posts, loaded: true }); });
    return () => { alive = false; };
  }, []);
  return state;
}
