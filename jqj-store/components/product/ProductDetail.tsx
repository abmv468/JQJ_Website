"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import type { Product } from "@/data/products";
import { useCart } from "@/context/CartContext";
import StarRating from "@/components/ui/StarRating";
import ProductCard from "./ProductCard";
import { getStockState, getVariantLabel } from "@/lib/product-stock";
import { useCurrency } from "@/context/CurrencyContext";

const accordionData = (product: Product) => [
  { title: "Description", content: product.description },
  {
    title: "Specifications",
    content: Object.entries(product.specs)
      .map(([k, v]) => `${k}: ${v}`)
      .join("  •  "),
  },
  {
    title: "Shipping & Return",
    content:
      "Complimentary UPS shipping and returns. 30-day satisfaction guarantee, plus a complimentary first resize for new customers.",
  },
];

export default function ProductDetail({
  product,
  related,
}: {
  product: Product;
  related: Product[];
}) {
  const { addItem } = useCart();
  const { formatFromUsd } = useCurrency();
  const [activeImage, setActiveImage] = useState(0);
  const [size, setSize] = useState("");
  const [variantSku, setVariantSku] = useState("");
  const [qty, setQty] = useState(1);
  const [addState, setAddState] = useState<"idle" | "loading" | "success">("idle");
  const [openAccordion, setOpenAccordion] = useState<string | null>("Description");
  const resetAddStateTimerRef = useRef<number | null>(null);
  const [liveStock, setLiveStock] = useState<{
    inStock: boolean;
    stockCount: number;
    lowStockThreshold: number;
    variants: Array<{
      id?: string;
      size?: string | null;
      material?: string | null;
      sku: string;
      stockCount: number;
      inStock: boolean;
    }>;
  } | null>(null);

  const fallbackStock = getStockState({
    stockCount: product.stockCount,
    inStock: product.inStock,
    lowStockThreshold: product.lowStockThreshold,
    variants:
      product.variants?.map((variant) => ({
        ...variant,
        stockCount: variant.stockCount,
      })) ?? [],
  });

  const variants = useMemo(
    () =>
      (liveStock?.variants ??
        product.variants?.map((variant) => ({
          ...variant,
          inStock: variant.stockCount > 0,
        })) ??
        []),
    [liveStock?.variants, product.variants]
  );

  const hasVariants = variants.length > 0;
  const selectedVariant = variants.find((variant) => variant.sku === variantSku) ?? null;
  const effectiveStock = selectedVariant
    ? selectedVariant.stockCount
    : (liveStock?.stockCount ?? fallbackStock.availableStock);
  const inStock = selectedVariant
    ? selectedVariant.inStock
    : (liveStock?.inStock ?? fallbackStock.inStock);
  const lowStockThreshold = liveStock?.lowStockThreshold ?? fallbackStock.lowStockThreshold;
  const isLowStock = inStock && effectiveStock <= lowStockThreshold;

  useEffect(() => {
    fetch(`/api/products/availability?slug=${encodeURIComponent(product.slug)}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.product) {
          setLiveStock({
            inStock: data.product.inStock,
            stockCount: data.product.stockCount,
            lowStockThreshold: data.product.lowStockThreshold,
            variants: data.product.variants ?? [],
          });
        }
      })
      .catch(() => {});
  }, [product.slug]);

  useEffect(() => {
    if (!hasVariants) return;
    if (selectedVariant) return;
    const firstAvailable = variants.find((variant) => variant.inStock) ?? variants[0];
    if (firstAvailable) setVariantSku(firstAvailable.sku);
  }, [hasVariants, selectedVariant, variants]);

  useEffect(() => {
    if (effectiveStock < qty) {
      setQty(Math.max(1, effectiveStock || 1));
    }
  }, [effectiveStock, qty]);

  useEffect(() => {
    return () => {
      if (resetAddStateTimerRef.current) {
        window.clearTimeout(resetAddStateTimerRef.current);
      }
    };
  }, []);

  async function handleAdd() {
    if (!inStock || (hasVariants && !selectedVariant)) return;
    if (addState !== "idle") return;

    setAddState("loading");
    await new Promise((resolve) => window.setTimeout(resolve, 450));

    setAddState("success");
    await new Promise((resolve) => window.setTimeout(resolve, 380));

    addItem(
      {
        id: product.id,
        slug: product.slug,
        name: product.name,
        price: product.price,
        image: product.images[0],
        sku: selectedVariant?.sku ?? product.sku,
        size: selectedVariant?.size ?? (size || undefined),
        material: selectedVariant?.material ?? undefined,
      },
      qty
    );

    if (resetAddStateTimerRef.current) {
      window.clearTimeout(resetAddStateTimerRef.current);
    }
    resetAddStateTimerRef.current = window.setTimeout(() => {
      setAddState("idle");
      resetAddStateTimerRef.current = null;
    }, 1100);
  }

  return (
    <div className="container-site py-12">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
        {/* Gallery */}
        <div>
          <div className="relative aspect-square overflow-hidden bg-brand-card">
            <Image
              src={product.images[activeImage]}
              alt={product.name}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
          {product.images.length > 1 && (
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {product.images.map((img, i) => (
                <button
                  key={img}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={`relative aspect-square overflow-hidden border bg-brand-card ${
                    activeImage === i ? "border-brand-gold" : "border-brand-border"
                  }`}
                >
                  <Image
                    src={img}
                    alt={`${product.name} ${i + 1}`}
                    fill
                    sizes="120px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="lg:pl-6">
          <h1 className="font-heading text-xl uppercase tracking-wider2 text-white">
            {product.name}
          </h1>
          <div className="mt-3 flex items-center gap-4">
            <div className="flex items-baseline gap-2">
              {product.compareAtPrice && (
                <span className="text-sm text-brand-muted line-through">
                  {formatFromUsd(product.compareAtPrice)}
                </span>
              )}
              <span className="text-lg text-white">{formatFromUsd(product.price)}</span>
            </div>
            <div className="flex items-center gap-2">
              <StarRating rating={product.rating} />
              <span className="text-xs text-brand-muted">({product.reviewCount})</span>
            </div>
          </div>

          {product.compareAtPrice && (
            <p className="mt-2 text-xs uppercase tracking-wider2 text-brand-gold">
              Sale — Save {formatFromUsd(product.compareAtPrice - product.price)}
            </p>
          )}

          {hasVariants ? (
            <div className="mt-8 space-y-3">
              <label htmlFor="variant" className="text-xs uppercase tracking-wider2 text-white/80">
                Size / Material
              </label>
              <select
                id="variant"
                value={variantSku}
                onChange={(e) => setVariantSku(e.target.value)}
                className="input-field"
              >
                {variants.map((variant) => (
                  <option
                    key={variant.sku}
                    value={variant.sku}
                    className="bg-brand-surface"
                    disabled={!variant.inStock}
                  >
                    {getVariantLabel(variant)} {!variant.inStock ? "— Out of stock" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="mt-8">
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="wrist" className="text-xs uppercase tracking-wider2 text-white/80">
                  Enter wrist size (cm/in)
                </label>
                <Link href="/measure" className="text-xs text-brand-gold underline">
                  Measure &amp; Sizing
                </Link>
              </div>
              <input
                id="wrist"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="For example: 7.5 inches, loose fit"
                className="input-field"
              />
            </div>
          )}

          {!inStock ? (
            <p className="mt-4 text-sm text-red-400">Out of stock</p>
          ) : isLowStock ? (
            <p className="mt-4 text-sm text-brand-gold">Low stock — only {effectiveStock} left</p>
          ) : null}

          {/* Quantity + Add */}
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center border border-brand-border">
              <button
                type="button"
                aria-label="Decrease"
                className="px-3 py-3"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center text-sm">{qty}</span>
              <button
                type="button"
                aria-label="Increase"
                className="px-3 py-3"
                onClick={() => setQty((q) => Math.min(effectiveStock, q + 1))}
                disabled={!inStock || qty >= effectiveStock}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <motion.button
              layout
              type="button"
              onClick={handleAdd}
              className={`btn-gold w-full disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${
                addState === "idle" ? "flex-1" : "w-12 px-0"
              }`}
              disabled={
                addState !== "idle" || !inStock || effectiveStock < 1 || (hasVariants && !selectedVariant)
              }
            >
              <LayoutGroup id={`add-to-cart-${product.id}`}>
                <AnimatePresence mode="wait" initial={false}>
                  {addState === "idle" && (
                    <motion.span
                      key="add-label"
                      layoutId={`add-to-cart-content-${product.id}`}
                      className="inline-flex items-center justify-center"
                    >
                      {inStock ? "Add to Cart" : "Unavailable"}
                    </motion.span>
                  )}

                  {addState === "loading" && (
                    <motion.span
                      key="loading"
                      layoutId={`add-to-cart-content-${product.id}`}
                      className="inline-flex items-center justify-center"
                    >
                      <motion.span
                        aria-hidden="true"
                        className="h-4 w-4 rounded-full border-2 border-black/20 border-t-black"
                        animate={{ rotate: 360 }}
                        transition={{ ease: "linear", duration: 0.6, repeat: Infinity }}
                      />
                    </motion.span>
                  )}

                  {addState === "success" && (
                    <motion.span
                      key="success"
                      layoutId={`add-to-cart-content-${product.id}`}
                      className="inline-flex items-center justify-center"
                    >
                      <motion.svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        aria-label="Added to cart"
                        role="img"
                        initial={{
                          scale: 0.9,
                          filter: "drop-shadow(0 0 0px rgba(255, 245, 214, 0))",
                        }}
                        animate={{
                          scale: [0.95, 1.08, 1],
                          filter: [
                            "drop-shadow(0 0 0px rgba(255, 245, 214, 0))",
                            "drop-shadow(0 0 8px rgba(255, 245, 214, 0.95))",
                            "drop-shadow(0 0 6px rgba(255, 245, 214, 0.75))",
                          ],
                        }}
                        transition={{ duration: 0.45, ease: "easeOut" }}
                      >
                        <motion.path
                          d="M5 13l4 4L19 7"
                          fill="none"
                          stroke="#fff5d6"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.35, ease: "easeInOut" }}
                        />
                      </motion.svg>
                    </motion.span>
                  )}
                </AnimatePresence>
              </LayoutGroup>
            </motion.button>
          </div>

          {/* Trust list */}
          <ul className="mt-8 space-y-3 border-t border-brand-border pt-6">
            {product.features.map((f) => (
              <li key={f} className="text-xs text-brand-muted">
                {f}
              </li>
            ))}
          </ul>

          {/* Accordions */}
          <div className="mt-6 border-t border-brand-border">
            {accordionData(product).map((a) => (
              <div key={a.title} className="border-b border-brand-border">
                <button
                  type="button"
                  className="flex w-full items-center justify-between py-4 text-xs uppercase tracking-wider2 text-white/90"
                  onClick={() =>
                    setOpenAccordion(openAccordion === a.title ? null : a.title)
                  }
                >
                  {a.title}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      openAccordion === a.title ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openAccordion === a.title && (
                  <p className="pb-4 text-sm leading-relaxed text-brand-muted">
                    {a.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="mb-8 font-heading text-lg uppercase tracking-wider2 text-white">
            Related Items
          </h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                sizes="(max-width: 767px) 50vw, 25vw"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
