-- ============================================================================
-- NRIclub: reporting, moderation and the record of what our team did
-- (2026-10-21)
--
--   * Anyone, signed in or not, can report content they believe is illegal
--     on the public page nriclub.app/report (public.submit_notice). The
--     report is kept in private.notices with a short reference code; at most
--     5 a day from one email address and 10 a day from one internet address
--     (kept only as a coded form, for a day), and 100 a day in all. Every
--     admin gets an in-app notice. NRIClub sends no emails from the app: our
--     team writes to the sender from hello@nriclub.app (receipt, then the
--     decision), and the admin panel records when (C6a).
--   * Reports from members: what was reported (reports.content_type, so
--     comments, answers, guide comments, places and messages can be reported
--     too), the reason (reports.category, one of the two groups on the
--     report form), the member's explanation and their good-faith
--     confirmation. A member has one open report per item. A report stays
--     when the member who sent it deletes their account (no longer linked to
--     them); feedback (bug reports and ideas) goes with the account (C6b).
--   * A report about a threat to someone's life or safety tells every admin
--     at once (C27). Our team's notes on a report (e.g. which police
--     authority they told, and when) are kept with it, for admins only.
--   * Everything our team does to members' content and accounts goes through
--     the database, which keeps a record of it (private.moderation_action:
--     who, what, the rule or law, the facts, whether a report led to it, and
--     a copy of what was removed): removing content of every kind, removing
--     a profile photo or bio, warning, blocking and unblocking a member
--     (public.admin_moderate), closing reports without action
--     (public.admin_close_reports), communities and ambassadors. The member
--     concerned gets a statement of reasons in the app, with how to
--     challenge it; whoever reported it gets the outcome (C7, Art. 16(5)
--     and 17 DSA).
--   * A warning with 14 days to reply comes before a block. A block straight
--     away needs a serious reason (threats, violence, fraud, clearly illegal
--     content or danger to someone), which is recorded. The reason for a
--     block is kept with the account (profile_private.block_reason,
--     block_rule, blocked_at) so the blocked member sees it. Admins can't
--     act on their own account or content, or on another admin's (C7, C4).
--   * Admins change members only through these functions: the admin
--     exemption from the profile and private-profile policies, from the
--     content and community policies and from private.protect_columns is
--     gone (C23).
--   * Mentoring: rejecting a mentor cancels their booked sessions, as
--     blocking does, and the members who booked are told (C24).
--   * Members see only active, verified ambassadors
--     (public.city_ambassadors, C26).
--   * Clean-up: closed notices go after 12 months; the copy of removed
--     content in the record after 6 months, the record itself after 24
--     months (private.daily_cleanup). "Download my data" also has what our
--     team did about the member.
-- Needs all earlier migrations (up to 20261020000000_notifications_limits_privacy.sql).
-- Existing rows: reports get a content_type from their "[TYPE]" prefix; when
-- a member has two open reports about the same item, the later is closed as
-- a duplicate (with a note).
-- ============================================================================

-- ============================================================================
-- NOTIFICATION TYPES
-- ============================================================================

-- 'moderation': a statement of reasons to the member concerned; 'report':
-- the outcome of a report, to whoever sent it; 'alert': to admins, about a
-- new notice or a safety report.
ALTER TABLE public.notifications
  DROP CONSTRAINT notifications_type_check,
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'like', 'comment', 'request', 'event', 'group', 'trending', 'message', 'verification',
    'answer', 'thanks', 'best', 'rsvp', 'urgent', 'member',
    'booking', 'booking_cancelled', 'review',
    'moderation', 'report', 'alert')),
  -- A statement of reasons can be long (the law or rule, the facts, then
  -- how to challenge it): up to 2,000 characters, as kept in the record, so
  -- the end of it (how to reply and challenge it) is never cut off.
  DROP CONSTRAINT notifications_text_check,
  ADD CONSTRAINT notifications_text_check CHECK (char_length(text) <= 2000);

-- ============================================================================
-- WORDS (in step with src/content/legal/reporting.js)
-- ============================================================================

-- The reasons someone can give for a report (the report form's two groups:
-- illegal, and against our rules), by key.
CREATE FUNCTION private.report_categories()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY['safety', 'violence', 'hate', 'defamation', 'private_images', 'copyright', 'fraud', 'child_abuse',
               'illegal_other', 'spam', 'harassment', 'fake_profile', 'fake_reviews', 'market_rules', 'other']::TEXT[];
$$;

