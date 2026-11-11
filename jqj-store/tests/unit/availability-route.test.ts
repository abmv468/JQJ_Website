import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/products/availability/route";
import { createCheckoutDb, dbError, setActiveDb, type MemoryDb } from "../helpers/memory-db";

const JASPER_SLUG = "red-leopard-skin-jasper-bracelet-iii";
const CATALOG_PRODUCT_ID = "red-leopard-jasper-iii";
const DRIVER_MESSAGE =
  "connection to server at 10.4.5.6 failed: password authentication failed for user service_role";

function seedJasper(db: MemoryDb) {
  db.seed("products", [
    {
      id: "prod-jasper",
      slug: JASPER_SLUG,
      name: "Red Leopard Skin Jasper Bracelet III (6mm)",
      price: 599.99,
      stock_count: 9,
      in_stock: true,
      low_stock_threshold: 5,
      sku: "JQJ-RLSJ-III",
    },
  ]);
  db.seed("product_variants", [
    {
      id: "var-s",
      product_id: "prod-jasper",
      size: "Small",
      material: "Sterling Silver",
      sku: "JQJ-RLSJ-III-S-SS",
      stock_count: 2,
    },
    {
      id: "var-m",
      product_id: "prod-jasper",
      size: "Medium",
      material: "Sterling Silver",
      sku: "JQJ-RLSJ-III-M-SS",
      stock_count: 6,
    },
    {
      id: "var-l",
      product_id: "prod-jasper",
      size: "Large",
      material: "Sterling Silver",
      sku: "JQJ-RLSJ-III-L-SS",
      stock_count: 1,
    },
  ]);
}

function getRequest(slug?: string) {
  const url = slug
    ? `http://localhost:3000/api/products/availability?slug=${encodeURIComponent(slug)}`
    : "http://localhost:3000/api/products/availability";
  return new Request(url);
}

function postRequest(body: unknown) {
  return new Request("http://localhost:3000/api/products/availability", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function failInventoryRead(db: MemoryDb) {
  db.failWhen = (table, op) =>
    table === "products" && op === "select" ? dbError(DRIVER_MESSAGE, "08001") : null;
}

function loggedText(calls: unknown[][]) {
  return calls
    .map((args) =>
      args
        .map((arg) => {
          if (typeof arg === "string") return arg;
          if (arg instanceof Error) return `${arg.message}\n${arg.stack ?? ""}`;
          return JSON.stringify(arg);
        })
        .join(" ")
    )
    .join("\n");
}

function hasStockField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasStockField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, child]) => key === "stockCount" || key === "stock_count" || hasStockField(child)
  );
}

describe("product availability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns database stock in the existing GET shape", async () => {
    const db = createCheckoutDb();
    seedJasper(db);
    setActiveDb(db);

    const response = await GET(getRequest(JASPER_SLUG));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      product: {
        id: "prod-jasper",
        slug: JASPER_SLUG,
        sku: "JQJ-RLSJ-III",
        lowStockThreshold: 5,
        inStock: true,
        stockCount: 9,
        hasVariants: true,
        variants: [
          {
            id: "var-s",
            size: "Small",
            material: "Sterling Silver",
            sku: "JQJ-RLSJ-III-S-SS",
            stockCount: 2,
            inStock: true,
          },
          {
            id: "var-m",
            size: "Medium",
            material: "Sterling Silver",
            sku: "JQJ-RLSJ-III-M-SS",
            stockCount: 6,
            inStock: true,
          },
          {
            id: "var-l",
            size: "Large",
            material: "Sterling Silver",
            sku: "JQJ-RLSJ-III-L-SS",
            stockCount: 1,
            inStock: true,
          },
        ],
      },
    });
  });

  it("returns the existing POST validation shape from database stock", async () => {
    const db = createCheckoutDb();
    seedJasper(db);
    setActiveDb(db);

    const response = await POST(
      postRequest({
        items: [
          {
            slug: JASPER_SLUG,
            name: "client name",
            price: 1,
            quantity: 1,
            size: "Small",
            material: "Sterling Silver",
          },
        ],
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      errors: [],
      items: [
        {
          slug: JASPER_SLUG,
          name: "Red Leopard Skin Jasper Bracelet III (6mm)",
          requestedQuantity: 1,
          availableQuantity: 2,
          sku: "JQJ-RLSJ-III-S-SS",
          size: "Small",
          material: "Sterling Silver",
          variantId: "var-s",
          lowStock: true,
        },
      ],
    });
  });

  it("keeps an empty cart validation successful without reading stock", async () => {
    setActiveDb(createCheckoutDb());
    const response = await POST(postRequest({ items: [] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, items: [], errors: [] });
  });

  it("returns 404 when the database has no row, including for a catalog slug", async () => {
    setActiveDb(createCheckoutDb());
    const response = await GET(getRequest(JASPER_SLUG));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: "Product not found" });
    expect(hasStockField(body)).toBe(false);
    expect(JSON.stringify(body)).not.toContain(CATALOG_PRODUCT_ID);
  });

  it("returns 400 when the slug is missing", async () => {
    setActiveDb(createCheckoutDb());
    const response = await GET(getRequest());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing slug" });
  });

  it("returns 503 with no catalog stock when the database read fails", async () => {
    const db = createCheckoutDb();
    seedJasper(db);
    failInventoryRead(db);
    setActiveDb(db);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const first = await GET(getRequest(JASPER_SLUG));
    const second = await POST(
      postRequest({
        items: [
          {
            slug: JASPER_SLUG,
            name: "Red Leopard Skin Jasper Bracelet III (6mm)",
            price: 1,
            quantity: 1,
            sku: "JQJ-RLSJ-III-S-SS",
            size: "Small",
            material: "Sterling Silver",
          },
        ],
      })
    );

    const bodies = [];
    for (const response of [first, second]) {
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = await response.json();
      expect(body).toEqual({
        error: "Availability temporarily unavailable",
        reference: expect.stringMatching(/^[a-f0-9]{8}$/),
      });
      expect(Object.keys(body).sort()).toEqual(["error", "reference"]);
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/stockCount|stock_count/);
      expect(hasStockField(body)).toBe(false);
      expect(serialized).not.toContain(DRIVER_MESSAGE);
      expect(serialized).not.toContain("password authentication");
      expect(serialized).not.toContain("10.4.5.6");
      expect(serialized).not.toContain("service_role");
      expect(serialized).not.toContain(CATALOG_PRODUCT_ID);
      expect(serialized).not.toContain("JQJ-RLSJ-III");
      bodies.push(body);
    }

    expect(bodies[0].reference).not.toBe(bodies[1].reference);

    const logged = loggedText(errorSpy.mock.calls);
    expect(logged).toContain(bodies[0].reference);
    expect(logged).toContain(bodies[1].reference);
    expect(logged).toContain("08001");
    expect(logged).not.toContain(DRIVER_MESSAGE);
    expect(logged).not.toContain("password authentication");
    expect(logged).not.toContain("10.4.5.6");
    expect(logged).not.toContain("service_role");
    for (const args of errorSpy.mock.calls) {
      for (const arg of args) {
        if (!arg || typeof arg !== "object" || arg instanceof Error) continue;
        expect(Object.keys(arg).sort()).toEqual(["code", "reference"]);
      }
    }
  });
});
