import { cn } from "@/lib/utils";

export default function CartCheckoutButton({
  busy,
  blocked,
  className,
  onCheckout,
}: {
  busy: boolean;
  blocked: boolean;
  className?: string;
  onCheckout: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "btn-gold min-h-11 w-full disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      disabled={busy || blocked}
      aria-busy={busy ? true : undefined}
      onClick={onCheckout}
    >
      Checkout
    </button>
  );
}
