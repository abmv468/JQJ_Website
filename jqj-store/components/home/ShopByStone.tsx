import { stones } from "@/data/products";
import Link from "next/link";

// Map stone names to a representative swatch color (the design shows raw stones).
const stoneColors: Record<string, string> = {
  Sodalite: "#27408b",
  "Tiger Eye": "#8a5a2b",
  Carnelian: "#b5402a",
  Tourmaline: "#5a4632",
  Aquamarine: "#7fb6c4",
  Amethyst: "#7b4f9d",
  "Lapis Lazuli": "#1f3a93",
};

export default function ShopByStone() {
  return (
    <section className="border-y border-brand-border bg-black py-16">
      <div className="container-site">
        <h2 className="section-title mb-10">Shop by Stone</h2>
        <div className="grid grid-cols-3 gap-6 sm:grid-cols-4 md:grid-cols-7">
          {stones.map((stone) => (
            <Link
              key={stone}
              href={`/bracelets?stone=${encodeURIComponent(stone)}`}
              className="group flex flex-col items-center"
            >
              <span
                className="h-16 w-16 rounded-full border border-brand-border transition-transform group-hover:scale-110"
                style={{
                  background: `radial-gradient(circle at 30% 30%, #ffffff33, ${stoneColors[stone]})`,
                }}
              />
              <span className="mt-3 text-center text-xs text-white/80">{stone}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
