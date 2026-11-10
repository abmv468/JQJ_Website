import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/airwallex/route";
import { applyAirwallexPaymentIntentStatus } from "@/lib/payments/airwallex-orders";
import { createCheckoutDb, dbError, setActiveDb, type MemoryDb } from "../helpers/memory-db";

vi.mock("@/lib/payments/airwallex-orders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/payments/airwallex-orders")>(
    "@/lib/payments/airwallex-orders"
  );
  return {
    ...actual,
    applyAirwallexPaymentIntentStatus: vi.fn(actual.applyAirwallexPaymentIntentStatus),
  };
});

const SECRET = "test_dummy_webhook_secret";

function sign(timestamp: string, body: string) {
  return createHmac("sha256", SECRET).update(`${timestamp}${body}`).digest("hex");
}

function signed(body: unknown, timestamp = String(Math.floor(Date.now() / 1000))) {
  const raw = JSON.stringify(body);
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

function successEvent(id = "evt_ok") {
  return {
    id,
    name: "payment_intent.succeeded",
    created_at: new Date().toISOString(),
    data: {
      object: {
        id: "int_1",
        status: "SUCCEEDED",
        amount: 115,
        currency: "USD",
        merchant_order_id: "order-1",
      },
    },
  };
}

describe("Airwallex webhook order_not_claimed", () => {
  let db: MemoryDb;

  beforeEach(async () => {
    db = createCheckoutDb();
    setActiveDb(db);
    process.env.AIRWALLEX_WEBHOOK_SECRET = SECRET;
    delete process.env.RESEND_API_KEY;
    const actual = await vi.importActual<typeof import("@/lib/payments/airwallex-orders")>(
      "@/lib/payments/airwallex-orders"
    );
    vi.mocked(applyAirwallexPaymentIntentStatus).mockReset();
    vi.mocked(applyAirwallexPaymentIntentStatus).mockImplementation(
      actual.applyAirwallexPaymentIntentStatus
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network call");
      })
    );
    db.rowsOf("products")[0].stock_count = 4;
    db.seed("orders", [
      {
        id: "order-1",
        status: "pending",
        payment_provider: "airwallex",
        payment_status: "requires_payment_method",
        fulfillment_status: "pending_payment",
        inventory_reserved: true,
        total_amount: 115,
        subtotal_amount: 100,
        shipping_amount: 15,
        currency: "USD",
        customer_email: "buyer@example.com",
        customer_name: "Ada Lovelace",
        shipping_address: {
          address: "1 Atelier Lane",
          city: "Austin",
          region: "TX",
          country: "United States",
        },
      },
    ]);
    db.seed("order_items", [
      {
        id: "item-1",
        order_id: "order-1",
        product_id: "prod-amethyst",
        variant_id: null,
        quantity: 1,
        product_name: "Amethyst Bracelet XV (5mm)",
        price_at_purchase: 100,
      },
    ]);
    db.seed("payments", [
      {
        id: "pay-1",
        order_id: "order-1",
        provider: "airwallex",
        provider_payment_intent_id: "int_1",
        provider_request_id: "req-1",
        status: "requires_payment_method",
        amount: 115,
        currency: "USD",
      },
    ]);
  });

  it("logs order_not_claimed with the order id and marks the webhook failed", async () => {
    vi.mocked(applyAirwallexPaymentIntentStatus).mockResolvedValue({
      applied: false,
      reason: "order_not_claimed",
      orderId: "order-1",
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(signed(successEvent("evt_stuck")));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, failed: true });
    expect(errorSpy).toHaveBeenCalledWith("[airwallex-webhook] order_not_claimed", {
      orderId: "order-1",
      merchantOrderId: "order-1",
      paymentIntentId: "int_1",
    });
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).toContain("order-1");
    expect(logged).not.toContain("buyer@example.com");
    expect(db.rowsOf("payment_webhook_events")[0]).toMatchObject({
      provider_event_id: "evt_stuck",
      status: "failed",
      processing_error: "order_not_claimed",
      order_id: "order-1",
    });
    expect(db.rowsOf("orders")[0]).toMatchObject({
      payment_status: "requires_payment_method",
      status: "pending",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    errorSpy.mockRestore();
  });

  it("still marks a normal success claim processed and paid", async () => {
    const response = await POST(signed(successEvent("evt_paid")));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      inventory_reserved: true,
    });
    expect(db.rowsOf("payment_webhook_events")[0]).toMatchObject({
      provider_event_id: "evt_paid",
      status: "processed",
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory")).toHaveLength(0);
    expect(db.rpcCalls.filter((call) => call.fn === "restore_order_inventory")).toHaveLength(0);
  });

  it("treats a duplicate success event as a no-op", async () => {
    const payload = successEvent("evt_dup");

    expect((await POST(signed(payload))).status).toBe(200);
    const duplicate = await POST(signed(payload));
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(db.rowsOf("orders")[0].payment_status).toBe("succeeded");
    expect(db.rowsOf("payment_webhook_events")).toHaveLength(1);
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rowsOf("orders")[0].confirmation_email_sent_at).toEqual(expect.any(String));
  });

  it("returns a generic error body when processing throws", async () => {
    const secretMessage = "boom-secret-token-xyz";
    let webhookStored = false;
    db.failWhen = (table, op) => {
      if (table === "payment_webhook_events" && op === "insert") {
        webhookStored = true;
        return null;
      }
      if (webhookStored && table === "payments") {
        return dbError(secretMessage, "XX000");
      }
      return null;
    };

    const response = await POST(signed(successEvent("evt_throw")));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internal error" });
    expect(JSON.stringify(body)).not.toContain(secretMessage);
    expect(db.rowsOf("payment_webhook_events")[0]).toMatchObject({
      provider_event_id: "evt_throw",
      status: "failed",
    });
  });

  it("DB error during claim returns 5xx", async () => {
    let webhookStored = false;
    db.failWhen = (table, op) => {
      if (table === "payment_webhook_events" && op === "insert") {
        webhookStored = true;
        return null;
      }
      if (webhookStored && table === "orders" && op === "update") {
        return dbError("could not connect to server", "08006");
      }
      return null;
    };

    const response = await POST(signed(successEvent("evt_db")));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "Internal error" });
    expect(JSON.stringify(body)).not.toContain("could not connect to server");
    expect(db.rowsOf("payment_webhook_events")[0]).toMatchObject({
      provider_event_id: "evt_db",
      status: "failed",
    });
    expect(db.rowsOf("orders")[0].payment_status).toBe("requires_payment_method");
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
  });
});
