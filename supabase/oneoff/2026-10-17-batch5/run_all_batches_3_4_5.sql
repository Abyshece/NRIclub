-- ============================================================================
-- ONE FILE FOR BATCHES 3, 4 AND 5 (and the welcome posts), in the right
-- order. Paste it all into the Supabase SQL Editor and click Run once.
-- It runs all or nothing: if anything fails, nothing is changed.
-- Use this INSTEAD of the separate Batch 3, Batch 4, Batch 5 and
-- starter_posts files (don't run those as well).
-- ============================================================================

-- ======================== BATCH 3 (2026-10-15) ==============================
-- Run this whole file once in the Supabase SQL Editor (Batch 3).
-- 1. Schema: supabase/migrations/20261015000000_places_referrals_travel.sql
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

-- 2. Content: the NRI essentials guides (supabase/oneoff/2026-10-15-batch3/essentials_guides.sql)
-- NRI essentials guides, pinned at the top of Guides (category 'Essentials',
-- shown for every city). Written in the name of the first admin. Safe to run
-- again: a guide with the same title isn't added twice.
INSERT INTO public.docs (user_id, title, excerpt, content, category, city, read_time)
SELECT admin.user_id, g.title, g.excerpt, g.content, 'Essentials', 'Everywhere', g.read_time
FROM (SELECT a.user_id FROM public.admins a JOIN public.profiles p ON p.id = a.user_id ORDER BY a.created_at LIMIT 1) admin,
(VALUES
('Your first weeks abroad: a checklist', 'The practical things to sort out in your first month, and how not to miss the India-side ones.', '2 min read', $g$Moving abroad comes with a long to-do list. These are the steps most of us wish we had known on day one.

IN YOUR NEW COUNTRY
• Register your address if your country requires it (for example the Anmeldung in Germany).
• Open a local bank account and get a local phone number.
• Get health insurance sorted before you need it.
• Apply for your tax or social security number.
• Keep digital copies of your passport, visa, residence permit, degree certificates and job contract.

ON THE INDIA SIDE
• Tell your Indian bank you are now an NRI. Resident savings accounts must be changed to NRO accounts (see the NRE/NRO guide).
• Update your status with mutual funds, demat accounts and insurance policies too.
• Keep your PAN; you will need it for investments and taxes in India.

ON NRICLUB
• Join your city group and introduce yourself.
• Add a photo so people recognise you at meetups.
• Look at Events for festivals and meetups near you.

General information only, not legal or tax advice. Rules differ by country and change over time.$g$),

('Renewing your Indian passport abroad', 'Where to apply, when to start and what to keep ready.', '2 min read', $g$Indian passports are renewed through the Indian embassy or consulate for the area you live in.

HOW IT WORKS
• Fill in the application on Passport Seva for embassies and consulates: embassy.passportindia.gov.in
• In many countries you then submit it at an outsourced service centre (for example VFS Global or BLS International). Your embassy's website says which one, and the fees.
• You can usually apply up to a year before your passport expires. Start early: processing and police verification can take several weeks.

KEEP READY
• Your current passport (and copies of its first and last pages)
• Your visa or residence permit
• Proof of your address abroad
• Passport photos in the required size

TIPS
• Check your embassy's website for the exact document list; it differs by country.
• Many countries require a passport valid for months beyond your stay, so do not leave it to the last minute.

General information only. Always follow your embassy's current instructions.$g$),

('OCI card: the basics', 'For members who have taken another citizenship, or whose children were born abroad.', '2 min read', $g$India does not allow dual citizenship. If you take another country's citizenship, you give up your Indian passport. The Overseas Citizenship of India (OCI) card keeps a lifelong link to India.

WHO CAN GET IT
• Foreign citizens of Indian origin, and their children
• Foreign spouses of Indian citizens or OCI cardholders (after at least two years of marriage)

WHAT IT GIVES YOU
• A lifelong multiple-entry visa for India
• No need to register with the police in India
• Parity with NRIs in many economic and educational matters

WHAT IT DOES NOT GIVE YOU
• It is not citizenship: no voting, and limits on buying agricultural land and on some government jobs
• Visits to some protected areas still need a permit

HOW TO APPLY
• Apply online at ociservices.gov.in, then follow your embassy's process.
• If you are giving up Indian citizenship, you will also need to surrender your Indian passport (renunciation).
• When you get a new foreign passport, check on ociservices.gov.in whether you need to update your OCI details. The rules were simplified in 2021.

General information only. Check ociservices.gov.in and your embassy for current rules.$g$),

('NRE, NRO and FCNR accounts explained', 'Which Indian bank account to use for what, once you are an NRI.', '2 min read', $g$Once you live abroad, Indian rules (FEMA) say your bank accounts in India must change. Here is what each account type is for.

NRE ACCOUNT (Non-Resident External)
• For money you earn abroad and send to India
• Held in rupees; money and interest can be moved back abroad freely
• Interest is tax-free in India (it may still be taxable in your country)

NRO ACCOUNT (Non-Resident Ordinary)
• For income you earn in India: rent, dividends, pension
• Your old resident savings account becomes an NRO account
• Interest is taxable in India, and tax is deducted at source
• Money can be sent abroad up to a yearly limit (currently USD 1 million per financial year), with the right forms

FCNR(B) DEPOSIT
• A fixed deposit held in a foreign currency (for example USD, GBP, EUR)
• Protects you from rupee exchange-rate swings

WHAT TO DO
• Tell your bank you have become an NRI and convert your accounts.
• Keep your PAN linked to your accounts.
• Ask your bank about the tax treaty (DTAA) between India and your country to reduce tax on NRO interest.

General information only, not financial or tax advice.$g$),

('Taxes in India when you live abroad', 'When India taxes your income, and when you still need to file a return.', '2 min read', $g$WHO COUNTS AS AN NRI FOR TAX
• Broadly, you are a non-resident for a financial year (April to March) if you spent fewer than 182 days in India in that year. There are extra conditions for people with higher Indian income, so check carefully.

WHAT INDIA TAXES
• As an NRI, India taxes only income earned or received in India: rent, interest on NRO accounts, capital gains on Indian investments.
• Your salary earned abroad is not taxed in India.

FILING A RETURN
• File an income tax return in India if your Indian income is above the basic exemption limit, or if tax was deducted (TDS) and you want a refund.
• Returns are filed on incometax.gov.in.

AVOIDING DOUBLE TAX
• India has tax treaties (DTAA) with most countries. With a Tax Residency Certificate from your country, you can often pay less tax in India, or claim credit for it abroad.

A chartered accountant who works with NRIs can save you a lot of trouble.

General information only, not tax advice.$g$),

('Sending money home: getting a good deal', 'How to compare transfers so more of your money arrives.', '1 min read', $g$The real cost of a transfer is the fee plus the exchange-rate markup.

HOW TO COMPARE
• Look up the mid-market rate (the one you see on Google).
• Compare it with the rate the bank or service gives you. The difference is a hidden fee.
• Add the fixed fee. Compare the amount that arrives in rupees, not the fee alone.

GOOD HABITS
• Compare a bank transfer with online money-transfer services; the cheapest option often changes.
• Sending to an NRE account keeps the money repatriable (you can move it back abroad).
• Keep records of your transfers; they help with taxes and loans later.
• Never use informal channels (hawala). They are illegal and risky.

General information only.$g$),

('Parents visiting you abroad', 'Visas, insurance and making the journey easy for them.', '2 min read', $g$VISAS
• Most countries need a visitor visa for Indian parents. Examples: a Schengen visa for most of Europe, a B-2 visa for the USA, a Standard Visitor visa for the UK. Canada also offers a Super Visa for parents and grandparents.
• You will usually need an invitation letter, proof of your residence status, proof of funds and their return tickets.
• Book visa appointments early; waiting times can be long.

INSURANCE
• Travel medical insurance is essential, and required for many visas (Schengen asks for at least EUR 30,000 of cover).

THE JOURNEY
• Choose direct flights if you can, and request wheelchair or meet-and-assist service when booking if needed.
• Find a travel companion for them on NRIClub: Market, Travel companion.
• Write your address and phone number on a card in their bag, in English and the local language.

General information only. Check the official visa website of your country.$g$),

('Help from the Indian embassy or consulate', 'What the embassy can do for you, and what to do in an emergency.', '1 min read', $g$WHAT EMBASSIES AND CONSULATES DO
• Passport renewal, emergency travel documents, OCI services, attestation of documents
• Help for Indians in distress (for example through the Indian Community Welfare Fund in many countries)

USEFUL LINKS
• MADAD (madad.gov.in): raise a consular request or complaint with the Ministry of External Affairs
• Your embassy's website: opening hours, fees and the service centre it uses

IF YOU LOSE YOUR PASSPORT
• Report it to the local police and keep the report.
• Contact the embassy or consulate for a new passport, or an Emergency Certificate if you need to travel to India urgently.
• Having scanned copies of your passport makes this much faster.

General information only.$g$),

('PAN, Aadhaar and voting as an NRI', 'Which Indian IDs you still need, and how NRIs can vote.', '1 min read', $g$PAN
• Keep your PAN. You need it to invest in India, sell property, open or keep bank and demat accounts, and file tax returns.
• Update your residential status (NRI) with your bank and investment platforms.

AADHAAR
• Aadhaar is optional for NRIs. NRIs with a valid Indian passport can apply when visiting India.
• If you have both PAN and Aadhaar, check on incometax.gov.in whether linking applies to you.

VOTING
• NRIs who hold an Indian passport can register as overseas electors (Form 6A on voters.eci.gov.in).
• You vote in person at your constituency in India; there is no postal or online voting for NRIs at present.

General information only. Check the official websites for current rules.$g$),

('Finding Indian groceries, food and festivals near you', 'Atta, dal, spices and celebrations, wherever you live.', '1 min read', $g$GROCERIES
• Open your city group and look at Places: members list the Indian grocery shops, restaurants and temples they recommend. Add your favourites too.
• Turkish, Middle Eastern and Asian shops are good backups for lentils, rice, spices and paneer-style cheese.
• Many countries have online Indian grocery delivery; ask in your city group which ones members trust.

FESTIVALS
• Look at Events for Diwali, Holi, Navratri and cricket screenings near you.
• Nothing near you? Host an event; others are probably waiting for one.

Ask in your city group. Someone has always found that one shop with the right atta.$g$)
) AS g(title, excerpt, read_time, content)
WHERE NOT EXISTS (SELECT 1 FROM public.docs d WHERE d.category = 'Essentials' AND d.title = g.title);


-- ======================== BATCH 4 (2026-10-16) ==============================
-- Run this whole file once in the Supabase SQL Editor (Batch 4), AFTER the
-- Batch 3 file (supabase/oneoff/2026-10-15-batch3/run_in_sql_editor.sql).
-- Schema: supabase/migrations/20261016000000_city_pages_ambassadors.sql

DO $$
BEGIN
  IF to_regclass('public.places') IS NULL THEN
    RAISE EXCEPTION 'Run the Batch 3 file (2026-10-15-batch3/run_in_sql_editor.sql) first, then this one.';
  END IF;
END;
$$;

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


-- ======================== BATCH 5 (2026-10-17) ==============================
-- Run this whole file once in the Supabase SQL Editor (Batch 5), AFTER the
-- Batch 3 (2026-10-15) and Batch 4 (2026-10-16) files. Then, if you like,
-- run starter_posts.sql (a pinned welcome post in each city group with members).
-- Schema: supabase/migrations/20261017000000_answers_topics_ambassador_tools.sql

DO $$
BEGIN
  IF to_regclass('public.places') IS NULL THEN
    RAISE EXCEPTION 'Run the Batch 3 file (2026-10-15-batch3/run_in_sql_editor.sql) first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'ambassador_city') THEN
    RAISE EXCEPTION 'Run the Batch 4 file (2026-10-16-batch4/run_in_sql_editor.sql) first.';
  END IF;
END;
$$;

-- ============================================================================
-- NRIclub: answers, thanks, urgent help, "Ask me about", professionals,
-- starter posts, language and university groups, city stats (2026-10-17)
--
--   * Ask: the asker marks the best answer (the question then counts as
--     answered); members thank helpful answers (public.answer_thanks);
--     urgent questions from verified members alert members of the asker's
--     city and its ambassador (one urgent question per member a day, counted
--     in private.urgent_log so deleting the question doesn't reset it).
--     Questions keep the asker's city, so open questions can be shown to
--     members nearby.
--   * Notifications the database sends by itself: an answer to your
--     question, a thank-you, your answer chosen as the best, someone going
--     to your event, an urgent question in your city, and (for ambassadors)
--     a new member in their city.
--   * profiles.ask_me_about: up to five topics a member can help with.
--   * Places: doctors, tax and accounts, lawyers and driving schools, with
--     the languages they speak.
--   * groups.pinned_post_id: a starter post at the top of a group, pinned by
--     an admin or by the city's ambassador (public.pin_group_post).
--   * Group categories 'Language' and 'University', and language groups.
--   * public.admin_city_stats(): members and activity per city, for admins.
--   * public.city_summary() also finds a city by its address form
--     ("new-york" for New York).
-- Needs the 2026-10-15 (places) and 2026-10-16 (ambassadors) changes.
-- No existing rows change, apart from adding the language groups.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- NOTIFICATION TYPES
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications
  DROP CONSTRAINT notifications_type_check,
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'like', 'comment', 'request', 'event', 'group', 'trending', 'message', 'verification',
    'answer', 'thanks', 'best', 'rsvp', 'urgent', 'member'));

-- Sends one notification, unless it's to yourself, one of the two blocked
-- the other, the recipient can't take part (blocked, rejected or held, as
-- in private.is_active_member), or the same notification (person, kind,
-- sender, question/event/group) was already sent: thanking, going or
-- joining again doesn't notify again. Used by the triggers below (never
-- by members directly).
CREATE FUNCTION private.notify(p_user UUID, p_type TEXT, p_actor UUID, p_text TEXT, p_ref UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.notifications (user_id, type, actor_id, text, reference_id)
  SELECT p_user, p_type, p_actor, LEFT(p_text, 1000), p_ref
  WHERE p_user IS NOT NULL AND p_user IS DISTINCT FROM p_actor
    AND (p_actor IS NULL OR NOT private.is_blocked_between(p_actor, p_user))
    AND EXISTS (
      SELECT 1 FROM public.profile_private pp
      WHERE pp.id = p_user AND pp.status = 'active'
        AND pp.verification_status IN ('pending', 'needs_info', 'approved')
        AND (pp.review_flag = '' OR pp.verification_status = 'approved'))
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = p_user AND n.type = p_type
        AND n.actor_id IS NOT DISTINCT FROM p_actor AND n.reference_id IS NOT DISTINCT FROM p_ref);
