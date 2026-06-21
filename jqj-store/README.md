# JQJ Group — E-Commerce Storefront

Dark luxury jewelry storefront for **JQJ Group**, built with Next.js 14 (App Router), Tailwind CSS, Supabase, Stripe and Resend.

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

## Pages

- `/` — Home (hero, latest collections, top products, shop by stone, story)
- `/new` — New arrivals listing
- `/bracelets` — Bracelets (supports `?tag=limited` and `?stone=`)
- `/necklaces` — Necklaces
- `/products/[slug]` — Product detail (statically generated)
- `/cart` — Cart
- `/checkout` — Checkout (Stripe **or** Cash on Delivery)
- `/order-confirmation` — Handles Stripe verify + COD
- `/auth/login` — Sign in / create account
- `/account` — Profile + order history
- `/admin` — Admin dashboard (gated by `NEXT_PUBLIC_ADMIN_EMAIL`)

## Backend setup

1. Create a Supabase project and run `data/seed.sql` in the SQL editor.
2. Add Supabase URL + anon key + service role key to `.env.local`.
3. Add Stripe test keys; for local webhooks:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
4. Add a Resend API key and a verified `EMAIL_FROM` address.

The storefront runs with **static product data** (`data/products.ts`) even
without backend keys. Checkout, orders, auth and admin require the keys above.

## Inventory model

- `products` now supports base `sku`, `stock_count`, `low_stock_threshold`, and `in_stock`.
- `product_variants` stores sellable combinations (size/material) with per-variant SKU and stock.
- Checkout (Stripe + COD) validates inventory before order creation and reserves stock during order persistence.
- Storefront and admin show low-stock/out-of-stock states and block purchases when unavailable.

## Branding

- Background `#010101`, gold accents `#BB9D7B` / `#E1C19D`
- Headings: Instrument Sans · Body: Manrope
- Logo: `public/JQJ-logo.png`
- Currency: USD via `formatPrice()` in `lib/utils.ts`
