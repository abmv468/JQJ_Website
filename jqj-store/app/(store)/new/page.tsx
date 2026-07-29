import type { Metadata } from "next";
import CollectionView from "@/components/product/CollectionView";
import { products } from "@/data/products";

export function generateMetadata({
  searchParams,
}: {
  searchParams: { stone?: string; tag?: string; q?: string };
}): Metadata {
  const isFiltered = Boolean(searchParams.stone || searchParams.tag || searchParams.q);

  return {
    title: "New Natural Stone Jewelry",
    description:
      "Shop new natural stone jewelry, recent releases, and limited pieces from JQD Group.",
    alternates: { canonical: "/new" },
    robots: isFiltered ? { index: false, follow: true } : undefined,
    openGraph: {
      title: "New Natural Stone Jewelry | JQD Group",
      description:
        "Shop new natural stone jewelry, recent releases, and limited pieces from JQD Group.",
      url: "/new",
    },
  };
}

export default function NewPage({
  searchParams,
}: {
  searchParams: { stone?: string; tag?: string; q?: string };
}) {
  // Surface newest + limited pieces first, then everything else.
  const featured = products.filter(
    (p) => p.tags.includes("new") || p.tags.includes("limited")
  );
  const rest = products.filter((p) => !featured.includes(p));
  const ordered = [...featured, ...rest];

  return (
    <CollectionView
      title="New Arrivals"
      subtitle="Our latest releases and restocks, shaped by gemstone energy, cultural motifs, and contemporary design."
      products={ordered}
      initialStone={searchParams.stone}
      initialTag={searchParams.tag}
      initialQuery={searchParams.q}
    />
  );
}
