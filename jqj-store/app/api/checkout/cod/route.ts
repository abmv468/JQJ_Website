import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOrderEmails } from "@/lib/email";

export const dynamic = "force-dynamic";

const COD_FEE = 20;

interface CheckoutItem {
  id: string;
  slug?: string;
  name: string;
  price: number;
  quantity: number;
  size?: string;
  image?: string;
}

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
    const { items, customer, shipping } = (await req.json()) as {
      items: CheckoutItem[];
      customer: Record<string, string>;
      shipping: number;
    };

    if (!items?.length) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const total = subtotal + (shipping || 0) + COD_FEE;
    const customerName = `${customer.firstName} ${customer.lastName}`.trim();
    const userId = await getAuthenticatedUserId();

    const shippingAddress = {
      address: customer.address,
      apartment: customer.apartment,
      city: customer.city,
      region: customer.region,
      country: customer.country,
      phone: customer.phone,
      payment_method: "cod" as const,
      cod_fee: COD_FEE,
    };

    let orderId = `COD-${Date.now()}`;

    // Persist to Supabase (best-effort — still confirm order in dev without keys).
    try {
      const supabase = createAdminClient();
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          user_id: userId,
          status: "pending",
          total_amount: total,
          shipping_amount: shipping || 0,
          shipping_address: shippingAddress,
          customer_email: customer.email,
          customer_name: customerName,
          stripe_session_id: orderId,
        })
        .select("id")
        .single();

      if (error) throw error;
      orderId = order.id;

      await supabase.from("order_items").insert(
        items.map((i) => ({
          order_id: orderId,
          product_id: asUuid(i.id),
          product_name: i.name,
          quantity: i.quantity,
          price_at_purchase: i.price,
          line_item_meta: {
            cart_item_id: i.id,
            product_slug: i.slug || "",
            image: i.image || "",
            size: i.size || "",
          },
        }))
      );
    } catch (dbErr) {
      console.warn("[cod] Supabase persist skipped:", dbErr);
    }

    await sendOrderEmails({
      orderId,
      customerName,
      customerEmail: customer.email,
      items: items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
      subtotal,
      shipping: shipping || 0,
      codFee: COD_FEE,
      total,
      paymentMethod: "cod",
      shippingAddress,
    });

    return NextResponse.json({ orderId }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[cod]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Order failed" },
      { status: 500 }
    );
  }
}
