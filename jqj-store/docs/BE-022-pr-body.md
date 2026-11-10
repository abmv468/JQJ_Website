# BE-022 — Availability is unknown when the database read fails

Pairs with WEB PR #38 (WEB-018), which removes static `stockCount` from `data/products.ts`.

## What changed

`GET` and `POST /api/products/availability` no longer build a catalog fallback when the Supabase inventory read throws. `buildFallbackProduct` is removed, and this route no longer reads `stockCount` from `data/products.ts`.

A failed read returns **503** with:

```json
{ "error": "Availability temporarily unavailable", "reference": "<short id>" }
```

`Cache-Control: no-store` is set on that response. The same `reference` is logged with the database error code only (no driver message, no PII). A successful read still returns the existing availability body. Checkout routes still enforce inventory with 409. No UI changes.

## Why

Unknown stock is neutral, not zero. The old fallback copied catalog `stockCount` and returned 200. After #38 removes that field, the fallback becomes stock 0, so product and cart clients treat the outage as out of stock and block add-to-cart (fail closed). A 503 leaves availability unknown.

must ship in the same release as #38 or before it

## How verified

From `jqj-store/`:

- `npm test` — Vitest. A database error on this route is 503 with the body above, no `stockCount` anywhere in the body, no driver text, and `Cache-Control: no-store`. Success keeps the existing shape, and the counts come from the database row. Restoring the catalog fallback makes that error test fail.
- `npm run typecheck`
- `npm run lint`

No environment or database changes.
