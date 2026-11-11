import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/airwallex/route";
import { createCheckoutDb, setActiveDb, type MemoryDb } from "../helpers/memory-db";

const SECRET = "test_dummy_webhook_secret";

function sign(timestamp: string, body: string) {
  return createHmac("sha256", SECRET).update(`${timestamp}${body}`).digest("hex");
}

function webhookRequest(body: string, headers: Record<string, string>) {
  return new Request("http://localhost:3000/api/webhooks/airwallex", {
    method: "POST",
    headers,
    body,
  });
}

function signed(body: unknown, timestamp = String(Math.floor(Date.now() / 1000))) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return webhookRequest(raw, {
    "content-type": "application/json",
    "x-signature": sign(timestamp, raw),
    "x-timestamp": timestamp,
  });
}

describe("POST /api/webhooks/airwallex", () => {
  let db: MemoryDb;

  afterEach(() => {
    delete process.env.AIRWALLEX_WEBHOOK_MAX_SKEW_SECONDS;
  });

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    delete process.env.AIRWALLEX_WEBHOOK_MAX_SKEW_SECONDS;
    process.env.AIRWALLEX_WEBHOOK_SECRET = SECRET;
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

  it("applies a valid payment success without calling the network", async () => {
    const response = await POST(
      signed({
        id: "evt_ok",
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
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rowsOf("payment_webhook_events")[0]).toMatchObject({
      provider_event_id: "evt_ok",
      status: "processed",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a tampered body, a bad signature, and a stale timestamp before writing", async () => {
    const body = JSON.stringify({
      id: "evt_bad",
      name: "payment_intent.succeeded",
      data: { object: { id: "int_1", status: "SUCCEEDED" } },
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const tampered = await POST(
      webhookRequest(`${body} `, {
        "x-signature": sign(timestamp, body),
        "x-timestamp": timestamp,
      })
    );
    expect(tampered.status).toBe(400);

    const mismatch = await POST(
      webhookRequest(body, { "x-signature": "deadbeef", "x-timestamp": timestamp })
    );
    expect(mismatch.status).toBe(400);

    const staleStamp = String(Math.floor(Date.now() / 1000) - 3_600);
    const stale = await POST(
      webhookRequest(body, {
        "x-signature": sign(staleStamp, body),
        "x-timestamp": staleStamp,
      })
    );
    expect(stale.status).toBe(400);

    const missing = await POST(webhookRequest(body, {}));
    expect(missing.status).toBe(400);

    expect(db.rowsOf("payment_webhook_events")).toHaveLength(0);
    expect(db.rowsOf("orders")[0].status).toBe("pending");
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
  });

  it("rejects a 301s-old timestamp when the skew setting is not numeric", async () => {
    process.env.AIRWALLEX_WEBHOOK_MAX_SKEW_SECONDS = "abc";
    const timestamp = String(Math.floor(Date.now() / 1000) - 301);
    const body = JSON.stringify({
      id: "evt_skew",
      name: "payment_intent.succeeded",
      data: { object: { id: "int_1", status: "SUCCEEDED" } },
    });

    const response = await POST(
      webhookRequest(body, {
        "x-signature": sign(timestamp, body),
        "x-timestamp": timestamp,
      })
    );

    expect(response.status).toBe(400);
    expect(db.rowsOf("payment_webhook_events")).toHaveLength(0);
  });

  it("does not change the order for a signed event whose payment intent is missing", async () => {
    const response = await POST(
      signed({
        id: "evt_invalid",
        name: "payment_intent.succeeded",
        data: { object: { status: "SUCCEEDED" } },
      })
    );
    expect(response.status).toBe(500);
    expect(db.rowsOf("orders")[0].payment_status).toBe("requires_payment_method");
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
  });

  it("ignores a duplicate event without restoring stock", async () => {
    const payload = {
      id: "evt_dup",
      name: "payment_intent.succeeded",
      created_at: new Date().toISOString(),
      data: { object: { id: "int_1", status: "SUCCEEDED", amount: 115, currency: "USD" } },
    };
    expect((await POST(signed(payload))).status).toBe(200);
    const duplicate = await POST(signed(payload));
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rowsOf("payment_webhook_events")).toHaveLength(1);
  });
});
