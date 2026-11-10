import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST, PUT } from "@/app/api/admin/orders/route";
import { createAirwallexRefund } from "@/lib/payments/airwallex";
import { createCheckoutDb, setActiveDb, type MemoryDb } from "../helpers/memory-db";

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) => {
        if (token === "admin-token") {
          return { data: { user: { email: "admin@example.com" } }, error: null };
        }
        if (token === "shopper-token") {
          return { data: { user: { email: "shopper@example.com" } }, error: null };
        }
        return { data: { user: null }, error: { message: "invalid" } };
      },
    },
  }),
}));

vi.mock("@/lib/payments/airwallex", async () => {
  const actual = await vi.importActual<typeof import("@/lib/payments/airwallex")>(
    "@/lib/payments/airwallex"
  );
  return {
    ...actual,
    createAirwallexRefund: vi.fn(),
    retrieveAirwallexPaymentIntent: vi.fn(),
  };
});

function put(status: string, authorization?: string) {
  return new Request("http://localhost:3000/api/admin/orders", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify({ id: "order-1", status }),
  });
}

function refund(authorization = "Bearer admin-token", amount = 20) {
  return new Request("http://localhost:3000/api/admin/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization,
    },
    body: JSON.stringify({
      action: "refund",
      id: "order-1",
      amount,
      reason: "stock short",
      confirm: true,
    }),
  });
}

function seedOrder(
  db: MemoryDb,
  row: {
    status: string;
    refunded_amount?: number;
    sales_channel?: string;
    payment_provider?: string;
  }
) {
  db.seed("orders", [
    {
      id: "order-1",
      status: row.status,
      sales_channel: row.sales_channel ?? "website",
      payment_provider: row.payment_provider ?? "airwallex",
      payment_status: "succeeded",
      fulfillment_status: "payment_failed",
      inventory_reserved: false,
      total_amount: 115,
      refunded_amount: row.refunded_amount ?? 0,
      currency: "USD",
      customer_email: "buyer@example.com",
      customer_name: "Ada Lovelace",
    },
  ]);
  db.seed("payments", [
    {
      id: "pay-1",
      order_id: "order-1",
      provider: "airwallex",
      provider_payment_intent_id: "int_1",
      provider_request_id: "req-1",
      status: "succeeded",
      amount: 115,
      currency: "USD",
    },
  ]);
}

describe("inventory_exception admin actions", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    vi.mocked(createAirwallexRefund).mockReset();
    vi.mocked(createAirwallexRefund).mockResolvedValue({
      id: "rf_test",
      status: "RECEIVED",
      amount: 20,
      currency: "USD",
      payment_intent_id: "int_1",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network call");
      })
    );
  });

  it("requires admin auth before changing an inventory_exception order", async () => {
    seedOrder(db, { status: "inventory_exception" });

    const missing = await PUT(put("paid"));
    expect(missing.status).toBe(401);

    const forbidden = await PUT(put("paid", "Bearer shopper-token"));
    expect(forbidden.status).toBe(403);
    expect(db.rowsOf("orders")[0].status).toBe("inventory_exception");
  });

  it.each(["paid", "processing", "cancelled"])(
    "moves an inventory_exception order to %s",
    async (status) => {
      seedOrder(db, { status: "inventory_exception" });

      const response = await PUT(put(status, "Bearer admin-token"));

      expect(response.status).toBe(200);
      expect(db.rowsOf("orders")[0].status).toBe(status);
      expect(db.rowsOf("orders")[0].fulfillment_status).toBe(status);
    }
  );

  it("marks an inventory_exception order refunded only after the money is fully returned", async () => {
    seedOrder(db, { status: "inventory_exception", refunded_amount: 115 });

    const response = await PUT(put("refunded", "Bearer admin-token"));

    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0].status).toBe("refunded");
  });

  it("rejects a refunded label before the refund amount is complete, and rejects unknown or skipped statuses", async () => {
    seedOrder(db, { status: "inventory_exception", refunded_amount: 10 });

    const early = await PUT(put("refunded", "Bearer admin-token"));
    expect(early.status).toBe(400);
    expect(await early.json()).toEqual({
      error: "Order can be marked refunded only when total refunded amount is complete",
    });

    const skipped = await PUT(put("packed", "Bearer admin-token"));
    expect(skipped.status).toBe(400);
    expect((await skipped.json()).error).toBe(
      "Invalid status transition from inventory_exception to packed"
    );

    const unknown = await PUT(put("not-a-status", "Bearer admin-token"));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ error: "Invalid order status" });
    expect(db.rowsOf("orders")[0].status).toBe("inventory_exception");
  });

  it("refunds a paid inventory_exception order without calling Airwallex for real", async () => {
    seedOrder(db, { status: "inventory_exception" });

    const response = await POST(refund());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.error).toBeUndefined();
    expect(createAirwallexRefund).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(body)).not.toContain("already fully refunded");
    expect(JSON.stringify(body)).not.toContain("buyer@example.com");
  });

  it("still says an order is fully refunded only when the refunded amount covers the total", async () => {
    seedOrder(db, { status: "inventory_exception", refunded_amount: 115 });

    const response = await POST(refund());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Order is already fully refunded" });
    expect(createAirwallexRefund).not.toHaveBeenCalled();
  });

  it("names an unsupported status instead of calling it fully refunded", async () => {
    seedOrder(db, { status: "failed" });

    const response = await POST(refund());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Order has unsupported status value" });
    expect(createAirwallexRefund).not.toHaveBeenCalled();
  });

  it("still refunds a cancelled order and a test order", async () => {
    seedOrder(db, { status: "cancelled" });
    const cancelled = await POST(refund());
    expect(cancelled.status).toBe(200);
    expect(createAirwallexRefund).toHaveBeenCalledTimes(1);

    db.rowsOf("orders")[0].status = "cancelled";
    db.rowsOf("orders")[0].sales_channel = "test";
    vi.mocked(createAirwallexRefund).mockClear();
    const testOrder = await POST(refund());
    expect(testOrder.status).toBe(200);
    expect(createAirwallexRefund).toHaveBeenCalledTimes(1);
  });
});
