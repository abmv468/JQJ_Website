import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { sanitizeNextPath } from "@/lib/auth/sanitize-next-path";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CONFIRMED = "Your email is confirmed.";
const CONFIRM_FAILED = "This confirmation link is invalid or has expired.";

function redirectWithStatus(origin: string, status: string, message: string, next = "/account") {
  const search = new URLSearchParams({ status, message, next });
  return NextResponse.redirect(new URL(`/auth/verify?${search.toString()}`, origin));
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const code = requestUrl.searchParams.get("code");
  const next = sanitizeNextPath(requestUrl.searchParams.get("next"));
  const supabase = createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    });

    if (error) {
      return redirectWithStatus(requestUrl.origin, "error", CONFIRM_FAILED, next);
    }

    return redirectWithStatus(requestUrl.origin, "success", CONFIRMED, next);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return redirectWithStatus(requestUrl.origin, "error", CONFIRM_FAILED, next);
    }

    return redirectWithStatus(requestUrl.origin, "success", CONFIRMED, next);
  }

  return redirectWithStatus(requestUrl.origin, "invalid", CONFIRM_FAILED, next);
}
