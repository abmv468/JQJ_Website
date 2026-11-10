import { describe, expect, it } from "vitest";
import {
  AIRWALLEX_WALLET_MERCHANT,
  buildAirwallexRedirectToCheckoutProps,
} from "@/lib/payments/airwallex-wallet";

describe("buildAirwallexRedirectToCheckoutProps", () => {
  it("returns merchant wallet options and keeps a US shopper country", () => {
    const props = buildAirwallexRedirectToCheckoutProps({
      intent_id: "int_test",
      client_secret: "secret_test",
      currency: "USD",
      successUrl: "https://jqd.app/order-confirmation?provider=airwallex&order_id=order-1",
      failUrl: "https://jqd.app/order-confirmation?provider=airwallex&order_id=order-1&state=failed",
      country_code: "US",
    });

    expect(props).toEqual({
      intent_id: "int_test",
      client_secret: "secret_test",
      currency: "USD",
      successUrl: "https://jqd.app/order-confirmation?provider=airwallex&order_id=order-1",
      failUrl: "https://jqd.app/order-confirmation?provider=airwallex&order_id=order-1&state=failed",
      country_code: "US",
      applePayRequestOptions: {
        countryCode: AIRWALLEX_WALLET_MERCHANT.countryCode,
        totalPriceLabel: AIRWALLEX_WALLET_MERCHANT.displayName,
      },
      googlePayRequestOptions: {
        countryCode: AIRWALLEX_WALLET_MERCHANT.countryCode,
        merchantInfo: { merchantName: AIRWALLEX_WALLET_MERCHANT.displayName },
      },
    });
    expect(AIRWALLEX_WALLET_MERCHANT).toEqual({
      countryCode: "HK",
      displayName: "Jewellery Quintessential",
    });
  });
});
