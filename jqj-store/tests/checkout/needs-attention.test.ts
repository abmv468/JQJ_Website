import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/orders/needs-attention/route";
import {
  PAYMENT_AFTER_EXPIRY_UNFULFILLED_EVENT,
  PAYMENT_ON_PROTECTED_ORDER_EVENT,
} from "@/lib/payments/airwallex-orders";
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
    sales_channel?: string;
    customer_email?: string;
  }
) {
  db.seed("orders", [
    {
      id: row.id,
      status: row.status,
      sales_channel: row.sales_channel ?? "website",
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
    expect(body.truncated).toBe(false);
    expect(body.orders).toEqual([
      {
        id: "order-stripe",
        created_at: "2026-11-10T11:00:00.000Z",
        total: 115,
        currency: "USD",
        status: "inventory_exception",
        payment_status: "succeeded",
        fulfillment_status: "payment_failed",
        reason: PAYMENT_AFTER_EXPIRY_UNFULFILLED_EVENT,
      },
      {
        id: "order-airwallex",
        created_at: "2026-11-10T10:00:00.000Z",
        total: 115,
        currency: "USD",
        status: "inventory_exception",
        payment_status: "succeeded",
        fulfillment_status: "payment_failed",
        reason: PAYMENT_AFTER_EXPIRY_UNFULFILLED_EVENT,
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
    expect(await response.json()).toEqual({ orders: [], truncated: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("lists a cancelled order and a test order whose payment succeeded", async () => {
    seedOrder(db, {
      id: "order-cancelled",
      status: "cancelled",
      payment_status: "succeeded",
      created_at: "2026-11-10T08:00:00.000Z",
    });
    seedOrder(db, {
      id: "order-test",
      status: "pending",
      sales_channel: "test",
      payment_status: "succeeded",
      created_at: "2026-11-10T09:00:00.000Z",
    });
    seedOrder(db, {
      id: "order-cancelled-unpaid",
      status: "cancelled",
      payment_status: "requires_payment_method",
      created_at: "2026-11-10T10:00:00.000Z",
    });
    seedOrder(db, {
      id: "order-failed-paid",
      status: "failed",
      payment_status: "succeeded",
      created_at: "2026-11-10T11:00:00.000Z",
    });

    const response = await GET(request("Bearer admin-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.truncated).toBe(false);
    expect(body.orders).toEqual([
      {
        id: "order-test",
        created_at: "2026-11-10T09:00:00.000Z",
        total: 115,
        currency: "USD",
        status: "pending",
        payment_status: "succeeded",
        fulfillment_status: "payment_failed",
        reason: PAYMENT_ON_PROTECTED_ORDER_EVENT,
      },
      {
        id: "order-cancelled",
        created_at: "2026-11-10T08:00:00.000Z",
        total: 115,
        currency: "USD",
        status: "cancelled",
        payment_status: "succeeded",
        fulfillment_status: "payment_failed",
        reason: PAYMENT_ON_PROTECTED_ORDER_EVENT,
      },
    ]);
  });

  it("returns the 100 newest rows and sets truncated when more match", async () => {
    for (let index = 0; index < 101; index += 1) {
      const stamp = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
      seedOrder(db, {
        id: `order-${String(index).padStart(3, "0")}`,
        status: "inventory_exception",
        payment_status: "succeeded",
        created_at: stamp,
      });
    }

    const response = await GET(request("Bearer admin-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.truncated).toBe(true);
    expect(body.orders).toHaveLength(100);
    expect(body.orders[0].id).toBe("order-100");
    expect(body.orders[99].id).toBe("order-001");
    expect(body.orders.map((order: { id: string }) => order.id)).not.toContain("order-000");
  });

  it("hides database errors behind a generic body", async () => {
    const injected = dbError("driver-secret-xyz", "XX000");
    expect(injected).toEqual({
      message: "driver-secret-xyz",
      code: "XX000",
      details: null,
      hint: null,
    });
    expect(injected instanceof Error).toBe(false);
    db.failWhen = (table, op) => (table === "orders" && op === "select" ? injected : null);

    const response = await GET(request("Bearer admin-token"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internal error" });
    expect(JSON.stringify(body)).not.toContain("driver-secret-xyz");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
