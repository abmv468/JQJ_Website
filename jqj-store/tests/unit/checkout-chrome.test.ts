import { describe, expect, it } from "vitest";
import {
  BACK_TO_BAG_LABEL,
  CHECKOUT_LOGO_ALT,
  CHECKOUT_LOGO_HOME_LABEL,
  CHECKOUT_POLICY_LINKS,
  SECURE_CHECKOUT_LABEL,
  confirmationCopy,
} from "@/lib/checkout-copy";
import { isCheckoutPath } from "@/lib/checkout-route";
import { SUPPORT_EMAIL } from "@/lib/support";

const RETIRED = [
  "atelier",
  "handmade",
  "hand-made",
  "hand made",
  "hand-finished",
  "finished by hand",
  "worldwide",
];

describe("checkout chrome route", () => {
  it("matches only the checkout route", () => {
    expect(isCheckoutPath("/checkout")).toBe(true);
    expect(isCheckoutPath("/checkout/")).toBe(true);
    expect(isCheckoutPath("/cart")).toBe(false);
    expect(isCheckoutPath("/order-confirmation")).toBe(false);
    expect(isCheckoutPath("/checkout-extra")).toBe(false);
    expect(isCheckoutPath(null)).toBe(false);
  });
});

describe("checkout copy", () => {
  it("uses the BRAND v4 logo labels, lock phrase, and support address", () => {
    expect(CHECKOUT_LOGO_ALT).toBe("Jewellery Quintessential · 極氣");
    expect(CHECKOUT_LOGO_HOME_LABEL).toBe("Jewellery Quintessential home");
    expect(SECURE_CHECKOUT_LABEL).toBe("Secure checkout");
    expect(SUPPORT_EMAIL).toBe("support@jqdgroup.com");
  });

  it("keeps a real apostrophe in the invalid confirmation heading", () => {
    expect(confirmationCopy.invalidTitle).toBe("We couldn't confirm your order");
    expect(confirmationCopy.invalidTitle).toContain("'");
    expect(confirmationCopy.invalidTitle).not.toContain("&apos;");
  });

  it("names the minimal footer links without shipping claims", () => {
    expect(CHECKOUT_POLICY_LINKS.map((link) => link.label)).toEqual([
      "Returns",
      "Shipping",
      "Privacy",
      "Terms",
    ]);
    expect(BACK_TO_BAG_LABEL).toBe("Back to bag");
  });

  it("does not add worldwide, delivery-day counts, or retired craft words", () => {
    const blob = JSON.stringify({
      BACK_TO_BAG_LABEL,
      CHECKOUT_LOGO_ALT,
      CHECKOUT_LOGO_HOME_LABEL,
      CHECKOUT_POLICY_LINKS,
      SECURE_CHECKOUT_LABEL,
      confirmationCopy,
    }).toLowerCase();

    for (const word of RETIRED) {
      expect(blob).not.toContain(word);
    }
    expect(blob).not.toMatch(/\d+\s*[–-]\s*\d+/);
  });
});
