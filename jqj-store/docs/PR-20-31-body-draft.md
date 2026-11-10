Local drafts only. Not applied to GitHub while the push freeze is on.

# PR 20
Branch: cursor/airwallex-intent-idempotency-3c88
URL: https://github.com/abmv468/JQJ_Website/pull/20

The live description already contains the sections below, including the follow-up. This file is the copy to reapply if that text is lost. Do not push it.

## Follow-up

Not fixed here: a payment that succeeds after expiry marks the order paid with its stock already released, so an oversell is possible.

Also in the live #20 description: catch-block guard, payment-row .neq('status','succeeded'), and the claim-first sweep. The sweep leaves inventory_reserved true on the claim update because restore_order_inventory returns no stock once that flag is false. The restore call clears the flag.

# PR 31
Branch: cursor/airwallex-order-not-claimed-3c88
Base: cursor/airwallex-intent-idempotency-3c88
URL: https://github.com/abmv468/JQJ_Website/pull/31
Retarget the base to main after #20 merges.

Add these points to the live description when the freeze lifts. They are not on GitHub yet.

## What changed

When webhook processing throws, including a database error during the paid claim, the HTTP body is { error: "Internal error" }. The server log has only the order id, payment id, payment intent id, and webhook event id. The webhook row is marked failed.

order_not_claimed still returns HTTP 200 and stores the webhook row as failed. The log line is [airwallex-webhook] order_not_claimed with orderId, merchantOrderId, and paymentIntentId only.

## Why

HTTP stays 200 for order_not_claimed. Airwallex retries non-2xx deliveries. A 500 would redeliver the event. A row already marked failed is not treated as a duplicate, so the handler would run again and still not claim the order. That does not double-apply a paid transition, but it is not a useful retry.

A thrown database error is different: the handler returns 500 so the failure is visible, and the body does not include the driver message.

## How it was verified

- logs order_not_claimed with the order id and marks the webhook failed
- still marks a normal success claim processed and paid
- treats a duplicate success event as a no-op
- returns a generic error body when processing throws
- DB error during claim returns 5xx — an 08006 error injected into the order-claim update returns 500, the body is { error: "Internal error" } and does not contain the driver message, and the webhook row is failed

No schema changes. Stay a draft. Do not merge.
