import { stones } from "@/data/products";
import Image from "next/image";
import Link from "next/link";

const stoneImages: Record<string, string> = {
  Sodalite: "/stones/sodalite-raw.webp",
  "Tiger Eye": "/stones/tiger-eye-raw.webp",
  Carnelian: "/stones/carnelian-raw.webp",
  Tourmaline: "/stones/tourmaline-raw.webp",
  Aquamarine: "/stones/aquamarine-raw.webp",
  Amethyst: "/stones/amethyst-raw.webp",
  "Lapis Lazuli": "/stones/lapis-lazuli-raw.webp",
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
              className="group text-center transition-transform duration-200 hover:-translate-y-1"
            >
              <span className="relative mx-auto block aspect-square w-full max-w-[178px] overflow-hidden">
                <Image
                  src={stoneImages[stone]}
                  alt={`${stone} raw stone`}
                  fill
                  sizes="(max-width: 640px) 42vw, (max-width: 768px) 28vw, (max-width: 1280px) 20vw, 12vw"
                  className="object-contain transition-transform duration-500 group-hover:scale-[1.04]"
                />
              </span>
              <span className="mt-4 block text-sm text-white/86">{stone}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
