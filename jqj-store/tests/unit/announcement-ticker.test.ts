import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function source(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("announcement bar ticker", () => {
  const bar = source("components/layout/AnnouncementBar.tsx");
  const css = source("app/globals.css");
  const tickerCss = css.slice(
    css.indexOf("/* Announcement ticker."),
    css.indexOf("@keyframes announcement-ticker") + 400,
  );
  const focusRule = css.slice(
    css.indexOf(":where(a, button, input, textarea, select):focus-visible"),
    css.indexOf(":where(a, button, input, textarea, select):focus-visible") +
      160,
  );

  it("keeps the three messages, the currency formatter, and the current chrome", () => {
    const shipping = bar.indexOf(
      "`Free worldwide shipping on orders over ${formatFromUsd(FREE_SHIPPING_THRESHOLD_USD)}`",
    );
    const gemstones = bar.indexOf(
      "Premium natural gemstones, selected for character",
    );
    const resizing = bar.indexOf("Free resizing for new customers");

    expect(shipping).toBeGreaterThan(-1);
    expect(gemstones).toBeGreaterThan(shipping);
    expect(resizing).toBeGreaterThan(gemstones);
    expect(bar).toContain("bg-black/80");
    expect(bar).toContain("border-b border-white/8");
    expect(bar).toContain("bg-brand-gold/60");
    expect(bar).toContain('letterSpacing: "0.2em"');
    expect(bar).toContain("font-heading");
    expect(bar).toContain("uppercase");
    expect(bar).toContain("text-white/62");
    expect(bar).not.toContain("$250");
    expect(bar).not.toContain("<marquee");
    expect(bar).not.toContain("framer-motion");
    expect(bar).not.toContain('from "framer-motion"');
  });

  it("repeats the message set and translates it in a 40s linear loop", () => {
    const floor = bar.match(/ANNOUNCEMENT_REPEAT_FLOOR = (\d+)/);
    expect(Number(floor?.[1])).toBeGreaterThanOrEqual(4);
    expect(bar).toContain("const LOOP_HALVES = [0, 1]");
    expect(bar).toContain("Math.ceil(viewWidth / setWidth)");
    expect(tickerCss).toContain(
      "animation: announcement-ticker 40s linear infinite;",
    );
    expect(tickerCss).toContain("translateX(-50%)");
    expect(tickerCss).toContain(".announcement-bar:hover .announcement-track");
    expect(tickerCss).toContain(
      ".announcement-bar:focus-within .announcement-track",
    );
    expect(tickerCss).toContain("animation-play-state: paused;");
  });

  it("shows a still wrapped bar when reduced motion is requested", () => {
    const ticker = css.slice(css.indexOf("/* Announcement ticker."));
    const reduced = ticker.slice(
      ticker.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(reduced).toContain(".announcement-track");
    expect(reduced).toContain("animation: none;");
    expect(reduced).toContain("transform: none;");
    expect(reduced).toContain(".announcement-seam");
    expect(reduced).toContain("display: none;");
    expect(reduced).toContain("flex-wrap: wrap;");
    expect(reduced).toContain("white-space: normal;");
  });

  it("leaves the global focus-visible rule unchanged", () => {
    expect(focusRule).toContain("outline: 2px solid #e1c19d;");
    expect(focusRule).toContain("outline-offset: 3px;");
    expect(focusRule).not.toContain("announcement");
  });
});
