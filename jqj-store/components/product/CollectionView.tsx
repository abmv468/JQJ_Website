"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, LayoutGrid, Rows3, Search, SlidersHorizontal, X } from "lucide-react";
import type { Product, ProductTag } from "@/data/products";
import { productSearchText } from "@/lib/listing";
import { formatPrice } from "@/lib/utils";
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
] as const;

type FilterGroup = (typeof filterGroups)[number];
type FacetOption = { value: string; count: number };

const colorSwatches: Record<string, string> = {
  Black: "#111111",
  Blue: "#345d8f",
  Brown: "#76523a",
  Gray: "#8d9290",
  Green: "#557c65",
  Purple: "#704b86",
  Red: "#9a4441",
  Silver: "#b9bec3",
  White: "#f1f1ee",
};

const birthstoneMonths: Array<{ month: string; stones: string[] }> = [
  { month: "January", stones: ["Garnet"] },
  { month: "February", stones: ["Amethyst"] },
  { month: "March", stones: ["Aquamarine"] },
  { month: "April", stones: ["Diamond"] },
  { month: "May", stones: ["Emerald"] },
  { month: "June", stones: ["Pearl"] },
  { month: "July", stones: ["Ruby"] },
  { month: "August", stones: ["Peridot"] },
  { month: "September", stones: ["Sapphire"] },
  { month: "October", stones: ["Opal", "Tourmaline"] },
  { month: "November", stones: ["Citrine", "Topaz"] },
  { month: "December", stones: ["Tanzanite", "Turquoise", "Zircon"] },
];

function getPreciousMetal(product: Product) {
  const material = product.specs.Clasp ?? product.specs.Metal ?? "";
  if (/gold/i.test(material)) return "Gold";
  if (/silver/i.test(material)) return "Silver";
  return undefined;
}

function getBirthstoneMonth(product: Product) {
  const stone = product.specs.Stone ?? product.stone;
  return birthstoneMonths.find(({ stones }) =>
    stones.some((birthstone) => stone.toLowerCase().includes(birthstone.toLowerCase()))
  )?.month;
}

