import { stones } from "@/data/products";
import { stoneListingHref } from "@/lib/listing";
import Image from "next/image";
import Link from "next/link";

const stoneImages: Record<string, string> = {
  Sodalite: "/stones/sodalite-raw.webp",
  Amethyst: "/stones/amethyst-raw.webp",
  "Raw Brown Tourmaline": "/stones/tourmaline-raw.webp",
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

        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stones.map((stone) => {
            const image = stoneImages[stone];
            return (
              <Link
                key={stone}
                href={stoneListingHref(stone)}
                className="group text-center transition-transform duration-200 hover:-translate-y-1"
              >
                <span className="relative mx-auto block aspect-square w-full max-w-[178px] overflow-hidden bg-brand-card">
                  {image ? (
                    <Image
                      src={image}
                      alt={`${stone} raw stone`}
                      fill
                      sizes="(max-width: 640px) 42vw, (max-width: 1024px) 22vw, 178px"
                      className="object-contain transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                  ) : null}
                </span>
                <span className="mt-4 block text-sm text-white/86">{stone}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
