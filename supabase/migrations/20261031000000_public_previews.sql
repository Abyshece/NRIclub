-- ============================================================================
-- NRIclub: shareable public previews (2026-10-31)
--
--   * A member who shares the link to their Market listing, event, question
--     or travel-board trip (e.g. in WhatsApp) can let people who aren't
--     members yet see a small preview of it: share_preview on
--     public.marketplace, public.events, public.help_requests and
--     public.travel_posts. Off for every item unless its author turns it on
--     (privacy by default, Art. 25(2) GDPR): in the form, on the item, or
--     when they share it. Existing items stay members-only.
--   * Only the author changes it, through the update paths they already have
--     (the tables' UPDATE policies: the author, while they can take part;
--     private.protect_columns doesn't lock it, so it's also set when the
--     item is posted). Admins don't change members' content directly (C23):
--     our team removes an item with public.admin_moderate, and its preview
--     goes with it.
--   * public.public_preview(kind, id), for anyone (signed out too): the
--     preview of one item, or NULL. NULL, whatever the reason, unless the
--     author turned the preview on, is a member other members see
--     (private.is_listed_member: approved, not blocked), and the item is
--     live: a Market listing still active (a housing listing not past its
--     last day), an event whose day hasn't passed, a question not removed, a
--     trip whose last date hasn't passed. A removed item is gone (our team's
--     removals delete it), so a missing item and a private one give the same
--     NULL. Only these keys: kind ('market', 'event', 'question', 'trip'),
--     label (e.g. "Housing · WG room", "Event", "Question", "Trip Frankfurt
--     → Delhi"), city, image (Market listings and events), day (events,
--     "Sat 8 Nov 2026"), month (trips, "November 2026"), title and answers
--     (questions: their title and how many answers). Never a price,
--     description, time, place, note, flight, name, photo of a person or
--     anything else.
--   * The city: a housing listing's city (housing_listings.city), an
--     event's or a question's city field, written as a city's name
--     (private.travel_city_ok); another Market listing's free-text location
--     only where one of its comma-separated parts is exactly the city of an
--     approved city group ("Indians in <City>"), else none.
--   * The photo: only a link to our Storage's public marketplace-images or
--     post-images bucket, in the author's own folder, as the site uploads
--     them (private.preview_image); never a data: link or another site's.
--   * "Download my data" has the new switch already: public.export_my_data
--     (the 2026-10-30 version) gives the member's listings, events,
--     questions and trips as whole rows, so it isn't changed.
--   * No new kind of notification; private.daily_cleanup is not changed.
-- Needs the earlier migrations (up to 20261030000000_housing_search.sql).
-- Can be run again: it replaces what it made the first time and keeps the
-- switches as they are. Existing rows: none change (each gets
-- share_preview false, so it stays members-only).
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.housing_listings') IS NULL THEN
    RAISE EXCEPTION 'Run the housing search update (20261030000000_housing_search.sql) first.';
  END IF;
END;
$$;

-- ============================================================================
-- THE AUTHOR'S SWITCH
-- ============================================================================

-- true: people without an account who open the item's link see its preview
-- (public.public_preview). The author sets it when posting and changes it
-- like the rest of their item; nobody else can (the UPDATE policies).
ALTER TABLE public.marketplace ADD COLUMN IF NOT EXISTS share_preview BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS share_preview BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.help_requests ADD COLUMN IF NOT EXISTS share_preview BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.travel_posts ADD COLUMN IF NOT EXISTS share_preview BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================================
-- WHAT A PREVIEW SHOWS
-- ============================================================================

