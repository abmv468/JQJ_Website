import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postCheckout } from "@/app/api/checkout/route";
import { POST as postVerify } from "@/app/api/checkout/verify/route";
import { POST as postWebhook } from "@/app/api/webhooks/stripe/route";
import { getStripe } from "@/lib/stripe";
import { createCheckoutDb, setActiveDb, type MemoryDb } from "../helpers/memory-db";

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(() => {
    throw new Error("Stripe SDK should not be called");
  }),
}));

const handlers = [
  ["POST /api/checkout", postCheckout],
  ["POST /api/checkout/verify", postVerify],
  ["POST /api/webhooks/stripe", postWebhook],
] as const;

describe("retired Stripe routes", () => {
  let db: MemoryDb;

  beforeEach(() => {
    db = createCheckoutDb();
    setActiveDb(db);
    vi.mocked(getStripe).mockClear();
  });

  it.each(handlers)("%s returns 410 and does not call Stripe", async (pathname, handler) => {
    const response = await handler(
      new Request(`http://localhost:3000${pathname.replace("POST ", "")}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": "t=1,v1=test",
        },
        body: JSON.stringify({
          sessionId: "cs_test_123",
          type: "checkout.session.completed",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body).toEqual({ error: "This payment method is no longer available." });
    expect(JSON.stringify(body)).not.toMatch(/UPS|Express|expedited/);
    expect(getStripe).not.toHaveBeenCalled();
    expect(db.rowsOf("orders")).toHaveLength(0);
    expect(db.rowsOf("payments")).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);
  });
});
