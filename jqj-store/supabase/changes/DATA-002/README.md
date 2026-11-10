# DATA-002 orders hardening: README (PREPARE ONLY, nothing applied)

Ticket DATA-002 (orders hardening part). Prepared by JQD-DATA, 10 Nov 2026 HKT. **Revision r2 (16:14 HKT)** after QA's FAIL on #30 `e26f79e5` (backfill only); see "r2 changes" below. Production `dgeywuxelljfagnelxdg` untouched; read-only SELECTs only, no PII columns.
How to apply, pass criteria, rollback, routes: see `RUNBOOK.md`.

## r2 changes (QA FAIL on #30 e26f79e5, CTO/BACKEND steers)
1. **No backfill.** r1's CASE mapped `inventory_exception` → `'failed'`; since PR #9 that status means *paid with no stock*. r2 removes the CASE. The NULL check and `SET NOT NULL` are **one DO block** (`$not_null$`): it sets `lock_timeout 3s` itself, returns early if the column is already NOT NULL (re-run = no-op, no lock), takes `ACCESS EXCLUSIVE` on orders, counts NULL rows and `RAISE EXCEPTION` (P0001, `DATA-002 guard: N orders row(s) have payment_status IS NULL; refusing to SET NOT NULL`, DETAIL + HINT) if any exist, otherwise `ALTER ... SET NOT NULL`. One statement, so it is atomic under autocommit `psql -f` (QA note b) as well as inside the CLI's transaction. Nothing derives a payment_status from `orders.status`.
2. **New CHECK** `orders_checkout_attempt_requires_provider_chk CHECK (checkout_attempt_id IS NULL OR payment_provider IS NOT NULL)`, idempotent (pg_constraint lookup, like the UNIQUE attach). BACKEND confirmed BE-009b writes the column only on Airwallex inserts with provider `'airwallex'`; COD leaves it NULL. Safe: the column is new, so all existing rows pass. This closes the NULL-provider gap QA noted (a).
3. **Unchanged:** default `'unpaid'`, top-level `lock_timeout 3s` / `statement_timeout 60s`, `checkout_attempt_id uuid NULL`, `UNIQUE (payment_provider, checkout_attempt_id)` (named, NULLs distinct). No BEGIN/COMMIT in the file (CLI finding: RUNBOOK §2).
4. **Tests:** 003 §6 checks the CHECK's exact definition and that it is validated; §7 now asserts the gap is closed (23514 naming the CHECK on INSERT and UPDATE; (NULL, NULL) ok; (airwallex, attempt) ok). New **004** re-runs the real migration via psql `\ir` against seeded NULL rows: (A) inside a transaction it raises P0001 and the savepoint rollback leaves rows unchanged; (B) in autocommit the guard block aborts alone: payment_status still nullable, rows unchanged, the `inventory_exception` row still NULL (not 'failed'); (C) re-apply on the clean schema is a no-op.
5. rollback drops the CHECK too; precheck reports `attempt_without_provider`, `attempt_provider_check`, and both names in `name_collisions`; `compare_fingerprints.py` expects `count_constraints +2`; `apply_via_connector.sql` regenerated from the r2 CLI history row (+ CHECK post-check).

## A. Column: `checkout_attempt_id uuid` (nullable), matched to PR #20

PR #20 ("Keep one Airwallex order per payment intent (BE-009)", draft, head `a849d5b85fbdb08c07b97591d0ff406058678972`, still the only commit at 15:05 HKT; diff saved as `evidence/pr20_a849d5b.diff`):

