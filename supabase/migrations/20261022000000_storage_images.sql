-- ============================================================================
-- NRIclub: photo files and invite links (2026-10-22)
--
--   * Photo files nothing uses any more are deleted (C1). The site already
--     deletes a member's files when they delete their account, a post, a
--     listing or an event, or replace or remove their profile photo (under
--     the own-folder policies of 2026-10-12). What is left behind (content
--     our team removed, accounts deleted by the nightly clean-up or by hand,
--     a deletion that failed) is found by public.admin_storage_orphans and
--     deleted by the admin panel through the Storage API, with the admin's
--     own session: automatically once a day when an admin opens the panel
--     (public.admin_photo_cleanup_due), or with its "Clean up photo files"
--     button. No service key and no Edge Function. Files can't be deleted
--     with SQL: the row would go, the file itself would stay (and the live
--     project refuses it).
--   * Admins may see every photo file, and delete one only while no
--     profile, post, event, group or Market listing uses it, so the
--     clean-up can never break a photo that is shown (C1).
--   * The photo buckets accept JPEG, PNG and WebP only (no GIF any more),
--     profile photos up to 2 MB, other photos up to 4 MB. The site turns
--     every photo into a smaller JPEG before uploading it, which removes
--     hidden details such as where it was taken (EXIF/GPS), and names it
--     <member id>/<random>.jpg (C2). Links already stored keep working.
--   * The empty, unused bucket "photos" is deleted where the database
--     allows it (otherwise the editor says so: delete it in the dashboard).
--   * Invite links carry a random code instead of the member's ID (C19):
--     public.invites, public.my_invite_code() and public.resolve_invite().
--     Links with a member ID from before keep working for a while.
-- Needs all earlier migrations (up to 20261020000000_notifications_limits_privacy.sql).
-- Existing rows: none change; existing files are only listed. Run the
-- clean-up once from the admin panel (Overview → Photo files) after this.
-- ============================================================================

-- ============================================================================
-- WHICH PHOTO FILES ARE IN USE
-- ============================================================================

