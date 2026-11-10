import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as cardCheckout } from "@/app/api/checkout/airwallex/route";
import { POST as cardVerify } from "@/app/api/checkout/airwallex/verify/route";
import { POST as codCheckout } from "@/app/api/checkout/cod/route";
import { GET as releaseReservations } from "@/app/api/cron/release-reservations/route";
import { POST as webhook } from "@/app/api/webhooks/airwallex/route";
import { claimOrderConfirmation, sendOrderEmails } from "@/lib/email";
import { createAirwallexPaymentIntent, retrieveAirwallexPaymentIntent } from "@/lib/payments/airwallex";
import {
  checkoutCustomer,
  checkoutItem,
  createCheckoutDb,
  dbError,
  setActiveDb,
  type MemoryDb,
} from "../helpers/memory-db";

const send = vi.hoisted(() => vi.fn());

vi.mock("resend", () => {
  return {
    Resend: class {
      emails = { send };
    },
  };
});

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
const CRON_SECRET = "test_dummy_cron";
const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const LEAK = "mailbox rejected for buyer@example.com key re_live_secretvalue";
const MODES = ["throw", "reject", "error"] as const;
type FailureMode = (typeof MODES)[number];

function sign(timestamp: string, body: string) {
  return createHmac("sha256", SECRET).update(`${timestamp}${body}`).digest("hex");
}

function failSend(mode: FailureMode) {
  if (mode === "throw") {
    send.mockImplementation(() => {
      throw Object.assign(new Error(LEAK), { html: "1 Atelier Lane" });
    });
    return;
  }
  if (mode === "reject") {
    send.mockImplementation(() => Promise.reject(Object.assign(new Error(LEAK), { html: "1 Atelier Lane" })));
    return;
  }
  send.mockResolvedValue({
    data: null,
    error: {
      name: "validation_error",
      statusCode: 403,
      message: LEAK,
      html: "1 Atelier Lane",
    },
  });
}

function loggedText() {
  return vi
    .mocked(console.error)
    .mock.calls.flat()
    .map((part) => {
      if (part instanceof Error) return `${part.name} ${part.message} ${JSON.stringify(part)}`;
      if (typeof part === "string") return part;
      return JSON.stringify(part);
    })
    .join("\n");
}

function expectSafeLog(mode: FailureMode) {
  const text = loggedText();
  expect(text).toContain("[email] send failed");
  expect(text).not.toContain("buyer@example.com");
  expect(text).not.toContain("admin@example.com");
  expect(text).not.toContain("re_live_secretvalue");
  expect(text).not.toContain("Atelier");
  expect(vi.mocked(console.error)).toHaveBeenCalledWith(
    "[email] send failed",
    expect.objectContaining({
      name: mode === "error" ? "validation_error" : "Error",
      statusCode: mode === "error" ? 403 : null,
      message: expect.stringContaining("[redacted]"),
    })
  );
}

function seedHeldOrder(db: MemoryDb, createdAt = new Date().toISOString()) {
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
      created_at: createdAt,
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
}

function signedWebhook(eventId: string) {
  const body = JSON.stringify({
    id: eventId,
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
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Request("http://localhost:3000/api/webhooks/airwallex", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature": sign(timestamp, body),
      "x-timestamp": timestamp,
    },
    body,
  });
}

function succeededIntent() {
  return {
    id: "int_1",
    request_id: "req-1",
    status: "SUCCEEDED",
    amount: 115,
    currency: "USD",
    client_secret: "secret_test",
    merchant_order_id: "order-1",
    updated_at: new Date().toISOString(),
  };
}

