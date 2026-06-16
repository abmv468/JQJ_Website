"use client";

import { useMemo, useState } from "react";
import { ChevronDown, LayoutGrid, Rows3 } from "lucide-react";
import type { Product } from "@/data/products";
import { stones } from "@/data/products";
import ProductCard from "./ProductCard";

const filterGroups = [
  "Color",
  "Price",
  "Availability",
  "Bead Size",
  "Precious Metal",
  "Bead Shape",
  "Gems",
  "Birthstones",
];

type SortKey = "featured" | "price-asc" | "price-desc" | "rating";

export default function CollectionView({
  title,
  subtitle,
  products,
  initialStone,
}: {
  title: string;
  subtitle?: string;
  products: Product[];
  initialStone?: string;
}) {
  const [sort, setSort] = useState<SortKey>("featured");
  const [stone, setStone] = useState<string | undefined>(initialStone);
  const [openGroup, setOpenGroup] = useState<string | null>("Gems");

  const visible = useMemo(() => {
    let list = [...products];
    if (stone) list = list.filter((p) => p.stone === stone);
    switch (sort) {
      case "price-asc":
        list.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        list.sort((a, b) => b.price - a.price);
        break;
      case "rating":
        list.sort((a, b) => b.rating - a.rating);
        break;
    }
    return list;
  }, [products, stone, sort]);

  return (
    <div className="container-site py-12">
      <header className="mb-10 text-center">
        <h1 className="font-heading text-2xl font-light uppercase tracking-wider2 text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="mx-auto mt-3 max-w-2xl text-sm text-brand-muted">
            {subtitle}
          </p>
        )}
      </header>

      {/* Toolbar */}
      <div className="mb-8 flex items-center justify-between border-y border-brand-border py-3">
        <div className="flex items-center gap-3 text-brand-muted">
          <LayoutGrid className="h-4 w-4" />
          <Rows3 className="h-4 w-4" />
          <span className="text-xs">{visible.length} items</span>
        </div>
        <label className="flex items-center gap-2 text-xs uppercase tracking-wider2 text-brand-muted">
          Sort by
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="border border-brand-border bg-transparent px-2 py-1 text-xs text-white outline-none"
          >
            <option value="featured">Featured</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="rating">Top Rated</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
        {/* Sidebar */}
        <aside className="hidden lg:block">
          <ul className="space-y-1">
            {filterGroups.map((g) => (
              <li key={g} className="border-b border-brand-border/60">
                <button
                  type="button"
                  className="flex w-full items-center justify-between py-3 text-xs uppercase tracking-wider2 text-white/80 hover:text-white"
                  onClick={() => setOpenGroup(openGroup === g ? null : g)}
                >
                  {g}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      openGroup === g ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openGroup === g && g === "Gems" && (
                  <div className="flex flex-col gap-2 pb-4">
                    <button
                      type="button"
                      onClick={() => setStone(undefined)}
                      className={`text-left text-xs ${
                        !stone ? "text-brand-gold" : "text-brand-muted"
                      }`}
                    >
                      All
                    </button>
                    {stones.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStone(s)}
                        className={`text-left text-xs ${
                          stone === s ? "text-brand-gold" : "text-brand-muted hover:text-white"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </aside>

        {/* Grid */}
        <div>
          {visible.length === 0 ? (
            <p className="py-20 text-center text-sm text-brand-muted">
              No products match the selected filters.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3">
              {visible.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
