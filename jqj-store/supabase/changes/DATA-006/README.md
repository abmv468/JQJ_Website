# DATA-006: orders.confirmation_email_claimed_at (PREPARE ONLY, nothing applied)

Prepared by JQD-DATA, 10 Nov 2026 16:16 HKT. Production `dgeywuxelljfagnelxdg` not touched (no reads either). Separate from DATA-002 / PR #30; not folded into it.

**Gate:** a branch + PR with the migration and test that passes QA's required checks (never straight to main), and the Owner's own words for the apply and the route, relayed via CTO and CEO. Apply only after #30 (version order 20261110065700 < 20261110080000; no functional dependency).

## What it does
`alter table public.orders add column if not exists confirmation_email_claimed_at timestamptz`: nullable, no default, plus a column comment. Runs inside one DO block that sets its own `lock_timeout 3s` (also set at file level), so it fails fast instead of queueing behind a lock under the CLI, the connector wrapper or autocommit psql. If the column already exists the block returns without taking a lock (re-run = no-op). Catalog-only add: no rewrite, no scan, ACCESS EXCLUSIVE held for milliseconds. No BEGIN/COMMIT in the file (Supabase CLI 3.1.0 already runs each file + history row as one implicit transaction; see DATA-002 RUNBOOK §2).
Expected fingerprint delta: `count_columns +1`, `md5_columns` changes; nothing else.

## Files
| file | repo path | sha256 |
|---|---|---|
| `20261110080000_orders_confirmation_email_claimed_at.sql` | `jqj-store/supabase/migrations/20261110080000_orders_confirmation_email_claimed_at.sql` | `6351a988e18b0a422f019afdab4c1d6b0f8f02d603f91683d42f7bd50e05f763` |
| `tests/005_orders_confirmation_email_claimed_at.sql` | `jqj-store/supabase/tests/005_orders_confirmation_email_claimed_at.sql` | `9cc64489077ca738d515bae52010b160cdc672221307aa2043eb539bc6dfe9ef` |
| `rollback.sql` | `jqj-store/supabase/changes/DATA-006/rollback.sql` | `90dcd4d44a02c83b7ea5dbfcbefc8dfe1026aad1c19c9161748dc5bc13deb8fc` |
| `precheck.sql` | `jqj-store/supabase/changes/DATA-006/precheck.sql` | `fe752838d55973d81f29b2a516966b4b3b2b21859d4089fa055811ceffbd8914` |
| `test_harness/run_verify.sh` | local only | `341188d9c72d1b2aca3fbdd37e4341bf4ba112d71034a38ffcf002dee30b6f43` |
(This README's own hash is in the handoff MANIFEST.)

## Rollback (`rollback.sql`)
One transaction, `lock_timeout 3s`, idempotent. **Guarded:** refuses (P0001 `DATA-006 rollback guard: N orders row(s) have confirmation_email_claimed_at set`) while any claim timestamp exists, because dropping it discards the email de-dup record and could cause a second confirmation email. Override only on CTO's decision, after disabling the app code: `select set_config('jqd.data006_rollback_force', 'yes', false);` in the same session. Also deletes history row `20261110080000` if present. First roll back app code that uses the column (otherwise PostgREST gets 42703/PGRST204).

## Precheck (`precheck.sql`, read-only, counts + catalog only)
Go before apply: `claimed_at_column = null`, `sent_at_column.type = timestamp with time zone`, `locks_on_orders_other_sessions = 0`, `idle_in_txn_sessions = 0`, `longest_open_xact_s < 5`, `migrations` lacks 20261110080000. After: `claimed_at_column = {timestamp with time zone, YES, null}`, `claimed_at_set = 0`, `orders_rows` unchanged.

## Test 005 (QA-002 framework, PR #8, unchanged)
Type is timestamptz, nullable, no default; sibling `confirmation_email_sent_at` still timestamptz; an existing-shape insert (column not named) works and leaves NULL; set + exact read-back; clear to NULL; conditional claim (`... where confirmation_email_claimed_at is null`) updates 1 row, a second claim 0 rows. Fixtures roll back.

## Local verification (16:16 HKT, Postgres 16.15 throwaway on 127.0.0.1:54329; log `evidence/local_verify.log`)
- V1 main + #7 + #8 + #30 r2 + DATA-006, db-gate tests 001–005: **ok**.
- V1b re-apply (psql -f): orders schema identical (no-op).
- V2 control without the DATA-006 migration: **005 fails** as expected.
- V3 rollback: with a claimed row → refused, column kept; forced → dropped; re-run → no-op; re-apply → schema identical to V1; tests 001–005 ok again.
- V4 lock held by another session → 55P03 after 3.0 s, column not added.
- V5 real Supabase CLI 3.1.0 `migration up` → applied #30 r2 then DATA-006, history rows written (`evidence/v5_cli_history_row_20261110080000.json`); orders schema identical to the db-gate build.

## Open for BACKEND / CTO
- Intended use (assumed): claim before sending (`update ... set confirmation_email_claimed_at = now() where id = ? and confirmation_email_sent_at is null and (confirmation_email_claimed_at is null or confirmation_email_claimed_at < now() - interval '<stale window>')`), set `confirmation_email_sent_at` after a successful send, clear the claim on failure. The stale window is an app decision.
- Not included (ask if wanted): an index on the column (11 rows today, not needed), a CHECK tying claimed/sent order.
