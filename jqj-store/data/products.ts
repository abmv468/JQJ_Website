export type CategorySlug = "bracelets" | "necklaces" | "rings" | "earrings";

export type ProductTag = "new" | "limited" | "restocked" | "sale";

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  compareAtPrice?: number | null;
  sku?: string;
  category: CategorySlug;
  images: string[];
  hoverImage?: string;
  inStock: boolean;
  stockCount: number;
  lowStockThreshold?: number;
  variants?: Array<{
    size?: string;
    material?: string;
    sku: string;
    stockCount: number;
  }>;
  tags: ProductTag[];
  stone: string;
  features: string[];
  specs: Record<string, string>;
}

export const categories: { slug: CategorySlug; name: string }[] = [
  { slug: "bracelets", name: "Bracelets" },
  { slug: "necklaces", name: "Necklaces" },
  { slug: "rings", name: "Rings" },
  { slug: "earrings", name: "Earrings" },
];

const sharedFeatures = [
  "Tailored for your preferred fit",
  "Natural gemstones selected for colour and character",
  "Designed in Hong Kong",
];

const catalog: Product[] = [
  {
    id: "red-leopard-jasper-iii",
    name: "Red Leopard Skin Jasper Bracelet III (6mm)",
    slug: "red-leopard-skin-jasper-bracelet-iii",
    description:
      "Grounded and expressive, this Red Leopard Skin Jasper bracelet pairs warm, naturally patterned stone with a silver clasp. A timeless profile, finished one piece at a time.",
    price: 599.99,
    compareAtPrice: 699.99,
    sku: "JQJ-RLSJ-III",
    category: "bracelets",
    images: [
      "/products/red-leopard-skin-jasper-bracelet-iii-2.jpg",
      "/products/red-leopard-skin-jasper-bracelet-hover.jpg",
    ],
    hoverImage: "/products/red-leopard-skin-jasper-bracelet-hover.jpg",
    inStock: true,
    stockCount: 12,
    lowStockThreshold: 5,
    variants: [
      {
        size: "Small",
        material: "Sterling Silver",
        sku: "JQJ-RLSJ-III-S-SS",
        stockCount: 4,
      },
      {
        size: "Medium",
        material: "Sterling Silver",
        sku: "JQJ-RLSJ-III-M-SS",
        stockCount: 5,
      },
      {
        size: "Large",
        material: "Sterling Silver",
        sku: "JQJ-RLSJ-III-L-SS",
        stockCount: 3,
      },
    ],
    tags: ["sale"],
    stone: "Jasper",
    features: sharedFeatures,
    specs: {
      Colour: "Red",
      "Bead Size": "6mm",
      "Bead Shape": "Round",
      Stone: "Red Leopard Skin Jasper",
      Clasp: "Sterling Silver",
      Origin: "Designed in Hong Kong",
    },
  },
  {
    id: "brown-tourmaline-i",
    name: "Raw Brown Tourmaline Bracelet I (8-10mm)",
    slug: "raw-brown-tourmaline-bracelet-i",
    description:
      "Raw brown tourmaline nuggets are left close to their natural form, highlighting each stone's individual texture. Designed for everyday wear.",
    price: 368.99,
    compareAtPrice: null,
    sku: "JQJ-TOURM-I",
    category: "bracelets",
    images: ["/products/brown-tourmaline-bracelet.webp"],
    inStock: true,
    stockCount: 8,
    lowStockThreshold: 5,
    tags: ["new"],
    stone: "Tourmaline",
    features: sharedFeatures,
    specs: {
      Colour: "Brown",
      "Bead Size": "8-10mm",
      "Bead Shape": "Irregular",
      Stone: "Raw Brown Tourmaline",
      Clasp: "Sterling Silver",
      Origin: "Designed in Hong Kong",
    },
  },
  {
    id: "sodalite-viii",
    name: "Sodalite Bracelet VIII (4mm)",
    slug: "sodalite-bracelet-viii",
    description:
      "Deep blue sodalite with subtle white veining is finished with precision silver accents for a clean, understated look rooted in quiet confidence.",
    price: 549.99,
    compareAtPrice: null,
    sku: "JQJ-SOD-VIII",
    category: "bracelets",
    images: [
      "/products/sodalite-bracelet-viii-1.jpg",
      "/products/sodalite-bracelet.webp",
    ],
    inStock: true,
    stockCount: 15,
    lowStockThreshold: 5,
    tags: [] as ProductTag[],
    stone: "Sodalite",
    features: sharedFeatures,
    specs: {
      Colour: "Blue",
      "Bead Size": "4mm",
      "Bead Shape": "Round",
      Stone: "Sodalite",
      Clasp: "Sterling Silver",
      Origin: "Designed in Hong Kong",
    },
  },
  {
    id: "amethyst-xv",
    name: "Amethyst Bracelet XV (5mm)",
    slug: "amethyst-bracelet-xv",
    description:
      "Faceted amethyst beads in graduated violet tones create an elegant rhythm. A versatile piece that moves effortlessly from daytime polish to evening refinement.",
    price: 330.99,
    compareAtPrice: null,
    sku: "JQJ-AMETH-XV",
    category: "bracelets",
    images: [
      "/products/amethyst-bracelet-xv-1.jpg",
      "/products/amethyst-bracelet.webp",
    ],
    inStock: true,
    stockCount: 20,
    lowStockThreshold: 5,
    tags: ["new", "limited"],
    stone: "Amethyst",
    features: sharedFeatures,
    specs: {
      Colour: "Purple",
      "Bead Size": "5mm",
      "Bead Shape": "Round",
      Stone: "Amethyst",
      Clasp: "Sterling Silver",
      Origin: "Designed in Hong Kong",
    },
  },
  {
    id: "silver-iv",
    name: "Silver Bracelet IV (4mm)",
    slug: "silver-bracelet-iv",
    description:
      "A modern essential with polished silver-tone beads and a minimalist silhouette. Designed to layer well and complement a wide range of looks.",
    price: 449.99,
    compareAtPrice: 499.99,
    sku: "JQJ-SIL-IV",
    category: "bracelets",
    images: [
      "/products/silver-bracelet-iv-2.jpg",
      "/products/silver-bracelet.webp",
    ],
    inStock: true,
    stockCount: 9,
    lowStockThreshold: 5,
    tags: ["restocked", "sale"],
    stone: "Hematite Silver",
    features: sharedFeatures,
    specs: {
      Colour: "Silver",
      "Bead Size": "4mm",
      "Bead Shape": "Round",
      Stone: "Hematite Silver",
      Clasp: "Sterling Silver",
      Origin: "Designed in Hong Kong",
    },
  },
  {
    id: "labradorite-v",
    name: "Labradorite Bracelet V (8mm)",
    slug: "labradorite-bracelet-v",
    description:
      "Iridescent labradorite reveals blue-gold flashes as it catches the light. A quiet statement piece with depth, movement, and refined presence.",
    price: 519.99,
    compareAtPrice: null,
    sku: "JQJ-LABR-V",
    category: "bracelets",
    images: ["/products/labradorite-bracelet.webp"],
    inStock: true,
    stockCount: 6,
    lowStockThreshold: 5,
    tags: ["limited"],
    stone: "Labradorite",
    features: sharedFeatures,
    specs: {
      Colour: "Gray",
      "Bead Size": "8mm",
      "Bead Shape": "Round",
      Stone: "Labradorite",
      Clasp: "Sterling Silver",
      Origin: "Designed in Hong Kong",
    },
  },
  {
    id: "blue-lace-agate-pendant",
    name: "Blue Lace Agate Silver Pendant",
    slug: "blue-lace-agate-silver-pendant",
    description:
      "A polished blue lace agate point set in silver and suspended on a fine box chain. Calm, elegant, and designed for effortless daily styling.",
    price: 249.99,
    compareAtPrice: null,
    sku: "JQJ-BLAPEN",
    category: "necklaces",
    images: ["/products/blue-lace-agate-pendant.webp"],
    inStock: true,
    stockCount: 18,
    lowStockThreshold: 5,
    variants: [
      {
        size: "45cm",
        material: "Sterling Silver",
        sku: "JQJ-BLAPEN-45-SS",
        stockCount: 7,
      },
      {
        size: "55cm",
        material: "Sterling Silver",
        sku: "JQJ-BLAPEN-55-SS",
        stockCount: 8,
      },
      {
        size: "55cm",
        material: "Gold Vermeil",
        sku: "JQJ-BLAPEN-55-GV",
        stockCount: 3,
      },
    ],
    tags: ["new"],
    stone: "Agate",
    features: sharedFeatures,
    specs: {
      "Chain Length": "55cm",
      Stone: "Blue Lace Agate",
      Metal: "Sterling Silver",
      Origin: "Designed in Hong Kong",
    },
  },
  {
    id: "labradorite-pendant",
    name: "Labradorite Silver Pendant",
    slug: "labradorite-silver-pendant",
    description:
      "A faceted labradorite baton framed in silver with a shifting inner glow. Each angle reveals a different tone for a subtle statement.",
    price: 279.99,
    compareAtPrice: null,
    sku: "JQJ-LABPEN",
    category: "necklaces",
    images: ["/products/labradorite-pendant.webp"],
    inStock: true,
    stockCount: 11,
    lowStockThreshold: 5,
    tags: ["restocked"],
    stone: "Labradorite",
    features: sharedFeatures,
    specs: {
      "Chain Length": "55cm",
      Stone: "Labradorite",
      Metal: "Sterling Silver",
      Origin: "Designed in Hong Kong",
    },
  },
  {
    id: "pearl-silver-v",
    name: "Pearl - Silver Necklace V (7mm)",
    slug: "pearl-silver-necklace-v",
    description:
      "Freshwater pearls are paired with silver-tone hematite for a contemporary interpretation of a classic strand, balancing softness with modern structure.",
    price: 980.0,
    compareAtPrice: null,
    sku: "JQJ-PEARL-V",
    category: "necklaces",
    images: ["/products/pearl-silver-necklace.webp"],
    inStock: true,
    stockCount: 5,
    lowStockThreshold: 5,
    tags: ["limited"],
    stone: "Pearl",
    features: sharedFeatures,
    specs: {
      "Bead Size": "7mm",
      Stone: "Freshwater Pearl",
      Metal: "Sterling Silver",
      Origin: "Designed in Hong Kong",
    },
  },
];

