// Owner still has to confirm both the merchant country and this display name.
export const AIRWALLEX_WALLET_MERCHANT = {
  countryCode: "HK",
  displayName: "Jewellery Quintessential",
} as const;

export interface AirwallexHostedCheckoutProps {
  intent_id: string;
  client_secret: string;
  currency: string;
  successUrl: string;
  failUrl?: string;
  /** Shopper shipping country. This is not the merchant country. */
  country_code?: string;
  applePayRequestOptions: {
    countryCode: typeof AIRWALLEX_WALLET_MERCHANT.countryCode;
    totalPriceLabel: typeof AIRWALLEX_WALLET_MERCHANT.displayName;
  };
  googlePayRequestOptions: {
    countryCode: typeof AIRWALLEX_WALLET_MERCHANT.countryCode;
    merchantInfo: {
      merchantName: typeof AIRWALLEX_WALLET_MERCHANT.displayName;
    };
  };
}

export function buildAirwallexRedirectToCheckoutProps(input: {
  intent_id: string;
  client_secret: string;
  currency: string;
  successUrl: string;
  failUrl?: string;
  country_code?: string;
}): AirwallexHostedCheckoutProps {
  return {
    intent_id: input.intent_id,
    client_secret: input.client_secret,
    currency: input.currency,
    successUrl: input.successUrl,
    failUrl: input.failUrl,
    country_code: input.country_code,
    applePayRequestOptions: {
      countryCode: AIRWALLEX_WALLET_MERCHANT.countryCode,
      totalPriceLabel: AIRWALLEX_WALLET_MERCHANT.displayName,
    },
    googlePayRequestOptions: {
      countryCode: AIRWALLEX_WALLET_MERCHANT.countryCode,
      merchantInfo: {
        merchantName: AIRWALLEX_WALLET_MERCHANT.displayName,
      },
    },
  };
}
