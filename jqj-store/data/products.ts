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
  stockCount: number;
  lowStockThreshold?: number;
  variants?: Array<{
    size?: string;
    material?: string;
    sku: string;
    stockCount: number;
  }>;
  rating: number;
  reviewCount: number;
  tags: ProductTag[];
  stone: string;
  features: string[];
  specs: Record<string, string>;
}

// Stone filters used on listing pages and the home "Shop by Stone" section.
export const stones = [
  "Sodalite",
  "Tiger Eye",
  "Carnelian",
  "Tourmaline",
  "Aquamarine",
  "Amethyst",
  "Lapis Lazuli",
] as const;

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
      "/products/red-leopard-skin-jasper-bracelet-iii-3.jpg",
      "/products/red-leopard-jasper-bracelet.webp",
      "/products/lifestyle.webp",
    ],
    hoverImage: "/products/red-leopard-skin-jasper-bracelet-hover.jpg",
    inStock: true,
    stockCount: 12,
    lowStockThreshold: 5,
    variants: [
      { size: "Small", material: "Sterling Silver", sku: "JQJ-RLSJ-III-S-SS", stockCount: 4 },
      { size: "Medium", material: "Sterling Silver", sku: "JQJ-RLSJ-III-M-SS", stockCount: 5 },
      { size: "Large", material: "Sterling Silver", sku: "JQJ-RLSJ-III-L-SS", stockCount: 3 },
    ],
    rating: 4.8,
    reviewCount: 28,
    tags: ["top-rated", "sale"],
    stone: "Carnelian",
    features: baseFeatures,
    specs: {
      "Bead Size": "6mm",
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
    images: [
      "/products/raw-brown-tourmaline-bracelet-i-2.jpg",
      "/products/raw-brown-tourmaline-bracelet-i-3.jpg",
      "/products/brown-tourmaline-bracelet.webp",
    ],
    inStock: true,
    stockCount: 8,
    lowStockThreshold: 5,
    rating: 4.7,
    reviewCount: 19,
    tags: ["new"],
    stone: "Tourmaline",
    features: baseFeatures,
    specs: {
      "Bead Size": "8-10mm",
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
    images: ["/products/sodalite-bracelet-viii-1.jpg", "/products/sodalite-bracelet.webp"],
    inStock: true,
    stockCount: 15,
    lowStockThreshold: 5,
    rating: 4.9,
    reviewCount: 41,
    tags: ["top-rated"],
    stone: "Sodalite",
    features: baseFeatures,
    specs: {
      "Bead Size": "4mm",
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
    images: ["/products/amethyst-bracelet-xv-1.jpg", "/products/amethyst-bracelet.webp"],
    inStock: true,
    stockCount: 20,
    lowStockThreshold: 5,
    rating: 4.6,
    reviewCount: 33,
    tags: ["new", "limited"],
    stone: "Amethyst",
    features: baseFeatures,
    specs: {
      "Bead Size": "5mm",
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
    images: ["/products/silver-bracelet-iv-2.jpg", "/products/silver-bracelet.webp"],
    inStock: true,
    stockCount: 9,
    lowStockThreshold: 5,
    rating: 4.8,
    reviewCount: 26,
    tags: ["restocked", "sale"],
    stone: "Tiger Eye",
    features: baseFeatures,
    specs: {
      "Bead Size": "4mm",
      Stone: "Hematite Silver",
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
    images: ["/products/labradorite-bracelet-v-1.jpg", "/products/labradorite-bracelet.webp"],
    inStock: true,
    stockCount: 6,
    lowStockThreshold: 5,
    rating: 4.9,
    reviewCount: 22,
    tags: ["limited"],
    stone: "Lapis Lazuli",
    features: baseFeatures,
    specs: {
      "Bead Size": "8mm",
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
    images: ["/products/blue-lace-agate-silver-pendant-1.jpg", "/products/blue-lace-agate-pendant.webp"],
    inStock: true,
    stockCount: 18,
    lowStockThreshold: 5,
    variants: [
      { size: "45cm", material: "Sterling Silver", sku: "JQJ-BLAPEN-45-SS", stockCount: 7 },
      { size: "55cm", material: "Sterling Silver", sku: "JQJ-BLAPEN-55-SS", stockCount: 8 },
      { size: "55cm", material: "Gold Vermeil", sku: "JQJ-BLAPEN-55-GV", stockCount: 3 },
    ],
    rating: 4.7,
    reviewCount: 14,
    tags: ["new"],
    stone: "Aquamarine",
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
    images: ["/products/labradorite-silver-pendant-1.jpg", "/products/labradorite-pendant.webp"],
    inStock: true,
    stockCount: 11,
    lowStockThreshold: 5,
    rating: 4.8,
    reviewCount: 17,
    tags: ["restocked"],
    stone: "Lapis Lazuli",
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
    images: [
      "/products/pearl-silver-necklace-v-1.jpg",
      "/products/pearl-silver-necklace-v-2.jpg",
      "/products/pearl-silver-necklace.webp",
    ],
    inStock: true,
    stockCount: 5,
    lowStockThreshold: 5,
    rating: 4.9,
    reviewCount: 9,
    tags: ["limited", "top-rated"],
    stone: "Tiger Eye",
    features: baseFeatures,
    specs: {
      "Bead Size": "7mm",
      Stone: "Freshwater Pearl",
      Metal: "Sterling Silver",
      Origin: "Hand-made",
    },
  },
];

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
