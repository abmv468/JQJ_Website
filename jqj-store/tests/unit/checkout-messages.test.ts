import { describe, expect, it } from "vitest";
import {
  CHECKOUT_AUTOCOMPLETE,
  CHECKOUT_CUSTOMER_FIELD_KEYS,
  CHECKOUT_ERROR_FIELDS,
  CHECKOUT_ERROR_GENERIC,
  CHECKOUT_ERROR_PAYMENT,
  CHECKOUT_FIELD_EMAIL,
  CHECKOUT_FIELD_REQUIRED,
  CHECKOUT_REQUIRED_FIELDS,
  POSTCODE_REQUIRED_BY_COUNTRY,
  customerSafeCheckoutMessage,
  isPostcodeRequired,
  readCheckoutFailure,
  validateCheckoutCustomer,
  type CheckoutCustomer,
} from "@/lib/checkout-messages";

const emptyCustomer = (): CheckoutCustomer => ({
  email: "",
  firstName: "",
  lastName: "",
  address: "",
  apartment: "",
  city: "",
  region: "",
  country: "",
  phone: "",
  postalCode: "",
});

const readyCustomer = (): CheckoutCustomer => ({
  ...emptyCustomer(),
  email: "buyer@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  address: "1 Example Street",
  city: "Austin",
  region: "TX",
  country: "United States",
  phone: "5125550100",
  postalCode: "78701",
});

describe("checkout customer field contract", () => {
  it("lists the request-body customer keys, including postalCode", () => {
    expect(CHECKOUT_CUSTOMER_FIELD_KEYS).toEqual([
      "email",
      "firstName",
      "lastName",
      "address",
      "apartment",
      "city",
      "region",
      "country",
      "phone",
      "postalCode",
    ]);
    expect(CHECKOUT_CUSTOMER_FIELD_KEYS).not.toContain("postcode");
  });

  it("uses the full autocomplete tokens", () => {
    expect(CHECKOUT_AUTOCOMPLETE).toEqual({
      email: "email",
      firstName: "given-name",
      lastName: "family-name",
      address: "address-line1",
      apartment: "address-line2",
      city: "address-level2",
      region: "address-level1",
      postalCode: "postal-code",
      country: "country",
      phone: "tel",
    });
  });

});

describe("POSTCODE_REQUIRED_BY_COUNTRY", () => {
  it("keeps Hong Kong optional and requires a postcode for the other checkout countries", () => {
    expect(POSTCODE_REQUIRED_BY_COUNTRY).toEqual({
      "United States": true,
      "United Kingdom": true,
      Canada: true,
      Australia: true,
      "Hong Kong SAR": false,
      Singapore: true,
      Netherlands: true,
      Germany: true,
    });
    expect(isPostcodeRequired("Hong Kong SAR")).toBe(false);
    expect(isPostcodeRequired("United States")).toBe(true);
    expect(isPostcodeRequired("United Kingdom")).toBe(true);
    expect(isPostcodeRequired("Canada")).toBe(true);
    expect(isPostcodeRequired("Australia")).toBe(true);
    expect(isPostcodeRequired("Singapore")).toBe(true);
    expect(isPostcodeRequired("Netherlands")).toBe(true);
    expect(isPostcodeRequired("Germany")).toBe(true);
    expect(isPostcodeRequired("France")).toBe(false);
    expect(isPostcodeRequired("")).toBe(false);
    expect(CHECKOUT_REQUIRED_FIELDS).not.toContain("postalCode");
  });

  it("returns false for __proto__, constructor, and toString", () => {
    expect(isPostcodeRequired("__proto__")).toBe(false);
    expect(isPostcodeRequired("constructor")).toBe(false);
    expect(isPostcodeRequired("toString")).toBe(false);
  });
});

