import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCronRequest } from "@/lib/payments/cron-auth";
import { releaseExpiredAirwallexReservations } from "@/lib/payments/airwallex-orders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(req: Request) {
  const decision = authorizeCronRequest(req.headers.get("authorization"), process.env.CRON_SECRET);
  if (!decision.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, ...noStore });
  }

  try {
    await releaseExpiredAirwallexReservations(createAdminClient());
    return NextResponse.json({ ok: true }, noStore);
  } catch {
    console.error("[cron-release-reservations] release failed");
    return NextResponse.json({ error: "Reservation release failed" }, { status: 500, ...noStore });
  }
}
