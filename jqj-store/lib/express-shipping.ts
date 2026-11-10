import { NextResponse } from "next/server";

/** Off unless the env var is exactly "true". Unset and every other value are off. */
export function isExpressShippingEnabled(): boolean {
  return process.env.EXPRESS_SHIPPING_ENABLED === "true";
}

export const SHIPPING_METHOD_UNAVAILABLE_MESSAGE = "That shipping option is unavailable.";

/** Omitted, blank, and "standard" are the flat-rate method. Anything else is non-standard. */
export function isNonStandardShippingMethod(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value !== "string") return true;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized !== "standard";
}

/**
 * 400 before checkout writes or payment calls when the paid option is hidden
 * and the request asks for anything other than standard.
 */
export function rejectUnavailableShippingMethod(shippingMethod: unknown): NextResponse | null {
  if (!isNonStandardShippingMethod(shippingMethod) || isExpressShippingEnabled()) return null;
  return NextResponse.json(
    { error: SHIPPING_METHOD_UNAVAILABLE_MESSAGE },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  );
}
