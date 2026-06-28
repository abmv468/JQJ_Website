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
    <section className="container-site pt-16">
      <div className="section-shell rounded-none">
        <div className="text-center">
          <p className="eyebrow">Material-led discovery</p>
          <h2 className="section-title mt-3">Shop by Stone</h2>
          <p className="section-lead mx-auto mt-4 max-w-2xl">
            Choose by mineral tone, symbolism, or the texture you want to wear
            every day.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
          {stones.map((stone) => (
            <Link
              key={stone}
              href={`/bracelets?stone=${encodeURIComponent(stone)}`}
              className="group rounded-[1.45rem] border border-white/10 bg-white/[0.03] p-4 text-center transition-[transform,border-color,background-color] duration-200 hover:-translate-y-1 hover:border-white/18 hover:bg-white/[0.05]"
            >
              <span className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-black/30">
                <span
                  className="absolute inset-3 rounded-full opacity-80 blur-md"
                  style={{ backgroundColor: stoneColors[stone] }}
                />
                <span
                  className="relative h-14 w-14 rounded-full border border-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]"
                  style={{
                    background: `radial-gradient(circle at 30% 30%, #ffffff44, ${stoneColors[stone]})`,
                  }}
                />
              </span>
              <span className="mt-4 block text-sm text-white/86">{stone}</span>
              <span
                className="mt-1 block text-[10px] uppercase text-white/60"
                style={{ letterSpacing: "0.18em" }}
              >
                Explore edit
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
