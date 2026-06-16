import Image from "next/image";

export default function ForgetMassProduced() {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2">
      <div className="flex items-center bg-brand-surface px-8 py-16 md:px-16">
        <div className="max-w-md">
          <h2 className="font-heading text-3xl font-light text-white">
            Forget mass-produced
          </h2>
          <p className="mt-6 text-sm leading-relaxed text-brand-muted">
            From our hands to yours. Our family-owned atelier crafts each piece
            with meticulous care, using only the finest natural gemstones.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-brand-muted">
            A timeless design, a custom fit — a piece as unique as you are.
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
