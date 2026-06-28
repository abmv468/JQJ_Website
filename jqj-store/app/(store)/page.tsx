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

      <section className="container-site pt-16">
        <div className="section-shell rounded-none">
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="eyebrow">Signiture Pieces</p>
            <h2 className="section-title whitespace-nowrap">Designed to be kept</h2>
            <p className="section-lead whitespace-nowrap text-[13px] sm:text-sm md:text-[15px]">
              Our most collected bracelets and necklaces—selected for balance, wearability, and the kind of presence that gets better with time.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {topProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                sizes="(max-width: 639px) 100vw, (max-width: 1279px) 50vw, 25vw"
              />
            ))}
          </div>
        </div>
      </section>

      <ShopByStone />
      <ForgetMassProduced />
    </>
  );
}
