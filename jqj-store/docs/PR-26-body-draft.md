Draft server-side checkout fixes for jqd.app. No schema, migration, RLS, package, or lockfile changes. The Stripe package and env var names stay. Nothing here places a real order, charge, or email.

`POSTCODE_REQUIRED_ENFORCED` is a code constant in `lib/checkout-customer.ts` (`{ enabled: false }`). It is not an environment variable.

## Q-08 — fail closed when the site URL is missing

**What changed.** `lib/checkout-site-url.ts` is the only helper that builds a checkout return origin. Airwallex uses it for the return URL. In production, a missing, unparseable, or localhost `NEXT_PUBLIC_SITE_URL` returns 500 with a reference code and does not build a localhost URL. Outside production, a missing value still falls back to `http://localhost:3000`.

**Why.** Checkout used to fall back to localhost whenever the variable was unset, including in production.

**Verified.** Unit tests cover production missing/invalid/localhost and the dev fallback. The Airwallex route test returns 500 with no localhost in the body, creates no order, and does not call Airwallex. Dev calls Airwallex with a localhost return URL.

## Q-16 — retire Stripe

**What changed.** `POST /api/checkout`, `POST /api/checkout/verify`, and `POST /api/webhooks/stripe` return `410` with `{ "error": "This payment method is no longer available." }`. They do not call the Stripe SDK or write to the database. The old shipping line item on the Stripe checkout route went with that route. `lib/stripe.ts` stays in the repo. Removing that unused module is a follow-up PR.

**Why.** Stripe is no longer used in the checkout UI.

**Verified.** Each route test returns 410, does not call `getStripe`, and leaves orders and payments empty. The source-text grep of those route files was removed. The behavior test is the `it.each` that hits the three handlers.

**Order confirmation.** A `session_id` URL no longer calls `/api/checkout/verify`. Airwallex still uses `/api/checkout/airwallex/verify`. COD still uses `order_id` and does not call a verify route. Those live flows are unchanged.

A legacy `session_id` page shows a static message and does not show the payment-failed state. Playwright covers `/order-confirmation?session_id=cs_test_x`: no request to `/api/checkout/verify`, and the placeholder sentence is visible. The heading and the sentence are marked awaiting BRAND. Continue Shopping links to `/new`.

## Q-02 — validate the address before payment

**What changed.** `lib/checkout-customer.ts` checks name, email, address line 1, city, and country before any database write or payment intent. Phone stays optional because the form marks it optional. `postalCode` is optional for now: a missing or blank value is accepted, and a present non-empty value is format-checked. US ZIP accepts 5 digits, ZIP+4, or 9 digits. UK, Canada, and Australia use their usual patterns. Hong Kong has no country-specific postcode format. Other countries use a short alphanumeric fallback. After trim, every country, including Hong Kong and unknown ones, must match `/^[A-Za-z0-9 -]{0,12}$/`. Anything else is `400` with `fields.postalCode`.

A postcode that is present and not a string, such as a number, array, or object, is also `400` with `fields.postalCode`. `null` and `undefined` are stored as `""`. COD and Airwallex both use this check.

The eight checkout countries and their required/optional flags match PR #24. Hong Kong is optional. The other seven are required. A country that is not listed is optional. Enforcement is off until `POSTCODE_REQUIRED_ENFORCED.enabled` is set to `true` in code. That constant is not an environment variable.

COD and Airwallex store `shipping_address.postal_code` as the trimmed value from `validateCheckoutCustomer`, or `""` when it is absent. `shipping_address` is jsonb, so this is not a schema change.

Airwallex payment-intent creation does not send a shipping or billing address object, so the postcode is not added to the intent. It is stored on the order and included in the order email only.

**Why.** COD did not check the address before inserting an order, and Airwallex only checked a few fields. Requiring a postcode now would reject every US, UK, Canada, and Australia order, because the live form does not send `postalCode`. The stored address was also dropping the postcode.

postalCode becomes required once WEB's form sends it (follow-up).

**Verified.** Missing name, email, address, or city returns 400 with no order row and no Airwallex intent. A US address with no postal code is accepted. A present malformed US postal code returns a `postalCode` field error. Hong Kong with `""` is stored as `""`. A country outside the map with `""` is accepted. With the code switch forced on, a US order with `""` returns a field error and Hong Kong with `""` still succeeds. COD and Airwallex orders with `SW1A 1AA` store `shipping_address.postal_code === "SW1A 1AA"`. `<b>` and `a,b` return 400 before any insert. A numeric `78701`, an array, and an object return 400 on both COD and Airwallex. `null` is stored as `""`.

