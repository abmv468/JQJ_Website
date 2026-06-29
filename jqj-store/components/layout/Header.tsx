"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChevronDown, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import { useCart } from "@/context/CartContext";
import { useCurrency } from "@/context/CurrencyContext";
import { createClient } from "@/lib/supabase/client";

const navLinks = [
  { label: "New", href: "/new" },
  { label: "Limited Edition", href: "/bracelets?tag=limited" },
  { label: "Bracelets", href: "/bracelets" },
  { label: "Necklaces", href: "/necklaces" },
  { label: "Rings", href: "/rings" },
  { label: "Earrings", href: "/earrings" },
];

type MegaMenuKey = "bracelets" | "necklaces" | "earrings" | "rings";

type CategoryRoute = MegaMenuKey;

type MegaMenuItem = {
  label: string;
  href: string;
};

type MegaMenuConfig = {
  key: MegaMenuKey;
  label: string;
  columns: Array<{
    title: string;
    items: MegaMenuItem[];
  }>;
  card: {
    title: string;
    href: string;
    image: string;
    alt: string;
  };
};

const queryHref = (category: CategoryRoute, query: string) =>
  `/${category}?q=${encodeURIComponent(query)}`;

const tagHref = (category: CategoryRoute, tag: string) =>
  `/${category}?tag=${encodeURIComponent(tag)}`;

