import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as webhook } from "@/app/api/webhooks/airwallex/route";
import { sendOrderEmails } from "@/lib/email";
import { PAYMENT_AFTER_EXPIRY_UNFULFILLED_EVENT } from "@/lib/payments/airwallex-orders";
import { createCheckoutDb, setActiveDb, type MemoryDb } from "../helpers/memory-db";

vi.mock("@/lib/email", () => ({
  sendOrderEmails: vi.fn(async () => undefined),
}));

const SECRET = "test_dummy_webhook_secret";
const ALERT = "[airwallex-orders] payment_after_expiry_unfulfilled";

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

function successEvent(eventId: string, intentId = "int_expired", orderId = "order-expired") {
  return {
    id: eventId,
    name: "payment_intent.succeeded",
    created_at: new Date().toISOString(),
    data: {
      object: {
        id: intentId,
        status: "SUCCEEDED",
        amount: 115,
        currency: "USD",
        merchant_order_id: orderId,
      },
    },
  };
}

function seedPayment(db: MemoryDb, orderId: string, intentId: string) {
  db.seed("payments", [
    {
      id: `pay-${orderId}`,
      order_id: orderId,
      provider: "airwallex",
      provider_payment_intent_id: intentId,
      provider_request_id: `req-${orderId}`,
      status: "requires_payment_method",
      amount: 115,
      currency: "USD",
    },
  ]);
}

function seedLine(
  db: MemoryDb,
  line: { id: string; orderId: string; productId: string; quantity: number }
) {
  db.seed("order_items", [
    {
      id: line.id,
      order_id: line.orderId,
      product_id: line.productId,
      variant_id: null,
      quantity: line.quantity,
      product_name: "Bracelet",
      price_at_purchase: 100,
    },
  ]);
}

function seedExpiredOrder(db: MemoryDb, orderId = "order-expired") {
  db.seed("orders", [
    {
      id: orderId,
      status: "failed",
      payment_provider: "airwallex",
      payment_status: "abandoned",
      fulfillment_status: "payment_failed",
      inventory_reserved: false,
      total_amount: 115,
      subtotal_amount: 100,
      shipping_amount: 15,
      currency: "USD",
      customer_email: "buyer@example.com",
      customer_name: "Ada Lovelace",
      shipping_address: { address: "1 Atelier Lane", city: "Austin" },
    },
  ]);
}

function reserves(db: MemoryDb) {
  return db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory");
}

function alertCalls(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter((call) => call[0] === ALERT);
}

