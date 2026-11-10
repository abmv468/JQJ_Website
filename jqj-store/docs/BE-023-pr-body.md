## What changed

`EXPRESS_SHIPPING_ENABLED` is off unless the value is exactly `true`. Unset, `TRUE`, `false`, `1`, `yes`, blank, and surrounding whitespace are all off. The read lives in `lib/express-shipping.ts`.

`POST /api/checkout/airwallex` and `POST /api/checkout/cod` reject a non-standard `shippingMethod` with `400` and `{ "error": "That shipping option is unavailable." }` before `createAdminClient`, any order insert, the stock reservation RPC, or an Airwallex payment-intent call. Omitted, blank, and `standard` (any case, trimmed) stay on the current quote: $15.00 under $250.00 USD merchandise, and $0.00 at $250.00 and above. Cash on delivery still adds its existing fee.

There is no checkout config endpoint on this branch. `GET /api/checkout/shipping` returns `{ expressShippingEnabled }` with `Cache-Control: no-store`, the same shape as BE-019's `cardEnabled` read. The checkout page fetches it, hides the expedited choice unless the flag is exactly on, and defaults to standard. The trust line now says "Standard shipping".

The Stripe shipping line item is `Shipping`. The Airwallex intent payload has no shipping line-item name or descriptor, so there was no Airwallex string to rename. The product accordion no longer says "Complimentary UPS shipping".

With the flag exactly `true`, an expedited method is accepted and still uses that same quote. This branch has no second rate.

## Why

No carrier is confirmed. A paid expedited option was offered and charged under a carrier name the Owner has not named. The carrier rule is to hide that option until the Owner names a carrier. Customer-facing copy and server messages do not contain `UPS` or `Express`. The env var and identifier names may.

## How verified

From `jqj-store/`, against the in-memory checkout stand-in. No live env, database, or dashboard was touched. Nothing was pushed or deployed.

- Flag off, card and COD: $249.99 ships at $15.00, $250.00 and $300.00 ship free. COD still adds the $20.00 fee.
- A forged `shippingMethod` of `expedited`, `express`, `ups`, `UPS Express`, `priority`, `overnight`, or a non-string returns 400 on both routes. Spies on `Query.insert`, `reserveStockForOrder`, and `createAirwallexPaymentIntent` are not called. `db.rpcCalls` is empty and no order row is written. `createAdminClient` is not called. Unset and every value other than `true` behave this way.
- Commenting out the two `return rejectedShipping` lines makes those tests return 200. The lines were restored after that check.
- Flag exactly `true`: an expedited method still inserts, reserves, and (for card) creates an intent at the same $15.00 / free amounts.
- Static checkout markup shows "Standard shipping" and does not show the expedited choice or the words `UPS` or `Express`.
- Playwright was not added. The existing checkout e2e does not cover a shipping selector.
- `npm test` — 16 files, 115 tests passed.
- `npm run typecheck` — clean.
- `npm run lint` — no warnings or errors.
- `npm run build` — succeeded. The build still prints the existing Edge Runtime warning for `process.version` inside `@supabase/supabase-js`, pulled in by middleware. This change does not touch that import.

## Residual grep hits

Searched `jqj-store` with `rg`, excluding `node_modules` and test fixtures. Email template `lib/email.ts` has no hit.

Case-sensitive `UPS` or `Express` in server code (`app/api`, `lib`):

- `lib/express-shipping.ts:4` — `isExpressShippingEnabled`
- `lib/express-shipping.ts:23` — `isExpressShippingEnabled()`
- `app/api/checkout/shipping/route.ts:2` — import of `isExpressShippingEnabled` from `@/lib/express-shipping`
- `app/api/checkout/shipping/route.ts:8` — `isExpressShippingEnabled()`

Those are the helper name, the module path, and the response field `expressShippingEnabled`. No server message contains `UPS` or `Express`.

Case-insensitive substring `ups` or `express` in the same server files also matches `EXPRESS_SHIPPING_ENABLED`, the `@/lib/express-shipping` imports in the card and COD routes, and existing `upsert` / `upsertAirwallexPaymentIntent` identifiers in `lib/payments/airwallex-orders.ts`, `app/api/checkout/airwallex/route.ts`, `app/api/checkout/airwallex/verify/route.ts`, `app/api/webhooks/airwallex/route.ts`, `app/api/admin/orders/route.ts`, and `app/api/newsletter/route.ts`. Those are not carrier copy.

The checkout page uses the same `expressShippingEnabled` identifier. It does not render `UPS` or `Express`. Test fixtures send `express`, `ups`, and `UPS Express` as forged method names and are excluded here.

`app/(store)/shipping/page.tsx` still says "Domestic expedited shipping" as a timeline. That sentence does not contain `UPS` or `Express`. Catalog copy "expressive" in `data/products.ts` and `supabase/seed.sql` is the adjective, not a carrier.

## Checkout change: needs CTO review + the Owner's own words before merge.
