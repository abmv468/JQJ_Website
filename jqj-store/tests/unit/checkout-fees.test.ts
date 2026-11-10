import { describe, expect, it } from "vitest";
import { COD_FEE } from "@/lib/checkout-fees";
import { formatPrice } from "@/lib/utils";

describe("checkout fees", () => {
  it("exports the COD fee the server charges", () => {
    expect(COD_FEE).toBe(20);
    expect(formatPrice(COD_FEE, { currency: "USD" })).toBe("$20.00");
  });
});
