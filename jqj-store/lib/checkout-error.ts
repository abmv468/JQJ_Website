import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

const CUSTOMER_MESSAGE = "Something went wrong. Please try again.";

export function checkoutErrorResponse(scope: string, error: unknown) {
  const reference = randomBytes(4).toString("hex");
  console.error(`[${scope}] ${reference}`, error);
  return NextResponse.json(
    { error: CUSTOMER_MESSAGE, reference },
    { status: 500, headers: { "Cache-Control": "no-store" } }
  );
}
