import { NextResponse } from "next/server";
import { isExpressShippingEnabled } from "@/lib/express-shipping";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { expressShippingEnabled: isExpressShippingEnabled() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
