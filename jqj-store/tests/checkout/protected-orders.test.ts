import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as adminPost } from "@/app/api/admin/orders/route";
import { POST as verify } from "@/app/api/checkout/airwallex/verify/route";
import { POST as webhook } from "@/app/api/webhooks/airwallex/route";
import { sendOrderEmails } from "@/lib/email";
import { retrieveAirwallexPaymentIntent } from "@/lib/payments/airwallex";
import { PAYMENT_ON_PROTECTED_ORDER_EVENT } from "@/lib/payments/airwallex-orders";
import { createCheckoutDb, setActiveDb, type MemoryDb } from "../helpers/memory-db";

vi.mock("@/lib/email", () => ({
  sendOrderEmails: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async () => null,
}));

vi.mock("@/lib/payments/airwallex", async () => {
  const actual = await vi.importActual<typeof import("@/lib/payments/airwallex")>(
    "@/lib/payments/airwallex"
  );
  return {
    ...actual,
    createAirwallexPaymentIntent: vi.fn(),
    retrieveAirwallexPaymentIntent: vi.fn(),
  };
});

const SECRET = "test_dummy_webhook_secret";
const HOOK = "[airwallex-orders] payment_on_protected_order";

function sign(timestamp: string, body: string) {
  return createHmac("sha256", SECRET).update(`${timestamp}${body}`).digest("hex");
}

function signedWebhook(body: unknown) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Request("http://localhost:3000/api/webhooks/airwallex", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature": sign(timestamp, raw),
      "x-timestamp": timestamp,
    },
    body: raw,
  });
}

function paymentEvent(eventId: string, orderId: string, intentId: string, status: string) {
  const name =
    status === "SUCCEEDED" ? "payment_intent.succeeded" : "payment_intent.failed";
  return {
    id: eventId,
    name,
    created_at: new Date().toISOString(),
    data: {
      object: {
        id: intentId,
        status,
        amount: 115,
        currency: "USD",
        merchant_order_id: orderId,
      },
    },
  };
}

function seedOrder(
  db: MemoryDb,
  order: { id: string; status: string; salesChannel?: string; paymentStatus?: string; reserved?: boolean }
) {
  db.seed("orders", [
    {
      id: order.id,
      status: order.status,
      sales_channel: order.salesChannel ?? "website",
      payment_provider: "airwallex",
      payment_status: order.paymentStatus ?? "requires_payment_method",
      fulfillment_status: "pending_payment",
      inventory_reserved: order.reserved ?? false,
      total_amount: 115,
      currency: "USD",
      customer_email: "buyer@example.com",
      customer_name: "Ada Lovelace",
    },
  ]);
  db.seed("order_items", [
    {
      id: `item-${order.id}`,
      order_id: order.id,
      product_id: "prod-amethyst",
      variant_id: null,
      quantity: 1,
      product_name: "Amethyst Bracelet XV (5mm)",
      price_at_purchase: 100,
    },
  ]);
  db.seed("payments", [
    {
      id: `pay-${order.id}`,
      order_id: order.id,
      provider: "airwallex",
      provider_payment_intent_id: `int_${order.id}`,
      provider_request_id: `req_${order.id}`,
      status: order.paymentStatus ?? "requires_payment_method",
      amount: 115,
      currency: "USD",
    },
  ]);
}

function stockMoves(db: MemoryDb) {
  return db.rpcCalls.filter(
    (call) => call.fn === "reserve_order_inventory" || call.fn === "restore_order_inventory"
  );
}

function orderWrites(db: MemoryDb) {
  return db.writes.filter((write) => write.table === "orders" && write.op !== "insert");
}

function hookCalls(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter((call) => call[0] === HOOK);
}