- **Name.** The PR body's "Residual race / database constraint" section proposes exactly "a new `orders.checkout_attempt_id` with `UNIQUE (payment_provider, checkout_attempt_id)`". Main already calls the per-mount key `checkoutAttemptIdRef`. #20 renames it `codAttemptIdRef` for COD.
- **What the per-cart key is.** `jqj-store/lib/checkout-attempt.ts` (new, L37–136): `resolveCheckoutAttempt(items, storage, createKey)` keeps one `idempotencyKey` per cart fingerprint in `sessionStorage["jqd-airwallex-checkout-attempt"]`. The key rotates when the cart changes or after success, and is kept after a pending or failed return.
- **Format.** `app/(store)/checkout/page.tsx` (#20 L231–241) creates it with `() => crypto.randomUUID()` (UUID v4) and sends it in the body as `idempotencyKey`. COD sends `codAttemptIdRef.current`, also `crypto.randomUUID()`.
- **Where it's set on the server.** `app/api/checkout/airwallex/route.ts`: `const clientRequestId = asUuid(idempotencyKey); let requestId = clientRequestId ?? randomUUID();`. `asUuid` only accepts `UUID_REGEX` (main L31–32, v1–5). Server-side, the value is:
  - replaced by the existing payment's `provider_request_id` when the intent or key is found
  - replaced by a fresh `randomUUID()` when the stored cart doesn't match
  - sent to Airwallex as `request_id`
  - stored in `payments.provider_request_id` (text) via `intent.request_id ?? requestId`
- **Type.** Every value that reaches the DB is a UUID string, so the column is `uuid`. That's 16 bytes, and malformed input fails loudly. If BACKEND wants parity with `payments.provider_request_id` (text), it's a one-word change; tests and precheck don't depend on it.

### Conflicts / things BACKEND must match (no blocker for the schema, but they decide whether checkout breaks)
1. **Write the effective `requestId`, not the raw client `idempotencyKey`.** In #20, when the stored cart doesn't match, the server keeps the client key but mints a new `requestId` and inserts a *new* order. If the column held the raw client key, that second order would hit 23505, and checkout would 500.
2. **Failed/abandoned orders vs retries with the same key.** #20 keeps the key after a failed return. PR #3 says "a failed order is not reused". Any path that decides to insert a *new* order for an attempt that already has one must mint a new `requestId` first, as the cart-mismatch path does. Otherwise it gets 23505.
3. **Handle 23505 on `orders_provider_checkout_attempt_key`.** This is the concurrent-double-insert case the constraint exists for. Use `ON CONFLICT DO NOTHING` + select, or catch it, and reuse the winner's order. Don't surface an error or reserve stock twice.
4. `payment_provider` is nullable. Every insert sets it ('airwallex' / 'cod' / 'stripe'), and production has 0 NULLs. Since r2 the CHECK `orders_checkout_attempt_requires_provider_chk` refuses an attempt id without a provider (23514), so a NULL provider can no longer escape the uniqueness. Follow-up (not in #30): `SET NOT NULL` on `payment_provider`.

## B. `payment_status`: default kept `'unpaid'` (flagged), NOT NULL added

Every order write sets `payment_status` explicitly. No code path relies on the column default. The "new order" value is provider-specific:

| path (main 87405b4 unless noted) | value |
|---|---|
| `app/api/checkout/airwallex/route.ts:177` order insert (unchanged in #20) | `"requires_payment_method"` |
| `app/api/checkout/airwallex/route.ts:272` post-intent update / #20 diff L431 (new-order branch) | `normalizeAirwallexPaymentStatus(intent.status)` (never null; `'unknown'` fallback, `lib/payments/airwallex.ts:416-420`) |
| `app/api/checkout/airwallex/route.ts:322` error path | `"failed"` |
| #20 reused-order update (diff L400–410) | omits `payment_status` (not touched) |
| `app/api/checkout/cod/route.ts:180` claim update, `:225` insert / `:310` | `"pending"` / `"failed"` |
| `app/api/checkout/verify/route.ts:177, :294, :325, :419, :430` (legacy Stripe) | `"succeeded"` / `"pending"` |
| `lib/payments/airwallex-orders.ts:146/157/167` `deriveOrderStatusForPayment`, `:385` apply update; #20 `orderPatch` (diff L838) | `"succeeded"` or `InternalPaymentStatus` |
| `lib/payments/airwallex-orders.ts:569` reservation sweep | `"abandoned"` |
| webhook `app/api/webhooks/airwallex/route.ts` | no direct orders write; goes through `applyAirwallexPaymentIntentStatus` (#20 L10, L122) |

- **Why the default stays 'unpaid'.** There's no single "new order" value, so per the brief the default stays `'unpaid'`. That's the value `20261023190000` set and production has now, so `SET DEFAULT` is a no-op re-statement.
- **Flag.** `'unpaid'` isn't in the sweep's `pendingStatuses` (`airwallex-orders.ts:544-550`). A hypothetical row that relied on the default with `inventory_reserved = true` would never be released.
- **Alternative.** `'pending'` is in `InternalPaymentStatus` and in the sweep list, it's COD/Stripe's initial value, and it's the `20261023190000` backfill fallback. It's a one-line change; CTO/BACKEND decide. Production has no `'unpaid'` rows.
- **NOT NULL safety.** No write on main, #20 (a849d5b), #3 or #18 sets NULL. The values are literals or the non-null `InternalPaymentStatus` union, and supabase-js drops `undefined` keys. No DB function writes `payment_status`; PR #7 only reads it.
- **No backfill (r2).** Production had 0 NULLs (14:53 and 15:02 HKT). If any NULL row exists at apply time the guard block RAISEs and nothing in that statement is applied (under the CLI / route C the whole file rolls back, history included). Any NULL rows must be set explicitly from payments/Airwallex records as a separate Owner-approved data fix; the migration never guesses (r1's `inventory_exception → 'failed'` mapping was wrong: PR #9 uses that status for paid-but-no-stock).
- **Optional CHECK (left out).** The code's set is `requires_payment_method, requires_customer_action, pending, pending_review, succeeded, failed, cancelled, abandoned, unknown` (`InternalPaymentStatus`) plus `unpaid` (default). That isn't proven complete: refunds/admin and open PRs may add values. If wanted later, use `add constraint orders_payment_status_check check (payment_status in (...)) not valid;` then `validate constraint`.

### BACKEND steer: NULL-safe order-claim filter (SECOPS finding)
- **Status of the fix.** #20's head is still `a849d5b` (one commit, 06:48 UTC = 14:48 HKT), so BACKEND's new order-claim gate isn't pushed yet. **Re-check when it lands.**
- **Current filter.** `.neq("payment_status", "succeeded")` on orders (diff L862, also PR #3 L592/L685) is SQL `payment_status <> 'succeeded'`. That silently skips NULL rows (`NULL <> x` is NULL).
- **Effect of NOT NULL.** NULL rows can't exist after this migration, so the plain `.neq` becomes NULL-safe in practice. A NULL-safe form (`.or("payment_status.is.null,payment_status.neq.succeeded")`, or `IS DISTINCT FROM` in SQL) gives the same result.
- **Default consistency.** Any default other than `'succeeded'` is claimable, so `'unpaid'` (or `'pending'`) is consistent with the gate. A default of `'succeeded'` would be wrong.

## Tests (QA-002 framework, PR #8, unchanged)
`tests/003_orders_checkout_attempt_and_payment_status.sql` covers:
- a duplicate (provider, attempt) is rejected (23505, named constraint; UPDATE too; `ON CONFLICT` shape works)
- two NULL attempts are allowed
- the same attempt under another provider is allowed
- an insert without `payment_status` gets 'unpaid'
- an explicit NULL is rejected on INSERT and UPDATE (23502)
- schema shape (uuid nullable, UNIQUE over exactly the 2 columns, NULLs distinct, CHECK present + validated with the exact expression, NOT NULL, RLS on)
- §7 (r2): the NULL-provider gap is closed: (NULL, attempt) → 23514 naming `orders_checkout_attempt_requires_provider_chk` on INSERT and UPDATE, clearing the provider on a row with an attempt → 23514, (NULL, NULL) ok twice, (airwallex, attempt) ok

`tests/004_orders_payment_status_null_guard.sql` (r2, new) re-runs the shipped migration file with psql `\ir ../migrations/...` (db-gate already uses `psql -f`, so no framework change; if the file is ever re-timestamped, update its 3 `\ir` lines):
- A. in a transaction + savepoint: 3 NULL rows (incl. `inventory_exception`) → P0001 `DATA-002 guard: 3 orders row(s) ...`; rows unchanged, nothing 'failed'
- B. autocommit (QA's db-gate mode): 1 NULL row → the guard block aborts alone; payment_status still nullable, rows byte-for-byte unchanged, `inventory_exception` row still NULL; fixture removed and NOT NULL restored afterwards
- C. re-apply on the clean migrated schema: no-op (columns, defaults, constraints, indexes identical)

Results (r2, local PG 16.15, `evidence/r2/`):
- db-gate (`local_db_gate_r2.log`): G1 prod-like 3+#30 tests 003/004 ok; G2 main+#7+#8+#30 tests 001–004 ok, manual re-apply = identical orders schema; G3 control without the migration fails (003); G3b 004 alone without the migration fails; G4 NULL rows before the migration → apply fails on the guard, payment_status still nullable, 0 'failed'; G5 mutant (r1 CASE backfill swapped back in) → killed by 004.
- scenarios (`local_scenarios_r2.log`): S1 expected-delta PASS (+1 col, +1 idx, +2 constraints), re-apply/rollback/re-apply identical; S2 NULL rows in one txn → raise, nothing applied; S2b autocommit → guard aborts alone, rows unchanged; S3 lock → 55P03 after 3.0 s; S4 real CLI 3.1.0 migration up ok, 9 statements in history; S4c CLI with NULL rows → raise, column/CHECK/history all rolled back; S4b CLI under lock → nothing applied; S5 connector route = CLI (history row byte-identical, schema identical), rollback clean; S6 mutant without SET NOT NULL → 003 fails.

Details are in RUNBOOK §8.

## Questions for BACKEND
1. Confirm you'll write the effective server `requestId` (as of the order insert) into `orders.checkout_attempt_id`, not `idempotencyKey`. Also confirm that every "insert a new order" decision mints a fresh `requestId` first (cart mismatch already does; failed/abandoned-order retries per PR #3 must too).
2. 23505 plan: `insert ... on conflict (payment_provider, checkout_attempt_id) do nothing` then select, or catch-and-reuse? Who restores stock if the loser had already reserved? (Today reservation happens after the insert, so the loser shouldn't have reserved yet.)
3. Should COD write `checkout_attempt_id` too (provider `'cod'`)? COD already dedupes via `orders_stripe_session_id_unique` on `'COD-<key>'`, so it isn't needed.
4. Default: keep `'unpaid'` or switch to `'pending'`?
5. `uuid` OK, or do you need `text` for parity with `payments.provider_request_id`?
6. Please push the NULL-safe order-claim commit to #20; I'll re-verify the filter against NOT NULL and the default.
7. Can you live with a follow-up `SET NOT NULL` on `orders.payment_provider`?

## Follow-up (design only, NOT in DATA-002 scope, no SQL file): single-transaction paid-claim RPC
Problem (SECOPS): #20 claims "paid" with two separate PostgREST updates, payments then orders. A crash, timeout or concurrent sweep between them leaves payments=succeeded with orders≠succeeded, or the reverse. BACKEND's app-side fix makes the order claim the gate, which narrows the window but can't make the two writes atomic.

Proposal: `public.claim_airwallex_payment_succeeded(p_intent_id text, p_event_id text default null, p_event_created_at timestamptz default null) returns table (claimed boolean, order_id uuid, reason text, needs_inventory boolean)`.
- **Function settings.** `language plpgsql`, `security invoker`, `set search_path = public`. `EXECUTE` only for `service_role`; revoke from `public`, `anon` and `authenticated`, as for the inventory RPCs. QA test 002 style.
- **Atomicity.** One function call is one transaction, so both writes commit or neither does.
- **Lock order (the order row is the gate).** First, find `payments.order_id` by `(provider='airwallex', provider_payment_intent_id)` without a lock. Then `SELECT ... FROM orders WHERE id = ... FOR UPDATE`, then `SELECT ... FROM payments WHERE id = ... FOR UPDATE`. That's orders before payments, the same order `restore_order_inventory` and the sweep lock in, so no deadlock.
- **Already paid.** If `orders.payment_status = 'succeeded'`, return `(false, order_id, 'already_succeeded', false)`. If the payment row lags, also set it to succeeded in the same transaction (self-heal).
- **Otherwise, in the same transaction:**
  - update `orders`: payment_status 'succeeded', status/fulfillment with the same "immutable states" rule as `deriveOrderStatusForPayment` (packed/shipped/delivered/refunded stay), `paid_at = coalesce(paid_at, now())`
  - update `payments`: status 'succeeded', `paid_at`, `last_event_id`, `last_event_created_at`
- **Stock.** If `orders.inventory_reserved = false` (the sweep already released it, known bug #1), return `needs_inventory = true` and let the caller re-reserve, or call `reserve_order_inventory` inside the function and set `inventory_exception` on failure. CTO/BACKEND choice.
- **Callers.** Return/verify and the webhook call it once. They send email only when `claimed = true` (the email stays outside the DB transaction; the existing `confirmation_email_sent_at` claim is unchanged).
- **Tests (QA-002 style).** A second call returns already_succeeded with no extra writes. Payment-only-succeeded state self-heals. Orders in packed/shipped keep their status. Grants. Optional two-session race test outside the single-connection gate.
- **Delivery.** A separate ticket and migration after #7, since it interacts with the paid guard in `restore_order_inventory`.
