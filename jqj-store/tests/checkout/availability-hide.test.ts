import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/products/availability/route";
import { PAYMENT_TEST_SLUG, paymentTestListingHidden } from "@/data/products";
import {
  createCheckoutDb,
  setActiveDb,
  type MemoryDb,
} from "../helpers/memory-db";

describe("product availability hide gate", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    db.seed("products", [
      {
        id: PAYMENT_TEST_SLUG,
        slug: PAYMENT_TEST_SLUG,
        name: "Payment test — do not ship",
        price: 1,
        stock_count: 8,
        in_stock: true,
        low_stock_threshold: 1,
        sku: "JQJ-PAYTEST-001",
      },
    ]);
  });

  it("does not return stock for the hidden payment-test slug", async () => {
    expect(paymentTestListingHidden).toBe(true);

    const response = await GET(
      new Request(
        `http://localhost:3000/api/products/availability?slug=${encodeURIComponent(PAYMENT_TEST_SLUG)}`,
      ),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: "Product not found" });
    expect(JSON.stringify(body)).not.toMatch(/stockCount|JQJ-PAYTEST-001|"8"/);
    expect(
      db.rowsOf("products").find((row) => row.slug === PAYMENT_TEST_SLUG),
    ).toMatchObject({ stock_count: 8, in_stock: true });
  });

  it("does not return stock when the hidden slug is padded", async () => {
    const response = await GET(
      new Request(
        `http://localhost:3000/api/products/availability?slug=${encodeURIComponent(`  ${PAYMENT_TEST_SLUG}  `)}`,
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Product not found",
    });
  });

  it("still returns stock for a catalog slug", async () => {
    const response = await GET(
      new Request(
        "http://localhost:3000/api/products/availability?slug=amethyst-bracelet-xv",
      ),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.product).toMatchObject({
      slug: "amethyst-bracelet-xv",
      sku: "JQJ-AMETH-XV",
      stockCount: 5,
      inStock: true,
    });
    expect(body.product.slug).not.toBe(PAYMENT_TEST_SLUG);
  });

  it("keeps POST on checkout validation for the hidden slug", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/products/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              slug: `  ${PAYMENT_TEST_SLUG}  `,
              name: "Payment test — do not ship",
              price: 1,
              quantity: 1,
              sku: "JQJ-PAYTEST-001",
            },
            {
              slug: "amethyst-bracelet-xv",
              name: "Amethyst Bracelet XV (5mm)",
              price: 1,
              quantity: 1,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.errors).toEqual([
      'Product "Payment test — do not ship" is unavailable.',
    ]);
    expect(body.items).toEqual([
      expect.objectContaining({
        slug: "amethyst-bracelet-xv",
        availableQuantity: 5,
      }),
    ]);
    expect(JSON.stringify(body.items)).not.toContain(PAYMENT_TEST_SLUG);
  });
});
