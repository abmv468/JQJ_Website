import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST as postCard } from "@/app/api/checkout/airwallex/route";
import { POST as postCod } from "@/app/api/checkout/cod/route";
import { POST as postVerify } from "@/app/api/checkout/airwallex/verify/route";
import {
  CARD_PAYMENTS_UNAVAILABLE_MESSAGE,
  createAirwallexPaymentIntent,
  isCardPaymentsEnabled,
  retrieveAirwallexPaymentIntent,
} from "@/lib/payments/airwallex";
import {
  checkoutCustomer,
  checkoutItem,
  createCheckoutDb,
  setActiveDb,
  type MemoryDb,
} from "../helpers/memory-db";

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

const UNAVAILABLE =
  "Card payments are temporarily unavailable — please choose cash on delivery or try again later.";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

function cardRequest(body: unknown) {
  return new Request("http://localhost:3000/api/checkout/airwallex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function codRequest(body: unknown) {
  return new Request("http://localhost:3000/api/checkout/cod", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setCardFlag(value: "unset" | "true" | "false" | "FALSE") {
  if (value === "unset") delete process.env.CARD_PAYMENTS_ENABLED;
  else process.env.CARD_PAYMENTS_ENABLED = value;
}

describe("CARD_PAYMENTS_ENABLED", () => {
  let db: MemoryDb;

  beforeEach(() => {
    delete process.env.CARD_PAYMENTS_ENABLED;
    delete process.env.RESEND_API_KEY;
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
    vi.mocked(retrieveAirwallexPaymentIntent).mockReset();
  });

  afterEach(() => {
    delete process.env.CARD_PAYMENTS_ENABLED;
  });

  it("keeps the shared unavailable copy exact", () => {
    expect(CARD_PAYMENTS_UNAVAILABLE_MESSAGE).toBe(UNAVAILABLE);
  });

  it("is enabled unless the env var is exactly false", () => {
    setCardFlag("unset");
    expect(isCardPaymentsEnabled()).toBe(true);
    setCardFlag("true");
    expect(isCardPaymentsEnabled()).toBe(true);
    setCardFlag("FALSE");
    expect(isCardPaymentsEnabled()).toBe(true);
    setCardFlag("false");
    expect(isCardPaymentsEnabled()).toBe(false);
  });

  it.each(["unset", "true"] as const)(
    "creates a card payment when CARD_PAYMENTS_ENABLED is %s",
    async (flag) => {
      setCardFlag(flag);
      const response = await postCard(
        cardRequest({
          items: [checkoutItem()],
          customer: checkoutCustomer,
          currency: "USD",
          idempotencyKey: REQUEST_ID,
        })
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        intentId: "int_test",
        clientSecret: "secret_test",
        currency: "USD",
      });
      expect(db.rowsOf("orders")).toHaveLength(1);
      expect(db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory")).toHaveLength(1);
      expect(createAirwallexPaymentIntent).toHaveBeenCalledTimes(1);
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it("returns 503 before parsing, inserting, reserving, or calling Airwallex when the flag is false", async () => {
    setCardFlag("false");

    const invalid = await postCard(
      new Request("http://localhost:3000/api/checkout/airwallex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    );
    expect(invalid.status).toBe(503);
    expect(invalid.headers.get("cache-control")).toContain("no-store");
    await expect(invalid.json()).resolves.toEqual({ error: UNAVAILABLE });

    const valid = await postCard(
      cardRequest({
        items: [checkoutItem()],
        customer: checkoutCustomer,
        currency: "USD",
        idempotencyKey: REQUEST_ID,
      })
    );
    expect(valid.status).toBe(503);
    await expect(valid.json()).resolves.toEqual({ error: UNAVAILABLE });

    expect(db.rowsOf("orders")).toHaveLength(0);
    expect(db.rowsOf("order_items")).toHaveLength(0);
    expect(db.rowsOf("payments")).toHaveLength(0);
    expect(db.rowsOf("payment_webhook_events")).toHaveLength(0);
    expect(db.rowsOf("products")[0].stock_count).toBe(5);
    expect(db.rpcCalls).toHaveLength(0);
    expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
    expect(retrieveAirwallexPaymentIntent).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["unset", true],
    ["true", true],
    ["false", false],
  ] as const)("GET reports cardEnabled when the flag is %s", async (flag, cardEnabled) => {
    setCardFlag(flag);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ cardEnabled });
    expect(db.rowsOf("orders")).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);
    expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["unset", "false"] as const)(
    "still accepts cash on delivery when CARD_PAYMENTS_ENABLED is %s",
    async (flag) => {
      setCardFlag(flag);
      const response = await postCod(
        codRequest({
          items: [checkoutItem()],
          customer: checkoutCustomer,
          currency: "USD",
          idempotencyKey: "cod-flag-1",
        })
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.orderId).toEqual(expect.any(String));
      expect(db.rowsOf("orders")).toHaveLength(1);
      expect(db.rowsOf("orders")[0]).toMatchObject({ payment_provider: "cod" });
      expect(db.rpcCalls.filter((call) => call.fn === "reserve_order_inventory")).toHaveLength(1);
      expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it("still verifies an existing card order when creation is disabled", async () => {
    setCardFlag("false");
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
        provider_payment_intent_id: "int_order-1",
        provider_request_id: "req_order-1",
        status: "requires_payment_method",
        amount: 115,
        currency: "USD",
      },
    ]);
    vi.mocked(retrieveAirwallexPaymentIntent).mockResolvedValue({
      id: "int_order-1",
      status: "SUCCEEDED",
      amount: 115,
      currency: "USD",
    });

    const response = await postVerify(
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
    expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
    expect(retrieveAirwallexPaymentIntent).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
