import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postAirwallex } from "@/app/api/checkout/airwallex/route";
import { POST as postCod } from "@/app/api/checkout/cod/route";
import * as checkoutCustomerModule from "@/lib/checkout-customer";
import { validateCheckoutCustomer } from "@/lib/checkout-customer";
import { renderOrderEmailHtml, type OrderEmailData } from "@/lib/email";
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
    checkoutCustomerModule.POSTCODE_REQUIRED_ENFORCED.enabled = false;
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

  it("accepts a blank postcode for Hong Kong and for a country outside the map", async () => {
    const hk = await postCod(
      request(
        "/api/checkout/cod",
        { ...checkoutCustomer, city: "Central", country: "Hong Kong SAR", postalCode: "" },
        `${REQUEST_ID}-hk-blank`
      )
    );
    expect(hk.status).toBe(200);

    const unlisted = await postAirwallex(
      request(
        "/api/checkout/airwallex",
        { ...checkoutCustomer, city: "Tokyo", country: "Japan", postalCode: "" },
        `${REQUEST_ID}-jp-blank`
      )
    );
    expect(unlisted.status).toBe(200);
    expect(createAirwallexPaymentIntent).toHaveBeenCalled();
  });

  it("requires a postcode for the United States only when enforcement is on", async () => {
    checkoutCustomerModule.POSTCODE_REQUIRED_ENFORCED.enabled = true;
    try {
      const missing = await postAirwallex(
        request(
          "/api/checkout/airwallex",
          { ...checkoutCustomer, postalCode: "" },
          `${REQUEST_ID}-us-required`
        )
      );
      const missingBody = await missing.json();
      expect(missing.status).toBe(400);
      expect(missingBody.fields).toEqual({ postalCode: "Enter a valid postcode." });
      expect(db.rowsOf("orders")).toHaveLength(0);
      expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();

      const hk = await postCod(
        request(
          "/api/checkout/cod",
          { ...checkoutCustomer, city: "Central", country: "Hong Kong SAR", postalCode: "" },
          `${REQUEST_ID}-hk-still-optional`
        )
      );
      expect(hk.status).toBe(200);
    } finally {
      checkoutCustomerModule.POSTCODE_REQUIRED_ENFORCED.enabled = false;
    }
  });

  it("stores a trimmed postcode and rejects characters that cannot be stored safely", async () => {
    const uk = {
      ...checkoutCustomer,
      city: "London",
      region: "",
      country: "United Kingdom",
      postalCode: "  SW1A 1AA  ",
    };
    const cod = await postCod(request("/api/checkout/cod", uk, `${REQUEST_ID}-uk-cod`));
    expect(cod.status).toBe(200);
    expect(db.rowsOf("orders")[0].shipping_address).toEqual(
      expect.objectContaining({ postal_code: "SW1A 1AA" })
    );

    const card = await postAirwallex(
      request("/api/checkout/airwallex", uk, "44444444-4444-4444-8444-444444444444")
    );
    expect(card.status).toBe(200);
    expect(db.rowsOf("orders").at(-1)?.shipping_address).toEqual(
      expect.objectContaining({ postal_code: "SW1A 1AA" })
    );

    const hk = await postCod(
      request(
        "/api/checkout/cod",
        { ...checkoutCustomer, city: "Central", country: "Hong Kong SAR", postalCode: "" },
        `${REQUEST_ID}-hk-empty-post`
      )
    );
    expect(hk.status).toBe(200);
    expect(db.rowsOf("orders").at(-1)?.shipping_address).toEqual(
      expect.objectContaining({ postal_code: "" })
    );

    for (const postalCode of ["<b>", "a,b"]) {
      const rejected = await postAirwallex(
        request(
          "/api/checkout/airwallex",
          { ...checkoutCustomer, postalCode },
          `${REQUEST_ID}-bad-${postalCode.length}`
        )
      );
      expect(rejected.status).toBe(400);
      expect((await rejected.json()).fields).toEqual({ postalCode: "Enter a valid postcode." });
    }
    expect(db.rowsOf("orders")).toHaveLength(3);
    expect(createAirwallexPaymentIntent).toHaveBeenCalledTimes(1);
  });

  it.each(routes)(
    "%s rejects a non-string value for each required field before any database call",
    async (_name, handler, path) => {
      const from = vi.spyOn(db, "from");
      const requiredFields = [
        ["firstName", "Enter your name."],
        ["email", "Enter a valid email address."],
        ["address", "Enter your address."],
        ["city", "Enter your city."],
        ["country", "Choose a country."],
      ] as const;
      const badValues = [78701, true, { line: "1" }, ["Ada"]];
      for (const [field, message] of requiredFields) {
        for (const value of badValues) {
          const response = await handler(
            request(path, { ...checkoutCustomer, [field]: value }, `${REQUEST_ID}-${field}-type`)
          );
          expect(response.status).toBe(400);
          expect((await response.json()).fields?.[field]).toBe(message);
        }
      }
      const lastName = await handler(
        request(path, { ...checkoutCustomer, lastName: 12 }, `${REQUEST_ID}-last-type`)
      );
      expect(lastName.status).toBe(400);
      expect((await lastName.json()).fields).toEqual({
        lastName: "Please check your details and try again.",
      });
      for (const postalCode of [true, false]) {
        const response = await handler(
          request(path, { ...checkoutCustomer, postalCode }, `${REQUEST_ID}-post-bool`)
        );
        expect(response.status).toBe(400);
        expect((await response.json()).fields).toEqual({ postalCode: "Enter a valid postcode." });
      }
      expect(from).not.toHaveBeenCalled();
      expect(db.rowsOf("orders")).toHaveLength(0);
      expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();
    }
  );

  it.each(routes)(
    "%s rejects a non-string postcode and stores null as an empty string",
    async (_name, handler, path) => {
      for (const postalCode of [78701, ["78701"], { code: "78701" }]) {
        const rejected = await handler(
          request(path, { ...checkoutCustomer, postalCode }, `${REQUEST_ID}-${path}-type`)
        );
        expect(rejected.status).toBe(400);
        expect((await rejected.json()).fields).toEqual({ postalCode: "Enter a valid postcode." });
      }
      expect(db.rowsOf("orders")).toHaveLength(0);
      expect(createAirwallexPaymentIntent).not.toHaveBeenCalled();

      const accepted = await handler(
        request(path, { ...checkoutCustomer, postalCode: null }, `${REQUEST_ID}-${path}-null`)
      );
      expect(accepted.status).toBe(200);
      expect(db.rowsOf("orders").at(-1)?.shipping_address).toEqual(
        expect.objectContaining({ postal_code: "" })
      );
    }
  );
});

