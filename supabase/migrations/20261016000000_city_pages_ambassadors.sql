-- ============================================================================
-- NRIclub: public city pages and city ambassadors (2026-10-16)
--
--   * public.city_summary(city) and public.public_cities(): counts only (no
--     names, posts or other member content), readable without signing in,
--     for the public city pages (nriclub.app/city/<city>).
--   * profiles.ambassador_city: the city a member is NRIClub ambassador for
--     ('' for none). Only admins can set it.
-- No existing rows change.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN ambassador_city TEXT NOT NULL DEFAULT '' CHECK (char_length(ambassador_city) <= 200);

-- Members can't set it themselves (admins pass through protect_columns).
DROP TRIGGER protect_columns ON public.profiles;
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns(
    '{"linkedin_verified": false, "email_verified": false, "ambassador_city": ""}',
    'id', 'linkedin_verified', 'email_verified', 'created_at', 'ambassador_city');

-- How active a city is, for its public page: members of its city group,
-- events in the city, places and essentials guides. Counts only.
CREATE FUNCTION public.city_summary(p_city TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'city', g.city,
    'group', EXISTS (SELECT 1 FROM public.groups x WHERE x.is_approved AND lower(x.name) = lower('Indians in ' || g.city)),
    'members', COALESCE((SELECT x.members_count FROM public.groups x WHERE x.is_approved AND lower(x.name) = lower('Indians in ' || g.city) LIMIT 1), 0),
    'events', (SELECT count(*) FROM public.events e WHERE e.location ILIKE '%' || g.city || '%' OR e.city ILIKE g.city),
    'places', (SELECT count(*) FROM public.places p WHERE lower(p.city) = lower(g.city))
  )
  FROM (SELECT LEFT(btrim(COALESCE(p_city, '')), 100) AS city) g
  WHERE g.city <> '';
$$;

-- Cities with an NRIClub group, largest first (for links between city pages).
CREATE FUNCTION public.public_cities()
RETURNS TABLE (city TEXT, members INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT substr(g.name, 12), g.members_count
  FROM public.groups g
  WHERE g.is_approved AND g.category = 'City' AND g.name ILIKE 'Indians in %'
  ORDER BY g.members_count DESC, g.name
  LIMIT 500;
$$;

REVOKE ALL ON FUNCTION public.city_summary(TEXT), public.public_cities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.city_summary(TEXT), public.public_cities() TO anon, authenticated;
