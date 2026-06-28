const messages = [
  "Free worldwide shipping on orders over $250",
  "Handcrafted with premium natural gemstones",
  "Free resizing for new customers",
];

export default function AnnouncementBar() {
  return (
    <div className="w-full border-b border-white/8 bg-black/80">
      <div className="container-site overflow-x-auto">
        <div className="flex min-h-[2.65rem] items-center justify-center gap-3 whitespace-nowrap text-center">
          {messages.map((message, index) => (
            <div key={message} className="flex items-center gap-3">
              {index > 0 && <span className="hidden h-1 w-1 rounded-full bg-brand-gold/60 md:block" />}
              <p
                className={`font-heading text-[10px] uppercase text-white/62 ${
                  index === 0 ? "" : "hidden md:block"
                }`}
                style={{ letterSpacing: "0.2em" }}
              >
                {message}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
