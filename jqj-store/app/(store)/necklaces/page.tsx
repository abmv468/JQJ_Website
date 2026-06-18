import CollectionView from "@/components/product/CollectionView";
import { getProductsByCategory } from "@/data/products";

export const metadata = {
  title: "Necklaces — JQJ Group",
};

export default function NecklacesPage({
  searchParams,
}: {
  searchParams: { stone?: string; tag?: string };
}) {
  const items = getProductsByCategory("necklaces");

  return (
    <CollectionView
      title="Necklaces"
      subtitle="Pendants and beaded strands crafted with premium natural stones and pearls."
      products={items}
      initialStone={searchParams.stone}
      initialTag={searchParams.tag}
    />
  );
}
