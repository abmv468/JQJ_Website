"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCurrency } from "@/context/CurrencyContext";

const FREE_SHIPPING_THRESHOLD_USD = 250;
/** Sets per loop half before measurement. Wide desktops stay gap-free on first paint. */
const ANNOUNCEMENT_REPEAT_FLOOR = 6;
const LOOP_HALVES = [0, 1] as const;

const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function AnnouncementBar() {
  const { formatFromUsd } = useCurrency();
  const messages = useMemo(
    () => [
      `Free worldwide shipping on orders over ${formatFromUsd(FREE_SHIPPING_THRESHOLD_USD)}`,
      "Premium natural gemstones, selected for character",
      "Free resizing for new customers",
    ],
    [formatFromUsd],
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const setRef = useRef<HTMLDivElement>(null);
  const [setsPerHalf, setSetsPerHalf] = useState(ANNOUNCEMENT_REPEAT_FLOOR);

  useIsoLayoutEffect(() => {
    const measure = () => {
      const setNode = setRef.current;
      const viewport = viewportRef.current;
      if (!setNode || !viewport) return;

      const setWidth = setNode.getBoundingClientRect().width;
      const viewWidth = viewport.clientWidth;
      if (setWidth < 1 || viewWidth < 1) return;

      const needed = Math.max(1, Math.ceil(viewWidth / setWidth));
      setSetsPerHalf((current) => (current === needed ? current : needed));
    };

    measure();

    const viewport = viewportRef.current;
    const track = trackRef.current;
    let observer: ResizeObserver | null = null;
    if (viewport && track && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(viewport);
      observer.observe(track);
    }

    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [messages]);

  return (
    <div
      className="announcement-bar relative w-full border-b border-white/8 bg-black/80"
      tabIndex={0}
      role="region"
      aria-label="Announcements"
    >
      <ul className="sr-only">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
      <div className="announcement-viewport" ref={viewportRef}>
        <div
          className="announcement-track"
          ref={trackRef}
          aria-hidden="true"
          data-sets={setsPerHalf}
        >
          {LOOP_HALVES.map((half) => (
            <div className="announcement-half" key={half}>
              {Array.from({ length: setsPerHalf }, (_, index) => (
                <div
                  className="announcement-set"
                  key={index}
                  ref={half === 0 && index === 0 ? setRef : undefined}
                >
                  {messages.map((message, messageIndex) => (
                    <div
                      key={message}
                      className="announcement-message flex items-center"
                    >
                      {messageIndex > 0 ? (
                        <span className="mx-3 h-1 w-1 shrink-0 rounded-full bg-brand-gold/60" />
                      ) : null}
                      <p
                        className="font-heading text-[10px] uppercase leading-relaxed text-white/62 sm:leading-normal"
                        style={{ letterSpacing: "0.2em" }}
                      >
                        {message}
                      </p>
                    </div>
                  ))}
                  <span className="announcement-seam mx-3 h-1 w-1 shrink-0 rounded-full bg-brand-gold/60" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
