import { Lock } from "lucide-react";
import {
  CARD_NETWORK_LABELS,
  CASH_ON_DELIVERY_LABEL,
  SECURE_CHECKOUT_LABEL,
} from "@/lib/cart-copy";
import { cn } from "@/lib/utils";

export default function CheckoutTrustStrip({ className }: { className?: string }) {
  return (
    <div className={cn("mt-3", className)} data-testid="checkout-trust-strip">
      <p className="flex items-center gap-1.5 text-[13px] leading-5 text-white/80">
        <Lock className="h-3.5 w-3.5 shrink-0 text-brand-gold" aria-hidden="true" />
        {SECURE_CHECKOUT_LABEL}
      </p>
      <ul className="mt-2 flex flex-wrap items-center gap-1.5">
        {CARD_NETWORK_LABELS.map((label) => (
          <li key={label}>
            <span className="inline-flex h-6 items-center rounded-[3px] bg-white px-1.5 font-heading text-[10px] font-semibold tracking-[0.04em] text-neutral-950">
              {label}
            </span>
          </li>
        ))}
        <li className="text-[13px] leading-5 text-white/72">{CASH_ON_DELIVERY_LABEL}</li>
      </ul>
    </div>
  );
}
