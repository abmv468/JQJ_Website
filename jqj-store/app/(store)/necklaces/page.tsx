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
      subtitle="Pendants and strands that blend gemstone symbolism, refined metalwork, and modern elegance."
      products={items}
      initialStone={searchParams.stone}
      initialTag={searchParams.tag}
    />
  );
}
