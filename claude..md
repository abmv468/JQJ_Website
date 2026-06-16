# 🏋️ GYM Kraft — E-Commerce Project Documentation

> Full-stack e-commerce website for commercial-grade Jewelry business. Built with Next.js 14, Supabase, Stripe, Resend, and Tailwind CSS.

---

## 1. Project Overview

| Field | Details |
|---|---|
| Store Name | **Jiqi** |
| Product Type | Physical (Crystal bracelets ) |
| Target Audience | Male, gifts buyers, Jewlery wearer |
| Tech Stack | Next.js 14, Supabase, Stripe, Resend, Tailwind CSS |
| Admin Email | aliameen.us@gmail.com |
| Currency | USD ($) |
| Fonts | Montserrat (headings), Inter (body) |
| Primary Color | #184C52 (Teal) |

---

## 2. Tech Stack

| Layer | Tool | Status |
|---|---|---|
| **Frontend** | Next.js 14 (App Router, TypeScript) | ⬜ Not developed yet |
| **Database & Auth** | Supabase (PostgreSQL + Auth) | ⬜ Not developed yet |
| **Payments** | Stripe (Test Mode) + Cash on Delivery | ⬜ Not developed yet |
| **Emails** | Resend (order notifications) | ⬜ Not developed yet |
| **Styling** | Tailwind CSS (custom brand theme) | ⬜ Not developed yet |
| **Hosting** | Vercel (deploy-ready) | ⬜ Not deployed yet |

---

## 3. Pages & Routes

### Customer-Facing Pages (inside `app/(store)/`)
- [x] **Home `/`** — Latest Collection, Top products, One of a kind, Shop by stone, recently viewed items, trust badges, reviews, Instagram, footer
- [x] **Shop `/shop`** — Product grid with category filters, sort options, search
- [x] **Product Detail `/products/[slug]`** — Gallery, product info, features, related products
- [x] **Cart `/cart`** — Item list, quantity controls, subtotal, checkout button
- [x] **Checkout `/checkout`** — Shipping form, **Stripe payment** OR **Cash on Delivery** ($20 fee), order summary
- [x] **Order Confirmation `/order-confirmation`** — Success page (handles both Stripe & COD)
- [x] **Auth `/auth/login`** — Combined Sign In / Create Account page with toggle tabs
- [x] **Account `/account`** — User profile + order history (requires login)

### Admin Dashboard (at `app/admin/`)
- [x] **Admin `/admin`** — Single-page WordPress-style dashboard with sidebar
  - **Dashboard Tab** — Stats, inventory summary, low stock alerts
  - **Products Tab** — Full CRUD (add/edit/delete), search, modal form
  - **Orders Tab** — View all orders, update status (dropdown), payment method shown
  - **Customers Tab** — Registered users list
  - **Settings Tab** — Email notifications, payment methods, shipping/COD config

### API Routes
- [x] **`/api/checkout`** — Creates Stripe Checkout Session
- [x] **`/api/checkout/cod`** — Cash on Delivery order (saves to Supabase + sends emails)
- [x] **`/api/webhooks/stripe`** — Stripe webhook (saves order + sends emails on payment)
- [x] **`/api/admin/products`** — GET/POST/PUT/DELETE products (uses service role key)
- [x] **`/api/admin/categories`** — GET all categories
- [x] **`/api/admin/orders`** — GET all orders, PUT to update status

---

## 4. Key Architecture Decisions

### Route Groups
- **`app/(store)/`** — All customer pages, wrapped with `CartProvider` + `StoreShell` (header/footer)
- **`app/admin/`** — Admin dashboard, completely isolated (NO cart context, NO store header/footer)
- This prevents hydration errors from `CartProvider` localStorage reads affecting admin

### Admin Protection
- Super admin email set via `NEXT_PUBLIC_ADMIN_EMAIL` in `.env.local`
- Admin page checks logged-in Supabase user email against this value
- Non-admin users see "Access denied" error
- Uses `@supabase/supabase-js` directly (not `@supabase/ssr`) to avoid cookie-related hangs

### Cart Persistence
- Cart stored in `localStorage` under key `JQJ-cart`
- CartContext starts with empty `[]` to match server render (no hydration mismatch)
- Loads saved cart in `useEffect` after mount
- Cart badge always rendered with `opacity-0/100` toggle (not conditional)

### Payment Methods
1. **Stripe** — Redirects to Stripe Checkout, webhook processes payment
2. **Cash on Delivery** — $20 extra fee, order saved directly to Supabase, no Stripe redirect

### Email Notifications (Resend)
- On every order (Stripe or COD):
  - Customer receives order confirmation email
  - Admin receives new order notification email
- Branded HTML email templates with order details, items, shipping address
- Uses `onboarding@resend.dev` sender (switch to verified domain in production)

---

## 5. Database Schema (Supabase)

### `categories`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| name | TEXT | e.g., "Hexagon Stones" |
| slug | TEXT (UNIQUE) | e.g., "Red Leopard Skin Jasper Bracelet III (6mm)" |
| created_at | TIMESTAMPTZ | Default NOW() |

### `products`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| name | TEXT | Product name |
| slug | TEXT (UNIQUE) | URL-friendly name |
| description | TEXT | Product description |
| price | DECIMAL(10,2) | Current price |
| compare_at_price | DECIMAL(10,2) | Strikethrough price (nullable) |
| category_id | UUID (FK → categories) | Category reference |
| images | TEXT[] | Array of image URLs |
| in_stock | BOOLEAN | Default true |
| stock_count | INTEGER | Default 0 |
| rating | DECIMAL(2,1) | Star rating |
| review_count | INTEGER | Number of reviews |
| features | TEXT[] | Feature bullet points |
| specs | JSONB | Specifications key-value pairs |
| created_at | TIMESTAMPTZ | Default NOW() |

