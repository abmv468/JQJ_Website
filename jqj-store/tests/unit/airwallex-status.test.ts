import { afterEach, describe, expect, it } from "vitest";
import {
  createAirwallexPaymentIntent,
  getAirwallexEnvironment,
  getAirwallexSdkEnvironment,
  isPendingPaymentStatus,
  isSuccessfulPaymentStatus,
  isTerminalFailedPaymentStatus,
  normalizeAirwallexPaymentStatus,
} from "@/lib/payments/airwallex";

const ORIGINAL_ENV = process.env.AIRWALLEX_ENV;
const ORIGINAL_FLAG = process.env.AIRWALLEX_PRODUCTION_ENABLED;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.AIRWALLEX_ENV;
  else process.env.AIRWALLEX_ENV = ORIGINAL_ENV;
  if (ORIGINAL_FLAG === undefined) delete process.env.AIRWALLEX_PRODUCTION_ENABLED;
  else process.env.AIRWALLEX_PRODUCTION_ENABLED = ORIGINAL_FLAG;
});

describe("Airwallex payment status", () => {
  it("maps provider statuses and treats unknown values as non-success", () => {
    expect(normalizeAirwallexPaymentStatus("SUCCEEDED")).toBe("succeeded");
    expect(normalizeAirwallexPaymentStatus("failed")).toBe("failed");
    expect(normalizeAirwallexPaymentStatus("CANCELLED")).toBe("cancelled");
    expect(normalizeAirwallexPaymentStatus("not-a-status")).toBe("unknown");
    expect(isSuccessfulPaymentStatus("succeeded")).toBe(true);
    expect(isTerminalFailedPaymentStatus("cancelled")).toBe(true);
    expect(isTerminalFailedPaymentStatus("abandoned")).toBe(true);
    expect(isPendingPaymentStatus("requires_payment_method")).toBe(true);
    expect(isPendingPaymentStatus("succeeded")).toBe(false);
  });

  it("defaults to sandbox and refuses production unless explicitly enabled", async () => {
    delete process.env.AIRWALLEX_ENV;
    expect(getAirwallexEnvironment()).toBe("sandbox");
    expect(getAirwallexSdkEnvironment()).toBe("demo");

    process.env.AIRWALLEX_ENV = "production";
    delete process.env.AIRWALLEX_PRODUCTION_ENABLED;
    await expect(
      createAirwallexPaymentIntent({
        requestId: "11111111-1111-4111-8111-111111111111",
        amount: 10,
        currency: "USD",
        merchantOrderId: "order-1",
        returnUrl: "http://localhost:3000/order-confirmation",
      })
    ).rejects.toThrow(/production mode is disabled/);

    process.env.AIRWALLEX_ENV = "staging";
    expect(() => getAirwallexEnvironment()).toThrow(/Unsupported AIRWALLEX_ENV/);
  });
});