-- A text with %xx escapes decoded (UTF-8), or unchanged if it has none or
-- isn't valid.
CREATE FUNCTION private.percent_decode(p_text TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  decoded TEXT;
BEGIN
  IF p_text IS NULL OR strpos(p_text, '%') = 0 THEN
    RETURN p_text;
  END IF;
  SELECT convert_from(string_agg(CASE WHEN m[1] IS NOT NULL THEN decode(substr(m[1], 2), 'hex')
                                      ELSE convert_to(m[2], 'UTF8') END, ''::bytea ORDER BY ord), 'UTF8')
  INTO decoded
  FROM regexp_matches(p_text, '(%[0-9A-Fa-f]{2})|([^%]+|%)', 'g') WITH ORDINALITY AS t(m, ord);
  RETURN COALESCE(decoded, p_text);
EXCEPTION WHEN OTHERS THEN
  RETURN p_text;
END;
$$;

-- The Storage object names (<member id>/<file>) a stored photo value points
-- to: a public link (https://<project>.supabase.co/storage/v1/object/public/
-- <bucket>/<name>, with or without ?t=...), a JSON array of links (Market
-- listings), a JSON string, or a bare path. Links to other sites point to
-- nothing here. Names come as stored and, if different, decoded.
CREATE FUNCTION private.image_names(p_value TEXT)
RETURNS SETOF TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  items TEXT[] := ARRAY[p_value];
  item TEXT;
  j JSONB;
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN;
  END IF;
  IF left(btrim(p_value), 1) IN ('[', '"') THEN
    BEGIN
      j := p_value::jsonb;
      IF jsonb_typeof(j) = 'array' THEN
        SELECT COALESCE(array_agg(e #>> '{}'), '{}') INTO items
        FROM jsonb_array_elements(j) e WHERE jsonb_typeof(e) = 'string';
      ELSIF jsonb_typeof(j) = 'string' THEN
        items := ARRAY[j #>> '{}'];
      END IF;
    EXCEPTION WHEN OTHERS THEN
      items := ARRAY[p_value];
    END;
  END IF;
  FOREACH item IN ARRAY items LOOP
    item := split_part(split_part(btrim(COALESCE(item, '')), '?', 1), '#', 1);
    IF strpos(item, '/storage/v1/') > 0 THEN
      item := substring(item FROM '/storage/v1/(?:object|render/image)/(?:public/|sign/|authenticated/)?[^/]+/(.+)$');
    ELSIF item ~* '^[a-z][a-z0-9+.-]*:' THEN
      item := NULL;
    END IF;
    item := ltrim(item, '/');
    IF item IS NOT NULL AND item <> '' THEN
      RETURN NEXT item;
      IF private.percent_decode(item) <> item THEN
        RETURN NEXT private.percent_decode(item);
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Every Storage object name a row uses: profile photos, post, event and
-- group photos, and Market listing photos. (Every column that stores a
-- photo; a new one goes here too.)
CREATE FUNCTION private.image_refs()
RETURNS TABLE (ref TEXT) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT n
  FROM (
    SELECT p.avatar_url AS v FROM public.profiles p WHERE p.avatar_url <> ''
    UNION ALL SELECT x.image_url FROM public.posts x WHERE x.image_url <> ''
    UNION ALL SELECT x.image_url FROM public.events x WHERE x.image_url <> ''
    UNION ALL SELECT x.image_url FROM public.groups x WHERE x.image_url <> ''
    UNION ALL SELECT x.image_url FROM public.marketplace x WHERE x.image_url <> ''
  ) s, LATERAL private.image_names(s.v) n;
$$;

-- Whether a row uses the Storage object p_name (as private.image_refs, but
-- only looking closely at values that can contain it: those with its file
-- name, or with escapes that may hide it).
CREATE FUNCTION private.image_in_use(p_name TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT p.avatar_url AS v FROM public.profiles p WHERE p.avatar_url <> ''
      UNION ALL SELECT x.image_url FROM public.posts x WHERE x.image_url <> ''
      UNION ALL SELECT x.image_url FROM public.events x WHERE x.image_url <> ''
      UNION ALL SELECT x.image_url FROM public.groups x WHERE x.image_url <> ''
      UNION ALL SELECT x.image_url FROM public.marketplace x WHERE x.image_url <> ''
    ) s
    WHERE (strpos(s.v, regexp_replace(p_name, '^.*/', '')) > 0 OR strpos(s.v, '%') > 0 OR strpos(s.v, '\u') > 0)
      AND p_name IN (SELECT private.image_names(s.v))
  );
$$;

-- For the Storage policy below: the signed-in member is an admin and no
-- row uses the object (checked in this order).
CREATE FUNCTION private.admin_may_delete_image(p_name TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RETURN FALSE;
  END IF;
  RETURN NOT private.image_in_use(p_name);
END;
$$;

-- ============================================================================
-- STORAGE: buckets and admin policies
-- ============================================================================

-- What the buckets accept. The site uploads JPEGs only (it re-encodes every
-- photo); PNG and WebP stay allowed for pages opened before this update.
-- Profile photos are 512 pixels at most, other photos 1,600. If the
-- database doesn't let this change the buckets (or changes fewer than the
-- three), the editor says so: then set the same in the dashboard (Storage →
-- the bucket → Edit bucket).
DO $$
DECLARE
  changed INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'allowed_mime_types')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'file_size_limit') THEN
    BEGIN
      UPDATE storage.buckets
      SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'],
          file_size_limit = CASE id WHEN 'avatars' THEN 2097152 ELSE 4194304 END
      WHERE id IN ('avatars', 'post-images', 'marketplace-images');
      GET DIAGNOSTICS changed = ROW_COUNT;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'NRIClub: the photo buckets could not be changed here (%). In the dashboard, set avatars, post-images and marketplace-images to image/jpeg, image/png, image/webp, with 2 MB (avatars) or 4 MB.', SQLERRM;
      RETURN;
    END;
  END IF;
  IF changed < 3 THEN
    RAISE NOTICE 'NRIClub: only % of the photo buckets avatars, post-images and marketplace-images were changed here. In the dashboard, set each to image/jpeg, image/png, image/webp, with 2 MB (avatars) or 4 MB.', changed;
  END IF;
END $$;

-- The bucket "photos" (made by hand on the live project, public, no size or
-- type limit) is used by nothing. Deleted here if it is empty and the
-- database allows it; Supabase may refuse deletes in its storage tables, so
-- a refusal only gives a notice.
DO $$
DECLARE
  files BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'photos') THEN
    RETURN;
  END IF;
  SELECT count(*) INTO files FROM storage.objects WHERE bucket_id = 'photos';
  IF files > 0 THEN
    RAISE NOTICE 'NRIClub: the bucket "photos" still has % file(s). Run "Clean up photo files" in the admin panel, then delete the bucket in the dashboard (Storage → photos → Delete bucket).', files;
    RETURN;
  END IF;
  BEGIN
    DELETE FROM storage.buckets WHERE id = 'photos';
    RAISE NOTICE 'NRIClub: the empty bucket "photos" was deleted.';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'NRIClub: the empty bucket "photos" could not be deleted here (%). Delete it in the dashboard: Storage → photos → Delete bucket.', SQLERRM;
  END;
