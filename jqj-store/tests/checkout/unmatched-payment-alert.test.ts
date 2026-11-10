import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/airwallex/route";
import { applyAirwallexPaymentIntentStatus } from "@/lib/payments/airwallex-orders";
import {
  claimNullRowAlert,
  resetNullRowAlertDedupe,
} from "@/lib/payments/unmatched-payment-alert";
import { createCheckoutDb, setActiveDb, type MemoryDb } from "../helpers/memory-db";

const sendMock = vi.hoisted(() => vi.fn());

vi.mock("resend", () => {
  return {
    Resend: class {
      emails = { send: sendMock };
    },
  };
});

vi.mock("@/lib/payments/airwallex-orders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/payments/airwallex-orders")>(
    "@/lib/payments/airwallex-orders"
  );
  return {
    ...actual,
    applyAirwallexPaymentIntentStatus: vi.fn(actual.applyAirwallexPaymentIntentStatus),
  };
});

const SECRET = "test_dummy_webhook_secret";
const ADMIN = "ops@internal.example";
const FORBIDDEN = [
  "buyer@example.com",
  "Ada Lovelace",
  "1 Atelier Lane",
  "client_secret",
  "cs_live_should_not_leak",
  "raw-payload-marker",
];

function sign(timestamp: string, body: string) {
  return createHmac("sha256", SECRET).update(`${timestamp}${body}`).digest("hex");
}

function signed(body: unknown, timestamp = String(Math.floor(Date.now() / 1000))) {
  const raw = JSON.stringify(body);
  return new Request("http://localhost:3000/api/webhooks/airwallex", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature": sign(timestamp, raw),
      "x-timestamp": timestamp,
    },
    body: raw,
  });
}

function successEvent(id: string) {
  return {
    id,
    name: "payment_intent.succeeded",
    created_at: new Date().toISOString(),
    raw_payload_marker: "raw-payload-marker",
    data: {
      object: {
        id: "int_1",
        status: "SUCCEEDED",
        amount: 115,
        currency: "USD",
        merchant_order_id: "order-1",
        client_secret: "cs_live_should_not_leak",
        customer_email: "buyer@example.com",
        customer_name: "Ada Lovelace",
        shipping_address: "1 Atelier Lane",
      },
    },
  };
}

function expectNoBuyerData(value: unknown) {
  const rendered = JSON.stringify(value);
  for (const secret of FORBIDDEN) {
    expect(rendered).not.toContain(secret);
  }
}

function sentMail() {
  return sendMock.mock.calls.map((call) => call[0] as {
    to: string;
    subject: string;
    text: string;
    html: string;
  });
}

describe("null-row alert dedupe", () => {
  beforeEach(() => {
    resetNullRowAlertDedupe();
  });

  it("alerts once per event id and once per invocation when the id is missing", () => {
    expect(claimNullRowAlert("evt_a")).toEqual({ alert: true, dedupe: "event_id" });
    expect(claimNullRowAlert("evt_a")).toEqual({ alert: false, dedupe: "event_id" });
    expect(claimNullRowAlert("evt_b")).toEqual({ alert: true, dedupe: "event_id" });
    expect(claimNullRowAlert(null)).toEqual({ alert: true, dedupe: "once_per_invocation" });
    expect(claimNullRowAlert(null)).toEqual({ alert: true, dedupe: "once_per_invocation" });
  });
});

