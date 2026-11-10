"use client";

import React, { useState } from "react";
// The unit renderer compiles JSX with the classic runtime, which reads this binding.
import Image from "next/image";
import { cn } from "@/lib/utils";

type ProductPlaceholderProps = {
  name?: string;
  src?: string | null;
  alt?: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  /** Leave the slot empty when the path is missing or the file fails to load. */
  hideOnError?: boolean;
  /** Unlabeled tile, hidden from assistive tech. */
  decorative?: boolean;
};

function cleanSrc(src?: string | null): string | null {
  const value = src?.trim();
  return value ? value : null;
}

export default function ProductPlaceholder({
  name,
  src,
  alt,
  sizes,
  priority = false,
  className,
  hideOnError = false,
  decorative = false,
}: ProductPlaceholderProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolved = cleanSrc(src);
  const failed = resolved != null && failedSrc === resolved;
  const label = name?.trim() ?? "";

  if (resolved && !failed) {
    return (
      <Image
        src={resolved}
        alt={decorative ? "" : (alt ?? label)}
        fill
        sizes={sizes}
        priority={priority}
        className={className}
        onError={() => setFailedSrc(resolved)}
      />
    );
  }

  if (hideOnError) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center overflow-hidden bg-[#101012] px-4 text-center",
        className
      )}
      aria-hidden={decorative ? true : undefined}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <rect width="100" height="100" fill="#101012" />
        <rect
          x="7"
          y="7"
          width="86"
          height="86"
          fill="none"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="0.75"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {!decorative && label ? (
        <p className="relative z-[1] line-clamp-4 font-heading text-[11px] uppercase leading-5 tracking-[0.16em] text-white/80">
          {label}
        </p>
      ) : null}
    </div>
  );
}
