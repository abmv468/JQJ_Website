import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_req: Request) {
  return NextResponse.json(
    { error: "This payment method is no longer available." },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
