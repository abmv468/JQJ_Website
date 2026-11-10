import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

type AttentionRow = {
  id: string;
  created_at: string | null;
  total_amount: number | string | null;
  currency: string | null;
  status: string | null;
  payment_status: string | null;
  fulfillment_status: string | null;
};

export async function GET(req: Request) {
  try {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select("id, created_at, total_amount, currency, status, payment_status, fulfillment_status")
      .eq("status", "inventory_exception")
      .eq("payment_status", "succeeded")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const orders = ((data ?? []) as AttentionRow[]).map((row) => ({
      id: row.id,
      created_at: row.created_at,
      total: row.total_amount == null ? null : Number(row.total_amount),
      currency: row.currency,
      status: row.status,
      payment_status: row.payment_status,
      fulfillment_status: row.fulfillment_status,
    }));

    return NextResponse.json({ orders }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500, headers: noStore });
  }
}
