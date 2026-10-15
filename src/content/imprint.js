// The Impressum (legal notice under § 5 DDG, Germany's Digital Services Act,
// and § 18 (2) MStV). Everything here is published on nriclub.app/impressum
// and in the app (Settings > Impressum), so only fill in what may be public.
//
// While `name` or `address` is empty, NRIClub shows no Impressum at all: no
// page, no links, nothing half-filled.
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

export const hasImprint = () => !!(IMPRINT.name.trim() && IMPRINT.address.some((l) => l.trim()));

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
  ].filter((s) => s.lines.length);
}
