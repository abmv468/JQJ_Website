import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as webhook } from "@/app/api/webhooks/airwallex/route";
import { sendOrderEmails } from "@/lib/email";
import {
  PAID_CLAIM_LOST_EVENT,
  releaseExpiredAirwallexReservations,
} from "@/lib/payments/airwallex-orders";
import { createCheckoutDb, setActiveDb, type MemoryDb } from "../helpers/memory-db";

vi.mock("@/lib/email", () => ({
  sendOrderEmails: vi.fn(async () => undefined),
}));

const SECRET = "test_dummy_webhook_secret";

function sign(timestamp: string, body: string) {
  return createHmac("sha256", SECRET).update(`${timestamp}${body}`).digest("hex");
}

function signedWebhook() {
  const raw = JSON.stringify({
    id: "evt_race",
    name: "payment_intent.succeeded",
    created_at: new Date().toISOString(),
    data: {
      object: {
        id: "int_race",
        status: "SUCCEEDED",
        amount: 115,
        currency: "USD",
        merchant_order_id: "order-race",
      },
    },
  });
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

function seedHeldOrder(db: MemoryDb) {
  db.rowsOf("products")[0].stock_count = 4;
  const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  db.seed("orders", [
    {
      id: "order-race",
      status: "pending",
      payment_provider: "airwallex",
      payment_status: "requires_payment_method",
      fulfillment_status: "pending_payment",
      inventory_reserved: true,
      total_amount: 115,
      currency: "USD",
      customer_email: "buyer@example.com",
      customer_name: "Ada Lovelace",
      created_at: old,
    },
  ]);
  db.seed("order_items", [
    {
      id: "item-race",
      order_id: "order-race",
      product_id: "prod-amethyst",
      variant_id: null,
      quantity: 1,
      product_name: "Amethyst Bracelet XV (5mm)",
      price_at_purchase: 100,
    },
  ]);
  db.seed("payments", [
    {
      id: "pay-race",
      order_id: "order-race",
      provider: "airwallex",
      provider_payment_intent_id: "int_race",
      provider_request_id: "req-race",
      status: "requires_payment_method",
      amount: 115,
      currency: "USD",
    },
  ]);
}

describe("reaper claim versus a later success", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    process.env.AIRWALLEX_WEBHOOK_SECRET = SECRET;
    delete process.env.RESEND_API_KEY;
    vi.mocked(sendOrderEmails).mockClear();
    seedHeldOrder(db);
  });

  it("does not restore stock when a success webhook pays after the reaper claim", async () => {
    const original = db.rpc.bind(db);
    let raced = false;
    db.rpc = async (fn, args) => {
      if (fn === "restore_order_inventory" && !raced) {
        raced = true;
        const response = await webhook(signedWebhook());
        expect(response.status).toBe(200);
      }
      return original(fn, args ?? {});
    };

    await releaseExpiredAirwallexReservations(db as never);

    expect(raced).toBe(true);
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      fulfillment_status: "paid",
    });
  });

  it("does not call restore when a payment row has already succeeded", async () => {
    db.rowsOf("payments")[0].status = "succeeded";

    await releaseExpiredAirwallexReservations(db as never);

    expect(db.rpcCalls.filter((call) => call.fn === "restore_order_inventory")).toHaveLength(0);
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
  });

  it("re-reserves when restore wins between the paid read and the paid write", async () => {
    db.rowsOf("orders")[0].payment_status = "abandoned";
    db.rowsOf("orders")[0].status = "failed";
    db.rowsOf("orders")[0].fulfillment_status = "payment_failed";
    let injected = false;
    db.failWhen = (table, op) => {
      if (!injected && table === "orders" && op === "update") {
        injected = true;
        db.rowsOf("orders")[0].inventory_reserved = false;
        db.rowsOf("products")[0].stock_count = Number(db.rowsOf("products")[0].stock_count) + 1;
      }
      return null;
    };

    const response = await webhook(signedWebhook());

    expect(response.status).toBe(200);
    expect(injected).toBe(true);
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      fulfillment_status: "paid",
      inventory_reserved: true,
    });
    expect(db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory")).toHaveLength(1);
  });

  it("fails the webhook when the reaper claims before the paid write, then pays on redelivery", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let injected = false;
    db.failWhen = (table, op) => {
      if (!injected && table === "orders" && op === "update") {
        injected = true;
        db.rowsOf("orders")[0].payment_status = "abandoned";
        db.rowsOf("orders")[0].status = "failed";
        db.rowsOf("orders")[0].fulfillment_status = "payment_failed";
      }
      return null;
    };

    const first = await webhook(signedWebhook());

    expect(first.status).toBeGreaterThanOrEqual(500);
    expect(injected).toBe(true);
    expect(db.rowsOf("payment_webhook_events")[0].status).not.toBe("processed");
    expect(db.rowsOf("orders")[0]).toMatchObject({
      payment_status: "abandoned",
      inventory_reserved: true,
    });
    expect(db.rowsOf("orders")[0].status).not.toBe("paid");
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(errors.mock.calls.some((call) => call[0] === "[airwallex-orders] paid_claim_lost")).toBe(true);
    const lost = errors.mock.calls.find((call) => call[0] === "[airwallex-orders] paid_claim_lost");
    expect(lost?.[1]).toEqual({ event: PAID_CLAIM_LOST_EVENT, orderId: "order-race" });

    db.failWhen = null;
    await releaseExpiredAirwallexReservations(db as never);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rowsOf("orders")[0].inventory_reserved).toBe(false);

    const retry = await webhook(signedWebhook());

    expect(retry.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      fulfillment_status: "paid",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    errors.mockRestore();
  });

  it("restores stock when the claimed order is still unpaid", async () => {
    await releaseExpiredAirwallexReservations(db as never);

    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "failed",
      payment_status: "abandoned",
      inventory_reserved: false,
    });
    expect(db.rowsOf("payments")[0].status).not.toBe("succeeded");
  });
});
