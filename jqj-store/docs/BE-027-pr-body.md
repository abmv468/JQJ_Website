Stacked on BE-024, merge after it.

BE-024's local tip does not contain BE-026 yet. That merge was held. This branch starts at BE-024 (`6e48a31`).

## What changed

A protected order has status `cancelled` or `sales_channel` `test`. `applyAirwallexPaymentIntentStatus` reads `sales_channel` and returns before the expiry re-reserve and before any status write. A protected order does not change `status`, `payment_status`, or `fulfillment_status`. It is not reserved, restored, or emailed.

A terminal event (succeeded, failed, cancelled, or abandoned) is logged with `reportPaymentOnProtectedOrder`. The event name is `airwallex.payment_on_protected_order`. The payload is the order id, payment intent id, payment status, and reason (`cancelled` or `test`). No customer details and no secrets.

Verify and the admin payment refresh still call that function, and they skip the payment upsert when the order is protected, so the force path does not write.

Webhook duplicate handling is unchanged. The second delivery of the same event id does not enter the status function again.

## Why

A late `payment_intent.succeeded` treated an equal status as applicable, and `deriveOrderStatusForPayment` did not keep `cancelled`. The order update then set it to paid. Verify and admin sync pass `force: true`, which could also rewrite a cancelled or test order to pending or failed, and a later success would email the shopper.

## How it was verified

Vitest, mocks only, `jqj-store/tests/checkout/protected-orders.test.ts`:

- ignores a succeeded webhook for a cancelled order
- ignores a failed webhook for a cancelled order
- ignores succeeded and failed webhooks for a test order that is still pending
- does not write when verify or admin sync forces a protected order
- treats a duplicate protected webhook as a duplicate and does not log again
- still re-reserves and pays an expired order that is not protected

Each protected case asserts no reserve or restore RPC, no email, and that the hook fired.

## Out of scope

R3. A same-key checkout retry can still reuse an order (`app/api/checkout/airwallex/route.ts`, the existing-payment lookup before a new order is created). This PR does not change that reuse. A protected order that is reused there is unchanged.

No customer-facing copy was added or changed.

Checkout/payment change: needs CTO review + Owner's own words before merge.
