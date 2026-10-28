# Airwallex Integration (Sandbox)

## Overview

This repository now supports Airwallex Hosted Payment Page (HPP) checkout using PaymentIntents, while keeping COD support intact and leaving production processing disabled by default.

Core principles implemented:

- Server-side amount validation and inventory checks
- Server-side PaymentIntent creation
- Airwallex webhook-driven payment confirmation
- Idempotent event handling with replay protection
- Inventory reservation before payment and controlled release on failed/abandoned flows
- Admin visibility + manual payment refresh + refund initiation

## Architecture

### Checkout flow (Airwallex)

1. Customer submits checkout form on `/checkout`.
2. `POST /api/checkout/airwallex` validates cart and stock against Supabase.
3. Backend creates a pending order and reserves inventory.
4. Backend creates Airwallex PaymentIntent (`/api/v1/pa/payment_intents/create`).
5. Frontend initializes Airwallex.js and redirects with `payments.redirectToCheckout(...)`.
6. Customer returns to `/order-confirmation?provider=airwallex&order_id=...`.
7. Frontend calls `POST /api/checkout/airwallex/verify`.
8. Backend retrieves PaymentIntent status and syncs order/payment state.
9. Final source of truth remains webhook events at `/api/webhooks/airwallex`.

### Webhook flow

`/api/webhooks/airwallex`:

- Verifies `x-signature` and `x-timestamp` against raw body
- Enforces timestamp skew window (default 300s)
- Stores event IDs in `payment_webhook_events` (unique)
- Handles duplicate and out-of-order deliveries safely
- Updates `payments`, `orders`, and refund tracking tables

### Backend service modules

- `lib/payments/airwallex.ts`
  - Auth token retrieval/caching
  - Retry/backoff API client
  - PaymentIntent/refund create + retrieve
  - Status normalization
  - Webhook signature verification
- `lib/payments/airwallex-orders.ts`
  - Payment/order status transitions
  - Expired reservation release
  - Refund event persistence/settlement updates
  - Order email send-once behavior for successful Airwallex payment

## Database changes

Migration:

- `supabase/migrations/20261023190000_airwallex_payments.sql`

Adds/extends:

- `orders` columns:
  - `payment_provider`
  - `payment_status`
  - `fulfillment_status`
  - `payment_reference`
  - `sales_channel`
  - `currency`
  - `subtotal_amount`
  - `discount_amount`
  - `tax_amount`
  - `paid_at`
  - `confirmation_email_sent_at`
- New table `payments`
- New table `payment_refunds`
- New table `payment_webhook_events`
- Indexes for payment/refund/webhook lookups
- RLS policies for customer read-only access to own payment/refund records

## Modified / created files

### Created

- `app/api/checkout/airwallex/route.ts`
- `app/api/checkout/airwallex/verify/route.ts`
- `app/api/webhooks/airwallex/route.ts`
- `lib/payments/airwallex.ts`
- `lib/payments/airwallex-orders.ts`
- `supabase/migrations/20261023190000_airwallex_payments.sql`
- `docs/airwallex-integration.md`

### Updated

- `.env.local.example`
- `README.md`
- `app/(store)/checkout/page.tsx`
- `app/(store)/order-confirmation/page.tsx`
- `app/(store)/account/page.tsx`
- `app/admin/page.tsx`
- `app/api/admin/orders/route.ts`
- `app/api/checkout/cod/route.ts`
- `app/api/checkout/verify/route.ts`
- `lib/email.ts`

## Required environment variables

```env
AIRWALLEX_ENV=sandbox
AIRWALLEX_CLIENT_ID=
AIRWALLEX_API_KEY=
AIRWALLEX_WEBHOOK_SECRET=
AIRWALLEX_PRODUCTION_ENABLED=false
```

Existing variables still required:

- Supabase URL/keys
- Resend API key + sender
- Site URL
- Admin email

## Airwallex sandbox configuration

1. Create sandbox API key + client ID in Airwallex dashboard.
2. Configure webhook subscription for:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.pending`
   - `payment_intent.pending_review`
   - `payment_intent.cancelled`
   - `refund.received`
   - `refund.accepted`
   - `refund.settled`
   - `refund.failed`
3. Set webhook URL:
   - Local tunnel: `https://<your-tunnel>/api/webhooks/airwallex`
   - Hosted: `https://<your-domain>/api/webhooks/airwallex`
4. Copy webhook secret into `AIRWALLEX_WEBHOOK_SECRET`.

## Local development

1. Install deps:
   - `npm install`
2. Set env values in `.env.local`.
3. Apply SQL migration in Supabase SQL editor.
4. Start app:
   - `npm run dev`
5. Run checkout with Airwallex sandbox cards and monitor webhook updates.

## Testing procedure (sandbox)

Run these scenarios:

1. Successful card payment
2. Declined payment
3. 3DS challenge flow
4. Customer abandons checkout
5. Customer returns before webhook delivery
6. Duplicate webhook delivery
7. Out-of-order webhook events
8. Retry checkout initiation with same idempotency key
9. Invalid API credentials
10. API timeout/retry path
11. Tampered frontend amount/cart payload
12. Out-of-stock race during checkout
13. Refund accepted/settled
14. Refund failed
15. Unauthorized admin refund attempt
16. Invalid webhook signature
17. Single inventory deduction and single fulfillment release behavior

## Vercel deployment requirements

- Add all `AIRWALLEX_*` vars in Vercel project settings.
- Keep `AIRWALLEX_ENV=sandbox` and `AIRWALLEX_PRODUCTION_ENABLED=false` until explicit approval.
- Ensure webhook endpoint is publicly reachable and uses HTTPS.

## Production activation checklist

1. Obtain production Airwallex credentials.
2. Configure production webhook endpoint + secret.
3. Confirm payment methods are enabled on Airwallex account.
4. Validate full sandbox regression and production dry-run checks.
5. Set:
   - `AIRWALLEX_ENV=production`
   - `AIRWALLEX_PRODUCTION_ENABLED=true`
6. Monitor first live transactions and webhook processing.

## Known limitations / prerequisites

- Frontend checkout currently enforces USD for Airwallex Phase 1 card payments.
- Stripe routes remain in codebase for backward compatibility but are no longer primary checkout path.
- Automated tests are not configured in this repository; validation currently relies on lint/build + manual sandbox flows.
