import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/orders/needs-attention/route";
import { POST as webhook } from "@/app/api/webhooks/airwallex/route";
import { PROTECTED_ORDER_ALERT_EVENT } from "@/lib/payments/airwallex-orders";
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

function seedPayment(db: MemoryDb, orderId: string, status = "succeeded") {
  db.seed("payments", [
    {
      id: `pay-${orderId}`,
      order_id: orderId,
      provider: "airwallex",
      provider_payment_intent_id: `int_${orderId}`,
      provider_request_id: `req_${orderId}`,
      status,
      amount: 115,
      currency: "USD",
    },
  ]);
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
    refunded_amount?: number;
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
      refunded_amount: row.refunded_amount ?? 0,
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
        reason: "inventory_exception",
      },
      {
        id: "order-airwallex",
        created_at: "2026-11-10T10:00:00.000Z",
        total: 115,
        currency: "USD",
        status: "inventory_exception",
        payment_status: "succeeded",
        fulfillment_status: "payment_failed",
        reason: "inventory_exception",
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

  it("lists a cancelled order and a test order from the succeeded payment row", async () => {
    seedOrder(db, {
      id: "order-cancelled",
      status: "cancelled",
      payment_status: "requires_payment_method",
      created_at: "2026-11-10T08:00:00.000Z",
    });
    seedPayment(db, "order-cancelled");
    seedOrder(db, {
      id: "order-test",
      status: "pending",
      sales_channel: " Test ",
      payment_status: "requires_payment_method",
      created_at: "2026-11-10T09:00:00.000Z",
    });
    seedPayment(db, "order-test");
    seedOrder(db, {
      id: "order-padded",
      status: "cancelled",
      payment_status: "requires_payment_method",
      created_at: "2026-11-10T12:00:00.000Z",
    });
    db.rowsOf("orders").find((row) => row.id === "order-padded")!.status = "Cancelled ";
    seedPayment(db, "order-padded");
    seedOrder(db, {
      id: "order-cancelled-unpaid",
      status: "cancelled",
      payment_status: "requires_payment_method",
      created_at: "2026-11-10T10:00:00.000Z",
    });
    seedPayment(db, "order-cancelled-unpaid", "requires_payment_method");
    seedOrder(db, {
      id: "order-failed-paid",
      status: "failed",
      payment_status: "succeeded",
      created_at: "2026-11-10T11:00:00.000Z",
    });
    seedPayment(db, "order-failed-paid");

    const response = await GET(request("Bearer admin-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.truncated).toBe(false);
    expect(body.orders).toEqual([
      {
        id: "order-padded",
        created_at: "2026-11-10T12:00:00.000Z",
        total: 115,
        currency: "USD",
        status: "Cancelled ",
        payment_status: "requires_payment_method",
        fulfillment_status: "payment_failed",
        reason: PROTECTED_ORDER_ALERT_EVENT,
      },
      {
        id: "order-test",
        created_at: "2026-11-10T09:00:00.000Z",
        total: 115,
        currency: "USD",
        status: "pending",
        payment_status: "requires_payment_method",
        fulfillment_status: "payment_failed",
        reason: PROTECTED_ORDER_ALERT_EVENT,
      },
      {
        id: "order-cancelled",
        created_at: "2026-11-10T08:00:00.000Z",
        total: 115,
        currency: "USD",
        status: "cancelled",
        payment_status: "requires_payment_method",
        fulfillment_status: "payment_failed",
        reason: PROTECTED_ORDER_ALERT_EVENT,
      },
    ]);
  });

  it("lists a protected payment until the refund covers the captured amount", async () => {
    seedOrder(db, {
      id: "order-open",
      status: "cancelled",
      payment_status: "requires_payment_method",
      refunded_amount: 0,
      created_at: "2026-11-10T08:00:00.000Z",
    });
    seedPayment(db, "order-open");
    seedOrder(db, {
      id: "order-partial",
      status: "cancelled",
      payment_status: "requires_payment_method",
      refunded_amount: 20,
      created_at: "2026-11-10T09:00:00.000Z",
    });
    seedPayment(db, "order-partial");
    seedOrder(db, {
      id: "order-full",
      status: "cancelled",
      payment_status: "requires_payment_method",
      refunded_amount: 115,
      created_at: "2026-11-10T10:00:00.000Z",
    });
    seedPayment(db, "order-full");
    seedOrder(db, {
      id: "order-null-amount",
      status: "cancelled",
      payment_status: "requires_payment_method",
      refunded_amount: 115,
      created_at: "2026-11-10T11:00:00.000Z",
    });
    seedPayment(db, "order-null-amount");
    db.rowsOf("payments").find((row) => row.order_id === "order-null-amount")!.amount = null;
    seedOrder(db, {
      id: "order-null-partial",
      status: "cancelled",
      payment_status: "requires_payment_method",
      refunded_amount: 20,
      created_at: "2026-11-10T12:00:00.000Z",
    });
    seedPayment(db, "order-null-partial");
    db.rowsOf("payments").find((row) => row.order_id === "order-null-partial")!.amount = null;

    const response = await GET(request("Bearer admin-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.orders.map((order: { id: string }) => order.id)).toEqual([
      "order-null-partial",
      "order-partial",
      "order-open",
    ]);
  });

  it("lists a cancelled order paid on the order row, and hides it after a full refund", async () => {
    seedOrder(db, {
      id: "order-paid-here",
      status: "cancelled",
      payment_status: "succeeded",
      refunded_amount: 0,
      created_at: "2026-11-10T08:00:00.000Z",
    });
    seedOrder(db, {
      id: "order-paid-refunded",
      status: "cancelled",
      payment_status: "succeeded",
      refunded_amount: 115,
      created_at: "2026-11-10T09:00:00.000Z",
    });
    seedOrder(db, {
      id: "order-paid-padded",
      status: "cancelled",
      payment_status: "Succeeded ",
      refunded_amount: 0,
      created_at: "2026-11-10T10:00:00.000Z",
    });

    const response = await GET(request("Bearer admin-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.truncated).toBe(false);
    expect(body.orders.map((order: { id: string }) => order.id)).toEqual([
      "order-paid-padded",
      "order-paid-here",
    ]);
    expect(body.orders.every((order: { reason: string }) => order.reason === PROTECTED_ORDER_ALERT_EVENT)).toBe(
      true
    );
  });

  it("sets truncated when more than 100 protected payments match", async () => {
    for (let index = 0; index < 101; index += 1) {
      const id = `order-${String(index).padStart(3, "0")}`;
      const stamp = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
      seedOrder(db, {
        id,
        status: "cancelled",
        payment_status: "requires_payment_method",
        created_at: stamp,
      });
      seedPayment(db, id);
    }

    const response = await GET(request("Bearer admin-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.truncated).toBe(true);
    expect(body.orders).toHaveLength(100);
    expect(body.orders[0].id).toBe("order-100");
    expect(body.orders.map((order: { id: string }) => order.id)).not.toContain("order-000");
  });

  it("does not let ordinary succeeded payments crowd a protected order out of the page", async () => {
    seedOrder(db, {
      id: "order-closed",
      status: "cancelled",
      payment_status: "requires_payment_method",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    seedPayment(db, "order-closed");
    for (let index = 0; index < 101; index += 1) {
      const id = `order-paid-${String(index).padStart(3, "0")}`;
      seedOrder(db, {
        id,
        status: "paid",
        payment_status: "succeeded",
        created_at: new Date(Date.UTC(2026, 5, 1, 0, 0, index)).toISOString(),
      });
      seedPayment(db, id);
    }
    db.rowsOf("orders").find((row) => row.id === "order-paid-000")!.status = "precancelled";

    const response = await GET(request("Bearer admin-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.truncated).toBe(false);
    expect(body.orders.map((order: { id: string }) => order.id)).toEqual(["order-closed"]);
  });

  it("lists an inventory exception until the refund covers the order total", async () => {
    seedOrder(db, {
      id: "order-open",
      status: "inventory_exception",
      payment_status: "succeeded",
      refunded_amount: 0,
      created_at: "2026-11-10T08:00:00.000Z",
    });
    seedOrder(db, {
      id: "order-partial",
      status: "inventory_exception",
      payment_status: "succeeded",
      refunded_amount: 20,
      created_at: "2026-11-10T09:00:00.000Z",
    });
    seedOrder(db, {
      id: "order-full",
      status: "inventory_exception",
      payment_status: "succeeded",
      refunded_amount: 115,
      created_at: "2026-11-10T10:00:00.000Z",
    });
    seedOrder(db, {
      id: "order-over",
      status: "inventory_exception",
      payment_status: "succeeded",
      created_at: "2026-11-10T11:00:00.000Z",
    });
    db.rowsOf("orders").find((row) => row.id === "order-over")!.refunded_amount = 200;

    const response = await GET(request("Bearer admin-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.truncated).toBe(false);
    expect(body.orders.map((order: { id: string; reason: string }) => ({
      id: order.id,
      reason: order.reason,
    }))).toEqual([
      { id: "order-partial", reason: "inventory_exception" },
      { id: "order-open", reason: "inventory_exception" },
    ]);
  });

  it("omits a fully refunded test order from the order row and from the payment row", async () => {
    seedOrder(db, {
      id: "order-test-open",
      status: "pending",
      sales_channel: "test",
      payment_status: "succeeded",
      refunded_amount: 20,
      created_at: "2026-11-10T08:00:00.000Z",
    });
    seedOrder(db, {
      id: "order-test-order",
      status: "pending",
      sales_channel: "test",
      payment_status: "succeeded",
      refunded_amount: 115,
      created_at: "2026-11-10T09:00:00.000Z",
    });
    seedOrder(db, {
      id: "order-test-payment",
      status: "pending",
      sales_channel: "test",
      payment_status: "requires_payment_method",
      refunded_amount: 115,
      created_at: "2026-11-10T10:00:00.000Z",
    });
    seedPayment(db, "order-test-payment");

    const response = await GET(request("Bearer admin-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.orders.map((order: { id: string }) => order.id)).toEqual(["order-test-open"]);
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

  it("applies the 100-row limit after merging a protected payment with inventory exceptions", async () => {
    seedOrder(db, {
      id: "order-protected",
      status: "cancelled",
      payment_status: "requires_payment_method",
      created_at: "2026-11-10T12:00:00.000Z",
    });
    seedPayment(db, "order-protected");
    for (let index = 0; index < 100; index += 1) {
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
    expect(body.orders[0].id).toBe("order-protected");
    expect(body.orders[0].reason).toBe(PROTECTED_ORDER_ALERT_EVENT);
    expect(body.orders.map((order: { id: string }) => order.id)).not.toContain("order-000");
  });

  it("lists a cancelled order after the success webhook records the payment", async () => {
    process.env.AIRWALLEX_WEBHOOK_SECRET = "test_dummy_webhook_secret";
    db.rowsOf("products")[0].stock_count = 5;
    seedOrder(db, {
      id: "order-closed",
      status: "cancelled",
      payment_status: "requires_payment_method",
      created_at: "2026-11-10T08:00:00.000Z",
    });
    db.seed("payments", [
      {
        id: "pay-closed",
        order_id: "order-closed",
        provider: "airwallex",
        provider_payment_intent_id: "int_order-closed",
        provider_request_id: "req-closed",
        status: "requires_payment_method",
        amount: 115,
        currency: "USD",
      },
    ]);
    const raw = JSON.stringify({
      id: "evt_closed",
      name: "payment_intent.succeeded",
      created_at: "2026-11-10T12:00:00.000Z",
      data: {
        object: {
          id: "int_order-closed",
          status: "SUCCEEDED",
          amount: 115,
          currency: "USD",
          merchant_order_id: "order-closed",
        },
      },
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", "test_dummy_webhook_secret")
      .update(`${timestamp}${raw}`)
      .digest("hex");

    const posted = await webhook(
      new Request("http://localhost:3000/api/webhooks/airwallex", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signature": signature,
          "x-timestamp": timestamp,
        },
        body: raw,
      })
    );
    const listed = await GET(request("Bearer admin-token"));
    const body = await listed.json();

    expect(posted.status).toBe(200);
    expect(db.rowsOf("orders")[0].status).toBe("cancelled");
    expect(db.rowsOf("orders")[0].payment_status).toBe("requires_payment_method");
    expect(db.rowsOf("payments")[0]).toMatchObject({ status: "succeeded", amount: 115 });
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(body.orders).toEqual([
      {
        id: "order-closed",
        created_at: "2026-11-10T08:00:00.000Z",
        total: 115,
        currency: "USD",
        status: "cancelled",
        payment_status: "requires_payment_method",
        fulfillment_status: "payment_failed",
        reason: PROTECTED_ORDER_ALERT_EVENT,
      },
    ]);
  });

  it("hides a payments query failure behind a generic body", async () => {
    const injected = dbError("payments-secret-xyz", "XX000");
    db.failWhen = (table, op) => (table === "payments" && op === "select" ? injected : null);

    const response = await GET(request("Bearer admin-token"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internal error" });
    expect(JSON.stringify(body)).not.toContain("payments-secret-xyz");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("hides an orders query failure behind a generic body", async () => {
    const injected = dbError("orders-secret-xyz", "XX000");
    expect(injected instanceof Error).toBe(false);
    db.failWhen = (table, op) => (table === "orders" && op === "select" ? injected : null);

    const response = await GET(request("Bearer admin-token"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internal error" });
    expect(JSON.stringify(body)).not.toContain("orders-secret-xyz");
    expect(response.headers.get("cache-control")).toBe("no-store");
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
