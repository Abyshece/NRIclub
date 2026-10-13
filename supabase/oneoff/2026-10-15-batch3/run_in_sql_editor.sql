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
