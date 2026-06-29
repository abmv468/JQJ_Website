"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Product } from "@/data/products";
import { getStockState } from "@/lib/product-stock";
import StarRating from "@/components/ui/StarRating";
import { useCurrency } from "@/context/CurrencyContext";

const tagLabels: Record<string, string> = {
  new: "New",
  limited: "Limited",
  "top-rated": "Top Rated",
  restocked: "Restocked",
  sale: "Sale",
};

export default function ProductCard({
  product,
  sizes = "(max-width: 767px) 50vw, 25vw",
}: {
  product: Product;
  sizes?: string;
}) {
  const { formatFromUsd } = useCurrency();
  const primaryTag = product.tags[0];
  const hoverImage = product.hoverImage;
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
    <Link href={`/products/${product.slug}`} className="group block h-full">
      <article className="flex h-full flex-col rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-3 text-left transition-[transform,border-color,background-color] duration-200 hover:-translate-y-1 hover:border-white/18 hover:bg-white/[0.05]">
        <div className="relative aspect-[0.94] overflow-hidden rounded-[1.2rem] bg-brand-card">
          {primaryTag && (
            <span
              className="absolute left-3 top-3 z-10 rounded-full border border-white/12 bg-black/50 px-2.5 py-1 text-[9px] uppercase text-white/82 backdrop-blur-md"
              style={{ letterSpacing: "0.18em" }}
            >
              {tagLabels[primaryTag] ?? primaryTag}
            </span>
          )}
          {!stock.inStock ? (
            <span
              className="absolute right-3 top-3 z-10 rounded-full border border-red-500/45 bg-black/58 px-2.5 py-1 text-[9px] uppercase text-red-200 backdrop-blur-md"
              style={{ letterSpacing: "0.18em" }}
            >
              Out of stock
            </span>
          ) : stock.isLowStock ? (
            <span
              className="absolute right-3 top-3 z-10 rounded-full border border-brand-gold/45 bg-black/58 px-2.5 py-1 text-[9px] uppercase text-brand-gold backdrop-blur-md"
              style={{ letterSpacing: "0.18em" }}
            >
              Low stock
            </span>
          ) : null}
          <Image
            src={product.images[0]}
            alt={product.name}
            fill
            sizes={sizes}
            className={`rounded-[1.2rem] object-cover transition-[transform,opacity] duration-500 ${hoverImage ? "opacity-100 group-hover:scale-[1.04] group-hover:opacity-0" : "group-hover:scale-[1.04]"}`}
          />
          {hoverImage ? (
            <Image
              src={hoverImage}
              alt={`${product.name} hover view`}
              fill
              sizes={sizes}
              className="rounded-[1.2rem] object-cover opacity-0 transition-[transform,opacity] duration-500 group-hover:scale-[1.04] group-hover:opacity-100"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/72" />
          <div className="absolute bottom-3 left-3 rounded-full border border-white/10 bg-black/42 px-3 py-1 text-[10px] uppercase text-white/76 backdrop-blur-md">
            {product.stone}
          </div>
        </div>

        <div className="flex flex-1 flex-col px-1 pb-1 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] text-white/58">
              <StarRating rating={product.rating} size={11} />
              <span>{product.reviewCount} reviews</span>
            </div>
            <ArrowUpRight className="h-4 w-4 text-white/42 transition-colors duration-200 group-hover:text-white" />
          </div>

          <h3 className="mt-4 text-sm leading-6 text-white/92 transition-colors duration-200 group-hover:text-white">
            {product.name}
          </h3>

          <div className="mt-auto pt-4">
            <div className="flex items-end justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {product.compareAtPrice && (
                  <span className="text-xs text-brand-muted line-through">
                    {formatFromUsd(product.compareAtPrice)}
                  </span>
                )}
                <span className="text-base text-brand-gold">{formatFromUsd(product.price)}</span>
              </div>
              <span
                className="text-[10px] uppercase text-white/58"
                style={{ letterSpacing: "0.18em" }}
              >
                {product.category}
              </span>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
