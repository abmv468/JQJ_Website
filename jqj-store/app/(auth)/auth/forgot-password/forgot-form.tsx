"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import InboxPanel from "@/components/auth/InboxPanel";
import { readNoticeEmail } from "@/lib/auth/notice";
import { plainAuthError } from "@/lib/auth/plain-error";
import { authRedirectUrl } from "@/lib/auth/redirect-url";
import { createClient } from "@/lib/supabase/client";

const RESET_ERROR = "We couldn\u2019t send a reset link. Please try again.";

export default function ForgotPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inboxEmail, setInboxEmail] = useState<string | null>(null);
  const [resendNote, setResendNote] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sent = readNoticeEmail(params.get("notice"), params.get("email"), "reset");
    if (sent) setInboxEmail(sent);
  }, []);

  async function sendReset(address: string) {
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: authRedirectUrl("/auth/reset-password", window.location.origin),
    });
    if (error) throw error;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);
    const address = email.trim();

    try {
      await sendReset(address);
      const params = new URLSearchParams(window.location.search);
      params.set("notice", "reset");
      params.set("email", address);
      setInboxEmail(address);
      setResendNote(null);
      router.replace(`/auth/forgot-password?${params.toString()}`);
    } catch (err) {
      setErrorMessage(plainAuthError(err, RESET_ERROR));
    } finally {
      setLoading(false);
    }
  }

  async function resendReset() {
    if (!inboxEmail) return;
    setErrorMessage(null);
    setResendNote(null);
    setLoading(true);
    try {
      await sendReset(inboxEmail);
      setResendNote("Another email is on its way.");
    } catch (err) {
      setErrorMessage(plainAuthError(err, RESET_ERROR));
    } finally {
      setLoading(false);
    }
  }

  if (inboxEmail) {
    return (
      <InboxPanel
        email={inboxEmail}
        intro="We sent a reset link to"
        actionLabel="Resend reset link"
        onAction={resendReset}
        pending={loading}
        error={errorMessage}
        statusNote={resendNote}
        backHref="/auth/login"
      />
    );
  }

  return (
    <main className="center-frame" data-auth-view="forgot">
      <form className="form-card fade-in" onSubmit={handleSubmit}>
        <h1 className="page-title">Forgot password</h1>
        <p className="page-lead">Enter your email and we will send a reset link.</p>
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
        <button type="submit" className="btn-primary" disabled={loading} aria-busy={loading}>
          Send reset link
        </button>
        {errorMessage ? (
          <p className="form-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className="secondary-row">
          <Link href="/auth/login" className="text-link">
            Back to sign in
          </Link>
        </div>
      </form>
    </main>
  );
}