describe("validateCheckoutCustomer", () => {
  it("requires the static fields and a postcode only when the country requires one", () => {
    expect(validateCheckoutCustomer(emptyCustomer())).toEqual({
      email: CHECKOUT_FIELD_REQUIRED,
      country: CHECKOUT_FIELD_REQUIRED,
      firstName: CHECKOUT_FIELD_REQUIRED,
      address: CHECKOUT_FIELD_REQUIRED,
      city: CHECKOUT_FIELD_REQUIRED,
    });

    const unitedStates = emptyCustomer();
    unitedStates.country = "United States";
    expect(validateCheckoutCustomer(unitedStates).postalCode).toBe(CHECKOUT_FIELD_REQUIRED);

    const hongKong = readyCustomer();
    hongKong.country = "Hong Kong SAR";
    hongKong.postalCode = "";
    expect(validateCheckoutCustomer(hongKong)).toEqual({});
  });

  it("leaves last name and region optional", () => {
    const customer = readyCustomer();
    customer.lastName = " ";
    customer.region = "";
    expect(validateCheckoutCustomer(customer)).toEqual({});
  });

  it("rejects an email that is not an address", () => {
    const customer = readyCustomer();
    customer.email = "not-an-email";
    expect(validateCheckoutCustomer(customer).email).toBe(CHECKOUT_FIELD_EMAIL);
  });
});

describe("readCheckoutFailure", () => {
  it("maps known keys onto fields and unknown keys onto the form alert", () => {
    expect(
      readCheckoutFailure({
        errors: {
          postalCode: "Enter a valid postcode.",
          email: "Enter a valid email address.",
          note: "Delivery note was too long.",
        },
      })
    ).toEqual({
      fields: {
        postalCode: "Enter a valid postcode.",
        email: "Enter a valid email address.",
      },
      formMessage: "Delivery note was too long.",
      reference: null,
    });
  });

  it("maps the fields map PR #26 returns today", () => {
    expect(
      readCheckoutFailure({
        error: "Check the highlighted fields.",
        fields: { postalCode: "Enter a valid postcode." },
      })
    ).toEqual({
      fields: { postalCode: "Enter a valid postcode." },
      formMessage: CHECKOUT_ERROR_GENERIC,
      reference: null,
    });
  });

  it("uses the field summary when every key is an input", () => {
    expect(readCheckoutFailure({ errors: { city: "Enter a city." } })).toEqual({
      fields: { city: "Enter a city." },
      formMessage: CHECKOUT_ERROR_FIELDS,
      reference: null,
    });
  });

  it("replaces an unknown server error and keeps the reference", () => {
    const result = readCheckoutFailure({
      error: "AIRWALLEX_API_KEY is missing",
      reference: "ab12cd34",
    });
    expect(result).toEqual({
      fields: {},
      formMessage: CHECKOUT_ERROR_GENERIC,
      reference: "ab12cd34",
    });
    expect(result.formMessage).not.toContain("AIRWALLEX_API_KEY");
  });

  it("ignores inherited field-error keys", () => {
    const errors = Object.create({ postalCode: "from prototype" }) as Record<string, unknown>;
    errors.city = "Enter a city.";
    const result = readCheckoutFailure({ errors });
    expect(result.fields.postalCode).toBeUndefined();
    expect(result.fields.city).toBe("Enter a city.");
  });

  it("never shows a raw internal checkout string", () => {
    expect(customerSafeCheckoutMessage("Failed to load Airwallex checkout SDK")).toBe(
      CHECKOUT_ERROR_PAYMENT
    );
    expect(customerSafeCheckoutMessage("Airwallex checkout payload is incomplete")).toBe(
      CHECKOUT_ERROR_PAYMENT
    );
    expect(readCheckoutFailure({ error: "Failed to load Airwallex checkout SDK" })).toEqual({
      fields: {},
      formMessage: CHECKOUT_ERROR_PAYMENT,
      reference: null,
    });
    expect(
      readCheckoutFailure({
        errors: { phone: "Airwallex SDK failed to initialize" },
      }).fields.phone
    ).toBe(CHECKOUT_ERROR_PAYMENT);
    expect(CHECKOUT_ERROR_PAYMENT).not.toMatch(/sdk|payload|env/i);
    expect(customerSafeCheckoutMessage("AIRWALLEX_API_KEY is missing")).toBe(CHECKOUT_ERROR_GENERIC);
    expect(CHECKOUT_ERROR_GENERIC).not.toMatch(/AIRWALLEX_API_KEY/);
  });
});
