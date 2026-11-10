import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as checkout } from "@/app/api/checkout/airwallex/route";
import { POST as verify } from "@/app/api/checkout/airwallex/verify/route";
import { POST as webhook } from "@/app/api/webhooks/airwallex/route";
import { sendOrderEmails } from "@/lib/email";
import { createAirwallexPaymentIntent, retrieveAirwallexPaymentIntent } from "@/lib/payments/airwallex";
import { applyAirwallexPaymentIntentStatus } from "@/lib/payments/airwallex-orders";
import {
  checkoutCustomer,
  checkoutItem,
  createCheckoutDb,
  dbError,
  setActiveDb,
  type MemoryDb,
} from "../helpers/memory-db";

vi.mock("@/lib/email", () => ({
  sendOrderEmails: vi.fn(async () => undefined),
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

const KEY_A = "11111111-1111-4111-8111-111111111111";
const KEY_B = "22222222-2222-4222-8222-222222222222";
const SECRET = "test_dummy_webhook_secret";

function checkoutRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/checkout/airwallex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [checkoutItem()],
      customer: checkoutCustomer,
      currency: "USD",
      ...body,
    }),
  });
}

function verifyRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/checkout/airwallex/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

function paidOrderWrites(db: MemoryDb) {
  return db.writes.filter(
    (write) =>
      write.op === "update" &&
      write.table === "orders" &&
      write.matched === 1 &&
      write.payload != null &&
      !Array.isArray(write.payload) &&
      write.payload.payment_status === "succeeded"
  );
}

function paidPaymentWrites(db: MemoryDb) {
  return db.writes.filter(
    (write) =>
      write.op === "update" &&
      write.table === "payments" &&
      write.matched === 1 &&
      write.payload != null &&
      !Array.isArray(write.payload) &&
      write.payload.status === "succeeded"
  );
}

function reserves(db: MemoryDb) {
  return db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory");
}

