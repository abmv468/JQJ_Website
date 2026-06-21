import Image from "next/image";

export default function ForgetMassProduced() {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2">
      <div className="flex items-center bg-brand-surface px-8 py-16 md:px-16">
        <div className="max-w-md">
          <h2 className="font-heading text-3xl font-light text-white">
            Beyond mass production
          </h2>
          <p className="mt-6 text-sm leading-relaxed text-brand-muted">
            We design from the idea that jewelry can carry meaning. In our
            family atelier, each piece is hand-finished with natural gemstones
            selected for energy, tone, and character.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-brand-muted">
            Rooted in cultural symbolism and made for modern wear, every design
            is crafted to feel personal, balanced, and enduring.
          </p>
        </div>
      </div>
      <div className="relative min-h-[360px]">
        <Image
          src="/products/lifestyle.webp"
          alt="JQJ Group artisan fitting a bracelet"
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
        />
      </div>
    </section>
  );
}
