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
    title: "Gemstone Necklaces",
    description:
      "Discover gemstone necklaces and pendants with natural character, refined metalwork, and a considered everyday profile.",
    alternates: { canonical: "/necklaces" },
    robots: isFiltered ? { index: false, follow: true } : undefined,
    openGraph: {
      title: `Gemstone Necklaces | ${BRAND_NAME}`,
      description:
        "Discover gemstone necklaces and pendants with natural character, refined metalwork, and a considered everyday profile.",
      url: "/necklaces",
    },
  };
}

export default function NecklacesPage({
  searchParams,
}: {
  searchParams: { stone?: string; tag?: string; q?: string };
}) {
  const items = getProductsByCategory("necklaces");

  return (
    <CollectionView
      title="Necklaces"
      subtitle="Pendants and strands that blend gemstone symbolism, refined metalwork, and modern elegance."
      products={items}
      editorialSections={[
        {
          title: "Gemstone necklaces with natural character",
          paragraphs: [
            "Our gemstone necklaces are chosen for the visual character of their stones and the balance of their metalwork. Wear one as a quiet focal point, or layer it with pieces that share its tone, texture, or finish.",
            "Because natural stones vary in pattern and color, each necklace carries details that are genuinely its own. Product pages list the materials, dimensions, and finish so you can choose with clarity.",
          ],
          links: [
            { label: "Discover our story", href: "/story" },
            { label: "Learn about jewelry care", href: "/care" },
          ],
        },
        {
          title: "Choose and care for your necklace",
          paragraphs: [
            "Consider the scale of the pendant, the intended neckline, and whether you plan to wear the piece on its own or in a layered look. Keeping natural stone jewelry dry and stored separately helps preserve its finish and character over time.",
            "Review shipping and returns before placing a gift order or choosing a special piece. Our support pages cover delivery timing, exchanges, and the help available after purchase.",
          ],
          links: [
            { label: "Shipping information", href: "/shipping" },
            { label: "Returns and exchanges", href: "/returns" },
          ],
        },
      ]}
      initialStone={searchParams.stone}
      initialTag={searchParams.tag}
      initialQuery={searchParams.q}
    />
  );
}
