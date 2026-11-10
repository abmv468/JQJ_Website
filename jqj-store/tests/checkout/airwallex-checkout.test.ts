import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/checkout/airwallex/route";
import { createAirwallexPaymentIntent } from "@/lib/payments/airwallex";
import {
  checkoutCustomer,
  checkoutItem,
  createCheckoutDb,
  setActiveDb,
  type MemoryDb,
} from "../helpers/memory-db";
import { quoteCheckout } from "../shared/checkout-expectations";

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

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

function request(body: unknown) {
  return new Request("http://localhost:3000/api/checkout/airwallex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/checkout/airwallex", () => {
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
  });

  it("rejects an empty cart and a non-USD charge before touching stock", async () => {
    const empty = await POST(request({ items: [], customer: checkoutCustomer }));
    expect(empty.status).toBe(400);

    const eur = await POST(
      request({ items: [checkoutItem()], customer: checkoutCustomer, currency: "EUR" })
    );
    expect(eur.status).toBe(400);
    expect(db.rowsOf("orders")).toHaveLength(0);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
  });

  it("rejects short stock without reserving or calling Airwallex", async () => {
    const response = await POST(
      request({
        items: [checkoutItem({ quantity: 6 })],
        customer: checkoutCustomer,
        idempotencyKey: REQUEST_ID,
      })
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/left|out of stock|Insufficient/);
    expect(db.rowsOf("orders")).toHaveLength(0);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rpcCalls).toHaveLength(0);
    expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
  });

  it("reserves server-priced stock and returns a sandbox payment intent", async () => {
    const response = await POST(
      request({
        items: [checkoutItem({ price: 1, quantity: 2 })],
        customer: checkoutCustomer,
        currency: "USD",
        idempotencyKey: REQUEST_ID,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const quote = quoteCheckout(
      [{ unitPriceUsd: Number(db.rowsOf("products")[0].price), quantity: 2 }],
      "airwallex"
    );
    expect(body).toMatchObject({
      intentId: "int_test",
      clientSecret: "secret_test",
      currency: "USD",
      sdkEnv: "demo",
      countryCode: "US",
    });
    expect(body.orderId).toEqual(expect.any(String));
    expect(db.rowsOf("products")[0].stock_count).toBe(3);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      inventory_reserved: true,
      total_amount: quote.total,
      subtotal_amount: quote.subtotal,
      shipping_amount: quote.shipping,
      payment_provider: "airwallex",
      currency: "USD",
    });
    expect(db.rowsOf("order_items")[0]).toMatchObject({
      quantity: 2,
      price_at_purchase: 100,
    });
    expect(db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory")).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("restores the reservation when Airwallex fails and does not restore it twice", async () => {
    vi.mocked(createAirwallexPaymentIntent).mockRejectedValue(new Error("Airwallex unavailable"));

    const response = await POST(
      request({
        items: [checkoutItem()],
        customer: checkoutCustomer,
        idempotencyKey: REQUEST_ID,
      })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "Airwallex unavailable" });
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "failed",
      payment_status: "failed",
      inventory_reserved: false,
    });
    expect(db.rpcCalls.filter((call) => call.fn === "restore_order_inventory")).toHaveLength(1);

    await POST(
      request({
        items: [checkoutItem()],
        customer: checkoutCustomer,
        idempotencyKey: REQUEST_ID,
      })
    );
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
  });
});
