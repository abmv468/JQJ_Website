import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/data/products";
import { formatPrice } from "@/lib/utils";
import { getStockState } from "@/lib/product-stock";

const tagLabels: Record<string, string> = {
  new: "New",
  limited: "Limited",
  "top-rated": "Top Rated",
  restocked: "Restocked",
  sale: "Sale",
};

export default function ProductCard({ product }: { product: Product }) {
  const primaryTag = product.tags[0];
  const stock = getStockState({
    stockCount: product.stockCount,
    inStock: product.inStock,
    lowStockThreshold: product.lowStockThreshold,
    variants:
      product.variants?.map((variant) => ({
        ...variant,
        stockCount: variant.stockCount,
      })) ?? [],
  });

  return (
    <Link href={`/products/${product.slug}`} className="group block text-center">
      <div className="relative aspect-square overflow-hidden bg-brand-card">
        {primaryTag && (
          <span className="absolute left-3 top-3 z-10 border border-brand-border bg-black/60 px-2 py-1 text-[9px] uppercase tracking-wider2 text-white">
            {tagLabels[primaryTag] ?? primaryTag}
          </span>
        )}
        {!stock.inStock ? (
          <span className="absolute right-3 top-3 z-10 border border-red-500/60 bg-black/70 px-2 py-1 text-[9px] uppercase tracking-wider2 text-red-300">
            Out of stock
          </span>
        ) : stock.isLowStock ? (
          <span className="absolute right-3 top-3 z-10 border border-brand-gold/60 bg-black/70 px-2 py-1 text-[9px] uppercase tracking-wider2 text-brand-gold">
            Low stock
          </span>
        ) : null}
        <Image
          src={product.images[0]}
          alt={product.name}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
      <h3 className="mt-4 text-sm text-white/90 transition-colors group-hover:text-white">
        {product.name}
      </h3>
      <div className="mt-1 flex items-center justify-center gap-2">
        {product.compareAtPrice && (
          <span className="text-xs text-brand-muted line-through">
            {formatPrice(product.compareAtPrice)}
          </span>
        )}
        <span className="text-sm text-brand-gold">{formatPrice(product.price)}</span>
      </div>
    </Link>
  );
}
