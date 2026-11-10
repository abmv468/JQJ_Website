# Testing and CI

Checkout, inventory, and payment tests run in Vitest against an in-memory stand-in for Supabase. Nothing in this suite calls Airwallex, Resend, or a real Supabase project. The browser smoke test stubs the Airwallex SDK and the store's own `/api/*` routes.

## Run locally

From `jqj-store/`:

```bash
npm ci
npm run lint          # fails on any ESLint warning
npm run typecheck
npm test
```

`npm run build` does not need environment variables. The production server does: without `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, middleware throws and pages return 500.

Those public values are inlined at build time. Build the browser smoke with fakes, then start it through Playwright:

```bash
npx playwright install chromium
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=test_dummy \
SUPABASE_SERVICE_ROLE_KEY=test_dummy \
AIRWALLEX_ENV=sandbox \
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000 \
npm run build
npm run test:e2e
```

`http://127.0.0.1:54399` is a closed port so a stray Supabase call fails immediately. `test_dummy` is not a credential.

## What is covered

- Store migrations still define the tables, columns, and RPCs checkout uses (`orders`, `order_items`, `payments`, `payment_webhook_events`, `products`, `product_variants`, `reserve_order_inventory`, `restore_order_inventory`, and the other `.from()` / `.rpc()` names in `app/` and `lib/`).
- `products` keeps the storefront columns (`slug`, `price`, `stock_count`). The agentic shape (`price_usd`, `margin_pct`) fails the inventory read. That is the 28 Oct checkout break: the retired agentic system replaced `public.products`, and the old seed could not be re-applied because `orders.status` was declared twice and a policy was created twice.
- `orders_status_check` still allows `pending` and `failed`, which checkout writes. The 28 Oct check allowed only `paid`, `packed`, `shipped`, `delivered`, and `refunded`.
- Airwallex checkout: empty cart, non-USD, short stock, a reserved order priced from the database (flat $15 shipping), and a restore when payment creation throws.
- Airwallex return/verify: success keeps the hold, a remote failure or cancellation restores it once, a still-pending intent does not, and missing, unknown, mismatched, or invalid input does not change another order.
- Webhook HMAC: valid signature, tampered body, bad signature, missing headers, stale timestamp.
- Cash on delivery: server price plus $15 shipping plus $20 fee, one reservation, the same idempotency key returns the same order, and a failed save restores stock. No `RESEND_API_KEY` means no email request. A blank `EMAIL_FROM` sends as `DEFAULT_ORDER_EMAIL_FROM`. A thrown, rejected, or `{ error }` Resend result still returns a saved COD order and a paid card/webhook transition.
- Browser: add to cart, card checkout through a stubbed SDK, failed return, and cash on delivery. No live payment page.
- Unpaid Airwallex reservations: a failed retry releases stock, a failed order is not reused, `GET /api/cron/release-reservations` expires stale holds, and a late capture re-reserves or sets `inventory_exception`.

## What is not covered

- The live Supabase project. Migration history there is still empty, so drift between the database and `supabase/migrations/` is invisible to CI.
- Real Airwallex, Stripe, or Resend calls, including refunds and the legacy Stripe checkout routes.
- Concurrent reservations against Postgres. The in-memory RPCs mirror the `inventory_reserved` guard, so a second restore is a no-op, but they do not take the live function's row lock.
- Admin, account, and catalog pages beyond the one product used by the browser smoke.
- A sweep can still release stock if a payment is marked succeeded in the gap between the status read and the restore. Closing that needs a database function that restores only when `payment_status` is not `succeeded`. No migration is in this change.

## CI

`.github/workflows/ci.yml` runs on pull requests and on pushes to `main`.

| Job | What it runs |
|---|---|
| `ci / verify` | `npm ci`, lint, `tsc --noEmit`, Vitest, `next build` with no secrets |
| `ci / e2e-checkout` | rebuild with the fake public env above, then Playwright Chromium |

The build in `verify` proves production compilation needs no secrets. The e2e job repeats the build because `NEXT_PUBLIC_*` values are baked into the browser bundle.

Environment names the build or server reads, when they are set at all: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AIRWALLEX_ENV`, `NEXT_PUBLIC_SITE_URL`. Webhook route tests set `AIRWALLEX_WEBHOOK_SECRET` themselves. Reservation-release tests also set `AIRWALLEX_CLIENT_ID`, `AIRWALLEX_API_KEY`, and `CRON_SECRET` to the dummy value `test_dummy`. CI does not use repository secrets.
