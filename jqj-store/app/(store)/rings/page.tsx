import CollectionView from "@/components/product/CollectionView";
import { getProductsByCategory } from "@/data/products";

export const metadata = {
  title: "Rings — JQD Group",
};

export default function RingsPage({
  searchParams,
}: {
  searchParams: { stone?: string; tag?: string; q?: string };
}) {
  const items = getProductsByCategory("rings");

  return (
    <CollectionView
      title="Rings"
      emptyTitle="Rings are coming soon"
      emptyDescription="We are building out the ring collection now. In the meantime, explore bracelets and necklaces for our current edits."
      subtitle="A forthcoming collection of sculptural ring designs, shaped with the same natural materials and atelier finish as our core lines."
      products={items}
      initialStone={searchParams.stone}
      initialTag={searchParams.tag}
      initialQuery={searchParams.q}
    />
  );
}