describe("Airwallex unmatched payment alert", () => {
  let db: MemoryDb;
  let previousEnv: Record<string, string | undefined>;

  beforeEach(() => {
    resetNullRowAlertDedupe();
    previousEnv = {
      AIRWALLEX_WEBHOOK_SECRET: process.env.AIRWALLEX_WEBHOOK_SECRET,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      ADMIN_EMAIL: process.env.ADMIN_EMAIL,
      EMAIL_FROM: process.env.EMAIL_FROM,
    };
    db = createCheckoutDb();
    setActiveDb(db);
    process.env.AIRWALLEX_WEBHOOK_SECRET = SECRET;
    process.env.RESEND_API_KEY = "re_test_dummy";
    process.env.ADMIN_EMAIL = ADMIN;
    process.env.EMAIL_FROM = "orders@jqd.app";
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "email_1" }, error: null });
    vi.mocked(applyAirwallexPaymentIntentStatus).mockReset();
    vi.mocked(applyAirwallexPaymentIntentStatus).mockResolvedValue({
      applied: false,
      reason: "order_not_claimed",
      orderId: "order-1",
    });
    db.seed("orders", [
      {
        id: "order-1",
        status: "pending",
        payment_provider: "airwallex",
        payment_status: "requires_payment_method",
        fulfillment_status: "pending_payment",
        inventory_reserved: true,
        total_amount: 115,
        currency: "USD",
        customer_email: "buyer@example.com",
        customer_name: "Ada Lovelace",
        shipping_address: {
          address: "1 Atelier Lane",
          city: "Austin",
          region: "TX",
          country: "United States",
        },
      },
    ]);
    db.seed("payments", [
      {
        id: "pay-1",
        order_id: "order-1",
        provider: "airwallex",
        provider_payment_intent_id: "int_1",
        provider_request_id: "req-1",
        status: "requires_payment_method",
        amount: 115,
        currency: "USD",
      },
    ]);
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("sends one ids-only alert when the webhook row first becomes failed", async () => {
    const response = await POST(signed(successEvent("evt_alert")));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true, failed: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const message = sentMail()[0];
    expect(message.to).toBe(ADMIN);
    expect(message.subject).toBe("[JQD] Payment received but order not matched");
    expect(message.text).toContain("orderId: order-1");
    expect(message.text).toContain("merchantOrderId: order-1");
    expect(message.text).toContain("paymentIntentId: int_1");
    expect(message.text).toContain("webhookEventId: evt_alert");
    expect(message.text).toContain("amount: 115 USD");
    expect(message.text).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} HKT/);
    expect(message.text).toContain("http://localhost:3000/admin?order=order-1");
    expectNoBuyerData(message);
    expectNoBuyerData(body);
    expect(db.rowsOf("payment_webhook_events")[0]).toMatchObject({
      provider_event_id: "evt_alert",
      status: "failed",
      processing_error: "order_not_claimed",
    });
  });

  it("does not send a second alert when the same event is redelivered", async () => {
    const payload = successEvent("evt_redelivery");

    expect((await POST(signed(payload))).status).toBe(200);
    const duplicate = await POST(signed(payload));

    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toEqual({ received: true, failed: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const failedUpdates = db.writes.filter((write) => {
      if (write.table !== "payment_webhook_events" || write.op !== "update") return false;
      const patch = write.payload;
      return !Array.isArray(patch) && patch?.status === "failed";
    });
    expect(failedUpdates.map((write) => write.matched)).toEqual([1, 0]);
    expect(failedUpdates[1].filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: "neq", column: "status", value: "failed" }),
      ])
    );
  });

  it("still returns 200 when sending the alert throws", async () => {
    sendMock.mockRejectedValue(
      new Error("send failed buyer@example.com Ada Lovelace client_secret raw-payload-marker")
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(signed(successEvent("evt_throw_alert")));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true, failed: true });
    expectNoBuyerData(body);
    expectNoBuyerData(errorSpy.mock.calls);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("send failed");
    expect(errorSpy).toHaveBeenCalledWith(
      "[airwallex-webhook] unmatched payment alert failed",
      expect.objectContaining({
        orderId: "order-1",
        merchantOrderId: "order-1",
        paymentIntentId: "int_1",
        webhookEventId: "evt_throw_alert",
      })
    );
    expect(db.rowsOf("payment_webhook_events")[0]).toMatchObject({ status: "failed" });
    errorSpy.mockRestore();
  });

  it("alerts once for a missing webhook row and skips the same event id", async () => {
    db.seed("payment_webhook_events", [
      {
        provider: "airwallex",
        provider_event_id: "evt_null_row",
        event_name: "payment_intent.succeeded",
        payload: {
          raw_payload_marker: "raw-payload-marker",
          client_secret: "cs_live_should_not_leak",
          customer_email: "buyer@example.com",
        },
        status: "received",
        received_at: new Date().toISOString(),
      },
    ]);

    const first = await POST(signed(successEvent("evt_null_row")));
    const second = await POST(signed(successEvent("evt_null_row")));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expectNoBuyerData(sentMail()[0]);
    expect(db.rowsOf("payment_webhook_events")).toHaveLength(1);
    expect(db.rowsOf("payment_webhook_events")[0].status).toBe("received");
  });
});
