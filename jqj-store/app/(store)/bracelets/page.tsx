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
      title="Bracelets"
      limitedTitle="Limited Edition Bracelets"
      subtitle="Museum-inspired bracelet designs, hand-finished in our atelier with carefully selected natural stones."
      products={items}
      initialStone={searchParams.stone}
      initialTag={searchParams.tag}
    />
  );
}