-- A Market listing's kind, as the preview says it (PREVIEW_MARKET_LABELS in
-- src/content/preview.js, and the kinds of place in src/content/housing.js;
-- supabase/tests/rls_test.py compares them): "Item for sale", "Housing · WG
-- room" (just "Housing" for a listing without housing details), "Job" …
CREATE OR REPLACE FUNCTION private.preview_market_label(p_category TEXT, p_housing_kind TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_category
    WHEN 'Housing' THEN 'Housing' || COALESCE(' · ' || CASE p_housing_kind
      WHEN 'wg_room' THEN 'WG room' WHEN 'sublet' THEN 'Sublet' WHEN 'flat' THEN 'Whole flat'
      WHEN 'short_stay' THEN 'Short stay' WHEN 'house' THEN 'House' END, '')
    WHEN 'Items' THEN 'Item for sale'
    WHEN 'Jobs' THEN 'Job'
    WHEN 'Referrals' THEN 'Referral'
    WHEN 'Vehicles' THEN 'Vehicle'
    WHEN 'Services' THEN 'Service'
    WHEN 'Travel' THEN 'Travel companion'
    ELSE 'Market listing' END;
$$;

-- The city a Market listing's free-text location names, for its preview:
-- the city of an approved city group ("Indians in <City>", as the group
-- writes it) that one of the location's comma-separated parts is exactly
-- (without case and the spaces around it; the first such part). NULL when
-- no part is: a location can hold a street, which a preview never shows.
CREATE OR REPLACE FUNCTION private.preview_city_from_location(p_location TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT substr(g.name, char_length('Indians in ') + 1)
  FROM unnest(string_to_array(LEFT(COALESCE(p_location, ''), 200), ',')) WITH ORDINALITY AS part(text, n)
  JOIN public.groups g ON g.category = 'City' AND g.is_approved AND lower(g.name) = private.city_group_name(part.text)
  WHERE btrim(part.text) <> ''
  ORDER BY part.n, g.members_count DESC, g.created_at
  LIMIT 1;
$$;

-- An event's or a question's city field, if it is written as a city's name
-- (letters, 2 to 60 characters, no digits or web addresses:
-- private.travel_city_ok); else NULL.
CREATE OR REPLACE FUNCTION private.preview_city(p_city TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN private.travel_city_ok(c) THEN c END
  FROM (SELECT btrim(regexp_replace(COALESCE(p_city, ''), '\s+', ' ', 'g')) AS c) x;
$$;

-- A photo link a preview may show: a link to a file in our Storage's public
-- marketplace-images or post-images bucket, in the author's own folder,
-- with a plain file name, as the site uploads them (the project's address
-- from private.app_config's storage_public_url, or else any
-- https://<project>.supabase.co). Anything else is NULL: never a data: link,
-- another site's link or someone else's file.
CREATE OR REPLACE FUNCTION private.preview_image(p_url TEXT, p_author UUID)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  url TEXT := btrim(COALESCE(p_url, ''));
  base TEXT := btrim(COALESCE((SELECT c.value FROM private.app_config c WHERE c.key = 'storage_public_url'), ''));
  rest TEXT;
BEGIN
  IF url = '' OR p_author IS NULL OR char_length(url) > 2048 THEN
    RETURN NULL;
  END IF;
  IF base <> '' THEN
    base := rtrim(base, '/') || '/';
    IF base !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/' OR NOT starts_with(url, base) THEN
      RETURN NULL;
    END IF;
    rest := substr(url, char_length(base) + 1);
  ELSE
    rest := substring(url FROM '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/(.*)$');
  END IF;
  IF rest IS NULL OR rest ~ '\.\.'
     OR rest !~ ('^(marketplace-images|post-images)/' || p_author::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,199}$') THEN
    RETURN NULL;
  END IF;
  RETURN url;
END;
$$;

-- "Sat 8 Nov 2026": an event's day as its preview says it.
CREATE OR REPLACE FUNCTION private.preview_day(p_day DATE)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT to_char(p_day, 'Dy FMDD Mon YYYY');
$$;

-- "November 2026": the month of a trip, as its preview says it (a request
-- whose window runs into another month: "November–December 2026",
-- "December 2026–January 2027"). Never the days.
CREATE OR REPLACE FUNCTION private.preview_month(p_from DATE, p_to DATE)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_to IS NULL OR date_trunc('month', p_from) = date_trunc('month', p_to) THEN to_char(p_from, 'FMMonth YYYY')
    WHEN date_trunc('year', p_from) = date_trunc('year', p_to) THEN to_char(p_from, 'FMMonth') || '–' || to_char(p_to, 'FMMonth YYYY')
    ELSE to_char(p_from, 'FMMonth YYYY') || '–' || to_char(p_to, 'FMMonth YYYY') END;
$$;

-- ============================================================================
-- THE PREVIEW
-- ============================================================================

-- For anyone, signed out too (the preview page, src/PreviewPage.jsx, and the
-- link preview, api/preview.js): the preview of one item, p_kind 'market',
-- 'event', 'question' or 'trip' and p_id its id. NULL for anything else, and
-- whenever the item has no preview (switched off, not there, sold, expired,
-- past, removed, or its author isn't shown to members): the answer never
-- says which. Keys: kind, label, city and image always (NULL where there is
-- none; never a photo for questions and trips); day for events; month for
-- trips; title and answers for questions.
CREATE OR REPLACE FUNCTION public.public_preview(p_kind TEXT, p_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  today DATE := private.today_in_germany();
  m public.marketplace;
  h public.housing_listings;
  e public.events;
  q public.help_requests;
  t public.travel_posts;
  d DATE;
BEGIN
  IF p_id IS NULL OR p_kind IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_kind = 'market' THEN
    SELECT * INTO m FROM public.marketplace x WHERE x.id = p_id;
    IF m.id IS NULL OR NOT m.share_preview OR m.status <> 'active' OR NOT private.is_listed_member(m.user_id) THEN
      RETURN NULL;
    END IF;
    SELECT * INTO h FROM public.housing_listings x WHERE x.listing_id = m.id;
    IF h.listing_id IS NOT NULL AND h.expires_on < today THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object(
      'kind', 'market',
      'label', private.preview_market_label(m.category, h.kind),
      'city', CASE WHEN h.listing_id IS NOT NULL THEN private.preview_city(h.city)
                   ELSE private.preview_city_from_location(m.location) END,
      'image', private.preview_image((private.listing_photos(NULLIF(m.image_url, '')))[1], m.user_id));
  ELSIF p_kind = 'event' THEN
    SELECT * INTO e FROM public.events x WHERE x.id = p_id;
    IF e.id IS NULL OR NOT e.share_preview OR e.organizer_id IS NULL OR NOT private.is_listed_member(e.organizer_id)
       OR e.date !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RETURN NULL;
    END IF;
    BEGIN
      d := e.date::DATE;
    EXCEPTION WHEN OTHERS THEN
      RETURN NULL;
    END;
    IF d < today THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object(
      'kind', 'event',
      'label', 'Event',
      'city', private.preview_city(e.city),
      'day', private.preview_day(d),
      'image', private.preview_image(e.image_url, e.organizer_id));
  ELSIF p_kind = 'question' THEN
    SELECT * INTO q FROM public.help_requests x WHERE x.id = p_id;
    IF q.id IS NULL OR NOT q.share_preview OR NOT private.is_listed_member(q.user_id) THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object(
      'kind', 'question',
      'label', 'Question',
      'city', private.preview_city(q.city),
      'image', NULL,
      'title', btrim(regexp_replace(q.title, '\s+', ' ', 'g')),
      'answers', (SELECT count(*) FROM public.help_responses r WHERE r.request_id = q.id));
  ELSIF p_kind = 'trip' THEN
    SELECT * INTO t FROM public.travel_posts x WHERE x.id = p_id;
    IF t.id IS NULL OR NOT t.share_preview OR t.date_to < today OR NOT private.is_listed_member(t.user_id) THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object(
      'kind', 'trip',
      'label', 'Trip ' || t.from_city || ' → ' || t.to_city,
      'city', NULL,
      'image', NULL,
      'month', private.preview_month(t.date_from, t.date_to));
  END IF;
  RETURN NULL;
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- The helpers run inside public.public_preview (as its owner); only the
-- service role may call them by hand.
REVOKE ALL ON FUNCTION private.preview_market_label(TEXT, TEXT), private.preview_city_from_location(TEXT),
  private.preview_city(TEXT), private.preview_image(TEXT, UUID), private.preview_day(DATE),
  private.preview_month(DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.preview_market_label(TEXT, TEXT), private.preview_city_from_location(TEXT),
  private.preview_city(TEXT), private.preview_image(TEXT, UUID), private.preview_day(DATE),
  private.preview_month(DATE, DATE) TO service_role;
-- The preview: anyone, signed in or not.
REVOKE ALL ON FUNCTION public.public_preview(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_preview(TEXT, UUID) TO anon, authenticated, service_role;
