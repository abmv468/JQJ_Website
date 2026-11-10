import { STOCK_CHECK_RETRY_ACTION, STOCK_CHECK_RETRY_MESSAGE } from "@/lib/cart-copy";

export default function StockCheckNotice({
  loading,
  failed,
  onRetry,
}: {
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <p className="mt-2 text-xs text-brand-muted" role="status">
        Checking stock…
      </p>
    );
  }

  if (!failed) return null;

  return (
    <div className="mt-2" role="alert" data-testid="stock-check-retry">
      <p className="text-xs text-brand-muted">{STOCK_CHECK_RETRY_MESSAGE}</p>
      <button
        type="button"
        className="mt-1 inline-flex min-h-11 items-center text-xs uppercase tracking-wider2 text-white hover:text-brand-gold"
        onClick={onRetry}
      >
        {STOCK_CHECK_RETRY_ACTION}
      </button>
    </div>
  );
}
