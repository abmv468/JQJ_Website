import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/payment-webhook-backstop/route";
import { createCheckoutDb, setActiveDb, type MemoryDb } from "../helpers/memory-db";

const sendMock = vi.hoisted(() => vi.fn());

vi.mock("resend", () => {
  return {
    Resend: class {
      emails = { send: sendMock };
    },
  };
});

const FORBIDDEN = [
  "buyer@example.com",
  "Ada Lovelace",
  "1 Atelier Lane",
  "client_secret",
  "cs_live_should_not_leak",
  "raw-payload-marker",
];

function cronRequest(authorization?: string) {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("http://localhost:3000/api/cron/payment-webhook-backstop", { headers });
}

function isoHoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function isoMinutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function webhookRow(overrides: Record<string, unknown>) {
  return {
    provider: "airwallex",
    event_name: "payment_intent.succeeded",
    payload: {
      raw_payload_marker: "raw-payload-marker",
      client_secret: "cs_live_should_not_leak",
      customer_email: "buyer@example.com",
      customer_name: "Ada Lovelace",
      shipping_address: "1 Atelier Lane",
    },
    processing_error: "buyer@example.com Ada Lovelace 1 Atelier Lane client_secret raw-payload-marker",
    received_at: isoMinutesAgo(1),
    ...overrides,
  };
}

function expectNoBuyerData(value: unknown) {
  const rendered = JSON.stringify(value);
  for (const secret of FORBIDDEN) {
    expect(rendered).not.toContain(secret);
  }
}

describe("payment webhook backstop cron", () => {
  let db: MemoryDb;
  let previousEnv: Record<string, string | undefined>;

  beforeEach(() => {
    previousEnv = {
      CRON_SECRET: process.env.CRON_SECRET,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      ADMIN_EMAIL: process.env.ADMIN_EMAIL,
      EMAIL_FROM: process.env.EMAIL_FROM,
    };
    db = createCheckoutDb();
    setActiveDb(db);
    process.env.CRON_SECRET = "cron_test_secret";
    process.env.RESEND_API_KEY = "re_test_dummy";
    process.env.ADMIN_EMAIL = "ops@internal.example";
    process.env.EMAIL_FROM = "orders@jqd.app";
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "email_1" }, error: null });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("registers a once-a-day cron and reads with the service role", () => {
    const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    expect(config.crons).toEqual([
      { path: "/api/cron/payment-webhook-backstop", schedule: "0 1 * * *" },
    ]);
    const source = readFileSync(
      new URL("../../app/api/cron/payment-webhook-backstop/route.ts", import.meta.url),
      "utf8"
    );
    expect(source).toContain("createAdminClient");
    expect(source).not.toContain("@/lib/supabase/server");
    expect(source).not.toContain("@/lib/supabase/client");
    expect(source).not.toContain("payload");
    expect(source).not.toContain("processing_error");
  });

  it("returns 401 when the bearer is missing", async () => {
    db.seed("payment_webhook_events", [
      webhookRow({
        id: "row-failed",
        provider_event_id: "evt_failed_recent",
        status: "failed",
        received_at: isoMinutesAgo(5),
      }),
    ]);

    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ ok: false, count: 0 });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the bearer is wrong", async () => {
    const shortToken = await GET(cronRequest("Bearer no"));
    const longToken = await GET(cronRequest(`Bearer ${"x".repeat(80)}`));

    expect(shortToken.status).toBe(401);
    expect(longToken.status).toBe(401);
    await expect(shortToken.json()).resolves.toEqual({ ok: false, count: 0 });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(cronRequest("Bearer cron_test_secret"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, count: 0 });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("stays silent when nothing is failed or stuck", async () => {
    db.seed("payment_webhook_events", [
      webhookRow({
        id: "row-old-failed",
        provider_event_id: "evt_old_failed",
        status: "failed",
        received_at: isoHoursAgo(26),
      }),
      webhookRow({
        id: "row-fresh",
        provider_event_id: "evt_fresh_received",
        status: "received",
        received_at: isoMinutesAgo(5),
      }),
      webhookRow({
        id: "row-processed",
        provider_event_id: "evt_processed",
        status: "processed",
        received_at: isoHoursAgo(2),
      }),
    ]);

    const response = await GET(cronRequest("Bearer cron_test_secret"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, count: 0 });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns the count when the alert send throws", async () => {
    sendMock.mockRejectedValue(
      new Error("send failed buyer@example.com Ada Lovelace client_secret raw-payload-marker")
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.seed("payment_webhook_events", [
      webhookRow({
        id: "row-failed",
        provider_event_id: "evt_failed_recent",
        order_id: "order-1",
        payment_id: "pay-1",
        status: "failed",
        received_at: isoMinutesAgo(10),
      }),
    ]);

    const response = await GET(cronRequest("Bearer cron_test_secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, count: 1 });
    expectNoBuyerData(body);
    expectNoBuyerData(errorSpy.mock.calls);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("send failed");
    expect(errorSpy).toHaveBeenCalledWith(
      "[payment-webhook-backstop] alert failed",
      expect.objectContaining({ failedIds: ["row-failed"] })
    );
    errorSpy.mockRestore();
  });

  it("emails ids only when a recent failed row or a stuck row exists", async () => {
    db.seed("payment_webhook_events", [
      webhookRow({
        id: "row-failed",
        provider_event_id: "evt_failed_recent",
        order_id: "order-1",
        payment_id: "pay-1",
        status: "failed",
        received_at: isoMinutesAgo(10),
      }),
      webhookRow({
        id: "row-old-failed",
        provider_event_id: "evt_old_failed",
        status: "failed",
        received_at: isoHoursAgo(26),
      }),
      webhookRow({
        id: "row-stuck",
        provider_event_id: "evt_stuck_received",
        order_id: "order-2",
        payment_id: "pay-2",
        status: "received",
        received_at: isoMinutesAgo(45),
      }),
      webhookRow({
        id: "row-processing",
        provider_event_id: "evt_stuck_processing",
        status: "processing",
        received_at: isoMinutesAgo(45),
      }),
    ]);

    const response = await GET(cronRequest("Bearer cron_test_secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, count: 3 });
    expect(Object.keys(body).sort()).toEqual(["count", "ok"]);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const message = sendMock.mock.calls[0][0] as { to: string; subject: string; text: string; html: string };
    expect(message.to).toBe("ops@internal.example");
    expect(message.subject).toBe("[JQD] Payment webhook backlog");
    expect(message.text).toContain("failed: 1");
    expect(message.text).toContain("stuck: 2");
    expect(message.text).toContain("webhookEventId: evt_failed_recent");
    expect(message.text).toContain("rowId: row-failed");
    expect(message.text).toContain("orderId: order-1");
    expect(message.text).toContain("paymentId: pay-1");
    expect(message.text).toContain("webhookEventId: evt_stuck_received");
    expect(message.text).toContain("webhookEventId: evt_stuck_processing");
    expect(message.text).not.toContain("evt_old_failed");
    expectNoBuyerData(message);
    expectNoBuyerData(body);
  });
});
