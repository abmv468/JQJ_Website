import PolicyPage from "@/components/trust/PolicyPage";

export const metadata = {
  title: "JQD Group Updates — JQD Group",
};

export default function LoyaltyPage() {
  return (
    <PolicyPage
      title="Collector Updates"
      intro="Join our list for new pieces and atelier news."
      effectiveDate="July 28, 2026"
      contactDetails={[
        {
          label: "Questions",
          value: "support@jqdgroup.com",
          href: "mailto:support@jqdgroup.com",
        },
      ]}
      sections={[
        {
          title: "What to Expect",
          bullets: [
            "Early notice of new collections and limited releases.",
            "Occasional product and stone-care notes.",
            "Messages sent sparingly, with an unsubscribe option in every email.",
          ],
        },
        {
          title: "Stay Connected",
          paragraphs: [
            "Use the newsletter form in the footer to receive updates.",
          ],
        },
      ]}
    />
  );
}