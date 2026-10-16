// The Impressum (legal notice under § 5 DDG, Germany's Digital Services Act,
// and § 18 (2) MStV). Everything here is published on nriclub.app/impressum
// and in the app (Settings > Impressum), so only fill in what may be public.
//
// While `name` or `address` is empty, NRIClub shows no Impressum at all: no
// page, no links, nothing half-filled. The Privacy Policy and the Terms of
// Use name the operator from here too: once `name` and `address` are filled
// in, they show them; until then they say that NRIClub is run by its founder
// in Germany. The build never stops because these are empty.
export const IMPRINT = {
  // Your full name; for a company, its name with the legal form
  // (e.g. "NRIClub UG (haftungsbeschränkt)").
  name: "",
  // Companies only: who represents it (e.g. "Managing director: Asha Rao").
  representative: "",
  // A postal address where letters reach you: street and number, postcode
  // and city, country. One line each. A P.O. box isn't enough.
  address: [],
  email: "hello@nriclub.app",
  // A second quick way to reach you, usually a phone number in international
  // format, e.g. "+49 89 1234 5678" (with the country code, no leading 0).
  phone: "",
  // Companies only: the register entry (e.g. "Amtsgericht München, HRB 123456").
  register: "",
  // Your VAT ID (USt-IdNr., e.g. "DE123456789"), if you have one.
  vatId: "",
  // Your business ID (Wirtschafts-Identifikationsnummer, e.g.
  // "DE123456789-00001"), if the tax office gave you one. Fill in whichever
  // of the two you have; never your plain tax number (Steuernummer).
  businessId: "",
  // The person responsible for the content (the guides and the site's texts)
  // under § 18 (2) MStV: a person, not a company, who lives in Germany. Name
  // and postal address on one line. A private person can leave this empty to
  // name themselves; a company must fill it in (the build stops otherwise).
  contentResponsible: "",
};

// Details only the Privacy Policy uses (src/content/legal/privacy.js); they
// are not part of the Impressum.
export const PRIVACY_DETAILS = {
  // The data protection authority (Datenschutz-Aufsichtsbehörde) responsible
  // for NRIClub: the one of the German federal state (Bundesland) where you
  // live while you run NRIClub as a private person, later the one where the
  // company has its seat. Its name and postal address on one line, copied
  // from the authority's own website, e.g. for Bavaria "Bayerisches
  // Landesamt für Datenschutzaufsicht (BayLDA), <street>, 91522 Ansbach,
  // Germany". While empty, the Policy describes it instead of naming it.
  supervisoryAuthority: "",
  // The authority's website, e.g. "https://www.lda.bayern.de".
  supervisoryAuthorityUrl: "",
  // Who hosts the hello@nriclub.app mailbox: the company and its country,
  // e.g. "Example Mail GmbH, Germany". While empty, the Policy says "the
  // provider that hosts our mailbox".
  mailProvider: "",
  // Which providers have a data processing agreement (Auftragsverarbeitungs-
  // vertrag, Art. 28 GDPR) with NRIClub. The Policy says a provider works
  // under one, and names the transfer safeguard in it, only where this is
  // true. Supabase's and Resend's agreements are part of their terms of
  // service, so they apply since you accepted those terms (checked October
  // 2026). Vercel's applies only on its Pro and Enterprise plans: set vercel
  // to true once the project is on one of them. Set mailbox to true once you
  // have accepted the mailbox provider's agreement. File a copy of each
  // (docs/compliance/processor-agreements.md).
  agreements: { supabase: true, resend: true, vercel: false, mailbox: false },
  // How long Vercel keeps the request logs of your plan, as its
  // documentation says (October 2026: "1 hour" on Hobby, "1 day" on Pro).
  // While empty, the Policy says "up to 1 day".
  vercelLogRetention: "",
};

export const hasImprint = () => !!(IMPRINT.name.trim() && IMPRINT.address.some((l) => l.trim()));

// The operator's name and address as lines (name, representative, address),
// or [] while the Impressum isn't filled in. Used by the Terms and the
// Privacy Policy.
export const operatorLines = () => (hasImprint()
  ? [IMPRINT.name, IMPRINT.representative, ...IMPRINT.address].map((l) => String(l || "").trim()).filter(Boolean)
  : []);

// The Impressum as sections of lines ({ text, href }), for the page, the
// app's Settings and the page the build writes (vite.config.js).
export function imprintSections() {
  const I = IMPRINT;
  const lines = (list) => list.filter((l) => l && String(l.text || "").trim()).map((l) => ({ ...l, text: String(l.text).trim() }));
  const person = [{ text: I.name }, ...I.address.map((text) => ({ text }))];
  return [
    { title: "Information under § 5 DDG (Angaben gemäß § 5 DDG)", lines: lines([{ text: I.name }, { text: I.representative }, ...I.address.map((text) => ({ text }))]) },
    { title: "Contact (Kontakt)", lines: lines([I.email && { text: `Email: ${I.email}`, href: `mailto:${I.email}` }, I.phone && { text: `Phone: ${I.phone}`, href: `tel:${I.phone.replace(/\(0\)/g, "").replace(/[^\d+]/g, "")}` }]) },
    { title: "Register entry (Registereintrag)", lines: lines([{ text: I.register }]) },
    { title: "Tax IDs (Umsatzsteuer-ID / Wirtschafts-ID)", lines: lines([
      I.vatId && { text: `VAT identification number under § 27a UStG: ${I.vatId}` },
      I.businessId && { text: `Business identification number under § 139c AO (Wirtschafts-Identifikationsnummer): ${I.businessId}` },
    ]) },
    // A company can't be "the person responsible": then only contentResponsible counts.
    { title: "Responsible for the content under § 18 (2) MStV (Verantwortlich nach § 18 Abs. 2 MStV)",
      lines: lines(I.contentResponsible.trim() ? [{ text: I.contentResponsible }] : I.representative.trim() ? [] : person) },
    // Art. 11 and 12 of the EU Digital Services Act: one point of contact
    // for authorities and one for users, with the languages they can use.
    { title: "Points of contact under the Digital Services Act (Zentrale Kontaktstelle nach Art. 11 und 12 DSA)", lines: lines([
      I.email && { text: `For authorities, members and anyone else: ${I.email}`, href: `mailto:${I.email}` },
      { text: "Languages: English, German (Deutsch)" },
      { text: "To report illegal content: use Report in the app, or write to the address above." },
    ]) },
    { title: "Consumer dispute resolution (Verbraucherstreitbeilegung)", lines: lines([
      { text: "We are not obliged and not willing to take part in dispute resolution proceedings before a consumer arbitration board (Verbraucherschlichtungsstelle)." },
    ]) },
  ].filter((s) => s.lines.length);
}
