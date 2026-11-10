import { describe, expect, it } from "vitest";
import { CARD_CURRENCY_NOTICE, COD_FEE } from "@/lib/checkout-fees";

describe("checkout fees", () => {
  it("exports a zero COD fee", () => {
    expect(COD_FEE).toBe(0);
  });

  it("exports the card currency notice shared with the order summary", () => {
    expect(CARD_CURRENCY_NOTICE).toBe("Card payments are charged in USD.");
  });
});
