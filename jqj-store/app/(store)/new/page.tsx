import CollectionView from "@/components/product/CollectionView";
import { products } from "@/data/products";

export const metadata = {
  title: "New — JQJ Group",
};

export default function NewPage({
  searchParams,
}: {
  searchParams: { stone?: string };
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
      subtitle="Featuring our latest releases and restocks. Find unique stones and shapes from all over the world."
      products={ordered}
      initialStone={searchParams.stone}
    />
  );
}
