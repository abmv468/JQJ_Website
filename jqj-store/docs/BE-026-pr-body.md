# BE-026 — One reaper and checkout catch, so PR #3 can be retired

Local draft only. Not opened while the push freeze is on.

This supersedes PR #3 (`cursor/release-unpaid-stock-93fb` at `4eef08b`). Do not merge #3.

## What changed

The card checkout catch always calls `releaseOrderReservation` for the order it is holding. That reads the stored lines, so a same-key retry that reused the order and did not reserve again still gives the stock back. Lines from this request are only a fallback for the moment after reserve and before the line insert. A paid order is not restored.

The order is marked failed only after that release, and only while `inventory_reserved` is false, with the existing `.or('payment_status.is.null,payment_status.neq.succeeded')` guard. If the release throws, the order stays reserved and is not marked failed. The catch logs `[airwallex-checkout] reservation release failed` with the order id and no customer details. The pending sweep, or the failed sweep below, can take it later.

`releaseExpiredAirwallexReservations` still claims a row before it restores, and restores only when that update returns a row. The claim keeps `.or('payment_status.is.null,payment_status.neq.succeeded')` and `.neq('status','succeeded')`. Pending holds are still limited to the unpaid statuses and the 75-minute cutoff. Failed orders that still have `inventory_reserved` true are swept at any age.

## Why

PR #3 and PR #20 both release unpaid card stock, in different shapes. Shipping both would fight over the same catch and the same sweep. This branch is the copy that can replace #3: the retry hole in #20's catch, and failed holds that #20's sweep never saw.

## How it was verified

Vitest, mocks only, `jqj-store/tests/checkout/combined-reaper.test.ts`:

- releases stock when a same-key retry fails without reserving again
- leaves a held order for the reaper when the release throws
- sweeps a failed reserved order once and does not sweep it again
- does not restore a paid order
- restores once when two reaper runs overlap

The same-key test is the mutation check. Removing the catch release leaves the reused order's stock at 4, and that test fails.

Also ran `tsc --noEmit`, `next lint`, and the full Vitest suite locally. No push.

## Deliberately not taken from `4eef08b`

- `app/api/cron/release-reservations/route.ts`, `CRON_SECRET`, and the sweep's `{ released, paid, errors }` body. Checkout still calls `releaseExpiredAirwallexReservations` directly.
- Any Airwallex read or cancel inside the sweep. The reaper does not call the network.
- Cancelling the `payments` row.
- Re-reading the provider and re-reserving, or flagging, when a payment succeeds during or after release. That case is BE-024, on `cursor/pay-after-expiry-oversell`, not this branch.
- Marking the order failed when the release throws. #3 did that and left `inventory_reserved` true. This catch does not, so a still-held order is not labeled failed.
- A failed idempotency key starting a brand-new order, and the concurrent double-create that goes with it.
- Email, shipping, verify, and confirmation-page edits that are on #3's branch and not on this one.

No customer-facing copy was added or changed.

Checkout change: needs CTO review and the Owner's own words before merge.
