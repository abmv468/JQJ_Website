"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PASSWORDS_DO_NOT_MATCH, PASSWORD_TOO_SHORT, plainAuthError } from "@/lib/auth/plain-error";
import { createClient } from "@/lib/supabase/client";

const RESET_ERROR = "We couldn\u2019t reset your password. Please try again.";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"form" | "invalid">("form");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkFailed = params.has("error") || params.has("error_description") || params.has("error_code");
    if (linkFailed) {
      setPhase("invalid");
      return;
    }

    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) setPhase("invalid");
    }).catch(() => {
      if (active) setPhase("invalid");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        if (session) setPhase("form");
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
      setErrorMessage(PASSWORD_TOO_SHORT);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage(PASSWORDS_DO_NOT_MATCH);
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setPhase("invalid");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      await supabase.auth.signOut();
      router.push("/auth/login?status=password-updated");
      router.refresh();
    } catch (err) {
      setErrorMessage(plainAuthError(err, RESET_ERROR));
    } finally {
      setLoading(false);
    }
  }

  if (phase === "invalid") {
    return (
      <main className="center-frame" data-auth-view="reset-invalid">
        <div className="form-card fade-in">
          <h1 className="page-title">We couldn{"\u2019"}t use this link</h1>
          <p className="page-lead">This reset link is invalid or has expired.</p>
          <Link href="/auth/forgot-password" className="btn-primary">
            Request a new reset link
          </Link>
          <div className="secondary-row">
            <Link href="/auth/login" className="text-link">
              Back to sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="center-frame" data-auth-view="reset">
      <form className="form-card fade-in" onSubmit={handleSubmit}>
        <h1 className="page-title">Reset password</h1>
        <p className="page-lead">Choose a new password for your account.</p>
        <div className="field">
          <label htmlFor="password">New password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={loading} aria-busy={loading}>
          Reset password
        </button>
        {errorMessage ? (
          <p className="form-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </form>
    </main>
  );
}
