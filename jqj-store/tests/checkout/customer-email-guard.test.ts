import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postAirwallex } from "@/app/api/checkout/airwallex/route";
import { POST as postAirwallexVerify } from "@/app/api/checkout/airwallex/verify/route";
import { POST as postCod } from "@/app/api/checkout/cod/route";
import { POST as postWebhook } from "@/app/api/webhooks/airwallex/route";
import { sendOrderEmails } from "@/lib/email";
import { retrieveAirwallexPaymentIntent, createAirwallexPaymentIntent } from "@/lib/payments/airwallex";
import {
  checkoutCustomer,
  checkoutItem,
  createCheckoutDb,
  setActiveDb,
  type MemoryDb,
} from "../helpers/memory-db";

const sendEmail = vi.hoisted(() =>
  vi.fn(async (_payload: { to?: string }) => ({ data: { id: "email_1" }, error: null }))
);

vi.mock("resend", () => {
  class Resend {
    emails = { send: sendEmail };
  }
  return { Resend };
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

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const WEBHOOK_SECRET = "test_dummy_webhook_secret";
const FIELD_MESSAGE = "Enter a valid email address.";

const rejectedEmails = [
  ["comma", "a@x.com,evil.com"],
  ["CR/LF", "buyer@example.com\r\nBcc:evil@example.com"],
  ["bad format", "not-an-email"],
] as const;

function checkoutRequest(path: string, email: string, idempotencyKey: string) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [checkoutItem()],
      customer: { ...checkoutCustomer, email },
      currency: "USD",
      idempotencyKey,
    }),
  });
}

