# Airwallex go-live check

Production Airwallex is still sandbox until this checklist is finished. Card checkout creation can be stopped without a deploy by setting `CARD_PAYMENTS_ENABLED` to `false`. Any other value, including leaving it unset, leaves card checkout enabled. Webhook delivery and `POST /api/checkout/airwallex/verify` stay on, so a return for an order that already exists can still complete.

The live webhook route is `POST /api/webhooks/airwallex`, from `jqj-store/app/api/webhooks/airwallex/route.ts`.

## 1. Owner registers the live webhook

In the Airwallex dashboard, register this URL:

`https://jqd.app/api/webhooks/airwallex`

Subscribe the payment and refund events the route already handles (`payment_intent.*` and `refund.*`). The route checks the `x-signature` and `x-timestamp` headers against the raw body.

## 2. Owner sends the dashboard test event

Use the dashboard control that sends a test event to that endpoint. This check is the first live delivery: `payment_webhook_events` has had no rows.

## 3. DATA confirms a row

DATA runs this read in the store database:

```sql
select provider, provider_event_id, event_name, status, received_at
from payment_webhook_events
order by received_at desc
limit 20;
```

A row must exist. `event_name` must be the event type the dashboard sent.

## 4. Live card charge

Place a small live card payment, then refund it, only after the Owner's explicit yes. Do not charge or refund a live card without that yes.

## Environment variable names that must be live values

Names only:

- `AIRWALLEX_ENV`
- `AIRWALLEX_CLIENT_ID`
- `AIRWALLEX_API_KEY`
- `AIRWALLEX_WEBHOOK_SECRET`
- `AIRWALLEX_PRODUCTION_ENABLED`
- `CARD_PAYMENTS_ENABLED`
- `NEXT_PUBLIC_SITE_URL`
