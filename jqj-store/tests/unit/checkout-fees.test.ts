import { describe, expect, it } from "vitest";
import { CARD_CURRENCY_NOTICE, COD_FEE, COD_FREE_LABEL, codPaymentLabel } from "@/lib/checkout-fees";

describe("checkout fees", () => {
  it("exports a zero COD fee", () => {
    expect(COD_FEE).toBe(0);
  });

  it("exports the card currency notice shared with the order summary", () => {
    expect(CARD_CURRENCY_NOTICE).toBe("Card payments are charged in USD");
  });

  it("uses the no-fee label only when the COD fee is zero", () => {
    expect(codPaymentLabel(0, "$0.00")).toBe(COD_FREE_LABEL);
    expect(codPaymentLabel(0, "$0.00")).toBe("Cash on delivery");
    expect(codPaymentLabel(20, "$20.00")).toBe("Cash on Delivery (+$20.00 fee)");
    expect(codPaymentLabel(20, "$20.00")).not.toBe(COD_FREE_LABEL);
  });
});
