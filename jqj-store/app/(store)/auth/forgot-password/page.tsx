"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function getRedirectUrl(path: string) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const base = siteUrl && siteUrl.length > 0 ? siteUrl : window.location.origin;
    return new URL(path, base).toString();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getRedirectUrl("/auth/reset-password"),
      });
      if (error) throw error;

      setSuccessMessage(
        "If an account exists for this email, a password reset link has been sent."
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unable to send reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-site flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-md border border-brand-border p-8">
        <h1 className="mb-2 text-center font-heading text-xl uppercase tracking-wider2">
          Reset Password
        </h1>
        <p className="mb-6 text-center text-sm text-brand-muted">
          Enter your email and we&apos;ll send a reset link.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
          />
          <button type="submit" disabled={loading} className="btn-gold w-full disabled:opacity-60">
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>

        {successMessage && <p className="mt-4 text-center text-sm text-brand-gold">{successMessage}</p>}
        {errorMessage && <p className="mt-4 text-center text-sm text-red-400">{errorMessage}</p>}

        <div className="mt-6 text-center text-sm">
          <Link href="/auth/login" className="text-brand-muted hover:text-white">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
