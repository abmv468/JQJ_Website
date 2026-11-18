import type { Metadata } from "next";
import PolicyPage from "@/components/trust/PolicyPage";

export const metadata: Metadata = {
  title: "Natural Stone Jewellery Care",
  description:
    "Learn how to clean, store, and care for natural stone jewellery from Jewellery Quintessential.",
  alternates: { canonical: "/care" },
};

export default function CarePage() {
  return (
    <PolicyPage
      title="Jewellery Care"
      intro="Natural stone pieces deserve a little care. These simple habits help preserve their finish and character."
      effectiveDate="July 28, 2026"
      sections={[
        {
          title: "Everyday Care",
          bullets: [
            "Remove jewellery before swimming, showering, exercising, or sleeping.",
            "Avoid perfume, lotion, hairspray, and household chemicals while wearing your piece.",
            "Put jewellery on after applying cosmetics and fragrance.",
          ],
        },
        {
          title: "Cleaning",
          bullets: [
            "Wipe pieces gently with a soft, dry cloth after wear.",
            "Do not use ultrasonic cleaners, steam, or harsh chemical cleaners on natural stones.",
            "Contact support before using any cleaner if you are unsure whether it is suitable for your piece.",
          ],
        },
        {
          title: "Storage",
          paragraphs: [
            "Store each piece separately in a soft pouch or lined box to help prevent scratches, tangling, and unnecessary wear.",
          ],
        },
      ]}
    />
  );
}
