import type { Metadata } from "next";
import CollectionView from "@/components/product/CollectionView";
import { products } from "@/data/products";

type CollectionSearchParams = Promise<{
  stone?: string;
  tag?: string;
  q?: string;
}>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: CollectionSearchParams;
}): Promise<Metadata> {
  const { stone, tag, q } = await searchParams;
  const isFiltered = Boolean(stone || tag || q);

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

export default async function NewPage({
  searchParams,
}: {
  searchParams: CollectionSearchParams;
}) {
  const { stone, tag, q } = await searchParams;
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
      initialStone={stone}
      initialTag={tag}
      initialQuery={q}
    />
  );
}
