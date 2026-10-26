-- ============================================================================
-- NRIclub: our team deletes a member's account (2026-11-01)
--
--   * Until now our team could delete only accounts that never finished
--     signing up (20261025100000_admin_tools.sql); approved members could
--     only be blocked, and members delete their own account in Settings.
--     Now an admin can delete any member's account from the admin panel
--     (Members → the member → Delete account…), except an admin's account
--     and their own, for one of two reasons: 'member_request' (the member
--     asked us to, e.g. by email because they can't do it themselves:
--     erasure, Art. 17 GDPR) or 'blocked_account' (only an account that is
--     blocked; the panel warns while the member can still challenge the
--     block, 6 months after it, Art. 20 DSA).
--   * The Edge Function admin-delete-member (supabase/functions/
--     admin-delete-member) first checks with public.admin_check_member_delete
--     (as the admin): admin rights (private.is_admin), the member exists,
--     not the admin's own account nor any account in public.admins, a known
--     reason ('blocked_account' only for a blocked account), and the
--     admin's limits (10 a minute, 50 a day). It returns what the function
--     needs: the admin, the member's sign-in address and first name for the
--     email, and whether and since when the account is blocked. Then the
--     function deletes the member's photo files (service role), deletes the
--     account with Supabase Auth's admin API (every row the member owns
--     cascades, as when members delete their own account), only then emails
--     the member, and records it with public.admin_record_member_delete (service role
--     only) in private.moderation_action as 'delete_member', like our
--     team's other decisions: the reason in plain words, whether the email
--     went out and the admin's note. Of the deleted account the record keeps
--     only its id; the records of earlier decisions about the member stay,
--     no longer linked to them (private.forget_moderation_target).
--   * Called with no member, public.admin_check_member_delete only answers
--     whether this update is in (the admin panel asks before it offers the
--     form), and counts nothing.
-- Needs the earlier migrations (up to 20261031000000_public_previews.sql).
-- Can be run again: it replaces the two functions and adds 'delete_member'
-- to the list of actions only if it isn't there.
-- Existing rows: none change. private.moderation_action accepts one more
-- action ('delete_member'); the list is rebuilt from the one the database
-- has, so every earlier action stays allowed.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.public_preview(text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Run the public previews update (20261031000000_public_previews.sql) first.';
  END IF;
END;
$$;

-- ============================================================================
-- THE RECORD OF OUR DECISIONS: 'delete_member'
-- ============================================================================

-- private.moderation_action's list of actions as the database has it now
-- (pg_get_constraintdef), plus 'delete_member'. Nothing to do if it's there
-- already, or if the table has no such list.
DO $$
DECLARE
  def TEXT;
  vals TEXT[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def
  FROM pg_constraint c
  WHERE c.conrelid = 'private.moderation_action'::regclass AND c.contype = 'c'
    AND c.conname = 'moderation_action_action_check';
  SELECT array_agg(replace(x.m[1], '''''', '''') ORDER BY x.n) INTO vals
  FROM regexp_matches(COALESCE(def, ''), '''((?:[^'']|'''')*)''::text', 'g') WITH ORDINALITY AS x(m, n);
  IF vals IS NULL OR 'delete_member' = ANY (vals) THEN
    RETURN;
  END IF;
  ALTER TABLE private.moderation_action DROP CONSTRAINT moderation_action_action_check;
  EXECUTE format('ALTER TABLE private.moderation_action ADD CONSTRAINT moderation_action_action_check CHECK (action IN (%s))',
    (SELECT string_agg(quote_literal(u.v), ', ' ORDER BY u.n)
     FROM unnest(vals || 'delete_member'::TEXT) WITH ORDINALITY AS u(v, n)));
END;
$$;

-- ============================================================================
-- DELETING A MEMBER'S ACCOUNT
-- ============================================================================

-- Before the Edge Function admin-delete-member deletes an account (called as
-- the admin). p_reason: 'member_request' or 'blocked_account' (only for a
-- blocked account). Refused unless the caller is an admin, and for their
-- own account and any account in public.admins; 10 a minute and 50 a day
-- (a refused request isn't counted). Returns { member, actor, reason,
-- email (the sign-in address, for the email to the member), first_name,
-- blocked, blocked_at (profile_private.blocked_at, set by
-- public.admin_moderate; for a block from before 21 October 2026, when the
-- record of declined and blocked accounts noted it), blocked_on (that day,
-- "21 October 2026") and appeal_until (the last day the member can still
-- challenge the block, 6 months after it; null once that has passed) }.
-- p_member NULL: { ready: true }, nothing else checked or counted.
CREATE OR REPLACE FUNCTION public.admin_check_member_delete(p_member UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := (SELECT auth.uid());
  pp public.profile_private;
  v_name TEXT;
  v_email TEXT;
  since TIMESTAMPTZ;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_member IS NULL THEN
    RETURN jsonb_build_object('ready', TRUE);
  END IF;
  SELECT * INTO pp FROM public.profile_private x WHERE x.id = p_member;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found.' USING ERRCODE = 'P0002';
  END IF;
  IF p_member = me THEN
    RAISE EXCEPTION 'That''s your own account. You can delete it in NRIClub, under Settings.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = p_member) THEN
    RAISE EXCEPTION 'This is an admin''s account, so it can''t be deleted here.' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('member_request', 'blocked_account') THEN
    RAISE EXCEPTION 'Choose why the account is deleted.' USING ERRCODE = 'P0001';
  END IF;
  IF p_reason = 'blocked_account' AND pp.status <> 'blocked' THEN
    RAISE EXCEPTION 'This account isn''t blocked.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM private.take_rate('delete_member', ARRAY['10', '1 minute', '50', '1 day']);
  IF pp.status = 'blocked' THEN
    since := COALESCE(pp.blocked_at, (SELECT max(r.created_at) FROM private.moderation_record r
                                      WHERE r.member_id = p_member AND r.decision = 'blocked'));
  END IF;
  SELECT p.name INTO v_name FROM public.profiles p WHERE p.id = p_member;
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_member;
  RETURN jsonb_build_object(
    'member', p_member, 'actor', me, 'reason', p_reason,
    'email', COALESCE(NULLIF(btrim(v_email), ''), NULLIF(btrim(pp.email), '')),
    'first_name', split_part(btrim(COALESCE(v_name, '')), ' ', 1),
    'blocked', pp.status = 'blocked',
    'blocked_at', since,
    'blocked_on', private.long_date(since),
    'appeal_until', CASE WHEN since + INTERVAL '6 months' > NOW() THEN private.long_date(since + INTERVAL '6 months') END);
END;
$$;

-- After the Edge Function deleted the account (service role only): records
-- it like our team's other decisions, as 'delete_member' about the member
-- (target_kind 'member', target_id the account's id). p_actor must be an
-- admin; the account must be gone. The explanation is the reason in plain
-- words, whether the email to the member went out (p_emailed) and the
-- admin's note (p_note, at most 500 characters). Nothing else of the
-- deleted account is kept: not its name or email address, only its id.
CREATE OR REPLACE FUNCTION public.admin_record_member_delete(p_actor UUID, p_member UUID, p_reason TEXT, p_note TEXT,
  p_emailed BOOLEAN)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_note TEXT := btrim(regexp_replace(COALESCE(p_note, ''), '\s+', ' ', 'g'));
  action_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = p_actor) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('member_request', 'blocked_account') THEN
    RAISE EXCEPTION 'Unknown reason: %', p_reason USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Keep the note to 500 characters.' USING ERRCODE = 'P0001';
  END IF;
  IF p_member IS NULL OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_member) THEN
    RAISE EXCEPTION 'This account hasn''t been deleted.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO private.moderation_action (actor_id, action, target_kind, target_id, explanation, source)
  VALUES (p_actor, 'delete_member', 'member', p_member,
    CASE p_reason WHEN 'member_request' THEN 'Account deleted because the member asked us to (Art. 17 GDPR)'
                  ELSE 'Blocked account deleted' END
      || CASE WHEN p_emailed THEN '; the member was emailed' ELSE '; the email to the member couldn''t be sent' END
      || CASE WHEN v_note <> '' THEN '. Note: ' || v_note ELSE '' END,
    'own_initiative')
  RETURNING id INTO action_id;
  RETURN action_id;
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- The check is for admins (it checks private.is_admin() itself; members get
-- "Admins only"). Only the Edge Function, with the service role, records a
-- deletion.
REVOKE ALL ON FUNCTION public.admin_check_member_delete(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_check_member_delete(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_record_member_delete(UUID, UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_member_delete(UUID, UUID, TEXT, TEXT, BOOLEAN) TO service_role;