The customer and admin email HTML, both built by `renderOrderEmailHtml`, include a US or UK postcode when it is non-empty and omit the line when it is empty.

## Q-14 — plain errors with a reference code

**What changed.** `lib/checkout-error.ts` turns a thrown checkout error into `{ "error": "Something went wrong. Please try again.", "reference": "<8 hex chars>" }`. COD and Airwallex log the full error with that code. Provider text and stack traces stay on the server.

**Why.** The routes were returning `error.message`, including Airwallex's own text.

**Verified.** A thrown Airwallex failure returns the plain message and a reference code, logs the provider text with that code, and does not put that text in the JSON. Stock is still restored.

## Q-SHIP — server shipping quote

**What changed.** `POST /api/checkout/quote` reads catalog prices with `validateCheckoutItems`, the same helper COD and Airwallex use, and returns `{ subtotalUsd, shippingUsd, totalUsd, lines }`. `lines` is one entry per accepted item: `productId`, `quantity`, `unitPriceUsd`, `lineTotalUsd`, and `variantId` when the item has a variant. `subtotalUsd` is the sum of `lineTotalUsd`. The quote does not write or reserve stock. A separate stock check beyond that shared validator is out of scope. Shipping is free at a USD merchandise subtotal of $250.00 or more, otherwise $15.00. `shippingCountry` is accepted and not used yet, because shipping is still the flat USD rule. `discountCode` is accepted and ignored.

More than 50 lines, or a quantity outside 1–99, returns 400 before any database call. Quantity must be a number, so the string `"5"` and the array `[5]` are rejected. The error is a top-level `error` string, not `fields.quantity`. Unparseable JSON returns 400 `{ "error": "Invalid request" }`.

**Why.** A stale cart near $250 could show free shipping and then be charged $15.

**Verified.** The quote uses the database price when the client sends a different price. `$249.99` ships at $15 and `$250.00` ships free. An id-only item is rejected with the same status and error as COD. 51 lines, quantity 100, `"5"`, `[5]`, and bad JSON return 400 with no database call.

**For WEB.** The checkout page sends `shippingCountry: form.country` and refetches when `form.country` changes. It does not render `lines`. WEB-011 can use them. The page change is fetch and display wiring only.

## Copy

Copy from BRAND, 16:46 HKT. BRAND reports support@jqdgroup.com as Owner-confirmed (14:34 HKT, via CPO). The Owner should confirm it at merge.

The unavailable order link uses heading `This order link has expired` and body `This order link is no longer active. Your order details are in your confirmation email — or contact us at support@jqdgroup.com and we'll be glad to help.` The address comes from `SUPPORT_EMAIL` in `lib/support.ts` and is a `mailto:` link. Continue Shopping still goes to `/new`.

## COD fee

This PR does not add a new hardcoded COD fee. `const COD_FEE = 20` at `jqj-store/app/api/checkout/cod/route.ts:21` and `jqj-store/app/(store)/checkout/page.tsx:13` is the definition already on main. It is already in the rebase checklist below: import `COD_FEE` from `lib/checkout-fees.ts` after #14. The quote does not charge that fee.

## Rebase checklist

Do not rebase onto #14, #15, #16, #18, #20, or #24 until those PRs land.

Merge order: #16 / #15 / #14, then #26, then #24, then #27.

After they land:

- Keep the 410 handlers when resolving against #16. Do not restore Stripe checkout.
- Import `computeShippingUsd` from `lib/shipping.ts` and delete `lib/checkout-shipping.ts`.
- Import `COD_FEE` from `lib/checkout-fees.ts` after #14. That replaces `const COD_FEE = 20` at `jqj-store/app/api/checkout/cod/route.ts:21` and `jqj-store/app/(store)/checkout/page.tsx:13`.

## Follow-ups

whichever of #26/#28 merges second wraps addr.postal_code in escapeHtml in lib/email.ts buildHtml

## Merge notes

QA found that #26's email regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` accepts `a@x.com,evil.com` and `a@x.com;evil.com`. PR #33 adds `lib/email-address.ts` `isValidSingleEmail` as the single source of truth. Whichever of #26 or #33 lands second must make `validateCheckoutCustomer` call `isValidSingleEmail` and delete this regex. #26 does not touch the newsletter route, so that route is not part of this swap. Expect conflicts in both checkout routes. If #33 is already on main at the next rebase, do that swap in code with tests for the comma and semicolon cases. Do not merge #33 from this branch.

## How it was verified

From `jqj-store/`:

- `npx tsc --noEmit` — clean
- `npx vitest run` — see the local run report
- `npx next lint --max-warnings 0` — clean
