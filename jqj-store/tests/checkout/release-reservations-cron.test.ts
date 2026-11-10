import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/release-reservations/route";
import { createCheckoutDb, setActiveDb, type MemoryDb } from "../helpers/memory-db";

const SECRET = "cron_test_secret";

function cronRequest(authorization?: string) {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("http://localhost:3000/api/cron/release-reservations", { headers });
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function seedHeldOrder(db: MemoryDb) {
  db.rowsOf("products")[0].stock_count = 4;
  db.seed("orders", [
    {
      id: "order-held",
      status: "pending",
      payment_provider: "airwallex",
      payment_status: "requires_payment_method",
      fulfillment_status: "pending_payment",
      inventory_reserved: true,
      total_amount: 115,
      created_at: hoursAgo(2),
    },
  ]);
  db.seed("order_items", [
    {
      id: "item-held",
      order_id: "order-held",
      product_id: "prod-amethyst",
      variant_id: null,
      quantity: 1,
    },
  ]);
}

describe("GET /api/cron/release-reservations", () => {
  let db: MemoryDb;
  let previousSecret: string | undefined;

  beforeEach(() => {
    previousSecret = process.env.CRON_SECRET;
    db = createCheckoutDb();
    setActiveDb(db);
    seedHeldOrder(db);
    process.env.CRON_SECRET = SECRET;
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  });

  it("returns 401 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(cronRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
  });

  it("returns 401 when CRON_SECRET is empty", async () => {
    process.env.CRON_SECRET = "";

    const response = await GET(cronRequest("Bearer "));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rpcCalls.filter((call) => call.fn === "restore_order_inventory")).toHaveLength(0);
  });

  it("returns 401 when CRON_SECRET is only whitespace", async () => {
    const secret = "   ";
    process.env.CRON_SECRET = secret;

    const response = await GET(cronRequest(`Bearer ${secret}`));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rpcCalls.filter((call) => call.fn === "restore_order_inventory")).toHaveLength(0);
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const response = await GET(cronRequest());

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(db.rowsOf("orders")[0].inventory_reserved).toBe(true);
  });

  it("returns 401 when the Authorization header does not match", async () => {
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args);
    });

    const wrong = await GET(cronRequest("Bearer nope"));
    process.env.CRON_SECRET = ` ${SECRET} `;
    const trimmed = await GET(cronRequest(`Bearer ${SECRET}`));
    spy.mockRestore();

    expect(wrong.status).toBe(401);
    expect(trimmed.status).toBe(401);
    expect(wrong.headers.get("cache-control")).toBe("no-store");
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(JSON.stringify(errors)).not.toContain(SECRET);
    expect(JSON.stringify(errors)).not.toContain(` ${SECRET} `);
  });

  it("runs the combined reaper when the raw bearer matches", async () => {
    const response = await GET(cronRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      inventory_reserved: false,
      status: "failed",
      payment_status: "abandoned",
    });
  });
});
