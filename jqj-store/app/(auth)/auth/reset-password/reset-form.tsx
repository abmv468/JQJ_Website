"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { meetsShownPasswordConditions, showPasswordRequirementCheck } from "@/lib/auth/password-rules";
import {
  PASSWORD_BREACHED,
  PASSWORD_TOO_EASY,
  PASSWORDS_DO_NOT_MATCH,
  PASSWORD_TOO_SHORT,
  plainAuthError,
} from "@/lib/auth/plain-error";
import { createClient } from "@/lib/supabase/client";

const RESET_ERROR = "We couldn\u2019t reset your password. Please try again.";

function RequirementCheck() {
  return (
    <svg className="req-check" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.5 12.5 L9.5 17.5 L19.5 6.5" />
    </svg>
  );
}

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"form" | "invalid">("form");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

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

  const showCheck = showPasswordRequirementCheck(password, passwordError);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setConfirmError(null);
    setFormError(null);

    if (password.length < 6) {
      setPasswordError(PASSWORD_TOO_SHORT);
      return;
    }

    if (!meetsShownPasswordConditions(password)) {
      setPasswordError(PASSWORD_TOO_EASY);
      return;
    }

    if (password !== confirmPassword) {
      setConfirmError(PASSWORDS_DO_NOT_MATCH);
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
      const message = plainAuthError(err, RESET_ERROR);
      if (message === PASSWORD_TOO_SHORT || message === PASSWORD_TOO_EASY || message === PASSWORD_BREACHED) {
        setPasswordError(message);
      } else if (message === PASSWORDS_DO_NOT_MATCH) {
        setConfirmError(message);
      } else {
        setFormError(message);
      }
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
      <form className="form-card fade-in" onSubmit={handleSubmit} noValidate>
        <h1 className="page-title">Reset password</h1>
        <p className="page-lead">Choose a new password for your account.</p>
        <div className={`field${passwordError ? " is-invalid" : ""}`}>
          <label htmlFor="password">New password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby="password-requirements password-error"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordError(null);
            }}
          />
          {passwordError ? (
            <p id="password-error" className="field-error" role="alert">
              {passwordError}
            </p>
          ) : null}
        </div>
        <div className="req-block" id="password-requirements">
          <ul className="req-list">
            <li>At least 6 characters.</li>
            <li>Must not be a commonly used or leaked password.</li>
          </ul>
          {showCheck ? (
            <span className="req-mark">
              <RequirementCheck />
              <span className="sr-only">Requirements met</span>
            </span>
          ) : null}
        </div>
        <div className={`field${confirmError ? " is-invalid" : ""}`}>
          <label htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            aria-invalid={confirmError ? true : undefined}
            aria-describedby={confirmError ? "confirm-error" : undefined}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setConfirmError(null);
            }}
          />
          {confirmError ? (
            <p id="confirm-error" className="field-error" role="alert">
              {confirmError}
            </p>
          ) : null}
        </div>
        <button type="submit" className="btn-primary" disabled={loading} aria-busy={loading}>
          Reset password
        </button>
        {formError ? (
          <p className="field-error" role="alert">
            {formError}
          </p>
        ) : null}
      </form>
    </main>
  );
}