const megaMenus: Record<MegaMenuKey, MegaMenuConfig> = {
  earrings: {
    key: "earrings",
    label: "Earrings",
    columns: [
      {
        title: "Style",
        items: [
          { label: "Drops & Dangles", href: queryHref("earrings", "Drops and Dangles") },
          { label: "Hoops & Huggies", href: queryHref("earrings", "Hoops and Huggies") },
          { label: "Solitaire", href: queryHref("earrings", "Solitaire") },
          { label: "Piercing Earrings", href: queryHref("earrings", "Piercing Earrings") },
          { label: "Studs", href: queryHref("earrings", "Stud Earrings") },
          { label: "Suspenders", href: queryHref("earrings", "Ear Suspenders") },
          { label: "Threaders", href: queryHref("earrings", "Threader Earrings") },
        ],
      },
      {
        title: "Collection",
        items: [
          { label: "Bestsellers", href: tagHref("earrings", "top-rated") },
          { label: "Birthstones Series", href: queryHref("earrings", "Birthstones") },
          { label: "Pearl Collective", href: queryHref("earrings", "Pearl") },
          { label: "Sensitive Essentials", href: queryHref("earrings", "Sensitive Essentials") },
          { label: "Waterproof Edit", href: queryHref("earrings", "Waterproof") },
        ],
      },
      {
        title: "Material",
        items: [
          { label: "925 Silver Post", href: queryHref("earrings", "925 Silver Post") },
          { label: "Surgical Steel Post", href: queryHref("earrings", "Surgical Steel Post") },
          { label: "Titanium Post", href: queryHref("earrings", "Titanium Post") },
        ],
      },
      {
        title: "Finishing Colour",
        items: [
          { label: "Silver", href: queryHref("earrings", "Silver") },
          { label: "Gold", href: queryHref("earrings", "Gold") },
          { label: "Rose Gold", href: queryHref("earrings", "Rose Gold") },
        ],
      },
    ],
    card: {
      title: "ALL Earrings",
      href: "/earrings",
      image: "/products/blue-lace-agate-silver-pendant-1.jpg",
      alt: "Earrings collection",
    },
  },
  necklaces: {
    key: "necklaces",
    label: "Necklaces",
    columns: [
      {
        title: "Style",
        items: [
          { label: "Chain Necklaces", href: queryHref("necklaces", "Chain Necklaces") },
          { label: "Charm Necklaces", href: queryHref("necklaces", "Charm Necklaces") },
          { label: "Initial Necklaces", href: queryHref("necklaces", "Initial Necklaces") },
          { label: "Layered Necklaces", href: queryHref("necklaces", "Layered Necklaces") },
          { label: "Pendant Necklaces", href: queryHref("necklaces", "Pendant Necklaces") },
          { label: "Solitaire Necklaces", href: queryHref("necklaces", "Solitaire Necklaces") },
          { label: "Station Necklaces", href: queryHref("necklaces", "Station Necklaces") },
          { label: "Y & Lariat Necklaces", href: queryHref("necklaces", "Y and Lariat Necklaces") },
        ],
      },
      {
        title: "Collection",
        items: [
          { label: "Bestsellers", href: tagHref("necklaces", "top-rated") },
          { label: "Birthstones Series", href: queryHref("necklaces", "Birthstones") },
          { label: "Celestial Keepsakes", href: queryHref("necklaces", "Celestial") },
          { label: "Initials Series", href: queryHref("necklaces", "Initials") },
          { label: "Pearl Collective", href: queryHref("necklaces", "Pearl") },
          { label: "Waterproof Edit", href: queryHref("necklaces", "Waterproof") },
        ],
      },
      {
        title: "Finishing Colour",
        items: [
          { label: "Silver", href: queryHref("necklaces", "Silver") },
          { label: "Gold", href: queryHref("necklaces", "Gold") },
          { label: "Rose Gold", href: queryHref("necklaces", "Rose Gold") },
        ],
      },
    ],
    card: {
      title: "All Necklaces",
      href: "/necklaces",
      image: "/products/pearl-silver-necklace-v-1.jpg",
      alt: "Necklaces collection",
    },
  },
  bracelets: {
    key: "bracelets",
    label: "Bracelets",
    columns: [
      {
        title: "Shop by Color",
        items: [
          { label: "Black & Gray", href: queryHref("bracelets", "Black and Gray") },
          { label: "Cool Blues", href: queryHref("bracelets", "Cool Blues") },
          { label: "Earth Browns & Beige", href: queryHref("bracelets", "Earth Browns and Beige") },
          { label: "Warm Reds & Orange", href: queryHref("bracelets", "Warm Reds and Orange") },
          { label: "Royal Purple", href: queryHref("bracelets", "Royal Purple") },
          { label: "Rich Green", href: queryHref("bracelets", "Rich Green") },
          { label: "White & Light Tones", href: queryHref("bracelets", "White and Light Tones") },
          { label: "Multi-color", href: queryHref("bracelets", "Multicolor") },
        ],
      },
      {
        title: "Shop by Bead Size",
        items: [
          { label: "Mini Beads", href: queryHref("bracelets", "Mini Beads") },
          { label: "Small Beads", href: queryHref("bracelets", "Small Beads") },
          { label: "Medium Beads", href: queryHref("bracelets", "Medium Beads") },
          { label: "Big Beads", href: queryHref("bracelets", "Big Beads") },
          { label: "Mixed Size Beads", href: queryHref("bracelets", "Mixed Size Beads") },
        ],
      },
    ],
    card: {
      title: "All Bracelets",
      href: "/bracelets",
      image: "/products/sodalite-bracelet-viii-1.jpg",
      alt: "Bracelets collection",
    },
  },
  rings: {
    key: "rings",
    label: "Rings",
    columns: [
      {
        title: "Style",
        items: [
          { label: "Solitaire Rings", href: queryHref("rings", "Solitaire Rings") },
          { label: "Statement Rings", href: queryHref("rings", "Statement Rings") },
          { label: "Stacking Rings", href: queryHref("rings", "Stacking Rings") },
          { label: "Signet Rings", href: queryHref("rings", "Signet Rings") },
          { label: "Open Rings", href: queryHref("rings", "Open Rings") },
        ],
      },
      {
        title: "Collection",
        items: [
          { label: "Bestsellers", href: tagHref("rings", "top-rated") },
          { label: "New In", href: tagHref("rings", "new") },
          { label: "Limited Edition", href: tagHref("rings", "limited") },
          { label: "Birthstones", href: queryHref("rings", "Birthstones") },
          { label: "Waterproof Edit", href: queryHref("rings", "Waterproof") },
        ],
      },
      {
        title: "Material",
        items: [
          { label: "Sterling Silver", href: queryHref("rings", "Sterling Silver") },
          { label: "Gold Vermeil", href: queryHref("rings", "Gold Vermeil") },
          { label: "Mixed Metal", href: queryHref("rings", "Mixed Metal") },
        ],
      },
      {
        title: "Finishing Colour",
        items: [
          { label: "Silver", href: queryHref("rings", "Silver") },
          { label: "Gold", href: queryHref("rings", "Gold") },
          { label: "Rose Gold", href: queryHref("rings", "Rose Gold") },
        ],
      },
    ],
    card: {
      title: "All Rings",
      href: "/rings",
      image: "/products/silver-bracelet-iv-2.jpg",
      alt: "Rings collection",
    },
  },
};

const megaMenuRouteKeys = Object.keys(megaMenus) as MegaMenuKey[];

