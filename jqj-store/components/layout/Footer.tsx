"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { BRAND_HASHTAG, LEGAL_ENTITY } from "@/lib/brand";

const columns = [
  {
    title: "Support",
    links: [
      { label: "Contact Us", href: "/contact" },
      { label: "FAQs", href: "/faqs" },
      { label: "Shipping", href: "/shipping" },
      { label: "How to Measure Your Wrist", href: "/measure" },
      { label: "Returns, Resizes & Exchanges", href: "/returns" },
      { label: "Repair", href: "/repair" },
      { label: "How to Care for Your Jewelry", href: "/care" },
    ],
  },
  {
    title: "Quick Links",
    links: [
      { label: "Loyalty Program", href: "/loyalty" },
      { label: "Shop All", href: "/new" },
      { label: "Bracelets", href: "/bracelets" },
      { label: "Necklaces", href: "/necklaces" },
    ],
  },
  {
    title: BRAND_HASHTAG,
    links: [
      { label: "Our Story", href: "/story" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms & Conditions", href: "/terms" },
    ],
  },
];

export default function Footer() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "We could not subscribe you. Please try again.");
      }

      setStatus("success");
      setMessage(data.message ?? "You are on the list.");
      setEmail("");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "We could not subscribe you. Please try again.");
    }
  }

  return (
    <footer className="mt-16 border-t border-white/8 bg-black">
      <div className="container-site grid grid-cols-2 gap-10 py-16 md:grid-cols-4">
        {columns.map((col) => (
          <div key={col.title}>
            <h4
              className="mb-5 font-heading text-[11px] uppercase text-white/88"
              style={{ letterSpacing: "0.2em" }}
            >
              {col.title}
            </h4>
            <ul className="space-y-3">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/56 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="col-span-2 md:col-span-1">
          <h4
            className="mb-5 font-heading text-[11px] uppercase text-white/88"
            style={{ letterSpacing: "0.2em" }}
          >
            Stay in the Loop
          </h4>
          <p className="mb-4 text-sm leading-7 text-white/56">
            New gemstone edits, limited drops, and collector releases—sent
            sparingly.
          </p>
          <form className="space-y-3" onSubmit={handleSubscribe}>
            <input
              type="email"
              name="email"
              autoComplete="email"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email address"
              className="input-field"
              aria-label="Email address"
              required
              disabled={status === "submitting"}
            />
            <button type="submit" className="btn-gold w-full" disabled={status === "submitting"}>
              {status === "submitting" ? "Subscribing…" : "Subscribe"}
            </button>
            <p
              aria-live="polite"
              className={`min-h-5 text-xs ${
                status === "error" ? "text-red-300" : "text-white/56"
              }`}
            >
              {message}
            </p>
          </form>
        </div>
      </div>

      <div className="border-t border-white/8">
        <div className="container-site flex flex-col items-center justify-between gap-4 py-6 sm:flex-row">
          <p
            className="text-[11px] uppercase text-white/60"
            style={{ letterSpacing: "0.18em" }}
          >
            © {new Date().getFullYear()} — {LEGAL_ENTITY}
          </p>
          <p className="text-center text-xs text-white/56">
            Hand-finished natural stone pieces designed for everyday ritual.
          </p>
        </div>
      </div>
    </footer>
  );
}
