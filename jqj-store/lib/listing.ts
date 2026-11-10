import {
  products,
  type CategorySlug,
  type Product,
  type ProductTag,
} from "@/data/products";

/** Same haystack the collection search box uses, so menu links and the page agree. */
export function productSearchText(product: Product): string {
  return `${product.name} ${product.description} ${product.stone} ${product.tags.join(" ")} ${Object.values(product.specs).join(" ")}`.toLowerCase();
}

export function productsForListingHref(href: string): Product[] {
  const url = new URL(href, "https://jqd.local");
  const category = url.pathname.replace(/^\//, "");
  let list =
    category === "new" || category === ""
      ? [...products]
      : products.filter((product) => product.category === category);

  const stone = url.searchParams.get("stone");
  const tag = url.searchParams.get("tag");
  const query = url.searchParams.get("q");
  if (stone) list = list.filter((product) => product.stone === stone);
  if (tag) list = list.filter((product) => product.tags.includes(tag as ProductTag));
  if (query) {
    const needle = query.trim().toLowerCase();
    if (needle) list = list.filter((product) => productSearchText(product).includes(needle));
  }
  return list;
}

/** A category listing that actually contains this stone. Bracelets win when both do. */
export function stoneListingHref(stone: string): string {
  const categories = Array.from(
    new Set(products.filter((product) => product.stone === stone).map((product) => product.category))
  );
  const category: CategorySlug = categories.includes("bracelets")
    ? "bracelets"
    : (categories[0] ?? "bracelets");
  return `/${category}?stone=${encodeURIComponent(stone)}`;
}
