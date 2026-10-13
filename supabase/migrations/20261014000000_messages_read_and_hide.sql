-- ============================================================================
-- NRIclub: unread messages and "Delete conversation" (2026-10-14)
--
--   * A member can mark the messages they received in a conversation as read
--     (public.mark_conversation_read), so the site can count unread messages.
--   * A member can hide a conversation from their own list
--     (public.conversation_hides). The other member keeps it; if a new
--     message arrives, it comes back with only the messages after that.
-- Nothing else changes, and no rows are changed.
-- ============================================================================

CREATE TABLE public.conversation_hides (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, conversation_id)
);
ALTER TABLE public.conversation_hides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversation_hides FROM anon;

-- Only your own rows, and only for conversations you are in.
CREATE POLICY "Members hide their own conversations" ON public.conversation_hides
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id AND (SELECT auth.uid()) IN (c.participant_1, c.participant_2)));

-- The time it was hidden comes from the server clock.
CREATE FUNCTION private.stamp_hidden_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.hidden_at := NOW();
  RETURN NEW;
END;
$$;
CREATE TRIGGER stamp_hidden_at BEFORE INSERT OR UPDATE ON public.conversation_hides
  FOR EACH ROW EXECUTE FUNCTION private.stamp_hidden_at();

-- Marks the messages the signed-in member received in a conversation as read.
CREATE FUNCTION public.mark_conversation_read(p_conversation UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.messages m SET read = TRUE
  WHERE m.conversation_id = p_conversation AND NOT m.read AND m.sender_id <> (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.conversations c
                WHERE c.id = p_conversation AND (SELECT auth.uid()) IN (c.participant_1, c.participant_2));
$$;

REVOKE ALL ON FUNCTION private.stamp_hidden_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.stamp_hidden_at() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_conversation_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID) TO authenticated;