export const products: Product[] = catalog;

// Reachable by direct URL only. Kept out of `products` so home, collections,
// related products, static params, and catalog seed generation omit it.
//
// Set `paymentTestListingHidden` to false to serve the unlisted
// payment-test listing again. The entry below stays either way.
export const PAYMENT_TEST_SLUG = "payment-test-do-not-ship";
export const paymentTestListingHidden = true;

export const unlistedProducts: Product[] = [
  {
    id: PAYMENT_TEST_SLUG,
    name: "Payment test — do not ship",
    slug: PAYMENT_TEST_SLUG,
    description:
      "Temporary card-payment test. This is not a real jewellery item, and it will not be shipped.",
    price: 1,
    compareAtPrice: null,
    sku: "JQJ-PAYTEST-001",
    category: "necklaces",
    images: [`/products/${PAYMENT_TEST_SLUG}.webp`],
    inStock: true,
    stockCount: 1,
    lowStockThreshold: 1,
    tags: [],
    stone: "None",
    features: [
      "Temporary card-payment test",
      "Not a real jewellery item",
      "Will not be shipped",
    ],
    specs: {
      Purpose: "Card payment test",
      Item: "Not a real jewellery item",
      Shipping: "Will not be shipped",
    },
  },
];

export function getProductBySlug(
  slug: string,
  visibility?: { paymentTestListingHidden?: boolean },
): Product | undefined {
  const hidden =
    visibility?.paymentTestListingHidden ?? paymentTestListingHidden;
  const normalized = slug.trim();
  return (
    products.find((p) => p.slug === normalized) ??
    unlistedProducts.find((product) => {
      if (product.slug !== normalized) return false;
      if (hidden && product.slug === PAYMENT_TEST_SLUG) return false;
      return true;
    })
  );
}

