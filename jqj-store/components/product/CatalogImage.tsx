"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useState } from "react";

/**
 * Listing and gallery frames reserve their ratio with bg-brand-card (#141414).
 * A pulse on that same black reads as an empty stage, so the unloaded frame
 * uses a lighter stone gradient until the file decodes.
 * First-paint black was inferred from the craft inventory, not re-shot here.
 */
export default function CatalogImage({
  src,
  alt,
  className,
  onLoad,
  priority,
  ...props
}: ImageProps) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <>
      {loaded ? null : (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1] animate-pulse bg-[linear-gradient(145deg,#4a433a_0%,#8a7d6e_48%,#2c2824_100%)]"
        />
      )}
      <Image
        {...props}
        src={src}
        alt={alt}
        priority={priority}
        className={`${className ?? ""} ${loaded ? "opacity-100" : "opacity-0"} transition-opacity duration-300`}
        onLoad={(event) => {
          setLoaded(true);
          onLoad?.(event);
        }}
        onError={() => setLoaded(true)}
      />
    </>
  );
}
