import { products, type CategorySlug, type ProductTag } from "@/data/products";
import { productsForListingHref } from "@/lib/listing";

export type MegaMenuKey = "bracelets" | "necklaces";

export type MegaMenuItem = {
  label: string;
  href: string;
};

export type MegaMenuColumn = {
  title: string;
  items: MegaMenuItem[];
};

export type MegaMenuConfig = {
  key: MegaMenuKey;
  label: string;
  columns: MegaMenuColumn[];
  card: {
    title: string;
    href: string;
    image: string;
    alt: string;
  };
};

const tagLabels: Record<Exclude<ProductTag, "top-rated">, string> = {
  new: "New",
  limited: "Limited",
  restocked: "Restocked",
  sale: "Sale",
};

const tagOrder: Array<Exclude<ProductTag, "top-rated">> = ["new", "limited", "restocked", "sale"];

function listingHref(category: CategorySlug, params: Record<string, string>): string {
  return `/${category}?${new URLSearchParams(params).toString()}`;
}

function column(title: string, items: MegaMenuItem[]): MegaMenuColumn | null {
  const live = items.filter((item) => productsForListingHref(item.href).length > 0);
  return live.length > 0 ? { title, items: live } : null;
}

function stoneColumn(category: CategorySlug, title: string): MegaMenuColumn | null {
  const stones = Array.from(
    new Set(products.filter((product) => product.category === category).map((product) => product.stone))
  ).sort((a, b) => a.localeCompare(b));
  return column(
    title,
    stones.map((stone) => ({ label: stone, href: listingHref(category, { stone }) }))
  );
}

function tagColumn(category: CategorySlug): MegaMenuColumn | null {
  const present = new Set(
    products.filter((product) => product.category === category).flatMap((product) => product.tags)
  );
  return column(
    "Collection",
    tagOrder
      .filter((tag) => present.has(tag))
      .map((tag) => ({ label: tagLabels[tag], href: listingHref(category, { tag }) }))
  );
}

function beadSizeColumn(): MegaMenuColumn | null {
  const sizes = Array.from(
    new Set(
      products
        .filter((product) => product.category === "bracelets")
        .map((product) => product.specs["Bead Size"])
        .filter((size): size is string => Boolean(size))
    )
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return column(
    "Shop by Bead Size",
    sizes.map((size) => ({ label: size, href: listingHref("bracelets", { q: size }) }))
  );
}

function buildMegaMenus(): Record<MegaMenuKey, MegaMenuConfig> {
  const necklaceColumns = [
    stoneColumn("necklaces", "Gems"),
    column("Style", [{ label: "Pendants", href: listingHref("necklaces", { q: "Pendant" }) }]),
    tagColumn("necklaces"),
  ].filter((entry): entry is MegaMenuColumn => entry !== null);

  const braceletColumns = [
    stoneColumn("bracelets", "Shop by Stone"),
    beadSizeColumn(),
    tagColumn("bracelets"),
  ].filter((entry): entry is MegaMenuColumn => entry !== null);

  return {
    necklaces: {
      key: "necklaces",
      label: "Necklaces",
      columns: necklaceColumns,
      card: {
        title: "All Necklaces",
        href: "/necklaces",
        image: "/products/pearl-silver-necklace.webp",
        alt: "Beaded necklace of white pearls and patterned silver-tone round beads, on a black background.",
      },
    },
    bracelets: {
      key: "bracelets",
      label: "Bracelets",
      columns: braceletColumns,
      card: {
        title: "All Bracelets",
        href: "/bracelets",
        image: "/products/main-hover-card-bracelets.jpg",
        alt: "Bracelets collection",
      },
    },
  };
}

export const megaMenus = buildMegaMenus();

export function megaMenuLinks(): MegaMenuItem[] {
  return Object.values(megaMenus).flatMap((menu) => [
    ...menu.columns.flatMap((entry) => entry.items),
    { label: menu.card.title, href: menu.card.href },
  ]);
}
