# BE-021: Bound the Airwallex webhook replay window

## What changed

`POST /api/webhooks/airwallex` no longer turns `AIRWALLEX_WEBHOOK_MAX_SKEW_SECONDS` into a number with `Number(env || 300)`. `resolveAirwallexWebhookMaxSkewSeconds` parses that string once:

- a finite integer is clamped to 1–600 seconds
- any other value, including an unset variable, uses 300 seconds

The signature check itself is unchanged. A timestamp exactly 300 seconds away is still accepted.

## Why

SECOPS MEDIUM: replay window disabled by a bad env value.

A non-numeric setting becomes `NaN`, and `Math.abs(diff) > NaN` is never true, so a signed replay of any age is accepted. `Infinity` or a huge number leaves the same hole. A negative number rejects every delivery, including ones that are current.

## How verified

From `jqj-store`:

- `npm test` (Vitest, 69 passed). Unset yields 300. `120` yields 120. `abc`, `300s`, `NaN`, an empty string, and `Infinity` yield 300. `0` and `-5` clamp to 1. `100000` clamps to 600. A timestamp exactly 300 seconds old is still accepted. With the setting `abc`, a signed webhook whose timestamp is 301 seconds old returns 400 and does not insert a `payment_webhook_events` row. That route case returned 200 before this fix, so reverting the guard makes the test fail.
- `npx tsc --noEmit` passed.
- `npm run lint` passed with no warnings.

No environment files, database, or dashboard were changed.

## Recommendation

Leave `AIRWALLEX_WEBHOOK_MAX_SKEW_SECONDS` unset in production. The built-in 300 second window is the replay bound this check is meant to enforce. Set the variable only for an intentional whole number of seconds from 1 through 600.