export function getProductsByCategory(category: CategorySlug): Product[] {
  return products.filter((p) => p.category === category);
}

export function getProductsByTag(tag: ProductTag): Product[] {
  return products.filter((p) => p.tags.includes(tag));
}

export function getRelatedProducts(product: Product, limit = 4): Product[] {
  return products
    .filter((p) => p.id !== product.id && p.category === product.category)
    .slice(0, limit);
}

/** New Arrivals is the `new` tag only. Sale-only and limited-only SKUs stay off /new. */
export function getNewArrivals(): Product[] {
  return products.filter((product) => product.tags.includes("new"));
}

/** Limited Edition spans categories. Pearl is a limited necklace, not a bracelet. */
export function getLimitedEditionProducts(): Product[] {
  return products.filter((product) => product.tags.includes("limited"));
}

const STONE_TILE_ORDER = [
  "Sodalite",
  "Tourmaline",
  "Amethyst",
  "Jasper",
  "Labradorite",
  "Hematite Silver",
  "Agate",
  "Pearl",
] as const;

/**
 * Raw mineral photos already in public/stones. Stones without a file are
 * omitted here so the homepage does not invent a photograph.
 */
const STONE_RAW_IMAGES: Partial<Record<string, string>> = {
  Sodalite: "/stones/sodalite-raw.webp",
  Tourmaline: "/stones/tourmaline-raw.webp",
  Amethyst: "/stones/amethyst-raw.webp",
};

export function getCatalogStones(): string[] {
  const sold = new Set(products.map((product) => product.stone));
  const ordered = STONE_TILE_ORDER.filter((stone) => sold.has(stone));
  const extras = [...sold]
    .filter(
      (stone) =>
        !STONE_TILE_ORDER.includes(stone as (typeof STONE_TILE_ORDER)[number]),
    )
    .sort((a, b) => a.localeCompare(b));
  return [...ordered, ...extras];
}

export function stoneRawImage(stone: string): string | undefined {
  return STONE_RAW_IMAGES[stone];
}

/**
 * Point a stone tile at an existing category filter.
 * Labradorite is sold as both a bracelet and a necklace, and no current public
 * URL lists both. The closest existing pattern is the bracelet filter; the
 * pendant remains at /necklaces?stone=Labradorite.
 */
export function catalogStoneHref(stone: string): string {
  const matches = products.filter((product) => product.stone === stone);
  const categories = new Set(matches.map((product) => product.category));
  if (categories.size === 1 && matches[0]) {
    return `/${matches[0].category}?stone=${encodeURIComponent(stone)}`;
  }
  const bracelet = matches.find((product) => product.category === "bracelets");
  const category = bracelet?.category ?? matches[0]?.category ?? "bracelets";
  return `/${category}?stone=${encodeURIComponent(stone)}`;
}
