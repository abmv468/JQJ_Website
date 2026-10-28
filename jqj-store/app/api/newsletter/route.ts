import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!emailPattern.test(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("newsletter_subscribers").upsert(
      { email, source: "storefront" },
      { onConflict: "email" }
    );

    if (error) throw error;

    return NextResponse.json(
      { message: "You are on the list. Watch for new releases and collector updates." },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[newsletter] Failed to subscribe", error);
    return NextResponse.json(
      { error: "We could not subscribe you. Please try again." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}