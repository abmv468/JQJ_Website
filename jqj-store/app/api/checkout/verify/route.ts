import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOrderEmails } from "@/lib/email";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asUuid(value: string | undefined) {
  if (!value) return null;
  return UUID_REGEX.test(value) ? value : null;
}

async function getAuthenticatedUserId() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // No-op in route handlers when cookies cannot be set.
          }
        },
      },
    }
  );
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

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
    const userId = asUuid(meta.userId) ?? (await getAuthenticatedUserId());

    let items: {
      id: string;
      pid?: string;
      slug?: string;
      img?: string;
      s?: string;
      n: string;
      p: number;
      q: number;
    }[] = [];
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
      phone: meta.phone || "",
      payment_method: "stripe" as const,
    };

    let orderId = session.id;

    try {
      const supabase = createAdminClient();

      // Idempotency: don't double-create on repeated verify calls.
      const { data: existing } = await supabase
        .from("orders")
        .select("id, user_id")
        .eq("stripe_session_id", session.id)
        .maybeSingle();

      if (existing) {
        if (!existing.user_id && userId) {
          await supabase.from("orders").update({ user_id: userId }).eq("id", existing.id);
        }
        return NextResponse.json({ orderId: existing.id });
      }

      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          user_id: userId,
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
            product_id: asUuid(i.pid) ?? asUuid(i.id),
            product_name: i.n,
            quantity: i.q,
            price_at_purchase: i.p,
            line_item_meta: {
              cart_item_id: i.id,
              product_slug: i.slug || "",
              image: i.img || "",
              size: i.s || "",
            },
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
