import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { convertUsdToCurrency, normalizeCurrency, toStripeCurrency } from "@/lib/currency";
import {
  fetchInventoryBySlugs,
  validateCheckoutItems,
  type CheckoutItemInput,
} from "@/lib/inventory";

export const dynamic = "force-dynamic";
const SHIPPING_FLAT = 15;

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
    const { items, customer, currency } = (await req.json()) as {
      items: CheckoutItemInput[];
      customer: Record<string, string>;
      currency?: string;
    };

    if (!items?.length) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    const shippingAmount = items.length ? SHIPPING_FLAT : 0;
    const selectedCurrency = normalizeCurrency(currency);
    const stripeCurrency = toStripeCurrency(selectedCurrency);

    const supabase = createAdminClient();
    const slugs = Array.from(new Set(items.map((item) => item.slug).filter(Boolean) as string[]));
    const inventoryBySlug = await fetchInventoryBySlugs(supabase, slugs);
    const validation = validateCheckoutItems(items, inventoryBySlug);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.errors[0] || "Insufficient stock" }, { status: 409 });
    }

    const stripe = getStripe();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const userId = await getAuthenticatedUserId();

    const line_items = validation.resolved.map((line) => ({
      price_data: {
        currency: stripeCurrency,
        product_data: {
          name:
            line.product.name +
            ((line.variant?.size || line.variant?.material)
              ? ` (${[line.variant?.size, line.variant?.material].filter(Boolean).join(" / ")})`
              : ""),
        },
        unit_amount: Math.round(convertUsdToCurrency(line.product.price, selectedCurrency) * 100),
      },
      quantity: line.requestedQuantity,
    }));

    if (shippingAmount > 0) {
      line_items.push({
        price_data: {
          currency: stripeCurrency,
          product_data: { name: "Shipping (UPS Express)" },
          unit_amount: Math.round(convertUsdToCurrency(shippingAmount, selectedCurrency) * 100),
        },
        quantity: 1,
      });
    }

    const serializedItems = JSON.stringify(
      validation.resolved.map((line) => ({
        id: line.item.id,
        s: line.product.slug,
        n: line.product.name,
        p: line.product.price,
        q: line.requestedQuantity,
        sz: line.variant?.size ?? line.item.size,
        m: line.variant?.material ?? line.item.material,
        sku: line.variant?.sku ?? line.item.sku,
      }))
    );

    if (serializedItems.length > 4900) {
      return NextResponse.json(
        { error: "Cart payload is too large for checkout. Please reduce item count and retry." },
        { status: 400 }
      );
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
        shipping: String(shippingAmount),
        currency: selectedCurrency,
        items: serializedItems,
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