describe("Resend failures stay off the order path", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    send.mockReset();
    vi.mocked(createAirwallexPaymentIntent).mockReset();
    vi.mocked(retrieveAirwallexPaymentIntent).mockReset();
    process.env.RESEND_API_KEY = "re_live_secretvalue";
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.EMAIL_FROM = "from@example.com";
    process.env.AIRWALLEX_WEBHOOK_SECRET = SECRET;
    process.env.CRON_SECRET = CRON_SECRET;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network call");
      })
    );
  });

  it.each(MODES)("keeps a COD order when Resend %s", async (mode) => {
    failSend(mode);
    const response = await codCheckout(
      new Request("http://localhost:3000/api/checkout/cod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [checkoutItem()],
          customer: checkoutCustomer,
          currency: "USD",
          idempotencyKey: `cod-mail-${mode}`,
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ orderId: expect.any(String) });
    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      payment_provider: "cod",
      inventory_reserved: true,
      status: "pending",
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(send).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expectSafeLog(mode);
  });

  it.each(MODES)("marks the card webhook paid when Resend %s", async (mode) => {
    failSend(mode);
    seedHeldOrder(db);
    const body = JSON.stringify({
      id: `evt_${mode}`,
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
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = await webhook(
      new Request("http://localhost:3000/api/webhooks/airwallex", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signature": sign(timestamp, body),
          "x-timestamp": timestamp,
        },
        body,
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
      provider_event_id: `evt_${mode}`,
      status: "processed",
    });
    expect(send).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expectSafeLog(mode);
  });

  it("keeps reserved stock when card checkout mail throws", async () => {
    failSend("throw");
    vi.mocked(createAirwallexPaymentIntent).mockResolvedValue({
      ...succeededIntent(),
      id: "int_test",
      request_id: REQUEST_ID,
    });

    const response = await cardCheckout(
      new Request("http://localhost:3000/api/checkout/airwallex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [checkoutItem()],
          customer: checkoutCustomer,
          currency: "USD",
          idempotencyKey: REQUEST_ID,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      inventory_reserved: true,
      payment_status: "succeeded",
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(fetch).not.toHaveBeenCalled();
    expectSafeLog("throw");
  });

  it("confirms a paid card return when Resend throws", async () => {
    failSend("throw");
    seedHeldOrder(db);
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue(succeededIntent());

    const response = await cardVerify(
      new Request("http://localhost:3000/api/checkout/airwallex/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: "order-1", refresh: true }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      orderId: "order-1",
      succeeded: true,
      paymentStatus: "succeeded",
      inventoryReserved: true,
    });
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(fetch).not.toHaveBeenCalled();
    expectSafeLog("throw");
  });

  it("counts a late capture as paid when Resend throws during the cron", async () => {
    failSend("throw");
    seedHeldOrder(db, new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue(succeededIntent());

    const response = await releaseReservations(
      new Request("http://localhost:3000/api/cron/release-reservations", {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ paid: 1, released: 0, errors: [] });
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(fetch).not.toHaveBeenCalled();
    expectSafeLog("throw");
  });

  it("sends one confirmation when webhook and verify race", async () => {
    delete process.env.ADMIN_EMAIL;
    send.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { data: { id: "email_1" }, error: null };
    });
    seedHeldOrder(db);
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue(succeededIntent());

    const [paid, confirmed] = await Promise.all([
      webhook(signedWebhook("evt_race_webhook")),
      cardVerify(
        new Request("http://localhost:3000/api/checkout/airwallex/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: "order-1", refresh: true }),
        })
      ),
    ]);

    expect(paid.status).toBe(200);
    expect(confirmed.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      inventory_reserved: true,
      confirmation_email_sent_at: expect.any(String),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("clears a failed send so a later call sends once", async () => {
    delete process.env.ADMIN_EMAIL;
    send
      .mockResolvedValueOnce({
        data: null,
        error: { name: "application_error", statusCode: 500, message: "down" },
      })
      .mockResolvedValue({ data: { id: "email_2" }, error: null });
    seedHeldOrder(db);

    const first = await webhook(signedWebhook("evt_retry_1"));
    expect(first.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
    });
    expect(db.rowsOf("orders")[0].confirmation_email_sent_at ?? null).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);

    const second = await webhook(signedWebhook("evt_retry_2"));
    expect(second.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
    expect(db.rowsOf("orders")[0].confirmation_email_sent_at).toEqual(expect.any(String));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("logs a failed confirmation claim and still marks the order paid", async () => {
    delete process.env.ADMIN_EMAIL;
    send.mockResolvedValue({ data: { id: "email_1" }, error: null });
    seedHeldOrder(db);
    db.failWhen = (table, op, filters) =>
      table === "orders" &&
      op === "update" &&
      filters.some((filter) => filter.op === "is" && filter.column === "confirmation_email_sent_at")
        ? dbError("claim failed", "XX000")
        : null;

    const response = await webhook(signedWebhook("evt_claim"));
    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      inventory_reserved: true,
    });
    expect(db.rowsOf("orders")[0].confirmation_email_sent_at ?? null).toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(vi.mocked(console.error)).toHaveBeenCalledWith("[email] confirmation claim failed", "order-1");
    expect(loggedText()).not.toContain("buyer@example.com");
    expect(loggedText()).not.toContain("re_live_secretvalue");
  });

  it("logs a failed claim clear and does not throw", async () => {
    delete process.env.ADMIN_EMAIL;
    send.mockResolvedValue({
      data: null,
      error: { name: "application_error", statusCode: 500, message: "down" },
    });
    seedHeldOrder(db);
    db.failWhen = (table, op, filters) =>
      table === "orders" &&
      op === "update" &&
      filters.some((filter) => filter.op === "eq" && filter.column === "confirmation_email_sent_at")
        ? dbError("clear failed", "XX000")
        : null;

    const response = await webhook(signedWebhook("evt_clear"));
    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
    });
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      "[email] confirmation claim clear failed",
      "order-1"
    );
    expect(loggedText()).not.toContain("buyer@example.com");
    expect(loggedText()).not.toContain("re_live_secretvalue");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not fail or release a paid order when a later checkout write throws", async () => {
    send.mockResolvedValue({ data: { id: "email_1" }, error: null });
    vi.mocked(createAirwallexPaymentIntent).mockResolvedValue({
      ...succeededIntent(),
      id: "int_test",
      request_id: REQUEST_ID,
    });
    db.failWhen = (table, op, filters) => {
      if (table !== "orders" || op !== "update") return null;
      const paid = db.rowsOf("orders").some((row) => row.payment_status === "succeeded");
      const guardsPaid = filters.some(
        (filter) =>
          filter.op === "neq" && filter.column === "payment_status" && filter.value === "succeeded"
      );
      if (paid && !guardsPaid) return dbError("late checkout write failed", "XX000");
      return null;
    };

    const response = await cardCheckout(
      new Request("http://localhost:3000/api/checkout/airwallex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [checkoutItem()],
          customer: checkoutCustomer,
          currency: "USD",
          idempotencyKey: REQUEST_ID,
        }),
      })
    );

    expect(response.status).toBe(500);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
      inventory_reserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rpcCalls.filter((call) => call.fn === "restore_order_inventory")).toHaveLength(0);
  });

  it("sends one COD confirmation and skips the duplicate checkout", async () => {
    delete process.env.ADMIN_EMAIL;
    send.mockResolvedValue({ data: { id: "email_1" }, error: null });

    const first = await codCheckout(codRequest("cod-once"));
    expect(first.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("orders")[0]).toMatchObject({ inventory_reserved: true });
    expect(db.rowsOf("orders")[0].confirmation_email_sent_at).toEqual(expect.any(String));
    expect(db.rowsOf("products")[0].stock_count).toBe(4);

    const firstOrderId = (await first.json()).orderId;
    const second = await codCheckout(codRequest("cod-once"));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ orderId: firstOrderId });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("clears the COD claim when the confirmation fails and still saves the order", async () => {
    delete process.env.ADMIN_EMAIL;
    send.mockResolvedValue({
      data: null,
      error: { name: "application_error", statusCode: 500, message: "down" },
    });

    const response = await codCheckout(codRequest("cod-clear"));
    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("orders")[0]).toMatchObject({ inventory_reserved: true });
    expect(db.rowsOf("orders")[0].confirmation_email_sent_at ?? null).toBeNull();
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps the claim when the customer email succeeds and the admin notice fails", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    send.mockImplementation(async (payload: { to?: string }) => {
      if (payload.to === "admin@example.com") {
        return { data: null, error: { name: "application_error", statusCode: 500, message: "down" } };
      }
      return { data: { id: "email_1" }, error: null };
    });
    db.seed("orders", [{ id: "order-mail", status: "pending", confirmation_email_sent_at: null }]);

    await claimOrderConfirmation(db as never, "order-mail", () => sendOrderEmails(confirmation));

    expect(db.rowsOf("orders")[0].confirmation_email_sent_at).toEqual(expect.any(String));
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      "[email] send failed",
      expect.objectContaining({ orderId: "order-mail", label: "order notification" })
    );
    expect(loggedText()).not.toContain("buyer@example.com");
    expect(loggedText()).not.toContain("re_live_secretvalue");
  });

  it("clears the claim when the customer email fails", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    send.mockImplementation(async (payload: { to?: string }) => {
      if (payload.to === "buyer@example.com") {
        return { data: null, error: { name: "application_error", statusCode: 500, message: "down" } };
      }
      return { data: { id: "email_admin" }, error: null };
    });
    db.seed("orders", [{ id: "order-mail", status: "pending", confirmation_email_sent_at: null }]);

    await claimOrderConfirmation(db as never, "order-mail", () => sendOrderEmails(confirmation));

    expect(db.rowsOf("orders")[0].confirmation_email_sent_at ?? null).toBeNull();
  });

  it("does not send again after a confirmation claim is kept", async () => {
    delete process.env.ADMIN_EMAIL;
    send.mockResolvedValue({ data: { id: "email_1" }, error: null });
    db.seed("orders", [{ id: "order-mail", status: "pending", confirmation_email_sent_at: null }]);

    await claimOrderConfirmation(db as never, "order-mail", () => sendOrderEmails(confirmation));
    await claimOrderConfirmation(db as never, "order-mail", () => sendOrderEmails(confirmation));

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("clears the claim with the timestamp returned by the database", async () => {
    const dbStamp = "2000-01-01T00:00:00.000Z";
    const matched: unknown[] = [];
    db.seed("orders", [{ id: "order-mail", status: "pending", confirmation_email_sent_at: null }]);
    const originalFrom = db.from.bind(db);
    db.from = ((table: string) => {
      const query = originalFrom(table);
      const update = query.update.bind(query);
      const eq = query.eq.bind(query);
      query.update = ((payload: Record<string, unknown>) => {
        if (typeof payload.confirmation_email_sent_at === "string") {
          return update({ ...payload, confirmation_email_sent_at: dbStamp });
        }
        return update(payload);
      }) as typeof query.update;
      query.eq = ((column: string, value: unknown) => {
        if (column === "confirmation_email_sent_at") matched.push(value);
        return eq(column, value);
      }) as typeof query.eq;
      return query;
    }) as typeof db.from;

    await claimOrderConfirmation(db as never, "order-mail", async () => false);

    expect(matched).toEqual([dbStamp]);
    expect(db.rowsOf("orders")[0].confirmation_email_sent_at ?? null).toBeNull();
  });

  it("returns a paid webhook success when EMAIL_FROM is unset and leaves the claim clear", async () => {
    delete process.env.EMAIL_FROM;
    seedHeldOrder(db);

    const response = await webhook(signedWebhook("evt_missing_from"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
    });
    expect(db.rowsOf("orders")[0].confirmation_email_sent_at ?? null).toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(vi.mocked(console.error)).toHaveBeenCalledWith("[email] EMAIL_FROM is not set", "order-1");
    expect(loggedText()).not.toContain("from@example.com");
  });

  it("returns a paid verify success when EMAIL_FROM is blank and leaves the claim clear", async () => {
    process.env.EMAIL_FROM = "   ";
    seedHeldOrder(db);
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue(succeededIntent());

    const response = await cardVerify(
      new Request("http://localhost:3000/api/checkout/airwallex/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: "order-1", refresh: true }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      orderId: "order-1",
      succeeded: true,
      paymentStatus: "succeeded",
    });
    expect(db.rowsOf("orders")[0].confirmation_email_sent_at ?? null).toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(vi.mocked(console.error)).toHaveBeenCalledWith("[email] EMAIL_FROM is not set", "order-1");
  });

  it("releases the claim when RESEND_API_KEY is missing and the paid routes still succeed", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.ADMIN_EMAIL;
    seedHeldOrder(db);
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue(succeededIntent());

    const confirmed = await cardVerify(
      new Request("http://localhost:3000/api/checkout/airwallex/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: "order-1", refresh: true }),
      })
    );
    expect(confirmed.status).toBe(200);
    await expect(confirmed.json()).resolves.toMatchObject({
      succeeded: true,
      paymentStatus: "succeeded",
    });
    expect(send).not.toHaveBeenCalled();
    expect(db.rowsOf("orders")[0].confirmation_email_sent_at ?? null).toBeNull();

    db.rowsOf("orders")[0].status = "pending";
    db.rowsOf("orders")[0].payment_status = "requires_payment_method";
    db.rowsOf("payments")[0].status = "requires_payment_method";
    const paid = await webhook(signedWebhook("evt_no_key"));
    expect(paid.status).toBe(200);
    await expect(paid.json()).resolves.toEqual({ received: true });
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
    });
    expect(send).not.toHaveBeenCalled();
    expect(db.rowsOf("orders")[0].confirmation_email_sent_at ?? null).toBeNull();
  });

  it("releases a failed verify send so the next verify sends once", async () => {
    delete process.env.ADMIN_EMAIL;
    send
      .mockResolvedValueOnce({
        data: null,
        error: { name: "application_error", statusCode: 500, message: "down" },
      })
      .mockResolvedValue({ data: { id: "email_2" }, error: null });
    seedHeldOrder(db);
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue(succeededIntent());
    const verify = () =>
      cardVerify(
        new Request("http://localhost:3000/api/checkout/airwallex/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: "order-1", refresh: true }),
        })
      );

    const first = await verify();
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ succeeded: true });
    expect(db.rowsOf("orders")[0].confirmation_email_sent_at ?? null).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);

    db.rowsOf("orders")[0].status = "pending";
    db.rowsOf("orders")[0].payment_status = "requires_payment_method";
    db.rowsOf("payments")[0].status = "requires_payment_method";
    const second = await verify();
    expect(second.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
    expect(db.rowsOf("orders")[0].confirmation_email_sent_at).toEqual(expect.any(String));
  });
});

const confirmation = {
  orderId: "order-mail",
  customerName: "Ada Lovelace",
  customerEmail: "buyer@example.com",
  items: [{ name: "Amethyst Bracelet XV (5mm)", quantity: 1, price: 100 }],
  subtotal: 100,
  shipping: 15,
  total: 115,
  paymentMethod: "cod" as const,
  currency: "USD" as const,
  shippingAddress: {
    address: "1 Atelier Lane",
    city: "Austin",
    region: "TX",
    country: "United States",
  },
};

function codRequest(key: string) {
  return new Request("http://localhost:3000/api/checkout/cod", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [checkoutItem()],
      customer: checkoutCustomer,
      currency: "USD",
      idempotencyKey: key,
    }),
  });
}
