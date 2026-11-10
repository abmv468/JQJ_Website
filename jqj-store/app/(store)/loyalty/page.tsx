import PolicyPage from "@/components/trust/PolicyPage";
import { BRAND_NAME, SUPPORT_EMAIL } from "@/lib/brand";

export const metadata = {
  title: "Updates",
  alternates: { canonical: "/loyalty" },
};

export default function LoyaltyPage() {
  return (
    <PolicyPage
      title={`Updates from ${BRAND_NAME}`}
      intro={`Join the ${BRAND_NAME} mailing list for new gemstone edits, limited drops, and collector releases.`}
      effectiveDate="July 28, 2026"
      contactDetails={[
        {
          label: "Questions",
          value: SUPPORT_EMAIL,
          href: `mailto:${SUPPORT_EMAIL}`,
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
            "Use the newsletter form in the footer to receive updates. We are building future collector benefits carefully and will share details only when they are ready to honor.",
          ],
        },
      ]}
    />
  );
}