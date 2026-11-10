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

`reuseExistingServer` is false, so `npm run test:e2e` always starts its own server with that fake env. It will not attach to a dev server already on the port, including one loaded from `.env.local` with a real Supabase project.

## What is covered

- Store migrations still define the tables, columns, and RPCs checkout uses (`orders`, `order_items`, `payments`, `payment_webhook_events`, `products`, `product_variants`, `reserve_order_inventory`, `restore_order_inventory`, and the other `.from()` / `.rpc()` names in `app/` and `lib/`).
- `products` keeps the storefront columns (`slug`, `price`, `stock_count`). The agentic shape (`price_usd`, `margin_pct`) fails the inventory read. That is the 28 Oct checkout break: the retired agentic system replaced `public.products`, and the old seed could not be re-applied because `orders.status` was declared twice and a policy was created twice.
- `orders_status_check` still allows `pending` and `failed`, which checkout writes. The 28 Oct check allowed only `paid`, `packed`, `shipped`, `delivered`, and `refunded`.
- Airwallex checkout: empty cart, non-USD, short stock, a reserved order priced from the database (flat shipping from the route), and a restore when payment creation throws.
- Airwallex return/verify: success keeps the hold, a remote failure or cancellation restores it once, a still-pending intent does not, and missing, unknown, mismatched, or invalid input does not change another order.
- Webhook HMAC: valid signature, tampered body, bad signature, missing headers, stale timestamp.
- Cash on delivery: server price plus flat shipping plus the COD fee on the route, one reservation, the same idempotency key returns the same order, and a failed save restores stock. No `RESEND_API_KEY` means no email request.
- Browser: add to cart, card checkout through a stubbed SDK, failed return, and cash on delivery. No live payment page. The Playwright projects below also gate UI/server total parity and the mobile pay control.

## What is not covered

- The live Supabase project. Migration history there is still empty, so drift between the database and `supabase/migrations/` is invisible to CI.
- Real Airwallex, Stripe, or Resend calls, including refunds and the legacy Stripe checkout routes.
- Concurrent reservations. The in-memory RPCs mirror the SQL guard (`inventory_reserved` makes a second restore a no-op) but they do not take a Postgres row lock.
- Admin, account, and catalog pages beyond the one product used by the browser smoke.
- Two known bugs, recorded as expected failures so they do not block merges:
  - A payment that succeeds after the 75-minute sweep can become paid with no stock held.
  - An error from that sweep makes every new card checkout return 500.

## Checkout e2e gates

`npm run test:e2e` runs two Chromium projects: `chromium` (desktop) and `mobile-chromium` (Pixel 7). WebKit is not installed. The suite must stay inside the `ci / e2e-checkout` job, which has to finish in under 6 minutes including install and build.

These tests never place a paid order and never create an unpaid order that holds stock. Airwallex (SDK and API), Supabase, and the checkout create/verify routes are stubbed in the browser. The Next server is started with the fake public env above and a closed Supabase port. Do not add real keys, repository secrets, or a live payment call. Do not weaken a gate with `test.skip`, `test.fixme`, or a fixed sleep. Wait on a locator or a `waitForResponse`.

The amount table is `tests/shared/checkout-expectations.ts`. `quoteCheckout` is the expected total (catalog subtotal + shipping + COD fee). Playwright re-exports it from `e2e/helpers/checkout-expectations.ts`. The browser stub prices the cart from `data/products.ts` plus that function, ignores the shipping amount and the line prices the browser posted, and asserts the fulfilled `amount` equals the UI total to the cent. Vitest calls the real Airwallex and COD route handlers (`tests/checkout/server-total-parity.test.ts`, in-memory database, Airwallex mocked) for the same two carts and asserts the persisted `total_amount` and the Airwallex `amount` equal `quoteCheckout` to the cent. A route that changes its own shipping or COD constant fails that Vitest case even if the browser stub is unchanged.

Cases on main today:

- Card, catalog subtotal under `FREE_SHIPPING_THRESHOLD_USD`. `computeShippingUsd` charges shipping.
- Card, catalog subtotal at or above that threshold. `computeShippingUsd` returns 0.
- Cash on delivery on the at-or-above cart, including the configured fee and no shipping charge.

`codFeeUsd` is the harness's only copy of the fee, and it must stay equal to the COD fee on main (the checkout page and the COD route). A non-zero fee must show as USD on the Cash on Delivery option and on the "Cash on Delivery fee" row. Zero must show as "Free" on the option and must omit that row. Do not hardcode the fee anywhere else in the e2e harness. Once PR #14 lands, delete that local copy and import `COD_FEE` from `lib/checkout-fees.ts`. The display rules above stay; they read whatever that import returns.

Shipping is not copied into the harness. `quoteCheckout` calls `computeShippingUsd` from `lib/shipping.ts`. A cart under the threshold must show a shipping charge. A cart at or above it must show no shipping charge. No shipping literal belongs in the specs.

`giftWrapUsd` stays null. No test asserts gift wrap. BE-013/WEB-013 set the price, then opt a case into `quoteCheckout` and teach `readCheckoutTotals` to read the new row.

`assertCurrentConfirmation` locks the success page that exists today: thank-you heading, Airwallex or COD sentence, order reference, confirmation-email line, Continue Shopping, View Orders. BE-012/WEB-012 extend that helper with the signed order (items, total, ship-to, short order number, what's next). Do not add those assertions until the page renders them.

`assertPayControlInView` runs on `mobile-chromium` for the current single-page checkout. The pay/submit control must be fully in the viewport and not scrolled past. WEB-011 keeps this project (do not add WebKit) and points the helper at the sticky mobile control when the stepped checkout lands. WEB-008 updates `fillCheckout` if the required fields change, and still runs parity. WEB-009 and WEB-010 must leave the parity, mobile, and confirmation gates green.

## CI

`.github/workflows/ci.yml` runs on pull requests and on pushes to `main`.

| Job | What it runs |
|---|---|
| `ci / verify` | `npm ci`, lint, `tsc --noEmit`, Vitest, `next build` with no secrets |
| `ci / e2e-checkout` | rebuild with the fake public env above, then Playwright on Desktop Chrome and Pixel 7 (Chromium only) |

The build in `verify` proves production compilation needs no secrets. The e2e job repeats the build because `NEXT_PUBLIC_*` values are baked into the browser bundle.

Environment names the build or server reads, when they are set at all: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AIRWALLEX_ENV`, `NEXT_PUBLIC_SITE_URL`. Webhook route tests set `AIRWALLEX_WEBHOOK_SECRET` themselves. CI does not use repository secrets.
