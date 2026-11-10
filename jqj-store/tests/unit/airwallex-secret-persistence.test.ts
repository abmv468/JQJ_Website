import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as adminGet, POST as adminPost } from "@/app/api/admin/orders/route";
import { POST as webhookPost } from "@/app/api/webhooks/airwallex/route";
import { retrieveAirwallexPaymentIntent, type AirwallexPaymentIntent } from "@/lib/payments/airwallex";
import { upsertAirwallexPaymentIntent } from "@/lib/payments/airwallex-orders";
import { createCheckoutDb, setActiveDb, type MemoryDb } from "../helpers/memory-db";

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(async () => null),
}));

vi.mock("@/lib/payments/airwallex", async () => {
  const actual = await vi.importActual<typeof import("@/lib/payments/airwallex")>(
    "@/lib/payments/airwallex"
  );
  return {
    ...actual,
    retrieveAirwallexPaymentIntent: vi.fn(),
  };
});

const SECRET = "test_dummy_webhook_secret";
const FORBIDDEN_KEYS = ["client_secret", "next_action", "customer", "return_url"];
const ADMIN_ORDER_RELATIONS_SELECT =
  "*, order_items(*), order_refunds(*), payments(provider, status, provider_payment_intent_id, payment_refunds(*))";

function sign(timestamp: string, body: string) {
  return createHmac("sha256", SECRET).update(`${timestamp}${body}`).digest("hex");
}

function keysDeep(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) keysDeep(entry, found);
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      found.push(key);
      keysDeep(nested, found);
    }
  }
  return found;
}

function spySelects(db: MemoryDb) {
  const selects: string[] = [];
  const from = db.from.bind(db);
  db.from = (table: string) => {
    const query = from(table);
    const select = query.select.bind(query);
    query.select = (columns: string, options?: { count?: string; head?: boolean }) => {
      selects.push(columns);
      return select(columns, options);
    };
    return query;
  };
  return selects;
}

function secretIntent(): AirwallexPaymentIntent {
  return {
    id: "int_secret",
    request_id: "req_secret",
    status: "REQUIRES_CUSTOMER_ACTION",
    amount: 115.5,
    currency: "USD",
    merchant_order_id: "order-1",
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:05:00.000Z",
    captured_amount: 0,
    original_amount: 115.5,
    original_currency: "USD",
    descriptor: "JQD",
    client_secret: "cs_test_secret",
    customer: {
      email: "buyer@example.com",
      client_secret: "cs_nested_customer",
    },
    next_action: {
      type: "redirect",
      url: "https://issuer.example/3ds",
      client_secret: "cs_next_action",
    },
    return_url: "https://shop.example/return",
    metadata: { client_secret: "cs_intent_metadata" },
    latest_payment_attempt: {
      id: "att_secret",
      status: "AUTHENTICATION_REDIRECTED",
      client_secret: "cs_attempt",
      payment_method: {
        id: "mtd_secret",
        type: "card",
        client_secret: "cs_method",
        card: {
          brand: "visa",
          last4: "4242",
          cvc: "123",
          number: "4242424242424242",
          client_secret: "cs_card",
        },
      },
    },
    attempts: [{ client_secret: "cs_array" }],
  };
}