-- What a member's thing is called in a message to them.
CREATE FUNCTION private.content_noun(p_kind TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_kind
    WHEN 'post' THEN 'post' WHEN 'comment' THEN 'comment' WHEN 'answer' THEN 'answer'
    WHEN 'doc' THEN 'guide' WHEN 'doc_comment' THEN 'comment on a guide' WHEN 'event' THEN 'event'
    WHEN 'help' THEN 'question' WHEN 'market' THEN 'Market listing' WHEN 'review' THEN 'mentoring review'
    WHEN 'place' THEN 'place' WHEN 'place_recommendation' THEN 'recommendation' WHEN 'message' THEN 'message'
    WHEN 'profile_photo' THEN 'profile photo' WHEN 'profile_bio' THEN 'profile bio' WHEN 'profile' THEN 'profile'
    ELSE 'content' END;
$$;

-- "21 October 2026", German time.
CREATE FUNCTION private.long_date(p_at TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT to_char(p_at AT TIME ZONE 'Europe/Berlin', 'FMDD FMMonth YYYY');
$$;

-- How to challenge a decision (REDRESS_LINE in reporting.js).
CREATE FUNCTION private.redress_line()
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT 'Think we got it wrong? Write to hello@nriclub.app within 6 months, and a person on our team will look at it again. You can also go to court.'::TEXT;
$$;

-- The serious cases in which we block straight away (Terms of Use,
-- section 10), by key.
CREATE FUNCTION private.urgent_label(p_urgent TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_urgent WHEN 'threat' THEN 'threats' WHEN 'violence' THEN 'violence' WHEN 'fraud' THEN 'fraud'
    WHEN 'illegal' THEN 'clearly illegal content' WHEN 'danger' THEN 'danger to someone' END;
$$;

-- The statement of reasons to the member concerned (Art. 17 DSA), as
-- statementOfReasons() in reporting.js writes it. p_action: 'removed',
-- 'warning', 'blocked' or 'unblocked'. p_what: e.g. 'your post "Room in
-- Kreuzberg"'. p_ground: 'illegal' (p_rule then names the law) or 'terms'
-- (p_rule: the rule in the Terms of Use). p_facts: what it said or did,
-- finishing "because ...". p_source: 'report', 'notice' or 'own_initiative'.
-- p_urgent: why a block came without a warning first. p_sessions: mentoring
-- sessions the block cancelled.
CREATE FUNCTION private.statement_of_reasons(p_action TEXT, p_what TEXT, p_ground TEXT, p_rule TEXT, p_facts TEXT,
  p_source TEXT, p_urgent TEXT DEFAULT NULL, p_sessions INTEGER DEFAULT 0, p_at TIMESTAMPTZ DEFAULT NOW())
RETURNS TEXT LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_action = 'unblocked'
    THEN 'We unblocked your account on ' || private.long_date(p_at) || '. You can use NRIClub again.'
    ELSE concat_ws(' ',
      CASE p_action
        WHEN 'removed' THEN 'We removed ' || p_what || ' on ' || private.long_date(p_at) || '.'
        WHEN 'warning' THEN 'We''re writing about ' || p_what || '. Please read this warning.'
        WHEN 'blocked' THEN 'We blocked your account on ' || private.long_date(p_at) || ', until further notice.'
      END,
      CASE WHEN p_ground = 'illegal'
        THEN 'Reason: we believe it is illegal under ' || p_rule || ', because ' || p_facts || '.'
        ELSE 'Reason: it breaks our Terms of Use, ' || p_rule || ', because ' || p_facts || '.' END,
      CASE WHEN p_action = 'blocked' AND p_urgent IS NOT NULL
        THEN 'Because this is a serious case (' || private.urgent_label(p_urgent) || '), we blocked your account straight away, without a warning first.' END,
      CASE WHEN p_source IN ('report', 'notice') THEN 'This followed a report from someone else.'
        ELSE 'This followed our own check.' END,
      'No automated tools were used: a person on our team decided.',
      CASE WHEN p_action = 'warning'
        THEN 'If this happens again we may block your account. Please reply to hello@nriclub.app within 14 days if you want to tell us your side.' END,
      CASE WHEN p_action = 'blocked' AND p_sessions > 0
        THEN CASE WHEN p_sessions = 1 THEN 'Your booked mentoring session was cancelled, and the member who booked it was told.'
                  ELSE 'Your ' || p_sessions || ' booked mentoring sessions were cancelled, and the members who booked them were told.' END END,
      private.redress_line(),
      CASE WHEN p_action = 'blocked' THEN 'You can still sign in to download your data and delete your account.' END)
    END;
$$;

-- The outcome of a report, to whoever sent it (Art. 16(5) DSA), as
-- reporterOutcome() in reporting.js writes it. p_item: e.g. 'the post
-- "Room in Kreuzberg"'. p_outcome: 'removed', 'blocked', 'warned', 'kept'
-- or 'gone'. p_reason finishes "because ...".
CREATE FUNCTION private.report_outcome(p_item TEXT, p_outcome TEXT, p_reason TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT 'We looked at your report about ' || p_item || ': '
    || CASE p_outcome
         WHEN 'removed' THEN 'we removed it because ' || p_reason || '.'
         WHEN 'blocked' THEN 'we blocked the account because ' || p_reason || '.'
         WHEN 'warned' THEN 'we warned the member because ' || p_reason || ', and didn''t remove anything.'
         WHEN 'gone' THEN 'it''s no longer on NRIClub (' || p_reason || ').'
         ELSE 'we kept it because ' || p_reason || '.' END
    || ' ' || private.redress_line();
$$;

-- A member's sentence for "because ...": trimmed, without a full stop at
-- the end (the message adds one).
CREATE FUNCTION private.facts(p_text TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT regexp_replace(btrim(regexp_replace(COALESCE(p_text, ''), '\s+', ' ', 'g')), '[.!\s]+$', '');
$$;

-- Sends a message from our team (a statement of reasons or a report's
-- outcome) to one member. Unlike private.notify, also to members who can't
-- take part (the law says they must be told) and every time.
CREATE FUNCTION private.tell_member(p_user UUID, p_type TEXT, p_text TEXT, p_ref UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.notifications (user_id, type, text, reference_id)
  SELECT p_user, p_type, LEFT(p_text, 2000), p_ref
  WHERE p_user IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user);
$$;

-- Tells every admin whose account is active (a new notice, a safety
-- report). In-app only: NRIClub sends no notification emails.
CREATE FUNCTION private.alert_admins(p_text TEXT, p_ref UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.notifications (user_id, type, text, reference_id)
  SELECT a.user_id, 'alert', LEFT(p_text, 1000), p_ref
  FROM public.admins a JOIN public.profile_private pp ON pp.id = a.user_id
  WHERE pp.status = 'active';
$$;

-- ============================================================================
-- REPORTS FROM MEMBERS (C6b, C27)
-- ============================================================================

-- content_type: what was reported; reported_post_id holds its id (a member
-- for 'profile': reported_user_id), and reported_user_id the member who
-- wrote it. 'feedback' is a bug report or an idea. category: the reason
-- (private.report_categories); explanation and good_faith: the member's
-- words and their confirmation. All four are empty on reports from before.
ALTER TABLE public.reports
  ADD COLUMN content_type TEXT CHECK (content_type IN (
    'post', 'comment', 'answer', 'doc', 'doc_comment', 'event', 'help', 'market', 'review', 'place', 'message',
    'profile', 'feedback')),
  ADD COLUMN category TEXT CHECK (category = ANY (private.report_categories())),
  ADD COLUMN explanation TEXT NOT NULL DEFAULT '' CHECK (char_length(explanation) <= 1000),
  ADD COLUMN good_faith BOOLEAN NOT NULL DEFAULT FALSE,
  -- A report with a reason (the current form) explains it and confirms good faith.
  ADD CONSTRAINT reports_reason_given CHECK (
    category IS NULL OR content_type = 'feedback'
    OR (char_length(btrim(explanation)) BETWEEN 10 AND 1000 AND good_faith));

-- A report stays when the member who sent it deletes their account, no
-- longer linked to them (a notice must be dealt with all the same).
ALTER TABLE public.reports
  ALTER COLUMN reporter_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS reports_reporter_id_fkey,
  ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX idx_reports_target ON public.reports (reported_post_id);

-- The kind from the "[TYPE]" prefix the site wrote before (and still
-- writes, for a database without content_type).
CREATE FUNCTION private.report_kind_from_reason(p_reason TEXT, p_post UUID, p_user UUID)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_reason LIKE '[BUG]%' OR p_reason LIKE '[IDEA]%' THEN 'feedback'
    WHEN upper(p_reason) LIKE '[MARKETPLACE]%' OR upper(p_reason) LIKE '[MARKET]%' THEN 'market'
    WHEN upper(p_reason) LIKE '[DOC_COMMENT]%' THEN 'doc_comment'
    WHEN upper(p_reason) LIKE '[DOC]%' THEN 'doc'
    WHEN upper(p_reason) LIKE '[EVENT]%' THEN 'event'
    WHEN upper(p_reason) LIKE '[HELP]%' THEN 'help'
    WHEN upper(p_reason) LIKE '[REVIEW]%' THEN 'review'
    WHEN upper(p_reason) LIKE '[COMMENT]%' THEN 'comment'
    WHEN upper(p_reason) LIKE '[ANSWER]%' THEN 'answer'
    WHEN upper(p_reason) LIKE '[PLACE]%' THEN 'place'
    WHEN upper(p_reason) LIKE '[MESSAGE]%' THEN 'message'
    WHEN upper(p_reason) LIKE '[USER]%' OR upper(p_reason) LIKE '[PROFILE]%' THEN 'profile'
    WHEN upper(p_reason) LIKE '[POST]%' THEN 'post'
    WHEN p_user IS NOT NULL AND p_post IS NULL THEN 'profile'
    ELSE 'post' END;
$$;

-- Who wrote a reported item (NULL if it's gone or nobody did).
CREATE FUNCTION private.content_author(p_kind TEXT, p_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE p_kind
    WHEN 'post' THEN (SELECT x.user_id FROM public.posts x WHERE x.id = p_id)
    WHEN 'comment' THEN (SELECT x.user_id FROM public.comments x WHERE x.id = p_id)
    WHEN 'answer' THEN (SELECT x.user_id FROM public.help_responses x WHERE x.id = p_id)
    WHEN 'doc' THEN (SELECT x.user_id FROM public.docs x WHERE x.id = p_id)
    WHEN 'doc_comment' THEN (SELECT x.user_id FROM public.doc_comments x WHERE x.id = p_id)
    WHEN 'event' THEN (SELECT x.organizer_id FROM public.events x WHERE x.id = p_id)
    WHEN 'help' THEN (SELECT x.user_id FROM public.help_requests x WHERE x.id = p_id)
    WHEN 'market' THEN (SELECT x.user_id FROM public.marketplace x WHERE x.id = p_id)
    WHEN 'review' THEN (SELECT x.mentee_id FROM public.mentor_reviews x WHERE x.id = p_id)
    WHEN 'place' THEN (SELECT x.created_by FROM public.places x WHERE x.id = p_id)
    WHEN 'message' THEN (SELECT x.sender_id FROM public.messages x WHERE x.id = p_id)
  END;
$$;

-- A new report: its kind (from the prefix, for pages from before), and for
-- content the member who wrote it, looked up rather than taken from the
-- request. A message can only be reported by the member it was sent to.
-- Feedback is what the "[BUG]" / "[IDEA]" prefix says, whatever the request
-- says, as for who may send it (members waiting for review may send
-- feedback only), the limits and the admin panel: no other report can pass
-- as feedback, nor feedback as a report (or as a safety report). (Named to
-- run before the other triggers on reports.)
CREATE FUNCTION private.fill_report_details()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.reason LIKE '[BUG]%' OR NEW.reason LIKE '[IDEA]%' THEN
    NEW.content_type := 'feedback';
    NEW.category := NULL;
  ELSE
    NEW.content_type := COALESCE(NULLIF(NEW.content_type, 'feedback'),
      private.report_kind_from_reason(NEW.reason, NEW.reported_post_id, NEW.reported_user_id));
  END IF;
  NEW.explanation := btrim(COALESCE(NEW.explanation, ''));
  IF NEW.content_type = 'profile' THEN
    NEW.reported_post_id := NULL;
    IF NEW.reported_user_id IS NULL THEN
      RAISE EXCEPTION 'Say which member you''re reporting.' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.content_type <> 'feedback' THEN
    IF NEW.reported_post_id IS NULL THEN
      RAISE EXCEPTION 'Say what you''re reporting.' USING ERRCODE = '23514';
    END IF;
    NEW.reported_user_id := private.content_author(NEW.content_type, NEW.reported_post_id);
    IF NEW.content_type = 'message' AND (SELECT auth.uid()) IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id
      WHERE m.id = NEW.reported_post_id AND m.sender_id <> (SELECT auth.uid())
        AND (SELECT auth.uid()) IN (c.participant_1, c.participant_2)) THEN
      RAISE EXCEPTION 'You can only report messages sent to you.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER fill_report_details BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION private.fill_report_details();

-- As in 2026-10-20, by kind: the same report again from the same member
-- while the first still waits (the same item; feedback with the same text)
-- is kept once.
CREATE OR REPLACE FUNCTION private.ignore_duplicate_report()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.reporter_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.reporter_id = NEW.reporter_id AND r.status = 'pending'
      AND r.content_type IS NOT DISTINCT FROM NEW.content_type
      AND CASE WHEN NEW.content_type = 'feedback' THEN r.reason = NEW.reason
               WHEN NEW.content_type = 'profile' THEN r.reported_user_id = NEW.reported_user_id
               ELSE r.reported_post_id = NEW.reported_post_id END
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- A threat to someone's life or safety: every admin is told at once (Art.
-- 18 DSA asks us to tell the police without delay where a crime is likely).
CREATE FUNCTION private.alert_safety_report()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.alert_admins(
    'Safety report: a member reported a threat to someone''s life or safety. Please look at it now in the admin panel (Reports).',
    NEW.id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER alert_safety_report AFTER INSERT ON public.reports
  FOR EACH ROW WHEN (NEW.category = 'safety') EXECUTE FUNCTION private.alert_safety_report();

-- Feedback (bug reports and ideas) goes with the account of the member who
-- sent it; reports about members and content stay (above).
CREATE FUNCTION private.forget_feedback()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.reports r WHERE r.reporter_id = OLD.id AND r.content_type = 'feedback';
  RETURN OLD;
END;
$$;
CREATE TRIGGER forget_feedback BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.forget_feedback();

-- Our team's notes on a report (e.g. "Told the BKA on 21 Oct, case 123"),
-- for admins only; deleted with the report.
CREATE TABLE private.report_note (
  report_id UUID PRIMARY KEY REFERENCES public.reports(id) ON DELETE CASCADE,
  note TEXT NOT NULL CHECK (char_length(note) <= 2000),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE private.report_note ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.report_note FROM PUBLIC, anon, authenticated;

-- Admins change reports only through the functions below (closing,
-- opening again, notes), so every decision is recorded and the people
-- concerned are told; feedback they still mark done by hand. Reports are
-- never deleted by hand (private.daily_cleanup deletes old ones).
DROP POLICY "Admins can update reports" ON public.reports;
CREATE POLICY "Admins can mark feedback done" ON public.reports
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin()) AND content_type = 'feedback')
  WITH CHECK ((SELECT private.is_admin()) AND content_type = 'feedback');
DROP POLICY "Admins can delete reports" ON public.reports;

-- ============================================================================
-- NOTICES FROM ANYONE: nriclub.app/report (C6a)
-- ============================================================================

-- Reports of illegal content sent on the public page, by anyone (Art. 16
-- DSA). reference: the code the sender sees and quotes. name and email may
-- be empty only for a report about the sexual abuse of a child (Art.
-- 16(2)(c)). status: 'open' until our team has decided. decision: what we
-- did ('removed', 'blocked', 'warned', 'kept', or 'gone': it was no longer
-- there, e.g. removed after a member's report of it), decision_reason
-- finishing "because ..." ('gone': what happened). receipt_sent_at /
-- decision_sent_at: when our team emailed the sender the receipt and the
-- decision from hello@nriclub.app (the app sends no email). hold_reason:
-- set by hand in the SQL editor while a legal dispute or police matter
-- about it is open (private.daily_cleanup then keeps it).
CREATE TABLE private.notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  location TEXT NOT NULL CHECK (char_length(location) BETWEEN 1 AND 1000),
  category TEXT NOT NULL CHECK (category = ANY (private.report_categories())),
  explanation TEXT NOT NULL CHECK (char_length(explanation) BETWEEN 10 AND 2000),
  name TEXT NOT NULL DEFAULT '' CHECK (char_length(name) <= 200),
  email TEXT NOT NULL DEFAULT '' CHECK (char_length(email) <= 254),
  good_faith BOOLEAN NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  decision TEXT NOT NULL DEFAULT '' CHECK (decision IN ('', 'removed', 'blocked', 'warned', 'kept', 'gone')),
  decision_reason TEXT NOT NULL DEFAULT '' CHECK (char_length(decision_reason) <= 1000),
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  receipt_sent_at TIMESTAMPTZ,
  decision_sent_at TIMESTAMPTZ,
  admin_note TEXT NOT NULL DEFAULT '' CHECK (char_length(admin_note) <= 2000),
  hold_reason TEXT NOT NULL DEFAULT '' CHECK (char_length(hold_reason) <= 500)
);
CREATE INDEX idx_notices_open ON private.notices (status, created_at);
CREATE INDEX idx_notices_created ON private.notices (created_at);
ALTER TABLE private.notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.notices FROM PUBLIC, anon, authenticated;

-- Notices sent per email address and per internet address, for the daily
-- limits: a keyed hash only (never the address), deleted after a day.
CREATE TABLE private.notice_log (
  key TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notice_log ON private.notice_log (key, at);
ALTER TABLE private.notice_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.notice_log FROM PUBLIC, anon, authenticated;

-- A keyed hash for the limits (the moderation records' secret key).
CREATE FUNCTION private.limit_key(p_kind TEXT, p_value TEXT)
RETURNS TEXT LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT encode(sha256(convert_to(c.value || ':' || p_kind || ':' || p_value, 'UTF8')), 'hex')
  FROM private.app_config c WHERE c.key = 'moderation_salt';
$$;

-- A report from the public page. Returns its reference code (e.g.
-- "R-7F3A92C1"). The sender's internet address: the one Cloudflare passes
-- on (CF-Connecting-IP), else the first one in X-Forwarded-For, which
-- Supabase's gateway sets; an IPv6 address counts by its /64 network (one
-- connection usually has a whole /64 to choose from). Since those headers
-- can't be fully trusted, at most 100 reports a day are taken in all; after
-- that the page points to email.
CREATE FUNCTION public.submit_notice(p_location TEXT, p_category TEXT, p_explanation TEXT,
  p_name TEXT DEFAULT '', p_email TEXT DEFAULT '', p_good_faith BOOLEAN DEFAULT FALSE)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_location TEXT := btrim(COALESCE(p_location, ''));
  v_explanation TEXT := btrim(COALESCE(p_explanation, ''));
  v_name TEXT := btrim(regexp_replace(COALESCE(p_name, ''), '\s+', ' ', 'g'));
  v_email TEXT := lower(btrim(COALESCE(p_email, '')));
  headers JSON := NULLIF(current_setting('request.headers', TRUE), '')::json;
  v_ip TEXT := LEFT(btrim(COALESCE(NULLIF(headers ->> 'cf-connecting-ip', ''),
    split_part(COALESCE(headers ->> 'x-forwarded-for', ''), ',', 1))), 100);
  v_net INET;
  email_key TEXT;
  ip_key TEXT;
  v_ref TEXT;
  v_id UUID;
BEGIN
  IF v_location = '' THEN
    RAISE EXCEPTION 'Please tell us where the content is.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_location) > 1000 THEN
    RAISE EXCEPTION 'Please keep "where" to 1,000 characters.' USING ERRCODE = 'P0001';
  END IF;
  IF p_category IS NULL OR NOT (p_category = ANY (private.report_categories())) THEN
    RAISE EXCEPTION 'Please choose what the problem is.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_explanation) < 10 THEN
    RAISE EXCEPTION 'Please explain in a sentence or two why the content is illegal.' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_explanation) > 2000 THEN
    RAISE EXCEPTION 'Please keep your explanation to 2,000 characters.' USING ERRCODE = 'P0001';
  END IF;
  IF p_category <> 'child_abuse' AND (v_name = '' OR v_email = '') THEN
    RAISE EXCEPTION 'Please give your name and email address, so we can tell you what we decided.' USING ERRCODE = 'P0001';
  END IF;
  -- (No characters that mean something in a mailto: link, such as ? & # %,
  -- in the address our team replies to.)
  IF char_length(v_name) > 200 OR char_length(v_email) > 254
     OR (v_email <> '' AND v_email !~ '^[^@[:space:]?&#%,;:<>()"\\/]+@[^@[:space:]?&#%,;:<>()"\\/]+\.[^@[:space:]?&#%,;:<>()"\\/]+$') THEN
    RAISE EXCEPTION 'Please check your name and email address.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT COALESCE(p_good_faith, FALSE) THEN
    RAISE EXCEPTION 'Please confirm that your report is accurate and made in good faith.' USING ERRCODE = 'P0001';
  END IF;

  -- The limits: 5 a day from one email address, 10 a day from one internet
  -- address (an IPv6 one by its /64), 100 a day in all. Two reports sent at
  -- the same moment are counted one by one.
  IF v_email <> '' THEN
    email_key := private.limit_key('notice-email', private.canonical_email(v_email));
  END IF;
  IF v_ip <> '' THEN
    BEGIN
      v_net := v_ip::inet;
      v_ip := CASE WHEN family(v_net) = 6 THEN network(set_masklen(v_net, 64))::TEXT ELSE host(v_net) END;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL; -- not an address: counted as it is
    END;
    ip_key := private.limit_key('notice-ip', v_ip);
  END IF;
  IF email_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('nriclub-notice:' || email_key));
  END IF;
  IF ip_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('nriclub-notice:' || ip_key));
  END IF;
  IF (email_key IS NOT NULL AND (SELECT count(*) FROM private.notice_log l
                                 WHERE l.key = email_key AND l.at > NOW() - INTERVAL '1 day') >= 5)
     OR (ip_key IS NOT NULL AND (SELECT count(*) FROM private.notice_log l
                                 WHERE l.key = ip_key AND l.at > NOW() - INTERVAL '1 day') >= 10) THEN
    RAISE EXCEPTION 'You''ve sent several reports today. Please try again tomorrow, or write to hello@nriclub.app.'
      USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(*) FROM private.notices n WHERE n.created_at > NOW() - INTERVAL '1 day') >= 100 THEN
    RAISE EXCEPTION 'We''ve received a lot of reports today. Please write to hello@nriclub.app instead, and a person on our team will look at it.'
      USING ERRCODE = 'P0001';
  END IF;

  LOOP
    v_ref := 'R-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM private.notices n WHERE n.reference = v_ref);
  END LOOP;
  INSERT INTO private.notices (reference, location, category, explanation, name, email, good_faith)
  VALUES (v_ref, v_location, p_category, v_explanation, v_name, v_email, TRUE)
  RETURNING id INTO v_id;
  INSERT INTO private.notice_log (key)
  SELECT k FROM unnest(ARRAY[email_key, ip_key]) k WHERE k IS NOT NULL;
  PERFORM private.alert_admins(CASE WHEN p_category = 'safety'
    THEN 'Safety report ' || v_ref || ' from the public report page: a threat to someone''s life or safety. Please look at it now in the admin panel (Reports).'
    ELSE 'New report of illegal content ' || v_ref || ' from the public report page. Please look at it in the admin panel (Reports) and confirm receipt to the sender.' END,
    v_id);
  RETURN v_ref;
END;
$$;

-- ============================================================================
-- THE RECORD OF WHAT OUR TEAM DID (C7)
-- ============================================================================

-- Every decision our team takes on members' content and accounts. actor_id:
-- the admin. action: 'remove', 'warn', 'block', 'unblock' (statements of
-- reasons go out for these), 'dismiss' and 'reopen' (reports),
-- 'group_approve', 'group_unapprove', 'group_reject', 'group_delete',
-- 'ambassador'. target_kind and target_id: what it was about; target_user:
-- the member concerned (removed when their account is deleted). ground
-- ('illegal' or 'terms'), rule (the law or the rule in the Terms) and
-- explanation (the facts): the reasons. urgent: why a block came without a
-- warning first. source: 'notice', 'report' or 'own_initiative'.
-- snapshot: a copy of what was removed (its text and the paths of its photo
-- files), kept for 6 months. statement: the message the member got.
CREATE TABLE private.moderation_action (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('remove', 'warn', 'block', 'unblock', 'dismiss', 'reopen',
    'group_approve', 'group_unapprove', 'group_reject', 'group_delete', 'ambassador')),
  target_kind TEXT NOT NULL CHECK (char_length(target_kind) <= 40),
  target_id UUID,
  target_user UUID,
  ground TEXT CHECK (ground IN ('illegal', 'terms')),
  rule TEXT NOT NULL DEFAULT '' CHECK (char_length(rule) <= 300),
  explanation TEXT NOT NULL DEFAULT '' CHECK (char_length(explanation) <= 1000),
  urgent TEXT CHECK (urgent IN ('threat', 'violence', 'fraud', 'illegal', 'danger')),
  source TEXT NOT NULL CHECK (source IN ('notice', 'report', 'own_initiative')),
  report_ids UUID[] NOT NULL DEFAULT '{}',
  notice_id UUID,
  snapshot JSONB,
  statement TEXT NOT NULL DEFAULT '' CHECK (char_length(statement) <= 2000)
);
CREATE INDEX idx_moderation_action_user ON private.moderation_action (target_user, created_at);
CREATE INDEX idx_moderation_action_created ON private.moderation_action (created_at);
ALTER TABLE private.moderation_action ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.moderation_action FROM PUBLIC, anon, authenticated;

-- A deleted account's records stay, no longer linked to it.
CREATE FUNCTION private.forget_moderation_target()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE private.moderation_action SET target_user = NULL WHERE target_user = OLD.id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER forget_moderation_target AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.forget_moderation_target();

-- Why a member is blocked, for the screen they see (and when): the facts
-- (block_reason) and the rule or law (block_rule), as in the statement of
-- reasons. Set and cleared by admin_moderate only.
ALTER TABLE public.profile_private
  ADD COLUMN block_reason TEXT NOT NULL DEFAULT '' CHECK (char_length(block_reason) <= 1000),
  ADD COLUMN block_rule TEXT NOT NULL DEFAULT '' CHECK (char_length(block_rule) <= 300),
  ADD COLUMN blocked_at TIMESTAMPTZ;

-- The paths of a row's photo files in Storage (from its public links).
CREATE FUNCTION private.photo_paths(p_urls TEXT[])
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(m[1]), '[]'::jsonb)
  FROM unnest(p_urls) u, regexp_match(u, '/storage/v1/object/public/(.+)$') m
  WHERE u IS NOT NULL AND u <> '';
$$;

-- A listing's photo links (a JSON array, or one link).
CREATE FUNCTION private.listing_photos(p_value TEXT)
RETURNS TEXT[] LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  RETURN ARRAY(SELECT jsonb_array_elements_text(p_value::jsonb));
EXCEPTION WHEN OTHERS THEN
  RETURN ARRAY[p_value];
END;
$$;

-- What a report is about, in a message: 'the post "Room in Kreuzberg"',
-- 'the member Priya P'.
CREATE FUNCTION private.report_item(p_kind TEXT, p_id UUID, p_user UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN p_kind = 'profile' THEN COALESCE('the member ' || NULLIF((SELECT p.name FROM public.profiles p WHERE p.id = p_user), ''), 'a member')
    ELSE 'the ' || private.content_noun(p_kind) || COALESCE(' "' || NULLIF(private.snippet(CASE p_kind
      WHEN 'post' THEN (SELECT x.content FROM public.posts x WHERE x.id = p_id)
      WHEN 'comment' THEN (SELECT x.content FROM public.comments x WHERE x.id = p_id)
      WHEN 'answer' THEN (SELECT x.content FROM public.help_responses x WHERE x.id = p_id)
      WHEN 'doc' THEN (SELECT x.title FROM public.docs x WHERE x.id = p_id)
      WHEN 'doc_comment' THEN (SELECT x.content FROM public.doc_comments x WHERE x.id = p_id)
      WHEN 'event' THEN (SELECT x.title FROM public.events x WHERE x.id = p_id)
      WHEN 'help' THEN (SELECT x.title FROM public.help_requests x WHERE x.id = p_id)
      WHEN 'market' THEN (SELECT x.title FROM public.marketplace x WHERE x.id = p_id)
      WHEN 'review' THEN (SELECT x.comment FROM public.mentor_reviews x WHERE x.id = p_id)
      WHEN 'place' THEN (SELECT x.name FROM public.places x WHERE x.id = p_id)
      WHEN 'message' THEN (SELECT x.content FROM public.messages x WHERE x.id = p_id)
    END), '') || '"', '') END;
$$;

-- What each report is about, in a message ({ report id: item }), taken
-- before the item is removed.
CREATE FUNCTION private.report_items(p_ids UUID[])
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_object_agg(r.id, private.report_item(r.content_type, r.reported_post_id, r.reported_user_id)), '{}'::jsonb)
  FROM public.reports r WHERE r.id = ANY (p_ids);
$$;

-- Closes reports (locked, still open) as decided, tells each member who
-- sent one the outcome, and returns their ids. p_outcome as for
-- private.report_outcome; p_items from private.report_items, taken before
-- the item was removed.
CREATE FUNCTION private.close_reports(p_ids UUID[], p_status TEXT, p_outcome TEXT, p_reason TEXT, p_items JSONB)
RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.reports;
  closed UUID[] := '{}';
BEGIN
  FOR r IN SELECT * FROM public.reports x WHERE x.id = ANY (p_ids) AND x.status = 'pending' ORDER BY x.created_at LOOP
    UPDATE public.reports SET status = p_status WHERE id = r.id;
    closed := closed || r.id;
    IF r.content_type IS DISTINCT FROM 'feedback' THEN
      PERFORM private.tell_member(r.reporter_id, 'report',
        private.report_outcome(COALESCE(p_items ->> r.id::text,
          private.report_item(r.content_type, r.reported_post_id, r.reported_user_id)), p_outcome, p_reason),
        r.id);
    END IF;
  END LOOP;
  RETURN closed;
END;
$$;

-- Removes content, removes a profile photo or bio, warns, blocks or
-- unblocks a member, records it (private.moderation_action), closes the
-- reports about it and tells the people concerned. Admins only.
--   p_kind: 'post', 'comment', 'answer', 'doc', 'doc_comment', 'event',
--     'help', 'market', 'review', 'place', 'message' (only one that was
--     reported), 'place_recommendation' (p_id: the place, p_member: who
--     recommended it), 'profile_photo', 'profile_bio' (p_id: the member),
--     or 'member' (p_id: the member).
--   p_action: 'remove' (content, photo, bio), 'warn' (content or member),
--     'block' or 'unblock' (member).
--   p_ground: 'illegal' or 'terms'; p_rule: the law or the rule in the
--     Terms; p_explanation: the facts, finishing "because ..." (needed for
--     all but unblock).
--   p_report_ids: the reports it answers (every other open report about
--     the same item is closed with them). p_notice: the notice from the
--     public page it answers.
--   p_urgent: for a block without a warning at least 14 days old, the
--     serious case: 'threat', 'violence', 'fraud', 'illegal' or 'danger'.
-- Returns { action_id, statement, closed_reports, cancelled_sessions }.
CREATE FUNCTION public.admin_moderate(p_kind TEXT, p_id UUID, p_action TEXT,
  p_ground TEXT DEFAULT NULL, p_rule TEXT DEFAULT '', p_explanation TEXT DEFAULT '',
  p_report_ids UUID[] DEFAULT '{}', p_urgent TEXT DEFAULT NULL, p_notice UUID DEFAULT NULL,
  p_member UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := (SELECT auth.uid());
  v_rule TEXT := btrim(regexp_replace(COALESCE(p_rule, ''), '\s+', ' ', 'g'));
  v_facts TEXT := private.facts(p_explanation);
  author UUID;
  row_json JSONB;
  photos TEXT[] := '{}';
  label TEXT;
  what_text TEXT;
  items JSONB;
  report_kind TEXT;
  pp public.profile_private;
  src TEXT;
  ids UUID[];
  closed UUID[] := '{}';
  sessions INTEGER := 0;
  statement TEXT := '';
  outcome TEXT;
  action_id UUID;
  convo UUID;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('post', 'comment', 'answer', 'doc', 'doc_comment', 'event', 'help', 'market',
     'review', 'place', 'message', 'place_recommendation', 'profile_photo', 'profile_bio', 'member') THEN
    RAISE EXCEPTION 'Unknown kind of content: %', p_kind USING ERRCODE = 'P0001';
  END IF;
  IF p_action IS NULL OR NOT (CASE
       WHEN p_kind = 'member' THEN p_action IN ('warn', 'block', 'unblock')
       WHEN p_kind IN ('profile_photo', 'profile_bio', 'place_recommendation') THEN p_action = 'remove'
       ELSE p_action IN ('remove', 'warn') END) THEN
    RAISE EXCEPTION 'You can''t % this.', p_action USING ERRCODE = 'P0001';
  END IF;
  IF p_action <> 'unblock' THEN
    IF p_ground IS NULL OR p_ground NOT IN ('illegal', 'terms') THEN
      RAISE EXCEPTION 'Choose whether it is illegal or against our Terms of Use.' USING ERRCODE = 'P0001';
    END IF;
    IF v_rule = '' OR char_length(v_rule) > 300 THEN
      RAISE EXCEPTION '%', CASE WHEN p_ground = 'illegal' THEN 'Name the law it breaks.' ELSE 'Choose the rule it breaks.' END
        USING ERRCODE = 'P0001';
    END IF;
    IF char_length(v_facts) < 10 OR char_length(v_facts) > 600 THEN
      RAISE EXCEPTION 'Say in a sentence (10 to 600 characters) what it said or did.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF p_urgent IS NOT NULL AND (p_action <> 'block' OR p_urgent NOT IN ('threat', 'violence', 'fraud', 'illegal', 'danger')) THEN
    RAISE EXCEPTION 'An immediate block needs one of the serious reasons.' USING ERRCODE = 'P0001';
  END IF;

  -- What it is, who it belongs to, and a copy of it.
  IF p_kind IN ('member', 'profile_photo', 'profile_bio') THEN
    author := p_id;
    SELECT to_jsonb(p) INTO row_json FROM public.profiles p WHERE p.id = p_id FOR UPDATE;
    IF row_json IS NULL THEN
      RAISE EXCEPTION 'Member not found.' USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO pp FROM public.profile_private x WHERE x.id = p_id FOR UPDATE;
    IF p_kind = 'profile_photo' THEN
      IF COALESCE(row_json ->> 'avatar_url', '') = '' THEN
        RAISE EXCEPTION 'This member has no profile photo.' USING ERRCODE = 'P0001';
      END IF;
      photos := ARRAY[row_json ->> 'avatar_url'];
      row_json := jsonb_build_object('id', p_id, 'avatar_url', row_json ->> 'avatar_url');
      what_text := 'your profile photo';
    ELSIF p_kind = 'profile_bio' THEN
      IF COALESCE(row_json ->> 'bio', '') = '' THEN
        RAISE EXCEPTION 'This member has no bio.' USING ERRCODE = 'P0001';
      END IF;
      row_json := jsonb_build_object('id', p_id, 'bio', row_json ->> 'bio');
      what_text := 'the bio on your profile';
    ELSE
      row_json := NULL;
      what_text := 'how you use NRIClub';
    END IF;
  ELSIF p_kind = 'place_recommendation' THEN
    author := p_member;
    SELECT jsonb_build_object('place_id', r.place_id, 'user_id', r.user_id, 'created_at', r.created_at, 'place', pl.name)
    INTO row_json
    FROM public.place_recommendations r JOIN public.places pl ON pl.id = r.place_id
    WHERE r.place_id = p_id AND r.user_id = p_member FOR UPDATE OF r;
    what_text := 'your recommendation of "' || private.snippet(row_json ->> 'place') || '"';
  ELSE
    CASE p_kind
      WHEN 'post' THEN SELECT to_jsonb(x), x.user_id, ARRAY[x.image_url] INTO row_json, author, photos FROM public.posts x WHERE x.id = p_id FOR UPDATE;
      WHEN 'comment' THEN SELECT to_jsonb(x), x.user_id INTO row_json, author FROM public.comments x WHERE x.id = p_id FOR UPDATE;
      WHEN 'answer' THEN SELECT to_jsonb(x), x.user_id INTO row_json, author FROM public.help_responses x WHERE x.id = p_id FOR UPDATE;
      WHEN 'doc' THEN SELECT to_jsonb(x), x.user_id INTO row_json, author FROM public.docs x WHERE x.id = p_id FOR UPDATE;
      WHEN 'doc_comment' THEN SELECT to_jsonb(x), x.user_id INTO row_json, author FROM public.doc_comments x WHERE x.id = p_id FOR UPDATE;
      WHEN 'event' THEN SELECT to_jsonb(x), x.organizer_id, ARRAY[x.image_url] INTO row_json, author, photos FROM public.events x WHERE x.id = p_id FOR UPDATE;
      WHEN 'help' THEN SELECT to_jsonb(x), x.user_id INTO row_json, author FROM public.help_requests x WHERE x.id = p_id FOR UPDATE;
      WHEN 'market' THEN SELECT to_jsonb(x), x.user_id, private.listing_photos(x.image_url) INTO row_json, author, photos FROM public.marketplace x WHERE x.id = p_id FOR UPDATE;
      WHEN 'review' THEN SELECT to_jsonb(x), x.mentee_id INTO row_json, author FROM public.mentor_reviews x WHERE x.id = p_id FOR UPDATE;
      WHEN 'place' THEN SELECT to_jsonb(x), x.created_by INTO row_json, author FROM public.places x WHERE x.id = p_id FOR UPDATE;
      WHEN 'message' THEN SELECT to_jsonb(x), x.sender_id, x.conversation_id INTO row_json, author, convo FROM public.messages x WHERE x.id = p_id FOR UPDATE;
    END CASE;
    -- Admins can't read messages: only one that was reported can be acted on.
    IF p_kind = 'message' AND NOT EXISTS (
      SELECT 1 FROM public.reports r WHERE r.content_type = 'message' AND r.reported_post_id = p_id) THEN
      RAISE EXCEPTION 'Only a message someone reported can be removed.' USING ERRCODE = '42501';
    END IF;
    what_text := 'your ' || private.content_noun(p_kind)
      || COALESCE(' "' || NULLIF(private.snippet(COALESCE(row_json ->> 'title', row_json ->> 'name', row_json ->> 'content',
                                                          row_json ->> 'comment', '')), '') || '"', '');
  END IF;
  IF row_json IS NULL AND p_kind <> 'member' THEN
    RAISE EXCEPTION 'Not found: it may already have been deleted.' USING ERRCODE = 'P0002';
  END IF;
  IF author = me THEN
    RAISE EXCEPTION 'You can''t act on your own account or content.' USING ERRCODE = 'P0001';
  END IF;
  IF author IS NOT NULL AND EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = author) THEN
    RAISE EXCEPTION 'This belongs to an admin. Another admin''s account or content can''t be moderated here.' USING ERRCODE = 'P0001';
  END IF;

  -- The reports it answers: the ones given and every other open one about
  -- the same item (for a photo, a bio or a recommendation, only the ones
  -- given). If all given ones were handled meanwhile, nothing is done.
  report_kind := CASE WHEN p_kind IN ('member', 'profile_photo', 'profile_bio') THEN 'profile'
                      WHEN p_kind = 'place_recommendation' THEN 'place' ELSE p_kind END;
  SELECT COALESCE(array_agg(r.id ORDER BY r.created_at), '{}') INTO ids
  FROM public.reports r
  WHERE r.status = 'pending' AND r.content_type IS DISTINCT FROM 'feedback'
    AND (r.id = ANY (COALESCE(p_report_ids, '{}'))
         OR (p_kind NOT IN ('profile_photo', 'profile_bio', 'place_recommendation') AND p_action <> 'unblock'
             AND r.content_type = report_kind
             AND CASE WHEN report_kind = 'profile' THEN r.reported_user_id = p_id ELSE r.reported_post_id = p_id END));
  PERFORM 1 FROM public.reports r WHERE r.id = ANY (ids) FOR UPDATE;
  IF COALESCE(cardinality(p_report_ids), 0) > 0 AND NOT EXISTS (
    SELECT 1 FROM public.reports r WHERE r.id = ANY (p_report_ids) AND r.status = 'pending') THEN
    RAISE EXCEPTION 'These reports were already handled by someone else. Reload to see the latest.' USING ERRCODE = 'P0001';
  END IF;
  IF p_notice IS NOT NULL AND NOT EXISTS (SELECT 1 FROM private.notices n WHERE n.id = p_notice) THEN
    RAISE EXCEPTION 'Notice not found.' USING ERRCODE = 'P0002';
  END IF;
  src := CASE WHEN p_notice IS NOT NULL THEN 'notice' WHEN cardinality(ids) > 0 THEN 'report' ELSE 'own_initiative' END;
  -- What the reporters are told it was about (before it's gone): for a
  -- photo, a bio or one recommendation, that part ("we removed it" mustn't
  -- read as the member or the place).
  items := private.report_items(ids);
  IF p_kind IN ('profile_photo', 'profile_bio', 'place_recommendation') THEN
    SELECT COALESCE(jsonb_object_agg(x.key, CASE p_kind WHEN 'profile_photo' THEN 'the profile photo of '
      WHEN 'profile_bio' THEN 'the bio of ' ELSE 'a recommendation of ' END || x.value), '{}'::jsonb)
    INTO items FROM jsonb_each_text(items) x;
  END IF;

  -- Do it.
  IF p_action = 'remove' THEN
    CASE p_kind
      WHEN 'post' THEN DELETE FROM public.posts WHERE id = p_id;
      WHEN 'comment' THEN
        DELETE FROM public.comments WHERE id = p_id;
        -- The post's author was notified with the comment's words.
        DELETE FROM public.notifications n
        WHERE n.type = 'comment' AND n.actor_id = author AND n.reference_id = (row_json ->> 'post_id')::UUID;
      WHEN 'answer' THEN DELETE FROM public.help_responses WHERE id = p_id;
      WHEN 'doc' THEN DELETE FROM public.docs WHERE id = p_id;
      WHEN 'doc_comment' THEN DELETE FROM public.doc_comments WHERE id = p_id;
      WHEN 'event' THEN DELETE FROM public.events WHERE id = p_id;
      WHEN 'help' THEN DELETE FROM public.help_requests WHERE id = p_id;
      WHEN 'market' THEN DELETE FROM public.marketplace WHERE id = p_id;
      WHEN 'review' THEN DELETE FROM public.mentor_reviews WHERE id = p_id;
      WHEN 'place' THEN DELETE FROM public.places WHERE id = p_id;
      WHEN 'place_recommendation' THEN DELETE FROM public.place_recommendations WHERE place_id = p_id AND user_id = p_member;
      WHEN 'message' THEN
        DELETE FROM public.messages WHERE id = p_id;
        -- The conversation's preview showed it if it was the last message.
        UPDATE public.conversations c SET last_message_text = COALESCE(
          (SELECT LEFT(m.content, 500) FROM public.messages m WHERE m.conversation_id = c.id
           ORDER BY m.created_at DESC LIMIT 1), '')
        WHERE c.id = convo;
      WHEN 'profile_photo' THEN UPDATE public.profiles SET avatar_url = '' WHERE id = p_id;
      WHEN 'profile_bio' THEN UPDATE public.profiles SET bio = '' WHERE id = p_id;
    END CASE;
  ELSIF p_action = 'block' THEN
    IF pp.status = 'blocked' THEN
      RAISE EXCEPTION 'This member is already blocked.' USING ERRCODE = 'P0001';
    END IF;
    -- A warning with 14 days to reply comes first (Terms of Use, section 10):
    -- the 14 days of the latest warning must be over.
    IF p_urgent IS NULL AND COALESCE((
      SELECT max(a.created_at) FROM private.moderation_action a
      WHERE a.target_user = p_id AND a.action = 'warn') > NOW() - INTERVAL '14 days', TRUE) THEN
      RAISE EXCEPTION 'Warn the member first and give them 14 days to reply, or choose the serious reason that makes an immediate block necessary.'
        USING ERRCODE = 'P0001';
    END IF;
    SELECT count(*) INTO sessions FROM public.mentor_bookings b
    WHERE b.mentor_id = p_id AND b.status = 'booked' AND b.starts_at > NOW();
    UPDATE public.profile_private SET status = 'blocked', block_reason = v_facts,
      block_rule = CASE WHEN p_ground = 'illegal' THEN 'Illegal content: ' ELSE 'Terms of Use: ' END || v_rule,
      blocked_at = NOW()
    WHERE id = p_id;
  ELSIF p_action = 'unblock' THEN
    IF pp.status <> 'blocked' THEN
      RAISE EXCEPTION 'This member isn''t blocked.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.profile_private SET status = 'active', block_reason = '', block_rule = '', blocked_at = NULL
    WHERE id = p_id;
  END IF;

  -- The statement of reasons to the member concerned.
  IF author IS NOT NULL THEN
    statement := private.statement_of_reasons(
      CASE p_action WHEN 'remove' THEN 'removed' WHEN 'warn' THEN 'warning' WHEN 'block' THEN 'blocked' ELSE 'unblocked' END,
      what_text, p_ground, v_rule, v_facts, src, p_urgent, sessions);
  END IF;
  INSERT INTO private.moderation_action (actor_id, action, target_kind, target_id, target_user, ground, rule,
    explanation, urgent, source, report_ids, notice_id, snapshot, statement)
  VALUES (me, p_action, p_kind, p_id, author, CASE WHEN p_action = 'unblock' THEN NULL ELSE p_ground END, v_rule,
    v_facts, p_urgent, src, ids, p_notice,
    CASE WHEN row_json IS NULL THEN NULL
         ELSE jsonb_build_object('kind', p_kind, 'row', row_json, 'files', private.photo_paths(photos)) END,
    LEFT(statement, 2000))
  RETURNING id INTO action_id;
  IF author IS NOT NULL THEN
    PERFORM private.tell_member(author, 'moderation', statement, action_id);
  END IF;

  -- The reports, and whoever sent them.
  outcome := CASE p_action WHEN 'remove' THEN 'removed' WHEN 'block' THEN 'blocked' WHEN 'warn' THEN 'warned' END;
  IF p_action <> 'unblock' THEN
    closed := private.close_reports(ids, 'resolved', outcome, v_facts, items);
    IF p_notice IS NOT NULL THEN
      UPDATE private.notices SET status = 'closed', decision = outcome, decision_reason = v_facts,
        decided_by = me, decided_at = NOW()
      WHERE id = p_notice;
    END IF;
  END IF;
  RETURN jsonb_build_object('action_id', action_id, 'statement', statement, 'closed_reports', to_jsonb(closed),
    'cancelled_sessions', sessions);
END;
$$;

-- Closes reports without acting on what they're about. p_status
-- 'reviewed': we looked and kept it (p_reason finishes "because ...");
-- 'resolved': it's already gone (e.g. the member deleted it). Whoever sent
-- each report is told. Returns the reports that were still open and are now
-- closed (none: someone else handled them first).
CREATE FUNCTION public.admin_close_reports(p_ids UUID[], p_status TEXT, p_reason TEXT)
RETURNS SETOF public.reports LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_reason TEXT := private.facts(p_reason);
  closed UUID[];
  first public.reports;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('reviewed', 'resolved') THEN
    RAISE EXCEPTION 'Unknown report status: %', p_status USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_reason) < 5 OR char_length(v_reason) > 600 THEN
    RAISE EXCEPTION 'Say in a few words why (the members who reported it are told).' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM public.reports r WHERE r.id = ANY (COALESCE(p_ids, '{}')) FOR UPDATE;
  SELECT * INTO first FROM public.reports r
  WHERE r.id = ANY (COALESCE(p_ids, '{}')) AND r.status = 'pending' AND r.content_type IS DISTINCT FROM 'feedback'
  ORDER BY r.created_at LIMIT 1;
  closed := private.close_reports(ARRAY(
    SELECT r.id FROM public.reports r
    WHERE r.id = ANY (COALESCE(p_ids, '{}')) AND r.content_type IS DISTINCT FROM 'feedback'),
    p_status, CASE WHEN p_status = 'resolved' THEN 'gone' ELSE 'kept' END, v_reason, '{}'::jsonb);
  IF cardinality(closed) > 0 THEN
    INSERT INTO private.moderation_action (actor_id, action, target_kind, target_id, target_user, explanation, source, report_ids)
    VALUES ((SELECT auth.uid()), 'dismiss', COALESCE(first.content_type, 'post'),
      COALESCE(first.reported_post_id, first.reported_user_id), first.reported_user_id, v_reason, 'report', closed);
  END IF;
  RETURN QUERY SELECT * FROM public.reports r WHERE r.id = ANY (closed);
END;
$$;

-- Opens reports again that were just closed with p_status (an Undo), and
-- takes back the outcome their senders were sent. Returns them.
CREATE FUNCTION public.admin_reopen_reports(p_ids UUID[], p_status TEXT)
RETURNS SETOF public.reports LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  opened UUID[];
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('reviewed', 'resolved') THEN
    RAISE EXCEPTION 'Unknown report status: %', p_status USING ERRCODE = 'P0001';
  END IF;
  WITH x AS (
    UPDATE public.reports r SET status = 'pending'
    WHERE r.id = ANY (COALESCE(p_ids, '{}')) AND r.status = p_status RETURNING r.id)
  SELECT COALESCE(array_agg(x.id), '{}') INTO opened FROM x;
  IF cardinality(opened) > 0 THEN
    DELETE FROM public.notifications n WHERE n.type = 'report' AND n.reference_id = ANY (opened);
    INSERT INTO private.moderation_action (actor_id, action, target_kind, target_id, source, report_ids)
    SELECT (SELECT auth.uid()), 'reopen', COALESCE(r.content_type, 'post'), COALESCE(r.reported_post_id, r.reported_user_id),
      'report', opened
    FROM public.reports r WHERE r.id = opened[1];
  END IF;
  RETURN QUERY SELECT * FROM public.reports r WHERE r.id = ANY (opened);
END;
$$;

-- Our team's notes on reports (admins only).
CREATE FUNCTION public.admin_report_notes(p_ids UUID[])
RETURNS TABLE (report_id UUID, note TEXT, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT n.report_id, n.note, n.updated_at FROM private.report_note n
  WHERE n.report_id = ANY (COALESCE(p_ids[1:1000], '{}'));
END;
$$;

CREATE FUNCTION public.admin_set_report_note(p_report UUID, p_note TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_note TEXT := btrim(COALESCE(p_note, ''));
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'Please keep the note to 2,000 characters.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.reports r WHERE r.id = p_report) THEN
    RAISE EXCEPTION 'Report not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_note = '' THEN
    DELETE FROM private.report_note WHERE report_id = p_report;
  ELSE
    INSERT INTO private.report_note (report_id, note, updated_by) VALUES (p_report, v_note, (SELECT auth.uid()))
    ON CONFLICT (report_id) DO UPDATE SET note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = NOW();
  END IF;
END;
$$;

-- A reported message, for admins (who can't read messages otherwise): only
-- the message the report is about, never the rest of the conversation.
CREATE FUNCTION public.admin_get_reported_message(p_report UUID)
RETURNS TABLE (id UUID, sender_id UUID, sender_name TEXT, content TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT m.id, m.sender_id, p.name, m.content, m.created_at
  FROM public.reports r
  JOIN public.messages m ON m.id = r.reported_post_id
  LEFT JOIN public.profiles p ON p.id = m.sender_id
  WHERE r.id = p_report AND r.content_type = 'message';
END;
$$;

-- Removes the reported message (only that one), with the reasons, as
-- admin_moderate does.
CREATE FUNCTION public.admin_delete_reported_message(p_report UUID, p_ground TEXT, p_rule TEXT, p_explanation TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  msg UUID;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  SELECT r.reported_post_id INTO msg FROM public.reports r WHERE r.id = p_report AND r.content_type = 'message';
  IF msg IS NULL THEN
    RAISE EXCEPTION 'Report not found.' USING ERRCODE = 'P0002';
  END IF;
  RETURN public.admin_moderate('message', msg, 'remove', p_ground, p_rule, p_explanation, ARRAY[p_report]);
END;
$$;

-- What the admin panel shows with a member: upcoming mentoring sessions
-- they give (a block or a rejection cancels them), their open mentoring
-- times, whether they're an admin, open reports about them, and what our
-- team did about them (newest first).
CREATE FUNCTION public.admin_member_overview(p_member UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'is_admin', EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = p_member),
    'is_me', p_member = (SELECT auth.uid()),
    'upcoming_sessions', (SELECT count(*) FROM public.mentor_bookings b
                          WHERE b.mentor_id = p_member AND b.status = 'booked' AND b.starts_at > NOW()),
    'free_slots', (SELECT count(*) FROM public.mentor_slots s
                   WHERE s.mentor_id = p_member AND NOT s.booked AND s.starts_at > NOW()),
    'open_reports', (SELECT count(*) FROM public.reports r
                     WHERE r.status = 'pending' AND r.reported_user_id = p_member AND r.content_type <> 'feedback'),
    'open_profile_reports', (SELECT count(*) FROM public.reports r
                             WHERE r.status = 'pending' AND r.reported_user_id = p_member AND r.content_type = 'profile'),
    'last_warning_at', (SELECT max(a.created_at) FROM private.moderation_action a
                        WHERE a.target_user = p_member AND a.action = 'warn'),
    'history', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'created_at', a.created_at, 'action', a.action, 'kind', a.target_kind, 'ground', a.ground, 'rule', a.rule,
        'explanation', a.explanation, 'urgent', a.urgent, 'source', a.source,
        'by', COALESCE(NULLIF(p.name, ''), 'An admin')) ORDER BY a.created_at DESC)
      FROM (SELECT * FROM private.moderation_action x WHERE x.target_user = p_member
            ORDER BY x.created_at DESC LIMIT 50) a
      LEFT JOIN public.profiles p ON p.id = a.actor_id), '[]'::jsonb));
END;
$$;

-- ============================================================================
-- NOTICES IN THE ADMIN PANEL
-- ============================================================================

-- Notices from the public page: open ones oldest first, then the newest
-- closed ones (up to p_limit of each).
CREATE FUNCTION public.admin_notices(p_limit INTEGER DEFAULT 200)
RETURNS TABLE (id UUID, reference TEXT, created_at TIMESTAMPTZ, location TEXT, category TEXT, explanation TEXT,
  name TEXT, email TEXT, status TEXT, decision TEXT, decision_reason TEXT, decided_at TIMESTAMPTZ,
  receipt_sent_at TIMESTAMPTZ, decision_sent_at TIMESTAMPTZ, admin_note TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  lim INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  (SELECT n.id, n.reference, n.created_at, n.location, n.category, n.explanation, n.name, n.email, n.status, n.decision,
          n.decision_reason, n.decided_at, n.receipt_sent_at, n.decision_sent_at, n.admin_note
   FROM private.notices n WHERE n.status = 'open' ORDER BY n.created_at LIMIT lim)
  UNION ALL
  (SELECT n.id, n.reference, n.created_at, n.location, n.category, n.explanation, n.name, n.email, n.status, n.decision,
          n.decision_reason, n.decided_at, n.receipt_sent_at, n.decision_sent_at, n.admin_note
   FROM private.notices n WHERE n.status = 'closed' ORDER BY n.created_at DESC LIMIT lim);
END;
$$;

-- A step on a notice. p_step: 'receipt_sent' / 'decision_sent' (our team
-- emailed the sender), 'decide' (p_decision 'kept' with p_reason finishing
-- "because ...": we didn't act on it; or 'gone' with what happened: it was
-- no longer there; removals, warnings and blocks are recorded by
-- admin_moderate with p_notice), 'reopen', or 'note' (p_reason: our team's
-- note). Returns the notice's status.
CREATE FUNCTION public.admin_update_notice(p_notice UUID, p_step TEXT, p_decision TEXT DEFAULT NULL, p_reason TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  n private.notices;
  v_reason TEXT := private.facts(p_reason);
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO n FROM private.notices x WHERE x.id = p_notice FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notice not found.' USING ERRCODE = 'P0002';
  END IF;
  IF p_step = 'receipt_sent' THEN
    UPDATE private.notices SET receipt_sent_at = COALESCE(receipt_sent_at, NOW()) WHERE id = p_notice;
  ELSIF p_step = 'decision_sent' THEN
    IF n.status <> 'closed' THEN
      RAISE EXCEPTION 'Decide on the notice first.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE private.notices SET decision_sent_at = NOW() WHERE id = p_notice;
  ELSIF p_step = 'decide' THEN
    IF n.status <> 'open' THEN
      RAISE EXCEPTION 'This notice was already decided. Reload to see the latest.' USING ERRCODE = 'P0001';
    END IF;
    IF p_decision IS NULL OR p_decision NOT IN ('kept', 'gone') THEN
      RAISE EXCEPTION 'Remove, warn or block from the content itself; here you can only keep it, or say it''s already gone.'
        USING ERRCODE = 'P0001';
    END IF;
    IF char_length(v_reason) < 5 OR char_length(v_reason) > 600 THEN
      RAISE EXCEPTION 'Say in a few words why (the sender is told).' USING ERRCODE = 'P0001';
    END IF;
    UPDATE private.notices SET status = 'closed', decision = p_decision, decision_reason = v_reason,
      decided_by = (SELECT auth.uid()), decided_at = NOW()
    WHERE id = p_notice;
  ELSIF p_step = 'reopen' THEN
    UPDATE private.notices SET status = 'open', decision = '', decision_reason = '', decided_by = NULL,
      decided_at = NULL, decision_sent_at = NULL
    WHERE id = p_notice;
  ELSIF p_step = 'note' THEN
    IF char_length(btrim(COALESCE(p_reason, ''))) > 2000 THEN
      RAISE EXCEPTION 'Please keep the note to 2,000 characters.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE private.notices SET admin_note = btrim(COALESCE(p_reason, '')) WHERE id = p_notice;
  ELSE
    RAISE EXCEPTION 'Unknown step: %', p_step USING ERRCODE = 'P0001';
  END IF;
  RETURN (SELECT x.status FROM private.notices x WHERE x.id = p_notice);
END;
$$;

-- ============================================================================
-- ADMIN WRITES ONLY THROUGH THESE FUNCTIONS (C23)
-- ============================================================================

-- Server-owned columns, as in 2026-10-13, now for admins too: an admin
-- changes members, their status and communities only through the functions
-- of this file and review_member, which run as the database and are
-- recorded. (Admins still write their own posts, guides and profile as any
-- member does.)
CREATE OR REPLACE FUNCTION private.protect_columns()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  locked JSONB;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(
      'created_at', NOW(), 'updated_at', NOW(), 'joined_at', NOW(), 'last_message_at', NOW())
      || TG_ARGV[0]::jsonb);
  ELSIF TG_NARGS > 1 THEN
    SELECT jsonb_object_agg(col, to_jsonb(OLD) -> col) INTO locked
    FROM unnest(TG_ARGV[1:TG_NARGS - 1]) AS col;
    NEW := jsonb_populate_record(NEW, locked);
  END IF;
  RETURN NEW;
END;
$$;

-- The block fields are the server's too.
DROP TRIGGER protect_columns ON public.profile_private;
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.profile_private
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns(
    '{"verification_status": "incomplete", "status": "active", "age_confirmed_at": null, "terms_accepted_at": null, "terms_version": null, "submitted_at": null, "reviewed_at": null, "verification_message": "", "verification_note": "", "voucher": "", "review_flag": "", "art9_consent_at": null, "art9_consent_version": null, "block_reason": "", "block_rule": "", "blocked_at": null}',
    'id', 'email', 'verification_status', 'status', 'age_confirmed_at', 'terms_accepted_at', 'terms_version',
    'verification_note', 'voucher', 'submitted_at', 'reviewed_at', 'verification_message', 'review_flag',
    'art9_consent_at', 'art9_consent_version', 'block_reason', 'block_rule', 'blocked_at', 'created_at');

-- Members change only their own rows; admins act through the functions.
DROP POLICY "Users can update their own private profile data" ON public.profile_private;
CREATE POLICY "Users can update their own private profile data" ON public.profile_private
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) AND NOT (SELECT private.is_blocked_me()))
  WITH CHECK (id = (SELECT auth.uid()) AND NOT (SELECT private.is_blocked_me()));

