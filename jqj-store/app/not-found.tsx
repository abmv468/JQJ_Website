import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center bg-brand-bg text-center">
      <p className="font-heading text-6xl text-brand-gold">404</p>
      <h1 className="mt-4 font-heading text-xl uppercase tracking-wider2 text-white">
        Page not found
      </h1>
      <p className="mt-3 text-sm text-brand-muted">
        The piece you are looking for may have moved or sold out.
      </p>
      <Link href="/" className="btn-gold mt-8">
        Back to Home
      </Link>
    </div>
  );
}
