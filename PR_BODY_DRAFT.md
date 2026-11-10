# PR body draft (local only, not applied)

Do not push this file's contents to GitHub until the push freeze is lifted. Vercel is rate-limited.

## What

`upsertAirwallexPaymentIntent` no longer writes the full Airwallex payment intent into `payments.metadata`. `toPersistedIntent` keeps only `id`, `request_id`, `status`, `amount`, `currency`, `merchant_order_id`, `created_at`, `updated_at`, `captured_amount`, `original_amount`, `original_currency`, `descriptor`, and `latest_payment_attempt` reduced to `{ status, payment_method: { type, card: { brand, last4 } } }` when that attempt is present. `client_secret`, `customer`, `next_action`, `return_url`, and every other field are dropped.

Every payments writer that used to store the intent now calls `upsertAirwallexPaymentIntent`, whose metadata assignment is `toPersistedIntent(input.intent)` at `jqj-store/lib/payments/airwallex-orders.ts:407`. That is the #20 write that was `metadata: input.intent` at `airwallex-orders.ts:337` on the parent. Checkout, verify, admin refresh, and the webhook spread all go through it. `applyAirwallexPaymentIntentStatus` updates `payments` with status, event id, and timestamps only. It does not write the intent.

The Airwallex webhook still verifies the signature against the raw body. Only the `payment_webhook_events` insert strips `client_secret` at any depth before the row is stored.

The admin list (`app/api/admin/orders/route.ts:48`) and detail (`app/api/admin/orders/route.ts:32`) selects use the column list at line 28. They do not select `metadata`.

## Why

`payments.metadata` stored the full Airwallex payment intent, including `client_secret`. A secret was persisted. DATA's scrub of existing rows runs after this deploys. This change stops new writes from storing it and stops the admin API from returning the column.

The scrub (DATA, a guarded one-off under supabase/changes/) runs only after this commit is confirmed live on Vercel Production.

NO MERGE without CTO review + Owner's own words; must land before Airwallex go-live.

## Writers

Current lines are on this branch. The parent-audit lines are where those writes sat before this change.

| Writer | What it now stores | Test |
| --- | --- | --- |
| Checkout calls `upsertAirwallexPaymentIntent` at `jqj-store/app/api/checkout/airwallex/route.ts:386` (parent audit pointed at `airwallex-orders.ts:303` / `route.ts:260`; the write is the call at 386). The shared metadata write is `jqj-store/lib/payments/airwallex-orders.ts:407`. | Allowlisted intent in `payments.metadata`. `client_secret` stays only on the fresh create-intent response returned to the browser. | `checkout writes the intent only through the allowlist` |
| Verify calls `upsertAirwallexPaymentIntent` at `jqj-store/app/api/checkout/airwallex/verify/route.ts:113` (parent line 80 is the canonical-payment lookup, not the write). | Allowlisted retrieved intent in `payments.metadata`. | `verify writes the intent only through the allowlist` |
| Admin refresh calls `upsertAirwallexPaymentIntent` at `jqj-store/app/api/admin/orders/route.ts:176` (parent line 173). | Allowlisted retrieved intent in `payments.metadata`. | `admin refresh writes the intent only through the allowlist` |
| Webhook spread builds the intent at `jqj-store/app/api/webhooks/airwallex/route.ts:152-162` (`...object`, parent lines 141-154) and passes it to `upsertAirwallexPaymentIntent`. | Allowlisted intent in `payments.metadata`. The stored `payment_webhook_events.payload` has `client_secret` removed at every depth, including depth 2 and deeper (`data.object.client_secret`, `customer`, `next_action`, `latest_payment_attempt.payment_method.card`, and array items). Signature verification still uses the raw body. | `webhook spread writes the intent only through the allowlist` |
| #20 whole-intent write, formerly `jqj-store/lib/payments/airwallex-orders.ts:337` (`metadata: input.intent`), now `jqj-store/lib/payments/airwallex-orders.ts:407` (`metadata: toPersistedIntent(input.intent)`). | Allowlisted fields only. No raw intent remains on any payments insert, upsert, or update. | `persists an allowlisted payment intent and drops secrets at every depth` and `drops client_secret from every payments write across checkout, verify, admin refresh, and the webhook` |
| Admin selects at `jqj-store/app/api/admin/orders/route.ts:32` (detail, parent line 30) and `:48` (list, parent line 45). Column list is line 28: `payments(provider, status, provider_payment_intent_id, payment_refunds(*))`. | Those columns only. No `metadata`. No `payments(*)`. | `selects explicit payment columns for the admin list and detail reads` |

The catch-all `drops client_secret from every payments write across checkout, verify, admin refresh, and the webhook` installs a mock Supabase client that records every `payments` insert, upsert, and update, drives checkout, verify, admin refresh, and the webhook spread, and fails if `client_secret` appears at any depth in those payloads or in the stored webhook event.

## Readers

Checked on this branch, which includes #20 and #31.

No application code reads `payments.metadata`. Payment selects name columns. The upsert still uses `.select("*")` and returns that row on the server; callers use only `id` and `order_id`. After this change the metadata on that row is the allowlist.

`client_secret` is taken only from the fresh `createAirwallexPaymentIntent` response in `app/api/checkout/airwallex/route.ts`, then returned as `clientSecret`. The checkout page passes that response field to `payments.redirectToCheckout`. It is not loaded from the database.

Verify, admin refresh, and the webhook do not read `client_secret` or `next_action`. There is no 3DS / `next_action` resume. `requires_customer_action` is only a status.

`app/admin/page.tsx` reads payment `provider`, `status`, `provider_payment_intent_id`, and refund `id`, `amount`, `status`, `reason`, and `created_at`. The payment type also declares `id` and `currency`, but the page never reads them. It does not read `provider_request_id` or payment `amount`.

## Verified

Local `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` in `jqj-store`. No database writes. No env changes. Not merged. Not pushed while Vercel is rate-limited.
