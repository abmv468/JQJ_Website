"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, LayoutGrid, Rows3, Search } from "lucide-react";
import type { Product, ProductTag } from "@/data/products";
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

const PAGE_SIZE = 6;

type SortKey =
  | "featured"
  | "price-asc"
  | "price-desc"
  | "rating"
  | "newest";

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "rating", label: "Top Rated" },
  { value: "newest", label: "Newest" },
];

export default function CollectionView({
  title,
  limitedTitle,
  subtitle,
  products,
  initialStone,
  initialTag,
}: {
  title: string;
  limitedTitle?: string;
  subtitle?: string;
  products: Product[];
  initialStone?: string;
  initialTag?: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("featured");
  const normalizedInitialTag = useMemo(() => {
    if (!initialTag) return undefined;
    return products.some((p) => p.tags.includes(initialTag as ProductTag))
      ? (initialTag as ProductTag)
      : undefined;
  }, [initialTag, products]);
  const [stone, setStone] = useState<string | undefined>(initialStone);
  const [tag, setTag] = useState<ProductTag | undefined>(normalizedInitialTag);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>("Gems");
  const [sortOpen, setSortOpen] = useState(false);
  const [page, setPage] = useState(1);

  const stones = useMemo(
    () => Array.from(new Set(products.map((p) => p.stone))).sort(),
    [products]
  );

  const indexById = useMemo(
    () => new Map(products.map((p, i) => [p.id, i])),
    [products]
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    let list = [...products];

    if (stone) list = list.filter((p) => p.stone === stone);
    if (tag) list = list.filter((p) => p.tags.includes(tag));
    if (inStockOnly) list = list.filter((p) => p.inStock);
    if (normalizedQuery) {
      list = list.filter((p) => {
        const haystack =
          `${p.name} ${p.description} ${p.stone} ${p.tags.join(" ")}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      });
    }

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
      case "newest":
        list.sort((a, b) => {
          const score = (p: Product) =>
            p.tags.includes("new") ? 2 : p.tags.includes("restocked") ? 1 : 0;
          const scoreDelta = score(b) - score(a);
          if (scoreDelta !== 0) return scoreDelta;
          return (indexById.get(b.id) ?? 0) - (indexById.get(a.id) ?? 0);
        });
        break;
      default:
        break;
    }
    return list;
  }, [products, stone, tag, inStockOnly, query, sort, indexById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, sort, stone, tag, inStockOnly]);

  useEffect(() => {
    setStone(initialStone);
    setTag(normalizedInitialTag);
  }, [initialStone, normalizedInitialTag]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-sort-dropdown="true"]')) {
        setSortOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const clearFilters = () => {
    setQuery("");
    setStone(undefined);
    setTag(undefined);
    setInStockOnly(false);
    setSort("featured");
    setOpenGroup("Gems");
    setPage(1);
  };

  const pageButtons = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => Math.abs(p - page) <= 2 || p === 1 || p === totalPages
  );
  const displayTitle = limitedTitle && tag === "limited" ? limitedTitle : title;

  return (
    <div className="container-site py-12">
      <nav className="mb-6 text-xs uppercase tracking-wider2 text-brand-muted">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/" className="transition-colors hover:text-white">
              Home
            </Link>
          </li>
          <li>/</li>
          <li className="text-white">{displayTitle}</li>
        </ol>
      </nav>

      <header className="mb-10 text-center">
        <h1 className="font-heading text-2xl font-light uppercase tracking-wider2 text-white">
          {displayTitle}
        </h1>
        {subtitle && (
          <p className="mx-auto mt-3 max-w-2xl text-sm text-brand-muted">
            {subtitle}
          </p>
        )}
      </header>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-y border-brand-border py-3">
        <div className="flex flex-wrap items-center gap-3 text-brand-muted">
          <LayoutGrid className="h-4 w-4" />
          <Rows3 className="h-4 w-4" />
          <span className="text-xs">{filtered.length} items</span>
          <label className="relative block w-full sm:w-[300px]">
            <span className="sr-only">Search products</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
            <input
              id="catalog-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products"
              className="h-10 w-full border border-brand-border bg-transparent pl-10 pr-3 text-sm text-white placeholder-brand-muted outline-none transition-colors focus:border-brand-gold"
            />
          </label>
        </div>
        <div className="relative flex items-center gap-2 text-xs uppercase tracking-wider2 text-brand-muted">
          <span>Sort by</span>
          <div data-sort-dropdown="true" className="relative">
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
              onClick={() => setSortOpen((prev) => !prev)}
              className="flex min-w-[220px] items-center justify-between border border-brand-border bg-black px-4 py-2 text-left text-sm text-white transition-colors hover:border-white/60"
            >
              <span className="normal-case">
                {sortOptions.find((option) => option.value === sort)?.label ?? "Featured"}
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${sortOpen ? "rotate-180" : ""}`}
              />
            </button>

            {sortOpen && (
              <div
                role="listbox"
                className="absolute right-0 z-20 mt-1 w-full border border-brand-border bg-brand-surface shadow-xl"
              >
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={sort === option.value}
                    onClick={() => {
                      setSort(option.value);
                      setSortOpen(false);
                    }}
                    className={`w-full px-4 py-2 text-left text-sm normal-case transition-colors ${
                      sort === option.value
                        ? "bg-brand-gold/20 text-brand-gold"
                        : "text-white/90 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
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
                        !stone ? "text-brand-gold" : "text-brand-muted hover:text-white"
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
                {openGroup === g && g === "Availability" && (
                  <div className="pb-4">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-brand-muted hover:text-white">
                      <input
                        type="checkbox"
                        checked={inStockOnly}
                        onChange={(e) => setInStockOnly(e.target.checked)}
                        className="h-4 w-4 accent-brand-gold"
                      />
                      In stock only
                    </label>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-6 w-full border border-brand-border px-4 py-2 text-xs uppercase tracking-wider2 text-white/80 transition-colors hover:border-white hover:text-white"
          >
            Clear filters
          </button>
        </aside>

        <div>
          <div className="mb-6 flex items-center justify-between border-b border-brand-border/60 pb-4 text-sm text-brand-muted">
            <span>
              Showing {filtered.length === 0 ? 0 : start + 1}-
              {Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <span>Page {page} of {totalPages}</span>
          </div>

          {filtered.length === 0 ? (
            <p className="py-20 text-center text-sm text-brand-muted">
              No products match your search and filters.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3">
                {visible.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="border border-brand-border px-3 py-2 text-xs uppercase tracking-wider2 text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                {pageButtons.map((n, idx) => {
                  const prev = pageButtons[idx - 1];
                  return (
                    <div key={n} className="flex items-center gap-2">
                      {prev && n - prev > 1 && (
                        <span className="px-1 text-brand-muted">…</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setPage(n)}
                        className={`min-w-[36px] border px-3 py-2 text-xs ${
                          n === page
                            ? "border-brand-gold text-brand-gold"
                            : "border-brand-border text-white"
                        }`}
                      >
                        {n}
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="border border-brand-border px-3 py-2 text-xs uppercase tracking-wider2 text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
