import { describe, expect, it } from "vitest";
import {
  categories,
  getProductBySlug,
  getProductsByCategory,
  getRelatedProducts,
  products,
  type CategorySlug,
} from "@/data/products";

const SLUG = "payment-test-do-not-ship";
const SKU = "JQJ-PAYTEST-001";

const SUPPORTED_CATEGORIES: CategorySlug[] = [
  "bracelets",
  "necklaces",
  "rings",
  "earrings",
];

function isPaymentTest(product: { id: string; slug: string; sku?: string }): boolean {
  return product.id === SLUG || product.slug === SLUG || product.sku === SKU;
}

describe("payment test listing", () => {
  it("resolves the unlisted payment-test product by slug", () => {
    const product = getProductBySlug(SLUG);

    expect(product).toMatchObject({
      id: SLUG,
      slug: SLUG,
      sku: SKU,
      price: 1,
    });
    expect(product?.price.toFixed(2)).toBe("1.00");
  });

  it("keeps the payment-test SKU out of the public products export", () => {
    expect(products.some(isPaymentTest)).toBe(false);
  });

  it("does not return the payment-test SKU from category listings", () => {
    const listed = new Set(categories.map((category) => category.slug));
    expect(listed.has("necklaces")).toBe(true);

    for (const category of SUPPORTED_CATEGORIES) {
      expect(getProductsByCategory(category).some(isPaymentTest)).toBe(false);
    }
  });

  it("does not offer the payment-test SKU as a related product", () => {
    const paymentTest = getProductBySlug(SLUG);
    expect(paymentTest).toBeDefined();

    expect(getRelatedProducts(paymentTest!).some(isPaymentTest)).toBe(false);
    for (const product of products) {
      expect(getRelatedProducts(product).some(isPaymentTest)).toBe(false);
    }
  });
});
