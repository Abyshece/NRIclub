-- The first 30 news posts for nriclub.app/news, as drafts (status 'draft'):
-- our team reads each one in the admin panel (News) and publishes it there.
-- Facts checked against the sources listed with each post on 27 October 2026.
-- Can be run again: posts already there (same address) are left as they are.
INSERT INTO public.news_posts (slug, title, topic, city, summary, body, sources)
VALUES
('blue-card-salary-thresholds-2026', 'Blue Card 2026: the minimum salaries you need now', 'visa', '', 'Since 1 January 2026 a new EU Blue Card in Germany needs a gross salary of at least €50,700 a year, or €45,934.20 in shortage jobs and for recent graduates.', 'The minimum salaries for the EU Blue Card are set once a year. For applications in 2026 they are:

- €50,700 gross a year as the general threshold
- €45,934.20 gross a year in shortage occupations (for example IT, engineering, medicine and nursing) and for graduates whose degree is less than three years old

WHAT COUNTS
Only your fixed gross salary in the contract counts. Bonuses, overtime and allowances that aren''t guaranteed usually don''t.

WHERE THE NUMBERS COME FROM
The thresholds are tied to the ceiling for pension contributions: 50 percent of it for the general threshold and 45.3 percent for the reduced one. The Federal Ministry of the Interior published the 2026 figures in the Bundesanzeiger in December 2025.

WHAT TO DO
If your offer is close to the line, compare it with the figure for the year in which you apply, not the year you signed. Already have a Blue Card? A new threshold doesn''t take it away, but your salary can be checked again when you extend it or change jobs.', '[{"name": "Berlin service portal: EU Blue Card", "url": "https://service.berlin.de/dienstleistung/324659/"}, {"name": "Bundesanzeiger: notice of 2 December 2025", "url": "https://www.bundesanzeiger.de/pub/publication/REViP4bN6jVdpGxPaiQ/content/REViP4bN6jVdpGxPaiQ/BAnz%20AT%2018.12.2025%20B3.pdf"}]'::jsonb),
('blue-card-2027-expected-thresholds', 'Blue Card 2027: what the new salary thresholds are likely to be', 'visa', '', 'The cabinet raised the pension contribution ceiling for 2027. If it is confirmed, the Blue Card minimum salary would rise to about €53,100, or €48,108.60 in shortage jobs.', 'On 12 October 2026 the federal government announced that the cabinet had adopted the social security figures for 2027. The pension contribution ceiling is set to rise to €8,850 a month, or €106,200 a year. The Bundesrat still has to approve it.

WHY THIS MATTERS FOR THE BLUE CARD
The Blue Card thresholds follow that ceiling: 50 percent of it for the general threshold and 45.3 percent for shortage occupations and recent graduates. If the ceiling is confirmed, that would mean:

- about €53,100 gross a year as the general threshold
- about €48,108.60 gross a year in shortage occupations and for recent graduates

These are our calculation, not yet official figures. The Federal Ministry of the Interior publishes the binding thresholds, usually in December.

WHAT TO DO
If you plan to apply, change jobs or extend your Blue Card in 2027 and your salary is near the line, talk to your employer now. For applications still in 2026, the 2026 thresholds apply: €50,700 and €45,934.20.', '[{"name": "Federal Government: contribution ceilings 2027", "url": "https://www.bundesregierung.de/breg-de/aktuelles/beitragsbemessungsgrenzen-2027-2454638"}, {"name": "Bundesanzeiger: Blue Card thresholds 2026", "url": "https://www.bundesanzeiger.de/pub/publication/REViP4bN6jVdpGxPaiQ/content/REViP4bN6jVdpGxPaiQ/BAnz%20AT%2018.12.2025%20B3.pdf"}]'::jsonb),
('no-airport-transit-visa-for-indians-germany', 'No more airport transit visa for Indians changing planes in Germany', 'visa', '', 'Since 3 June 2026, Indian passport holders no longer need an airport transit visa to change planes at a German airport on the way to another country.', 'Indian citizens flying via Frankfurt, Munich or another German airport to a third country no longer need an airport transit visa. The change was published in the Federal Law Gazette on 2 June 2026 and applies since 3 June 2026. It goes back to Chancellor Friedrich Merz''s visit to India in January 2026.

WHAT IT COVERS
- Changing planes in the international transit area of a German airport
- Onward flights to a country outside Germany

WHAT IT DOESN''T COVER
It isn''t a visa for Germany or the Schengen area. If you need to pass through passport control, for example to collect your bags, change airports or stay overnight, you still need a Schengen visa or a residence permit.

TIP FOR FAMILY VISITS
Parents flying to another country via Germany may no longer need a transit visa. Parents visiting you in Germany still need a Schengen visa as before. Check with your airline that your connection stays airside.', '[{"name": "German Missions in India", "url": "https://india.diplo.de/in-en/2773896-2773896"}]'::jsonb),
('opportunity-card-chancenkarte-what-you-need', 'Opportunity Card (Chancenkarte): what you need to apply', 'visa', '', 'The Opportunity Card lets skilled workers come to Germany for up to a year to look for a job. You must show at least €1,091 a month for your stay, €13,092 for a year.', 'The Opportunity Card (Chancenkarte) is a residence permit for looking for work in Germany. It is valid for up to one year.

WHAT YOU NEED
- A degree or a vocational qualification of at least two years, recognised by the state where you got it
- German at level A1 or English at level B2
- Either full recognition of your qualification in Germany, or enough points in a points system (for example for language skills, work experience, age and earlier stays in Germany)
- Proof that you can support yourself: at least €1,091 a month, so €13,092 for the usual 12 months, for example in a blocked account or through a declaration of commitment

WHAT YOU MAY DO WITH IT
You may work part-time while you look, up to 20 hours a week, and do trial work. Once you find a qualified job, you can switch to a work permit or a Blue Card in Germany.

TIP
The amount of €1,091 a month has applied since January 2025. Check the current figure and the documents list on the website of the German mission where you apply.', '[{"name": "German Embassy Accra: visa information", "url": "https://accra.diplo.de/gh-en/service/-VisaInformation/-/2656920"}, {"name": "German Embassy Chisinau: job seeking", "url": "https://chisinau.diplo.de/md-de/service/visa/nationale-visa/arbeitsplatzsuche-2667336"}]'::jsonb),
('student-blocked-account-2026-amount', 'Student visa: the blocked account amount stays at €992 a month', 'visa', '', 'International students must still show €992 a month, €11,904 a year, to get a German student visa. The amount didn''t change for 2026.', 'To study in Germany you must show that you can pay for your living costs. Most students from India do this with a blocked account (Sperrkonto).

THE AMOUNT
- €992 a month
- €11,904 for a full year

The figure is based on the German student grant (BAföG) and is published by the Federal Ministry of the Interior. It has been €992 a month since the winter semester 2024 and stayed the same for 2026.

HOW IT WORKS
You pay the full amount into the blocked account before your visa appointment. In Germany, the bank pays out up to €992 a month to your normal account. Instead of a blocked account, a scholarship or a declaration of commitment by someone living in Germany can also be accepted.

TIP
Providers charge set-up and monthly fees, and some add a buffer on top. Compare before you open one, and check the current amount with the German mission that handles your visa: it can change for the next year.', '[{"name": "German Embassy Quito: proof of funds", "url": "https://quito.diplo.de/ec-de/service/05-visaeinreise/2433880-2433880"}, {"name": "German Embassy Rome: blocked account", "url": "https://italien.diplo.de/it-de/service/visa-aktuell/2586756-2586756"}]'::jsonb),
('family-reunification-pause-skilled-workers', 'Family reunification pause: what it means (and doesn''t) for skilled workers', 'visa', '', 'Germany paused family reunification for people with subsidiary protection until July 2027. The pause doesn''t change the rules for spouses and children of skilled workers and Blue Card holders.', 'Since 24 July 2025, family members of people with subsidiary protection (a form of refugee protection) can''t join them in Germany for now. The pause is set to last until 23 July 2027, with exceptions only in hardship cases.

WHO IS AFFECTED
Only people with subsidiary protection, under section 36a of the Residence Act.

WHO ISN''T
The pause doesn''t change family reunification for people who live in Germany for work or study, for example:

- Blue Card holders
- skilled workers with a work permit
- researchers and students

Their spouses and children still apply under the usual rules. For Blue Card holders, spouses don''t need to prove German language skills.

WHY WE WRITE THIS
We''ve seen worried messages in community groups. If you''re here for work, the 2025 law isn''t about you. For your own case, ask the German mission in India or your Ausländerbehörde.', '[{"name": "Bundesrat: the law on the pause", "url": "https://dserver.bundestag.de/brd/2025/0284-1-25.pdf"}]'::jsonb),
('entry-exit-system-ees-schengen-visitors', 'Visiting family? The EU''s Entry/Exit System now records every short stay', 'visa', '', 'Since 10 April 2026 the Schengen borders register visitors from outside the EU digitally, with fingerprints and a photo, instead of passport stamps. People living in Germany with a residence permit are exempt.', 'The EU''s Entry/Exit System (EES) has been fully in use at all Schengen borders since 10 April 2026, after a gradual start on 12 October 2025.

WHO IT AFFECTS
People from outside the EU who come for a short stay, for example parents or relatives visiting you from India on a Schengen visa. At their first entry they give four fingerprints and a photo, and their passport data is recorded. Later trips are quicker.

WHO IS EXEMPT
If you live in Germany with a residence permit, a Blue Card or a national long-stay visa, the EES doesn''t apply to you. Carry your residence card when you travel.

WHAT IT CHANGES
- Passports are no longer stamped; the system counts the days of a short stay itself
- Overstaying the 90 days in any 180 days is spotted automatically

TIP
Queues at some airports were long when it started. Tell visiting family to plan extra time at the border, especially on their first arrival.', '[{"name": "EU travel portal: EES", "url": "https://travel-europe.europa.eu/ees_en"}]'::jsonb),
('etias-indian-passport-holders-not-needed', 'ETIAS: Indian passport holders won''t need it, and it hasn''t started', 'visa', '', 'ETIAS is a travel authorisation for visitors who don''t need a visa. Indians need a Schengen visa, so ETIAS doesn''t apply to them. The EU hasn''t set a start date yet.', 'You may have seen messages about ETIAS, the European Travel Information and Authorisation System.

WHO IT IS FOR
ETIAS is for visitors who can travel to the Schengen area without a visa, for example from the US or the UK. They will need an online authorisation before travelling.

WHAT IT MEANS FOR INDIANS
Indian passport holders need a Schengen visa for short stays, so ETIAS doesn''t apply to them. Family visiting you from India keep applying for a visa as before.

WHEN IT STARTS
Not yet. The EU had aimed for the last quarter of 2026 but took that date off its website in July 2026. It says it will announce a start date several months in advance. Until then, nobody needs ETIAS and no applications are taken.

WATCH OUT
Websites offering ETIAS applications now are not official. The only official information is on the EU''s travel portal.', '[{"name": "EU travel portal: ETIAS", "url": "https://travel-europe.europa.eu/etias_en"}]'::jsonb),
('german-citizenship-three-year-route-abolished', 'German citizenship: the three-year fast track is gone, five years is the rule', 'citizenship', '', 'Since 30 October 2025 you can no longer become German after three years for special integration. The standard waiting time is five years, and dual citizenship stays allowed.', 'The 2024 reform of German citizenship law had allowed naturalisation after only three years for people with outstanding integration, for example very good German and special achievements at work. The Bundestag scrapped that route on 8 October 2025, and the change has applied since 30 October 2025.

WHAT STILL APPLIES
- Naturalisation is generally possible after five years of legal residence
- Germany allows dual citizenship, as it has since 27 June 2024

PENDING APPLICATIONS
The new law has no transitional rule. Courts have ruled that applications not yet decided are judged under the new law, so a three-year application filed earlier usually won''t succeed.

FOR INDIANS
Germany allows dual citizenship, but India doesn''t. Becoming German means giving up your Indian citizenship. See our separate post on what that involves.', '[{"name": "Federal Ministry of the Interior: the law", "url": "https://www.bmi.bund.de/SharedDocs/gesetzgebungsverfahren/DE/VII5/gesetz-6-aenderung-des-staatsangehoerigkeitsrechts.html"}, {"name": "LTO: court ruling on pending applications", "url": "https://www.lto.de/recht/nachrichten/n/8k546125tr-vg-trier-keine-turbo-einbuergerung-trotz-rechtzeitigen-antrags"}]'::jsonb),
('record-naturalisations-germany-2025', 'Record year: 333,343 people became German in 2025', 'citizenship', '', 'Germany naturalised 333,343 people in 2025, more than ever since the statistics began in 2000. Applications rose to 469,597.', 'The Federal Statistical Office (Destatis) published the final figures for 2025 on 21 August 2026.

THE NUMBERS
- 333,343 naturalisations, the highest number since the statistics began in 2000
- about 14 percent more than in 2024
- 469,597 applications
- on average, people had lived in Germany for 12.4 years when they became German

WHERE PEOPLE CAME FROM
The largest groups were Syrian, Turkish and Russian citizens. Since 2024, most people may keep their previous citizenship, which has made naturalisation more attractive for many.

WHAT IT MEANS FOR INDIANS
India doesn''t allow dual citizenship, so Indians who become German lose their Indian passport. Many Indians in Germany therefore stay on a settlement permit, or become German and take an OCI card. Which is better depends on your plans; see our post on dual citizenship.

WAITING TIMES
High demand means long waits at many naturalisation offices. Apply as soon as you meet the requirements.', '[{"name": "Destatis: naturalisation statistics", "url": "https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Migration-Integration/auslaenderstatistik-einbuergerung.html"}, {"name": "Destatis: press release, June 2026", "url": "https://www.destatis.de/DE/Presse/Pressemitteilungen/2026/06/PD26_186_125.html"}]'::jsonb),
('becoming-german-as-an-indian-dual-citizenship', 'Becoming German as an Indian: what happens to your Indian citizenship', 'citizenship', '', 'Germany allows dual citizenship, India doesn''t. Indians who become German lose Indian citizenship, must surrender their Indian passport, and can then apply for an OCI card.', 'Since June 2024 Germany no longer asks you to give up your old citizenship. But Indian law doesn''t allow Indians to hold another citizenship at the same time.

WHAT THAT MEANS
- When you voluntarily become German, you lose Indian citizenship automatically
- You must not use your Indian passport after that
- You surrender it to the Embassy or a Consulate General of India and get a surrender certificate

THE SURRENDER CERTIFICATE
You need it for most services afterwards, including the OCI card. Apply at the Indian mission responsible for where you live, by appointment.

THE OCI CARD
As a German of Indian origin you can apply for Overseas Citizenship of India (OCI). It gives you a lifelong visa for India and lets you live and work there, but no right to vote. Applications are made online.

TIP
Plan your trips: between becoming German and getting your OCI, you need an Indian visa to travel to India.', '[{"name": "Embassy of India, Berlin", "url": "https://indianembassyberlin.gov.in/"}, {"name": "OCI services portal", "url": "https://ociservices.gov.in/"}]'::jsonb),
('indian-embassy-berlin-consular-services-direct', 'Embassy of India in Berlin now handles passport, visa and OCI applications itself', 'consulate', 'Berlin', 'Since 20 January 2026 the Embassy of India in Berlin takes consular applications directly, by online appointment. The outsourcing centre run by Alankit closed on 19 January 2026.', 'The Embassy of India in Berlin ended its contract with the outsourcing provider Alankit Assignments Ltd. on 19 January 2026. Its application centre in Berlin no longer takes applications.

WHAT CHANGED
Since 20 January 2026, these applications go directly to the Consular Section of the Embassy at Tiergartenstraße 17, 10785 Berlin:

- passports
- visas
- OCI cards
- surrender certificates
- attestation and other services

HOW
By online appointment only, through the Embassy''s appointment website. Documents are submitted Monday to Friday from 09:30 to 12:30 and collected from 16:00 to 17:00, except on holidays.

IMPORTANT
Don''t pay fees to Alankit for services after 19 January 2026: the Embassy says it isn''t responsible for such payments.

WHICH MISSION IS YOURS
This applies to the Embassy in Berlin. The Consulates General in Frankfurt, Hamburg and Munich cover other states. Check which mission covers your address before you book.', '[{"name": "Embassy of India, Berlin", "url": "https://indianembassyberlin.gov.in/"}, {"name": "Embassy of India, Berlin: appointments", "url": "https://appointment.indianembassyberlin.gov.in/"}]'::jsonb),
('oci-holders-update-passport-details', 'OCI cardholders: update your passport details after every new passport', 'consulate', '', 'The Embassy of India in Berlin reminds OCI cardholders to update their passport details in the OCI system each time they get a new passport. Carry both passports when you travel.', 'On 15 October 2026 the Embassy of India in Berlin published a notice for OCI cardholders.

WHAT YOU MUST DO
Each time you get a new foreign passport, for example a new German passport, update its details in your OCI registration on the official OCI portal.

TRAVEL IN THE MEANTIME
The Embassy says there is no restriction on travelling to or from India while you wait. Carry both your old passport (the one linked to your OCI) and your new one.

WHY IT MATTERS
Since the Citizenship (Amendment) Rules 2026, OCI processes run online, and records are kept digitally. An outdated passport number in your OCI record can cause questions at immigration.

ALSO NEW
Foreign nationals, including OCI cardholders, must fill in India''s e-Arrival card online before landing in India. See our post on it.', '[{"name": "Embassy of India, Berlin", "url": "https://indianembassyberlin.gov.in/"}, {"name": "OCI services portal", "url": "https://ociservices.gov.in/"}]'::jsonb),
('oci-rules-2026-online-e-oci', 'New OCI rules in 2026: online applications and the e-OCI', 'consulate', '', 'India''s Citizenship (Amendment) Rules 2026 move OCI registration and renunciation fully online and introduce an electronic OCI (e-OCI) alongside the physical card.', 'India notified the Citizenship (Amendment) Rules 2026 at the start of May 2026. They change how OCI applications work.

WHAT CHANGED
- Applications to register as an OCI and to renounce OCI status are filed electronically on the official OCI portal
- Documents no longer have to be submitted in duplicate
- You can get either a physical OCI card or an electronic OCI registration (e-OCI)
- If you renounce OCI status, you still hand the physical card to an Indian mission or an FRRO

FOR CHILDREN
A minor may not hold an Indian passport and another country''s passport at the same time.

CANCELLATION FOR SERIOUS OFFENCES
Since an August 2025 notification by the Ministry of Home Affairs, OCI registration can be cancelled if a person is sentenced to two years or more in prison, or charge-sheeted for an offence punishable with seven years or more.

TIP
Use only ociservices.gov.in. Check its instructions for your case, and keep your passport details in your OCI record up to date.', '[{"name": "All India Radio News: the 2026 rules", "url": "https://newsonair.gov.in/govt-notifies-citizenship-amendment-rules-2026-introducing-revised-provisions-related-to-oci-cardholders-citizenship-applications/"}, {"name": "OCI services portal", "url": "https://ociservices.gov.in/"}]'::jsonb),
('indian-e-passport-missions-germany', 'Indian e-passports are now issued abroad, and fees changed in July', 'consulate', '', 'Indian missions abroad switched to Passport Seva 2.0 in October 2025 and now issue chip-based e-passports. A new fee schedule applies since 1 July 2026.', 'Indian embassies and consulates moved to the Global Passport Seva Programme 2.0 on 28 October 2025. New passports issued since then are e-passports.

WHAT''S NEW
- The e-passport has a chip with your details and photo, following international standards
- Forms are partly filled in automatically, and payment works online
- Your current paper passport stays valid until it expires: you don''t need to replace it early

FEES
A new fee schedule for passports came into force on 1 July 2026. At missions abroad, fees are charged in local currency, so in euros in Germany. Check the current fee on the website of your mission or on the Passport Seva portal before you book.

HOW TO APPLY IN GERMANY
Apply online on the Passport Seva portal, choose the mission for your area (Embassy in Berlin, or the Consulates General in Frankfurt, Hamburg or Munich), and book an appointment.

TIP
Renew early: processing abroad usually takes several weeks.', '[{"name": "Passport Seva", "url": "https://www.passportindia.gov.in/"}, {"name": "Consulate General of India, Frankfurt", "url": "https://cgifrankfurt.gov.in/"}]'::jsonb),
('india-e-arrival-card-mandatory', 'Flying to India? Foreign nationals and OCI holders must fill in the e-Arrival card', 'travel', '', 'Since 1 April 2026, foreign nationals, including OCI cardholders, must submit India''s e-Arrival card online within 72 hours before landing. Indian passport holders don''t.', 'India replaced the paper disembarkation card with an online e-Arrival card. It was introduced on 1 October 2025 and has been mandatory since 1 April 2026.

WHO MUST FILL IT IN
- foreign nationals, for example a German spouse or children with German passports
- OCI cardholders

Indian passport holders don''t need it.

WHEN AND HOW
- online, no earlier than 72 hours before you land
- on the official Indian Visa Online website or in the government''s Su-Swagatam app
- it''s free

After you submit it, you get a confirmation with a QR code. Keep it on your phone or print it for immigration.

WATCH OUT
The e-Arrival card isn''t a visa. You still need a valid visa or OCI. Use only the official website or app: some websites charge for the free form.', '[{"name": "Indian Visa Online: e-Arrival", "url": "https://indianvisaonline.gov.in/earrival/"}]'::jsonb),
('india-income-tax-act-2025-nri', 'India''s new Income-tax Act is in force: what NRIs should know', 'money', '', 'Since 1 April 2026 India''s Income-tax Act 2025 replaces the 1961 Act. It introduces the ''tax year'', but the rules for who is resident or an NRI stay the same.', 'India''s Income-tax Act 2025 replaced the Income-tax Act 1961 on 1 April 2026. It rewrites the law in simpler language; most rules stay the same.

WHAT CHANGES
- ''Previous year'' and ''assessment year'' are replaced by one ''tax year''. Income from April 2026 to March 2027 belongs to tax year 2026-27
- Section numbers changed, so forms and documents refer to new sections

WHAT STAYS THE SAME FOR NRIS
- The tests for residence: generally 182 days or more in India in a tax year, or 60 days plus 365 days over the four years before (with special rules for Indians working abroad)
- Lower rates on certain investment income for NRIs

WHAT TO DO
- Income for the year that ended on 31 March 2026 is still filed under the 1961 Act
- Count your days in India each year if you visit often
- Tell your bank in India if your residential status changes, for example to convert savings accounts to NRO

TIP
For your own case, ask a chartered accountant who knows NRI taxation.', '[{"name": "Income Tax Department, India", "url": "https://www.incometaxindia.gov.in/"}]'::jsonb),
('germany-tax-changes-2026', 'Taxes in Germany 2026: higher allowances and a better commuter allowance', 'money', '', 'In 2026 the tax-free allowance rose to €12,348, child benefit to €259 a month, and the commuter allowance is 38 cents per kilometre from the first kilometre.', 'Several tax changes in Germany took effect on 1 January 2026.

THE MAIN ONES
- Basic tax-free allowance (Grundfreibetrag): €12,348 per person, €24,696 for married couples filing jointly
- Child benefit (Kindergeld): €259 per child per month, up from €255
- Child allowance (Kinderfreibetrag): €9,756 in total for both parents per child, including the allowance for care and education
- Commuter allowance (Entfernungspauschale): 38 cents per kilometre of the one-way distance to work, now from the first kilometre (it was 30 cents for the first 20 km)

WHAT TO DO
- The commuter change helps most people with a short way to work: claim it in your 2026 tax return
- Child benefit is paid automatically if you already receive it
- Non-EU citizens can get Kindergeld with most residence permits that allow work. Ask the Familienkasse if you''re unsure

TIP
Your 2026 tax return is due by 31 July 2027 if you file yourself, or later with a tax adviser.', '[{"name": "Federal Ministry of Finance", "url": "https://www.bundesfinanzministerium.de/"}, {"name": "Familienkasse: Kindergeld", "url": "https://www.arbeitsagentur.de/familie-und-kinder/kindergeld"}]'::jsonb),
('health-insurance-2027-contributions', 'Health insurance 2027: what changes on your payslip', 'money', '', 'The contribution ceiling for health insurance is set to rise to €6,375 a month in 2027. The estimated average additional contribution stays at 2.9 percent, but your insurer may charge more.', 'Every autumn the figures for the next year''s health insurance are set.

THE NUMBERS FOR 2027
- Contribution ceiling: €6,375 a month (€76,500 a year). Income above it isn''t charged
- Compulsory insurance threshold: €84,150 a year. Employees earning more can choose private health insurance
- Estimated average additional contribution (Zusatzbeitrag): 2.9 percent, the same as for 2026

The ceilings were adopted by the cabinet in October 2026 and still need the Bundesrat''s approval. The 2.9 percent is an estimate by experts on 14 October 2026; the health ministry sets the official figure by 1 November.

WHAT IT MEANS FOR YOU
The average is only a reference. Each insurer sets its own additional contribution, and many already charge more than 2.9 percent.

TIP
If your insurer raises its additional contribution, it must tell you, and you may switch to another public insurer. Compare rates in December.', '[{"name": "Federal Government: contribution ceilings 2027", "url": "https://www.bundesregierung.de/breg-de/aktuelles/beitragsbemessungsgrenzen-2027-2454638"}]'::jsonb),
('upi-europe-tips-link-status', 'UPI in Europe: the link with the euro instant payment system is being built', 'money', '', 'India''s UPI and the Eurosystem''s TIPS are to be linked for faster payments between India and the euro area. The work started in November 2025; there is no launch date yet.', 'Many Indians in Germany would like to pay family in India, or receive money, as easily as with UPI at home.

WHAT''S HAPPENING
On 20 November 2025 the European Central Bank decided to start building a link between TIPS, the euro area''s instant payment system, and India''s UPI. The Reserve Bank of India and NPCI International work on it with the ECB.

WHAT IT COULD MEAN
Once live, money could move between bank accounts in the euro area and in India much faster and, ideally, more cheaply than today.

WHAT IT DOESN''T MEAN YET
- It isn''t live: legal and technical work is still going on
- No launch date has been announced
- UPI apps can''t yet be used to pay in German shops through this link

TIP
Until then, compare banks and money transfer services: fees and exchange rates differ a lot. Be careful with anyone offering ''UPI to Europe'' services that sound too good to be true.', '[{"name": "European Central Bank", "url": "https://www.ecb.europa.eu/press/intro/news/html/ecb.mipnews251120.en.html"}]'::jsonb),
('verification-of-payee-bank-transfers', 'Bank transfers: your bank now checks the payee''s name against the IBAN', 'money', '', 'Since 9 October 2025, banks in the EU check whether the name you enter matches the IBAN before a euro transfer. Here''s what the warnings mean.', 'An EU regulation on instant payments introduced the ''verification of payee'' (Empfängerüberprüfung). Since 9 October 2025 banks check, before you send a euro transfer, whether the payee''s name fits the IBAN.

WHAT YOU SEE
- Match: the transfer goes ahead as usual
- Close match: the name is almost right, and your bank shows you the correct name
- No match: the name doesn''t fit the account

WHY IT MATTERS
It protects you from typing mistakes and from scams, for example fake landlords or fake invoices with a changed IBAN.

WHAT TO DO
- If you get ''no match'', stop and check with the person you''re paying, by phone or in person, not by replying to the same message
- When paying rent or a deposit, use the exact name on the landlord''s account
- If you still send it after a warning, your bank may not be liable if the money goes to the wrong person

TIP
Give friends and landlords your name exactly as it appears on your bank account, so payments to you go through smoothly.', '[{"name": "EU Regulation 2024/886 (instant payments)", "url": "https://eur-lex.europa.eu/eli/reg/2024/886/oj"}]'::jsonb),
('minimum-wage-2026-2027-germany', 'Minimum wage: €13.90 now, €14.60 from January 2027', 'work', '', 'Germany''s minimum wage is €13.90 an hour in 2026 and rises to €14.60 on 1 January 2027. The mini-job limit rises with it, from €603 to €633 a month.', 'The statutory minimum wage rose from €12.82 to €13.90 an hour on 1 January 2026. The next step, to €14.60 an hour, comes on 1 January 2027.

WHO IT APPLIES TO
Almost all employees in Germany, including international students in part-time jobs and people on the Opportunity Card. Some groups are exempt, for example many interns in compulsory internships.

MINI-JOBS
The earnings limit for mini-jobs is tied to the minimum wage:

- €603 a month in 2026
- €633 a month from January 2027

STUDENTS
International students from outside the EU may work 140 full days or 280 half days a year. Being paid at least the minimum wage is your right in any job.

WHAT TO DO
Check your hourly rate when the new year starts. If an employer pays less than the minimum wage, the Federal Ministry of Labour''s minimum wage hotline and the customs authority (Zoll), which checks compliance, can help.', '[{"name": "Deutsche Rentenversicherung: mini-job limit", "url": "https://www.deutsche-rentenversicherung.de/BadenWuerttemberg/DE/Presse/Pressemitteilungen/2025/251222_Minijob.html"}, {"name": "Federal Ministry of Labour: minimum wage", "url": "https://www.bmas.de/DE/Arbeit/Arbeitsrecht/Mindestlohn/mindestlohn.html"}]'::jsonb),
('eu-india-free-trade-agreement-mobility', 'EU-India trade deal: what it could mean for professionals', 'work', '', 'The EU and India concluded a free trade agreement in January 2026. Signing is expected in December 2026; it includes rules for moving professionals but isn''t in force yet.', 'After talks that restarted in 2022, the EU and India concluded negotiations on a free trade agreement on 27 January 2026.

WHERE IT STANDS
- On 11 September 2026 the European Commission proposed that the EU sign and conclude it
- Signing is expected in December 2026
- The European Parliament and India then have to approve it, so it could apply from 2027

WHAT IT SAYS ABOUT PEOPLE
According to the Indian government, the agreement sets out routes for the temporary movement of professionals: company transferees, business visitors, contractual service suppliers and independent professionals, with rights for their dependants. It also mentions student mobility, post-study work and future social security agreements.

WHAT IT DOESN''T CHANGE
German work permits, the Blue Card and naturalisation rules stay as they are. The agreement covers temporary stays for business and services.

TIP
Be wary of agents promising ''FTA visas'' now. Nothing applies until the agreement is in force.', '[{"name": "DD News (Government of India)", "url": "https://ddnews.gov.in/en/india-and-eu-conclude-landmark-free-trade-agreement-unlocking-new-era-of-economic-partnership/"}]'::jsonb),
('india-germany-skilled-migration-healthcare', 'Germany wants more nurses and skilled workers from India', 'work', '', 'During Chancellor Merz''s visit to India in January 2026, the two countries agreed a Global Skills Partnership with a focus on healthcare workers, and a roadmap on higher education.', 'German Chancellor Friedrich Merz visited India on 12 and 13 January 2026. Migration and skills were among the main topics.

WHAT WAS AGREED
- A Global Skills Partnership, with a focus on healthcare workers such as nurses and caregivers
- More legal migration of skilled workers under the existing Migration and Mobility Partnership Agreement of 2022, with protection against exploitation
- A roadmap on higher education, to deepen links between universities
- Visa-free airport transit for Indians, which has applied since 3 June 2026

WHY IT MATTERS
Germany is short of workers, especially in care and healthcare. Indians are already among the fastest-growing groups of skilled workers and students in Germany.

WHAT TO DO
If you''re a nurse or a healthcare worker in India, check official programmes for recognition of your qualification and language courses. Avoid agents who charge high fees for promised jobs: official programmes don''t.', '[{"name": "Prime Minister''s Office: list of outcomes", "url": "https://www.pmindia.gov.in/en/news_updates/list-of-outcomes-visit-of-the-chancellor-of-the-federal-republic-of-germany-to-india-january-12-13-2026/"}, {"name": "German Missions in India", "url": "https://india.diplo.de/in-en/2773896-2773896"}]'::jsonb),
('indian-students-largest-group-germany', 'About 69,000 Indians study in Germany, more than any other foreign group', 'work', '', 'In the winter semester 2025/26 about 69,000 Indian students were enrolled at German universities, the largest group of international students, ahead of China with about 39,000.', 'The study ''Wissenschaft weltoffen 2026'' by the DAAD and the DZHW shows how much Germany has grown as a place to study for Indians.

THE NUMBERS
- About 69,000 Indian students in the winter semester 2025/26
- India is the largest country of origin, ahead of China with about 39,000
- In total about 426,200 international students and doctoral candidates studied in Germany, about 6 percent more than a year earlier

WHY SO MANY
Low or no tuition fees at public universities, English-taught master''s programmes, and the right to stay and look for a job for 18 months after graduating.

WHAT TO WATCH
- Check that a private university and its degree are officially recognised before paying high fees
- Budget realistically: the blocked account pays out €992 a month, and a room in a big city can take half of that or more

COMMUNITY
New in Germany? Join your city''s group on NRIClub to ask about rooms, part-time jobs and registration.', '[{"name": "Wissenschaft weltoffen 2026 (DAAD/DZHW)", "url": "https://www.wissenschaft-weltoffen.de/content/uploads/2026/05/wiwe_kompakt_2026_EN_BF_ver2.pdf"}]'::jsonb),
('deutschlandticket-price-2027', 'Deutschlandticket costs €66.80 from January 2027', 'life', '', 'The Deutschlandticket rises from €63 to €66.80 a month on 1 January 2027. It''s the first price set by the new automatic formula.', 'The Deutschlandticket for local and regional transport across Germany will cost €66.80 a month from 1 January 2027, €3.80 more than in 2026.

HOW THE PRICE IS SET
For the first time, the price comes from an index that the state transport ministers agreed in March 2026. It follows the costs of staff, energy and general prices.

HOW WE GOT HERE
- €49 when it started in 2023
- €58 in 2025
- €63 in 2026
- €66.80 from January 2027

OTHER VERSIONS
The job ticket (through your employer) and the semester ticket for students have their own prices. Many employers pay part of the job ticket: ask HR.

WHAT TO DO
If you have a subscription, it continues at the new price unless you cancel. You can usually cancel by the 10th of a month for the end of that month. Check your provider''s terms.', '[{"name": "Bavarian Ministry of Transport, 30 September 2026", "url": "https://www.stmb.bayern.de/med/pressemitteilungen/pressearchiv/2026/115/index.php"}]'::jsonb),
('rundfunkbeitrag-2027-recommendation', 'TV licence fee: still €18.36, a rise to €18.64 is proposed for 2027', 'life', '', 'The broadcasting fee (Rundfunkbeitrag) stays at €18.36 a month for now. The independent commission KEF recommends €18.64 from 2027; the states haven''t decided.', 'Every household in Germany pays the broadcasting fee (Rundfunkbeitrag), whether or not you own a TV.

WHERE IT STANDS
- The fee is €18.36 a month per household
- The commission KEF recommends raising it to €18.64 from 1 January 2027, less than the €18.94 it proposed earlier
- The federal states would have to put a rise into an interstate treaty; they haven''t decided
- A case by ARD and ZDF about the fee is pending at the Federal Constitutional Court

WHAT YOU MUST DO
- Register your flat when you move in, at rundfunkbeitrag.de, even if you don''t watch TV
- In a shared flat (WG), only one person pays; the others give that person''s contribution number
- Students receiving BAföG can apply to be exempt

TIP
Letters from the ''Beitragsservice'' are real, not spam. Ignoring them leads to reminder fees.', '[{"name": "Rundfunkbeitrag (official)", "url": "https://www.rundfunkbeitrag.de/"}, {"name": "ZDF heute: KEF recommendation", "url": "https://www.zdfheute.de/politik/deutschland/rundfunkbeitrag-kef-empfehlung-anhebung-ard-zdf-100.html"}]'::jsonb),
('mietpreisbremse-extended-2029', 'Renting: the rent brake now applies until the end of 2029', 'life', '', 'Germany extended the rent brake (Mietpreisbremse) until 31 December 2029. In tight housing markets, a new rent may generally be at most 10 percent above the local comparative rent.', 'The rent brake (Mietpreisbremse) was due to end in 2025. The Bundestag and the Bundesrat extended it until 31 December 2029.

HOW IT WORKS
In areas the state government has declared tight housing markets, the rent for a new tenancy may generally be at most 10 percent above the local comparative rent (ortsübliche Vergleichsmiete). Many big cities, including Berlin, Munich, Frankfurt and Hamburg, are covered.

EXCEPTIONS
- New buildings first let after 1 October 2014
- The first letting after a comprehensive modernisation
- If the previous tenant already paid more, the landlord may usually ask for the same

WHAT YOU CAN DO
- Check your city''s rent index (Mietspiegel)
- If your rent seems too high, you can complain to your landlord in writing and ask for the reasons; tenant associations (Mieterverein) and online services can help
- Keep copies of your contract and all payments

TIP
Never pay a deposit before you''ve seen the flat and signed a contract.', '[{"name": "Bundestag: the bill", "url": "https://dserver.bundestag.de/btd/21/003/2100322.pdf"}]'::jsonb),
('electronic-patient-record-epa', 'Your electronic patient record (ePA): what doctors store, and how to say no', 'life', '', 'Everyone with public health insurance in Germany has an electronic patient record unless they object. Since 1 October 2025 doctors must use it. You can object at any time.', 'The electronic patient record (elektronische Patientenakte, ePA) collects your medical documents, such as findings, doctors'' letters and your medication list, in one place.

WHAT CHANGED
- Since January 2025 public health insurers create an ePA for everyone who hasn''t objected
- Since 1 October 2025 doctors'' practices must use it and add treatment data, unless you object

YOUR CHOICES
- Use your insurer''s ePA app to see your record and decide who may see what
- Object to the whole record, or to certain uses, at any time through your insurer
- Hide individual documents from certain doctors

WHY IT CAN HELP
New doctor, emergency, or treatment in another city: your history and medications are available, which helps if you can''t explain everything in German.

TIP
Doctors must inform you about the ePA. Ask your insurer for the app, or for its contact point if you don''t use a smartphone.', '[{"name": "Federal Ministry of Health: ePA", "url": "https://www.bundesgesundheitsministerium.de/themen/digitalisierung/elektronische-patientenakte/epa-fuer-alle.html"}]'::jsonb),
('diwali-2026-germany-dates', 'Diwali 2026 is on Sunday, 8 November: find a celebration near you', 'community', '', 'Diwali falls on Sunday, 8 November 2026, with Dhanteras on 6 November and Bhai Dooj on 10 November. Indian associations across Germany celebrate on the weekends around it.', 'Diwali, the festival of lights, falls on Sunday, 8 November 2026.

THE FESTIVAL DAYS
- Dhanteras: Friday, 6 November
- Naraka Chaturdashi (Choti Diwali): Saturday, 7 November
- Diwali and Lakshmi Puja: Sunday, 8 November
- Govardhan Puja: Monday, 9 November
- Bhai Dooj: Tuesday, 10 November

Muhurat times depend on the place: check a panchang for your city, as times in Germany differ from India.

CELEBRATING IN GERMANY
Indian associations, temples and student groups hold Diwali events in many cities, often on the weekends before and after. See NRIClub''s What''s on for events in Germany, and your city''s group to meet people near you.

GOOD TO KNOW
- Fireworks: private fireworks are only sold and allowed around New Year''s Eve in Germany. Celebrate with diyas and candles, and never leave flames unattended
- Diwali isn''t a public holiday in Germany: plan leave early', '[{"name": "timeanddate.com: Diwali 2026", "url": "https://www.timeanddate.com/holidays/india/diwali?year=2026"}, {"name": "NRIClub: What''s on in Germany", "url": "https://nriclub.app/whats-on"}]'::jsonb)
ON CONFLICT (slug) DO NOTHING
RETURNING slug;
