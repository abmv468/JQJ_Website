"use client";

import { useMemo } from "react";
import { useCurrency } from "@/context/CurrencyContext";

const FREE_SHIPPING_THRESHOLD_USD = 250;

export default function AnnouncementBar() {
  const { formatFromUsd } = useCurrency();
  const messages = useMemo(
    () => [
      `Free worldwide shipping on orders over ${formatFromUsd(FREE_SHIPPING_THRESHOLD_USD)}`,
      "Handcrafted with premium natural gemstones",
      "Free resizing for new customers",
    ],
    [formatFromUsd]
  );

  return (
    <div className="w-full border-b border-white/8 bg-black/80">
      <div className="container-site">
        <div className="flex min-h-[2.65rem] items-center justify-center gap-3 text-center sm:whitespace-nowrap">
          {messages.map((message, index) => (
            <div key={message} className="flex items-center gap-3">
              {index > 0 && <span className="hidden h-1 w-1 rounded-full bg-brand-gold/60 md:block" />}
              <p
                className={`font-heading text-[10px] uppercase leading-relaxed text-white/62 sm:leading-normal ${
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
