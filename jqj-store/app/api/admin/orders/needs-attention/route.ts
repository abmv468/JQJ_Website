import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProtectedOrder, PROTECTED_ORDER_ALERT_EVENT } from "@/lib/payments/airwallex-orders";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const PAGE_LIMIT = 100;

type AttentionRow = {
  id: string;
  created_at: string | null;
  total_amount: number | string | null;
  refunded_amount?: number | string | null;
  currency: string | null;
  status: string | null;
  sales_channel: string | null;
  payment_status: string | null;
  fulfillment_status: string | null;
};

function money(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function refundCoversCapturedPayment(order: AttentionRow, paymentAmount: unknown) {
  const captured = money(paymentAmount) ?? money(order.total_amount);
  if (captured == null) return false;
  const refunded = money(order.refunded_amount) ?? 0;
  return refunded >= captured;
}

function attentionReason(row: AttentionRow) {
  if (isProtectedOrder(row)) return PROTECTED_ORDER_ALERT_EVENT;
  return "inventory_exception";
}

function embeddedOrder(value: AttentionRow | AttentionRow[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function GET(req: Request) {
  try {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const supabase = createAdminClient();
    const columns =
      "id, created_at, total_amount, refunded_amount, currency, status, sales_channel, payment_status, fulfillment_status";
    const listed = supabase
      .from("orders")
      .select(columns)
      .eq("payment_status", "succeeded")
      .eq("status", "inventory_exception")
      .order("created_at", { ascending: false })
      .limit(PAGE_LIMIT + 1);
    const protectedByPayment = supabase
      .from("payments")
      .select(`amount, orders!inner(${columns})`)
      .eq("status", "succeeded");
    const [byOrder, byPayment] = await Promise.all([listed, protectedByPayment]);
    if (byOrder.error) throw byOrder.error;
    if (byPayment.error) throw byPayment.error;

    const merged = new Map<string, AttentionRow>();
    for (const row of (byOrder.data ?? []) as AttentionRow[]) merged.set(row.id, row);
    for (const row of (byPayment.data ?? []) as Array<{
      amount?: number | string | null;
      orders?: AttentionRow | AttentionRow[] | null;
    }>) {
      const order = embeddedOrder(row.orders);
      if (!order || !isProtectedOrder(order)) continue;
      if (refundCoversCapturedPayment(order, row.amount)) continue;
      merged.set(order.id, order);
    }
    const rows = [...merged.values()].sort((left, right) =>
      String(right.created_at ?? "").localeCompare(String(left.created_at ?? ""))
    );
    const truncated = rows.length > PAGE_LIMIT;
    const orders = rows.slice(0, PAGE_LIMIT).map((row) => ({
      id: row.id,
      created_at: row.created_at,
      total: row.total_amount == null ? null : Number(row.total_amount),
      currency: row.currency,
      status: row.status,
      payment_status: row.payment_status,
      fulfillment_status: row.fulfillment_status,
      reason: attentionReason(row),
    }));

    return NextResponse.json({ orders, truncated }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: noStore });
  }
}
