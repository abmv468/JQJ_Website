# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
npm run dev      # Start dev server on localhost:3000
npm run build    # Production build (also runs TypeScript + lint checks)
npm run start    # Serve production build
npm run lint     # ESLint only
```

No test framework is configured. Verify changes with `npm run build`.

For local Stripe webhook testing:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## Architecture

**Next.js 14 App Router** with two isolated route groups:

- **`app/(store)/`** — Customer-facing pages, wrapped in `CartProvider` + `StoreShell` (header/footer). Cart uses localStorage (`JQJ-cart` key) with hydration-safe loading (starts empty `[]`, loads in `useEffect`).
- **`app/admin/`** — Single-page admin dashboard. Completely isolated from store layout — no CartProvider, no store header/footer. This prevents hydration errors from localStorage reads. Uses direct `@supabase/supabase-js` client (not `@supabase/ssr`) to avoid cookie-related hangs.

### Supabase Clients (three separate ones)

| Client | File | Key Used | Use Case |
|--------|------|----------|----------|
| Browser | `lib/supabase/client.ts` | Anon key | Client components, auth |
| Server | `lib/supabase/server.ts` | Anon key + cookies | Server components, SSR |
| Admin | `lib/supabase/admin.ts` | Service role key | API routes only (bypasses RLS) |

All admin API routes (`/api/admin/*`) use the admin client with service role key. They must have `export const dynamic = 'force-dynamic'` and `Cache-Control: no-store` headers to prevent Next.js from caching responses.

### Payment Flow

**Stripe:** Checkout page → `POST /api/checkout` (creates Stripe session) → Stripe hosted page → redirect to `/order-confirmation?session_id=...` → `POST /api/checkout/verify` (creates order in Supabase + sends emails).

**COD:** Checkout page → `POST /api/checkout/cod` (creates order directly in Supabase + sends emails) → redirect to `/order-confirmation?order_id=...&method=cod`.

### Emails

`lib/email.ts` sends via Resend from `orders@danvapes.shop` (verified domain). Two emails per order: customer confirmation + admin notification. Both COD and Stripe routes call `sendOrderEmails()`.

## Branding & Styling

- **Primary:** `#184C52` | **Secondary:** `#18514A`
- **Fonts:** Montserrat (headings via `font-heading` class), Inter (body via `font-body`)
- **Border radius:** `rounded-brand` = 5px
- **Buttons:** `btn-primary` (teal fill), `btn-secondary` (white outlined)
- **Currency:** Always USD via `formatPrice()` from `lib/utils.ts`

## Database

Four tables: `categories`, `products`, `orders`, `order_items`. Schema and seed data in `data/seed.sql`. Products also have a static fallback in `data/products.ts` used for SSG on product pages.

RLS: public read on products/categories, user-scoped on orders/order_items. Admin routes bypass RLS via service role key.

## Key Gotchas

- Admin auth checks `NEXT_PUBLIC_ADMIN_EMAIL` env var against Supabase auth user email — not a role system.
- Product pages are statically generated at build time from `data/products.ts`. Database products are used by admin and checkout APIs.
- The `shipping_address` JSONB column in `orders` also stores `payment_method` ('stripe'|'cod') and `cod_fee`.
- Stripe webhook secret in `.env.local` is currently a URL placeholder, not a real `whsec_...` value — orders work via the verify route instead.
