export const REFUND_AMOUNT_REQUIRED = "Enter a refund amount.";

export const REFUND_FAILED_BALANCE =
  "This refund couldn\u2019t be completed because there isn\u2019t enough receivable or available balance. The order was not marked as refunded.";

export const REFUND_NOT_CONFIRMED =
  "This refund is not confirmed yet. The order was not marked as refunded.";

const REFUND_EPSILON = 0.00001;

export function orderDisplayId(id: string): string {
  return id.slice(0, 8);
}

export function parseRefundAmount(
  raw: string
): { ok: true; amount: number } | { ok: false; message: string } {
  if (raw.trim() === "") return { ok: false, message: REFUND_AMOUNT_REQUIRED };
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: REFUND_AMOUNT_REQUIRED };
  }
  return { ok: true, amount };
}

export type RefundPrepare =
  | { callApi: false; fieldError: string; openConfirm: false }
  | { callApi: false; fieldError: null; openConfirm: true; amount: number }
  | { callApi: true; fieldError: null; openConfirm: true; amount: number };

/** Empty amount never opens confirm and never calls the refund API. */
export function prepareRefundSubmit(raw: string, confirmed: boolean): RefundPrepare {
  const parsed = parseRefundAmount(raw);
  if (!parsed.ok) return { callApi: false, fieldError: parsed.message, openConfirm: false };
  if (!confirmed) return { callApi: false, fieldError: null, openConfirm: true, amount: parsed.amount };
  return { callApi: true, fieldError: null, openConfirm: true, amount: parsed.amount };
}

export function refundConfirmPrompt(amountLabel: string, orderId: string): string {
  return `Refund ${amountLabel} on order ${orderId}?`;
}

export function partialRefundRecorded(amountLabel: string, orderId: string): string {
  return `A refund of ${amountLabel} has been recorded on order ${orderId}. The order is not fully refunded.`;
}

export function fullRefundRecorded(amountLabel: string, orderId: string): string {
  return `A refund of ${amountLabel} has been recorded on order ${orderId}. Fully refunded.`;
}

export function remainingToRefund(total: number, refunded: number): number {
  return Math.max(total - refunded, 0);
}

export function remainingAfterThisRefund(remaining: number, amount: number): number {
  return Math.max(remaining - amount, 0);
}

export function isProviderBalanceFailure(text: string): boolean {
  const value = text.toLowerCase();
  if (value.includes("amount_above_limit")) return true;
  if (value.includes("available balance")) return true;
  if (value.includes("insufficient receivable")) return true;
  if (value.includes("insufficient") && value.includes("receivable")) return true;
  if (value.includes("insufficient") && value.includes("balance")) return true;
  return false;
}

export type RefundOutcome = "rejected" | "pending" | "partial" | "full" | "failed";

export type RefundAttempt = {
  outcome: RefundOutcome;
  message: string;
  /** Replace the order from the response. Failed totals stay on the previous order. */
  applyOrder: boolean;
  fullyRefunded: boolean;
};

export function interpretRefundAttempt(input: {
  httpOk: boolean;
  error?: string | null;
  code?: string | null;
  refundStatus?: string | null;
  previousRefunded: number;
  nextRefunded: number;
  total: number;
  amountLabel: string;
  orderId: string;
  orderReturned: boolean;
}): RefundAttempt {
  const blob = [input.error, input.code, input.refundStatus].filter(Boolean).join(" ");
  const status = (input.refundStatus ?? "").trim().toLowerCase();
  const balanceFailure = status === "failed" || isProviderBalanceFailure(blob);

  if (balanceFailure) {
    return {
      outcome: "failed",
      message: REFUND_FAILED_BALANCE,
      applyOrder: input.httpOk && input.orderReturned,
      fullyRefunded: false,
    };
  }

  if (!input.httpOk) {
    return {
      outcome: "rejected",
      message: input.error?.trim() || "This refund couldn\u2019t be completed. The order was not marked as refunded.",
      applyOrder: false,
      fullyRefunded: false,
    };
  }

  const increased = input.nextRefunded > input.previousRefunded + REFUND_EPSILON;
  const confirmed = increased || status === "settled";
  if (!confirmed) {
    return {
      outcome: "pending",
      message: REFUND_NOT_CONFIRMED,
      applyOrder: input.orderReturned,
      fullyRefunded: false,
    };
  }

  const remaining = remainingToRefund(input.total, input.nextRefunded);
  if (remaining <= REFUND_EPSILON) {
    return {
      outcome: "full",
      message: fullRefundRecorded(input.amountLabel, input.orderId),
      applyOrder: true,
      fullyRefunded: true,
    };
  }

  return {
    outcome: "partial",
    message: partialRefundRecorded(input.amountLabel, input.orderId),
    applyOrder: true,
    fullyRefunded: false,
  };
}

type RefundIdentity = {
  status?: string | null;
  fulfillment_status?: string | null;
  refunded_amount?: number | string | null;
};

/** A failed attempt may keep new payment history, and must not mark the order refunded. */
export function orderAfterRefundAttempt<T extends RefundIdentity>(
  previous: T,
  returned: T | null,
  outcome: RefundOutcome
): T {
  if (!returned) return previous;
  if (outcome === "partial" || outcome === "full") return returned;
  if (outcome === "failed" || outcome === "pending") {
    return {
      ...returned,
      status: previous.status,
      fulfillment_status: previous.fulfillment_status,
      refunded_amount: previous.refunded_amount,
    };
  }
  return previous;
}
