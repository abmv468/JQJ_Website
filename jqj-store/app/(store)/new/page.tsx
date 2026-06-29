import CollectionView from "@/components/product/CollectionView";
import { products } from "@/data/products";

export const metadata = {
  title: "New — JQD Group",
};

export default function NewPage({
  searchParams,
}: {
  searchParams: { stone?: string; tag?: string };
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
    />
  );
}
