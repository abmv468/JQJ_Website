/**
 * Customer-facing checkout copy and the field-error contract for BE-011.
 *
 * Request body `customer` keys, also accepted in HTTP 400
 * `{ errors: { [field]: message } }` (and the same map under `fields`):
 * email, firstName, lastName, address, apartment, city, region, country,
 * phone, postalCode.
 * `postalCode` is the postcode key. Unknown keys are not inputs.
 */

export const CHECKOUT_CUSTOMER_FIELD_KEYS = [
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
] as const;

export type CheckoutCustomerField = (typeof CHECKOUT_CUSTOMER_FIELD_KEYS)[number];

export type CheckoutCustomer = Record<CheckoutCustomerField, string>;

export type CheckoutFieldErrors = Partial<Record<CheckoutCustomerField, string>>;

/** Fields the checkout form blocks on before a request. Region and last name stay optional. */
export const CHECKOUT_REQUIRED_FIELDS = [
  "email",
  "country",
  "firstName",
  "address",
  "city",
  "postalCode",
] as const satisfies readonly CheckoutCustomerField[];

export const CHECKOUT_FIELD_FOCUS_ORDER: readonly CheckoutCustomerField[] = [
  "email",
  "country",
  "firstName",
  "lastName",
  "address",
  "apartment",
  "city",
  "region",
  "postalCode",
  "phone",
];

export const CHECKOUT_AUTOCOMPLETE: Record<CheckoutCustomerField, string> = {
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
};

// BRAND v4.2, verbatim once compiled
export const CHECKOUT_SHIPPING_LABEL = "Tracked delivery";

// awaiting BRAND v4
export const CHECKOUT_STATUS_PROCESSING = "Processing…";

// awaiting BRAND v4
export const CHECKOUT_STATUS_REDIRECTING =
  "You'll complete payment on Airwallex's secure page next.";

// awaiting BRAND v4
export const CHECKOUT_ERROR_PAYMENT =
  "We couldn't start your secure payment. Please try again — you have not been charged.";

// awaiting BRAND v4
export const CHECKOUT_ERROR_GENERIC =
  "Something went wrong. Please try again. You have not been charged.";

// awaiting BRAND v4
export const CHECKOUT_ERROR_FIELDS = "Please check the highlighted fields.";

// awaiting BRAND v4
export const CHECKOUT_FIELD_REQUIRED = "This field is required.";

// awaiting BRAND v4
export const CHECKOUT_FIELD_EMAIL = "Enter a valid email address.";

// awaiting BRAND v4
export const CHECKOUT_REFERENCE_PREFIX = "Reference:";

const INTERNAL_ERROR_COPY: Record<string, string> = {
  "Failed to load Airwallex checkout SDK": CHECKOUT_ERROR_PAYMENT,
  "Airwallex SDK is unavailable": CHECKOUT_ERROR_PAYMENT,
  "Airwallex SDK failed to initialize": CHECKOUT_ERROR_PAYMENT,
  "Airwallex checkout payload is incomplete": CHECKOUT_ERROR_PAYMENT,
  "Checkout failed": CHECKOUT_ERROR_PAYMENT,
  "Something went wrong": CHECKOUT_ERROR_GENERIC,
};

const FIELD_KEYS = new Set<string>(CHECKOUT_CUSTOMER_FIELD_KEYS);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isCheckoutCustomerField(key: string): key is CheckoutCustomerField {
  return FIELD_KEYS.has(key);
}

export function customerSafeCheckoutMessage(raw: string): string {
  return INTERNAL_ERROR_COPY[raw] ?? CHECKOUT_ERROR_GENERIC;
}

export function validateCheckoutCustomer(customer: CheckoutCustomer): CheckoutFieldErrors {
  const errors: CheckoutFieldErrors = {};

  for (const field of CHECKOUT_REQUIRED_FIELDS) {
    if (!customer[field].trim()) errors[field] = CHECKOUT_FIELD_REQUIRED;
  }

  if (customer.email.trim() && !EMAIL_PATTERN.test(customer.email.trim())) {
    errors.email = CHECKOUT_FIELD_EMAIL;
  }

  return errors;
}

function presentServerFieldMessage(message: string): string {
  return INTERNAL_ERROR_COPY[message] ?? message;
}

export type CheckoutFailure = {
  fields: CheckoutFieldErrors;
  formMessage: string;
  reference: string | null;
};

export function formatCheckoutReference(reference: string) {
  return `${CHECKOUT_REFERENCE_PREFIX} ${reference}`;
}

function readReference(value: unknown) {
  if (typeof value !== "string") return null;
  const reference = value.trim();
  if (!reference || reference.length > 64) return null;
  return reference;
}

function readFieldMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields: CheckoutFieldErrors = {};
  const unknown: string[] = [];

  for (const [key, message] of Object.entries(value)) {
    if (typeof message !== "string" || message.trim() === "") continue;
    const shown = presentServerFieldMessage(message);
    if (isCheckoutCustomerField(key)) fields[key] = shown;
    else unknown.push(shown);
  }

  if (Object.keys(fields).length === 0 && unknown.length === 0) return null;
  return { fields, unknown };
}

export function readCheckoutFailure(body: unknown): CheckoutFailure {
  const record =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const rawError = typeof record.error === "string" ? record.error.trim() : "";
  const reference = readReference(record.reference);
  const fieldMap = readFieldMap(record.errors) ?? readFieldMap(record.fields);
  const safeError = rawError && !INTERNAL_ERROR_COPY[rawError] ? rawError : "";

  if (fieldMap) {
    return {
      fields: fieldMap.fields,
      formMessage: fieldMap.unknown.length
        ? fieldMap.unknown.join(" ")
        : safeError || CHECKOUT_ERROR_FIELDS,
      reference,
    };
  }

  if (reference && safeError) {
    return { fields: {}, formMessage: safeError, reference };
  }

  return {
    fields: {},
    formMessage: customerSafeCheckoutMessage(rawError || "Checkout failed"),
    reference,
  };
}
