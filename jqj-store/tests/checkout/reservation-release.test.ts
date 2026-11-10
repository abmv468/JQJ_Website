import { createHmac, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as checkout } from "@/app/api/checkout/airwallex/route";
import { GET as releaseReservations } from "@/app/api/cron/release-reservations/route";
import { POST as webhook } from "@/app/api/webhooks/airwallex/route";
import {
  checkoutCustomer,
  checkoutItem,
  createCheckoutDb,
  dbError,
  setActiveDb,
  type MemoryDb,
} from "../helpers/memory-db";

const alert = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/email", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email")>("@/lib/email");
  return {
    ...actual,
    sendInventoryExceptionAlert: alert,
  };
});

const CLIENT_KEY = "11111111-1111-4111-8111-111111111111";
const RETRY_KEY = "22222222-2222-4222-8222-222222222222";
const STUCK_KEY = "33333333-3333-4333-8333-333333333333";
const DEAD_KEY = "44444444-4444-4444-8444-444444444444";
const WEBHOOK_SECRET = "test_dummy_webhook_secret";
const CRON_SECRET = "test_dummy_cron";

interface IntentRecord {
  id: string;
  request_id: string;
  status: string;
  amount: number;
  currency: string;
  client_secret: string;
  merchant_order_id: string;
  updated_at: string;
}

const gateway = {
  failCreates: false,
  intents: new Map<string, IntentRecord>(),
  byRequest: new Map<string, string>(),
  cancels: [] as string[],
};

function resetGateway() {
  gateway.failCreates = false;
  gateway.intents.clear();
  gateway.byRequest.clear();
  gateway.cancels = [];
}

function rememberIntent(intent: IntentRecord) {
  gateway.intents.set(intent.id, intent);
  gateway.byRequest.set(intent.request_id, intent.id);
}

function installFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes("airwallex.com")) {
        throw new Error(`unexpected network call: ${url}`);
      }
      const path = new URL(url).pathname;
      if (path === "/api/v1/authentication/login") {
        return Response.json({
          token: "test_dummy",
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        });
      }
      if (path === "/api/v1/pa/payment_intents/create") {
        if (gateway.failCreates) {
          return Response.json({ message: "validation_error" }, { status: 400 });
        }
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        const requestId = String(body.request_id);
        const existing = gateway.byRequest.get(requestId);
        if (existing) return Response.json(gateway.intents.get(existing));
        const intent: IntentRecord = {
          id: `int_${gateway.intents.size + 1}`,
          request_id: requestId,
          status: "REQUIRES_PAYMENT_METHOD",
          amount: Number(body.amount),
          currency: String(body.currency),
          client_secret: "secret_test",
          merchant_order_id: String(body.merchant_order_id ?? ""),
          updated_at: new Date().toISOString(),
        };
        rememberIntent(intent);
        return Response.json(intent);
      }
      const cancel = path.match(/^\/api\/v1\/pa\/payment_intents\/([^/]+)\/cancel$/);
      if (cancel) {
        const id = decodeURIComponent(cancel[1]);
        gateway.cancels.push(id);
        const intent = gateway.intents.get(id);
        if (!intent) return Response.json({ message: "not found" }, { status: 404 });
        if (intent.status === "SUCCEEDED" || intent.status === "CANCELLED" || intent.status === "PENDING") {
          return Response.json({ message: "invalid status", code: "invalid_status" }, { status: 400 });
        }
        intent.status = "CANCELLED";
        intent.updated_at = new Date().toISOString();
        return Response.json(intent);
      }
      const read = path.match(/^\/api\/v1\/pa\/payment_intents\/([^/]+)$/);
      if (read && (!init?.method || init.method === "GET")) {
        const intent = gateway.intents.get(decodeURIComponent(read[1]));
        if (!intent) return Response.json({ message: "not found" }, { status: 404 });
        return Response.json(intent);
      }
      throw new Error(`unexpected airwallex path ${path}`);
    })
  );
}

