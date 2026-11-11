import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/orders/route";
import { createAirwallexRefund } from "@/lib/payments/airwallex";
import { applyAirwallexRefundEvent } from "@/lib/payments/airwallex-orders";
import { createCheckoutDb, setActiveDb, type MemoryDb } from "../helpers/memory-db";

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) => {
        if (token === "admin-token") {
          return { data: { user: { email: "admin@example.com" } }, error: null };
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
  };
});

function seedOrder(
  db: MemoryDb,
  order: { id: string; status: string; salesChannel?: string; refunded?: number }
) {
  db.seed("orders", [
    {
      id: order.id,
      status: order.status,
      sales_channel: order.salesChannel ?? "website",
      payment_provider: "airwallex",
      payment_status: "succeeded",
      fulfillment_status: order.status === "paid" ? "paid" : "pending_payment",
      inventory_reserved: false,
      total_amount: 115,
      refunded_amount: order.refunded ?? 0,
      currency: "USD",
      customer_email: "buyer@example.com",
    },
  ]);
  db.seed("payments", [
    {
      id: `pay-${order.id}`,
      order_id: order.id,
      provider: "airwallex",
      provider_payment_intent_id: `int_${order.id}`,
      status: "succeeded",
      amount: 115,
      currency: "USD",
    },
  ]);
}

async function settle(db: MemoryDb, orderId: string, refundId: string, amount: number) {
  return applyAirwallexRefundEvent(db as never, {
    eventName: "refund.settled",
    refundObject: {
      id: refundId,
      payment_intent_id: `int_${orderId}`,
      amount,
      currency: "USD",
      status: "SETTLED",
    },
  });
}

function refundRequest(id: string) {
  return new Request("http://localhost:3000/api/admin/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer admin-token",
    },
    body: JSON.stringify({
      action: "refund",
      id,
      amount: 20,
      reason: "customer return",
      confirm: true,
    }),
  });
}

describe("refunds on protected orders", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    vi.mocked(createAirwallexRefund).mockReset();
    vi.mocked(createAirwallexRefund).mockResolvedValue({
      id: "rf_route",
      status: "SETTLED",
      amount: 20,
      currency: "USD",
      payment_intent_id: "int_order-route",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network call");
      })
    );
  });

  it("keeps a cancelled order cancelled after a partial and a full refund", async () => {
    seedOrder(db, { id: "order-cancelled", status: "cancelled" });

    await settle(db, "order-cancelled", "rf_partial", 20);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "cancelled",
      fulfillment_status: "pending_payment",
      refunded_amount: 20,
    });

    await settle(db, "order-cancelled", "rf_rest", 95);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "cancelled",
      fulfillment_status: "pending_payment",
      refunded_amount: 115,
    });
  });

  it("keeps a test order from being revived by a refund", async () => {
    seedOrder(db, { id: "order-test", status: "pending", salesChannel: "test" });

    await settle(db, "order-test", "rf_test_partial", 20);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "pending",
      sales_channel: "test",
      fulfillment_status: "pending_payment",
      refunded_amount: 20,
    });

    await settle(db, "order-test", "rf_test_rest", 95);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "pending",
      fulfillment_status: "pending_payment",
      refunded_amount: 115,
    });
  });

  it("still moves a normal order to paid or refunded", async () => {
    seedOrder(db, { id: "order-live", status: "paid" });

    await settle(db, "order-live", "rf_live_partial", 20);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      fulfillment_status: "paid",
      refunded_amount: 20,
    });

    await settle(db, "order-live", "rf_live_rest", 95);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "refunded",
      fulfillment_status: "refunded",
      refunded_amount: 115,
    });
  });

  it("still applies a refund when the order is cancelled or a test order", async () => {
    seedOrder(db, { id: "order-cancelled", status: "cancelled" });
    const cancelled = await settle(db, "order-cancelled", "rf_allowed_cancelled", 20);
    expect(cancelled).toMatchObject({ applied: true, orderId: "order-cancelled" });
    expect(cancelled).not.toMatchObject({ reason: "protected_order" });
    expect(db.rowsOf("orders").find((row) => row.id === "order-cancelled")).toMatchObject({
      status: "cancelled",
      refunded_amount: 20,
    });

    seedOrder(db, { id: "order-test", status: "pending", salesChannel: "test" });
    const testOrder = await settle(db, "order-test", "rf_allowed_test", 20);
    expect(testOrder).toMatchObject({ applied: true, orderId: "order-test" });
    expect(testOrder).not.toMatchObject({ reason: "protected_order" });
    expect(db.rowsOf("orders").find((row) => row.id === "order-test")).toMatchObject({
      status: "pending",
      sales_channel: "test",
      refunded_amount: 20,
    });

    seedOrder(db, { id: "order-route", status: "pending", salesChannel: "test" });
    const response = await POST(refundRequest("order-route"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(createAirwallexRefund).toHaveBeenCalledTimes(1);
    expect(body.error).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("protected_order");
    expect(db.rowsOf("orders").find((row) => row.id === "order-route")).toMatchObject({
      status: "pending",
      sales_channel: "test",
      refunded_amount: 20,
    });
  });
});
