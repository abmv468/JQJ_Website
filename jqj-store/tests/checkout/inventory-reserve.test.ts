import { describe, expect, it } from "vitest";
import { validateCheckoutItems, reserveStockForOrder, restoreStockForOrder } from "@/lib/inventory";
import { releaseExpiredAirwallexReservations } from "@/lib/payments/airwallex-orders";
import { checkoutItem, createCheckoutDb, type MemoryDb } from "../helpers/memory-db";

function readyOrder(db: MemoryDb, id = "order-1") {
  db.seed("orders", [
    {
      id,
      status: "pending",
      payment_provider: "airwallex",
      payment_status: "requires_payment_method",
      fulfillment_status: "pending_payment",
      inventory_reserved: false,
      total_amount: 115,
      currency: "USD",
    },
  ]);
  const inventory = new Map(
    db.rowsOf("products").map((product) => [String(product.slug), product])
  );
  const validation = validateCheckoutItems([checkoutItem()], inventory as never);
  expect(validation.ok).toBe(true);
  return validation.resolved;
}

describe("inventory reserve and restore", () => {
  it("reserves stock once and does not restore it twice", async () => {
    const db = createCheckoutDb();
    const resolved = readyOrder(db);

    await reserveStockForOrder(db as never, "order-1", resolved);
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rowsOf("orders")[0].inventory_reserved).toBe(true);

    await reserveStockForOrder(db as never, "order-1", resolved);
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory")).toHaveLength(2);

    await restoreStockForOrder(db as never, "order-1", resolved);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rowsOf("orders")[0].inventory_reserved).toBe(false);

    await restoreStockForOrder(db as never, "order-1", resolved);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rowsOf("orders")[0].inventory_reserved).toBe(false);
  });

  it("reserves the matching variant and rolls the product total back on restore", async () => {
    const db = createCheckoutDb();
    db.seed("products", [
      {
        id: "prod-jasper",
        slug: "jasper-bracelet",
        name: "Jasper Bracelet",
        price: 50,
        stock_count: 6,
        in_stock: true,
        sku: "JQJ-JAS",
      },
    ]);
    db.seed("product_variants", [
      {
        id: "var-s",
        product_id: "prod-jasper",
        size: "Small",
        material: "Sterling Silver",
        sku: "SKU-S",
        stock_count: 4,
      },
      {
        id: "var-m",
        product_id: "prod-jasper",
        size: "Medium",
        material: "Sterling Silver",
        sku: "SKU-M",
        stock_count: 2,
      },
    ]);
    db.seed("orders", [
      {
        id: "order-var",
        status: "pending",
        inventory_reserved: false,
        total_amount: 50,
      },
    ]);

    const inventory = new Map(
      db.rowsOf("products").map((product) => [
        String(product.slug),
        {
          ...product,
          product_variants: db
            .rowsOf("product_variants")
            .filter((variant) => variant.product_id === product.id),
        },
      ])
    );
    const validation = validateCheckoutItems(
      [checkoutItem({ slug: "jasper-bracelet", name: "Jasper Bracelet", sku: "SKU-S" })],
      inventory as never
    );
    expect(validation.ok).toBe(true);

    await reserveStockForOrder(db as never, "order-var", validation.resolved);
    expect(db.rowsOf("product_variants").find((row) => row.id === "var-s")?.stock_count).toBe(3);
    expect(db.rowsOf("products").find((row) => row.id === "prod-jasper")?.stock_count).toBe(5);

    await restoreStockForOrder(db as never, "order-var", validation.resolved);
    await restoreStockForOrder(db as never, "order-var", validation.resolved);
    expect(db.rowsOf("product_variants").find((row) => row.id === "var-s")?.stock_count).toBe(4);
    expect(db.rowsOf("products").find((row) => row.id === "prod-jasper")?.stock_count).toBe(6);
  });

  it("releases only stale Airwallex holds and does not restore them again", async () => {
    const db = createCheckoutDb();
    db.rowsOf("products")[0].stock_count = 4;
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const fresh = new Date().toISOString();
    db.seed("orders", [
      {
        id: "stale",
        status: "pending",
        payment_provider: "airwallex",
        payment_status: "requires_payment_method",
        inventory_reserved: true,
        total_amount: 115,
        created_at: old,
      },
      {
        id: "fresh",
        status: "pending",
        payment_provider: "airwallex",
        payment_status: "pending",
        inventory_reserved: true,
        total_amount: 115,
        created_at: fresh,
      },
      {
        id: "cod",
        status: "pending",
        payment_provider: "cod",
        payment_status: "pending",
        inventory_reserved: true,
        total_amount: 135,
        created_at: old,
      },
    ]);
    db.seed("order_items", [
      {
        id: "item-stale",
        order_id: "stale",
        product_id: "prod-amethyst",
        variant_id: null,
        quantity: 1,
      },
    ]);

    await releaseExpiredAirwallexReservations(db as never);

    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rowsOf("orders").find((row) => row.id === "stale")).toMatchObject({
      inventory_reserved: false,
      payment_status: "abandoned",
      status: "failed",
    });
    expect(db.rowsOf("orders").find((row) => row.id === "fresh")?.inventory_reserved).toBe(true);
    expect(db.rowsOf("orders").find((row) => row.id === "cod")?.inventory_reserved).toBe(true);

    await releaseExpiredAirwallexReservations(db as never);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
  });

  it("does not release stock when the order is paid before the sweep update", async () => {
    const db = createCheckoutDb();
    db.rowsOf("products")[0].stock_count = 4;
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    db.seed("orders", [
      {
        id: "racing",
        status: "pending",
        payment_provider: "airwallex",
        payment_status: "requires_payment_method",
        fulfillment_status: "pending_payment",
        inventory_reserved: true,
        total_amount: 115,
        created_at: old,
      },
    ]);
    db.seed("order_items", [
      {
        id: "item-racing",
        order_id: "racing",
        product_id: "prod-amethyst",
        variant_id: null,
        quantity: 1,
      },
    ]);
    db.failWhen = (table, op) => {
      if (table === "orders" && op === "update") {
        const order = db.rowsOf("orders").find((row) => row.id === "racing");
        if (order) {
          order.payment_status = "succeeded";
          order.status = "paid";
          order.fulfillment_status = "paid";
        }
      }
      return null;
    };

    await releaseExpiredAirwallexReservations(db as never);

    expect(db.rowsOf("orders").find((row) => row.id === "racing")).toMatchObject({
      payment_status: "succeeded",
      status: "paid",
      fulfillment_status: "paid",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rpcCalls.filter((call) => call.fn === "restore_order_inventory")).toHaveLength(0);
  });
});
