import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOrderEmails } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { sessionId } = (await req.json()) as { sessionId: string };
    if (!sessionId) {
      return NextResponse.json({ error: "Missing session id" }, { status: 400 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"],
    });

    if (session.payment_status !== "paid") {
      return NextResponse.json({ error: "Payment not completed" }, { status: 402 });
    }

    const meta = session.metadata ?? {};
    const shipping = Number(meta.shipping || 0);
    const total = (session.amount_total ?? 0) / 100;
    const subtotal = total - shipping;
    const customerEmail = session.customer_details?.email || "";
    const customerName = meta.customerName || session.customer_details?.name || "";

    let items: { id: string; n: string; p: number; q: number }[] = [];
    try {
      items = JSON.parse(meta.items || "[]");
    } catch {
      items = [];
    }

    const shippingAddress = {
      address: meta.address || "",
      apartment: meta.apartment || "",
      city: meta.city || "",
      region: meta.region || "",
      country: meta.country || "",
      payment_method: "stripe" as const,
    };

    let orderId = session.id;

    try {
      const supabase = createAdminClient();

      // Idempotency: don't double-create on repeated verify calls.
      const { data: existing } = await supabase
        .from("orders")
        .select("id")
        .eq("stripe_session_id", session.id)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ orderId: existing.id });
      }

      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          status: "processing",
          total_amount: total,
          shipping_amount: shipping,
          shipping_address: shippingAddress,
          customer_email: customerEmail,
          customer_name: customerName,
          stripe_session_id: session.id,
        })
        .select("id")
        .single();

      if (error) throw error;
      orderId = order.id;

      if (items.length) {
        await supabase.from("order_items").insert(
          items.map((i) => ({
            order_id: orderId,
            product_name: i.n,
            quantity: i.q,
            price_at_purchase: i.p,
          }))
        );
      }
    } catch (dbErr) {
      console.warn("[verify] Supabase persist skipped:", dbErr);
    }

    await sendOrderEmails({
      orderId,
      customerName,
      customerEmail,
      items: items.map((i) => ({ name: i.n, quantity: i.q, price: i.p })),
      subtotal,
      shipping,
      total,
      paymentMethod: "stripe",
      shippingAddress,
    });

    return NextResponse.json({ orderId }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[verify]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verification failed" },
      { status: 500 }
    );
  }
}
