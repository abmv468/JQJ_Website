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

// Same eight checkout countries and postcode flags as PR #24.
// Hong Kong is optional. The other seven are required. A country not listed is optional.
// https://github.com/abmv468/JQJ_Website/pull/24
export const CHECKOUT_POSTCODE_REQUIRED = {
  "United States": true,
  "United Kingdom": true,
  Canada: true,
  Australia: true,
  "Hong Kong SAR": false,
  Singapore: true,
  Netherlands: true,
  Germany: true,
} as const;

// Flip enabled to true once WEB-008 sends postalCode. Until then a missing postcode is accepted.
export const POSTCODE_REQUIRED_ENFORCED = { enabled: false };

const CHECKOUT_COUNTRY_NAMES: Record<string, keyof typeof CHECKOUT_POSTCODE_REQUIRED> = {
  "united states": "United States",
  "united states of america": "United States",
  usa: "United States",
  us: "United States",
  "united kingdom": "United Kingdom",
  uk: "United Kingdom",
  "great britain": "United Kingdom",
  gb: "United Kingdom",
  canada: "Canada",
  ca: "Canada",
  australia: "Australia",
  au: "Australia",
  "hong kong": "Hong Kong SAR",
  "hong kong sar": "Hong Kong SAR",
  hk: "Hong Kong SAR",
  singapore: "Singapore",
  sg: "Singapore",
  netherlands: "Netherlands",
  nl: "Netherlands",
  germany: "Germany",
  de: "Germany",
};

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

function postcodeRequiredForCountry(country: string) {
  const name = CHECKOUT_COUNTRY_NAMES[country.trim().toLowerCase().replace(/\./g, "")];
  if (!name) return false;
  return CHECKOUT_POSTCODE_REQUIRED[name];
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
  } else if (POSTCODE_REQUIRED_ENFORCED.enabled && postcodeRequiredForCountry(country) && !postcode) {
    fields.postalCode = "Enter a valid postcode.";
  } else if (postcode && !isValidPostcode(countryCode(country), postcode)) {
    fields.postalCode = "Enter a valid postcode.";
  }

  // Phone stays optional. The checkout form does not require it.
  if (Object.keys(fields).length > 0) return { ok: false as const, fields };
  return { ok: true as const };
}
