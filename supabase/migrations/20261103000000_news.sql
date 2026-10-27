-- ============================================================================
-- NRIclub: News (2026-11-03)
--
--   * public.news_posts: short news for Indians in Germany that our team
--     writes in the admin panel (News): a change in the rules for visas or
--     citizenship, news from the Indian embassy and consulates, a tax
--     deadline, NRIClub's own news. Each post is public at
--     nriclub.app/news/<slug> once it is published, with a link preview for
--     WhatsApp (api/news.js), on nriclub.app/news, on the homepage and in
--     the members' Home.
--   * A post has a title, a topic (private.news_topics, as NEWS_TOPICS in
--     src/content/news.js), optionally a city, a summary (for the list and
--     the link preview), the text, and one to three sources (a name and an
--     https:// link each: every post says where its facts come from). Its
--     slug is its address and never changes, so links already shared keep
--     working.
--   * Status: 'draft' (only admins see it), 'published' (anyone, signed
--     out too) or 'hidden' (taken off the site again; it can be published
--     again). published_at is when it was first published; edited_at when
--     its text last changed after that, which the post shows as "Updated".
--   * Anyone reads published posts (not who wrote them, nor drafts); only
--     admins write, through public.admin_save_news_post,
--     admin_set_news_status and admin_delete_news_post, which check the same
--     rules as the admin panel (newsProblem in src/content/news.js).
--     public.admin_news_posts lists every post for the panel. 60 saves an
--     hour per admin.
-- Needs all earlier migrations (up to 20261102000000_compliance_fixes.sql).
-- Runs as one transaction (it can be run as it is in the SQL editor); it
-- refuses to run before the 2026-11-02 update, and a second time.
-- Existing rows: none change.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('private.question_preview_allowed(text)') IS NULL OR to_regprocedure('private.take_rate(text, text[])') IS NULL
     OR to_regprocedure('private.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'Run the earlier updates (up to 20261102000000_compliance_fixes.sql) first.';
  END IF;
  IF to_regclass('public.news_posts') IS NOT NULL THEN
    RAISE EXCEPTION 'This update has already run. Nothing to do.';
  END IF;
END;
$$;

-- The topics of a post, as NEWS_TOPICS in src/content/news.js.
CREATE FUNCTION private.news_topics()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY['visa', 'citizenship', 'consulate', 'money', 'work', 'life', 'travel', 'community']::TEXT[];
$$;

-- A post's sources: an array of 1 to 3 objects { name, url }, a name of 1 to
-- 80 characters and a full https:// address of at most 2000, nothing else.
CREATE FUNCTION private.news_sources_ok(p_sources JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_typeof(p_sources) = 'array'
    AND jsonb_array_length(p_sources) BETWEEN 1 AND 3
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_sources) s
      WHERE jsonb_typeof(s) <> 'object'
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(s) k WHERE k NOT IN ('name', 'url'))
         OR jsonb_typeof(s -> 'name') IS DISTINCT FROM 'string' OR jsonb_typeof(s -> 'url') IS DISTINCT FROM 'string'
         OR char_length(btrim(s ->> 'name')) NOT BETWEEN 1 AND 80
         OR (s ->> 'url') !~ '^https://[^[:space:]/?#]+[^[:space:]]*$' OR char_length(s ->> 'url') > 2000);
$$;

-- One post. slug: its address (nriclub.app/news/<slug>). city: '' for all of
-- Germany. created_by / updated_by: the admins.
CREATE TABLE public.news_posts (
  slug TEXT PRIMARY KEY CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 80),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 5 AND 120),
  topic TEXT NOT NULL CHECK (topic = ANY (private.news_topics())),
  city TEXT NOT NULL DEFAULT '' CHECK (char_length(city) <= 100 AND (city = '' OR city ~ '[[:alpha:]]')),
  summary TEXT NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 20 AND 220),
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 12000),
  sources JSONB NOT NULL CHECK (private.news_sources_ok(sources)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden')),
  published_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status = 'draft' OR published_at IS NOT NULL),
  CHECK (edited_at IS NULL OR published_at IS NOT NULL)
);
CREATE INDEX idx_news_posts_published ON public.news_posts (published_at DESC) WHERE status = 'published';
ALTER TABLE public.news_posts ENABLE ROW LEVEL SECURITY;
-- Everyone (signed out too) reads the published posts, without their status
-- or who wrote them; nobody writes through the API (the admin functions
-- below do).
REVOKE ALL ON public.news_posts FROM PUBLIC, anon, authenticated;
GRANT SELECT (slug, title, topic, city, summary, body, sources, published_at, edited_at) ON public.news_posts TO anon, authenticated;
CREATE POLICY "Published news is public" ON public.news_posts FOR SELECT TO anon, authenticated
  USING (status = 'published');