$$;

-- "Your question" in a notification: the title, shortened.
CREATE FUNCTION private.short_title(p_title TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN char_length(p_title) > 80 THEN LEFT(p_title, 77) || '...' ELSE p_title END;
$$;

-- The city group's name for a city, compared without case.
CREATE FUNCTION private.city_group_name(p_city TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT lower('Indians in ' || btrim(p_city));
$$;

-- ---------------------------------------------------------------------------
-- ASK: city, best answer, urgent
-- ---------------------------------------------------------------------------
ALTER TABLE public.help_requests
  ADD COLUMN city TEXT NOT NULL DEFAULT '' CHECK (char_length(city) <= 200),
  ADD COLUMN urgent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN best_response_id UUID REFERENCES public.help_responses(id) ON DELETE SET NULL;
CREATE INDEX idx_help_requests_city ON public.help_requests (lower(city));
CREATE INDEX idx_help_requests_best_response ON public.help_requests(best_response_id);

-- The asker can't change who asked, the counts, the city or "urgent" later
-- (urgent alerts go out once, when the question is posted).
DROP TRIGGER protect_columns ON public.help_requests;
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.help_requests
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns(
    '{"responses_count": 0, "status": "Open", "best_response_id": null}',
    'user_id', 'responses_count', 'created_at', 'city', 'urgent');

-- Urgent questions per member, kept when the question is deleted, so the
-- one-a-day limit can't be reset. Only the database itself reads it.
CREATE TABLE private.urgent_log (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_urgent_log_user ON private.urgent_log (user_id, sent_at DESC);
REVOKE ALL ON private.urgent_log FROM PUBLIC;

-- New question: the city is the asker's own; one urgent question a day.
-- Best answer: it must be an answer to this question, and the question's
-- status follows it (Resolved with a best answer, Open without).
CREATE FUNCTION private.check_help_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.city := COALESCE((SELECT p.city FROM public.profiles p WHERE p.id = NEW.user_id), '');
    IF NEW.urgent THEN
      -- Two urgent questions sent at the same moment are checked one by one.
      PERFORM pg_advisory_xact_lock(hashtext('nriclub-urgent:' || NEW.user_id::text));
      IF EXISTS (SELECT 1 FROM private.urgent_log u
                 WHERE u.user_id = NEW.user_id AND u.sent_at > NOW() - INTERVAL '1 day') THEN
        RAISE EXCEPTION 'You can post one urgent question a day.' USING ERRCODE = '42501';
      END IF;
      INSERT INTO private.urgent_log (user_id) VALUES (NEW.user_id);
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.best_response_id IS DISTINCT FROM OLD.best_response_id THEN
    IF NEW.best_response_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.help_responses r WHERE r.id = NEW.best_response_id AND r.request_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'That answer belongs to another question.' USING ERRCODE = '23514';
    END IF;
    NEW.status := CASE WHEN NEW.best_response_id IS NULL THEN 'Open' ELSE 'Resolved' END;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER check_help_request BEFORE INSERT OR UPDATE ON public.help_requests
  FOR EACH ROW EXECUTE FUNCTION private.check_help_request();

-- Urgent question from a verified member: the city's ambassadors and the
-- members of the asker's city group (the 500 who joined most recently)
-- hear about it.
CREATE FUNCTION private.notify_urgent_question()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT NEW.urgent OR NEW.city = '' OR NOT EXISTS (
    SELECT 1 FROM public.profile_private pp WHERE pp.id = NEW.user_id AND pp.verification_status = 'approved'
  ) THEN
    RETURN NULL;
  END IF;
  PERFORM private.notify(r.user_id, 'urgent', NEW.user_id,
    'needs urgent help in ' || NEW.city || ': ' || private.short_title(NEW.title), NEW.id)
  FROM (
    SELECT p.id AS user_id FROM public.profiles p
    WHERE p.ambassador_city <> '' AND private.city_group_name(p.ambassador_city) = private.city_group_name(NEW.city)
    UNION
    (SELECT gm.user_id FROM public.group_members gm
     JOIN public.groups g ON g.id = gm.group_id
     WHERE g.is_approved AND lower(g.name) = private.city_group_name(NEW.city)
     ORDER BY gm.joined_at DESC
     LIMIT 500)
  ) r;
  RETURN NULL;
END;
$$;
CREATE TRIGGER notify_urgent_question AFTER INSERT ON public.help_requests
  FOR EACH ROW EXECUTE FUNCTION private.notify_urgent_question();

-- Best answer chosen: its author hears about it.
CREATE FUNCTION private.notify_best_answer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.best_response_id IS NOT NULL AND NEW.best_response_id IS DISTINCT FROM OLD.best_response_id THEN
    DELETE FROM public.notifications n
    WHERE n.type = 'best' AND n.actor_id = NEW.user_id AND n.reference_id = NEW.id
      AND n.user_id IS DISTINCT FROM (SELECT r.user_id FROM public.help_responses r WHERE r.id = NEW.best_response_id);
    PERFORM private.notify(r.user_id, 'best', NEW.user_id,
      'chose your answer as the best answer: ' || private.short_title(NEW.title), NEW.id)
    FROM public.help_responses r WHERE r.id = NEW.best_response_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER notify_best_answer AFTER UPDATE OF best_response_id ON public.help_requests
  FOR EACH ROW EXECUTE FUNCTION private.notify_best_answer();

-- A deleted question takes its notifications with it.
CREATE FUNCTION private.forget_question_notifications()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.notifications n
  WHERE n.reference_id = OLD.id AND n.type IN ('answer', 'thanks', 'best', 'urgent');
  RETURN NULL;
END;
$$;
CREATE TRIGGER forget_question_notifications AFTER DELETE ON public.help_requests
  FOR EACH ROW EXECUTE FUNCTION private.forget_question_notifications();

-- A new answer: the asker hears about it.
CREATE FUNCTION private.notify_new_answer()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.notify(h.user_id, 'answer', NEW.user_id,
    'answered your question: ' || private.short_title(h.title), h.id)
  FROM public.help_requests h WHERE h.id = NEW.request_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER notify_new_answer AFTER INSERT ON public.help_responses
  FOR EACH ROW EXECUTE FUNCTION private.notify_new_answer();

-- ---------------------------------------------------------------------------
-- THANKS FOR AN ANSWER
-- ---------------------------------------------------------------------------
ALTER TABLE public.help_responses
  ADD COLUMN thanks_count INTEGER NOT NULL DEFAULT 0;
DROP TRIGGER protect_columns ON public.help_responses;
CREATE TRIGGER protect_columns BEFORE INSERT ON public.help_responses
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{"thanks_count": 0}');

CREATE TABLE public.answer_thanks (
  response_id UUID NOT NULL REFERENCES public.help_responses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (response_id, user_id)
);
CREATE INDEX idx_answer_thanks_user ON public.answer_thanks(user_id);
ALTER TABLE public.answer_thanks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.answer_thanks FROM anon;

CREATE POLICY "Members can view thanks" ON public.answer_thanks
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT private.can_browse()));
CREATE POLICY "Members can thank other members' answers" ON public.answer_thanks
  FOR INSERT TO authenticated WITH CHECK (
    user_id = (SELECT auth.uid()) AND (SELECT private.is_active_member())
    AND EXISTS (SELECT 1 FROM public.help_responses r
                WHERE r.id = response_id AND r.user_id <> (SELECT auth.uid())));
CREATE POLICY "Members can take back thanks" ON public.answer_thanks
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE TRIGGER protect_columns BEFORE INSERT ON public.answer_thanks
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns('{}');

-- Keeps help_responses.thanks_count, and tells the answer's author.
CREATE FUNCTION private.update_thanks_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.help_responses SET thanks_count = thanks_count + 1 WHERE id = NEW.response_id;
    PERFORM private.notify(r.user_id, 'thanks', NEW.user_id,
      'thanked you for your answer: ' || private.short_title(h.title), h.id)
    FROM public.help_responses r JOIN public.help_requests h ON h.id = r.request_id
    WHERE r.id = NEW.response_id;
  ELSE
    UPDATE public.help_responses SET thanks_count = GREATEST(thanks_count - 1, 0) WHERE id = OLD.response_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER update_thanks_count AFTER INSERT OR DELETE ON public.answer_thanks
  FOR EACH ROW EXECUTE FUNCTION private.update_thanks_count();

-- How many members thanked this member for an answer ("Helped 12 members").
CREATE FUNCTION public.member_helped_count(p_member UUID)
RETURNS INTEGER LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT count(DISTINCT t.user_id)::INTEGER
  FROM public.answer_thanks t JOIN public.help_responses r ON r.id = t.response_id
  WHERE r.user_id = p_member;
$$;

-- ---------------------------------------------------------------------------
-- EVENTS: the organizer hears who is going
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.notify_rsvp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Going, not going, going again: private.notify sends it once.
  PERFORM private.notify(e.organizer_id, 'rsvp', NEW.user_id,
    'is going to ' || private.short_title(e.title), e.id)
  FROM public.events e WHERE e.id = NEW.event_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER notify_rsvp AFTER INSERT ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION private.notify_rsvp();

-- ---------------------------------------------------------------------------
-- AMBASSADORS: a new member in their city
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.notify_new_city_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.notify(p.id, 'member', NEW.user_id,
    'joined ' || g.name || '. Say hello!', g.id)
  FROM public.groups g
  JOIN public.profiles p ON p.ambassador_city <> '' AND private.city_group_name(p.ambassador_city) = lower(g.name)
  WHERE g.id = NEW.group_id AND g.category = 'City';
  RETURN NULL;
END;
$$;
CREATE TRIGGER notify_new_city_member AFTER INSERT ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION private.notify_new_city_member();

-- ---------------------------------------------------------------------------
-- "ASK ME ABOUT" (up to five topics, separated by commas)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN ask_me_about TEXT NOT NULL DEFAULT '' CHECK (char_length(ask_me_about) <= 300);

-- ---------------------------------------------------------------------------
-- PLACES: professionals, and the languages they speak
-- ---------------------------------------------------------------------------
ALTER TABLE public.places
  DROP CONSTRAINT places_kind_check,
  ADD CONSTRAINT places_kind_check CHECK (kind IN (
    'Grocery', 'Restaurant', 'Temple', 'Shop', 'Doctor', 'Tax & accounts', 'Lawyer', 'Driving school', 'Other')),
  ADD COLUMN languages TEXT NOT NULL DEFAULT '' CHECK (char_length(languages) <= 100);

-- ---------------------------------------------------------------------------
-- GROUPS: starter post, new categories, language groups
-- ---------------------------------------------------------------------------
ALTER TABLE public.groups
  DROP CONSTRAINT groups_category_check,
  ADD CONSTRAINT groups_category_check CHECK (category IN (
    'City', 'Professional', 'Interest', 'Support', 'Language', 'University')),
  ADD COLUMN pinned_post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;
CREATE INDEX idx_groups_pinned_post ON public.groups(pinned_post_id);
DROP TRIGGER protect_columns ON public.groups;
CREATE TRIGGER protect_columns BEFORE INSERT OR UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION private.protect_columns(
    '{"is_approved": false, "members_count": 0, "pinned_post_id": null}',
    'created_by', 'is_approved', 'members_count', 'created_at', 'pinned_post_id');

-- Pins one of the group's posts at the top (NULL unpins). Admins can pin in
-- any group; an ambassador in their own city's group.
CREATE FUNCTION public.pin_group_post(p_group UUID, p_post UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me UUID := (SELECT auth.uid());
BEGIN
  IF NOT (private.is_admin() OR (private.is_active_member() AND EXISTS (
    SELECT 1 FROM public.groups g JOIN public.profiles p ON p.id = me
    WHERE g.id = p_group AND g.category = 'City' AND p.ambassador_city <> ''
      AND lower(g.name) = private.city_group_name(p.ambassador_city)))) THEN
    RAISE EXCEPTION 'Only the city''s ambassador can pin posts here.' USING ERRCODE = '42501';
  END IF;
  IF p_post IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.posts x WHERE x.id = p_post AND x.group_id = p_group
  ) THEN
    RAISE EXCEPTION 'That post isn''t in this group.' USING ERRCODE = '23514';
  END IF;
  UPDATE public.groups SET pinned_post_id = p_post WHERE id = p_group;
END;
$$;

INSERT INTO public.groups (name, description, category, is_approved) VALUES
  ('Tamil community', 'For Tamil speakers living outside India: language, food, festivals and friends.', 'Language', true),
  ('Telugu community', 'For Telugu speakers living outside India: language, food, festivals and friends.', 'Language', true),
  ('Malayali community', 'For Malayalis living outside India: Onam, food, films and friends.', 'Language', true),
  ('Kannada community', 'For Kannada speakers living outside India: language, food, festivals and friends.', 'Language', true),
  ('Bengali community', 'For Bengalis living outside India: Durga Puja, food, books and friends.', 'Language', true),
  ('Gujarati community', 'For Gujaratis living outside India: Navratri, food, business and friends.', 'Language', true),
  ('Marathi community', 'For Marathi speakers living outside India: Ganeshotsav, food and friends.', 'Language', true),
  ('Punjabi community', 'For Punjabis living outside India: Baisakhi, gurdwaras, food and friends.', 'Language', true),
  ('Hindi speakers', 'For Hindi speakers living outside India: films, books, festivals and friends.', 'Language', true),
  ('Odia community', 'For Odia speakers living outside India: Rath Yatra, food and friends.', 'Language', true),
  ('Parents'' corner', 'For parents visiting their children abroad, and for families planning a visit: travel, insurance, meeting other parents.', 'Support', true),
  ('Indian students abroad', 'For Indian students everywhere: admissions, visas, part-time jobs, housing and your first months abroad.', 'University', true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- CITY PAGES: find a city by its address form too ("new-york")
-- ---------------------------------------------------------------------------
-- Same as slug() on the site: accents dropped ("Düsseldorf" -> "dusseldorf").
CREATE FUNCTION private.slug(p_text TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT btrim(regexp_replace(lower(regexp_replace(normalize(COALESCE(p_text, ''), NFKD), '[\u0300-\u036f]', '', 'g')),
    '[^a-z0-9]+', '-', 'g'), '-');
$$;

CREATE OR REPLACE FUNCTION public.city_summary(p_city TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH q AS (SELECT LEFT(btrim(COALESCE(p_city, '')), 100) AS raw),
  grp AS (
    SELECT x.name, x.members_count FROM public.groups x, q
    WHERE x.is_approved AND x.category = 'City'
      AND private.slug(x.name) = private.slug('Indians in ' || q.raw)
    ORDER BY x.members_count DESC LIMIT 1
  ),
  c AS (
    SELECT COALESCE((SELECT substr(grp.name, 12) FROM grp), replace(q.raw, '-', ' ')) AS city FROM q WHERE q.raw <> ''
  )
  SELECT jsonb_build_object(
    'city', c.city,
    'group', EXISTS (SELECT 1 FROM grp),
    'members', COALESCE((SELECT grp.members_count FROM grp), 0),
    'events', (SELECT count(*) FROM public.events e WHERE e.location ILIKE '%' || c.city || '%' OR e.city ILIKE c.city),
    'places', (SELECT count(*) FROM public.places p WHERE lower(p.city) = lower(c.city))
  )
  FROM c;
$$;

-- ---------------------------------------------------------------------------
-- ADMIN: members and activity per city
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.admin_city_stats()
RETURNS TABLE (city TEXT, members INTEGER, joined_7d INTEGER, joined_30d INTEGER,
               posts_30d INTEGER, questions_30d INTEGER, events_upcoming INTEGER, ambassadors TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Admins only.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT substr(g.name, 12),
    g.members_count,
    (SELECT count(*)::INTEGER FROM public.group_members m WHERE m.group_id = g.id AND m.joined_at > NOW() - INTERVAL '7 days'),
    (SELECT count(*)::INTEGER FROM public.group_members m WHERE m.group_id = g.id AND m.joined_at > NOW() - INTERVAL '30 days'),
    (SELECT count(*)::INTEGER FROM public.posts p WHERE p.group_id = g.id AND p.created_at > NOW() - INTERVAL '30 days'),
    (SELECT count(*)::INTEGER FROM public.help_requests h WHERE lower(h.city) = lower(substr(g.name, 12)) AND h.created_at > NOW() - INTERVAL '30 days'),
    (SELECT count(*)::INTEGER FROM public.events e WHERE e.date >= to_char(CURRENT_DATE, 'YYYY-MM-DD') AND (e.city ILIKE substr(g.name, 12) OR e.location ILIKE '%' || substr(g.name, 12) || '%')),
    COALESCE((SELECT string_agg(p.name, ', ' ORDER BY p.name) FROM public.profiles p
              WHERE p.ambassador_city <> '' AND private.city_group_name(p.ambassador_city) = lower(g.name)), '')
  FROM public.groups g
  WHERE g.is_approved AND g.category = 'City'
  ORDER BY g.members_count DESC, g.name;
END;
$$;

-- ---------------------------------------------------------------------------
-- "DOWNLOAD MY DATA" also includes hidden conversations, places, place
-- recommendations and thanks
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'exported_at', NOW(),
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = uid),
    'profile_private', (SELECT to_jsonb(pp) FROM public.profile_private pp WHERE pp.id = uid),
    'user_settings', (SELECT to_jsonb(s) FROM public.user_settings s WHERE s.user_id = uid),
    'verification_log', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'decision', l.decision, 'member_message', l.member_message, 'created_at', l.created_at)
        || CASE WHEN l.actor_id = uid THEN jsonb_build_object('note', l.admin_note) ELSE '{}'::jsonb END
        ORDER BY l.created_at)
      FROM public.verification_log l WHERE l.member_id = uid), '[]'::jsonb),
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
    'help_responses', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.help_responses x WHERE x.user_id = uid), '[]'::jsonb),
    'notifications', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.notifications x WHERE x.user_id = uid), '[]'::jsonb),
    'reports_filed', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.reports x WHERE x.reporter_id = uid), '[]'::jsonb),
    'blocks', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.blocks x WHERE x.blocker_id = uid), '[]'::jsonb),
    'conversations_hidden', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.hidden_at)
      FROM public.conversation_hides x WHERE x.user_id = uid), '[]'::jsonb),
    'places_added', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.places x WHERE x.created_by = uid), '[]'::jsonb),
    'place_recommendations', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.place_recommendations x WHERE x.user_id = uid), '[]'::jsonb),
    'answer_thanks', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at)
      FROM public.answer_thanks x WHERE x.user_id = uid), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- PERMISSIONS
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION private.notify(UUID, TEXT, UUID, TEXT, UUID), private.short_title(TEXT),
  private.city_group_name(TEXT), private.check_help_request(), private.notify_urgent_question(),
  private.notify_best_answer(), private.notify_new_answer(), private.update_thanks_count(),
  private.notify_rsvp(), private.notify_new_city_member(), private.slug(TEXT),
  private.forget_question_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.forget_question_notifications(), private.check_help_request(), private.notify_urgent_question(),
  private.notify_best_answer(), private.notify_new_answer(), private.update_thanks_count(),
  private.notify_rsvp(), private.notify_new_city_member() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.notify(UUID, TEXT, UUID, TEXT, UUID), private.short_title(TEXT),
  private.city_group_name(TEXT), private.slug(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.member_helped_count(UUID), public.pin_group_post(UUID, UUID),
  public.admin_city_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_helped_count(UUID), public.pin_group_post(UUID, UUID),
  public.admin_city_stats() TO authenticated;


-- ======================== WELCOME POSTS =====================================
-- A pinned "Start here" post from the NRIClub team in every city group that
-- has members (written in the name of the first admin). It shows at the top
-- of its group, not in everyone's Home feed. Run it after the Batch 5 file.
-- Safe to run again later, when more cities have members: groups that
-- already have a pinned post, or already got this welcome post, are left
-- alone, and an ambassador can pin their own post instead at any time.
WITH admin AS (
  SELECT a.user_id FROM public.admins a JOIN public.profiles p ON p.id = a.user_id
  ORDER BY a.created_at LIMIT 1
),
target AS (
  SELECT g.id, substr(g.name, 12) AS city FROM public.groups g, admin
  WHERE g.is_approved AND g.category = 'City' AND g.name LIKE 'Indians in %'
    AND g.pinned_post_id IS NULL AND g.members_count > 0
    AND NOT EXISTS (SELECT 1 FROM public.posts x
                    WHERE x.group_id = g.id AND x.user_id = admin.user_id AND x.content LIKE 'Welcome to Indians in %')
),
ins AS (
  INSERT INTO public.posts (user_id, content, group_id)
  SELECT admin.user_id, format($p$Welcome to Indians in %1$s 🙏

This is the place to meet Indians who live in %1$s and help each other.

Start here:
• Say hello below: where you're from in India, how long you've been in %1$s, and one tip for newcomers.
• Ask anything in Ask & Guides: housing, visas, doctors, where to buy atta. Members in %1$s see open questions on their home page.
• Add the Indian groceries, restaurants, temples and doctors you trust in the Places tab.
• See what's on in Events, or host the first meetup.
• New in town? Read "Your first weeks abroad: a checklist" in Guides.

Would you like to bring Indians in %1$s together? Become our %1$s ambassador: write to hello@nriclub.app.

The NRIClub team$p$, t.city), t.id
  FROM admin, target t
  RETURNING id, group_id
)
UPDATE public.groups g SET pinned_post_id = ins.id FROM ins WHERE g.id = ins.group_id;