function getFacetOptions(products: Product[], getValue: (product: Product) => string | undefined) {
  const counts = new Map<string, number>();

  products.forEach((product) => {
    const value = getValue(product);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return Array.from(counts, ([value, count]) => ({ value, count })).sort((a, b) =>
    a.value.localeCompare(b.value, undefined, { numeric: true })
  );
}

const PAGE_SIZE = 6;

type SortKey =
  | "featured"
  | "price-asc"
  | "price-desc"
  | "rating"
  | "newest";

type EditorialSection = {
  title: string;
  paragraphs: string[];
  links?: Array<{ label: string; href: string }>;
};

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
  emptyTitle,
  emptyDescription,
  subtitle,
  products,
  editorialSections,
  initialStone,
  initialTag,
  initialQuery,
}: {
  title: string;
  limitedTitle?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  subtitle?: string;
  products: Product[];
  editorialSections?: EditorialSection[];
  initialStone?: string;
  initialTag?: string;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery ?? "");
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
  const priceBounds = useMemo<[number, number]>(() => {
    if (products.length === 0) return [0, 0];
    const prices = products.map((product) => product.price);
    return [Math.floor(Math.min(...prices)), Math.ceil(Math.max(...prices))];
  }, [products]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<[number, number]>(() => priceBounds);
  const [selectedBeadSizes, setSelectedBeadSizes] = useState<string[]>([]);
  const [selectedMetals, setSelectedMetals] = useState<string[]>([]);
  const [selectedBeadShapes, setSelectedBeadShapes] = useState<string[]>([]);
  const [selectedBirthstones, setSelectedBirthstones] = useState<string[]>([]);
  const [openGroup, setOpenGroup] = useState<string | null>("Gems");
  const [sortOpen, setSortOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);

  const stones = useMemo(
    () => Array.from(new Set(products.map((p) => p.stone))).sort(),
    [products]
  );

  const colorOptions = useMemo(
    () => getFacetOptions(products, (product) => product.specs.Color),
    [products]
  );
  const beadSizeOptions = useMemo(
    () => getFacetOptions(products, (product) => product.specs["Bead Size"]),
    [products]
  );
  const metalOptions = useMemo(
    () => getFacetOptions(products, getPreciousMetal),
    [products]
  );
  const beadShapeOptions = useMemo(
    () => getFacetOptions(products, (product) => product.specs["Bead Shape"]),
    [products]
  );
  const birthstoneOptions = useMemo(
    () => getFacetOptions(products, getBirthstoneMonth),
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
    if (selectedColors.length) {
      list = list.filter((product) => selectedColors.includes(product.specs.Color ?? ""));
    }
    list = list.filter(
      (product) => product.price >= priceRange[0] && product.price <= priceRange[1]
    );
    if (selectedBeadSizes.length) {
      list = list.filter((product) =>
        selectedBeadSizes.includes(product.specs["Bead Size"] ?? "")
      );
    }
    if (selectedMetals.length) {
      list = list.filter((product) => selectedMetals.includes(getPreciousMetal(product) ?? ""));
    }
    if (selectedBeadShapes.length) {
      list = list.filter((product) =>
        selectedBeadShapes.includes(product.specs["Bead Shape"] ?? "")
      );
    }
    if (selectedBirthstones.length) {
      list = list.filter((product) =>
        selectedBirthstones.includes(getBirthstoneMonth(product) ?? "")
      );
    }
    if (inStockOnly) list = list.filter((p) => p.inStock);
    if (normalizedQuery) {
      list = list.filter((p) => {
        return productSearchText(p).includes(normalizedQuery);
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
        list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
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
  }, [
    products,
    stone,
    tag,
    selectedColors,
    priceRange,
    selectedBeadSizes,
    selectedMetals,
    selectedBeadShapes,
    selectedBirthstones,
    inStockOnly,
    query,
    sort,
    indexById,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [
    query,
    sort,
    stone,
    tag,
    selectedColors,
    priceRange,
    selectedBeadSizes,
    selectedMetals,
    selectedBeadShapes,
    selectedBirthstones,
    inStockOnly,
  ]);

  useEffect(() => {
    setPriceRange((current) => {
      const nextMin = Math.max(priceBounds[0], Math.min(current[0], priceBounds[1]));
      const nextMax = Math.max(priceBounds[0], Math.min(current[1], priceBounds[1]));
      return [Math.min(nextMin, nextMax), Math.max(nextMin, nextMax)];
    });
  }, [priceBounds]);

  useEffect(() => {
    setStone(initialStone);
    setTag(normalizedInitialTag);
  }, [initialStone, normalizedInitialTag]);

  useEffect(() => {
    setQuery(initialQuery ?? "");
  }, [initialQuery]);

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
    setSelectedColors([]);
    setPriceRange(priceBounds);
    setSelectedBeadSizes([]);
    setSelectedMetals([]);
    setSelectedBeadShapes([]);
    setSelectedBirthstones([]);
    setInStockOnly(false);
    setSort("featured");
    setOpenGroup("Gems");
    setPage(1);
  };

  const pageButtons = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => Math.abs(p - page) <= 2 || p === 1 || p === totalPages
  );
  const displayTitle = limitedTitle && tag === "limited" ? limitedTitle : title;

  const toggleFacetValue = (
    value: string,
    selected: string[],
    setSelected: (values: string[]) => void
  ) => {
    setSelected(
      selected.includes(value)
        ? selected.filter((selectedValue) => selectedValue !== value)
        : [...selected, value]
    );
  };

  const updateMinimumPrice = (value: number) => {
    if (!Number.isFinite(value)) return;
    const nextMinimum = Math.max(priceBounds[0], Math.min(value, priceRange[1]));
    setPriceRange([nextMinimum, priceRange[1]]);
  };

  const updateMaximumPrice = (value: number) => {
    if (!Number.isFinite(value)) return;
    const nextMaximum = Math.min(priceBounds[1], Math.max(value, priceRange[0]));
    setPriceRange([priceRange[0], nextMaximum]);
  };

  const renderCheckboxFacet = (
    options: FacetOption[],
    selected: string[],
    setSelected: (values: string[]) => void,
    withSwatches = false
  ) => {
    if (options.length === 0) {
      return <p className="pb-4 text-xs text-brand-muted">No options available.</p>;
    }

    return (
      <div className="flex flex-col gap-2 pb-4">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 text-xs text-brand-muted transition-colors hover:text-white"
          >
            <input
              type="checkbox"
              checked={selected.includes(option.value)}
              onChange={() => toggleFacetValue(option.value, selected, setSelected)}
              className="h-4 w-4 shrink-0 accent-brand-gold"
            />
            {withSwatches && (
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/20"
                style={{ backgroundColor: colorSwatches[option.value] ?? "#7d817e" }}
              />
            )}
            <span className="flex-1">{option.value}</span>
            <span className="text-brand-muted/70">({option.count})</span>
          </label>
        ))}
      </div>
    );
  };

  const renderFilterPanel = (group: FilterGroup) => {
    switch (group) {
      case "Color":
        return renderCheckboxFacet(colorOptions, selectedColors, setSelectedColors, true);
      case "Price":
        return (
          <div className="space-y-3 pb-4">
            <div className="flex items-center justify-between text-[11px] text-brand-muted">
              <span>{formatPrice(priceRange[0])}</span>
              <span>{formatPrice(priceRange[1])}</span>
            </div>
            <div className="space-y-2">
              <input
                aria-label="Minimum price"
                type="range"
                min={priceBounds[0]}
                max={priceBounds[1]}
                value={priceRange[0]}
                onChange={(event) => updateMinimumPrice(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-brand-gold"
              />
              <input
                aria-label="Maximum price"
                type="range"
                min={priceBounds[0]}
                max={priceBounds[1]}
                value={priceRange[1]}
                onChange={(event) => updateMaximumPrice(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-brand-gold"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="border border-brand-border px-2 py-2 text-xs text-brand-muted focus-within:border-brand-gold">
                <span className="sr-only">Minimum price</span>
                <span aria-hidden="true" className="mr-1">$</span>
                <input
                  type="number"
                  min={priceBounds[0]}
                  max={priceRange[1]}
                  value={priceRange[0]}
                  onChange={(event) => updateMinimumPrice(Number(event.target.value))}
                  className="w-full bg-transparent text-right text-xs text-white outline-none"
                />
              </label>
              <label className="border border-brand-border px-2 py-2 text-xs text-brand-muted focus-within:border-brand-gold">
                <span className="sr-only">Maximum price</span>
                <span aria-hidden="true" className="mr-1">$</span>
                <input
                  type="number"
                  min={priceRange[0]}
                  max={priceBounds[1]}
                  value={priceRange[1]}
                  onChange={(event) => updateMaximumPrice(Number(event.target.value))}
                  className="w-full bg-transparent text-right text-xs text-white outline-none"
                />
              </label>
            </div>
          </div>
        );
      case "Availability":
        return (
          <div className="pb-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-brand-muted hover:text-white">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(event) => setInStockOnly(event.target.checked)}
                className="h-4 w-4 accent-brand-gold"
              />
              <span>In stock only</span>
            </label>
          </div>
        );
      case "Bead Size":
        return renderCheckboxFacet(beadSizeOptions, selectedBeadSizes, setSelectedBeadSizes);
      case "Precious Metal":
        return renderCheckboxFacet(metalOptions, selectedMetals, setSelectedMetals);
      case "Bead Shape":
        return renderCheckboxFacet(beadShapeOptions, selectedBeadShapes, setSelectedBeadShapes);
      case "Gems":
        return (
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
            {stones.map((stoneOption) => (
              <button
                key={stoneOption}
                type="button"
                onClick={() => setStone(stoneOption)}
                className={`text-left text-xs ${
                  stone === stoneOption ? "text-brand-gold" : "text-brand-muted hover:text-white"
                }`}
              >
                {stoneOption}
              </button>
            ))}
          </div>
        );
      case "Birthstones":
        return renderCheckboxFacet(
          birthstoneOptions,
          selectedBirthstones,
          setSelectedBirthstones
        );
    }
  };

  const renderFilterGroup = (group: FilterGroup) => (
    <li key={group} className="border-b border-brand-border/60">
      <button
        type="button"
        aria-expanded={openGroup === group}
        className="flex w-full items-center justify-between py-3 text-xs uppercase tracking-wider2 text-white/80 hover:text-white"
        onClick={() => setOpenGroup(openGroup === group ? null : group)}
      >
        {group}
        <ChevronDown
          className={`h-4 w-4 transition-transform ${
            openGroup === group ? "rotate-180" : ""
          }`}
        />
      </button>
      {openGroup === group && renderFilterPanel(group)}
    </li>
  );

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
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="inline-flex items-center gap-2 border border-brand-border px-3 py-2 text-xs uppercase tracking-wider2 text-white/85 transition-colors hover:border-white/40 hover:text-white lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </button>
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
        <div className="relative flex w-full items-center justify-between gap-2 text-xs uppercase tracking-wider2 text-brand-muted sm:w-auto sm:justify-start">
          <span>Sort by</span>
          <div data-sort-dropdown="true" className="relative">
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
              onClick={() => setSortOpen((prev) => !prev)}
              className="flex w-[185px] items-center justify-between border border-brand-border bg-black px-4 py-2 text-left text-sm text-white transition-colors hover:border-white/60 sm:w-auto sm:min-w-[220px]"
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

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 bg-black/70"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-xs overflow-y-auto border-l border-brand-border bg-brand-surface p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between border-b border-brand-border pb-3">
              <h2 className="font-heading text-sm uppercase tracking-wider2 text-white">Filters</h2>
              <button
                type="button"
                aria-label="Close filters"
                className="inline-flex h-9 w-9 items-center justify-center border border-brand-border text-white/75 transition-colors hover:border-white/40 hover:text-white"
                onClick={() => setMobileFiltersOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ul className="space-y-1">{filterGroups.map(renderFilterGroup)}</ul>

            <button
              type="button"
              onClick={() => {
                clearFilters();
                setMobileFiltersOpen(false);
              }}
              className="mt-6 w-full border border-brand-border px-4 py-2 text-xs uppercase tracking-wider2 text-white/80 transition-colors hover:border-white hover:text-white"
            >
              Clear filters
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <ul className="space-y-1">{filterGroups.map(renderFilterGroup)}</ul>
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
            products.length === 0 ? (
              <div className="py-20 text-center">
                <h2 className="font-heading text-xl uppercase tracking-wider2 text-white">
                  {emptyTitle ?? `${title} are coming soon`}
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-brand-muted">
                  {emptyDescription ??
                    "We are curating this collection now. Explore bracelets and necklaces for the closest available edits."}
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <Link href="/bracelets" className="btn-secondary">
                    Browse bracelets
                  </Link>
                  <Link href="/necklaces" className="btn-primary">
                    Browse necklaces
                  </Link>
                </div>
              </div>
            ) : (
              <p className="py-20 text-center text-sm text-brand-muted">
                No products match your search and filters.
              </p>
            )
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3">
                {visible.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    sizes="(max-width: 767px) 50vw, 33vw"
                  />
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

      {editorialSections && editorialSections.length > 0 && (
        <section className="mt-20 border-t border-brand-border pt-12">
          <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-2">
            {editorialSections.map((section) => (
              <article key={section.title}>
                <h2 className="font-heading text-xl uppercase tracking-wider2 text-white">
                  {section.title}
                </h2>
                <div className="mt-4 space-y-3 text-sm leading-7 text-brand-muted">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                {section.links && section.links.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3">
                    {section.links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="text-xs uppercase tracking-wider2 text-brand-gold transition-colors hover:text-brand-gold-light"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