function getMegaMenuKeyByHref(href: string): MegaMenuKey | null {
  const route = href.split("?")[0].replace("/", "");
  return megaMenuRouteKeys.includes(route as MegaMenuKey) ? (route as MegaMenuKey) : null;
}

export default function Header() {
  const { itemCount, setOpen } = useCart();
  const { currency, setCurrency, supportedCurrencies } = useCurrency();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredMegaMenu, setHoveredMegaMenu] = useState<MegaMenuKey | null>(null);
  const [pinnedMegaMenu, setPinnedMegaMenu] = useState<MegaMenuKey | null>(null);
  const [mobileExpandedMenu, setMobileExpandedMenu] = useState<MegaMenuKey | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const megaMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const activeMegaMenu = pinnedMegaMenu ?? hoveredMegaMenu;

  function clearMegaMenuTimer() {
    if (!megaMenuTimerRef.current) return;
    clearTimeout(megaMenuTimerRef.current);
    megaMenuTimerRef.current = null;
  }

  function openMegaMenu(key: MegaMenuKey) {
    clearMegaMenuTimer();
    setHoveredMegaMenu(key);
  }

  function closeMegaMenuWithDelay() {
    if (pinnedMegaMenu) return;
    clearMegaMenuTimer();
    megaMenuTimerRef.current = setTimeout(() => {
      setHoveredMegaMenu(null);
    }, 110);
  }

  function handleMegaMenuLinkClick(event: React.MouseEvent<HTMLAnchorElement>, key: MegaMenuKey) {
    if (pinnedMegaMenu !== key) {
      event.preventDefault();
      setPinnedMegaMenu(key);
      setHoveredMegaMenu(key);
      return;
    }

    setPinnedMegaMenu(null);
    setHoveredMegaMenu(key);
  }

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

  useEffect(() => {
    if (!searchOpen) return;

    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 30);

    return () => window.clearTimeout(focusTimer);
  }, [searchOpen]);

  useEffect(() => {
    return () => clearMegaMenuTimer();
  }, []);

  useEffect(() => {
    if (!mobileOpen) {
      document.body.style.overflow = "";
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!pinnedMegaMenu) return;
      if (headerRef.current?.contains(event.target as Node)) return;
      setPinnedMegaMenu(null);
      setHoveredMegaMenu(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPinnedMegaMenu(null);
      setHoveredMegaMenu(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [pinnedMegaMenu]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    const target = query
      ? `/bracelets?q=${encodeURIComponent(query)}#catalog-search`
      : "/bracelets#catalog-search";
    router.push(target);
    setSearchOpen(false);
  }

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
        ref={headerRef}
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
              onClick={() => {
                setMobileExpandedMenu(null);
                setMobileOpen(true);
              }}
            >
              <Menu className="h-5 w-5" />
            </button>
            <nav className="hidden items-center gap-7 lg:flex">
              {navLinks.map((l) => {
                const megaKey = getMegaMenuKeyByHref(l.href);
                const hasMegaMenu = Boolean(megaKey);

                if (!hasMegaMenu) {
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="nav-link"
                      onClick={() => {
                        setPinnedMegaMenu(null);
                        setHoveredMegaMenu(null);
                      }}
                    >
                      {l.label}
                    </Link>
                  );
                }

                if (!megaKey) return null;

                const isActive = activeMegaMenu === megaKey;

                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`nav-link ${isActive ? "text-white" : ""}`}
                    onMouseEnter={() => openMegaMenu(megaKey)}
                    onMouseLeave={closeMegaMenuWithDelay}
                    onFocus={() => openMegaMenu(megaKey)}
                    onBlur={closeMegaMenuWithDelay}
                    onClick={(event) => handleMegaMenuLinkClick(event, megaKey)}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <Link href="/" aria-label="JQD Group home" className="group shrink-0">
            <Image
              src="/JQD-logo.png"
              alt="JQD Group"
              width={56}
              height={56}
              className="h-14 w-14 rounded-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              priority
            />
          </Link>

          <m.div layout className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
            <m.div layout className="hidden items-center gap-2 sm:flex">
              <button
                type="button"
                aria-label={searchOpen ? "Close search" : "Open search"}
                title={searchOpen ? "Close search" : "Open search"}
                className="icon-button"
                onClick={() => setSearchOpen((open) => !open)}
              >
                <Search className="h-5 w-5" />
              </button>
              <AnimatePresence initial={false}>
                {searchOpen && (
                  <m.form
                    key="header-search"
                    initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, x: -10, scale: 0.98 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -8, scale: 0.98 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                    onSubmit={handleSearchSubmit}
                    className="flex h-10 w-[17rem] items-center rounded-brand border border-white/20 bg-black/55 px-2 shadow-[0_10px_24px_rgba(0,0,0,0.24)] backdrop-blur"
                  >
                    <label htmlFor="header-search-input" className="sr-only">
                      Search products
                    </label>
                    <input
                      ref={searchInputRef}
                      id="header-search-input"
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search products"
                      className="h-full w-full bg-transparent px-2 text-sm text-white placeholder:text-white/45 outline-none"
                    />
                    <button
                      type="submit"
                      aria-label="Search"
                      className="inline-flex h-8 min-w-8 items-center justify-center rounded-[4px] border border-white/18 px-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/82 transition-colors hover:border-white/40 hover:text-white"
                    >
                      Go
                    </button>
                  </m.form>
                )}
              </AnimatePresence>
            </m.div>

            <m.div layout className="hidden items-center sm:flex">
              <label htmlFor="header-currency" className="sr-only">
                Select currency
              </label>
              <select
                id="header-currency"
                value={currency}
                onChange={(event) => setCurrency(event.target.value as typeof currency)}
                className="h-11 rounded-full border border-white/10 bg-white/[0.02] px-3 font-heading text-[10px] uppercase tracking-[0.14em] text-white/72 outline-none transition-[border-color,background-color,color] duration-200 hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
                aria-label="Currency"
              >
                {supportedCurrencies.map((code) => (
                  <option key={code} value={code} className="bg-brand-surface text-white">
                    {code}
                  </option>
                ))}
              </select>
            </m.div>

            <m.div layout>
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
            </m.div>

            <m.button
              layout
              type="button"
              aria-label="Cart"
              className="relative inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3 text-white/72 transition-[transform,border-color,background-color,color,box-shadow] duration-200 hover:border-white/20 hover:bg-white/[0.05] hover:text-white active:scale-[0.97] sm:pl-4 sm:pr-5"
              onClick={() => setOpen(true)}
            >
              <ShoppingBag className="h-5 w-5" />
              <span
                aria-hidden="true"
                className="hidden font-heading text-[10px] uppercase tracking-[0.18em] text-white/78 sm:inline"
              >
                {currency}
              </span>
              <span
                className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-black/10 bg-brand-gold px-1 text-[10px] font-semibold text-black transition-[opacity,transform] ${
                  itemCount > 0 ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
                }`}
              >
                {itemCount}
              </span>
            </m.button>
          </m.div>
        </div>

        <AnimatePresence>
          {activeMegaMenu && (
            <m.div
              key={activeMegaMenu}
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="hidden border-t lg:block"
              onMouseEnter={clearMegaMenuTimer}
              onMouseLeave={closeMegaMenuWithDelay}
            >
              {(() => {
                const config = megaMenus[activeMegaMenu];

                return (
                  <div className="border-white/8 bg-[#121214]">
                    <div className="container-site py-10">
                      <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between xl:gap-10">
                        <div
                          className={`grid flex-1 gap-8 ${
                            config.columns.length === 4
                              ? "md:grid-cols-2 xl:grid-cols-4"
                              : config.columns.length === 3
                                ? "md:grid-cols-2 xl:grid-cols-3"
                                : "md:grid-cols-2"
                          }`}
                        >
                          {config.columns.map((column) => (
                            <div key={column.title}>
                              <p className="font-body text-sm text-white/46">
                                {column.title}
                              </p>
                              <ul className="mt-4 space-y-3">
                                {column.items.map((item) => (
                                  <li key={`${column.title}-${item.label}`}>
                                    <Link
                                      href={item.href}
                                      onClick={() => {
                                        setPinnedMegaMenu(null);
                                        setHoveredMegaMenu(null);
                                      }}
                                      className="text-[15px] leading-7 text-white/76 transition-colors hover:text-brand-gold-light"
                                    >
                                      {item.label}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>

                        <div className="grid w-full max-w-[360px] gap-6 md:grid-cols-1">
                          <Link href={config.card.href} className="group block self-start">
                            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
                                <Image
                                  src={config.card.image}
                                  alt={config.card.alt}
                                  fill
                                  sizes="(max-width: 1280px) 33vw, 520px"
                                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                                />
                              </div>
                              <div className="mt-3 flex items-center justify-between px-1 pb-1">
                                <p className="font-heading text-[11px] uppercase tracking-[0.18em] text-white/76">
                                  {config.card.title}
                                </p>
                                <ArrowUpRight className="h-4 w-4 text-white/45 transition-colors group-hover:text-brand-gold-light" />
                              </div>
                            </div>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </m.div>
          )}
        </AnimatePresence>

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
                onClick={() => {
                  setMobileOpen(false);
                  setMobileExpandedMenu(null);
                }}
              />
              <m.div
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, x: -18, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -14, scale: 0.99 }}
                transition={{
                  duration: shouldReduceMotion ? 0 : 0.24,
                  ease: [0.23, 1, 0.32, 1],
                }}
                className="absolute inset-y-3 left-3 right-3 max-w-md overflow-y-auto rounded-[1.75rem] border border-white/12 bg-black/88 p-5 shadow-[0_28px_80px_rgba(0,0,0,0.38)] backdrop-blur-2xl sm:right-10 sm:p-6"
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
                    onClick={() => {
                      setMobileOpen(false);
                      setMobileExpandedMenu(null);
                    }}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <nav className="flex flex-col border-t border-white/10 pt-2">
                  {navLinks.map((l) => {
                    const megaKey = getMegaMenuKeyByHref(l.href);

                    if (!megaKey) {
                      return (
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
                      );
                    }

                    const config = megaMenus[megaKey];
                    const expanded = mobileExpandedMenu === megaKey;

                    return (
                      <div key={l.href} className="border-b border-white/8">
                        <div className="flex items-center justify-between gap-3">
                          <Link
                            href={l.href}
                            className="flex min-w-0 flex-1 items-center py-4 font-heading text-sm uppercase text-white/84"
                            style={{ letterSpacing: "0.18em" }}
                            onClick={() => {
                              setMobileOpen(false);
                              setMobileExpandedMenu(null);
                            }}
                          >
                            <span className="truncate">{l.label}</span>
                          </Link>
                          <button
                            type="button"
                            aria-label={`${expanded ? "Collapse" : "Expand"} ${l.label} menu`}
                            aria-expanded={expanded}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-white/84"
                            onClick={() =>
                              setMobileExpandedMenu((prev) => (prev === megaKey ? null : megaKey))
                            }
                          >
                            <ChevronDown
                              className={`h-4 w-4 text-white/44 transition-transform ${
                                expanded ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                        </div>

                        {expanded && (
                          <div className="pb-4">
                            <Link
                              href={config.card.href}
                              className="block rounded-brand border border-white/12 bg-white/[0.03] px-3 py-2 text-xs uppercase tracking-[0.14em] text-white/86"
                              onClick={() => {
                                setMobileOpen(false);
                                setMobileExpandedMenu(null);
                              }}
                            >
                              Shop all {config.label}
                            </Link>

                            <div className="mt-4 space-y-4">
                              {config.columns.map((column) => (
                                <div key={column.title}>
                                  <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-white/42">
                                    {column.title}
                                  </p>
                                  <div className="space-y-2">
                                    {column.items.map((item) => (
                                      <Link
                                        key={`${column.title}-${item.label}`}
                                        href={item.href}
                                        className="block text-sm text-white/78 transition-colors hover:text-brand-gold-light"
                                        onClick={() => {
                                          setMobileOpen(false);
                                          setMobileExpandedMenu(null);
                                        }}
                                      >
                                        {item.label}
                                      </Link>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <Link
                    href={signedIn ? "/account" : "/auth/login"}
                    className="flex items-center justify-between border-b border-white/8 py-4 font-heading text-sm uppercase text-white/84"
                    style={{ letterSpacing: "0.18em" }}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span>{signedIn ? "Account" : "Sign In"}</span>
                    <span className="text-white/28">/</span>
                  </Link>
                  <div className="flex items-center justify-between border-b border-white/8 py-4">
                    <span
                      className="font-heading text-sm uppercase text-white/84"
                      style={{ letterSpacing: "0.18em" }}
                    >
                      Currency
                    </span>
                    <label htmlFor="mobile-currency" className="sr-only">
                      Select currency
                    </label>
                    <select
                      id="mobile-currency"
                      value={currency}
                      onChange={(event) => setCurrency(event.target.value as typeof currency)}
                      className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-2 font-heading text-[10px] uppercase tracking-[0.14em] text-white/86"
                    >
                      {supportedCurrencies.map((code) => (
                        <option key={code} value={code} className="bg-brand-surface text-white">
                          {code}
                        </option>
                      ))}
                    </select>
                  </div>
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
