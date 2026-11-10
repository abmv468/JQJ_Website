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

## Database gate

`supabase/ci/db-gate.sh` applies every file in `supabase/migrations` to an empty local Postgres, in filename order, then runs every `supabase/tests/*.sql` file the same way. The client is `psql -v ON_ERROR_STOP=1`, so the first error stops the run. Nothing in the script reads a hosted Supabase URL. It exits unless `PGHOST` is `localhost`, `127.0.0.1`, or `::1`.

Postgres 16 is the server. The paid-order migration uses `security invoker`, which PostgreSQL 15 added, and the migrations create `uuid-ossp` themselves. A stock server has no Supabase roles, so `supabase/ci/bootstrap.sql` creates `anon`, `authenticated`, and `service_role`, plus `auth.users(id)` and `auth.uid()`, and then the real migration files run unchanged. That is the whole Supabase surface those files touch. The Supabase CLI local stack is the alternative; it starts Auth, Storage, Realtime, and Studio, which these migrations never use.

Throwaway credentials are `postgres` / `postgres`. The script drops and recreates a database named `jqj_migrations` on that server. It does not use repository secrets.

From `jqj-store/`, with Postgres 16 already listening on localhost:

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres \
  bash supabase/ci/db-gate.sh
```

`apply` stops after the migrations. `test` runs only the SQL files, against the database `apply` just built. Docker is one way to get the server:

```bash
docker run --rm --name jqj-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=postgres \
  -p 5432:5432 \
  postgres:16
```

A new migration is any new `supabase/migrations/*.sql` file. The next run applies it. A new SQL test is any new `supabase/tests/*.sql` file. Raise an exception to fail. Roll the fixtures back at the end of the file so the next file still sees only the migrated schema. Filename order is byte order (`LC_ALL=C`), which matches the timestamp prefixes.

## What is covered

- Store migrations still define the tables, columns, and RPCs checkout uses (`orders`, `order_items`, `payments`, `payment_webhook_events`, `products`, `product_variants`, `reserve_order_inventory`, `restore_order_inventory`, and the other `.from()` / `.rpc()` names in `app/` and `lib/`).
- `products` keeps the storefront columns (`slug`, `price`, `stock_count`). The agentic shape (`price_usd`, `margin_pct`) fails the inventory read. That is the 28 Oct checkout break: the retired agentic system replaced `public.products`, and the old seed could not be re-applied because `orders.status` was declared twice and a policy was created twice.
- `orders_status_check` still allows `pending` and `failed`, which checkout writes. The 28 Oct check allowed only `paid`, `packed`, `shipped`, `delivered`, and `refunded`.
- Airwallex checkout: empty cart, non-USD, short stock, a reserved order priced from the database (flat $15 shipping), and a restore when payment creation throws.
- Airwallex return/verify: success keeps the hold, a remote failure or cancellation restores it once, a still-pending intent does not, and missing, unknown, mismatched, or invalid input does not change another order.
- Webhook HMAC: valid signature, tampered body, bad signature, missing headers, stale timestamp.
- Cash on delivery: server price plus $15 shipping plus $20 fee, one reservation, the same idempotency key returns the same order, and a failed save restores stock. No `RESEND_API_KEY` means no email request.
- Browser: add to cart, card checkout through a stubbed SDK, failed return, and cash on delivery. No live payment page.
- Unpaid Airwallex reservations: a failed retry releases stock, a failed order is not reused, `GET /api/cron/release-reservations` expires stale holds, and a late capture re-reserves or sets `inventory_exception`.
- The real `restore_order_inventory` and `reserve_order_inventory` functions on Postgres. A paid order (`payment_status = succeeded`) returns `success = false` with message `Order is paid; inventory not restored`, and stock and `inventory_reserved` stay as they were. An unpaid reserved order restores stock once and clears the flag. A second restore does not add stock again. A second reserve does not decrement again. `anon` and `authenticated` do not have `EXECUTE` on either function (`has_function_privilege`, which also counts a grant to `PUBLIC`). `service_role` does.

## What is not covered

- The live Supabase project. The database gate builds an empty local database from `supabase/migrations`. It never connects to the hosted project, so drift on that project stays invisible.
- Real Airwallex, Stripe, or Resend calls, including refunds and the legacy Stripe checkout routes.
- Two sessions racing `restore_order_inventory`. The SQL tests call the real function, including its row lock, on one connection.
- Admin, account, and catalog pages beyond the one product used by the browser smoke.
- Grants on the refund and lower-level stock functions (`apply_order_refund`, `reserve_inventory`, `restore_inventory`). The gate checks execute privileges for the two order-level RPCs only.

## CI

`.github/workflows/ci.yml` runs on every pull request, including stacked PRs whose base is not `main`, and on pushes to `main`.

| Job | What it runs |
|---|---|
| `ci / verify` | `npm ci`, lint, `tsc --noEmit`, Vitest, `next build` with no secrets |
| `ci / e2e-checkout` | rebuild with the fake public env above, then Playwright Chromium |
| `ci / db-migrations` | throwaway Postgres 16, then `supabase/ci/db-gate.sh apply` and `test` |

The build in `verify` proves production compilation needs no secrets. The e2e job repeats the build because `NEXT_PUBLIC_*` values are baked into the browser bundle.

Environment names the build or server reads, when they are set at all: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AIRWALLEX_ENV`, `NEXT_PUBLIC_SITE_URL`. Webhook route tests set `AIRWALLEX_WEBHOOK_SECRET` themselves. Reservation-release tests also set `AIRWALLEX_CLIENT_ID`, `AIRWALLEX_API_KEY`, and `CRON_SECRET` to the dummy value `test_dummy`. CI does not use repository secrets. The database job's `postgres` / `postgres` login exists only inside that job's container.
