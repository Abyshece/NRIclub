// The Terms of Use version 2026-10, as members accepted them in October
// 2026, word for word (only section 10 changed form: it used to open the
// Privacy Policy in place and now links to its page). Kept so every member
// can read the version they accepted (nriclub.app/terms/2026-10). Don't
// change this text. (The line under the title isn't part of it: it says
// which version this is and for whom it still applies.)
import { mail, a } from "./doc.js";

export function termsDoc20261010() {
  return {
    title: "Terms of Use",
    subtitle: "Version 2026-10 (October 2026). This is an earlier version. It still applies to members who haven't accepted the current version yet.",
    intro: [
      { p: ["The current Terms of Use are at ", a("nriclub.app/terms", "/terms"), "."] },
    ],
    sections: [
      { id: "who", title: "1. Who NRIClub is for", blocks: [
        { p: "NRIClub is a community for people with a real connection to the Indian community, whether you live abroad or in India and want to connect with those who do." },
      ] },
      { id: "age", title: "2. You must be 18 or older", blocks: [
        { p: "You can only create an account if you are at least 18 years old." },
      ] },
      { id: "yourself", title: "3. Be yourself", blocks: [
        { p: "Use your real name and your own details. Our admins verify new members using a LinkedIn profile or, if you don't have one, a short explanation of how you're connected to the community. Until then you can use NRIClub, but your profile won't show the Verified badge. We may decline or remove accounts we can't verify." },
      ] },
      { id: "respect", title: "4. Be respectful", blocks: [
        { p: "Treat other members with respect. No harassment, hate speech, discrimination or threats. Don't share other people's private information." },
      ] },
      { id: "spam", title: "5. No spam or scams", blocks: [
        { p: "No spam, misleading offers, fake listings, pyramid schemes or attempts to get money or personal data from members under false pretences." },
      ] },
      { id: "marketplace", title: "6. Marketplace", blocks: [
        { p: "Marketplace listings and any deals are between the members involved. NRIClub isn't a party to them and can't guarantee items, payments or housing. Meet safely and never pay in advance to someone you don't know." },
      ] },
      { id: "content", title: "7. Your content", blocks: [
        { p: "You're responsible for what you post. You keep ownership of it and allow us to show it to other members as part of the service." },
      ] },
      { id: "moderation", title: "8. Moderation", blocks: [
        { p: "Admins may remove content or restrict, block or delete accounts that break these rules or put other members at risk." },
      ] },
      { id: "leaving", title: "9. Leaving", blocks: [
        { p: "You can delete your account at any time from your account settings." },
      ] },
      { id: "privacy", title: "10. Privacy", blocks: [
        { p: ["Our Privacy Policy explains what data we collect, how we use it and your rights. (The current version is at ", a("nriclub.app/privacy", "/privacy"), ".)"] },
      ] },
      { id: "contact", title: "11. Contact", blocks: [
        { p: ["Questions? Write to ", mail(), "."] },
      ] },
    ],
  };
}
