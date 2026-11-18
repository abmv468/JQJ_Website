import type { Metadata } from "next";
import Link from "next/link";
import {
  NOT_FOUND_DESCRIPTION,
  NOT_FOUND_TITLE,
  pageSocial,
} from "@/lib/page-social";

export const metadata: Metadata = {
  title: { absolute: NOT_FOUND_TITLE },
  // Next.js injects its own robots meta on a 404. A robots value here becomes
  // a second tag (and a googlebot tag). Leave it null so the injected tag is
  // the only one. scripts/patch-not-found-robots.mjs rewrites that tag to
  // "noindex, nofollow".
  robots: null,
  // A 404 must not canonicalize to the homepage.
  alternates: { canonical: null },
  ...pageSocial({
    title: NOT_FOUND_TITLE,
    description: NOT_FOUND_DESCRIPTION,
    unresolved: true,
  }),
};

export default function NotFound() {
  return (
    <div
      id="main-content"
      className="flex min-h-[70vh] flex-col items-center justify-center bg-brand-bg text-center"
    >
      <p className="font-heading text-6xl text-brand-gold">404</p>
      <h1 className="mt-4 font-heading text-xl uppercase tracking-wider2 text-white">
        Page not found
      </h1>
      <p className="mt-3 text-sm text-brand-muted">{NOT_FOUND_DESCRIPTION}</p>
      <Link href="/" className="btn-gold mt-8">
        Back to Home
      </Link>
    </div>
  );
}