-- A post as the admin panel has it (every field, plus its status and dates).
CREATE FUNCTION private.news_json(n public.news_posts)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'slug', n.slug, 'title', n.title, 'topic', n.topic, 'city', n.city, 'summary', n.summary, 'body', n.body,
    'sources', n.sources, 'status', n.status, 'published_at', n.published_at, 'edited_at', n.edited_at,
    'created_at', n.created_at, 'updated_at', n.updated_at);
$$;

-- Every post, for the admin panel: drafts and hidden ones by when they were
-- last saved, published ones by when they were published, the latest first
-- (at most 500).
CREATE FUNCTION public.admin_news_posts()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(private.news_json(x) ORDER BY COALESCE(x.published_at, x.updated_at) DESC, x.slug)
    FROM (SELECT * FROM public.news_posts n ORDER BY COALESCE(n.published_at, n.updated_at) DESC LIMIT 500) x), '[]'::jsonb);
END;
$$;

-- Adds a post as a draft (p_new) or changes one (its slug stays; a
-- published post shows "Updated" from now on), from the admin panel's form:
-- p_post { slug, title, topic, city, summary, body, sources }. The rules of
-- newsProblem in src/content/news.js. Text is trimmed; the text of the post
-- keeps its lines. Returns the post (private.news_json).
CREATE FUNCTION public.admin_save_news_post(p_post JSONB, p_new BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := (SELECT auth.uid());
  f JSONB := COALESCE(p_post, '{}'::jsonb);
  v_slug TEXT;
  v_title TEXT;
  v_topic TEXT;
  v_city TEXT;
  v_summary TEXT;
  v_body TEXT;
  v_sources JSONB;
  t TEXT;
  saved public.news_posts;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(f) <> 'object' THEN
    RAISE EXCEPTION 'The post must be an object.' USING ERRCODE = 'P0001';
  END IF;
  SELECT string_agg(k, ', ') INTO t FROM jsonb_object_keys(f) k
  WHERE k NOT IN ('slug', 'title', 'topic', 'city', 'summary', 'body', 'sources');
  IF t IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown field: %', t USING ERRCODE = 'P0001';
  END IF;
  SELECT string_agg(k, ', ') INTO t FROM jsonb_each(f) x(k, v)
  WHERE k <> 'sources' AND jsonb_typeof(v) NOT IN ('string', 'null');
  IF t IS NOT NULL THEN
    RAISE EXCEPTION 'These fields must be text: %', t USING ERRCODE = 'P0001';
  END IF;

  v_slug := btrim(COALESCE(f ->> 'slug', ''));
  v_title := btrim(COALESCE(f ->> 'title', ''));
  v_topic := btrim(COALESCE(f ->> 'topic', ''));
  v_city := btrim(COALESCE(f ->> 'city', ''));
  v_summary := btrim(COALESCE(f ->> 'summary', ''));
  -- The text keeps its lines (paragraphs, headings, lists); only the ends go.
  v_body := btrim(replace(COALESCE(f ->> 'body', ''), E'\r\n', E'\n'), E' \t\n');

  IF v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(v_slug) NOT BETWEEN 3 AND 80 THEN
    RAISE EXCEPTION 'The address may have only a-z, 0-9 and single dashes (3 to 80 characters), e.g. "blue-card-salary-2027".' USING ERRCODE = 'P0001';
  END IF;
  IF v_title = '' OR v_summary = '' OR v_body = '' OR v_topic = '' THEN
    RAISE EXCEPTION 'Fill in the title, topic, summary and text.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_title) NOT BETWEEN 5 AND 120 THEN
    RAISE EXCEPTION 'Keep the title between 5 and 120 characters.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_topic = ANY (private.news_topics()) THEN
    RAISE EXCEPTION 'Unknown topic: %', v_topic USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_city) > 100 OR (v_city <> '' AND v_city !~ '[[:alpha:]]') THEN
    RAISE EXCEPTION 'Give the city by its name, or leave it empty for all of Germany.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_summary) NOT BETWEEN 20 AND 220 THEN
    RAISE EXCEPTION 'Keep the summary between 20 and 220 characters (it has %).', char_length(v_summary) USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_body) > 12000 THEN
    RAISE EXCEPTION 'Keep the text to 12,000 characters (it has %).', char_length(v_body) USING ERRCODE = 'P0001';
  END IF;
  -- Sources: names and links trimmed, empty rows left out.
  IF f ? 'sources' AND jsonb_typeof(f -> 'sources') <> 'array' THEN
    RAISE EXCEPTION 'The sources must be a list.' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', btrim(COALESCE(s ->> 'name', '')), 'url', btrim(COALESCE(s ->> 'url', ''))) ORDER BY i), '[]'::jsonb)
  INTO v_sources
  FROM jsonb_array_elements(COALESCE(f -> 'sources', '[]'::jsonb)) WITH ORDINALITY x(s, i)
  WHERE jsonb_typeof(s) = 'object' AND (btrim(COALESCE(s ->> 'name', '')) <> '' OR btrim(COALESCE(s ->> 'url', '')) <> '');
  IF jsonb_array_length(v_sources) = 0 THEN
    RAISE EXCEPTION 'Add at least one source: where the facts come from, e.g. the BAMF or the Indian embassy.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT private.news_sources_ok(v_sources) THEN
    RAISE EXCEPTION 'Give each source a name (up to 80 characters) and a full https:// link, at most 3 sources.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM private.take_rate('news', ARRAY['60', '1 hour']);

  IF COALESCE(p_new, FALSE) THEN
    INSERT INTO public.news_posts (slug, title, topic, city, summary, body, sources, created_by, updated_by)
    VALUES (v_slug, v_title, v_topic, v_city, v_summary, v_body, v_sources, me, me)
    ON CONFLICT (slug) DO NOTHING
    RETURNING * INTO saved;
    IF saved.slug IS NULL THEN
      RAISE EXCEPTION 'A post with this address already exists. Change the address.' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    UPDATE public.news_posts n SET title = v_title, topic = v_topic, city = v_city, summary = v_summary, body = v_body,
      sources = v_sources, updated_by = me, updated_at = NOW(),
      edited_at = CASE WHEN n.published_at IS NULL THEN NULL
                       WHEN (n.title, n.topic, n.city, n.summary, n.body, n.sources) IS DISTINCT FROM (v_title, v_topic, v_city, v_summary, v_body, v_sources)
                       THEN NOW() ELSE n.edited_at END
    WHERE n.slug = v_slug
    RETURNING * INTO saved;
    IF saved.slug IS NULL THEN
      RAISE EXCEPTION 'Post not found. It may have been deleted.' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN private.news_json(saved);