function checkoutRequest(idempotencyKey = CLIENT_KEY) {
  return new Request("http://localhost:3000/api/checkout/airwallex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [checkoutItem({ price: 1 })],
      customer: checkoutCustomer,
      currency: "USD",
      idempotencyKey,
    }),
  });
}

function cronRequest(secret: string | null = CRON_SECRET) {
  const headers = new Headers();
  if (secret !== null) headers.set("authorization", `Bearer ${secret}`);
  return new Request("http://localhost:3000/api/cron/release-reservations", { headers });
}

function sign(timestamp: string, body: string) {
  return createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}${body}`).digest("hex");
}

function webhookRequest(
  body: { status?: string } & Record<string, unknown>,
  eventId = `evt_${randomUUID()}`
) {
  const payload = {
    id: eventId,
    name: body.status === "CANCELLED" ? "payment_intent.cancelled" : "payment_intent.succeeded",
    created_at: new Date().toISOString(),
    data: { object: body },
  };
  const raw = JSON.stringify(payload);
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

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function seedHeldOrder(
  db: MemoryDb,
  input: {
    id: string;
    status?: string;
    paymentStatus?: string;
    createdAt?: string;
    intentStatus?: string;
    stock?: number;
    requestId?: string;
  }
) {
  const requestId = input.requestId ?? `req_${input.id}`;
  if (input.stock != null) db.rowsOf("products")[0].stock_count = input.stock;
  db.seed("orders", [
    {
      id: input.id,
      status: input.status ?? "pending",
      payment_provider: "airwallex",
      payment_status: input.paymentStatus ?? "requires_payment_method",
      fulfillment_status: "pending_payment",
      inventory_reserved: true,
      total_amount: 115,
      subtotal_amount: 100,
      shipping_amount: 15,
      currency: "USD",
      customer_email: checkoutCustomer.email,
      customer_name: "Ada Lovelace",
      created_at: input.createdAt ?? new Date().toISOString(),
      shipping_address: {
        address: checkoutCustomer.address,
        city: checkoutCustomer.city,
        region: checkoutCustomer.region,
        country: checkoutCustomer.country,
      },
    },
  ]);
  db.seed("order_items", [
    {
      id: `item-${input.id}`,
      order_id: input.id,
      product_id: "prod-amethyst",
      variant_id: null,
      quantity: 1,
      product_name: "Amethyst Bracelet XV (5mm)",
      price_at_purchase: 100,
    },
  ]);
  db.seed("payments", [
    {
      id: `pay-${input.id}`,
      order_id: input.id,
      provider: "airwallex",
      provider_payment_intent_id: `int_${input.id}`,
      provider_request_id: requestId,
      status: input.paymentStatus ?? "requires_payment_method",
      amount: 115,
      currency: "USD",
    },
  ]);
  rememberIntent({
    id: `int_${input.id}`,
    request_id: requestId,
    status: input.intentStatus ?? "REQUIRES_PAYMENT_METHOD",
    amount: 115,
    currency: "USD",
    client_secret: "secret_test",
    merchant_order_id: input.id,
    updated_at: new Date().toISOString(),
  });
}

describe("Airwallex reservation release", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    resetGateway();
    installFetch();
    alert.mockClear();
    process.env.AIRWALLEX_CLIENT_ID = "test_dummy";
    process.env.AIRWALLEX_API_KEY = "test_dummy";
    process.env.AIRWALLEX_ENV = "sandbox";
    process.env.AIRWALLEX_PRODUCTION_ENABLED = "false";
    process.env.AIRWALLEX_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.CRON_SECRET = CRON_SECRET;
    delete process.env.RESEND_API_KEY;
  });

  it("pays a checkout once and ignores a duplicate success webhook", async () => {
    const response = await checkout(checkoutRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orderId).toEqual(expect.any(String));
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rowsOf("orders")[0]).toMatchObject({ inventory_reserved: true, status: "pending" });
    expect(gateway.cancels).toHaveLength(0);

    const intentId = body.intentId as string;
    const event = {
      id: intentId,
      status: "SUCCEEDED",
      amount: 115,
      currency: "USD",
      merchant_order_id: body.orderId,
    };
    expect((await webhook(webhookRequest(event, "evt_paid"))).status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);

    const duplicate = await webhook(webhookRequest(event, "evt_paid"));
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(alert).not.toHaveBeenCalled();
  });

  it("restores stock once when a reused checkout fails, then again only from a new failure event", async () => {
    seedHeldOrder(db, { id: "order-retry", stock: 4, createdAt: hoursAgo(1), requestId: RETRY_KEY });
    gateway.failCreates = true;

    const failed = await checkout(checkoutRequest(RETRY_KEY));
    expect(failed.status).toBe(500);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      id: "order-retry",
      status: "failed",
      payment_status: "failed",
      inventory_reserved: false,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rpcCalls.filter((call) => call.fn === "restore_order_inventory")).toHaveLength(1);

    gateway.failCreates = false;
    const intent = gateway.intents.get("int_order-retry");
    if (!intent) throw new Error("missing intent");
    intent.status = "CANCELLED";
    const first = await webhook(
      webhookRequest(
        { id: "int_order-retry", status: "CANCELLED", amount: 115, currency: "USD" },
        "evt_cancel_1"
      )
    );
    expect(first.status).toBe(200);
    const second = await webhook(
      webhookRequest(
        { id: "int_order-retry", status: "CANCELLED", amount: 115, currency: "USD" },
        "evt_cancel_2"
      )
    );
    expect(second.status).toBe(200);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rpcCalls.filter((call) => call.fn === "restore_order_inventory")).toHaveLength(1);
  });

  it("marks the order failed when restore throws and lets the cron release it later", async () => {
    seedHeldOrder(db, { id: "order-stuck", stock: 4, requestId: STUCK_KEY });
    const original = db.rpc.bind(db);
    let blockRestore = true;
    db.rpc = async (fn, args) => {
      if (blockRestore && fn === "restore_order_inventory") {
        return { data: null, error: dbError("Product not found while restoring inventory") };
      }
      return original(fn, args ?? {});
    };
    gateway.failCreates = true;

    const failed = await checkout(checkoutRequest(STUCK_KEY));
    expect(failed.status).toBe(500);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "failed",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);

    blockRestore = false;
    const cron = await releaseReservations(cronRequest());
    expect(cron.status).toBe(200);
    await expect(cron.json()).resolves.toMatchObject({ released: 1, errors: [] });
    expect(db.rowsOf("orders")[0]).toMatchObject({ inventory_reserved: false, status: "failed" });
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(gateway.cancels).toEqual(["int_order-stuck"]);
  });

  it("gives a failed order a fresh order and a fresh reservation", async () => {
    seedHeldOrder(db, {
      id: "order-dead",
      status: "failed",
      paymentStatus: "failed",
      stock: 4,
      intentStatus: "CANCELLED",
      requestId: DEAD_KEY,
    });
    db.rowsOf("orders")[0].inventory_reserved = false;

    const response = await checkout(checkoutRequest(DEAD_KEY));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orderId).not.toBe("order-dead");
    const fresh = db.rowsOf("orders").find((row) => row.id === body.orderId);
    expect(fresh).toMatchObject({ status: "pending", inventory_reserved: true });
    expect(db.rowsOf("orders").find((row) => row.id === "order-dead")).toMatchObject({
      status: "failed",
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(3);
    expect(
      db.rowsOf("payments").some((row) => row.order_id === body.orderId && row.provider_request_id === DEAD_KEY)
    ).toBe(false);
  });

  it("creates two fresh orders when the same failed key is retried concurrently", async () => {
    seedHeldOrder(db, {
      id: "order-dead",
      status: "failed",
      paymentStatus: "failed",
      stock: 5,
      intentStatus: "CANCELLED",
      requestId: DEAD_KEY,
    });
    db.rowsOf("orders")[0].inventory_reserved = false;

    const [first, second] = await Promise.all([
      checkout(checkoutRequest(DEAD_KEY)),
      checkout(checkoutRequest(DEAD_KEY)),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const ids = [(await first.json()).orderId, (await second.json()).orderId] as string[];
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain("order-dead");
    expect(db.rowsOf("products")[0].stock_count).toBe(3);
    expect(db.rowsOf("orders").filter((row) => row.inventory_reserved === true)).toHaveLength(2);
  });

  it("rejects a cron call when CRON_SECRET is unset or wrong", async () => {
    delete process.env.CRON_SECRET;
    const missing = await releaseReservations(cronRequest(CRON_SECRET));
    expect(missing.status).toBe(401);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    process.env.CRON_SECRET = CRON_SECRET;
    const wrong = await releaseReservations(cronRequest("nope"));
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get("cache-control")).toBe("no-store");
    expect((await releaseReservations(cronRequest(null))).status).toBe(401);
    const ok = await releaseReservations(cronRequest());
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not cache a cron failure", async () => {
    db.failWhen = () => dbError("database unavailable", "XX000");
    const response = await releaseReservations(cronRequest());
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Reservation release failed" });
  });

  it("re-reserves when a payment succeeds between the Airwallex read and the release", async () => {
    seedHeldOrder(db, { id: "order-race", createdAt: hoursAgo(2), stock: 4 });
    const original = db.rpc.bind(db);
    db.rpc = async (fn, args) => {
      if (fn === "restore_order_inventory" && args?.p_order_id === "order-race") {
        const order = db.rowsOf("orders").find((row) => row.id === "order-race");
        if (order) order.payment_status = "succeeded";
      }
      return original(fn, args ?? {});
    };

    const response = await releaseReservations(cronRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ paid: 1, released: 0, errors: [] });
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
  });

  it("releases a failed hold at any age and leaves a young pending hold", async () => {
    seedHeldOrder(db, { id: "order-failed", status: "failed", paymentStatus: "failed", stock: 3 });
    seedHeldOrder(db, { id: "order-young", createdAt: new Date().toISOString() });
    db.rowsOf("products")[0].stock_count = 3;

    const first = await releaseReservations(cronRequest());
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ released: 1, paid: 0, errors: [] });
    expect(db.rowsOf("orders").find((row) => row.id === "order-failed")).toMatchObject({
      inventory_reserved: false,
      status: "failed",
    });
    expect(db.rowsOf("payments").find((row) => row.order_id === "order-failed")?.status).toBe("cancelled");
    expect(db.rowsOf("orders").find((row) => row.id === "order-young")).toMatchObject({
      inventory_reserved: true,
      status: "pending",
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);

    const second = await releaseReservations(cronRequest());
    await expect(second.json()).resolves.toMatchObject({ examined: 0, released: 0 });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rpcCalls.filter((call) => call.fn === "restore_order_inventory")).toHaveLength(1);
  });

  it("marks a stale intent paid when Airwallex says it succeeded", async () => {
    seedHeldOrder(db, {
      id: "order-paid",
      createdAt: hoursAgo(2),
      stock: 4,
      intentStatus: "SUCCEEDED",
    });

    const response = await releaseReservations(cronRequest());
    await expect(response.json()).resolves.toMatchObject({ paid: 1, released: 0, errors: [] });
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(gateway.cancels).toHaveLength(0);
  });

  it("does not release a stale intent that is still processing", async () => {
    seedHeldOrder(db, {
      id: "order-processing",
      createdAt: hoursAgo(2),
      stock: 4,
      intentStatus: "PENDING",
    });
    const response = await releaseReservations(cronRequest());
    await expect(response.json()).resolves.toMatchObject({ skipped: 1, released: 0, errors: [] });
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "pending",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(gateway.cancels).toHaveLength(0);
  });

  it("cancels and releases an abandoned checkout, including a duplicate and a concurrent run", async () => {
    seedHeldOrder(db, { id: "order-old", createdAt: hoursAgo(2), stock: 4 });

    const [first, second] = await Promise.all([
      releaseReservations(cronRequest()),
      releaseReservations(cronRequest()),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "failed",
      payment_status: "abandoned",
      inventory_reserved: false,
    });
    expect(db.rowsOf("payments")[0].status).toBe("cancelled");
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    const restores = db.rpcCalls.filter(
      (call) => call.fn === "restore_order_inventory" && call.args.p_order_id === "order-old"
    );
    expect(restores.length).toBeGreaterThan(0);
    expect(restores.length).toBeLessThanOrEqual(2);

    const again = await releaseReservations(cronRequest());
    await expect(again.json()).resolves.toMatchObject({ examined: 0 });
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
  });

  it("re-reserves stock when a payment succeeds after the hold was released", async () => {
    seedHeldOrder(db, { id: "order-late", createdAt: hoursAgo(2), stock: 4 });
    expect((await releaseReservations(cronRequest())).status).toBe(200);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rowsOf("orders")[0].inventory_reserved).toBe(false);

    const response = await webhook(
      webhookRequest({
        id: "int_order-late",
        status: "SUCCEEDED",
        amount: 115,
        currency: "USD",
        merchant_order_id: "order-late",
      })
    );
    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(alert).not.toHaveBeenCalled();
  });

  it("flags a late payment for review when the stock is gone", async () => {
    seedHeldOrder(db, { id: "order-gone", createdAt: hoursAgo(2), stock: 4 });
    expect((await releaseReservations(cronRequest())).status).toBe(200);
    db.rowsOf("products")[0].stock_count = 0;

    const response = await webhook(
      webhookRequest({
        id: "int_order-gone",
        status: "SUCCEEDED",
        amount: 115,
        currency: "USD",
        merchant_order_id: "order-gone",
      })
    );
    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "inventory_exception",
      payment_status: "succeeded",
      inventory_reserved: false,
    });
    expect(db.rowsOf("orders")[0].status).not.toBe("paid");
    expect(db.rowsOf("products")[0].stock_count).toBe(0);
    expect(alert).toHaveBeenCalledWith(expect.objectContaining({ orderId: "order-gone" }));

    alert.mockClear();
    const repeat = await webhook(
      webhookRequest(
        {
          id: "int_order-gone",
          status: "SUCCEEDED",
          amount: 115,
          currency: "USD",
          merchant_order_id: "order-gone",
        },
        "evt_repeat_exception"
      )
    );
    expect(repeat.status).toBe(200);
    expect(db.rowsOf("products")[0].stock_count).toBe(0);
    expect(alert).not.toHaveBeenCalled();
  });

  it("continues the cron when one Airwallex lookup fails", async () => {
    seedHeldOrder(db, { id: "order-missing", status: "failed", paymentStatus: "failed", stock: 3 });
    seedHeldOrder(db, { id: "order-ok", status: "failed", paymentStatus: "failed" });
    gateway.intents.delete("int_order-missing");
    db.rowsOf("products")[0].stock_count = 3;

    const response = await releaseReservations(cronRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.released).toBe(1);
    expect(body.errors).toEqual([
      expect.objectContaining({ orderId: "order-missing" }),
    ]);
    expect(db.rowsOf("orders").find((row) => row.id === "order-missing")?.inventory_reserved).toBe(true);
    expect(db.rowsOf("orders").find((row) => row.id === "order-ok")?.inventory_reserved).toBe(false);
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
  });
});
