import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

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

    const stripe = getStripe();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const userId = await getAuthenticatedUserId();

    const line_items = items.map((item) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: item.name + (item.size ? ` (${item.size})` : ""),
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));

    if (shipping > 0) {
      line_items.push({
        price_data: {
          currency: "usd",
          product_data: { name: "Shipping (UPS Express)" },
          unit_amount: Math.round(shipping * 100),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      customer_email: customer.email,
      success_url: `${siteUrl}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout`,
      metadata: {
        customerName: `${customer.firstName} ${customer.lastName}`.trim(),
        address: customer.address,
        apartment: customer.apartment || "",
        city: customer.city,
        region: customer.region,
        country: customer.country,
        phone: customer.phone || "",
        userId: userId ?? "",
        shipping: String(shipping),
        items: JSON.stringify(
          items.map((i) => ({
            id: i.id,
            pid: asUuid(i.id) ?? "",
            slug: i.slug || "",
            img: i.image || "",
            s: i.size || "",
            n: i.name,
            p: i.price,
            q: i.quantity,
          }))
        ).slice(0, 4900),
      },
    });

    return NextResponse.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[checkout]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout failed" },
      { status: 500 }
    );
  }
}
