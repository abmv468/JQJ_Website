import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendPaymentWebhookBackstopEmail,
  type WebhookBackstopId,
} from "@/lib/email";

export const dynamic = "force-dynamic";

// Once a day from vercel.json at 01:00 UTC (09:00 HKT). Hobby crons cannot run more often.

const FAILED_WINDOW_MS = 25 * 60 * 60 * 1000;
const STUCK_AFTER_MS = 30 * 60 * 1000;
const ID_COLUMNS = "id, provider_event_id, order_id, payment_id, status, received_at";

// Statuses written by the Airwallex webhook are received, processed, ignored,
// and failed. `processing` is not written today; the column is unconstrained
// text, so a row left in that status is still unfinished and counts as stuck.
const STUCK_STATUSES = ["received", "processing"];

interface WebhookIdRow {
  id: string | null;
  provider_event_id: string | null;
  order_id: string | null;
  payment_id: string | null;
  status: string | null;
  received_at: string | null;
}

function secretsMatch(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function cronRequestAuthorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  return secretsMatch(header, `Bearer ${secret}`);
}

function asId(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toBackstopId(row: WebhookIdRow): WebhookBackstopId {
  return {
    rowId: asId(row.id),
    webhookEventId: asId(row.provider_event_id),
    orderId: asId(row.order_id),
    paymentId: asId(row.payment_id),
  };
}

export async function GET(req: Request) {
  if (!cronRequestAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, count: 0 }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = Date.now();
  const failedSince = new Date(now - FAILED_WINDOW_MS).toISOString();
  const stuckBefore = new Date(now - STUCK_AFTER_MS).toISOString();

  const failedQuery = await supabase
    .from("payment_webhook_events")
    .select(ID_COLUMNS, { count: "exact" })
    .eq("status", "failed")
    .gte("received_at", failedSince);

  const stuckQuery = await supabase
    .from("payment_webhook_events")
    .select(ID_COLUMNS, { count: "exact" })
    .in("status", STUCK_STATUSES)
    .lt("received_at", stuckBefore);

  if (failedQuery.error || stuckQuery.error) {
    console.error("[payment-webhook-backstop] read failed");
    return NextResponse.json({ ok: false, count: 0 }, { status: 500 });
  }

  const failedRows = ((failedQuery.data ?? []) as WebhookIdRow[]).map(toBackstopId);
  const stuckRows = ((stuckQuery.data ?? []) as WebhookIdRow[]).map(toBackstopId);
  const failedCount = failedQuery.count ?? failedRows.length;
  const stuckCount = stuckQuery.count ?? stuckRows.length;
  const count = failedCount + stuckCount;

  if (failedCount > 0 || stuckCount > 0) {
    try {
      await sendPaymentWebhookBackstopEmail({
        failedCount,
        stuckCount,
        failed: failedRows,
        stuck: stuckRows,
      });
    } catch {
      console.error("[payment-webhook-backstop] alert failed", {
        failedIds: failedRows.map((row) => row.rowId),
        stuckIds: stuckRows.map((row) => row.rowId),
      });
    }
  }

  return NextResponse.json({ ok: true, count });
}
