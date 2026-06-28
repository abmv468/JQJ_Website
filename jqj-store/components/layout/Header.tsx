"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import { useCart } from "@/context/CartContext";
import { createClient } from "@/lib/supabase/client";

const navLinks = [
  { label: "New", href: "/new" },
  { label: "Limited Edition", href: "/bracelets?tag=limited" },
  { label: "Bracelets", href: "/bracelets" },
  { label: "Necklaces", href: "/necklaces" },
];

export default function Header() {
  const { itemCount, setOpen } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  async function signOut() {
    const supabase = createClient();
    setSignOutError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSignOutError(error.message);
      return;
    }
    setSignedIn(false);
    setMobileOpen(false);
    window.location.href = "/";
  }

  return (
    <LazyMotion features={domAnimation}>
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur-2xl transition-[background-color,border-color,box-shadow] duration-200 ${
          isScrolled
            ? "border-white/10 bg-black/72 shadow-[0_16px_40px_rgba(0,0,0,0.28)] supports-[backdrop-filter]:bg-black/58"
            : "border-white/6 bg-black/40 supports-[backdrop-filter]:bg-black/28"
        }`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"
        />
        <div className="container-site relative flex h-[4.75rem] items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              className="icon-button lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <nav className="hidden items-center gap-7 lg:flex">
              {navLinks.map((l) => (
                <Link key={l.href} href={l.href} className="nav-link">
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>

          <Link href="/" aria-label="JQJ Group home" className="group shrink-0">
            <Image
              src="/JQJ-logo.png"
              alt="JQJ Group"
              width={56}
              height={56}
              className="h-14 w-14 rounded-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              priority
            />
          </Link>

          <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
            {signedIn ? (
              <Link href="/account" aria-label="Account" className="icon-button hidden sm:inline-flex">
                <User className="h-5 w-5" />
              </Link>
            ) : (
              <Link
                href="/auth/login"
                className="hidden px-2 font-heading text-[11px] uppercase text-white/70 transition-colors hover:text-white sm:block"
                style={{ letterSpacing: "0.18em" }}
              >
                Sign In
              </Link>
            )}
            <button
              type="button"
              aria-label="Search coming soon"
              title="Search coming soon"
              disabled
              className="icon-button hidden cursor-not-allowed opacity-50 sm:inline-flex"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Cart"
              className="icon-button relative"
              onClick={() => setOpen(true)}
            >
              <ShoppingBag className="h-5 w-5" />
              <span
                className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-black/10 bg-brand-gold px-1 text-[10px] font-semibold text-black transition-[opacity,transform] ${
                  itemCount > 0 ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
                }`}
              >
                {itemCount}
              </span>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <m.div
              className="fixed inset-0 z-50 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
            >
              <button
                type="button"
                aria-label="Close menu"
                className="absolute inset-0 bg-black/72"
                onClick={() => setMobileOpen(false)}
              />
              <m.div
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, x: -18, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -14, scale: 0.99 }}
                transition={{
                  duration: shouldReduceMotion ? 0 : 0.24,
                  ease: [0.23, 1, 0.32, 1],
                }}
                className="absolute inset-y-3 left-3 right-14 max-w-sm rounded-[1.75rem] border border-white/12 bg-black/88 p-6 shadow-[0_28px_80px_rgba(0,0,0,0.38)] backdrop-blur-2xl"
              >
                <div className="mb-8 flex items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow">Navigation</p>
                    <p className="mt-3 text-sm text-white/64">
                      Explore new releases and collector favorites.
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close menu"
                    className="icon-button h-10 w-10 shrink-0"
                    onClick={() => setMobileOpen(false)}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <nav className="flex flex-col border-t border-white/10 pt-2">
                  {navLinks.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="flex items-center justify-between border-b border-white/8 py-4 font-heading text-sm uppercase text-white/84"
                      style={{ letterSpacing: "0.18em" }}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span>{l.label}</span>
                      <span className="text-white/28">/</span>
                    </Link>
                  ))}
                  <Link
                    href={signedIn ? "/account" : "/auth/login"}
                    className="flex items-center justify-between border-b border-white/8 py-4 font-heading text-sm uppercase text-white/84"
                    style={{ letterSpacing: "0.18em" }}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span>{signedIn ? "Account" : "Sign In"}</span>
                    <span className="text-white/28">/</span>
                  </Link>
                  {signedIn && (
                    <button
                      type="button"
                      className="border-b border-white/8 py-4 text-left font-heading text-sm uppercase text-white/70 transition-colors hover:text-white"
                      style={{ letterSpacing: "0.18em" }}
                      onClick={signOut}
                    >
                      Sign Out
                    </button>
                  )}
                  {signOutError && <p className="pt-4 text-xs text-red-400">{signOutError}</p>}
                </nav>
              </m.div>
            </m.div>
          )}
        </AnimatePresence>
      </header>
    </LazyMotion>
  );
}
