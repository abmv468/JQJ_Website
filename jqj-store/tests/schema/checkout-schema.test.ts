import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fetchInventoryBySlugs } from "@/lib/inventory";
import { createCheckoutDb, MemoryDb } from "../helpers/memory-db";
import { checkoutCodeCalls, loadStoreSchema, migrationsDir } from "../helpers/schema";

const CHECKOUT_WRITES = ["pending", "failed", "paid"] as const;

const REQUIRED_COLUMNS: Record<string, string[]> = {
  orders: [
    "inventory_reserved",
    "payment_status",
    "fulfillment_status",
    "payment_reference",
    "payment_provider",
    "verification_completed",
    "verification_claimed_at",
    "stripe_session_id",
    "sales_channel",
    "status",
    "customer_email",
    "customer_name",
    "shipping_address",
    "subtotal_amount",
    "shipping_amount",
    "total_amount",
    "currency",
    "paid_at",
    "confirmation_email_sent_at",
  ],
  order_items: [
    "order_id",
    "product_id",
    "variant_id",
    "product_name",
    "sku",
    "variant_size",
    "variant_material",
    "quantity",
    "price_at_purchase",
  ],
  payments: [
    "order_id",
    "provider",
    "provider_payment_intent_id",
    "provider_request_id",
    "amount",
    "currency",
    "status",
    "metadata",
  ],
  payment_webhook_events: [
    "provider",
    "provider_event_id",
    "event_name",
    "payload",
    "status",
    "order_id",
    "payment_id",
  ],
  products: ["id", "slug", "name", "price", "stock_count", "in_stock", "sku"],
  product_variants: ["id", "product_id", "size", "material", "sku", "stock_count"],
};

describe("checkout schema contract", () => {
  const schema = loadStoreSchema();

  it("defines every table and RPC the store code calls", () => {
    const calls = checkoutCodeCalls();
    for (const table of calls.tables) {
      expect(schema.tables[table], table).toBeTruthy();
    }
    for (const rpc of calls.rpcs) {
      expect(schema.functions, rpc).toContain(rpc);
    }
  });

  it("defines the columns checkout reads and writes", () => {
    for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
      expect(schema.tables[table], table).toEqual(expect.arrayContaining(columns));
    }
  });

  it("keeps the storefront products shape and rejects the 28 Oct agentic shape", () => {
    const products = schema.tables.products;
    expect(products).toEqual(expect.arrayContaining(["slug", "price", "stock_count", "in_stock"]));
    expect(products).not.toContain("price_usd");
    expect(products).not.toContain("margin_pct");

    const dropMigration = readFileSync(
      path.join(migrationsDir(), "20261021000000_remove_agentic_system_tables.sql"),
      "utf8"
    );
    expect(dropMigration).toContain("column_name = 'price_usd'");
    expect(dropMigration).toContain("drop table public.products");
  });

  it("accepts the order statuses checkout writes, which the 28 Oct check rejected", () => {
    for (const status of CHECKOUT_WRITES) {
      expect(schema.orderStatuses).toContain(status);
    }

    const brokenOn28Oct = ["paid", "packed", "shipped", "delivered", "refunded"];
    const broken = new MemoryDb({ ...schema, orderStatuses: brokenOn28Oct });
    expect(() => broken.seed("orders", [{ id: "broken", status: "pending", total_amount: 1 }])).toThrow(
      /orders_status_check/
    );
    expect(() => broken.seed("orders", [{ id: "broken", status: "failed", total_amount: 1 }])).toThrow(
      /orders_status_check/
    );
  });

  it("does not declare orders.status twice, which rolled back the old seed", () => {
    expect(schema.duplicateCreateColumns.orders ?? []).not.toContain("status");
  });

  it("drops policies before creating them so a re-run does not abort", () => {
    const events = [
      ...schema.sql.matchAll(/drop policy if exists "([^"]+)"|create policy "([^"]+)"/g),
    ];
    const droppedSinceCreate = new Set<string>();
    for (const event of events) {
      if (event[1]) {
        droppedSinceCreate.add(event[1]);
        continue;
      }
      const name = event[2];
      expect(droppedSinceCreate.has(name), name).toBe(true);
      droppedSinceCreate.delete(name);
    }
  });

  it("guards reserve and restore so a second restore is a no-op", () => {
    expect(schema.sql).toContain("if is_reserved then");
    expect(schema.sql).toContain("Inventory already reserved");
    expect(schema.sql).toContain("if not is_reserved then");
    expect(schema.sql).toContain("Inventory already restored");
    expect(schema.functions).toEqual(
      expect.arrayContaining(["reserve_order_inventory", "restore_order_inventory"])
    );
  });

  it("lets checkout read a store catalog and fail closed on the agentic catalog", async () => {
    const store = createCheckoutDb();
    const found = await fetchInventoryBySlugs(store as never, ["amethyst-bracelet-xv"]);
    expect(found.get("amethyst-bracelet-xv")?.price).toBe(100);
    expect(found.get("amethyst-bracelet-xv")?.slug).toBe("amethyst-bracelet-xv");

    const agentic = new MemoryDb({
      ...schema,
      tables: {
        ...schema.tables,
        products: ["id", "sku", "category", "status", "price_usd", "margin_pct"],
      },
    });
    agentic.seed("products", [
      {
        id: "agentic-1",
        sku: "AGENTIC-1",
        category: "bracelet",
        status: "active",
        price_usd: 10,
        margin_pct: 0.4,
      },
    ]);

    await expect(fetchInventoryBySlugs(agentic as never, ["amethyst-bracelet-xv"])).rejects.toThrow(
      /products\.slug/
    );
  });
});