describe("Airwallex checkout idempotency", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    process.env.AIRWALLEX_WEBHOOK_SECRET = SECRET;
    delete process.env.RESEND_API_KEY;
    vi.mocked(sendOrderEmails).mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network call");
      })
    );
    vi.mocked(createAirwallexPaymentIntent).mockReset();
    vi.mocked(retrieveAirwallexPaymentIntent).mockReset();
    vi.mocked(createAirwallexPaymentIntent).mockImplementation(async (input) => ({
      id: "int_same",
      request_id: input.requestId,
      status: "REQUIRES_PAYMENT_METHOD",
      amount: input.amount,
      currency: input.currency,
      client_secret: "secret_test",
      merchant_order_id: input.merchantOrderId,
    }));
  });

  it("confirms the same intent once across two returns and a webhook", async () => {
    const started = await checkout(checkoutRequest({ idempotencyKey: KEY_A }));
    expect(started.status).toBe(200);
    const startedBody = await started.json();

    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue({
      id: "int_same",
      request_id: KEY_A,
      status: "SUCCEEDED",
      amount: 115,
      currency: "USD",
      merchant_order_id: startedBody.orderId,
    });

    const firstReturn = await verify(
      verifyRequest({
        orderId: startedBody.orderId,
        paymentIntentId: "int_same",
        refresh: true,
      })
    );
    const secondReturn = await verify(
      verifyRequest({
        orderId: startedBody.orderId,
        paymentIntentId: "int_same",
        refresh: true,
      })
    );
    expect(firstReturn.status).toBe(200);
    expect(secondReturn.status).toBe(200);

    const delivered = await webhook(
      signedWebhook({
        id: "evt_paid_once",
        name: "payment_intent.succeeded",
        created_at: new Date().toISOString(),
        data: {
          object: {
            id: "int_same",
            request_id: KEY_A,
            status: "SUCCEEDED",
            amount: 115,
            currency: "USD",
            merchant_order_id: startedBody.orderId,
          },
        },
      })
    );
    expect(delivered.status).toBe(200);

    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("payments")).toHaveLength(1);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      id: startedBody.orderId,
      payment_status: "succeeded",
      status: "paid",
      inventory_reserved: true,
    });
    expect(db.rowsOf("payments")[0]).toMatchObject({
      order_id: startedBody.orderId,
      provider_payment_intent_id: "int_same",
      status: "succeeded",
    });
    expect(reserves(db)).toHaveLength(1);
    expect(paidOrderWrites(db)).toHaveLength(1);
    expect(paidPaymentWrites(db)).toHaveLength(1);
    expect(sendOrderEmails).toHaveBeenCalledTimes(1);
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps one order when a pending or failed return retries with the same key and the intent succeeds later", async () => {
    const started = await checkout(checkoutRequest({ idempotencyKey: KEY_A }));
    expect(started.status).toBe(200);
    const startedBody = await started.json();
    const originalAddress = {
      ...(db.rowsOf("orders")[0].shipping_address as Record<string, unknown>),
    };
    const originalTotal = db.rowsOf("orders")[0].total_amount;

    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValueOnce({
      id: "int_same",
      status: "PENDING",
      amount: 115,
      currency: "USD",
    });
    const pending = await verify(verifyRequest({ orderId: startedBody.orderId, paymentIntentId: "int_same" }));
    expect(pending.status).toBe(202);

    const retried = await checkout(
      checkoutRequest({
        idempotencyKey: KEY_A,
        paymentIntentId: "int_same",
        customer: { ...checkoutCustomer, address: "9 Other Street" },
      })
    );
    expect(retried.status).toBe(200);
    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("payments")).toHaveLength(1);
    expect(db.rowsOf("orders")[0].shipping_address).toMatchObject(originalAddress);
    expect(db.rowsOf("orders")[0].total_amount).toBe(originalTotal);

    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValueOnce({
      id: "int_same",
      status: "FAILED",
      amount: 115,
      currency: "USD",
    });
    const failed = await verify(verifyRequest({ orderId: startedBody.orderId, paymentIntentId: "int_same" }));
    expect(failed.status).toBe(402);

    const retriedAfterFailure = await checkout(
      checkoutRequest({
        idempotencyKey: KEY_A,
        paymentIntentId: "int_same",
        customer: { ...checkoutCustomer, address: "9 Other Street", city: "Dallas" },
      })
    );
    expect(retriedAfterFailure.status).toBe(200);
    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("orders")[0].shipping_address).toMatchObject({
      address: originalAddress.address,
      city: originalAddress.city,
    });
    expect(db.rowsOf("orders")[0].total_amount).toBe(originalTotal);

    const late = await webhook(
      signedWebhook({
        id: "evt_late_success",
        name: "payment_intent.succeeded",
        created_at: new Date().toISOString(),
        data: {
          object: {
            id: "int_same",
            request_id: KEY_A,
            status: "SUCCEEDED",
            amount: 115,
            currency: "USD",
            merchant_order_id: startedBody.orderId,
          },
        },
      })
    );
    expect(late.status).toBe(200);
    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("payments")).toHaveLength(1);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      id: startedBody.orderId,
      payment_status: "succeeded",
      status: "paid",
    });
    expect(paidOrderWrites(db)).toHaveLength(1);
    expect(paidPaymentWrites(db)).toHaveLength(1);
    expect(sendOrderEmails).toHaveBeenCalledTimes(1);
    expect(reserves(db)).toHaveLength(1);
  });

  it("does not open a second order when a new idempotency key still belongs to the same payment intent", async () => {
    const first = await checkout(checkoutRequest({ idempotencyKey: KEY_A }));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(db.rowsOf("orders")).toHaveLength(1);

    const second = await checkout(
      checkoutRequest({
        idempotencyKey: KEY_B,
        paymentIntentId: firstBody.intentId,
        customer: { ...checkoutCustomer, address: "9 Other Street" },
      })
    );
    expect(second.status).toBe(200);
    const secondBody = await second.json();

    expect(secondBody.orderId).toBe(firstBody.orderId);
    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("payments")).toHaveLength(1);
    expect(db.rowsOf("payments")[0]).toMatchObject({
      order_id: firstBody.orderId,
      provider_payment_intent_id: "int_same",
    });
    expect((db.rowsOf("orders")[0].shipping_address as { address?: string }).address).toBe(
      "1 Atelier Lane"
    );
    expect(reserves(db)).toHaveLength(1);

    vi.mocked(createAirwallexPaymentIntent).mockImplementation(async (input) => ({
      id: "int_same",
      request_id: input.requestId,
      status: "REQUIRES_PAYMENT_METHOD",
      amount: input.amount,
      currency: input.currency,
      client_secret: "secret_test",
      merchant_order_id: input.merchantOrderId,
    }));
    const third = await checkout(checkoutRequest({ idempotencyKey: "33333333-3333-4333-8333-333333333333" }));
    expect(third.status).toBe(200);
    const thirdBody = await third.json();
    expect(thirdBody.orderId).toBe(firstBody.orderId);
    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("payments")).toHaveLength(1);
    expect(db.rowsOf("payments")[0].order_id).toBe(firstBody.orderId);
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
  });

  it("marks a null payment_status paid once from verify and the webhook", async () => {
    const started = await checkout(checkoutRequest({ idempotencyKey: KEY_A }));
    expect(started.status).toBe(200);
    const startedBody = await started.json();
    db.rowsOf("orders")[0].payment_status = null;

    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue({
      id: "int_same",
      request_id: KEY_A,
      status: "SUCCEEDED",
      amount: 115,
      currency: "USD",
      merchant_order_id: startedBody.orderId,
    });

    const returned = await verify(
      verifyRequest({ orderId: startedBody.orderId, paymentIntentId: "int_same", refresh: true })
    );
    expect(returned.status).toBe(200);

    const delivered = await webhook(
      signedWebhook({
        id: "evt_null_paid",
        name: "payment_intent.succeeded",
        created_at: new Date().toISOString(),
        data: {
          object: {
            id: "int_same",
            request_id: KEY_A,
            status: "SUCCEEDED",
            amount: 115,
            currency: "USD",
            merchant_order_id: startedBody.orderId,
          },
        },
      })
    );
    expect(delivered.status).toBe(200);
    await expect(delivered.json()).resolves.toEqual({ received: true });

    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("payments")).toHaveLength(1);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      id: startedBody.orderId,
      payment_status: "succeeded",
      status: "paid",
      inventory_reserved: true,
    });
    expect(db.rowsOf("payments")[0].status).toBe("succeeded");
    expect(reserves(db)).toHaveLength(1);
    expect(paidOrderWrites(db)).toHaveLength(1);
    expect(paidPaymentWrites(db)).toHaveLength(1);
    expect(sendOrderEmails).toHaveBeenCalledTimes(1);
  });

  it("claims the order when the payment row is already succeeded and payment_status is null", async () => {
    const started = await checkout(checkoutRequest({ idempotencyKey: KEY_A }));
    expect(started.status).toBe(200);
    const startedBody = await started.json();
    db.rowsOf("orders")[0].payment_status = null;
    db.rowsOf("payments")[0].status = "succeeded";
    vi.mocked(sendOrderEmails).mockClear();

    const delivered = await webhook(
      signedWebhook({
        id: "evt_order_after_payment",
        name: "payment_intent.succeeded",
        created_at: new Date().toISOString(),
        data: {
          object: {
            id: "int_same",
            status: "SUCCEEDED",
            amount: 115,
            currency: "USD",
            merchant_order_id: startedBody.orderId,
          },
        },
      })
    );
    expect(delivered.status).toBe(200);
    await expect(delivered.json()).resolves.toEqual({ received: true });
    expect(db.rowsOf("orders")[0]).toMatchObject({
      payment_status: "succeeded",
      status: "paid",
    });
    expect(sendOrderEmails).toHaveBeenCalledTimes(1);
    expect(reserves(db)).toHaveLength(1);
    expect(db.rowsOf("payments")).toHaveLength(1);

    const repeat = await webhook(
      signedWebhook({
        id: "evt_order_after_payment_repeat",
        name: "payment_intent.succeeded",
        created_at: new Date().toISOString(),
        data: {
          object: {
            id: "int_same",
            status: "SUCCEEDED",
            amount: 115,
            currency: "USD",
            merchant_order_id: startedBody.orderId,
          },
        },
      })
    );
    expect(repeat.status).toBe(200);
    expect(sendOrderEmails).toHaveBeenCalledTimes(1);
    expect(paidOrderWrites(db)).toHaveLength(1);
  });

  it("recovers a paid order when the payment write fails after the order claim", async () => {
    const started = await checkout(checkoutRequest({ idempotencyKey: KEY_A }));
    expect(started.status).toBe(200);
    const startedBody = await started.json();
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue({
      id: "int_same",
      request_id: KEY_A,
      status: "SUCCEEDED",
      amount: 115,
      currency: "USD",
      merchant_order_id: startedBody.orderId,
    });

    let failedPaymentWrite = false;
    db.failWhen = (table, op) => {
      if (!failedPaymentWrite && table === "payments" && op === "update") {
        failedPaymentWrite = true;
        return dbError("payment claim failed", "XX000");
      }
      return null;
    };

    const first = await verify(
      verifyRequest({ orderId: startedBody.orderId, paymentIntentId: "int_same" })
    );
    expect(first.status).toBe(500);
    expect(db.rowsOf("orders")[0].payment_status).toBe("succeeded");
    expect(db.rowsOf("payments")[0].status).not.toBe("succeeded");
    expect(sendOrderEmails).not.toHaveBeenCalled();
    expect(reserves(db)).toHaveLength(1);

    db.failWhen = null;
    const retry = await verify(
      verifyRequest({ orderId: startedBody.orderId, paymentIntentId: "int_same" })
    );
    expect(retry.status).toBe(200);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      payment_status: "succeeded",
      status: "paid",
      inventory_reserved: true,
    });
    expect(db.rowsOf("payments")[0].status).toBe("succeeded");
    expect(sendOrderEmails).toHaveBeenCalledTimes(1);
    expect(reserves(db)).toHaveLength(1);
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(paidOrderWrites(db)).toHaveLength(1);
  });

  it("does not downgrade a claimed order when a late webhook repeats the unpaid status", async () => {
    const started = await checkout(checkoutRequest({ idempotencyKey: KEY_A }));
    expect(started.status).toBe(200);
    const startedBody = await started.json();
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue({
      id: "int_same",
      request_id: KEY_A,
      status: "SUCCEEDED",
      amount: 115,
      currency: "USD",
      merchant_order_id: startedBody.orderId,
    });

    let failedPaymentWrite = false;
    db.failWhen = (table, op) => {
      if (!failedPaymentWrite && table === "payments" && op === "update") {
        failedPaymentWrite = true;
        return dbError("payment claim failed", "XX000");
      }
      return null;
    };
    const claimed = await verify(
      verifyRequest({ orderId: startedBody.orderId, paymentIntentId: "int_same" })
    );
    expect(claimed.status).toBe(500);
    expect(db.rowsOf("orders")[0].payment_status).toBe("succeeded");
    expect(db.rowsOf("payments")[0].status).toBe("requires_payment_method");
    db.failWhen = null;

    const late = await webhook(
      signedWebhook({
        id: "evt_late_same_status",
        name: "payment_intent.requires_payment_method",
        created_at: new Date().toISOString(),
        data: {
          object: {
            id: "int_same",
            request_id: KEY_A,
            status: "REQUIRES_PAYMENT_METHOD",
            amount: 115,
            currency: "USD",
            merchant_order_id: startedBody.orderId,
          },
        },
      })
    );
    expect(late.status).toBe(200);
    await expect(late.json()).resolves.toEqual({ received: true });
    expect(db.rowsOf("orders")[0]).toMatchObject({
      payment_status: "succeeded",
      status: "paid",
      fulfillment_status: "paid",
      inventory_reserved: true,
    });
    expect(db.rowsOf("payments")[0].status).toBe("succeeded");
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(reserves(db)).toHaveLength(1);
    expect(db.rpcCalls.filter((call) => call.fn === "restore_order_inventory")).toHaveLength(0);
  });

  it("does not reuse another customer's payment intent or idempotency key", async () => {
    vi.mocked(createAirwallexPaymentIntent).mockImplementation(async (input) => ({
      id: `int_${input.requestId}`,
      request_id: input.requestId,
      status: "REQUIRES_PAYMENT_METHOD",
      amount: input.amount,
      currency: input.currency,
      client_secret: `secret_${input.requestId}`,
      merchant_order_id: input.merchantOrderId,
    }));

    const first = await checkout(checkoutRequest({ idempotencyKey: KEY_A }));
    expect(first.status).toBe(200);
    const firstBody = await first.json();

    const other = await checkout(
      checkoutRequest({
        idempotencyKey: KEY_A,
        paymentIntentId: firstBody.intentId,
        customer: { ...checkoutCustomer, email: "other@example.com" },
      })
    );
    expect(other.status).toBe(200);
    const otherBody = await other.json();
    expect(otherBody.orderId).not.toBe(firstBody.orderId);
    expect(otherBody.clientSecret).not.toBe(firstBody.clientSecret);
    expect(otherBody.intentId).not.toBe(firstBody.intentId);
    expect(JSON.stringify(otherBody)).not.toContain(firstBody.clientSecret);
    expect(JSON.stringify(otherBody)).not.toContain(firstBody.orderId);
    expect(db.rowsOf("orders")).toHaveLength(2);
    expect(db.rowsOf("payments").map((row) => row.order_id).sort()).toEqual(
      [firstBody.orderId, otherBody.orderId].sort()
    );

    const same = await checkout(
      checkoutRequest({
        idempotencyKey: KEY_A,
        paymentIntentId: firstBody.intentId,
      })
    );
    expect(same.status).toBe(200);
    const sameBody = await same.json();
    expect(sameBody.orderId).toBe(firstBody.orderId);
    expect(sameBody.clientSecret).toBe(firstBody.clientSecret);
    expect(sameBody.intentId).toBe(firstBody.intentId);
    expect(db.rowsOf("orders")).toHaveLength(2);
  });

  it("does not mark an already paid order failed when a later checkout update throws", async () => {
    vi.mocked(createAirwallexPaymentIntent).mockImplementation(async (input) => ({
      id: "int_paid",
      request_id: input.requestId,
      status: "REQUIRES_PAYMENT_METHOD",
      amount: input.amount,
      currency: input.currency,
      client_secret: "secret_paid",
      merchant_order_id: input.merchantOrderId,
    }));

    const first = await checkout(checkoutRequest({ idempotencyKey: KEY_A }));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    db.rowsOf("orders")[0].payment_status = "succeeded";
    db.rowsOf("orders")[0].status = "paid";
    db.rowsOf("orders")[0].fulfillment_status = "paid";
    db.rowsOf("payments")[0].status = "succeeded";

    let failedReferenceUpdate = false;
    db.failWhen = (table, op) => {
      if (!failedReferenceUpdate && table === "orders" && op === "update") {
        failedReferenceUpdate = true;
        return dbError("reference update failed", "XX000");
      }
      return null;
    };

    const second = await checkout(checkoutRequest({ idempotencyKey: KEY_B }));
    expect(second.status).toBe(500);
    expect(db.rowsOf("orders").find((row) => row.id === firstBody.orderId)).toMatchObject({
      payment_status: "succeeded",
      status: "paid",
      fulfillment_status: "paid",
    });
  });

  it("does not overwrite a succeeded payment row from a non-success status", async () => {
    db.seed("orders", [
      {
        id: "order-paid",
        status: "paid",
        payment_provider: "airwallex",
        payment_status: "succeeded",
        fulfillment_status: "paid",
        inventory_reserved: true,
        total_amount: 115,
        currency: "USD",
      },
    ]);
    db.seed("order_items", [
      {
        id: "item-paid",
        order_id: "order-paid",
        product_id: "prod-amethyst",
        variant_id: null,
        quantity: 1,
        product_name: "Amethyst Bracelet XV (5mm)",
        price_at_purchase: 100,
      },
    ]);
    db.seed("payments", [
      {
        id: "pay-paid",
        order_id: "order-paid",
        provider: "airwallex",
        provider_payment_intent_id: "int_paid_row",
        provider_request_id: "req-paid",
        status: "requires_payment_method",
        paid_at: "2026-01-01T00:00:00.000Z",
        amount: 115,
        currency: "USD",
      },
    ]);
    db.failWhen = (table, op) => {
      if (table === "orders" && op === "select") {
        const payment = db.rowsOf("payments").find((row) => row.id === "pay-paid");
        if (payment) payment.status = "succeeded";
      }
      return null;
    };

    await applyAirwallexPaymentIntentStatus(db as never, {
      paymentIntentId: "int_paid_row",
      nextStatus: "requires_payment_method",
    });

    const payment = db.rowsOf("payments").find((row) => row.id === "pay-paid");
    expect(payment).toMatchObject({
      status: "succeeded",
      paid_at: "2026-01-01T00:00:00.000Z",
    });
    expect(db.rowsOf("orders").find((row) => row.id === "order-paid")).toMatchObject({
      payment_status: "succeeded",
      status: "paid",
    });
    expect(db.rpcCalls.filter((call) => call.fn === "restore_order_inventory")).toHaveLength(0);
    expect(
      db.writes.filter(
        (write) =>
          write.table === "payments" &&
          write.op === "update" &&
          write.matched === 1 &&
          write.payload != null &&
          !Array.isArray(write.payload) &&
          write.payload.paid_at === null
      )
    ).toHaveLength(0);
  });
});
