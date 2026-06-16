import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// Stripe webhook endpoint. Orders are also created via the verify route on the
// confirmation page; this webhook is a resilient backup and can be extended to
// fulfil orders server-side. Configure STRIPE_WEBHOOK_SECRET to enable.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");

  if (!secret || !signature) {
    return NextResponse.json(
      { received: true, note: "Webhook secret not configured" },
      { status: 200 }
    );
  }

  let event;
  try {
    const stripe = getStripe();
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    console.error("[webhook] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    console.log("[webhook] checkout.session.completed", event.id);
    // Order persistence handled by the verify route; extend here if needed.
  }

  return NextResponse.json({ received: true });
}