END $$;

-- Admins see every photo file (the Storage API needs this to delete one,
-- and to list a member's folder).
CREATE POLICY "NRIclub: admins can see photo files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id IN ('avatars', 'post-images', 'marketplace-images', 'photos') AND (SELECT private.is_admin()));

-- Admins delete a photo file only while nothing uses it: to remove a photo
-- that is shown, first clear or delete what shows it (the profile photo,
-- the post...), then delete the file. Members delete their own files under
-- "NRIclub: users can delete their own uploads".
CREATE POLICY "NRIclub: admins can delete photo files nothing uses" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('avatars', 'post-images', 'marketplace-images', 'photos') AND private.admin_may_delete_image(name));

-- ============================================================================
-- RPC: the photo clean-up (admins only)
-- ============================================================================

-- Photo files to delete, at most p_limit (1 to 1,000) at a time: files no
-- row uses (private.image_refs) that either belong to an account that no
-- longer exists (the first folder is a member ID without an auth.users row:
-- reason 'account_deleted') or are more than a day old ('unused'; younger
-- ones may be a photo a member is still writing a post for). Lists only:
-- the admin panel deletes them through the Storage API, and asks again
-- until none are left.
CREATE FUNCTION public.admin_storage_orphans(p_limit INTEGER DEFAULT 200)
RETURNS TABLE (bucket_id TEXT, name TEXT, reason TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH refs AS (SELECT r.ref FROM private.image_refs() r),
  files AS (
    SELECT o.bucket_id AS b, o.name AS n, o.created_at AS at,
      CASE WHEN (storage.foldername(o.name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = lower((storage.foldername(o.name))[1])::uuid)
           ELSE FALSE END AS gone
    FROM storage.objects o
    WHERE o.bucket_id IN ('avatars', 'post-images', 'marketplace-images', 'photos')
  )
  SELECT f.b, f.n, CASE WHEN f.gone THEN 'account_deleted' ELSE 'unused' END
  FROM files f
  WHERE (f.gone OR f.at < NOW() - INTERVAL '24 hours')
    AND NOT EXISTS (SELECT 1 FROM refs WHERE refs.ref = f.n)
  ORDER BY 3, 1, 2
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
END;
$$;

-- Whether today's automatic clean-up is still to run: true for the first
-- admin who asks on a day (UTC), who then runs it; false for everyone after.
-- The date is kept in private.app_config ('photo_cleanup_on').
CREATE FUNCTION public.admin_photo_cleanup_due()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  claimed BOOLEAN;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO private.app_config AS c (key, value)
  VALUES ('photo_cleanup_on', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD'))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value WHERE c.value IS DISTINCT FROM EXCLUDED.value
  RETURNING TRUE INTO claimed;
  RETURN COALESCE(claimed, FALSE);
END;
$$;

-- ============================================================================
-- INVITE LINKS (C19)
-- ============================================================================

-- Each member's invite code, for links like nriclub.app/?invite=<code>:
-- random, so a link shared in a WhatsApp group no longer shows the member's
-- ID (which is also the name of their photo folder). Made by
-- public.my_invite_code; members read their own, admins all. Deleted with
-- the account.
CREATE TABLE public.invites (
  code TEXT PRIMARY KEY CHECK (code ~ '^[a-z0-9]{8,32}$'),
  member_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invites FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.invites TO authenticated;
CREATE POLICY "Members see their own invite code" ON public.invites
  FOR SELECT TO authenticated
  USING (member_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));

-- A new random code: 12 characters from 32 (a-z and 2-9 without l and o),
-- 60 random bits from gen_random_uuid() (the bytes without its fixed bits).
CREATE FUNCTION private.new_invite_code()
RETURNS TEXT LANGUAGE sql VOLATILE SET search_path = '' AS $$
  SELECT string_agg(substr('abcdefghijkmnpqrstuvwxyz23456789', (get_byte(x.b, t.p) % 32) + 1, 1), '' ORDER BY t.ord)
  FROM (SELECT uuid_send(gen_random_uuid()) AS b) x,
       unnest(ARRAY[0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13]) WITH ORDINALITY AS t(p, ord);
$$;

-- The signed-in member's invite code, made the first time they ask.
-- Blocked members get none.
CREATE FUNCTION public.my_invite_code()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  v_code TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  SELECT i.code INTO v_code FROM public.invites i WHERE i.member_id = uid;
  IF FOUND THEN
    RETURN v_code;
  END IF;
  IF private.is_blocked_me() THEN
    RAISE EXCEPTION 'Your account is blocked, so you can''t invite anyone.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid) THEN
    RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0001';
  END IF;
  LOOP
    v_code := private.new_invite_code();
    BEGIN
      INSERT INTO public.invites (code, member_id) VALUES (v_code, uid);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      -- Made at the same moment by another request (or, very rarely, the
      -- code is taken): the member's own code if there is one now, else
      -- another try.
      SELECT i.code INTO v_code FROM public.invites i WHERE i.member_id = uid;
      IF FOUND THEN
        RETURN v_code;
      END IF;
    END;
  END LOOP;
END;
$$;

-- Who invited the signed-in member, from the code in their invite link:
-- the inviter's member ID and first name, for "Invited by ..." in the
-- details our team checks. Nothing for an unknown code or the member's own.
-- Counted like other actions (30 a day), so codes can't be tried out.
CREATE FUNCTION public.resolve_invite(p_code TEXT)
RETURNS TABLE (member_id UUID, first_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  PERFORM private.take_rate('invite_lookup', ARRAY['30', '1 day']);
  RETURN QUERY
  SELECT i.member_id, LEFT(split_part(btrim(p.name), ' ', 1), 40)
  FROM public.invites i
  JOIN public.profiles p ON p.id = i.member_id
  WHERE i.code = lower(btrim(COALESCE(p_code, ''))) AND i.member_id <> auth.uid();
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- The helpers run as the database; the policy helper is called as the
-- member (by the Storage policy). Members can't call anything in private
-- through the API (the schema isn't exposed).
REVOKE ALL ON FUNCTION private.percent_decode(TEXT), private.image_names(TEXT), private.image_refs(),
  private.image_in_use(TEXT), private.admin_may_delete_image(TEXT), private.new_invite_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.admin_may_delete_image(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.percent_decode(TEXT), private.image_names(TEXT), private.image_refs(),
  private.image_in_use(TEXT), private.new_invite_code() TO service_role;
REVOKE ALL ON FUNCTION public.admin_storage_orphans(INTEGER), public.admin_photo_cleanup_due(),
  public.my_invite_code(), public.resolve_invite(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_storage_orphans(INTEGER), public.admin_photo_cleanup_due(),
  public.my_invite_code(), public.resolve_invite(TEXT) TO authenticated;
