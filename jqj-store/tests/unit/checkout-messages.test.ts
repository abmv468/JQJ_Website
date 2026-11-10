import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHECKOUT_AUTOCOMPLETE,
  CHECKOUT_CUSTOMER_FIELD_KEYS,
  CHECKOUT_ERROR_FIELDS,
  CHECKOUT_ERROR_GENERIC,
  CHECKOUT_ERROR_PAYMENT,
  CHECKOUT_FIELD_EMAIL,
  CHECKOUT_FIELD_REQUIRED,
  CHECKOUT_SHIPPING_LABEL,
  customerSafeCheckoutMessage,
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
  postcode: "",
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
  postcode: "78701",
});

describe("checkout customer field contract", () => {
  it("lists the request-body customer keys, including postcode", () => {
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
      "postcode",
    ]);
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
      postcode: "postal-code",
      country: "country",
      phone: "tel",
    });
  });

  it("keeps the v4.2 shipping label and marks strings v4 does not cover", () => {
    expect(CHECKOUT_SHIPPING_LABEL).toBe("Tracked delivery");
    expect(CHECKOUT_SHIPPING_LABEL).not.toMatch(/ups|express|expedited/i);

    const source = readFileSync(new URL("../../lib/checkout-messages.ts", import.meta.url), "utf8");
    const shippingNote = source.slice(
      source.indexOf("export const CHECKOUT_SHIPPING_LABEL") - 60,
      source.indexOf("export const CHECKOUT_SHIPPING_LABEL")
    );
    expect(shippingNote).toContain("// BRAND v4.2, verbatim once compiled");
    expect(shippingNote).not.toContain("awaiting BRAND v4");
    expect(source).toContain("// awaiting BRAND v4");
  });
});

describe("validateCheckoutCustomer", () => {
  it("requires postcode and the existing required fields", () => {
    expect(validateCheckoutCustomer(emptyCustomer())).toEqual({
      email: CHECKOUT_FIELD_REQUIRED,
      country: CHECKOUT_FIELD_REQUIRED,
      firstName: CHECKOUT_FIELD_REQUIRED,
      address: CHECKOUT_FIELD_REQUIRED,
      city: CHECKOUT_FIELD_REQUIRED,
      postcode: CHECKOUT_FIELD_REQUIRED,
    });
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
          postcode: "Enter a postcode.",
          email: "Enter a valid email address.",
          note: "Delivery note was too long.",
        },
      })
    ).toEqual({
      fields: {
        postcode: "Enter a postcode.",
        email: "Enter a valid email address.",
      },
      formMessage: "Delivery note was too long.",
    });
  });

  it("uses the field summary when every key is an input", () => {
    expect(readCheckoutFailure({ errors: { city: "Enter a city." } })).toEqual({
      fields: { city: "Enter a city." },
      formMessage: CHECKOUT_ERROR_FIELDS,
    });
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
