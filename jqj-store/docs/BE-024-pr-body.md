# BE-024 — Do not fulfill a card payment that succeeds after stock was released

Local draft only. Not opened while the push freeze is on.

## What changed

On `payment_intent.succeeded`, if the order was already expired (`payment_status` `abandoned` and `inventory_reserved` not true), the webhook tries to take the stock back with `reserve_order_inventory`, the same reservation primitive checkout uses. That function checks every line and then writes, so a short line reserves nothing.

- Stock is available for every line: the order is marked paid as it is today, including one confirmation email.
- Any line is short, or the order has no lines: the order is not made fulfillment-ready. `orders.status` becomes the existing value `inventory_exception`, `fulfillment_status` stays `payment_failed`, and `payment_status` becomes `succeeded` so the capture is recorded. No refund row is written and no customer email is sent.
- A second succeeded delivery for that intent does not reserve again and does not log the alert again.

No schema change. `orders.status` already allows `inventory_exception` (the same value Stripe checkout uses when a captured payment cannot be fulfilled). No new column was required.

BE-018 (#39) can alert on the exported event name `airwallex.payment_after_expiry_unfulfilled` (`PAYMENT_AFTER_EXPIRY_UNFULFILLED_EVENT` in `lib/payments/airwallex-orders.ts`). `reportPaymentAfterExpiryUnfulfilled` logs that name with the order id, the payment intent id, and the shortfall (`productId`, `variantId`, `requested`, `available`). The log has no customer PII and no secrets.

## Why

The reservation sweep releases stock and marks the order abandoned. A later Airwallex success used to mark that order paid and fulfillment-ready against stock that may already have been sold. This stops that silent oversell. When the stock cannot be taken back, someone still has to refund the capture by hand. This change does not call the refund API.

## How it was verified

Vitest, mocks only, `jqj-store/tests/checkout/pay-after-expiry.test.ts`:

- re-reserves released stock before marking an expired order paid
- flags an expired order when the released stock cannot be re-reserved
- reserves nothing when only one line of a multi-line order is short
- does not reserve or flag again when the same succeeded payment is delivered twice
- does not double-flag a second success after the stock shortfall was recorded
- leaves a reservation that has not expired on the normal paid path

The re-reserve test is the mutation check: removing the re-reserve leaves the order paid with `inventory_reserved` false and the original stock count, and that test fails. `known bug #1` in `tests/checkout/known-bugs.test.ts` now passes for the same case.

Also ran `tsc --noEmit`, `next lint`, and the full Vitest suite locally. No push, no CI.

No customer-facing copy was added or changed.

checkout/payment change: needs CTO review + Owner's own words before merge.
