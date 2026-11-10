# JQD Group — E-Commerce Storefront

Dark luxury jewelry storefront for **JQD Group**, built with Next.js 14 (App Router), Tailwind CSS, Supabase, Airwallex and Resend.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in your keys
npm run dev                        # http://localhost:3000
```

> This project uses a **portable Node.js** if a system install isn't available.
> Node + npm live at `%LOCALAPPDATA%\node-portable\node-v20.18.0-win-x64`.
> Add that folder to your PATH, or run commands with the full path.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server on http://localhost:3000 |
| `npm run build` | Production build (TypeScript + lint checks) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest checkout, inventory, and schema contract tests |
| `npm run test:e2e` | Playwright checkout smoke (build with fake env first; see `docs/TESTING.md`) |
| `npm run db:seed:generate` | Regenerate `supabase/seed.sql` from `data/products.ts` |

## Pages

- `/` — Home (hero, latest collections, top products, shop by stone, story)
- `/new` — New arrivals listing
- `/bracelets` — Bracelets (supports `?tag=limited` and `?stone=`)
- `/necklaces` — Necklaces
- `/products/[slug]` — Product detail (statically generated)
- `/cart` — Cart
- `/checkout` — Checkout (Airwallex Hosted Payment Page **or** Cash on Delivery)
- `/order-confirmation` — Handles Airwallex verify + COD
- `/auth/login` — Sign in / create account
- `/account` — Profile + order history
- `/admin` — Admin dashboard (gated by `ADMIN_EMAIL`)

## Backend setup

1. Create a Supabase project. In the SQL editor, run every file in `supabase/migrations/` in filename order, then `supabase/seed.sql`.
2. Add Supabase URL + anon key + service role key to `.env.local`.
3. Add Airwallex sandbox keys and webhook secret (`AIRWALLEX_*` variables in `.env.local.example`).
4. Configure Airwallex webhook URL to `/api/webhooks/airwallex`.
5. (Optional legacy) Add Stripe test keys if you still use Stripe routes.
6. Add a Resend API key and set `EMAIL_FROM` to the verified sender. A blank value logs the missing variable and skips the send without blocking the order.

The storefront runs with **static product data** (`data/products.ts`) even
without backend keys. Checkout, orders, auth and admin require the keys above.

## Database

- `supabase/migrations/` is the source of truth for the schema. Every migration is idempotent, so re-running one is safe.
- `supabase/seed.sql` holds the catalog and is generated from `data/products.ts`. After changing the catalog, run `npm run db:seed:generate` and apply the new seed, so checkout prices and stock match the product pages. Re-running the seed updates product details but never resets stock.
- This Supabase project is for the store only. Don't give other systems write access to it.

## Inventory model

- `products` now supports base `sku`, `stock_count`, `low_stock_threshold`, and `in_stock`.
- `product_variants` stores sellable combinations (size/material) with per-variant SKU and stock.
- Checkout (Airwallex + COD) validates inventory before order creation and reserves stock during order persistence.
- Storefront and admin show low-stock/out-of-stock states and block purchases when unavailable.

## Order lifecycle & refunds

- Order status pipeline: `paid -> packed -> shipped -> delivered` (+ terminal `refunded`).
- Admin status updates are validated to prevent backward/invalid transitions.
- Partial refunds are supported via `orders.refunded_amount` and `order_refunds` history.
- Multiple partial refunds are allowed; orders auto-transition to `refunded` only when fully refunded.

## Branding

- Background `#010101`, gold accents `#BB9D7B` / `#E1C19D`
- Headings: Instrument Sans · Body: Manrope
- Logo: `public/JQD-logo.png`
- Currency: USD via `formatPrice()` in `lib/utils.ts`
