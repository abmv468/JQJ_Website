import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { releaseExpiredAirwallexReservations } from "@/lib/payments/airwallex-orders";

export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "no-store" } };

function secretsMatch(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

/** Raw header compare. The secret and header are not trimmed. */
function cronRequestAuthorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  return secretsMatch(header, `Bearer ${secret}`);
}

export async function GET(req: Request) {
  if (!cronRequestAuthorized(req.headers.get("authorization"))) {
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