describe("Airwallex secret persistence", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    process.env.AIRWALLEX_WEBHOOK_SECRET = SECRET;
    delete process.env.RESEND_API_KEY;
    vi.mocked(retrieveAirwallexPaymentIntent).mockReset();
  });

  it("persists an allowlisted payment intent and drops secrets at every depth", async () => {
    await upsertAirwallexPaymentIntent(db as never, {
      orderId: "order-1",
      requestId: "req_secret",
      intent: secretIntent(),
    });

    const write = db.writes.find((entry) => entry.op === "upsert" && entry.table === "payments");
    expect(write?.payload).toBeTruthy();
    const payload = write?.payload as Record<string, unknown>;
    const payloadKeys = keysDeep(payload);
    for (const key of FORBIDDEN_KEYS) {
      expect(payloadKeys).not.toContain(key);
    }
    expect(JSON.stringify(payload)).not.toContain("cs_");
    expect(JSON.stringify(payload)).not.toContain("4242424242424242");
    expect(payload.metadata).toEqual({
      id: "int_secret",
      request_id: "req_secret",
      status: "REQUIRES_CUSTOMER_ACTION",
      amount: 115.5,
      currency: "USD",
      merchant_order_id: "order-1",
      created_at: "2026-11-01T00:00:00.000Z",
      updated_at: "2026-11-01T00:05:00.000Z",
      captured_amount: 0,
      original_amount: 115.5,
      original_currency: "USD",
      descriptor: "JQD",
      latest_payment_attempt: {
        status: "AUTHENTICATION_REDIRECTED",
        payment_method: {
          type: "card",
          card: { brand: "visa", last4: "4242" },
        },
      },
    });
    expect(db.rowsOf("payments")[0]?.metadata).toEqual(payload.metadata);
  });

  it("stores a webhook event with client_secret removed and still verifies the raw body", async () => {
    db.seed("orders", [
      {
        id: "order-1",
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

    const body = {
      id: "evt_secret",
      name: "payment_intent.succeeded",
      created_at: "2026-11-01T00:05:00.000Z",
      data: {
        object: {
          id: "int_1",
          request_id: "req-1",
          status: "SUCCEEDED",
          amount: 115,
          currency: "USD",
          merchant_order_id: "order-1",
          client_secret: "cs_event_secret",
          customer: { email: "buyer@example.com", client_secret: "cs_event_customer" },
          next_action: {
            type: "redirect_iframe",
            url: "https://issuer.example/3ds",
            client_secret: "cs_event_action",
          },
          attempts: [{ id: "att_1", client_secret: "cs_event_array" }],
        },
        client_secret: "cs_event_data",
      },
    };
    const raw = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = await webhookPost(
      new Request("http://localhost:3000/api/webhooks/airwallex", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signature": sign(timestamp, raw),
          "x-timestamp": timestamp,
        },
        body: raw,
      })
    );

    expect(response.status).toBe(200);
    const stored = db.rowsOf("payment_webhook_events")[0]?.payload;
    expect(keysDeep(stored)).not.toContain("client_secret");
    expect(JSON.stringify(stored)).not.toContain("cs_event_");
    expect(stored).toMatchObject({
      id: "evt_secret",
      name: "payment_intent.succeeded",
      data: {
        object: {
          id: "int_1",
          status: "SUCCEEDED",
          merchant_order_id: "order-1",
          next_action: { type: "redirect_iframe", url: "https://issuer.example/3ds" },
          attempts: [{ id: "att_1" }],
        },
      },
    });
    expect(db.rowsOf("orders")[0]).toMatchObject({
      payment_status: "succeeded",
      status: "paid",
    });
  });

  it("selects explicit payment columns for the admin list and detail reads", async () => {
    const selects = spySelects(db);
    db.seed("orders", [
      {
        id: "order-1",
        status: "pending",
        payment_provider: "airwallex",
        payment_status: "requires_payment_method",
        fulfillment_status: "pending_payment",
        inventory_reserved: true,
        total_amount: 115,
        currency: "USD",
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
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue({
      id: "int_1",
      request_id: "req-1",
      status: "REQUIRES_PAYMENT_METHOD",
      amount: 115,
      currency: "USD",
      merchant_order_id: "order-1",
    });

    await adminGet(new Request("http://localhost:3000/api/admin/orders"));
    await adminPost(
      new Request("http://localhost:3000/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh_payment", id: "order-1" }),
      })
    );

    expect(selects.filter((sql) => sql === ADMIN_ORDER_RELATIONS_SELECT)).toHaveLength(2);
    for (const sql of selects) {
      expect(sql).not.toContain("payments(*");
      expect(sql).not.toContain("metadata");
    }
  });
});
