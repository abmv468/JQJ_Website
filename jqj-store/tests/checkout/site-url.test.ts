import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postAirwallex } from "@/app/api/checkout/airwallex/route";
import { POST as postStripe } from "@/app/api/checkout/route";
import { createAirwallexPaymentIntent } from "@/lib/payments/airwallex";
import { getStripe } from "@/lib/stripe";
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

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(() => {
    throw new Error("Stripe SDK should not be called without a site URL");
  }),
}));

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

function airwallexRequest() {
  return new Request("http://localhost:3000/api/checkout/airwallex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [checkoutItem()],
      customer: checkoutCustomer,
      currency: "USD",
      idempotencyKey: REQUEST_ID,
    }),
  });
}

describe("checkout site URL", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
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
    vi.mocked(getStripe).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 500 in production when NEXT_PUBLIC_SITE_URL is missing and never builds a localhost URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");

    const response = await postAirwallex(airwallexRequest());
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(500);
    expect(body.error).toBe("Something went wrong. Please try again.");
    expect(body.reference).toMatch(/^[0-9a-f]{8}$/);
    expect(serialized.toLowerCase()).not.toContain("localhost");
    expect(serialized).not.toContain("127.0.0.1");
    expect(serialized).not.toContain("NEXT_PUBLIC_SITE_URL");
    expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
    expect(db.rowsOf("orders")).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);

    const stripeResponse = await postStripe(airwallexRequest());
    const stripeBody = await stripeResponse.json();
    expect(stripeResponse.status).toBe(500);
    expect(JSON.stringify(stripeBody).toLowerCase()).not.toContain("localhost");
    expect(getStripe).not.toHaveBeenCalled();
    expect(db.rowsOf("orders")).toHaveLength(0);
  });

  it("rejects a localhost site URL in production before creating a payment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");

    const response = await postAirwallex(airwallexRequest());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json()).toLowerCase()).not.toContain("localhost");
    expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
    expect(db.rowsOf("orders")).toHaveLength(0);
  });

  it("falls back to localhost outside production when the site URL is missing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");

    const response = await postAirwallex(airwallexRequest());
    expect(response.status).toBe(200);
    expect(createAirwallexPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        returnUrl: expect.stringMatching(
          /^http:\/\/localhost:3000\/order-confirmation\?provider=airwallex&order_id=/
        ),
      })
    );
  });
});
