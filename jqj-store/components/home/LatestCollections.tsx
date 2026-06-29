import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { products } from "@/data/products";

// Build "collection" cards from available product imagery.
const collections = [
  { name: "Sodalite Signature", image: products[2].images[0], href: "/bracelets" },
  { name: "Raw Tourmaline", image: products[1].images[0], href: "/bracelets" },
  { name: "Jasper Heritage", image: products[0].images[0], href: "/bracelets" },
  { name: "Labradorite Light", image: products[5].images[0], href: "/bracelets" },
  { name: "Amethyst Studio", image: products[3].images[0], href: "/bracelets" },
  { name: "Silver Minimal", image: products[4].images[0], href: "/bracelets" },
  { name: "Pearl Atelier", image: products[8].images[0], href: "/necklaces" },
];

export default function LatestCollections() {
  return (
    <section className="container-site pt-14 sm:pt-16">
      <div className="section-shell rounded-none">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="eyebrow">Curated edits</p>
          <h2 className="section-title">Latest Collections</h2>
          <p className="section-lead text-[13px] sm:text-sm md:text-[15px]">
            From earthy neutrals to brighter mineral tones, each edit is composed to feel cohesive, collectible, and easy to wear.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
          {collections.map((c) => (
            <Link
              key={c.name}
              href={c.href}
              className="group flex h-full flex-col rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-3 transition-[transform,border-color,background-color] duration-200 hover:-translate-y-1 hover:border-white/18 hover:bg-white/[0.05]"
            >
              <div className="relative aspect-[0.94] overflow-hidden rounded-[1.15rem] bg-brand-card">
                <Image
                  src={c.image}
                  alt={c.name}
                  fill
                  sizes="(max-width: 768px) 33vw, 14vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/70" />
              </div>
              <div className="flex flex-1 items-end justify-between gap-3 px-1 pb-1 pt-4">
                <div>
                  <p
                    className="text-[10px] uppercase text-brand-gold/76"
                    style={{ letterSpacing: "0.2em" }}
                  >
                    Collection
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/86">{c.name}</p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/54 transition-colors duration-200 group-hover:text-white">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
