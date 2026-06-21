const messages = [
  "Free worldwide shipping on orders over $250",
  "Handcrafted with premium natural gemstones",
  "Free resizing for new customers",
];

export default function AnnouncementBar() {
  return (
    <div className="w-full border-b border-brand-border bg-black">
      <div className="container-site flex items-center justify-center gap-8 py-2 text-center">
        {messages.map((m, i) => (
          <p
            key={m}
            className={`font-heading text-[10px] uppercase tracking-wider2 text-brand-muted ${
              i === 0 ? "" : "hidden md:block"
            }`}
          >
            {m}
          </p>
        ))}
      </div>
    </div>
  );
}
