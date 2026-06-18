import Link from "next/link";
import Image from "next/image";
import { Check } from "lucide-react";
import StarRating from "@/components/ui/StarRating";

const guarantees = [
  "Tailored to your preferred fit",
  "30-day Satisfaction Guarantee",
  "Museum-inspired craftsmanship since 2015",
];

export default function Hero() {
  return (
    <section className="relative flex min-h-[560px] items-center justify-center overflow-hidden">
      <Image
        src="/products/lifestyle.webp"
        alt="JQJ Group craftsmanship"
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-black/60" />
      <div className="container-site relative z-10 flex flex-col items-center text-center">
        <div className="mb-4 flex items-center gap-2">
          <StarRating rating={5} />
          <span className="text-xs tracking-wider2 text-white/80">
            4.8/5.0 (9929 Reviews)
          </span>
        </div>
        <h1 className="font-heading text-3xl font-light text-white sm:text-4xl md:text-5xl">
          Natural Stones. Cultured Design.
        </h1>
        <p className="mt-3 font-heading text-xs uppercase tracking-wider2 text-brand-gold-light">
          Inspired by Eastern heritage and modern craftsmanship
        </p>
        <ul className="mt-6 space-y-2">
          {guarantees.map((g) => (
            <li
              key={g}
              className="flex items-center justify-center gap-2 text-sm text-white/90"
            >
              <Check className="h-4 w-4 text-brand-gold" />
              {g}
            </li>
          ))}
        </ul>
        <Link href="/new" className="btn-gold mt-8">
          Shop the Collection
        </Link>
      </div>
    </section>
  );
}
