import Link from "next/link";
import Image from "next/image";
import { products } from "@/data/products";

// Build "collection" cards from available product imagery.
const collections = [
  { name: "Hexagon Stone Collection", image: products[2].images[0], href: "/bracelets" },
  { name: "Turquoise Collection", image: products[1].images[0], href: "/bracelets" },
  { name: "Untamed Collection", image: products[0].images[0], href: "/bracelets" },
  { name: "Labradorite Collection", image: products[5].images[0], href: "/bracelets" },
  { name: "Amethyst Collection", image: products[3].images[0], href: "/bracelets" },
  { name: "Silver Collection", image: products[4].images[0], href: "/bracelets" },
  { name: "Pearl Collection", image: products[8].images[0], href: "/necklaces" },
];

export default function LatestCollections() {
  return (
    <section className="container-site py-16">
      <h2 className="section-title mb-10">Latest Collections</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
        {collections.map((c) => (
          <Link key={c.name} href={c.href} className="group block">
            <div className="relative aspect-square overflow-hidden border border-brand-border bg-brand-card">
              <Image
                src={c.image}
                alt={c.name}
                fill
                sizes="(max-width: 768px) 33vw, 14vw"
                className="object-cover transition-transform duration-500 group-hover:scale-110"
              />
            </div>
            <p className="mt-3 text-center text-xs leading-tight text-white/80">
              {c.name}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
