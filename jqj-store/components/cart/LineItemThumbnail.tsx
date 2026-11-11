import Image from "next/image";
import { cn } from "@/lib/utils";

const imageFrame = {
  64: "h-16 w-16",
  80: "h-20 w-20",
  112: "h-28 w-28",
} as const;

export default function LineItemThumbnail({
  src,
  alt,
  quantity,
  size = 64,
  rounded = false,
}: {
  src: string;
  alt: string;
  quantity?: number;
  size?: keyof typeof imageFrame;
  rounded?: boolean;
}) {
  const showQuantity = quantity != null;
  const frame = imageFrame[size];

  return (
    <div className={cn("relative shrink-0", showQuantity ? "h-[4.5rem] w-[4.5rem]" : frame)}>
      <div
        className={cn(
          "overflow-hidden bg-brand-card",
          rounded && "rounded-brand",
          frame,
          showQuantity && "absolute bottom-0 left-0"
        )}
      >
        <Image src={src} alt={alt} fill className="object-cover" sizes={`${size}px`} />
      </div>
      {showQuantity && (
        <span
          data-testid="line-quantity"
          aria-label={`Quantity ${quantity}`}
          className="absolute right-0 top-0 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-gold px-1 text-xs font-semibold leading-none text-black ring-2 ring-brand-bg"
        >
          {quantity}
        </span>
      )}
    </div>
  );
}
