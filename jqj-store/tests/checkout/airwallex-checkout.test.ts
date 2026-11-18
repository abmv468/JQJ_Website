import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/checkout/airwallex/route";
import { PAYMENT_TEST_SLUG } from "@/data/products";
import { createAirwallexPaymentIntent } from "@/lib/payments/airwallex";
import { computeShippingUsd } from "@/lib/shipping";
import {
  checkoutCustomer,
  checkoutItem,
  createCheckoutDb,
  setActiveDb,
  type MemoryDb,
} from "../helpers/memory-db";
import { quoteCheckout } from "../shared/checkout-expectations";

vi.mock("@/lib/payments/airwallex", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/payments/airwallex")
  >("@/lib/payments/airwallex");
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
      }),
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
    const empty = await POST(
      request({ items: [], customer: checkoutCustomer }),
    );
    expect(empty.status).toBe(400);

    const eur = await POST(
      request({
        items: [checkoutItem()],
        customer: checkoutCustomer,
        currency: "EUR",
      }),
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
      }),
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
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const quote = quoteCheckout(
      [{ unitPriceUsd: Number(db.rowsOf("products")[0].price), quantity: 2 }],
      "airwallex",
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
    expect(
      db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory"),
    ).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("restores the reservation when Airwallex fails and does not restore it twice", async () => {
    vi.mocked(createAirwallexPaymentIntent).mockRejectedValue(
      new Error("Airwallex unavailable"),
    );

    const response = await POST(
      request({
        items: [checkoutItem()],
        customer: checkoutCustomer,
        idempotencyKey: REQUEST_ID,
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: "Airwallex unavailable",
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "failed",
      payment_status: "failed",
      inventory_reserved: false,
    });
    expect(
      db.rpcCalls.filter((call) => call.fn === "restore_order_inventory"),
    ).toHaveLength(1);

    await POST(
      request({
        items: [checkoutItem()],
        customer: checkoutCustomer,
        idempotencyKey: REQUEST_ID,
      }),
    );
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
  });

  it.each([{ usd: 249.99 }, { usd: 250 }, { usd: 499.98 }])(
    "sends Airwallex subtotal + helper shipping for a USD $usd catalog price and ignores the client total",
    async ({ usd }) => {
      db.rowsOf("products")[0].price = usd;
      const shipping = computeShippingUsd([{ unitPriceUsd: usd, quantity: 1 }]);

      const response = await POST(
        request({
          items: [checkoutItem({ price: 1, quantity: 1 })],
          customer: checkoutCustomer,
          currency: "USD",
          shipping: 0,
          total: 1,
          idempotencyKey: REQUEST_ID,
        }),
      );

      expect(response.status).toBe(200);
      expect(shipping).toBe(usd >= 250 ? 0 : 15);
      const amount = usd + shipping;
      expect(createAirwallexPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({ amount, currency: "USD" }),
      );
      expect(db.rowsOf("orders")[0]).toMatchObject({
        subtotal_amount: usd,
        shipping_amount: shipping,
        total_amount: amount,
        currency: "USD",
      });
    },
  );

  it("returns 409 instead of continuing a reused unpaid order that fails current validation", async () => {
    db.seed("products", [
      {
        id: PAYMENT_TEST_SLUG,
        slug: PAYMENT_TEST_SLUG,
        name: "Payment test — do not ship",
        price: 1,
        stock_count: 8,
        in_stock: true,
        low_stock_threshold: 1,
        sku: "JQJ-PAYTEST-001",
      },
    ]);
    db.seed("orders", [
      {
        id: "order-paytest",
        status: "pending",
        payment_provider: "airwallex",
        payment_status: "requires_payment_method",
        fulfillment_status: "pending_payment",
        inventory_reserved: false,
        total_amount: 16,
        subtotal_amount: 1,
        shipping_amount: 15,
        currency: "USD",
        customer_email: checkoutCustomer.email,
        customer_name: "Ada Lovelace",
        payment_reference: "int_old",
      },
    ]);
    db.seed("order_items", [
      {
        id: "item-paytest",
        order_id: "order-paytest",
        product_id: PAYMENT_TEST_SLUG,
        variant_id: null,
        quantity: 1,
        product_name: "Payment test — do not ship",
        price_at_purchase: 1,
      },
    ]);
    db.seed("payments", [
      {
        id: "pay-paytest",
        order_id: "order-paytest",
        provider: "airwallex",
        provider_payment_intent_id: "int_old",
        provider_request_id: REQUEST_ID,
        status: "requires_payment_method",
        amount: 16,
        currency: "USD",
      },
    ]);

    const response = await POST(
      request({
        items: [
          checkoutItem({
            id: PAYMENT_TEST_SLUG,
            slug: PAYMENT_TEST_SLUG,
            name: "Payment test — do not ship",
            price: 1,
            quantity: 1,
            sku: "JQJ-PAYTEST-001",
          }),
        ],
        customer: checkoutCustomer,
        idempotencyKey: REQUEST_ID,
        paymentIntentId: "int_old",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Product "Payment test — do not ship" is unavailable.',
    });
    expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      id: "order-paytest",
      status: "pending",
      payment_status: "requires_payment_method",
      payment_reference: "int_old",
      inventory_reserved: false,
    });
    expect(
      db.rowsOf("products").find((row) => row.slug === PAYMENT_TEST_SLUG),
    ).toMatchObject({ stock_count: 8, in_stock: true });
    expect(db.rowsOf("payments")).toHaveLength(1);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("returns 409 instead of continuing a reused unpaid order that is out of stock", async () => {
    db.rowsOf("products")[0].stock_count = 0;
    db.rowsOf("products")[0].in_stock = false;
    db.seed("orders", [
      {
        id: "order-short",
        status: "pending",
        payment_provider: "airwallex",
        payment_status: "requires_payment_method",
        fulfillment_status: "pending_payment",
        inventory_reserved: false,
        total_amount: 115,
        currency: "USD",
        customer_email: checkoutCustomer.email,
        payment_reference: "int_short",
      },
    ]);
    db.seed("order_items", [
      {
        id: "item-short",
        order_id: "order-short",
        product_id: "prod-amethyst",
        variant_id: null,
        quantity: 1,
        product_name: "Amethyst Bracelet XV (5mm)",
        price_at_purchase: 100,
      },
    ]);
    db.seed("payments", [
      {
        id: "pay-short",
        order_id: "order-short",
        provider: "airwallex",
        provider_payment_intent_id: "int_short",
        provider_request_id: REQUEST_ID,
        status: "requires_payment_method",
        amount: 115,
        currency: "USD",
      },
    ]);

    const response = await POST(
      request({
        items: [checkoutItem()],
        customer: checkoutCustomer,
        idempotencyKey: REQUEST_ID,
        paymentIntentId: "int_short",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: '"Amethyst Bracelet XV (5mm)" is out of stock.',
    });
    expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      id: "order-short",
      payment_status: "requires_payment_method",
      payment_reference: "int_short",
    });
    expect(db.rowsOf("products")[0].stock_count).toBe(0);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("still reports an already-paid reused order when current validation fails", async () => {
    db.seed("products", [
      {
        id: PAYMENT_TEST_SLUG,
        slug: PAYMENT_TEST_SLUG,
        name: "Payment test — do not ship",
        price: 1,
        stock_count: 8,
        in_stock: true,
        low_stock_threshold: 1,
        sku: "JQJ-PAYTEST-001",
      },
    ]);
    db.seed("orders", [
      {
        id: "order-paid-paytest",
        status: "paid",
        payment_provider: "airwallex",
        payment_status: "succeeded",
        fulfillment_status: "paid",
        inventory_reserved: true,
        total_amount: 16,
        currency: "USD",
        customer_email: checkoutCustomer.email,
      },
    ]);
    db.seed("order_items", [
      {
        id: "item-paid-paytest",
        order_id: "order-paid-paytest",
        product_id: PAYMENT_TEST_SLUG,
        variant_id: null,
        quantity: 1,
        product_name: "Payment test — do not ship",
        price_at_purchase: 1,
      },
    ]);
    db.seed("payments", [
      {
        id: "pay-paid-paytest",
        order_id: "order-paid-paytest",
        provider: "airwallex",
        provider_payment_intent_id: "int_paid_old",
        provider_request_id: REQUEST_ID,
        status: "succeeded",
        amount: 16,
        currency: "USD",
      },
    ]);

    const response = await POST(
      request({
        items: [
          checkoutItem({
            id: PAYMENT_TEST_SLUG,
            slug: PAYMENT_TEST_SLUG,
            name: "Payment test — do not ship",
            price: 1,
            quantity: 1,
          }),
        ],
        customer: checkoutCustomer,
        idempotencyKey: REQUEST_ID,
        paymentIntentId: "int_paid_old",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      orderId: "order-paid-paytest",
      intentId: "int_paid_old",
      alreadyPaid: true,
    });
    expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
    expect(db.rowsOf("orders")).toHaveLength(1);
    expect(db.rowsOf("orders")[0]).toMatchObject({
      status: "paid",
      payment_status: "succeeded",
    });
  });
});
