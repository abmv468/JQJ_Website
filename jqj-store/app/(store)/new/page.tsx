import type { Metadata } from "next";
import CollectionView from "@/components/product/CollectionView";
import { getNewArrivals } from "@/data/products";
import { pageTwitter } from "@/lib/page-social";

const TITLE = "New Natural Stone Jewellery — Jewellery Quintessential";
const DESCRIPTION =
  "Shop new natural stone jewellery, recent releases from Jewellery Quintessential.";

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
    description: DESCRIPTION,
    alternates: { canonical: "/new" },
    // Omit robots when unfiltered. An explicit `undefined` replaces the root
    // layout robots and drops index, follow and the googleBot preview directives.
    ...(isFiltered ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: "/new",
    },
    twitter: pageTwitter(TITLE, DESCRIPTION),
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
