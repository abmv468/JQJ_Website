import CollectionView from "@/components/product/CollectionView";
import { getProductsByCategory } from "@/data/products";

export const metadata = {
  title: "Bracelets — JQJ Group",
};

export default function BraceletsPage({
  searchParams,
}: {
  searchParams: { stone?: string; tag?: string };
}) {
  let items = getProductsByCategory("bracelets");
  if (searchParams.tag) {
    items = items.filter((p) => p.tags.includes(searchParams.tag as never));
  }

  return (
    <CollectionView
      title={searchParams.tag === "limited" ? "Limited Edition Bracelets" : "Bracelets"}
      subtitle="Featuring unique stones and shapes from all over the world, hand-finished in our atelier."
      products={items}
      initialStone={searchParams.stone}
    />
  );
}