END;
$$;

-- Publishes a post ('published': anyone sees it from now on, again too) or
-- takes a published one off the site ('hidden'). A post keeps the date it
-- was first published. Returns the post.
CREATE FUNCTION public.admin_set_news_status(p_slug TEXT, p_status TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  saved public.news_posts;
  was TEXT;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('published', 'hidden') THEN
    RAISE EXCEPTION 'Say "published" or "hidden".' USING ERRCODE = 'P0001';
  END IF;
  SELECT status INTO was FROM public.news_posts WHERE slug = p_slug FOR UPDATE;
  IF was IS NULL THEN
    RAISE EXCEPTION 'Post not found. It may have been deleted.' USING ERRCODE = 'P0002';
  END IF;
  IF p_status = 'hidden' AND was = 'draft' THEN
    RAISE EXCEPTION 'This post isn''t published.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM private.take_rate('news', ARRAY['60', '1 hour']);
  UPDATE public.news_posts SET status = p_status, published_at = COALESCE(published_at, NOW()),
    updated_by = (SELECT auth.uid()), updated_at = NOW()
  WHERE slug = p_slug
  RETURNING * INTO saved;
  RETURN private.news_json(saved);
END;
$$;

-- Deletes a post. Returns its slug. Links already shared then show "not found".
CREATE FUNCTION public.admin_delete_news_post(p_slug TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.news_posts WHERE slug = p_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found. It may have been deleted.' USING ERRCODE = 'P0002';
  END IF;
  RETURN p_slug;
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

REVOKE ALL ON FUNCTION private.news_json(public.news_posts) FROM PUBLIC;
-- The table's CHECKs use these, so whoever writes a row needs them (only the
-- functions above do).
GRANT EXECUTE ON FUNCTION private.news_topics(), private.news_sources_ok(JSONB) TO anon, authenticated, service_role;

-- Admin functions check private.is_admin() themselves; members get "Admins only".
REVOKE ALL ON FUNCTION public.admin_news_posts(), public.admin_save_news_post(JSONB, BOOLEAN),
  public.admin_set_news_status(TEXT, TEXT), public.admin_delete_news_post(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_news_posts(), public.admin_save_news_post(JSONB, BOOLEAN),
  public.admin_set_news_status(TEXT, TEXT), public.admin_delete_news_post(TEXT) TO authenticated;
