import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canTransitionOrderStatus,
  isFullyRefunded,
  isOrderStatus,
  normalizeOrderStatus,
} from "@/lib/order-lifecycle";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

async function requireAdmin(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Admin auth is not configured" }, { status: 500 });
  }

  const publicSupabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Missing authentication token" }, { status: 401 });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return NextResponse.json({ error: "Missing authentication token" }, { status: 401 });
  }

  const { data, error } = await publicSupabase.auth.getUser(token);
  if (error || !data.user?.email) {
    return NextResponse.json({ error: "Invalid authentication token" }, { status: 401 });
  }

  if (data.user.email.toLowerCase() !== adminEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}

export async function GET(req: Request) {
  try {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*), order_refunds(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ orders: data }, { headers: noStore });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load orders" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const { id, status } = await req.json();
    if (!id || !status || typeof status !== "string") {
      return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
    }

    const nextStatus = status.trim().toLowerCase();
    if (!isOrderStatus(nextStatus)) {
      return NextResponse.json({ error: "Invalid order status" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: existingError } = await supabase
      .from("orders")
      .select("id, status, total_amount, refunded_amount")
      .eq("id", id)
      .single();

    if (existingError) throw existingError;

    const totalAmount = Number(existing.total_amount ?? 0);
    const refundedAmount = Number(existing.refunded_amount ?? 0);
    const normalizedCurrentStatus = normalizeOrderStatus(existing.status ?? "");

    if (!normalizedCurrentStatus) {
      return NextResponse.json({ error: "Order has unsupported status value" }, { status: 400 });
    }

    if (nextStatus === "refunded" && !isFullyRefunded(totalAmount, refundedAmount)) {
      return NextResponse.json(
        { error: "Order can be marked refunded only when total refunded amount is complete" },
        { status: 400 }
      );
    }

    if (!canTransitionOrderStatus(normalizedCurrentStatus, nextStatus)) {
      return NextResponse.json(
        { error: `Invalid status transition from ${normalizedCurrentStatus} to ${nextStatus}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("orders")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ order: data }, { headers: noStore });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update order" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const authError = await requireAdmin(req);
    if (authError) return authError;

    const { id, amount, reason } = await req.json();
    const parsedAmount = Number(amount);

    if (!id || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: "Missing id or valid refund amount" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: existingError } = await supabase
      .from("orders")
      .select("id, status, total_amount, refunded_amount")
      .eq("id", id)
      .single();

    if (existingError) throw existingError;

    const totalAmount = Number(existing.total_amount ?? 0);
    const refundedAmount = Number(existing.refunded_amount ?? 0);
    const normalizedCurrentStatus = normalizeOrderStatus(existing.status ?? "");

    if (!normalizedCurrentStatus || normalizedCurrentStatus === "refunded") {
      return NextResponse.json({ error: "Order is already fully refunded" }, { status: 400 });
    }

    const remaining = Math.max(totalAmount - refundedAmount, 0);
    if (parsedAmount > remaining) {
      return NextResponse.json(
        { error: `Refund amount exceeds remaining refundable balance (${remaining.toFixed(2)})` },
        { status: 400 }
      );
    }

    const { error: refundError } = await supabase.rpc("apply_order_refund", {
      p_order_id: id,
      p_amount: parsedAmount,
      p_reason: typeof reason === "string" ? reason : null,
    });

    if (refundError) {
      return NextResponse.json({ error: refundError.message }, { status: 400 });
    }

    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .select("*, order_items(*), order_refunds(*)")
      .eq("id", id)
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ order: updatedOrder }, { headers: noStore });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process refund" },
      { status: 500 }
    );
  }
}
