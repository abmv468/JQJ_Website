import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check } from "lucide-react";
import StarRating from "@/components/ui/StarRating";

const guarantees = [
  "Tailored to your preferred fit",
  "30-day Satisfaction Guarantee",
  "Museum-inspired craftsmanship since 2015",
];

export default function Hero() {
  return (
    <section className="container-site pt-6 sm:pt-8">
      <div className="relative min-h-[540px] overflow-hidden border border-white/10 bg-black shadow-[0_36px_100px_rgba(0,0,0,0.34)] sm:min-h-[620px]">
        <Image
          src="/products/hero-image.jpg"
          alt="JQD Group craftsmanship"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-black/62" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_20%,rgba(187,157,123,0.16),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(24,76,82,0.24),transparent_30%)]" />
        <div className="container-site relative z-10 flex min-h-[540px] items-center justify-center py-12 sm:min-h-[620px] sm:py-20">
          <div className="max-w-[58rem] text-center">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/12 bg-black/28 px-4 py-2 backdrop-blur-md">
              <StarRating rating={5} size={13} />
              <span className="text-xs text-white/76">4.8/5.0 (9929 Reviews)</span>
            </div>
            <h1 className="mt-7 font-heading text-[2rem] font-light leading-[1.02] text-white sm:mt-8 sm:text-5xl lg:text-[5.6rem]">
              Natural Stones. Cultured Design.
            </h1>
            <p className="mt-5 px-2 font-heading text-[11px] uppercase tracking-[0.18em] text-brand-gold-light sm:mt-6 sm:px-0 sm:text-sm sm:tracking-[0.22em]">
              Inspired by Eastern heritage and modern craftsmanship
            </p>
            <p className="mx-auto mt-6 max-w-3xl text-[15px] leading-7 text-white/74 sm:mt-7 sm:text-lg">
              Hand-finished bracelets and necklaces shaped by Eastern heritage,
              museum-inspired restraint, and the quiet character of natural
              gemstones.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/new" className="btn-gold">
                Shop new arrivals
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/bracelets" className="btn-secondary">
                Explore bracelets
              </Link>
            </div>

            <ul className="mx-auto mt-8 flex max-w-3xl flex-col items-start gap-4 sm:mt-10 sm:items-center">
              {guarantees.map((g) => (
                <li key={g} className="inline-flex items-center gap-3 text-left text-white/84 sm:text-center">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-gold/35 bg-brand-gold/10">
                    <Check className="h-4 w-4 text-brand-gold" />
                  </span>
                  <span className="text-base leading-7">{g}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
