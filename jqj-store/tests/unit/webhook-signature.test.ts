import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyAirwallexWebhookSignature } from "@/lib/payments/airwallex";

const SECRET = "test_dummy_webhook_secret";

function sign(timestamp: string, body: string, secret = SECRET) {
  return createHmac("sha256", secret).update(`${timestamp}${body}`).digest("hex");
}

describe("verifyAirwallexWebhookSignature", () => {
  const body = JSON.stringify({ id: "evt_1", name: "payment_intent.succeeded" });
  const timestamp = String(Math.floor(Date.now() / 1000));

  it("accepts a valid signature", () => {
    expect(
      verifyAirwallexWebhookSignature({
        rawBody: body,
        signature: sign(timestamp, body),
        timestamp,
        secret: SECRET,
      })
    ).toEqual({ ok: true });
  });

  it("rejects a tampered body, a bad signature, and missing headers", () => {
    expect(
      verifyAirwallexWebhookSignature({
        rawBody: `${body} `,
        signature: sign(timestamp, body),
        timestamp,
        secret: SECRET,
      }).ok
    ).toBe(false);

    expect(
      verifyAirwallexWebhookSignature({
        rawBody: body,
        signature: "deadbeef",
        timestamp,
        secret: SECRET,
      }).error
    ).toMatch(/mismatch/);

    expect(
      verifyAirwallexWebhookSignature({
        rawBody: body,
        signature: null,
        timestamp,
        secret: SECRET,
      }).error
    ).toMatch(/Missing/);
  });

  it("rejects a timestamp outside the skew window", () => {
    const stale = String(Math.floor(Date.now() / 1000) - 3_600);
    const result = verifyAirwallexWebhookSignature({
      rawBody: body,
      signature: sign(stale, body),
      timestamp: stale,
      secret: SECRET,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/outside the allowed window/);
  });
});
