import { describe, expect, it } from "vitest";
import {
  EXPIRED_ORDER_LINK_HEADING,
  SUPPORT_EMAIL,
  expiredOrderLinkMessage,
  supportMailto,
} from "@/lib/support";

describe("expired order link copy", () => {
  it("uses the confirmed support address in the message and the mailto href", () => {
    expect(SUPPORT_EMAIL).toBe("support@jqdgroup.com");
    expect(EXPIRED_ORDER_LINK_HEADING).toBe("This order link has expired");
    expect(expiredOrderLinkMessage()).toBe(
      "This order link is no longer active. Your order details are in your confirmation email — or contact us at support@jqdgroup.com and we'll be glad to help."
    );
    expect(supportMailto()).toBe("mailto:support@jqdgroup.com");
    expect(expiredOrderLinkMessage()).toContain(SUPPORT_EMAIL);
    expect(supportMailto()).toBe(`mailto:${SUPPORT_EMAIL}`);
  });
});
