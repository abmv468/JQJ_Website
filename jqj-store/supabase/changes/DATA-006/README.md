# DATA-006: orders.confirmation_email_claimed_at (PREPARE ONLY, nothing applied)

Prepared by JQD-DATA, 10 Nov 2026 (r3 16:23 HKT: rollback guard has no override, CTO decision; r2 16:22 HKT: BE-016 protocol + test 005 §6; schema unchanged); r1 16:16 HKT. Production `dgeywuxelljfagnelxdg` not touched (no reads either). Separate from DATA-002 / PR #30; not folded into it.

**Gate:** a branch + PR with the migration and test that passes QA's required checks (never straight to main), and the Owner's own words for the apply and the route, relayed via CTO and CEO. Apply only after #30 (version order 20261110065700 < 20261110080000; no functional dependency).

## What it does
`alter table public.orders add column if not exists confirmation_email_claimed_at timestamptz`: nullable, no default, plus a column comment. Runs inside one DO block that sets its own `lock_timeout 3s` (also set at file level), so it fails fast instead of queueing behind a lock under the CLI, the connector wrapper or autocommit psql. If the column already exists the block returns without taking a lock (re-run = no-op). Catalog-only add: no rewrite, no scan, ACCESS EXCLUSIVE held for milliseconds. No BEGIN/COMMIT in the file (Supabase CLI 3.1.0 already runs each file + history row as one implicit transaction; see DATA-002 RUNBOOK §2).
Expected fingerprint delta: `count_columns +1`, `md5_columns` changes; nothing else.

