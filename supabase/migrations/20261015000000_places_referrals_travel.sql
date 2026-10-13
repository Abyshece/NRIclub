-- ============================================================================
-- NRIclub: desi places, job referrals, travel companions, essentials guides
-- (2026-10-15)
--
--   * Market gets two categories: 'Referrals' (job referrals offered or
--     asked for) and 'Travel' (travel companions, e.g. parents flying alone).
--   * Guides in the 'Essentials' category (pinned at the top of Guides) can
--     only be written or changed by admins.
--   * Desi places: Indian groceries, restaurants, temples and shops per
--     city, added and recommended by members (public.places and
--     public.place_recommendations).
-- No existing rows change.
-- ============================================================================

ALTER TABLE public.marketplace
  DROP CONSTRAINT marketplace_category_check,
  ADD CONSTRAINT marketplace_category_check
    CHECK (category IN ('Housing', 'Jobs', 'Items', 'Vehicles', 'Services', 'Referrals', 'Travel'));

-- Essentials guides come from the NRIClub team.
CREATE FUNCTION private.essentials_admin_only()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user = 'authenticated' AND NOT private.is_admin()
     AND (NEW.category = 'Essentials' OR (TG_OP = 'UPDATE' AND OLD.category = 'Essentials')) THEN
    RAISE EXCEPTION 'Only the NRIClub team can write Essentials guides.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER essentials_admin_only BEFORE INSERT OR UPDATE ON public.docs
  FOR EACH ROW EXECUTE FUNCTION private.essentials_admin_only();

-- Desi places, per city.
CREATE TABLE public.places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL CHECK (char_length(btrim(city)) BETWEEN 1 AND 200),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  kind TEXT NOT NULL DEFAULT 'Grocery' CHECK (kind IN ('Grocery', 'Restaurant', 'Temple', 'Shop', 'Other')),
  address TEXT NOT NULL DEFAULT '' CHECK (char_length(address) <= 300),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_places_city ON public.places (lower(city));
CREATE INDEX idx_places_created_by ON public.places(created_by);

CREATE TABLE public.place_recommendations (
  place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (place_id, user_id)
);
CREATE INDEX idx_place_recommendations_user ON public.place_recommendations(user_id);

ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_recommendations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.places, public.place_recommendations FROM anon;

CREATE POLICY "Members can view places" ON public.places
  FOR SELECT TO authenticated USING (created_by = (SELECT auth.uid()) OR (SELECT private.can_browse()));
CREATE POLICY "Members can add places" ON public.places
  FOR INSERT TO authenticated WITH CHECK (created_by = (SELECT auth.uid()) AND (SELECT private.is_active_member()));
CREATE POLICY "Members can edit their own places" ON public.places
  FOR UPDATE TO authenticated USING (created_by = (SELECT auth.uid())) WITH CHECK (created_by = (SELECT auth.uid()));
CREATE POLICY "Members and admins can delete places" ON public.places
  FOR DELETE TO authenticated USING (created_by = (SELECT auth.uid()) OR (SELECT private.is_admin()));

CREATE POLICY "Members can view recommendations" ON public.place_recommendations
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT private.can_browse()));
CREATE POLICY "Members can recommend places" ON public.place_recommendations
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT private.is_active_member()));
CREATE POLICY "Members can take back a recommendation" ON public.place_recommendations
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- Server dates, and the creator can't be changed.
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.places
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{}', 'id', 'created_by', 'created_at');
CREATE TRIGGER protect_columns BEFORE INSERT ON public.place_recommendations
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{}');

REVOKE ALL ON FUNCTION private.essentials_admin_only() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.essentials_admin_only() TO authenticated, service_role;
