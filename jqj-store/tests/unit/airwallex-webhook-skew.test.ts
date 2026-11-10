import { describe, expect, it } from "vitest";
import { resolveAirwallexWebhookMaxSkewSeconds } from "@/lib/payments/airwallex";

describe("resolveAirwallexWebhookMaxSkewSeconds", () => {
  it("uses 300 when unset", () => {
    expect(resolveAirwallexWebhookMaxSkewSeconds(undefined)).toBe(300);
  });

  it("accepts an in-range integer", () => {
    expect(resolveAirwallexWebhookMaxSkewSeconds("120")).toBe(120);
  });

  it.each(["abc", "300s", "NaN", "", "Infinity"])(
    "uses 300 when the value is %j",
    (raw) => {
      expect(resolveAirwallexWebhookMaxSkewSeconds(raw)).toBe(300);
    }
  );

  it.each(["0", "-5"])("clamps %j to 1", (raw) => {
    expect(resolveAirwallexWebhookMaxSkewSeconds(raw)).toBe(1);
  });

  it("clamps 100000 to 600", () => {
    expect(resolveAirwallexWebhookMaxSkewSeconds("100000")).toBe(600);
  });
});
