"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Menu, Search, ShoppingBag, User, X } from "lucide-react";
import {
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
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
  const { scrollY } = useScroll();
  const shouldReduceMotion = useReducedMotion();
  const parallaxY = useTransform(scrollY, [0, 500], [0, -8]);
  const tiltX = useTransform(scrollY, [0, 500], [0, -2]);
  const borderColor = useTransform(
    scrollY,
    [0, 320],
    ["rgba(255, 255, 255, 0.18)", "rgba(187, 157, 123, 0.4)"],
  );

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
      <m.header
        className="sticky top-0 z-40 border-b border-white/10 bg-black/45 backdrop-blur-2xl supports-[backdrop-filter]:bg-black/30"
        style={
          shouldReduceMotion
            ? undefined
            : {
                y: parallaxY,
                rotateX: tiltX,
                transformPerspective: 1000,
                borderColor,
              }
        }
      >
        <m.div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0)_20%,rgba(255,255,255,0.16)_50%,rgba(255,255,255,0)_80%)]"
          animate={shouldReduceMotion ? undefined : { x: ["-65%", "55%"] }}
          transition={{
            duration: 22,
            repeat: Number.POSITIVE_INFINITY,
            repeatType: "loop",
            ease: "easeInOut",
          }}
        />
        <div className="container-site relative flex h-16 items-center justify-between">
          <div className="flex flex-1 items-center">
            <button
              type="button"
              aria-label="Open menu"
              className="mr-2 lg:hidden"
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

          <Link href="/" aria-label="JQJ Group home" className="shrink-0">
            <Image
              src="/JQJ-logo.png"
              alt="JQJ Group"
              width={48}
              height={48}
              className="h-11 w-11 rounded-full object-cover"
              priority
            />
          </Link>

          <div className="flex flex-1 items-center justify-end gap-5">
            {signedIn ? (
              <Link href="/account" aria-label="Account" className="hidden sm:block">
                <User className="h-5 w-5 text-white/80 transition-colors hover:text-white" />
              </Link>
            ) : (
              <Link
                href="/auth/login"
                className="hidden text-xs uppercase tracking-wider2 text-white/80 hover:text-white sm:block"
              >
                Sign In
              </Link>
            )}
            <button type="button" aria-label="Search" className="hidden sm:block">
              <Search className="h-5 w-5 text-white/80 transition-colors hover:text-white" />
            </button>
            <button
              type="button"
              aria-label="Cart"
              className="relative"
              onClick={() => setOpen(true)}
            >
              <ShoppingBag className="h-5 w-5 text-white/80 transition-colors hover:text-white" />
              <span
                className={`absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-gold px-1 text-[10px] font-semibold text-black transition-opacity ${
                  itemCount > 0 ? "opacity-100" : "opacity-0"
                }`}
              >
                {itemCount}
              </span>
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-black/70"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-72 border-r border-white/15 bg-brand-surface/95 p-6 backdrop-blur-xl">
              <div className="mb-8 flex items-center justify-between">
                <span className="font-heading text-sm uppercase tracking-wider2">
                  Menu
                </span>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setMobileOpen(false)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex flex-col gap-5">
                {navLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="nav-link text-sm"
                    onClick={() => setMobileOpen(false)}
                  >
                    {l.label}
                  </Link>
                ))}
                <Link
                  href={signedIn ? "/account" : "/auth/login"}
                  className="nav-link text-sm"
                  onClick={() => setMobileOpen(false)}
                >
                  {signedIn ? "Account" : "Sign In"}
                </Link>
                {signedIn && (
                  <button
                    type="button"
                    className="text-left text-sm uppercase tracking-wider2 text-white/80 hover:text-white"
                    onClick={signOut}
                  >
                    Sign Out
                  </button>
                )}
                {signOutError && <p className="text-xs text-red-400">{signOutError}</p>}
              </nav>
            </div>
          </div>
        )}
      </m.header>
    </LazyMotion>
  );
}
