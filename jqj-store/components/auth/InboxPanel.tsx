"use client";

import Link from "next/link";

export default function InboxPanel({
  email,
  intro,
  actionLabel,
  onAction,
  pending,
  error,
  statusNote,
  backHref,
}: {
  email: string;
  intro: string;
  actionLabel: string;
  onAction: () => void;
  pending: boolean;
  error: string | null;
  statusNote: string | null;
  backHref: string;
}) {
  return (
    <main className="center-frame" data-auth-view="inbox">
      <div className="form-card fade-in">
        <h1 className="page-title">Check your inbox</h1>
        <p className="page-lead">
          {intro} <span className="addr">{email}</span>.
          <br />
          It may take a few minutes, and it can land in spam.
        </p>
        <button type="button" className="btn-primary" onClick={onAction} disabled={pending} aria-busy={pending}>
          {actionLabel}
        </button>
        {statusNote ? (
          <p className="note" role="status">
            {statusNote}
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="secondary-row">
          <Link href={backHref} className="text-link">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
