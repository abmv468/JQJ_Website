import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as adminGet, POST as adminPost } from "@/app/api/admin/orders/route";
import { POST as checkoutPost } from "@/app/api/checkout/airwallex/route";
import { POST as verifyPost } from "@/app/api/checkout/airwallex/verify/route";
import { POST as webhookPost } from "@/app/api/webhooks/airwallex/route";
import {
  createAirwallexPaymentIntent,
  retrieveAirwallexPaymentIntent,
  type AirwallexPaymentIntent,
} from "@/lib/payments/airwallex";
import {
  toPersistedIntent,
  toPersistedRefund,
  upsertAirwallexPaymentIntent,
} from "@/lib/payments/airwallex-orders";
import {
  checkoutCustomer,
  checkoutItem,
  createCheckoutDb,
  setActiveDb,
  type MemoryDb,
} from "../helpers/memory-db";

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(async () => null),
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

const CHECKOUT_KEY = "11111111-1111-4111-8111-111111111111";

const CLIENT_SECRET_VARIANTS = [
  "client_secret",
  "clientSecret",
  "client-secret",
  "CLIENT_SECRET",
] as const;

type PaymentOp = "insert" | "upsert" | "update";
type WatchedTable = "payments" | "payment_refunds";

interface RecordedPaymentWrite {
  table: WatchedTable;
  op: PaymentOp;
  payload: unknown;
}

function isClientSecretKey(key: string) {
  return key.replace(/[_-]/g, "").toLowerCase() === "clientsecret";
}

function recordPaymentWrites(db: MemoryDb) {
  const recorded: RecordedPaymentWrite[] = [];
  const from = db.from.bind(db);
  db.from = (table: string) => {
    const query = from(table);
    if (table !== "payments" && table !== "payment_refunds") return query;
    const watched = table;

    const insert = query.insert.bind(query);
    query.insert = (payload) => {
      recorded.push({ table: watched, op: "insert", payload });
      return insert(payload);
    };
    const update = query.update.bind(query);
    query.update = (payload) => {
      recorded.push({ table: watched, op: "update", payload });
      return update(payload);
    };
    const upsert = query.upsert.bind(query);
    query.upsert = (payload, options) => {
      recorded.push({ table: watched, op: "upsert", payload });
      return upsert(payload, options);
    };
    return query;
  };
  return recorded;
}

function assertNoClientSecret(payload: unknown) {
  expect(keysDeep(payload).filter(isClientSecretKey)).toEqual([]);
}

function secretIntent(overrides: Partial<AirwallexPaymentIntent> = {}): AirwallexPaymentIntent {
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
    ...overrides,
  };
}

function checkoutRequest() {
  return new Request("http://localhost:3000/api/checkout/airwallex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [checkoutItem()],
      customer: checkoutCustomer,
      currency: "USD",
      idempotencyKey: CHECKOUT_KEY,
    }),
  });
}

function verifyRequest(orderId: string, paymentIntentId: string) {
  return new Request("http://localhost:3000/api/checkout/airwallex/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, paymentIntentId, refresh: true }),
  });
}

function refreshRequest(orderId: string) {
  return new Request("http://localhost:3000/api/admin/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "refresh_payment", id: orderId }),
  });
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

