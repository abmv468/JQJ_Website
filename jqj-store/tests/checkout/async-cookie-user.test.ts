import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { POST as postStripeCheckout } from "@/app/api/checkout/route";
import { POST as postCodCheckout } from "@/app/api/checkout/cod/route";
import { POST as postStripeVerify } from "@/app/api/checkout/verify/route";
import { POST as postAirwallexCheckout } from "@/app/api/checkout/airwallex/route";
import { createAirwallexPaymentIntent } from "@/lib/payments/airwallex";
import {
  checkoutCustomer,
  checkoutItem,
  createCheckoutDb,
  setActiveDb,
  type MemoryDb,
} from "../helpers/memory-db";

const USER_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_COOKIE = { name: "sb-access-token", value: "session" };
const stripeSessions = vi.hoisted(() => ({
  create: vi.fn(async () => ({ url: "https://checkout.stripe.test/cs_async" })),
  retrieve: vi.fn(),
}));

/**
 * The shared setup mock returns an empty cookie jar and a signed-out user.
 * This file replaces those with an async jar and a client that only resolves
 * a user after reading that jar, so a missing `await cookies()` fails here.
 */
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: vi.fn(() => [SESSION_COOKIE]),
    set: () => undefined,
  })),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(
    (
      _url: string,
      _key: string,
      options: { cookies: { getAll: () => Array<{ name: string; value: string }> } }
    ) => ({
      auth: {
        getUser: async () => {
          const all = options.cookies.getAll();
          const signedIn = all.some(
            (cookie) => cookie.name === SESSION_COOKIE.name && cookie.value === SESSION_COOKIE.value
          );
          return {
            data: { user: signedIn ? { id: USER_ID } : null },
            error: null,
          };
        },
      },
    })
  ),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: {
      sessions: stripeSessions,
    },
  }),
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

function request(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("checkout routes read the user from the async cookie store", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    delete process.env.RESEND_API_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    vi.mocked(cookies).mockClear();
    vi.mocked(createServerClient).mockClear();
    stripeSessions.create.mockClear();
    stripeSessions.retrieve.mockReset();
    vi.mocked(createAirwallexPaymentIntent).mockReset();
    vi.mocked(createAirwallexPaymentIntent).mockResolvedValue({
      id: "int_async_cookie",
      request_id: "33333333-3333-4333-8333-333333333333",
      status: "REQUIRES_PAYMENT_METHOD",
      amount: 115,
      currency: "USD",
      client_secret: "secret_async",
      merchant_order_id: "order",
    });
  });

  it("stores the cookie user on a COD order", async () => {
    const response = await postCodCheckout(
      request("http://localhost:3000/api/checkout/cod", {
        items: [checkoutItem()],
        customer: checkoutCustomer,
        currency: "USD",
        idempotencyKey: "cod-async-cookie",
      })
    );

    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0].user_id).toBe(USER_ID);
    expect(vi.mocked(cookies).mock.results[0]?.value).toBeInstanceOf(Promise);
    expect(vi.mocked(createServerClient)).toHaveBeenCalled();
  });

  it("stores the cookie user on an Airwallex order", async () => {
    const response = await postAirwallexCheckout(
      request("http://localhost:3000/api/checkout/airwallex", {
        items: [checkoutItem()],
        customer: checkoutCustomer,
        currency: "USD",
        idempotencyKey: "33333333-3333-4333-8333-333333333333",
      })
    );

    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0].user_id).toBe(USER_ID);
    expect(vi.mocked(cookies).mock.results[0]?.value).toBeInstanceOf(Promise);
  });

  it("puts the cookie user on the Stripe Checkout session", async () => {
    const response = await postStripeCheckout(
      request("http://localhost:3000/api/checkout", {
        items: [checkoutItem()],
        customer: checkoutCustomer,
        currency: "USD",
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://checkout.stripe.test/cs_async" });
    expect(stripeSessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ userId: USER_ID }),
      })
    );
    expect(vi.mocked(cookies).mock.results[0]?.value).toBeInstanceOf(Promise);
  });

  it("falls back to the cookie user when Stripe metadata has no user id", async () => {
    stripeSessions.retrieve.mockResolvedValue({
      id: "cs_async_cookie",
      payment_status: "paid",
      amount_total: 11500,
      currency: "usd",
      customer_details: { email: checkoutCustomer.email, name: "Ada Lovelace" },
      metadata: {
        userId: "",
        currency: "USD",
        shipping: "15",
        customerName: "Ada Lovelace",
        address: checkoutCustomer.address,
        apartment: "",
        city: checkoutCustomer.city,
        region: checkoutCustomer.region,
        country: checkoutCustomer.country,
        phone: checkoutCustomer.phone,
        items: JSON.stringify([
          {
            id: "prod-amethyst",
            s: "amethyst-bracelet-xv",
            n: "Amethyst Bracelet XV (5mm)",
            p: 100,
            q: 1,
          },
        ]),
      },
    } as never);

    const response = await postStripeVerify(
      request("http://localhost:3000/api/checkout/verify", { sessionId: "cs_async_cookie" })
    );

    expect(response.status).toBe(200);
    expect(db.rowsOf("orders")[0].user_id).toBe(USER_ID);
    expect(vi.mocked(cookies).mock.results[0]?.value).toBeInstanceOf(Promise);
  });
});
