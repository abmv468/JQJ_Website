import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { sanitizeNextPath } from "@/lib/auth/sanitize-next-path";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
      return redirectWithStatus(requestUrl.origin, "error", error.message, next);
    }

    return redirectWithStatus(requestUrl.origin, "success", "Your email has been verified.", next);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return redirectWithStatus(requestUrl.origin, "error", error.message, next);
    }

    return redirectWithStatus(
      requestUrl.origin,
      "success",
      "Verification complete. You can continue.",
      next
    );
  }

  return redirectWithStatus(
    requestUrl.origin,
    "invalid",
    "Missing verification token. Please use the latest link from your email.",
    next
  );
}