DROP POLICY "Admins can update groups" ON public.groups;
DROP POLICY "Admins can delete groups" ON public.groups;

DROP POLICY "Users can leave groups" ON public.group_members;
CREATE POLICY "Users can leave groups" ON public.group_members
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY "Users and admins can delete posts" ON public.posts;
CREATE POLICY "Users can delete their posts" ON public.posts
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY "Users and admins can delete comments" ON public.comments;
CREATE POLICY "Users can delete their comments" ON public.comments
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY "Organizers and admins can delete events" ON public.events;
CREATE POLICY "Organizers can delete their events" ON public.events
  FOR DELETE TO authenticated USING (organizer_id = (SELECT auth.uid()));
DROP POLICY "Users and admins can delete listings" ON public.marketplace;
CREATE POLICY "Users can delete their listings" ON public.marketplace
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY "Users and admins can delete docs" ON public.docs;
CREATE POLICY "Users can delete their docs" ON public.docs
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY "Users and admins can delete doc comments" ON public.doc_comments;
CREATE POLICY "Users can delete their doc comments" ON public.doc_comments
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY "Users and admins can delete help requests" ON public.help_requests;
CREATE POLICY "Users can delete their help requests" ON public.help_requests
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY "Users and admins can delete help responses" ON public.help_responses;
CREATE POLICY "Users can delete their help responses" ON public.help_responses
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY "Reviewers and admins can delete reviews" ON public.mentor_reviews;
CREATE POLICY "Reviewers can delete their reviews" ON public.mentor_reviews
  FOR DELETE TO authenticated USING (mentee_id = (SELECT auth.uid()));