function seedOpenOrder(db: MemoryDb, orderId: string, intentId: string | null) {
  db.seed("orders", [
    {
      id: orderId,
      status: "pending",
      payment_provider: "airwallex",
      payment_status: "requires_payment_method",
      fulfillment_status: "pending_payment",
      inventory_reserved: false,
      total_amount: 115,
      currency: "USD",
      customer_email: "buyer@example.com",
      customer_name: "Ada Lovelace",
    },
  ]);
  if (!intentId) return;
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

function upsertsSince(recorded: RecordedPaymentWrite[], start: number) {
  return recorded.slice(start).filter((write) => write.op === "upsert");
}

describe("Airwallex secret persistence", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    process.env.AIRWALLEX_WEBHOOK_SECRET = SECRET;
    delete process.env.RESEND_API_KEY;
    vi.mocked(createAirwallexPaymentIntent).mockReset();
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

  it("checkout writes the intent only through the allowlist", async () => {
    const recorded = recordPaymentWrites(db);
    const created = await runCheckout(secretIntent({ id: "int_checkout", status: "REQUIRES_PAYMENT_METHOD" }));

    const [upsert] = upsertsSince(recorded, 0);
    expect(upsert).toBeTruthy();
    expect((upsert.payload as { metadata: unknown }).metadata).toEqual(toPersistedIntent(created));
    for (const write of recorded) assertNoClientSecret(write.payload);
  });

  it("verify writes the intent only through the allowlist", async () => {
    const recorded = recordPaymentWrites(db);
    const intent = secretIntent({
      id: "int_verify",
      status: "REQUIRES_CUSTOMER_ACTION",
      merchant_order_id: "order-verify",
    });
    seedOpenOrder(db, "order-verify", intent.id);
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue(intent);

    const response = await verifyPost(verifyRequest("order-verify", intent.id));
    expect(response.status).toBe(202);

    const [upsert] = upsertsSince(recorded, 0);
    expect(upsert).toBeTruthy();
    expect((upsert.payload as { metadata: unknown }).metadata).toEqual(toPersistedIntent(intent));
    for (const write of recorded) assertNoClientSecret(write.payload);
  });

  it("admin refresh writes the intent only through the allowlist", async () => {
    const recorded = recordPaymentWrites(db);
    const intent = secretIntent({
      id: "int_refresh",
      status: "PENDING",
      merchant_order_id: "order-refresh",
    });
    seedOpenOrder(db, "order-refresh", intent.id);
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue(intent);

    await adminPost(refreshRequest("order-refresh"));

    const [upsert] = upsertsSince(recorded, 0);
    expect(upsert).toBeTruthy();
    expect((upsert.payload as { metadata: unknown }).metadata).toEqual(toPersistedIntent(intent));
    for (const write of recorded) assertNoClientSecret(write.payload);
  });

  it("webhook spread writes the intent only through the allowlist", async () => {
    const recorded = recordPaymentWrites(db);
    seedOpenOrder(db, "order-wh", null);
    const { event, spreadIntent } = webhookEvent("order-wh", "int_wh");

    const response = await webhookPost(signedWebhook(event));
    expect(response.status).toBe(200);

    const [upsert] = upsertsSince(recorded, 0);
    expect(upsert).toBeTruthy();
    expect((upsert.payload as { metadata: unknown }).metadata).toEqual(toPersistedIntent(spreadIntent));
    for (const write of recorded) assertNoClientSecret(write.payload);
    assertNoClientSecret(db.rowsOf("payment_webhook_events")[0]?.payload);
    expect(JSON.stringify(db.rowsOf("payment_webhook_events")[0]?.payload)).not.toContain("cs_wh_");
  });

  it("drops client_secret from every payments write across checkout, verify, admin refresh, and the webhook", async () => {
    const recorded = recordPaymentWrites(db);
    const created = await runCheckout(
      secretIntent({ id: "int_all", status: "REQUIRES_PAYMENT_METHOD", client_secret: "cs_checkout" })
    );
    const checkoutUpserts = upsertsSince(recorded, 0);
    expect(checkoutUpserts).toHaveLength(1);
    expect((checkoutUpserts[0].payload as { metadata: unknown }).metadata).toEqual(
      toPersistedIntent(created)
    );

    const verifyIntent = secretIntent({
      id: "int_all",
      status: "REQUIRES_CUSTOMER_ACTION",
      merchant_order_id: created.merchant_order_id,
      client_secret: "cs_verify",
      customer: { client_secret: "cs_verify_nested" },
    });
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue(verifyIntent);
    const afterCheckout = recorded.length;
    const verified = await verifyPost(verifyRequest(String(created.merchant_order_id), "int_all"));
    expect(verified.status).toBe(202);
    const verifyUpserts = upsertsSince(recorded, afterCheckout);
    expect(verifyUpserts).toHaveLength(1);
    expect((verifyUpserts[0].payload as { metadata: unknown }).metadata).toEqual(
      toPersistedIntent(verifyIntent)
    );

    const refreshIntent = secretIntent({
      id: "int_all",
      status: "PENDING",
      merchant_order_id: created.merchant_order_id,
      client_secret: "cs_refresh",
      next_action: { type: "redirect", client_secret: "cs_refresh_nested" },
    });
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue(refreshIntent);
    const afterVerify = recorded.length;
    await adminPost(refreshRequest(String(created.merchant_order_id)));
    const refreshUpserts = upsertsSince(recorded, afterVerify);
    expect(refreshUpserts).toHaveLength(1);
    expect((refreshUpserts[0].payload as { metadata: unknown }).metadata).toEqual(
      toPersistedIntent(refreshIntent)
    );

    seedOpenOrder(db, "order-spread", null);
    const { event, spreadIntent } = webhookEvent("order-spread", "int_spread");
    const afterRefresh = recorded.length;
    const delivered = await webhookPost(signedWebhook(event));
    expect(delivered.status).toBe(200);
    const webhookUpserts = upsertsSince(recorded, afterRefresh);
    expect(webhookUpserts).toHaveLength(1);
    expect((webhookUpserts[0].payload as { metadata: unknown }).metadata).toEqual(
      toPersistedIntent(spreadIntent)
    );

    const refund = refundObject("int_all", "ref_all");
    const afterWebhook = recorded.length;
    const refunded = await webhookPost(
      signedWebhook({
        id: "evt_refund_all",
        name: "refund.received",
        created_at: "2026-11-01T00:08:00.000Z",
        data: {
          object: refund,
          clientSecret: "cs_refund_data",
          nested: [{ "client-secret": "cs_refund_array" }],
        },
      })
    );
    expect(refunded.status).toBe(200);
    const refundUpserts = recorded
      .slice(afterWebhook)
      .filter((write) => write.table === "payment_refunds" && write.op === "upsert");
    expect(refundUpserts).toHaveLength(1);
    expect((refundUpserts[0].payload as { metadata: unknown }).metadata).toEqual(
      toPersistedRefund(refund)
    );

    expect(recorded.length).toBeGreaterThan(4);
    for (const write of recorded) assertNoClientSecret(write.payload);
    const storedEvents = db.rowsOf("payment_webhook_events");
    expect(storedEvents.length).toBeGreaterThan(0);
    for (const row of storedEvents) assertNoClientSecret(row.payload);
  });

  it.each(CLIENT_SECRET_VARIANTS)(
    "strips %s from the stored webhook payload at any depth",
    async (secretKey) => {
      seedOpenOrder(db, "order-variant", "int_variant");
      const secretValue = `cs_variant_${secretKey}`;
      const response = await webhookPost(
        signedWebhook({
          id: `evt_${secretKey}`,
          name: "payment_intent.pending",
          created_at: "2026-11-01T00:05:00.000Z",
          data: {
            [secretKey]: secretValue,
            object: {
              id: "int_variant",
              status: "PENDING",
              amount: 115,
              currency: "USD",
              merchant_order_id: "order-variant",
              [secretKey]: `${secretValue}_object`,
              nested: { [secretKey]: `${secretValue}_nested` },
              attempts: [{ id: "att", [secretKey]: `${secretValue}_array` }],
            },
          },
        })
      );

      expect(response.status).toBe(200);
      const stored = db.rowsOf("payment_webhook_events")[0]?.payload;
      assertNoClientSecret(stored);
      expect(JSON.stringify(stored)).not.toContain(secretValue);
      expect(stored).toMatchObject({
        id: `evt_${secretKey}`,
        data: {
          object: {
            id: "int_variant",
            status: "PENDING",
            merchant_order_id: "order-variant",
            nested: {},
            attempts: [{ id: "att" }],
          },
        },
      });
    }
  );

  it("refund metadata keeps only the allowlisted refund fields", async () => {
    const recorded = recordPaymentWrites(db);
    seedOpenOrder(db, "order-refund", "int_refund");
    const refund = refundObject("int_refund", "ref_1");

    const response = await webhookPost(
      signedWebhook({
        id: "evt_refund",
        name: "refund.received",
        created_at: "2026-11-01T00:07:00.000Z",
        data: {
          object: refund,
          clientSecret: "cs_refund_data",
          attempts: [{ CLIENT_SECRET: "cs_refund_array" }],
        },
      })
    );
    expect(response.status).toBe(200);

    const refundUpserts = recorded.filter(
      (write) => write.table === "payment_refunds" && write.op === "upsert"
    );
    expect(refundUpserts).toHaveLength(1);
    expect((refundUpserts[0].payload as { metadata: unknown }).metadata).toEqual(
      toPersistedRefund(refund)
    );
    for (const write of recorded) assertNoClientSecret(write.payload);
    assertNoClientSecret(db.rowsOf("payment_webhook_events")[0]?.payload);
    expect(JSON.stringify(db.rowsOf("payment_refunds")[0]?.metadata)).not.toContain("cs_refund");
  });
});

