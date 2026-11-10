import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  AIRWALLEX_WALLET_MERCHANT,
  buildAirwallexRedirectToCheckoutProps,
} from "@/lib/payments/airwallex-wallet";

const checkoutPageSource = readFileSync(
  fileURLToPath(new URL("../../app/(store)/checkout/page.tsx", import.meta.url)),
  "utf8"
);

describe("Airwallex hosted checkout wallet options", () => {
  it("passes the merchant country and display name, and keeps a US shipping country", () => {
    const redirectToCheckout = vi.fn();
    const props = buildAirwallexRedirectToCheckoutProps({
      intent_id: "int_test",
      client_secret: "secret_test",
      currency: "USD",
      successUrl: "https://jqd.app/order-confirmation?provider=airwallex&order_id=order-1",
      failUrl: "https://jqd.app/order-confirmation?provider=airwallex&order_id=order-1&state=failed",
      country_code: "US",
    });

    redirectToCheckout(props);

    expect(AIRWALLEX_WALLET_MERCHANT).toEqual({
      countryCode: "HK",
      displayName: "Jewellery Quintessential",
    });
    expect(redirectToCheckout).toHaveBeenCalledWith({
      intent_id: "int_test",
      client_secret: "secret_test",
      currency: "USD",
      successUrl: "https://jqd.app/order-confirmation?provider=airwallex&order_id=order-1",
      failUrl:
        "https://jqd.app/order-confirmation?provider=airwallex&order_id=order-1&state=failed",
      country_code: "US",
      applePayRequestOptions: {
        countryCode: "HK",
        totalPriceLabel: "Jewellery Quintessential",
      },
      googlePayRequestOptions: {
        countryCode: "HK",
        merchantInfo: { merchantName: "Jewellery Quintessential" },
      },
    });
    expect(props.applePayRequestOptions.countryCode).toBe(AIRWALLEX_WALLET_MERCHANT.countryCode);
    expect(props.applePayRequestOptions.totalPriceLabel).toBe(AIRWALLEX_WALLET_MERCHANT.displayName);
    expect(props.googlePayRequestOptions.countryCode).toBe(AIRWALLEX_WALLET_MERCHANT.countryCode);
    expect(props.googlePayRequestOptions.merchantInfo.merchantName).toBe(
      AIRWALLEX_WALLET_MERCHANT.displayName
    );
    expect(props.country_code).toBe("US");
  });

  it("checkout calls redirectToCheckout with the shopper country from the payment response", () => {
    expect(checkoutPageSource).toMatch(
      /payments\.redirectToCheckout\(\s*buildAirwallexRedirectToCheckoutProps\(\{[\s\S]*?country_code:\s*data\.countryCode/
    );
    expect(checkoutPageSource).not.toMatch(/countryCode:\s*data\.countryCode/);
  });
});
