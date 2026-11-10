import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROTECTED_ORDER_ALERT_EVENT } from "@/lib/payments/airwallex-orders";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const PAGE_LIMIT = 100;

type AttentionRow = {
  id: string;
  created_at: string | null;
  total_amount: number | string | null;
  currency: string | null;
  status: string | null;
  sales_channel: string | null;
  payment_status: string | null;
  fulfillment_status: string | null;
};

function attentionReason(row: AttentionRow) {
  const status = (row.status ?? "").trim().toLowerCase();
  const channel = (row.sales_channel ?? "").trim().toLowerCase();
  if (status === "cancelled" || channel === "test") return PROTECTED_ORDER_ALERT_EVENT;
  return "inventory_exception";
}

export async function GET(req: Request) {
  try {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, created_at, total_amount, currency, status, sales_channel, payment_status, fulfillment_status"
      )
      .eq("payment_status", "succeeded")
      .or("status.eq.inventory_exception,status.eq.cancelled,sales_channel.eq.test")
      .order("created_at", { ascending: false })
      .limit(PAGE_LIMIT + 1);
    if (error) throw error;

    const rows = (data ?? []) as AttentionRow[];
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
