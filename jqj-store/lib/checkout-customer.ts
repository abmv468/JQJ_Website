export type CheckoutCustomerInput = {
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  postalCode?: string;
  postcode?: string;
  zip?: string;
  postal_code?: string;
};

export type CheckoutFieldErrors = Record<string, string>;

const COUNTRY_CODES: Record<string, string> = {
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  us: "US",
  "united kingdom": "GB",
  uk: "GB",
  "great britain": "GB",
  gb: "GB",
  canada: "CA",
  ca: "CA",
  australia: "AU",
  au: "AU",
  "hong kong": "HK",
  "hong kong sar": "HK",
  hk: "HK",
};

function countryCode(country: string) {
  const key = country.trim().toLowerCase().replace(/\./g, "");
  if (COUNTRY_CODES[key]) return COUNTRY_CODES[key];
  if (/^[a-z]{2}$/i.test(country.trim())) return country.trim().toUpperCase();
  return "";
}

function readPostcode(customer: CheckoutCustomerInput) {
  return (customer.postalCode ?? customer.postcode ?? customer.zip ?? customer.postal_code ?? "").trim();
}

function isValidPostcode(code: string, postcode: string) {
  if (code === "HK") return true;
  if (code === "US") {
    return /^\d{5}$/.test(postcode) || /^\d{5}-\d{4}$/.test(postcode) || /^\d{9}$/.test(postcode);
  }
  if (code === "GB") return /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i.test(postcode);
  if (code === "CA") {
    return /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i.test(postcode);
  }
  if (code === "AU") return /^\d{4}$/.test(postcode);
  return /^[A-Za-z0-9][A-Za-z0-9 -]{1,11}$/.test(postcode);
}

export function validateCheckoutCustomer(customer: CheckoutCustomerInput | null | undefined) {
  const source = customer ?? {};
  const fields: CheckoutFieldErrors = {};

  const name = (source.firstName ?? source.name ?? "").trim();
  if (!name) fields.firstName = "Enter your name.";

  const email = (source.email ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fields.email = "Enter a valid email address.";
  }

  if (!(source.address ?? "").trim()) fields.address = "Enter your address.";
  if (!(source.city ?? "").trim()) fields.city = "Enter your city.";

  const country = (source.country ?? "").trim();
  const postcode = readPostcode(source);
  if (!country) {
    fields.country = "Choose a country.";
  } else if (postcode && !isValidPostcode(countryCode(country), postcode)) {
    fields.postalCode = "Enter a valid postcode.";
  }

  // Postal code is optional until the checkout form sends it.
  // Phone stays optional. The checkout form does not require it.
  if (Object.keys(fields).length > 0) return { ok: false as const, fields };
  return { ok: true as const };
}