## Files
| file | repo path | sha256 |
|---|---|---|
| `20261110080000_orders_confirmation_email_claimed_at.sql` | `jqj-store/supabase/migrations/20261110080000_orders_confirmation_email_claimed_at.sql` | `6351a988e18b0a422f019afdab4c1d6b0f8f02d603f91683d42f7bd50e05f763` |
| `tests/005_orders_confirmation_email_claimed_at.sql` | `jqj-store/supabase/tests/005_orders_confirmation_email_claimed_at.sql` | `a6228923d1592e1b63bc4f6581be4a0f0681f546ac595cce3c33b772d6ee4cab` |
| `rollback.sql` | `jqj-store/supabase/changes/DATA-006/rollback.sql` | `f791b338496041f20d5b697c3ac2fe1216b8397064464982ceecaef94cece777` |
| `precheck.sql` | `jqj-store/supabase/changes/DATA-006/precheck.sql` | `fe752838d55973d81f29b2a516966b4b3b2b21859d4089fa055811ceffbd8914` |
| `test_harness/run_verify.sh` | local only | `1433475f2016ebe99102ffa95f2f6e74486d0a190f4742b2de0d8c6857104681` |
(This README's own hash is in the handoff MANIFEST.)

## Rollback (`rollback.sql`)
One transaction, `lock_timeout 3s`, idempotent. **Guarded, no override (CTO decision):** while any row has `confirmation_email_claimed_at` set it always refuses with P0001 `DATA-006 rollback guard: N orders row(s) have confirmation_email_claimed_at set; refusing to drop the column` and changes nothing; HINT: a rollback needs a new reviewed change approved by CTO and the Owner. Dropping the column would discard the email de-dup record and could cause a second confirmation email. Because BE-016's success step keeps claimed_at set, the guard will refuse once any confirmation email has been sent. With no claims it drops the column and deletes history row `20261110080000` if present; a second run is a no-op. First roll back app code that uses the column (otherwise PostgREST gets 42703/PGRST204).

## Precheck (`precheck.sql`, read-only, counts + catalog only)
Go before apply: `claimed_at_column = null`, `sent_at_column.type = timestamp with time zone`, `locks_on_orders_other_sessions = 0`, `idle_in_txn_sessions = 0`, `longest_open_xact_s < 5`, `migrations` lacks 20261110080000. After: `claimed_at_column = {timestamp with time zone, YES, null}`, `claimed_at_set = 0`, `orders_rows` unchanged.

## Test 005 (QA-002 framework, PR #8, unchanged)
Type is timestamptz, nullable, no default; sibling `confirmation_email_sent_at` still timestamptz; an existing-shape insert (column not named) works and leaves NULL; set + exact read-back; clear to NULL; conditional claim (`... where confirmation_email_claimed_at is null`) updates 1 row, a second claim 0 rows. §6 (r2) runs BACKEND's exact BE-016 statements: claim returns the stamp; second claim inside the window 0 rows; claim backdated 11 minutes is re-claimed with a new stamp; the stale worker's CAS success and CAS clear with the old stamp update 0 rows and leave the new holder's claim intact; the holder's CAS success sets sent_at and keeps claimed_at; a claim after sent_at (also with an expired claim) 0 rows; holder CAS clear on failure clears and allows a re-claim. `now()` is fixed per transaction, so expiry is simulated by backdating the stored stamp. Schema unchanged. Fixtures roll back.

## Local verification (r3 16:23 HKT, Postgres 16.15 throwaway on 127.0.0.1:54329; log `evidence/local_verify_r3.log`, refusal output `evidence/v3_rollback_refusal_r3.txt`; earlier logs `local_verify_r1.log`, `local_verify_r2.log`)
- V1 main + #7 + #8 + #30 r2 + DATA-006, db-gate tests 001–005 (005 incl. §6 BE-016 protocol): **ok**.
- V1b re-apply (psql -f): orders schema identical (no-op).
- V2 control without the DATA-006 migration: **005 fails** as expected.
- V3 rollback (no override): with a claimed row → refused (P0001, no-override HINT), column and claim kept; claims cleared → column dropped; re-run → no-op; re-apply → schema identical to V1; tests 001–005 ok again.
- V4 lock held by another session → 55P03 after 3.0 s, column not added.
- V5 real Supabase CLI 3.1.0 `migration up` → applied #30 r2 then DATA-006 (history 9 and 2 statements; `evidence/v5_cli_history_row_20261110080000.json`); orders schema identical to the db-gate build.
- Test-strength check (`evidence/test005_mutants_r2.log`): window changed to 12 minutes → 005 fails at 6c; success step without the stamp CAS → 005 fails at 6d.

## BE-016 claim protocol (confirmed by BACKEND)
Window: **interval 10 minutes, a code constant in BE-016, not configurable at runtime.**
1. **Claim**
   ```sql
   UPDATE orders SET confirmation_email_claimed_at = now()
   WHERE id = $1 AND confirmation_email_sent_at IS NULL
     AND (confirmation_email_claimed_at IS NULL
          OR confirmation_email_claimed_at < now() - interval '10 minutes')
   RETURNING confirmation_email_claimed_at;
   ```
   0 rows = someone else holds a live claim, or the email was already sent: don't send. The caller keeps the returned stamp.
2. **Success** (after the send): `UPDATE orders SET confirmation_email_sent_at = now() WHERE id = $1 AND confirmation_email_claimed_at = <stamp>;` claimed_at stays set, for audit.
3. **Failure**: `UPDATE orders SET confirmation_email_claimed_at = NULL WHERE id = $1 AND confirmation_email_claimed_at = <stamp>;`
- Steps 2 and 3 are compare-and-set on the stamp, so a stale worker whose claim expired and was re-claimed can't clear or overwrite the new holder's claim (its UPDATE matches 0 rows).
- **Order:** BE-016 lands only after DATA-006 is applied (the column must exist before any code reads or writes it).
- **Rollback consequence:** success leaves claimed_at set, so `rollback.sql` will refuse as soon as any confirmation email has been sent under BE-016. There is no override; removing the column after that needs a new reviewed change approved by CTO and the Owner.
- Not included (ask if wanted): an index on the column (11 rows today, lookups are by `id`), a CHECK tying claimed/sent order.
