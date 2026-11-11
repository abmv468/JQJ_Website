import type { Metadata } from "next";
import Link from "next/link";
import { sanitizeNextPath } from "@/lib/auth/sanitize-next-path";

export const metadata: Metadata = {
  title: { absolute: "Email confirmation — Jewellery Quintessential" },
};

export default function VerifyPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const status = typeof searchParams.status === "string" ? searchParams.status : "";
  const confirmed = status === "success";
  const next = sanitizeNextPath(typeof searchParams.next === "string" ? searchParams.next : null);

  if (confirmed) {
    return (
      <main className="center-frame" data-auth-view="confirmed">
        <div className="form-card fade-in">
          <h1 className="page-title">Your email is confirmed</h1>
          <p className="page-lead">Welcome to Jewellery Quintessential.</p>
          <Link href={next} className="btn-primary">
            Continue
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="center-frame" data-auth-view="confirm-error">
      <div className="form-card fade-in">
        <h1 className="page-title">We couldn{"\u2019"}t confirm this link</h1>
        <p className="page-lead">This confirmation link is invalid or has expired.</p>
        <Link href="/auth/login" className="btn-primary">
          Back to sign in
        </Link>
        <p className="note">You can request a new confirmation email from the sign-in page.</p>
      </div>
    </main>
  );
}
