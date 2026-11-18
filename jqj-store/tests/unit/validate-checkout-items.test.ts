import { describe, expect, it } from "vitest";
import {
  getProductBySlug,
  PAYMENT_TEST_SLUG,
  paymentTestListingHidden,
  unlistedProducts,
} from "@/data/products";
import {
  isHiddenPaymentTestListing,
  validateCheckoutItems,
  type CheckoutItemInput,
  type InventoryProduct,
} from "@/lib/inventory";

const product: InventoryProduct = {
  id: "prod-1",
  slug: "amethyst-bracelet-xv",
  name: "Amethyst Bracelet XV (5mm)",
  price: 100,
  stock_count: 5,
  in_stock: true,
  low_stock_threshold: 5,
  sku: "JQJ-AMETH-XV",
  product_variants: null,
};

const variantProduct: InventoryProduct = {
  ...product,
  slug: "jasper-bracelet",
  stock_count: 6,
  product_variants: [
    {
      id: "var-s",
      product_id: "prod-1",
      size: "Small",
      material: "Sterling Silver",
      sku: "SKU-S",
      stock_count: 4,
    },
    {
      id: "var-m",
      product_id: "prod-1",
      size: "Medium",
      material: "Sterling Silver",
      sku: "SKU-M",
      stock_count: 2,
    },
  ],
};

function item(overrides: Partial<CheckoutItemInput> = {}): CheckoutItemInput {
  return {
    name: product.name,
    slug: product.slug,
    price: 1,
    quantity: 1,
    ...overrides,
  };
}

describe("validateCheckoutItems", () => {
  it("accepts an in-stock product and ignores the client price", () => {
    const inventory = new Map([[product.slug, product]]);
    const result = validateCheckoutItems(
      [item({ quantity: 2, price: 1 })],
      inventory,
    );
    expect(result.ok).toBe(true);
    expect(result.resolved[0]?.requestedQuantity).toBe(2);
    expect(result.resolved[0]?.product.price).toBe(100);
  });

  it("rejects a quantity above stock, a zero quantity, and an unknown slug", () => {
    const inventory = new Map([[product.slug, product]]);
    expect(validateCheckoutItems([item({ quantity: 6 })], inventory).ok).toBe(
      false,
    );
    expect(
      validateCheckoutItems([item({ quantity: 0 })], inventory).errors[0],
    ).toMatch(/at least 1/);
    expect(
      validateCheckoutItems([item({ slug: "missing" })], inventory).errors[0],
    ).toMatch(/unavailable/);
  });

  it("rejects a sold-out product", () => {
    const inventory = new Map([
      [product.slug, { ...product, stock_count: 0, in_stock: false }],
    ]);
    expect(validateCheckoutItems([item()], inventory).errors[0]).toMatch(
      /out of stock/,
    );
  });

  it("requires a real variant and resolves the matching sku", () => {
    const inventory = new Map([[variantProduct.slug, variantProduct]]);
    const missing = validateCheckoutItems(
      [item({ slug: variantProduct.slug, size: "Large" })],
      inventory,
    );
    expect(missing.ok).toBe(false);
    expect(missing.errors[0]).toMatch(/size\/material/);

    const matched = validateCheckoutItems(
      [item({ slug: variantProduct.slug, sku: "SKU-S", quantity: 4 })],
      inventory,
    );
    expect(matched.ok).toBe(true);
    expect(matched.resolved[0]?.variant?.id).toBe("var-s");
    expect(
      validateCheckoutItems(
        [item({ slug: variantProduct.slug, sku: "SKU-S", quantity: 5 })],
        inventory,
      ).ok,
    ).toBe(false);
  });

  it("rejects the hidden payment-test slug even when its products row looks sellable", () => {
    expect(paymentTestListingHidden).toBe(true);
    expect(PAYMENT_TEST_SLUG).toBe("payment-test-do-not-ship");
    expect(unlistedProducts.map((product) => product.slug)).toContain(
      PAYMENT_TEST_SLUG,
    );
    expect(getProductBySlug(PAYMENT_TEST_SLUG)).toBeUndefined();
    expect(getProductBySlug(`  ${PAYMENT_TEST_SLUG}  `)).toBeUndefined();
    expect(getProductBySlug(`  ${PAYMENT_TEST_SLUG}  `)).toBe(
      getProductBySlug(PAYMENT_TEST_SLUG),
    );
    expect(isHiddenPaymentTestListing(PAYMENT_TEST_SLUG)).toBe(true);
    expect(isHiddenPaymentTestListing(`  ${PAYMENT_TEST_SLUG}  `)).toBe(true);
    expect(isHiddenPaymentTestListing("amethyst-bracelet-xv")).toBe(false);

    const paymentTest: InventoryProduct = {
      id: PAYMENT_TEST_SLUG,
      slug: PAYMENT_TEST_SLUG,
      name: "Payment test — do not ship",
      price: 1,
      stock_count: 8,
      in_stock: true,
      low_stock_threshold: 1,
      sku: "JQJ-PAYTEST-001",
      product_variants: [
        {
          id: "paytest-var",
          product_id: PAYMENT_TEST_SLUG,
          size: null,
          material: null,
          sku: "JQJ-PAYTEST-001",
          stock_count: 8,
        },
      ],
    };
    const inventory = new Map<string, InventoryProduct>([
      [paymentTest.slug, paymentTest],
      [product.slug, product],
    ]);

    const hidden = validateCheckoutItems(
      [
        item({
          slug: `  ${PAYMENT_TEST_SLUG}  `,
          name: paymentTest.name,
          price: paymentTest.price,
          quantity: 1,
          sku: paymentTest.sku ?? undefined,
        }),
      ],
      inventory,
    );
    expect(hidden.ok).toBe(false);
    expect(hidden.resolved).toEqual([]);
    expect(hidden.errors).toEqual([
      `Product "${paymentTest.name}" is unavailable.`,
    ]);

    const mixed = validateCheckoutItems(
      [
        item({ quantity: 1, price: 1 }),
        item({
          slug: PAYMENT_TEST_SLUG,
          name: paymentTest.name,
          price: paymentTest.price,
          quantity: 2,
          sku: paymentTest.sku ?? undefined,
        }),
      ],
      inventory,
    );
    expect(mixed.ok).toBe(false);
    expect(mixed.resolved.map((line) => line.product.slug)).toEqual([
      product.slug,
    ]);
    expect(mixed.errors).toEqual([
      `Product "${paymentTest.name}" is unavailable.`,
    ]);
  });
});