describe("payment succeeds after the reservation expired", () => {
  let db: MemoryDb;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    process.env.AIRWALLEX_WEBHOOK_SECRET = SECRET;
    delete process.env.RESEND_API_KEY;
    vi.mocked(sendOrderEmails).mockClear();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("re-reserves released stock before marking an expired order paid", async () => {
    // Mutation check: deleting the re-reserve leaves this order paid with
    // inventory_reserved false and stock still at 5, and this test goes red.
    db.rowsOf("products")[0].stock_count = 5;
    seedExpiredOrder(db);
    seedLine(db, { id: "item-1", orderId: "order-expired", productId: "prod-amethyst", quantity: 1 });
    seedPayment(db, "order-expired", "int_expired");

    const response = await webhook(signedWebhook(successEvent("evt_rehold")));

    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      fulfillment_status: "paid",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(reserves(db)).toHaveLength(1);
    expect(sendOrderEmails).toHaveBeenCalledTimes(1);
    expect(alertCalls(errorSpy)).toHaveLength(0);
  });

  it("flags an expired order when the released stock cannot be re-reserved", async () => {
    db.rowsOf("products")[0].stock_count = 0;
    seedExpiredOrder(db);
    seedLine(db, { id: "item-1", orderId: "order-expired", productId: "prod-amethyst", quantity: 1 });
    seedPayment(db, "order-expired", "int_expired");

    const probe = await db.rpc("reserve_order_inventory", {
      p_order_id: "order-expired",
      order_items: [{ product_id: "prod-amethyst", variant_id: null, quantity: 1 }],
    });
    expect(probe.error).toEqual({ message: "Product stock unavailable", code: "P0001" });
    expect(probe.error instanceof Error).toBe(false);

    const response = await webhook(signedWebhook(successEvent("evt_short")));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "inventory_exception",
      payment_status: "succeeded",
      fulfillment_status: "payment_failed",
      inventory_reserved: false,
    });
    expect(db.rowsOf("orders")[0].status).not.toBe("paid");
    expect(db.rowsOf("orders")[0].fulfillment_status).not.toBe("paid");
    expect(db.rowsOf("products")[0].stock_count).toBe(0);
    expect(db.rowsOf("order_refunds")).toHaveLength(0);
    expect(db.rowsOf("payment_refunds")).toHaveLength(0);
    expect(sendOrderEmails).not.toHaveBeenCalled();
    expect(db.rowsOf("orders")[0].confirmation_email_sent_at ?? null).toBeNull();

    const alerts = alertCalls(errorSpy);
    expect(alerts).toHaveLength(1);
    expect(alerts[0][1]).toMatchObject({
      event: PAYMENT_AFTER_EXPIRY_UNFULFILLED_EVENT,
      orderId: "order-expired",
      paymentIntentId: "int_expired",
      shortfall: [
        { productId: "prod-amethyst", variantId: null, requested: 1, available: 0 },
      ],
    });
    expect(JSON.stringify(alerts[0])).not.toContain("buyer@example.com");
    expect(JSON.stringify(alerts[0])).not.toContain("Ada Lovelace");
  });

  it("reserves nothing when only one line of a multi-line order is short", async () => {
    db.rowsOf("products")[0].stock_count = 5;
    db.seed("products", [
      {
        id: "prod-jasper",
        slug: "jasper-bracelet",
        name: "Jasper Bracelet",
        price: 50,
        stock_count: 0,
        in_stock: false,
        sku: "JQJ-JAS",
      },
    ]);
    seedExpiredOrder(db);
    seedLine(db, { id: "item-a", orderId: "order-expired", productId: "prod-amethyst", quantity: 1 });
    seedLine(db, { id: "item-b", orderId: "order-expired", productId: "prod-jasper", quantity: 2 });
    seedPayment(db, "order-expired", "int_expired");

    const response = await webhook(signedWebhook(successEvent("evt_partial")));

    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "inventory_exception",
      fulfillment_status: "payment_failed",
      inventory_reserved: false,
    });
    expect(db.rowsOf("products").find((row) => row.id === "prod-amethyst")?.stock_count).toBe(5);
    expect(db.rowsOf("products").find((row) => row.id === "prod-jasper")?.stock_count).toBe(0);
    expect(reserves(db)).toHaveLength(1);
    expect(alertCalls(errorSpy)[0][1]).toMatchObject({
      shortfall: [{ productId: "prod-jasper", variantId: null, requested: 2, available: 0 }],
    });
    expect(sendOrderEmails).not.toHaveBeenCalled();
  });

  it("does not reserve or flag again when the same succeeded payment is delivered twice", async () => {
    db.rowsOf("products")[0].stock_count = 5;
    seedExpiredOrder(db);
    seedLine(db, { id: "item-1", orderId: "order-expired", productId: "prod-amethyst", quantity: 1 });
    seedPayment(db, "order-expired", "int_expired");

    const first = await webhook(signedWebhook(successEvent("evt_dup_1")));
    const second = await webhook(signedWebhook(successEvent("evt_dup_2")));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      fulfillment_status: "paid",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(reserves(db)).toHaveLength(1);
    expect(sendOrderEmails).toHaveBeenCalledTimes(1);
  });

  it("does not double-flag a second success after the stock shortfall was recorded", async () => {
    db.rowsOf("products")[0].stock_count = 0;
    seedExpiredOrder(db, "order-short");
    seedLine(db, { id: "item-s", orderId: "order-short", productId: "prod-amethyst", quantity: 1 });
    seedPayment(db, "order-short", "int_short");

    const first = await webhook(signedWebhook(successEvent("evt_flag_1", "int_short", "order-short")));
    const second = await webhook(signedWebhook(successEvent("evt_flag_2", "int_short", "order-short")));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "inventory_exception",
      fulfillment_status: "payment_failed",
      inventory_reserved: false,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(0);
    expect(reserves(db)).toHaveLength(1);
    expect(alertCalls(errorSpy)).toHaveLength(1);
    expect(sendOrderEmails).not.toHaveBeenCalled();
    expect(db.rowsOf("order_refunds")).toHaveLength(0);
  });

  it("re-reserves a released order whose payment status is failed", async () => {
    db.rowsOf("products")[0].stock_count = 5;
    seedExpiredOrder(db);
    db.rowsOf("orders")[0].payment_status = "failed";
    seedLine(db, { id: "item-1", orderId: "order-expired", productId: "prod-amethyst", quantity: 1 });
    seedPayment(db, "order-expired", "int_expired");

    const response = await webhook(signedWebhook(successEvent("evt_failed_hold")));

    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      fulfillment_status: "paid",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(reserves(db)).toHaveLength(1);
  });

  it("flags a released failed order when the stock is gone", async () => {
    db.rowsOf("products")[0].stock_count = 0;
    seedExpiredOrder(db);
    db.rowsOf("orders")[0].payment_status = "failed";
    seedLine(db, { id: "item-1", orderId: "order-expired", productId: "prod-amethyst", quantity: 1 });
    seedPayment(db, "order-expired", "int_expired");

    const response = await webhook(signedWebhook(successEvent("evt_failed_short")));

    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "inventory_exception",
      payment_status: "succeeded",
      fulfillment_status: "payment_failed",
      inventory_reserved: false,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(0);
    expect(sendOrderEmails).not.toHaveBeenCalled();
  });

  it("leaves a reservation that has not expired on the normal paid path", async () => {
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
        currency: "USD",
        customer_email: "buyer@example.com",
        customer_name: "Ada Lovelace",
      },
    ]);
    seedLine(db, { id: "item-held", orderId: "order-held", productId: "prod-amethyst", quantity: 1 });
    seedPayment(db, "order-held", "int_held");

    const response = await webhook(signedWebhook(successEvent("evt_held", "int_held", "order-held")));

    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      fulfillment_status: "paid",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(reserves(db)).toHaveLength(0);
    expect(alertCalls(errorSpy)).toHaveLength(0);
    expect(sendOrderEmails).toHaveBeenCalledTimes(1);
  });
});
