# Airwallex go-live check

Production Airwallex is still sandbox until this checklist is finished. Do these steps in order. The live webhook route is `POST /api/webhooks/airwallex`, from `jqj-store/app/api/webhooks/airwallex/route.ts`.

Use env var names only. Do not copy secret values into this doc, a ticket, or chat.

## (a) Webhook secret in Vercel Production

Owner/SECOPS confirm the live webhook secret is set in Vercel Production:

- `AIRWALLEX_WEBHOOK_SECRET`

These other names must also hold live values:

- `AIRWALLEX_ENV`
- `AIRWALLEX_CLIENT_ID`
- `AIRWALLEX_API_KEY`
- `AIRWALLEX_PRODUCTION_ENABLED`
- `CARD_PAYMENTS_ENABLED`
- `NEXT_PUBLIC_SITE_URL`

## (b) Register the live webhook URL

Owner registers this URL in the Airwallex dashboard:

`https://jqd.app/api/webhooks/airwallex`

## (c) Dashboard test event, then DATA confirms the row

Owner sends the dashboard's test event.

DATA then runs:

```sql
select
  id,
  provider,
  provider_event_id,
  event_name,
  status,
  received_at,
  (payload::text ilike '%client_secret%') as payload_has_client_secret
from payment_webhook_events
order by received_at desc
limit 20;
```

A row must exist. `event_name` must be the event type the dashboard sent, and `status` must be the status that event is expected to store. After BE-020, `payload_has_client_secret` must be false. Until BE-020 is in production, record the payload check as waiting on BE-020.

## (d) Tampered or unsigned POST

Send a POST to `https://jqd.app/api/webhooks/airwallex` with no signature, and a POST whose body does not match its signature. Each response must be 4xx. This route returns 400 when `x-signature` or `x-timestamp` is missing, and when the body does not match `x-signature`. That rejection happens before any insert.

DATA repeats the SELECT from (c). No new `payment_webhook_events` row.

## (e) Failed-match alert (BE-018)

Confirm the failed-match alert path (BE-018), or leave it pending until Resend is verified. Do not mark this step confirmed before that verification is recorded.

## (f) Live card test

Place a small live card payment and refund it only after the Owner's explicit yes. Do not charge or refund without that yes.

## (g) Rollback

Set `CARD_PAYMENTS_ENABLED=false` and redeploy.
