import type { Metadata } from "next";
import PolicyPage from "@/components/trust/PolicyPage";

export const metadata: Metadata = {
  title: "Our Story",
  description:
    "Jewellery Quintessential · 極氣 is a natural stone jewellery house, designed in Hong Kong since 2015. We work with natural stones and materials sourced from around the world, and our work includes museum collaborations. Each piece is designed to be worn every day and given with meaning. Discover JQD Group's approach to hand-finished natural stone jewelry, thoughtful gifting, and everyday ritual.",
  alternates: { canonical: "/story" },
};

export default function StoryPage() {
  return (
    <PolicyPage
      title="Our Story"
      intro="Jewellery Quintessential · 極氣 is a natural stone jewellery house, designed in Hong Kong since 2015. We work with natural stones and materials sourced from around the world, and our work includes museum collaborations. Each piece is designed to be worn every day and given with meaning. JQD Group creates hand-finished natural stone pieces for everyday ritual, thoughtful gifting, and a collection that grows with you."
      effectiveDate="July 28, 2026"
      sections={[
        {
          title: "Made for Meaningful Wear",
          paragraphs: [
            "We choose stones for their natural character, color, and presence, then shape each collection around pieces designed to be worn often rather than saved for an occasion.",
          ],
        },
        {
          title: "Natural Variation",
          paragraphs: [
            "Every natural stone has its own pattern and tone. Variations are part of what makes each piece personal, and no two are exactly alike.",
          ],
        },
        {
          title: "Our Promise",
          bullets: [
            "Clear product details and sizing support before you order.",
            "Careful packaging for every piece.",
            "Practical after-purchase support for sizing, returns, and repair questions.",
          ],
        },
      ]}
    />
  );
}