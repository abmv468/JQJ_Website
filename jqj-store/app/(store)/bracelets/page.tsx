import type { Metadata } from "next";
import CollectionView from "@/components/product/CollectionView";
import { getProductsByCategory } from "@/data/products";
import { BRAND_NAME } from "@/lib/brand";

export function generateMetadata({
  searchParams,
}: {
  searchParams: { stone?: string; tag?: string; q?: string };
}): Metadata {
  const isFiltered = Boolean(searchParams.stone || searchParams.tag || searchParams.q);

  return {
    title: "Natural Stone Bracelets",
    description:
      "Explore hand-finished natural stone bracelets crafted for everyday wear, thoughtful gifting, and a personal fit.",
    alternates: { canonical: "/bracelets" },
    robots: isFiltered ? { index: false, follow: true } : undefined,
    openGraph: {
      title: `Natural Stone Bracelets | ${BRAND_NAME}`,
      description:
        "Explore hand-finished natural stone bracelets crafted for everyday wear, thoughtful gifting, and a personal fit.",
      url: "/bracelets",
    },
  };
}

export default function BraceletsPage({
  searchParams,
}: {
  searchParams: { stone?: string; tag?: string; q?: string };
}) {
  const items = getProductsByCategory("bracelets");

  return (
    <CollectionView
      title="Bracelets"
      limitedTitle="Limited Edition Bracelets"
      subtitle="Museum-inspired bracelet designs, hand-finished in our atelier with carefully selected natural stones."
      products={items}
      editorialSections={[
        {
          title: "Natural stone bracelets for everyday wear",
          paragraphs: [
            `${BRAND_NAME} bracelets are selected for natural color, texture, and a presence that works with everyday dressing. Each piece is hand-finished to highlight the individual character of its stones rather than flatten it into a uniform look.`,
            "Choose a smaller bead profile for a quieter stack, or a more substantial stone when you want a single piece to carry the outfit. Natural variation in tone and pattern is part of the material, so every bracelet has its own character.",
          ],
          links: [
            { label: "Find your bracelet size", href: "/measure" },
            { label: "Read jewelry care guidance", href: "/care" },
          ],
        },
        {
          title: "A considered fit and finish",
          paragraphs: [
            "A comfortable bracelet begins with an accurate wrist measurement. Share your measurement and preferred fit when ordering so the piece can sit close, everyday-comfortable, or relaxed according to how you wear jewelry.",
            "For gifting or first-time collecting, review our shipping and return details before ordering. The support pages explain processing, delivery, resizing, and eligibility in one place.",
          ],
          links: [
            { label: "Shipping information", href: "/shipping" },
            { label: "Returns and resizing", href: "/returns" },
          ],
        },
      ]}
      initialStone={searchParams.stone}
      initialTag={searchParams.tag}
      initialQuery={searchParams.q}
    />
  );
}