DROP POLICY "Members and admins can delete places" ON public.places;
CREATE POLICY "Members can delete their places" ON public.places
  FOR DELETE TO authenticated USING (created_by = (SELECT auth.uid()));

-- Notifications come from the database only (the functions here send our
-- team's messages).
DROP POLICY "Admins can notify members" ON public.notifications;

-- Approves, takes back an approval (only while nobody has joined yet),
-- rejects or deletes a community; the member who asked for it is told.
-- p_action: 'approve', 'unapprove', 'reject' (a request), 'delete' (a live
-- community: its posts stay, without the community). Returns the group as
-- it is now (NULL once deleted).
CREATE FUNCTION public.admin_set_group(p_group UUID, p_action TEXT, p_reason TEXT DEFAULT '')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  g public.groups;
  v_reason TEXT := private.facts(p_reason);
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO g FROM public.groups x WHERE x.id = p_group FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nothing was changed. It may already have been handled.' USING ERRCODE = 'P0002';
  END IF;
  IF p_action = 'approve' THEN
    IF g.is_approved THEN
      RAISE EXCEPTION 'Nothing was changed. It may already have been handled.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.groups SET is_approved = TRUE WHERE id = p_group;
    PERFORM private.tell_member(g.created_by, 'group', 'Your community "' || g.name || '" has been approved!', g.id);
  ELSIF p_action = 'unapprove' THEN
    IF NOT g.is_approved OR g.members_count > 0 OR EXISTS (SELECT 1 FROM public.posts p WHERE p.group_id = p_group) THEN
      RAISE EXCEPTION 'Members have already joined or posted, so this can''t be undone.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.groups SET is_approved = FALSE WHERE id = p_group;
    DELETE FROM public.notifications n WHERE n.type = 'group' AND n.reference_id = p_group AND n.user_id = g.created_by;
  ELSIF p_action = 'reject' THEN
    IF g.is_approved THEN
      RAISE EXCEPTION 'Nothing was changed. It may already have been handled.' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.groups WHERE id = p_group;
    PERFORM private.tell_member(g.created_by, 'group',
      'Your community request "' || g.name || '" was not approved.' || CASE WHEN v_reason <> '' THEN ' Reason: ' || v_reason || '.' ELSE '' END,
      g.id);
  ELSIF p_action = 'delete' THEN
    IF char_length(v_reason) < 5 THEN
      RAISE EXCEPTION 'Say in a few words why the community is deleted.' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.groups WHERE id = p_group;
    PERFORM private.tell_member(g.created_by, 'group',
      'We deleted the community "' || g.name || '" because ' || v_reason || '. ' || private.redress_line(), g.id);
  ELSE
    RAISE EXCEPTION 'Unknown action: %', p_action USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO private.moderation_action (actor_id, action, target_kind, target_id, target_user, explanation, source, snapshot)
  VALUES ((SELECT auth.uid()), 'group_' || p_action, 'group', p_group, g.created_by, v_reason, 'own_initiative',
    jsonb_build_object('kind', 'group', 'row', to_jsonb(g)));
  RETURN (SELECT to_jsonb(x) FROM public.groups x WHERE x.id = p_group);
END;
$$;

-- Makes a member the ambassador for a city ('' to end it). Only active,
-- verified members (private.verified_ambassador_only says so).
CREATE FUNCTION public.admin_set_ambassador(p_member UUID, p_city TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_city TEXT := btrim(regexp_replace(COALESCE(p_city, ''), '\s+', ' ', 'g'));
  before TEXT;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_city) > 100 THEN
    RAISE EXCEPTION 'Please keep the city to 100 characters.' USING ERRCODE = 'P0001';
  END IF;
  SELECT p.ambassador_city INTO before FROM public.profiles p WHERE p.id = p_member FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.profiles SET ambassador_city = v_city WHERE id = p_member;
  INSERT INTO private.moderation_action (actor_id, action, target_kind, target_id, target_user, explanation, source)
  VALUES ((SELECT auth.uid()), 'ambassador', 'member', p_member, p_member,
    CASE WHEN v_city = '' THEN 'No longer ambassador for ' || COALESCE(NULLIF(before, ''), 'a city')
         ELSE 'Ambassador for ' || v_city END, 'own_initiative');
  RETURN v_city;
END;
$$;

-- ============================================================================
-- MENTORING (C24) AND AMBASSADORS (C26)
-- ============================================================================

-- As in 2026-10-18, except that rejecting a mentor cancels their upcoming
-- sessions too (as blocking does), and the members who booked are told.
-- Moved back to review, they keep their booked sessions (their open times
-- go).
CREATE OR REPLACE FUNCTION private.stop_mentoring_when_inactive()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  b public.mentor_bookings;
BEGIN
  IF NEW.status = 'active' AND NEW.verification_status = 'approved' THEN
    RETURN NULL;
  END IF;
  UPDATE public.profiles SET mentor_open = FALSE WHERE id = NEW.id AND mentor_open;
  DELETE FROM public.mentor_slots WHERE mentor_id = NEW.id AND NOT booked;
  IF NEW.status <> 'active' OR NEW.verification_status = 'rejected' THEN
    FOR b IN SELECT * FROM public.mentor_bookings
             WHERE mentor_id = NEW.id AND status = 'booked' AND starts_at > NOW() LOOP
      UPDATE public.mentor_bookings
      SET status = 'cancelled', cancelled_by = NEW.id, cancel_reason = 'The mentor is no longer available.'
      WHERE id = b.id;
      DELETE FROM public.mentor_slots WHERE id = b.slot_id;
      PERFORM private.notify(b.mentee_id, 'booking_cancelled', NULL,
        'Your mentoring session was cancelled: the mentor is no longer available.', b.id);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

-- The ambassadors of a city (name and photo), for members who can see
-- other members: active, verified members only.
CREATE FUNCTION public.city_ambassadors(p_city TEXT)
RETURNS TABLE (id UUID, name TEXT, avatar_url TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id, p.name, p.avatar_url
  FROM public.profiles p JOIN public.profile_private pp ON pp.id = p.id
  WHERE btrim(COALESCE(p_city, '')) <> '' AND p.ambassador_city <> ''
    AND private.city_group_name(p.ambassador_city) = private.city_group_name(p_city)
    AND pp.status = 'active' AND pp.verification_status = 'approved'
    AND (SELECT private.can_browse())
  ORDER BY p.name
  LIMIT 5;
$$;

-- ============================================================================
-- CLEAN-UP (C20) AND "DOWNLOAD MY DATA" (C21)
-- ============================================================================

-- As in 2026-10-20, plus: notices from the public page once closed and 12
-- months old, unless held (hold_reason); the counters behind the notice
-- limits after a day; the copy of removed content in the record of what our
-- team did after 6 months, and the record itself after 24, unless a report
-- or notice it answers is held. The periods are the Privacy Policy's
-- (RETENTION in src/content/legal/privacy.js).
CREATE OR REPLACE FUNCTION private.daily_cleanup()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  unconfirmed INTEGER;
  unfinished INTEGER;
  declined INTEGER;
  notices INTEGER;
  closed_reports INTEGER;
  records INTEGER;
  notes INTEGER;
  closed_notices INTEGER;
  copies INTEGER;
  actions INTEGER;
BEGIN
  -- Sign-ups that never confirmed their email address: 30 days.
  WITH gone AS (
    DELETE FROM auth.users u
    WHERE u.email_confirmed_at IS NULL AND u.created_at < NOW() - INTERVAL '30 days'
      AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = u.id)
    RETURNING 1)
  SELECT count(*) INTO unconfirmed FROM gone;

  -- Accounts that never sent their check details: 90 days after signing up,
  -- or after our team last sent them back to unfinished (that decision
  -- clears reviewed_at, so its date comes from verification_log).
  WITH gone AS (
    DELETE FROM auth.users u USING public.profile_private pp
    WHERE pp.id = u.id AND pp.verification_status = 'incomplete'
      AND pp.created_at < NOW() - INTERVAL '90 days'
      AND NOT EXISTS (SELECT 1 FROM public.verification_log l
                      WHERE l.member_id = pp.id AND l.decision = 'incomplete'
                        AND l.created_at >= NOW() - INTERVAL '90 days')
      AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = u.id)
    RETURNING 1)
  SELECT count(*) INTO unfinished FROM gone;

  -- Accounts our team declined: 6 months after the decision. (Accounts
  -- whose membership we ended are deleted by hand: the database can't tell
  -- a block for a time from the end of a membership.)
  WITH gone AS (
    DELETE FROM auth.users u USING public.profile_private pp
    WHERE pp.id = u.id AND pp.verification_status = 'rejected'
      AND COALESCE(pp.reviewed_at, pp.updated_at) < NOW() - INTERVAL '6 months'
      AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = u.id)
    RETURNING 1)
  SELECT count(*) INTO declined FROM gone;

  -- In-app notifications the member has read: 6 months.
  WITH gone AS (
    DELETE FROM public.notifications n WHERE n.read AND n.created_at < NOW() - INTERVAL '6 months' RETURNING 1)
  SELECT count(*) INTO notices FROM gone;

  -- Closed reports: once closed and 12 months old, unless held.
  WITH gone AS (
    DELETE FROM public.reports r
    WHERE r.status <> 'pending' AND r.created_at < NOW() - INTERVAL '12 months'
      AND NOT EXISTS (SELECT 1 FROM private.report_hold h WHERE h.report_id = r.id)
    RETURNING 1)
  SELECT count(*) INTO closed_reports FROM gone;

  -- Notices from the public report page: once closed and 12 months old,
  -- unless held.
  WITH gone AS (
    DELETE FROM private.notices n
    WHERE n.status = 'closed' AND n.created_at < NOW() - INTERVAL '12 months' AND n.hold_reason = ''
    RETURNING 1)
  SELECT count(*) INTO closed_notices FROM gone;

  -- Record of declined and blocked accounts: 24 months after the decision;
  -- the note in it after 12.
  WITH gone AS (
    DELETE FROM private.moderation_record m WHERE m.created_at < NOW() - INTERVAL '24 months' RETURNING 1)
  SELECT count(*) INTO records FROM gone;
  WITH cleared AS (
    UPDATE private.moderation_record m SET admin_note = ''
    WHERE m.admin_note <> '' AND m.created_at < NOW() - INTERVAL '12 months' RETURNING 1)
  SELECT count(*) INTO notes FROM cleared;

  -- The record of what our team did: the copy of removed content after 6
  -- months, the rest after 24, unless a report or notice it answers is held
  -- for a legal dispute or a police matter.
  WITH cleared AS (
    UPDATE private.moderation_action a SET snapshot = NULL
    WHERE a.snapshot IS NOT NULL AND a.created_at < NOW() - INTERVAL '6 months'
      AND NOT EXISTS (SELECT 1 FROM private.report_hold h WHERE h.report_id = ANY (a.report_ids))
      AND NOT EXISTS (SELECT 1 FROM private.notices n WHERE n.id = a.notice_id AND n.hold_reason <> '')
    RETURNING 1)
  SELECT count(*) INTO copies FROM cleared;
  WITH gone AS (
    DELETE FROM private.moderation_action a
    WHERE a.created_at < NOW() - INTERVAL '24 months'
      AND NOT EXISTS (SELECT 1 FROM private.report_hold h WHERE h.report_id = ANY (a.report_ids))
      AND NOT EXISTS (SELECT 1 FROM private.notices n WHERE n.id = a.notice_id AND n.hold_reason <> '')
    RETURNING 1)
  SELECT count(*) INTO actions FROM gone;

  -- The counters behind the limits and the name changes.
  DELETE FROM private.rate_log r WHERE r.at < NOW() - INTERVAL '1 day';
  DELETE FROM private.name_changes c WHERE c.changed_at < NOW() - INTERVAL '30 days';
  DELETE FROM private.notice_log l WHERE l.at < NOW() - INTERVAL '1 day';

  RETURN jsonb_build_object(
    'unconfirmed_signups', unconfirmed, 'unfinished_accounts', unfinished, 'declined_accounts', declined,
    'read_notifications', notices, 'closed_reports', closed_reports, 'closed_notices', closed_notices,
    'moderation_records', records, 'moderation_notes_cleared', notes,
    'moderation_copies_cleared', copies, 'moderation_actions', actions);
