import Hero from "@/components/home/Hero";
import LatestCollections from "@/components/home/LatestCollections";
import ShopByStone from "@/components/home/ShopByStone";
import ForgetMassProduced from "@/components/home/ForgetMassProduced";
import ProductCard from "@/components/product/ProductCard";
import { products } from "@/data/products";

export default function HomePage() {
  const topProducts = products.slice(0, 8);

  return (
    <>
      <Hero />
      <LatestCollections />

      <section className="container-site pb-16">
        <h2 className="section-title mb-10">Top Products</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
          {topProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <ShopByStone />
      <ForgetMassProduced />
    </>
  );
}
