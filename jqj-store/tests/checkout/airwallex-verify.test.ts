import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/checkout/airwallex/verify/route";
import { retrieveAirwallexPaymentIntent } from "@/lib/payments/airwallex";
import { createCheckoutDb, setActiveDb, type MemoryDb } from "../helpers/memory-db";

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

function verifyRequest(body: unknown) {
  return new Request("http://localhost:3000/api/checkout/airwallex/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function seedPayableOrder(db: MemoryDb, orderId = "order-1") {
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

describe("POST /api/checkout/airwallex/verify", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("unexpected network call");
      })
    );
    vi.mocked(retrieveAirwallexPaymentIntent).mockReset();
  });

  it("confirms a successful return and keeps the reserved stock", async () => {
    seedPayableOrder(db);
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue({
      id: "int_order-1",
      status: "SUCCEEDED",
      amount: 115,
      currency: "USD",
    });

    const response = await POST(verifyRequest({ orderId: "order-1", refresh: true }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      orderId: "order-1",
      succeeded: true,
      failed: false,
      pending: false,
      paymentStatus: "succeeded",
      inventoryReserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
    expect(db.rowsOf("orders")[0].confirmation_email_sent_at).toEqual(expect.any(String));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("follows a remote failure that disagrees with the stored pending status and restores stock once", async () => {
    seedPayableOrder(db);
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue({
      id: "int_order-1",
      status: "FAILED",
      amount: 115,
      currency: "USD",
    });

    const first = await POST(verifyRequest({ orderId: "order-1" }));
    expect(first.status).toBe(402);
    await expect(first.json()).resolves.toMatchObject({
      succeeded: false,
      failed: true,
      paymentStatus: "failed",
      inventoryReserved: false,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(5);

    const second = await POST(verifyRequest({ orderId: "order-1" }));
    expect(second.status).toBe(402);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rpcCalls.filter((call) => call.fn === "restore_order_inventory")).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("treats a cancelled return as a failed payment and restores stock", async () => {
    seedPayableOrder(db);
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue({
      id: "int_order-1",
      status: "CANCELLED",
      amount: 115,
      currency: "USD",
    });

    const response = await POST(verifyRequest({ orderId: "order-1" }));
    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      failed: true,
      paymentStatus: "cancelled",
      inventoryReserved: false,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
  });

  it("leaves stock reserved while Airwallex still requires a payment method", async () => {
    seedPayableOrder(db);
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue({
      id: "int_order-1",
      status: "REQUIRES_PAYMENT_METHOD",
      amount: 115,
      currency: "USD",
    });

    const response = await POST(verifyRequest({ orderId: "order-1" }));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      pending: true,
      failed: false,
      succeeded: false,
      paymentStatus: "requires_payment_method",
      inventoryReserved: true,
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
  });

  it("rejects a missing id, an unknown order, a non-Airwallex order, and invalid JSON", async () => {
    const missing = await POST(verifyRequest({}));
    expect(missing.status).toBe(400);

    const unknown = await POST(verifyRequest({ orderId: "missing-order" }));
    expect(unknown.status).toBe(500);
    expect(retrieveAirwallexPaymentIntent).not.toHaveBeenCalled();

    db.seed("orders", [
      {
        id: "cod-order",
        status: "pending",
        payment_provider: "cod",
        payment_status: "pending",
        total_amount: 135,
      },
    ]);
    const cod = await POST(verifyRequest({ orderId: "cod-order" }));
    expect(cod.status).toBe(404);

    const invalid = await POST(
      new Request("http://localhost:3000/api/checkout/airwallex/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    );
    expect(invalid.status).toBe(500);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
  });

  it("does not change a different order when verifying one return", async () => {
    seedPayableOrder(db, "order-a");
    seedPayableOrder(db, "order-b");
    vi.mocked(retrieveAirwallexPaymentIntent).mockImplementation(async (id) => ({
      id,
      status: id === "int_order-a" ? "SUCCEEDED" : "REQUIRES_PAYMENT_METHOD",
      amount: 115,
      currency: "USD",
    }));

    const response = await POST(verifyRequest({ orderId: "order-a" }));
    expect(response.status).toBe(200);
    expect(db.rowsOf("orders").find((row) => row.id === "order-b")?.payment_status).toBe(
      "requires_payment_method"
    );
    expect(db.rowsOf("products")[0].stock_count).toBe(4);
  });

  it("accepts a payment intent only with its own order id", async () => {
    seedPayableOrder(db, "order-a");
    seedPayableOrder(db, "order-b");
    vi.mocked(retrieveAirwallexPaymentIntent).mockImplementation(async (id) => ({
      id,
      status: "REQUIRES_PAYMENT_METHOD",
      amount: 115,
      currency: "USD",
    }));

    const intentOnly = await POST(verifyRequest({ paymentIntentId: "int_order-a" }));
    expect(intentOnly.status).toBe(400);

    const crossed = await POST(
      verifyRequest({ orderId: "order-b", paymentIntentId: "int_order-a" })
    );
    expect(crossed.status).toBe(404);
    expect(db.rowsOf("orders").map((row) => row.payment_status)).toEqual([
      "requires_payment_method",
      "requires_payment_method",
    ]);
    expect(retrieveAirwallexPaymentIntent).not.toHaveBeenCalled();

    const matched = await POST(
      verifyRequest({ orderId: "order-a", paymentIntentId: "int_order-a" })
    );
    expect(matched.status).toBe(202);
    expect(db.rowsOf("orders").find((row) => row.id === "order-b")?.payment_status).toBe(
      "requires_payment_method"
    );
  });
});
