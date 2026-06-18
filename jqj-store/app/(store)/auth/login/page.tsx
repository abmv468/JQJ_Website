"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sanitizeNextPath } from "@/lib/auth/sanitize-next-path";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nextPath, setNextPath] = useState("/account");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    setNextPath(sanitizeNextPath(params.get("next")));
    setStatusMessage(
      status === "password-updated"
        ? "Password updated. Sign in with your new password."
        : status === "email-verified"
          ? "Email verified. You can now sign in."
          : null
    );
  }, []);

  function getRedirectUrl(path: string) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const base = siteUrl && siteUrl.length > 0 ? siteUrl : window.location.origin;
    return new URL(path, base).toString();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (mode === "signup" && password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(nextPath);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getRedirectUrl("/auth/confirm"),
          },
        });
        if (error) throw error;

        if (data.user && data.session) {
          setSuccessMessage("Account created and signed in.");
          router.push(nextPath);
          router.refresh();
          return;
        }

        setSuccessMessage(
          "Account created. Check your email to verify your address before signing in."
        );
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-site flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-md border border-brand-border p-8">
        <div className="mb-8 flex border-b border-brand-border">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex-1 pb-3 text-xs uppercase tracking-wider2 ${
              mode === "signin" ? "border-b-2 border-brand-gold text-white" : "text-brand-muted"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 pb-3 text-xs uppercase tracking-wider2 ${
              mode === "signup" ? "border-b-2 border-brand-gold text-white" : "text-brand-muted"
            }`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field"
          />
          {mode === "signup" && (
            <input
              type="password"
              required
              minLength={6}
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field"
            />
          )}
          <button type="submit" disabled={loading} className="btn-gold w-full disabled:opacity-60">
            {loading ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        {mode === "signin" && (
          <div className="mt-4 text-right">
            <Link href="/auth/forgot-password" className="text-xs text-brand-muted hover:text-white">
              Forgot password?
            </Link>
          </div>
        )}

        {statusMessage && <p className="mt-4 text-center text-sm text-brand-gold">{statusMessage}</p>}
        {successMessage && <p className="mt-4 text-center text-sm text-brand-gold">{successMessage}</p>}
        {errorMessage && <p className="mt-4 text-center text-sm text-red-400">{errorMessage}</p>}
      </div>
    </div>
  );
}
