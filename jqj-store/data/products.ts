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
  imageAlt?: string;
  metaDescription?: string;
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

const braceletFeatures = [
  "Tailored for your preferred fit",
  "Natural gemstones selected for color and character",
  "Designed in Hong Kong",
];

const necklaceFeatures = ["Designed in Hong Kong", "Sterling silver"];

export const products: Product[] = [
  {
    id: "red-leopard-jasper-iii",
    name: "Red Leopard Skin Jasper Cube Bracelet",
    slug: "red-leopard-skin-jasper-bracelet-iii",
    description:
      "Cut into clean cubes, Red Leopard Skin Jasper shows its natural spotted pattern in warm reds, rose, cream and earthy browns, so no two beads look quite alike. Small dark spacers sit between the stones, and a single silver-tone cube with an engraved mark adds a quiet point of light to the strand. Designed in Hong Kong with materials sourced from around the world, it is a considered piece for everyday wear, and arrives gift-ready.",
    metaDescription:
      "Red Leopard Skin Jasper Cube Bracelet by Jewellery Quintessential · 極氣: patterned jasper cubes with one silver-tone accent, designed in Hong Kong.",
    price: 599.99,
    compareAtPrice: null,
    sku: "JQJ-RLSJ-III",
    category: "bracelets",
    images: ["/products/red-leopard-jasper-bracelet.webp"],
    hoverImage: "/products/red-leopard-jasper-bracelet.webp",
    imageAlt:
      "Red Leopard Skin Jasper cube bead bracelet with small dark spacers and one engraved silver-tone cube, on a black background.",
    inStock: true,
    lowStockThreshold: 5,
    variants: [
      { size: "Small", material: "Silver-tone", sku: "JQJ-RLSJ-III-S-SS" },
      { size: "Medium", material: "Silver-tone", sku: "JQJ-RLSJ-III-M-SS" },
      { size: "Large", material: "Silver-tone", sku: "JQJ-RLSJ-III-L-SS" },
    ],
    tags: [],
    stone: "Red Leopard Skin Jasper",
    features: [
      "Designed in Hong Kong",
      "Natural stones selected for colour and character",
    ],
    specs: {
      Stone: "Red Leopard Skin Jasper",
      "Bead Shape": "Cube",
      Accent: "One silver-tone cube with an engraved mark",
      Spacers: "Small dark spacers",
      Care: "Keep dry. Store separately. Wipe with a soft cloth.",
      Origin: "Designed in Hong Kong",
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
    tags: ["new"],
    stone: "Brown Tourmaline",
    features: braceletFeatures,
    specs: {
      Color: "Brown",
      "Bead Size": "8-10mm",
      "Bead Shape": "Irregular",
      Stone: "Brown Tourmaline",
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
    images: ["/products/sodalite-bracelet.webp"],
    inStock: true,
    lowStockThreshold: 5,
    tags: [] as ProductTag[],
    stone: "Sodalite",
    features: braceletFeatures,
    specs: {
      Color: "Blue",
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
    images: ["/products/amethyst-bracelet.webp"],
    inStock: true,
    lowStockThreshold: 5,
    tags: ["new", "limited"],
    stone: "Amethyst",
    features: braceletFeatures,
    specs: {
      Color: "Purple",
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
    images: ["/products/silver-bracelet.webp"],
    inStock: true,
    lowStockThreshold: 5,
    tags: ["restocked", "sale"],
    stone: "Hematite",
    features: braceletFeatures,
    specs: {
      Color: "Silver",
      "Bead Size": "4mm",
      "Bead Shape": "Round",
      Stone: "Hematite",
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
    lowStockThreshold: 5,
    tags: ["limited"],
    stone: "Labradorite",
    features: braceletFeatures,
    specs: {
      Color: "Gray",
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
      "A slender flat bar of blue lace agate, capped at each end in sterling silver, hangs from a diamond-shaped bail on a sterling silver curb chain. Available in 45 cm or 55 cm.",
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
    tags: ["new"],
    stone: "Blue Lace Agate",
    features: necklaceFeatures,
    specs: {
      "Chain Length": "45 cm or 55 cm",
      Stone: "Blue Lace Agate",
      Metal: "Sterling silver",
      Origin: "Designed in Hong Kong",
    },
  },
  {
    id: "labradorite-pendant",
    name: "Labradorite Silver Pendant",
    slug: "labradorite-silver-pendant",
    description:
      "A slender bar of labradorite with angled ends and a soft blue sheen, capped top and bottom in sterling silver, on a diamond-shaped bail and sterling silver curb chain. 55 cm.",
    price: 279.99,
    compareAtPrice: null,
    sku: "JQJ-LABPEN",
    category: "necklaces",
    images: ["/products/labradorite-pendant.webp"],
    inStock: true,
    lowStockThreshold: 5,
    tags: ["restocked"],
    stone: "Labradorite",
    features: necklaceFeatures,
    specs: {
      "Chain Length": "55 cm",
      Stone: "Labradorite",
      Metal: "Sterling silver",
      Origin: "Designed in Hong Kong",
    },
  },
  {
    id: "pearl-silver-v",
    name: "Pearl - Silver Necklace V (7mm)",
    slug: "pearl-silver-necklace-v",
    description:
      "7 mm freshwater pearls with silver-tone hematite spacers. 45 cm.",
    price: 980.0,
    compareAtPrice: null,
    sku: "JQJ-PEARL-V",
    category: "necklaces",
    images: ["/products/pearl-silver-necklace.webp"],
    inStock: true,
    lowStockThreshold: 5,
    tags: ["limited"],
    stone: "Freshwater Pearl",
    features: necklaceFeatures,
    specs: {
      "Bead Size": "7 mm",
      "Chain Length": "45 cm",
      Stone: "Freshwater Pearl",
      Spacers: "Hematite",
      Origin: "Designed in Hong Kong",
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
