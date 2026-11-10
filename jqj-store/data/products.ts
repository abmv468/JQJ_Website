export type CategorySlug = "bracelets" | "necklaces" | "rings" | "earrings";

export type ProductTag = "new" | "limited" | "top-rated" | "restocked" | "sale";

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
  /** Live counts come from Supabase. Catalog rows must not set this. */
  stockCount?: number;
  lowStockThreshold?: number;
  variants?: Array<{
    size?: string;
    material?: string;
    sku: string;
    stockCount?: number;
  }>;
  rating: number;
  reviewCount: number;
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

const baseFeatures = [
  "Tailored for your preferred fit",
  "Natural gemstones selected for color and character",
  "Complimentary first resize for new customers",
  "Crafted in our atelier with museum-inspired design values",
];

export const products: Product[] = [
  {
    id: "red-leopard-jasper-iii",
    name: "Red Leopard Skin Jasper Bracelet III (6mm)",
    slug: "red-leopard-skin-jasper-bracelet-iii",
    description:
      "Grounded and expressive, this Red Leopard Skin Jasper bracelet pairs warm, naturally patterned stone with a hand-finished silver clasp. A timeless profile, crafted one piece at a time.",
    price: 599.99,
    compareAtPrice: 699.99,
    sku: "JQJ-RLSJ-III",
    category: "bracelets",
    images: [
      "/products/red-leopard-skin-jasper-bracelet-iii-2.jpg",
      "/products/red-leopard-skin-jasper-bracelet-hover.jpg",
      "/products/pearl-silver-necklace-v-2.jpg",
      "/products/JQJ-Group-—-Natural-Stone-Jewelry-with-Cultural-Craft_Photoshoot_Vintage-Sunwashed-Film_2026-06-29_1x.png",
    ],
    hoverImage: "/products/red-leopard-skin-jasper-bracelet-hover.jpg",
    inStock: true,
    lowStockThreshold: 5,
    variants: [
      { size: "Small", material: "Sterling Silver", sku: "JQJ-RLSJ-III-S-SS" },
      { size: "Medium", material: "Sterling Silver", sku: "JQJ-RLSJ-III-M-SS" },
      { size: "Large", material: "Sterling Silver", sku: "JQJ-RLSJ-III-L-SS" },
    ],
    rating: 4.8,
    reviewCount: 28,
    tags: ["top-rated", "sale"],
    stone: "Carnelian",
    features: baseFeatures,
    specs: {
      Color: "Red",
      "Bead Size": "6mm",
      "Bead Shape": "Round",
      Stone: "Red Leopard Skin Jasper",
      Clasp: "Sterling Silver",
      Origin: "Hand-made",
    },
  },
  {
    id: "brown-tourmaline-i",
    name: "Raw Brown Tourmaline Bracelet I (8-10mm)",
    slug: "raw-brown-tourmaline-bracelet-i",
    description:
      "Raw brown tourmaline nuggets are left close to their natural form, highlighting each stone's individual texture. Designed for everyday wear with artisanal character.",
    price: 368.99,
    compareAtPrice: null,
    sku: "JQJ-TOURM-I",
    category: "bracelets",
    images: ["/products/brown-tourmaline-bracelet.webp"],
    inStock: true,
    lowStockThreshold: 5,
    rating: 4.7,
    reviewCount: 19,
    tags: ["new"],
    stone: "Brown Tourmaline",
    features: baseFeatures,
    specs: {
      Color: "Brown",
      "Bead Size": "8-10mm",
      "Bead Shape": "Irregular",
      Stone: "Raw Brown Tourmaline",
      Clasp: "Sterling Silver",
      Origin: "Hand-made",
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
    images: ["/products/sodalite-bracelet.webp"],
    inStock: true,
    lowStockThreshold: 5,
    rating: 4.9,
    reviewCount: 41,
    tags: ["top-rated"],
    stone: "Sodalite",
    features: baseFeatures,
    specs: {
      Color: "Blue",
      "Bead Size": "4mm",
      "Bead Shape": "Round",
      Stone: "Sodalite",
      Clasp: "Sterling Silver",
      Origin: "Hand-made",
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
    images: ["/products/amethyst-bracelet.webp"],
    inStock: true,
    lowStockThreshold: 5,
    rating: 4.6,
    reviewCount: 33,
    tags: ["new", "limited"],
    stone: "Amethyst",
    features: baseFeatures,
    specs: {
      Color: "Purple",
      "Bead Size": "5mm",
      "Bead Shape": "Round",
      Stone: "Amethyst",
      Clasp: "Sterling Silver",
      Origin: "Hand-made",
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
    images: ["/products/silver-bracelet.webp"],
    inStock: true,
    lowStockThreshold: 5,
    rating: 4.8,
    reviewCount: 26,
    tags: ["restocked", "sale"],
    stone: "Hematite",
    features: baseFeatures,
    specs: {
      Color: "Silver",
      "Bead Size": "4mm",
      "Bead Shape": "Round",
      Stone: "Hematite",
      Clasp: "Sterling Silver",
      Origin: "Hand-made",
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
    lowStockThreshold: 5,
    rating: 4.9,
    reviewCount: 22,
    tags: ["limited"],
    stone: "Labradorite",
    features: baseFeatures,
    specs: {
      Color: "Gray",
      "Bead Size": "8mm",
      "Bead Shape": "Round",
      Stone: "Labradorite",
      Clasp: "Sterling Silver",
      Origin: "Hand-made",
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
    lowStockThreshold: 5,
    variants: [
      { size: "45cm", material: "Sterling Silver", sku: "JQJ-BLAPEN-45-SS" },
      { size: "55cm", material: "Sterling Silver", sku: "JQJ-BLAPEN-55-SS" },
      { size: "55cm", material: "Gold Vermeil", sku: "JQJ-BLAPEN-55-GV" },
    ],
    rating: 4.7,
    reviewCount: 14,
    tags: ["new"],
    stone: "Blue Lace Agate",
    features: baseFeatures,
    specs: {
      "Chain Length": "55cm",
      Stone: "Blue Lace Agate",
      Metal: "Sterling Silver",
      Origin: "Hand-made",
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
    lowStockThreshold: 5,
    rating: 4.8,
    reviewCount: 17,
    tags: ["restocked"],
    stone: "Labradorite",
    features: baseFeatures,
    specs: {
      "Chain Length": "55cm",
      Stone: "Labradorite",
      Metal: "Sterling Silver",
      Origin: "Hand-made",
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
    lowStockThreshold: 5,
    rating: 4.9,
    reviewCount: 9,
    tags: ["limited", "top-rated"],
    stone: "Freshwater Pearl",
    features: baseFeatures,
    specs: {
      "Bead Size": "7mm",
      Stone: "Freshwater Pearl",
      Metal: "Sterling Silver",
      Origin: "Hand-made",
    },
  },
];

/** Unique, non-empty stone names. Pass a category when the listing is category-scoped. */
export function getStoneFilters(
  list: readonly Pick<Product, "stone" | "category">[] = products,
  category?: CategorySlug
): string[] {
  return Array.from(
    new Set(
      list
        .filter((product) => (category ? product.category === category : true))
        .map((product) => product.stone.trim())
        .filter((stone) => stone.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b, "en"));
}

export const stones: string[] = getStoneFilters();

/** One listing that contains every product of this stone. */
export function stoneListingHref(stone: string): string {
  const matches = Array.from(
    new Set(products.filter((product) => product.stone === stone).map((product) => product.category))
  );
  if (matches.length !== 1) return `/new?stone=${encodeURIComponent(stone)}`;
  return `/${matches[0]}?stone=${encodeURIComponent(stone)}`;
}

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
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
