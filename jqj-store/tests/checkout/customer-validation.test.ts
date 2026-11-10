import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postAirwallex } from "@/app/api/checkout/airwallex/route";
import { POST as postCod } from "@/app/api/checkout/cod/route";
import { validateCheckoutCustomer } from "@/lib/checkout-customer";
import { createAirwallexPaymentIntent } from "@/lib/payments/airwallex";
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

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

function request(path: string, customer: unknown, idempotencyKey = REQUEST_ID) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [checkoutItem()],
      customer,
      currency: "USD",
      idempotencyKey,
    }),
  });
}

const routes = [
  ["airwallex", postAirwallex, "/api/checkout/airwallex"],
  ["cod", postCod, "/api/checkout/cod"],
] as const;

describe("checkout customer validation", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    delete process.env.RESEND_API_KEY;
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

  it.each(routes)(
    "%s returns field errors and does not write an order or payment intent",
    async (_name, handler, path) => {
      const missing = await handler(request(path, { country: "United States" }));
      const missingBody = await missing.json();
      expect(missing.status).toBe(400);
      expect(missingBody.fields).toMatchObject({
        firstName: expect.any(String),
        email: expect.any(String),
        address: expect.any(String),
        city: expect.any(String),
      });
      expect(missingBody.fields.postalCode).toBeUndefined();
      expect(missingBody.fields.phone).toBeUndefined();

      const invalidEmail = await handler(
        request(path, { ...checkoutCustomer, email: "not-an-email" }, `${REQUEST_ID}-email`)
      );
      expect(invalidEmail.status).toBe(400);
      expect((await invalidEmail.json()).fields.email).toBe("Enter a valid email address.");

      const invalidZip = await handler(
        request(path, { ...checkoutCustomer, postalCode: "7870" }, `${REQUEST_ID}-zip`)
      );
      expect(invalidZip.status).toBe(400);
      expect((await invalidZip.json()).fields.postalCode).toBe("Enter a valid postcode.");

      expect(db.rowsOf("orders")).toHaveLength(0);
      expect(db.rowsOf("payments")).toHaveLength(0);
      expect(db.rpcCalls).toHaveLength(0);
      expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
      expect(JSON.stringify(missingBody)).not.toMatch(/UPS|Express|expedited/);
    }
  );

  it.each([
    ["US", checkoutCustomer],
    [
      "UK",
      {
        ...checkoutCustomer,
        city: "London",
        country: "United Kingdom",
        postalCode: "SW1A 1AA",
      },
    ],
    [
      "HK",
      {
        ...checkoutCustomer,
        city: "Central",
        country: "Hong Kong SAR",
        postalCode: "",
      },
    ],
  ] as const)("accepts a valid %s address on both checkout routes", async (label, customer) => {
    const { phone: _phone, ...withoutPhone } = customer;

    const card = await postAirwallex(
      request("/api/checkout/airwallex", withoutPhone, `${REQUEST_ID}-${label}-card`)
    );
    expect(card.status).toBe(200);
    expect(createAirwallexPaymentIntent).toHaveBeenCalled();

    const cod = await postCod(request("/api/checkout/cod", withoutPhone, `${REQUEST_ID}-${label}-cod`));
    expect(cod.status).toBe(200);
    expect((await cod.json()).orderId).toEqual(expect.any(String));
  });

  it("accepts a US address with no postal code and rejects a malformed one", async () => {
    const { postalCode: _postalCode, ...usWithoutPostal } = checkoutCustomer;

    const malformed = await postAirwallex(
      request(
        "/api/checkout/airwallex",
        { ...usWithoutPostal, postalCode: "7870" },
        `${REQUEST_ID}-bad-zip`
      )
    );
    const malformedBody = await malformed.json();
    expect(malformed.status).toBe(400);
    expect(malformedBody.fields).toEqual({ postalCode: "Enter a valid postcode." });
    expect(db.rowsOf("orders")).toHaveLength(0);
    expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();

    const card = await postAirwallex(
      request("/api/checkout/airwallex", usWithoutPostal, `${REQUEST_ID}-no-zip`)
    );
    expect(card.status).toBe(200);
    expect(createAirwallexPaymentIntent).toHaveBeenCalled();

    const cod = await postCod(
      request("/api/checkout/cod", { ...usWithoutPostal, postalCode: "" }, `${REQUEST_ID}-empty-zip`)
    );
    expect(cod.status).toBe(200);
    expect((await cod.json()).orderId).toEqual(expect.any(String));
  });

  it("checks common postcode formats and does not require one for Hong Kong", () => {
    const { postalCode: _postalCode, ...usWithoutPostal } = checkoutCustomer;
    expect(validateCheckoutCustomer(usWithoutPostal).ok).toBe(true);
    expect(validateCheckoutCustomer({ ...checkoutCustomer, postalCode: "" }).ok).toBe(true);
    const malformed = validateCheckoutCustomer({ ...checkoutCustomer, postalCode: "7870" });
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.fields.postalCode).toBe("Enter a valid postcode.");
    expect(validateCheckoutCustomer({ ...checkoutCustomer, postalCode: "78701-1234" }).ok).toBe(true);
    expect(validateCheckoutCustomer({ ...checkoutCustomer, postalCode: "787011234" }).ok).toBe(true);
    expect(
      validateCheckoutCustomer({
        ...checkoutCustomer,
        country: "Canada",
        postalCode: "K1A 0B1",
      }).ok
    ).toBe(true);
    expect(
      validateCheckoutCustomer({
        ...checkoutCustomer,
        country: "Canada",
        postalCode: "78701",
      }).ok
    ).toBe(false);
    expect(
      validateCheckoutCustomer({
        ...checkoutCustomer,
        country: "Australia",
        postalCode: "2000",
      }).ok
    ).toBe(true);
    expect(
      validateCheckoutCustomer({
        ...checkoutCustomer,
        country: "Singapore",
        postalCode: "018956",
      }).ok
    ).toBe(true);
    expect(
      validateCheckoutCustomer({
        ...checkoutCustomer,
        country: "Singapore",
        postalCode: "",
      }).ok
    ).toBe(true);
    expect(
      validateCheckoutCustomer({
        ...checkoutCustomer,
        country: "Hong Kong",
        postalCode: "",
      }).ok
    ).toBe(true);
  });
});
