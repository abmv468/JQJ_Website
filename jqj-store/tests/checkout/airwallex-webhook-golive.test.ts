import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/airwallex/route";
import { createCheckoutDb, setActiveDb, type MemoryDb } from "../helpers/memory-db";

const SECRET = "test_dummy_webhook_secret";

const FIXTURE = {
  id: "evt_golive_fixture",
  name: "payment_intent.succeeded",
  created_at: "2026-11-10T08:00:00.000Z",
  data: {
    object: {
      id: "int_1",
      request_id: "req-1",
      status: "SUCCEEDED",
      amount: 115,
      currency: "USD",
      merchant_order_id: "order-1",
    },
  },
};

function sign(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}${rawBody}`).digest("hex");
}

function webhookRequest(rawBody: string, headers: Record<string, string>) {
  return new Request("http://localhost:3000/api/webhooks/airwallex", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

describe("Airwallex webhook go-live signature", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
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

  it("accepts a fixture signed with the route's headers and algorithm and inserts the event", async () => {
    const rawBody = JSON.stringify(FIXTURE);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = await POST(
      webhookRequest(rawBody, {
        "content-type": "application/json",
        "x-signature": sign(SECRET, timestamp, rawBody),
        "x-timestamp": timestamp,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(db.rowsOf("payment_webhook_events")).toHaveLength(1);
    expect(db.rowsOf("payment_webhook_events")[0]).toMatchObject({
      provider: "airwallex",
      provider_event_id: FIXTURE.id,
      event_name: FIXTURE.name,
      status: "processed",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a tampered body or the wrong secret with no insert", async () => {
    const rawBody = JSON.stringify(FIXTURE);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(SECRET, timestamp, rawBody);

    const tampered = await POST(
      webhookRequest(`${rawBody} `, {
        "x-signature": signature,
        "x-timestamp": timestamp,
      })
    );
    expect(tampered.status).toBe(400);

    const wrongSecret = await POST(
      webhookRequest(rawBody, {
        "x-signature": sign("wrong_test_dummy_secret", timestamp, rawBody),
        "x-timestamp": timestamp,
      })
    );
    expect(wrongSecret.status).toBe(400);

    expect(db.rowsOf("payment_webhook_events")).toHaveLength(0);
    expect(db.rowsOf("orders")[0].status).toBe("pending");
    expect(fetch).not.toHaveBeenCalled();
  });
});
