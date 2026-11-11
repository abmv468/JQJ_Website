import { Minus, Plus } from "lucide-react";

export default function QuantityStepper({
  name,
  quantity,
  onDecrease,
  onIncrease,
}: {
  name: string;
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div
      className="inline-flex shrink-0 items-center border border-brand-border"
      role="group"
      aria-label={`Quantity for ${name}`}
    >
      <button
        type="button"
        className="inline-flex h-11 w-11 items-center justify-center text-white/80 transition-colors hover:text-white"
        aria-label={`Decrease quantity of ${name}`}
        onClick={onDecrease}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="w-8 text-center text-sm tabular-nums" aria-live="polite" aria-atomic="true">
        {quantity}
      </span>
      <button
        type="button"
        className="inline-flex h-11 w-11 items-center justify-center text-white/80 transition-colors hover:text-white"
        aria-label={`Increase quantity of ${name}`}
        onClick={onIncrease}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