### `orders`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| user_id | UUID (FK → auth.users) | Nullable (guest checkout) |
| status | TEXT | pending/processing/shipped/delivered/cancelled |
| total_amount | DECIMAL(10,2) | Total including shipping + COD fee |
| shipping_amount | DECIMAL(10,2) | Shipping cost |
| shipping_address | JSONB | Full address + payment_method + cod_fee |
| stripe_session_id | TEXT | Stripe session ID or "COD-{timestamp}" |
| created_at | TIMESTAMPTZ | Default NOW() |
| updated_at | TIMESTAMPTZ | Default NOW() |

### `order_items`
| Column | Type | Notes |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| order_id | UUID (FK → orders) | ON DELETE CASCADE |
| product_id | UUID (FK → products) | Product reference |
| quantity | INTEGER | Item quantity |
| price_at_purchase | DECIMAL(10,2) | Price snapshot at time of order |
| created_at | TIMESTAMPTZ | Default NOW() |

### RLS Policies
- **categories/products**: Public read access for everyone
- **orders**: Users can view/insert their own orders only
- **order_items**: Users can view items from their own orders only
- Admin API routes use **service role key** (bypasses RLS)

---

## 6. File Structure

```
JIQI-Group/
├── app/
│   ├── layout.tsx                    # Root layout (fonts only, no CartProvider)
│   ├── (store)/
│   │   ├── layout.tsx                # Store layout (CartProvider + StoreShell)
│   │   ├── page.tsx                  # Home page
│   │   ├── shop/page.tsx             # All products
│   │   ├── products/[slug]/page.tsx  # Product detail
│   │   ├── cart/page.tsx             # Cart
│   │   ├── checkout/page.tsx         # Checkout (Stripe + COD)
│   │   ├── order-confirmation/       # Order success
│   │   ├── auth/login/page.tsx       # Login/Signup combined
│   │   └── account/page.tsx          # My account
│   ├── admin/
│   │   ├── layout.tsx                # Admin layout (minimal)
│   │   └── page.tsx                  # Full admin dashboard (single page)
│   └── api/
│       ├── checkout/route.ts         # Stripe checkout session
│       ├── checkout/cod/route.ts     # COD order creation
│       ├── webhooks/stripe/route.ts  # Stripe webhook + emails
│       └── admin/
│           ├── products/route.ts     # Products CRUD
│           ├── categories/route.ts   # Categories list
│           └── orders/route.ts       # Orders list + status update
├── components/
│   ├── layout/                       # Header, Footer, AnnouncementBar, StoreShell
│   ├── home/                         # Latest Collection, Top products, One of a kind, Shop by stone, recently viewed items, etc.
│   ├── product/                      # Gallery, ProductInfo, RelatedProducts
│   └── ui/                           # Reusable components
├── context/
│   └── CartContext.tsx                # Cart state + localStorage
├── lib/
│   ├── supabase/client.ts            # Browser Supabase client
│   ├── supabase/server.ts            # Server Supabase client
│   ├── supabase/admin.ts             # Service role client (bypasses RLS)
│   ├── email.ts                      # Resend email templates + sending
│   ├── stripe.ts                     # Stripe config
│   └── utils.ts                      # formatPrice, cn helper
├── data/
│   ├── products.ts                   # Static product data (storefront fallback)
│   └── seed.sql                      # Database schema + seed data
├── public/products/                  # Product images
└── .env.local                        # Environment variables (NOT committed)
```

---

## 7. Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...  # From Stripe CLI or Dashboard

# Resend
RESEND_API_KEY=re_...

# App
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_EMAIL=aliameen.us@gmail.com
```

> ⚠️ Never commit `.env.local` to GitHub. It's already in `.gitignore`.

---

## 8. Products (Seeded Data)

| # | Name | Price | Category |
|---|------|-------|----------|
| 1 | Red Leopard Skin Jasper Bracelet III (6mm) | $599.99 | Bracelets |
| 2 | Raw Brown Tourmaline Bracelet I (8-10mm) | $368.99 | Bracelets |
| 3 | Sodalite Bracelet V (8mm) | $549.99 | Bracelets |
| 4 | Amethyst Bracelet XV (5mm) | $330.99 | Bracelets |
| 5 | Silver Bracelet IV (4mm) | $449.99 | Bracelets |
| 6 | Blue Lace Agate Silver Pendant | $89.99 | Necklace |
| 7 | Labradorite Silver Pendant | $279.99 | Necklace |
| 8 | Black Onyx Necklace V (4mm) | $371.99 | Necklace |
| 9 | Silver Necklace V (7mm) | $249.99 | Necklace |

---

## 9. Testing

### Stripe Test Card
- Card: `4242 4242 4242 4242`
- Expiry: Any future date (e.g., `12/34`)
- CVC: Any 3 digits (e.g., `123`)

### Stripe Webhook (Local)
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

### Admin Access
1. Go to `/admin`
2. Login with admin email + Supabase password
3. Only the email set in `NEXT_PUBLIC_ADMIN_EMAIL` can access

---

## 10. Deployment Checklist

- [ ] Push code to GitHub
- [ ] Deploy to Vercel
- [ ] Add all env variables to Vercel dashboard
- [ ] Update `NEXT_PUBLIC_SITE_URL` to production URL
- [ ] Set up Stripe webhook endpoint for production URL
- [ ] Get `STRIPE_WEBHOOK_SECRET` from Stripe dashboard (production)
- [ ] Verify Resend domain for custom sender email
- [ ] Switch Stripe from Test Mode to Live Mode
- [ ] Run seed.sql in production Supabase

---

*Built by JQJ Group — JIQI E-Commerce*