async function runCheckout(intent: AirwallexPaymentIntent) {
  let created: AirwallexPaymentIntent = intent;
  vi.mocked(createAirwallexPaymentIntent).mockImplementation(async (input) => {
    created = {
      ...intent,
      request_id: input.requestId,
      amount: input.amount,
      currency: input.currency,
      merchant_order_id: input.merchantOrderId,
    };
    return created;
  });
  const response = await checkoutPost(checkoutRequest());
  expect(response.status).toBe(200);
  return created;
}

function refundObject(paymentIntentId: string, refundId: string): Record<string, unknown> {
  return {
    id: refundId,
    request_id: `req_${refundId}`,
    payment_intent_id: paymentIntentId,
    amount: 10,
    currency: "USD",
    status: "RECEIVED",
    reason: "customer request",
    created_at: "2026-11-01T00:06:00.000Z",
    updated_at: "2026-11-01T00:07:00.000Z",
    client_secret: "cs_refund",
    clientSecret: "cs_refund_camel",
    "client-secret": "cs_refund_kebab",
    CLIENT_SECRET: "cs_refund_upper",
    customer: { client_secret: "cs_refund_nested" },
  };
}

function webhookEvent(orderId: string, intentId: string) {
  const createdAt = "2026-11-01T00:05:00.000Z";
  const object = {
    id: intentId,
    request_id: `req_${intentId}`,
    status: "PENDING",
    amount: 115,
    currency: "USD",
    merchant_order_id: orderId,
    client_secret: "cs_wh_top",
    customer: { email: "buyer@example.com", client_secret: "cs_wh_customer" },
    next_action: {
      type: "redirect_iframe",
      url: "https://issuer.example/3ds",
      client_secret: "cs_wh_action",
    },
    return_url: "https://shop.example/return",
    latest_payment_attempt: {
      status: "AUTHENTICATION_REDIRECTED",
      client_secret: "cs_wh_attempt",
      payment_method: {
        type: "card",
        client_secret: "cs_wh_method",
        card: { brand: "visa", last4: "4242", client_secret: "cs_wh_card" },
      },
    },
    attempts: [{ id: "att_wh", client_secret: "cs_wh_array" }],
  };
  const event = {
    id: `evt_${intentId}`,
    name: "payment_intent.pending",
    created_at: createdAt,
    data: {
      object,
      client_secret: "cs_wh_data",
    },
  };
  const spreadIntent: AirwallexPaymentIntent = {
    ...object,
    updated_at: createdAt,
  };
  return { event, spreadIntent };
}