function emailFixture(postalCode: string): OrderEmailData {
  return {
    orderId: "order-1",
    customerName: "Ada Lovelace",
    customerEmail: "buyer@example.com",
    items: [{ name: "Bracelet", quantity: 1, price: 100 }],
    subtotal: 100,
    shipping: 15,
    total: 115,
    paymentMethod: "cod",
    currency: "USD",
    shippingAddress: {
      address: "1 Example Lane",
      city: "London",
      region: "",
      country: "United Kingdom",
      postal_code: postalCode,
    },
  };
}

describe("order email postcode", () => {
  it("prints a US or UK postcode in the customer and admin html and skips an empty one", () => {
    const uk = renderOrderEmailHtml(emailFixture("SW1A 1AA"), "Thank you for your order");
    const ukAdmin = renderOrderEmailHtml(emailFixture("SW1A 1AA"), "New order received");
    const us = renderOrderEmailHtml({
      ...emailFixture("78701"),
      shippingAddress: {
        address: "1 Example Lane",
        city: "Austin",
        region: "TX",
        country: "United States",
        postal_code: "78701",
      },
    });
    expect(uk).toContain("SW1A 1AA");
    expect(ukAdmin).toContain("SW1A 1AA");
    expect(us).toContain("78701");

    const blank = renderOrderEmailHtml(emailFixture(""));
    expect(blank).not.toContain("SW1A 1AA");
    expect(blank).not.toContain("78701");
    expect(blank).not.toMatch(/postal/i);
  });
});
