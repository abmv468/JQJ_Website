import Image from "next/image";
import Link from "next/link";
import { Lock } from "lucide-react";
import {
  BACK_TO_BAG_HREF,
  BACK_TO_BAG_LABEL,
  CHECKOUT_LOGO_ALT,
  CHECKOUT_LOGO_HOME_LABEL,
  CHECKOUT_POLICY_LINKS,
  SECURE_CHECKOUT_LABEL,
} from "@/lib/checkout-copy";

export function CheckoutHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div className="container-site grid h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <Link
          href={BACK_TO_BAG_HREF}
          className="justify-self-start whitespace-nowrap text-sm text-white/80 underline-offset-4 transition-colors hover:text-white hover:underline"
        >
          {BACK_TO_BAG_LABEL}
        </Link>
        <Link href="/" aria-label={CHECKOUT_LOGO_HOME_LABEL} className="shrink-0">
          <Image
            src="/JQD-logo.png"
            alt={CHECKOUT_LOGO_ALT}
            width={56}
            height={56}
            priority
            className="h-10 w-10 rounded-full object-cover"
          />
        </Link>
        <p className="flex items-center justify-self-end gap-1.5 whitespace-nowrap text-sm text-white/72">
          <Lock className="h-3.5 w-3.5 shrink-0 text-brand-gold" aria-hidden="true" />
          {SECURE_CHECKOUT_LABEL}
        </p>
      </div>
    </header>
  );
}

export function CheckoutFooter() {
  return (
    <footer className="mt-16 border-t border-white/8">
      <nav className="container-site flex flex-wrap items-center justify-center gap-x-6 gap-y-1 py-4">
        {CHECKOUT_POLICY_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex min-h-11 items-center text-sm text-white/70 transition-colors hover:text-white"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