function sign(timestamp: string, body: string) {
  return createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}${body}`).digest("hex");
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

function seedPaidPath(db: MemoryDb, email: string, orderId = "order-1") {
  db.rowsOf("products")[0].stock_count = 4;
  db.seed("orders", [
    {
      id: orderId,
      status: "pending",
      payment_provider: "airwallex",
      payment_status: "requires_payment_method",
      fulfillment_status: "pending_payment",
      inventory_reserved: true,
      total_amount: 115,
      subtotal_amount: 100,
      shipping_amount: 15,
      currency: "USD",
      customer_email: email,
      customer_name: "Ada Lovelace",
      shipping_address: {
        address: "1 Collector Lane",
        city: "Austin",
        region: "TX",
        country: "United States",
      },
    },
  ]);
  db.seed("order_items", [
    {
      id: `item-${orderId}`,
      order_id: orderId,
      product_id: "prod-amethyst",
      variant_id: null,
      quantity: 1,
      product_name: "Amethyst Bracelet XV (5mm)",
      price_at_purchase: 100,
    },
  ]);
  db.seed("payments", [
    {
      id: `pay-${orderId}`,
      order_id: orderId,
      provider: "airwallex",
      provider_payment_intent_id: `int_${orderId}`,
      provider_request_id: `req_${orderId}`,
      status: "requires_payment_method",
      amount: 115,
      currency: "USD",
    },
  ]);
}

function expectNoCheckoutSideEffects(db: MemoryDb) {
  expect(db.rowsOf("orders")).toHaveLength(0);
  expect(db.rowsOf("order_items")).toHaveLength(0);
  expect(db.rowsOf("payments")).toHaveLength(0);
  expect(db.rowsOf("products")[0].stock_count).toBe(5);
  expect(db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory")).toHaveLength(0);
  expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
}

describe("customer email is a single mailbox", () => {
  let db: MemoryDb;
  let errorSpy: ReturnType<typeof vi.spyOn> | undefined;

  afterEach(() => {
    errorSpy?.mockRestore();
    delete process.env.RESEND_API_KEY;
    delete process.env.ADMIN_EMAIL;
    delete process.env.EMAIL_FROM;
  });

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    process.env.RESEND_API_KEY = "test_dummy";
    process.env.EMAIL_FROM = "orders@example.com";
    delete process.env.ADMIN_EMAIL;
    process.env.AIRWALLEX_WEBHOOK_SECRET = WEBHOOK_SECRET;
    sendEmail.mockClear();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network call");
      })
    );
    vi.mocked(createAirwallexPaymentIntent).mockReset();
    vi.mocked(createAirwallexPaymentIntent).mockResolvedValue({
      id: "int_test",
      request_id: REQUEST_ID,
      status: "REQUIRES_PAYMENT_METHOD",
      amount: 115,
      currency: "USD",
      client_secret: "secret_test",
      merchant_order_id: "order",
    });
    vi.mocked(retrieveAirwallexPaymentIntent).mockReset();
  });

  it.each(rejectedEmails)(
    "COD rejects a %s recipient before insert, reserve, or send",
    async (_label, email) => {
      const response = await postCod(
        checkoutRequest("/api/checkout/cod", email, `cod-${_label}`)
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Check the highlighted fields.",
        fields: { email: FIELD_MESSAGE },
      });
      expectNoCheckoutSideEffects(db);
    }
  );

  it.each(rejectedEmails)(
    "Airwallex checkout rejects a %s recipient before insert, reserve, or intent",
    async (_label, email) => {
      const response = await postAirwallex(
        checkoutRequest("/api/checkout/airwallex", email, REQUEST_ID)
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Check the highlighted fields.",
        fields: { email: FIELD_MESSAGE },
      });
      expectNoCheckoutSideEffects(db);
    }
  );

  it("rejects a@x.com,evil.com on both checkout routes", async () => {
    const email = "a@x.com,evil.com";
    const cod = await postCod(checkoutRequest("/api/checkout/cod", email, "cod-comma-evil"));
    const card = await postAirwallex(
      checkoutRequest("/api/checkout/airwallex", email, REQUEST_ID)
    );
    expect(cod.status).toBe(400);
    expect(card.status).toBe(400);
    expect(await cod.json()).toEqual({
      error: "Check the highlighted fields.",
      fields: { email: FIELD_MESSAGE },
    });
    expect(await card.json()).toEqual({
      error: "Check the highlighted fields.",
      fields: { email: FIELD_MESSAGE },
    });
    expectNoCheckoutSideEffects(db);
  });

  it("accepts a valid email on COD and sends only that mailbox", async () => {
    const response = await postCod(
      checkoutRequest("/api/checkout/cod", "buyer@example.com", "cod-valid")
    );
    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("orders")[0].customer_email).toBe("buyer@example.com");
    expect(db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory")).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      to: "buyer@example.com",
      from: "orders@example.com",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("trims a valid COD email before storing or sending it", async () => {
    const response = await postCod(
      checkoutRequest("/api/checkout/cod", "  buyer@example.com  ", "cod-trimmed")
    );
    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0].customer_email).toBe("buyer@example.com");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: "buyer@example.com" });
  });

  it("accepts a valid email on Airwallex checkout and creates one intent", async () => {
    const response = await postAirwallex(
      checkoutRequest("/api/checkout/airwallex", "buyer@example.com", REQUEST_ID)
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.intentId).toBe("int_test");
    expect(db.rowsOf("orders")[0].customer_email).toBe("buyer@example.com");
    expect(db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory")).toHaveLength(1);
    expect(createAirwallexPaymentIntent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createAirwallexPaymentIntent).mock.calls[0][0].customer).toMatchObject({
      email: "buyer@example.com",
    });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips an invalid ADMIN_EMAIL and logs only the env name", async () => {
    const injected = "admin)box@example.com";
    process.env.ADMIN_EMAIL = injected;
    process.env.EMAIL_FROM = "orders@example.com";
    await sendOrderEmails({
      orderId: "order-admin",
      customerName: "Ada",
      customerEmail: "buyer@example.com",
      items: [{ name: "Bracelet", quantity: 1, price: 100 }],
      subtotal: 100,
      shipping: 15,
      total: 115,
      paymentMethod: "cod",
      currency: "USD",
      shippingAddress: { address: "1 Collector Lane", city: "Austin", region: "TX", country: "United States" },
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      to: "buyer@example.com",
      from: "orders@example.com",
    });
    const logged = errorSpy?.mock.calls.map((args) => args.map(String).join(" ")).join("\n") ?? "";
    expect(logged).toContain("ADMIN_EMAIL");
    expect(logged).not.toContain(injected);
    expect(logged).not.toContain("admin)");
  });

  it("skips every send when EMAIL_FROM is unset and logs only the env name", async () => {
    delete process.env.EMAIL_FROM;
    process.env.ADMIN_EMAIL = "desk@example.com";
    await sendOrderEmails({
      orderId: "order-missing-from",
      customerName: "Ada",
      customerEmail: "buyer@example.com",
      items: [{ name: "Bracelet", quantity: 1, price: 100 }],
      subtotal: 100,
      shipping: 15,
      total: 115,
      paymentMethod: "cod",
      currency: "USD",
      shippingAddress: { address: "1 Collector Lane", city: "Austin", region: "TX", country: "United States" },
    });

    expect(sendEmail).not.toHaveBeenCalled();
    const logged = errorSpy?.mock.calls.map((args) => args.map(String).join(" ")).join("\n") ?? "";
    expect(logged).toContain("EMAIL_FROM");
    expect(logged).not.toContain("orders@danvapes.shop");
    expect(logged).not.toContain("desk@example.com");
    expect(logged).not.toContain("buyer@example.com");
    expect(logged).not.toContain("@");
  });

  it("skips both sends when EMAIL_FROM is invalid and logs only the env name", async () => {
    const injected = "bad<from>@example.com";
    process.env.EMAIL_FROM = injected;
    process.env.ADMIN_EMAIL = "desk@example.com";
    await sendOrderEmails({
      orderId: "order-from",
      customerName: "Ada",
      customerEmail: "buyer@example.com",
      items: [{ name: "Bracelet", quantity: 1, price: 100 }],
      subtotal: 100,
      shipping: 15,
      total: 115,
      paymentMethod: "airwallex",
      currency: "USD",
      shippingAddress: { address: "1 Collector Lane", city: "Austin", region: "TX", country: "United States" },
    });

    expect(sendEmail).not.toHaveBeenCalled();
    const logged = errorSpy?.mock.calls.map((args) => args.map(String).join(" ")).join("\n") ?? "";
    expect(logged).toContain("EMAIL_FROM");
    expect(logged).not.toContain(injected);
    expect(logged).not.toContain("bad<from>");
    expect(logged).not.toContain("desk@example.com");
  });

  it("skips a stored invalid address and the paid webhook still succeeds", async () => {
    const stored = "a@x.com,evil.com";
    seedPaidPath(db, stored);
    const response = await postWebhook(
      signedWebhook({
        id: "evt_bad_email",
        name: "payment_intent.succeeded",
        created_at: new Date().toISOString(),
        data: {
          object: {
            id: "int_order-1",
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
    expect(db.rowsOf("orders")[0].confirmation_email_sent_at).toEqual(expect.any(String));
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rpcCalls.filter((call) => call.fn === "restore_order_inventory")).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();

    const logged = errorSpy?.mock.calls.map((args) => args.map(String).join(" ")).join("\n");
    expect(logged).toContain("order-1");
    expect(logged).not.toContain(stored);
    expect(logged).not.toContain("evil.com");
  });

  it("skips a stored CR/LF address and Airwallex verify still succeeds", async () => {
    const stored = "buyer@example.com\nBcc:evil@example.com";
    seedPaidPath(db, stored, "order-verify");
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue({
      id: "int_order-verify",
      status: "SUCCEEDED",
      amount: 115,
      currency: "USD",
    });

    const response = await postAirwallexVerify(
      new Request("http://localhost:3000/api/checkout/airwallex/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: "order-verify", refresh: true }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      orderId: "order-verify",
      succeeded: true,
      paymentStatus: "succeeded",
      inventoryReserved: true,
    });
    expect(db.rowsOf("orders")[0].inventory_reserved).toBe(true);
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rpcCalls.filter((call) => call.fn === "restore_order_inventory")).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();

    const logged = errorSpy?.mock.calls.map((args) => args.map(String).join("\n")).join("\n");
    expect(logged).toContain("order-verify");
    expect(logged).not.toContain(stored);
    expect(logged).not.toContain("evil@example.com");
  });
});