END;
$$;

-- "Download my data": as in 2026-10-20, plus what our team did about the
-- member (with the statements they were sent and a copy of what was
-- removed, while it's kept; not who on our team did it), and, for reports
-- about the member, the kind and reason (not who sent them, nor their own
-- words). Reports others sent about the member stay in it after those
-- members deleted their accounts. Left out: reports about a message the
-- member sent, and our team keeping such a message (only the member it was
-- sent to can report it, so either would say who did, Art. 15(4) GDPR); a
-- message we removed is in it, as the member was told when it happened.
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
  sessions JSONB := '[]'::jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF to_regclass('auth.sessions') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'created_at', s->'created_at', 'refreshed_at', s->'refreshed_at', 'updated_at', s->'updated_at',
          'ip', s->'ip', 'user_agent', s->'user_agent') ORDER BY s->>'created_at'), '[]'::jsonb)
      FROM (SELECT to_jsonb(x) AS s FROM auth.sessions x WHERE x.user_id = $1) y
    $q$ INTO sessions USING uid;
  END IF;
  RETURN jsonb_build_object(
    'exported_at', NOW(),
    'readme', jsonb_build_object(
      'about', 'Everything NRIClub keeps about you in its database at the time of exported_at: your account, profile and settings, what you posted, sent and received, and the records about you below.',
      'privacy_policy', 'https://nriclub.app/privacy: why we use each kind of data, the legal basis, who receives it, how long we keep it, and your rights.',
      'not_included', 'The photo files themselves (listed under files; you see them in the app), copies in our database provider''s daily backups (overwritten after 7 days), server logs, emails between you and us, and our team''s internal notes on decisions about your account. Write to hello@nriclub.app for a copy of any of these.',
      'left_out', 'To protect members who report content, this file doesn''t say who reported you, and leaves out reports about messages you sent (only the member you wrote to can report a message). A message of yours we removed is under moderation_actions_about_me.',
      'contact', 'hello@nriclub.app'),
    'account', (SELECT jsonb_build_object(
        'email', a->'email', 'created_at', a->'created_at', 'email_confirmed_at', a->'email_confirmed_at',
        'last_sign_in_at', a->'last_sign_in_at', 'signup_data', a->'raw_user_meta_data')
      FROM (SELECT to_jsonb(u) AS a FROM auth.users u WHERE u.id = uid) x),
    'sessions', sessions,
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = uid),
    'profile_private', (SELECT to_jsonb(pp) FROM public.profile_private pp WHERE pp.id = uid),
    'user_settings', (SELECT to_jsonb(s) FROM public.user_settings s WHERE s.user_id = uid),
    'terms_acceptances', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'kind', x.kind, 'version', x.version, 'accepted_at', x.accepted_at) ORDER BY x.accepted_at, x.kind)
      FROM public.terms_acceptances x WHERE x.member_id = uid), '[]'::jsonb),
    'verification_log', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'decision', l.decision, 'member_message', l.member_message, 'created_at', l.created_at)
        || CASE WHEN l.actor_id = uid THEN jsonb_build_object('note', l.admin_note) ELSE '{}'::jsonb END
        ORDER BY l.created_at)
      FROM public.verification_log l WHERE l.member_id = uid), '[]'::jsonb),
    'moderation_actions_about_me', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'created_at', a.created_at, 'action', a.action, 'about', a.target_kind, 'ground', a.ground, 'rule', a.rule,
        'facts', a.explanation, 'immediate_block_because', a.urgent, 'source', a.source,
        'statement_sent_to_you', NULLIF(a.statement, ''), 'copy_of_removed_content', a.snapshot -> 'row')
        ORDER BY a.created_at)
      FROM private.moderation_action a WHERE a.target_user = uid
        AND NOT (a.action = 'dismiss' AND a.target_kind = 'message')), '[]'::jsonb),
    'name_changes', COALESCE((SELECT jsonb_agg(c.changed_at ORDER BY c.changed_at)
      FROM private.name_changes c WHERE c.member_id = uid), '[]'::jsonb),
    'posts', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.posts x WHERE x.user_id = uid), '[]'::jsonb),
    'comments', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.comments x WHERE x.user_id = uid), '[]'::jsonb),
    'likes', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.likes x WHERE x.user_id = uid), '[]'::jsonb),
    'connections', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.connections x WHERE uid IN (x.requester_id, x.recipient_id)), '[]'::jsonb),
    'group_memberships', COALESCE((SELECT jsonb_agg(to_jsonb(x) || jsonb_build_object('group_name', g.name) ORDER BY x.joined_at)
      FROM public.group_members x LEFT JOIN public.groups g ON g.id = x.group_id WHERE x.user_id = uid), '[]'::jsonb),
    'groups_requested', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.groups x WHERE x.created_by = uid), '[]'::jsonb),
    'events_organised', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.events x WHERE x.organizer_id = uid), '[]'::jsonb),
    'event_rsvps', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.event_rsvps x WHERE x.user_id = uid), '[]'::jsonb),
    'conversations', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.conversations x WHERE uid IN (x.participant_1, x.participant_2)), '[]'::jsonb),
    'messages', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.messages x JOIN public.conversations c ON c.id = x.conversation_id
      WHERE uid IN (c.participant_1, c.participant_2)), '[]'::jsonb),
    'marketplace_listings', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.marketplace x WHERE x.user_id = uid), '[]'::jsonb),
    'docs', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.docs x WHERE x.user_id = uid), '[]'::jsonb),
    'doc_comments', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.doc_comments x WHERE x.user_id = uid), '[]'::jsonb),
    'help_requests', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.help_requests x WHERE x.user_id = uid), '[]'::jsonb),
    'urgent_questions_sent', COALESCE((SELECT jsonb_agg(u.sent_at ORDER BY u.sent_at)
      FROM private.urgent_log u WHERE u.user_id = uid), '[]'::jsonb),
    'help_responses', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.help_responses x WHERE x.user_id = uid), '[]'::jsonb),
    'notifications', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.notifications x WHERE x.user_id = uid), '[]'::jsonb),
    'reports_filed', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.reports x WHERE x.reporter_id = uid), '[]'::jsonb),
    -- Without the reporter's own words, which could say who they are: the
    -- explanation, and in a report the site sent the old way, what follows
    -- the reason in its reason line ("... — Illegal: Fraud or a scam: <their
    -- words>").
    'reports_about_me', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'created_at', x.created_at, 'about', x.content_type,
        'reason', regexp_replace(x.reason, '((Illegal|Against our rules): [^:]*):.*$', '\1'), 'category', x.category,
        'status', x.status) ORDER BY x.created_at)
      FROM public.reports x
      WHERE x.reporter_id IS DISTINCT FROM uid AND x.content_type IS DISTINCT FROM 'feedback'
        AND x.content_type IS DISTINCT FROM 'message'
        AND (x.reported_user_id = uid OR x.reported_post_id IN (
        SELECT y.id FROM public.posts y WHERE y.user_id = uid
        UNION ALL SELECT y.id FROM public.docs y WHERE y.user_id = uid
        UNION ALL SELECT y.id FROM public.events y WHERE y.organizer_id = uid
        UNION ALL SELECT y.id FROM public.help_requests y WHERE y.user_id = uid
        UNION ALL SELECT y.id FROM public.marketplace y WHERE y.user_id = uid
        UNION ALL SELECT y.id FROM public.mentor_reviews y WHERE y.mentee_id = uid))), '[]'::jsonb),
    'blocks', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.blocks x WHERE x.blocker_id = uid), '[]'::jsonb),
    'conversations_hidden', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.hidden_at)
      FROM public.conversation_hides x WHERE x.user_id = uid), '[]'::jsonb),
    'places_added', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.places x WHERE x.created_by = uid), '[]'::jsonb),
    'place_recommendations', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.place_recommendations x WHERE x.user_id = uid), '[]'::jsonb),
    'answer_thanks', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.answer_thanks x WHERE x.user_id = uid), '[]'::jsonb),
    'mentor_times', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.starts_at)
      FROM public.mentor_slots x WHERE x.mentor_id = uid), '[]'::jsonb),
    'mentoring_sessions', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.starts_at)
      FROM public.mentor_bookings x WHERE uid IN (x.mentor_id, x.mentee_id)), '[]'::jsonb),
    'mentor_reviews_written', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.mentor_reviews x WHERE x.mentee_id = uid), '[]'::jsonb),
    'mentor_reviews_received', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'rating', x.rating, 'comment', x.comment, 'created_at', x.created_at) ORDER BY x.created_at)
      FROM public.mentor_reviews x WHERE x.mentor_id = uid), '[]'::jsonb),
    'files', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'bucket', o.bucket_id, 'name', o.name, 'created_at', o.created_at) ORDER BY o.created_at)
      FROM storage.objects o WHERE (storage.foldername(o.name))[1] = uid::text), '[]'::jsonb),
    'rate_limit_log', COALESCE((SELECT jsonb_agg(jsonb_build_object('action', r.action, 'at', r.at) ORDER BY r.at)
      FROM private.rate_log r WHERE r.member_id = uid), '[]'::jsonb)
  );
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Helpers and trigger functions run as the database (fill_report_details
-- and the alerts are triggers on rows members write). Members can't call
-- anything in private through the API (the schema isn't exposed).
REVOKE ALL ON FUNCTION private.report_categories(), private.content_noun(TEXT), private.long_date(TIMESTAMPTZ),
  private.redress_line(), private.urgent_label(TEXT),
  private.statement_of_reasons(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ),
  private.report_outcome(TEXT, TEXT, TEXT), private.facts(TEXT), private.tell_member(UUID, TEXT, TEXT, UUID),
  private.alert_admins(TEXT, UUID), private.report_kind_from_reason(TEXT, UUID, UUID), private.content_author(TEXT, UUID),
  private.fill_report_details(), private.alert_safety_report(), private.forget_feedback(),
  private.limit_key(TEXT, TEXT), private.forget_moderation_target(), private.photo_paths(TEXT[]),
  private.listing_photos(TEXT), private.report_item(TEXT, UUID, UUID), private.report_items(UUID[]), private.close_reports(UUID[], TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC;
-- Row checks (CHECK constraints) and the report triggers run as the member.
GRANT EXECUTE ON FUNCTION private.report_categories(), private.fill_report_details(), private.alert_safety_report(),
  private.forget_feedback(), private.forget_moderation_target() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.content_noun(TEXT), private.long_date(TIMESTAMPTZ), private.redress_line(),
  private.urgent_label(TEXT), private.statement_of_reasons(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TIMESTAMPTZ),
  private.report_outcome(TEXT, TEXT, TEXT), private.facts(TEXT), private.tell_member(UUID, TEXT, TEXT, UUID),
  private.alert_admins(TEXT, UUID), private.report_kind_from_reason(TEXT, UUID, UUID), private.content_author(TEXT, UUID),
  private.limit_key(TEXT, TEXT), private.photo_paths(TEXT[]), private.listing_photos(TEXT),
  private.report_item(TEXT, UUID, UUID), private.report_items(UUID[]), private.close_reports(UUID[], TEXT, TEXT, TEXT, JSONB) TO service_role;

-- The public report page works signed out too.
REVOKE ALL ON FUNCTION public.submit_notice(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_notice(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;
-- Admin functions check private.is_admin() themselves; members get "Admins only".
REVOKE ALL ON FUNCTION
  public.admin_moderate(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, UUID[], TEXT, UUID, UUID),
  public.admin_close_reports(UUID[], TEXT, TEXT), public.admin_reopen_reports(UUID[], TEXT),
  public.admin_report_notes(UUID[]), public.admin_set_report_note(UUID, TEXT),
  public.admin_get_reported_message(UUID), public.admin_delete_reported_message(UUID, TEXT, TEXT, TEXT),
  public.admin_member_overview(UUID), public.admin_notices(INTEGER), public.admin_update_notice(UUID, TEXT, TEXT, TEXT),
  public.admin_set_group(UUID, TEXT, TEXT), public.admin_set_ambassador(UUID, TEXT),
  public.city_ambassadors(TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.admin_moderate(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, UUID[], TEXT, UUID, UUID),
  public.admin_close_reports(UUID[], TEXT, TEXT), public.admin_reopen_reports(UUID[], TEXT),
  public.admin_report_notes(UUID[]), public.admin_set_report_note(UUID, TEXT),
  public.admin_get_reported_message(UUID), public.admin_delete_reported_message(UUID, TEXT, TEXT, TEXT),
  public.admin_member_overview(UUID), public.admin_notices(INTEGER), public.admin_update_notice(UUID, TEXT, TEXT, TEXT),
  public.admin_set_group(UUID, TEXT, TEXT), public.admin_set_ambassador(UUID, TEXT),
  public.city_ambassadors(TEXT)
  TO authenticated;

-- ============================================================================
-- EXISTING DATA
-- ============================================================================

-- (supabase/tests/rls_test.py runs this section again, in a transaction it
-- rolls back, to check the changes to existing rows.)

-- Reports from before get their kind from their "[TYPE]" prefix.
UPDATE public.reports SET content_type = private.report_kind_from_reason(reason, reported_post_id, reported_user_id)
WHERE content_type IS NULL;

-- A member's second open report about the same item is closed as a
-- duplicate of the first (from now on there is one open report per member
-- and item).
WITH dupes AS (
  SELECT r.id FROM public.reports r
  WHERE r.status = 'pending' AND r.content_type <> 'feedback' AND EXISTS (
    SELECT 1 FROM public.reports o
    WHERE o.status = 'pending' AND o.reporter_id = r.reporter_id AND o.content_type = r.content_type
      AND COALESCE(o.reported_post_id, o.reported_user_id) = COALESCE(r.reported_post_id, r.reported_user_id)
      AND (o.created_at, o.id) < (r.created_at, r.id))),
closed AS (
  UPDATE public.reports r SET status = 'reviewed' FROM dupes WHERE r.id = dupes.id RETURNING r.id)
INSERT INTO private.report_note (report_id, note)
SELECT closed.id, 'Closed as a duplicate: the same member had already reported this, and that report is still open.'
FROM closed;

-- One open report per member and item.
CREATE UNIQUE INDEX reports_one_open_per_member ON public.reports
  (reporter_id, content_type, COALESCE(reported_post_id, reported_user_id))
  WHERE status = 'pending' AND content_type <> 'feedback';

-- Blocked members' reason is empty until our team blocks someone through
-- admin_moderate; the record of what our team did starts empty.