describe("protected cancelled and test orders", () => {
  let db: MemoryDb;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    db.rowsOf("products")[0].stock_count = 5;
    process.env.AIRWALLEX_WEBHOOK_SECRET = SECRET;
    delete process.env.RESEND_API_KEY;
    vi.mocked(sendOrderEmails).mockClear();
    vi.mocked(retrieveAirwallexPaymentIntent).mockReset();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("ignores a succeeded webhook for a cancelled order", async () => {
    seedOrder(db, {
      id: "order-cancelled",
      status: "cancelled",
      paymentStatus: "abandoned",
      reserved: false,
    });

    const response = await webhook(
      signedWebhook(paymentEvent("evt_ok", "order-cancelled", "int_order-cancelled", "SUCCEEDED"))
    );

    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "cancelled",
      payment_status: "abandoned",
      fulfillment_status: "pending_payment",
      inventory_reserved: false,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(stockMoves(db)).toHaveLength(0);
    expect(sendOrderEmails).not.toHaveBeenCalled();
    expect(hookCalls(errorSpy)).toHaveLength(1);
    expect(hookCalls(errorSpy)[0][1]).toMatchObject({
      event: PAYMENT_ON_PROTECTED_ORDER_EVENT,
      orderId: "order-cancelled",
      paymentIntentId: "int_order-cancelled",
      status: "succeeded",
      reason: "cancelled",
    });
    expect(JSON.stringify(hookCalls(errorSpy))).not.toContain("buyer@example.com");
  });

  it("ignores a failed webhook for a cancelled order", async () => {
    seedOrder(db, { id: "order-cancelled", status: "cancelled" });

    const response = await webhook(
      signedWebhook(paymentEvent("evt_fail", "order-cancelled", "int_order-cancelled", "FAILED"))
    );

    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "cancelled",
      payment_status: "requires_payment_method",
      fulfillment_status: "pending_payment",
    });
    expect(stockMoves(db)).toHaveLength(0);
    expect(sendOrderEmails).not.toHaveBeenCalled();
    expect(hookCalls(errorSpy)[0][1]).toMatchObject({
      status: "failed",
      reason: "cancelled",
    });
  });

  it("ignores succeeded and failed webhooks for a test order that is still pending", async () => {
    seedOrder(db, {
      id: "order-test",
      status: "pending",
      salesChannel: "test",
      reserved: true,
    });
    db.rowsOf("products")[0].stock_count = 4;

    const succeeded = await webhook(
      signedWebhook(paymentEvent("evt_test_ok", "order-test", "int_order-test", "SUCCEEDED"))
    );
    const failed = await webhook(
      signedWebhook(paymentEvent("evt_test_fail", "order-test", "int_order-test", "FAILED"))
    );

    expect(succeeded.status).toBe(200);
    expect(failed.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "pending",
      sales_channel: "test",
      payment_status: "requires_payment_method",
      fulfillment_status: "pending_payment",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(stockMoves(db)).toHaveLength(0);
    expect(sendOrderEmails).not.toHaveBeenCalled();
    expect(hookCalls(errorSpy)).toHaveLength(2);
    expect(hookCalls(errorSpy).map((call) => (call[1] as { reason: string }).reason)).toEqual([
      "test",
      "test",
    ]);
  });

  it("does not write when verify or admin sync forces a protected order", async () => {
    seedOrder(db, { id: "order-cancelled", status: "cancelled" });
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue({
      id: "int_order-cancelled",
      status: "SUCCEEDED",
      amount: 115,
      currency: "USD",
      request_id: "req_order-cancelled",
    });

    const verified = await verify(
      new Request("http://localhost:3000/api/checkout/airwallex/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: "order-cancelled", refresh: true }),
      })
    );
    const refreshed = await adminPost(
      new Request("http://localhost:3000/api/admin/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: "Bearer admin-token",
        },
        body: JSON.stringify({ action: "refresh_payment", id: "order-cancelled" }),
      })
    );

    expect(verified.status).toBe(202);
    expect(refreshed.status).toBe(200);
    expect(orderWrites(db)).toHaveLength(0);
    expect(db.writes.filter((write) => write.table === "payments")).toHaveLength(0);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "cancelled",
      payment_status: "requires_payment_method",
      fulfillment_status: "pending_payment",
    });
    expect(db.rowsOf("payments")[0].status).toBe("requires_payment_method");
    expect(stockMoves(db)).toHaveLength(0);
    expect(sendOrderEmails).not.toHaveBeenCalled();
    expect(hookCalls(errorSpy)).toHaveLength(2);
  });

  it("treats a duplicate protected webhook as a duplicate and does not log again", async () => {
    seedOrder(db, { id: "order-cancelled", status: "cancelled" });
    const event = paymentEvent("evt_dup", "order-cancelled", "int_order-cancelled", "SUCCEEDED");
    const first = await webhook(signedWebhook(event));
    const second = await webhook(signedWebhook(event));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(hookCalls(errorSpy)).toHaveLength(1);
    expect(stockMoves(db)).toHaveLength(0);
    expect(sendOrderEmails).not.toHaveBeenCalled();
    expect(db.rowsOf("orders")[0].status).toBe("cancelled");
  });

  it("still re-reserves and pays an expired order that is not protected", async () => {
    seedOrder(db, {
      id: "order-live",
      status: "failed",
      salesChannel: "website",
      paymentStatus: "abandoned",
      reserved: false,
    });

    const response = await webhook(
      signedWebhook(paymentEvent("evt_live", "order-live", "int_order-live", "SUCCEEDED"))
    );

    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      fulfillment_status: "paid",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory")).toHaveLength(1);
    expect(sendOrderEmails).toHaveBeenCalledTimes(1);
    expect(hookCalls(errorSpy)).toHaveLength(0);
  });
});
