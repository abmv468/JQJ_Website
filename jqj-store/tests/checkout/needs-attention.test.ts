import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/orders/needs-attention/route";
import { createCheckoutDb, dbError, setActiveDb, type MemoryDb } from "../helpers/memory-db";

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) => {
        if (token === "shopper-token") {
          return { data: { user: { email: "shopper@example.com" } }, error: null };
        }
        if (token === "admin-token") {
          return { data: { user: { email: "admin@example.com" } }, error: null };
        }
        return { data: { user: null }, error: { message: "invalid" } };
      },
    },
  }),
}));

function request(authorization?: string) {
  return new Request("http://localhost:3000/api/admin/orders/needs-attention", {
    headers: authorization ? { authorization } : {},
  });
}

function seedOrder(
  db: MemoryDb,
  row: {
    id: string;
    status: string;
    payment_status: string;
    created_at: string;
    payment_provider?: string;
    customer_email?: string;
  }
) {
  db.seed("orders", [
    {
      id: row.id,
      status: row.status,
      payment_provider: row.payment_provider ?? "airwallex",
      payment_status: row.payment_status,
      fulfillment_status: "payment_failed",
      inventory_reserved: false,
      total_amount: 115,
      currency: "USD",
      customer_email: row.customer_email ?? "buyer@example.com",
      customer_name: "Ada Lovelace",
      created_at: row.created_at,
    },
  ]);
}

describe("GET /api/admin/orders/needs-attention", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  });

  it("returns 401 without a bearer token and 403 for a non-admin", async () => {
    const missing = await GET(request());
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: "Missing authentication token" });

    const forbidden = await GET(request("Bearer shopper-token"));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "Forbidden" });
  });

  it("returns only succeeded inventory exceptions, including a Stripe verify insert", async () => {
    seedOrder(db, {
      id: "order-airwallex",
      status: "inventory_exception",
      payment_status: "succeeded",
      created_at: "2026-11-10T10:00:00.000Z",
    });
    seedOrder(db, {
      id: "order-stripe",
      status: "inventory_exception",
      payment_status: "succeeded",
      payment_provider: "stripe",
      created_at: "2026-11-10T11:00:00.000Z",
    });
    seedOrder(db, {
      id: "order-unpaid-exception",
      status: "inventory_exception",
      payment_status: "abandoned",
      created_at: "2026-11-10T12:00:00.000Z",
    });
    seedOrder(db, {
      id: "order-paid",
      status: "paid",
      payment_status: "succeeded",
      created_at: "2026-11-10T09:00:00.000Z",
    });

    const response = await GET(request("Bearer admin-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.orders).toEqual([
      {
        id: "order-stripe",
        created_at: "2026-11-10T11:00:00.000Z",
        total: 115,
        currency: "USD",
        status: "inventory_exception",
        payment_status: "succeeded",
        fulfillment_status: "payment_failed",
      },
      {
        id: "order-airwallex",
        created_at: "2026-11-10T10:00:00.000Z",
        total: 115,
        currency: "USD",
        status: "inventory_exception",
        payment_status: "succeeded",
        fulfillment_status: "payment_failed",
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("buyer@example.com");
    expect(JSON.stringify(body)).not.toContain("Ada Lovelace");
  });

  it("returns an empty list when nothing needs attention", async () => {
    seedOrder(db, {
      id: "order-paid",
      status: "paid",
      payment_status: "succeeded",
      created_at: "2026-11-10T09:00:00.000Z",
    });

    const response = await GET(request("Bearer admin-token"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ orders: [] });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("hides database errors behind a generic body", async () => {
    db.failWhen = (table, op) =>
      table === "orders" && op === "select" ? dbError("driver-secret-xyz", "XX000") : null;

    const response = await GET(request("Bearer admin-token"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internal error" });
    expect(JSON.stringify(body)).not.toContain("driver-secret-xyz");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
