import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

export default function ForgetMassProduced() {
  return (
    <section className="container-site pt-16">
      <div className="grid overflow-hidden border border-white/10 bg-black/60 shadow-[0_30px_90px_rgba(0,0,0,0.28)] lg:grid-cols-[0.95fr_1.05fr]">
        <div className="relative flex items-center bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-6 py-14 sm:px-10 lg:px-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(24,76,82,0.22),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(187,157,123,0.14),transparent_30%)]"
          />
          <div className="relative max-w-xl">
            <p className="eyebrow">From the atelier</p>
            <h2 className="mt-4 font-heading text-3xl font-light leading-tight text-white sm:text-4xl">
              Beyond mass production, closer to ritual.
            </h2>
            <p className="mt-6 text-sm leading-7 text-white/68">
              We design from the idea that jewelry can carry meaning. In our
              family atelier, each piece is hand-finished with natural gemstones
              selected for energy, tone, and character.
            </p>
            <p className="mt-4 text-sm leading-7 text-white/68">
              Rooted in cultural symbolism and made for modern wear, every design
              is crafted to feel personal, balanced, and enduring.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ["Family-run", "Since 2015"],
                ["Hand-finished", "Tailored fit"],
                ["Natural stones", "Selected one by one"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] px-4 py-4"
                >
                  <p
                    className="text-[10px] uppercase text-brand-gold/76"
                    style={{ letterSpacing: "0.18em" }}
                  >
                    {label}
                  </p>
                  <p className="mt-2 text-sm text-white/84">{value}</p>
                </div>
              ))}
            </div>
            <Link href="/bracelets" className="btn-primary mt-8">
              Discover bracelets
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="relative min-h-[380px]">
          <Image
            src="/products/lifestyle.webp"
            alt="JQJ Group artisan fitting a bracelet"
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-l from-black/15 via-transparent to-black/50" />
          <div className="absolute bottom-6 left-6 right-6 max-w-sm rounded-[1.4rem] border border-white/12 bg-black/42 p-5 backdrop-blur-md">
            <p
              className="text-[10px] uppercase text-brand-gold/80"
              style={{ letterSpacing: "0.18em" }}
            >
              Hand-finished
            </p>
            <p className="mt-2 text-sm leading-6 text-white/82">
              Each piece is balanced, fitted, and finished to feel collected
              rather than mass-made.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
