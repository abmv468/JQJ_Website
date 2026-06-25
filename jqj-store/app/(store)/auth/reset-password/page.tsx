"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorDescription = params.get("error_description");
    if (errorDescription) {
      setUrlError(decodeURIComponent(errorDescription.replace(/\+/g, " ")));
    }

    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setHasRecoverySession(Boolean(data.session));
      setCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasRecoverySession(Boolean(session));
        setCheckingSession(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      await supabase.auth.signOut();
      router.push("/auth/login?status=password-updated");
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-site flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-md border border-brand-border p-8">
        <h1 className="mb-2 text-center font-heading text-xl uppercase tracking-wider2">
          Set New Password
        </h1>
        <p className="mb-6 text-center text-sm text-brand-muted">
          Use the link from your email to set a new password.
        </p>

        {checkingSession ? (
          <p className="text-center text-sm text-brand-muted">Checking your reset link…</p>
        ) : hasRecoverySession ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              required
              minLength={6}
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field"
            />
            <button type="submit" disabled={loading} className="btn-gold w-full disabled:opacity-60">
              {loading ? "Saving…" : "Update password"}
            </button>
          </form>
        ) : (
          <div className="space-y-4 text-center text-sm">
            <p className="text-brand-muted">
              This reset link is invalid or expired. Request a new password reset email.
            </p>
            <Link href="/auth/forgot-password" className="btn-secondary w-full">
              Request new reset link
            </Link>
          </div>
        )}

        {(urlError || errorMessage) && (
          <p className="mt-4 text-center text-sm text-red-400">{urlError || errorMessage}</p>
        )}

        <div className="mt-6 text-center text-sm">
          <Link href="/auth/login" className="text-brand-muted hover:text-white">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
