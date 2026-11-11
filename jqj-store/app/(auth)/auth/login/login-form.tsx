"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import InboxPanel from "@/components/auth/InboxPanel";
import { sanitizeNextPath } from "@/lib/auth/sanitize-next-path";
import { loginStatusMessage, readNoticeEmail } from "@/lib/auth/notice";
import { PASSWORDS_DO_NOT_MATCH, plainAuthError } from "@/lib/auth/plain-error";
import { authRedirectUrl } from "@/lib/auth/redirect-url";
import { createClient } from "@/lib/supabase/client";

const SIGN_IN_ERROR = "We couldn\u2019t sign you in. Check your email and password and try again.";
const SIGN_UP_ERROR = "We couldn\u2019t create your account. Check your details and try again.";
const RESEND_ERROR = "We couldn\u2019t resend the confirmation email. Please try again.";

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nextPath, setNextPath] = useState("/account");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [inboxEmail, setInboxEmail] = useState<string | null>(null);
  const [backHref, setBackHref] = useState("/auth/login");
  const [resendNote, setResendNote] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = sanitizeNextPath(params.get("next"));
    setNextPath(next);
    setStatusMessage(loginStatusMessage(params.get("status")));
    const confirmedEmail = readNoticeEmail(params.get("notice"), params.get("email"), "confirm");
    if (confirmedEmail) {
      setInboxEmail(confirmedEmail);
      setBackHref(params.has("next") ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login");
    }
  }, []);

  function showConfirmInbox(address: string) {
    const params = new URLSearchParams(window.location.search);
    params.set("notice", "confirm");
    params.set("email", address);
    params.delete("status");
    const next = sanitizeNextPath(params.get("next"));
    setInboxEmail(address);
    setErrorMessage(null);
    setResendNote(null);
    setBackHref(params.has("next") ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login");
    router.replace(`/auth/login?${params.toString()}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (mode === "signup" && password !== confirmPassword) {
      setErrorMessage(PASSWORDS_DO_NOT_MATCH);
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
            emailRedirectTo: authRedirectUrl("/auth/confirm", window.location.origin),
          },
        });
        if (error) throw error;

        if (data.user && data.session) {
          router.push(nextPath);
          router.refresh();
          return;
        }

        showConfirmInbox(email.trim());
      }
    } catch (err) {
      setErrorMessage(plainAuthError(err, mode === "signin" ? SIGN_IN_ERROR : SIGN_UP_ERROR));
    } finally {
      setLoading(false);
    }
  }

  async function resendConfirmation() {
    if (!inboxEmail) return;
    setErrorMessage(null);
    setResendNote(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: inboxEmail,
        options: {
          emailRedirectTo: authRedirectUrl("/auth/confirm", window.location.origin),
        },
      });
      if (error) throw error;
      setResendNote("Another email is on its way.");
    } catch (err) {
      setErrorMessage(plainAuthError(err, RESEND_ERROR));
    } finally {
      setLoading(false);
    }
  }

  if (inboxEmail) {
    return (
      <InboxPanel
        email={inboxEmail}
        intro="We sent a confirmation link to"
        actionLabel="Resend confirmation email"
        onAction={resendConfirmation}
        pending={loading}
        error={errorMessage}
        statusNote={resendNote}
        backHref={backHref}
      />
    );
  }

  return (
    <main className="login-frame" data-auth-view={mode === "signin" ? "sign-in" : "create"}>
      <aside className="still-life fade-in" aria-label="Product still-life placeholder">
        <div className="still-life-copy">
          <p className="still-life-kicker">Product still-life</p>
          <hr className="still-life-rule" />
          <p className="still-life-text">Placeholder — real JQ photograph to be supplied.</p>
        </div>
      </aside>

      <section className="form-pane fade-in">
        <form className="form-card" onSubmit={handleSubmit}>
          <h1 className="sr-only">{mode === "signin" ? "Sign in" : "Create account"}</h1>
          <p className={statusMessage ? "page-lead is-status" : "page-lead is-tight"}>
            {mode === "signin"
              ? "Welcome back."
              : "Create your account to save pieces and follow your orders."}
          </p>
          {statusMessage ? <p className="status-note">{statusMessage}</p> : null}
          <div className="tabs" role="tablist" aria-label="Account">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signin"}
              className={clsx("tab", mode === "signin" && "is-active")}
              onClick={() => {
                setMode("signin");
                setErrorMessage(null);
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              className={clsx("tab", mode === "signup" && "is-active")}
              onClick={() => {
                setMode("signup");
                setErrorMessage(null);
              }}
            >
              Create Account
            </button>
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {mode === "signup" ? (
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
          ) : null}
          <button type="submit" className="btn-primary" disabled={loading} aria-busy={loading}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
          {mode === "signin" ? (
            <div className="form-footer">
              <Link href="/auth/forgot-password" className="text-link">
                Forgot password?
              </Link>
            </div>
          ) : (
            <p className="fine-print">
              By creating an account you agree to our <Link href="/terms">Terms</Link> and{" "}
              <Link href="/privacy" className="nowrap">
                Privacy Policy
              </Link>
              .
            </p>
          )}
          {errorMessage ? (
            <p className="form-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </form>
      </section>
    </main>
  );
}
