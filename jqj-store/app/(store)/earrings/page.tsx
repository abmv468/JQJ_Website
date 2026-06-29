import CollectionView from "@/components/product/CollectionView";
import { getProductsByCategory } from "@/data/products";

export const metadata = {
  title: "Earrings — JQD Group",
};

export default function EarringsPage({
  searchParams,
}: {
  searchParams: { stone?: string; tag?: string; q?: string };
}) {
  const items = getProductsByCategory("earrings");

  return (
    <CollectionView
      title="Earrings"
      emptyTitle="Earrings are coming soon"
      emptyDescription="This collection is being prepared alongside our bracelet and necklace lines. Check back soon, or browse the current edits in the meantime."
      subtitle="An upcoming selection of refined earring designs inspired by the same gemstone palette and handcrafted detail."
      products={items}
      initialStone={searchParams.stone}
      initialTag={searchParams.tag}
      initialQuery={searchParams.q}
    />
  );
}