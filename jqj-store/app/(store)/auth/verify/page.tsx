import Link from "next/link";
import { sanitizeNextPath } from "@/lib/auth/sanitize-next-path";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const status =
    typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : "info";
  const message =
    typeof resolvedSearchParams.message === "string"
      ? resolvedSearchParams.message
      : "We could not determine your verification status.";
  const next = sanitizeNextPath(
    typeof resolvedSearchParams.next === "string" ? resolvedSearchParams.next : null
  );

  const isError = status === "error" || status === "invalid";

  return (
    <div className="container-site flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-lg border border-brand-border p-8 text-center">
        <h1 className="mb-3 font-heading text-xl uppercase tracking-wider2">
          {isError ? "Verification issue" : "Verification complete"}
        </h1>
        <p className={`text-sm ${isError ? "text-red-400" : "text-brand-gold"}`}>{message}</p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href={isError ? "/auth/login" : next} className="btn-gold">
            {isError ? "Go to sign in" : "Continue"}
          </Link>
          <Link href="/auth/login" className="btn-secondary">
            Back to sign in
          </Link>
        </div>

        {isError && (
          <p className="mt-6 text-xs text-brand-muted">
            If your link expired, try signing in or request a new verification/reset email.
          </p>
        )}
      </div>
    </div>
  );
}
