import type { Metadata } from "next";
import CollectionView from "@/components/product/CollectionView";
import { getNewArrivals } from "@/data/products";

export function generateMetadata({
  searchParams,
}: {
  searchParams: { stone?: string; tag?: string; q?: string };
}): Metadata {
  const isFiltered = Boolean(
    searchParams.stone || searchParams.tag || searchParams.q,
  );

  return {
    title: "New Natural Stone Jewellery",
    description:
      "Shop new natural stone jewellery, recent releases, and limited pieces from Jewellery Quintessential.",
    alternates: { canonical: "/new" },
    robots: isFiltered ? { index: false, follow: true } : undefined,
    openGraph: {
      title: "New Natural Stone Jewellery — Jewellery Quintessential",
      description:
        "Shop new natural stone jewellery, recent releases, and limited pieces from Jewellery Quintessential.",
      url: "/new",
    },
  };
}

export default function NewPage({
  searchParams,
}: {
  searchParams: { stone?: string; tag?: string; q?: string };
}) {
  const ordered = getNewArrivals();

  return (
    <CollectionView
      title="New Arrivals"
      subtitle="Our latest releases, shaped by gemstone energy, cultural motifs, and contemporary design."
      products={ordered}
      initialStone={searchParams.stone}
      initialTag={searchParams.tag}
      initialQuery={searchParams.q}
    />
  );
}
