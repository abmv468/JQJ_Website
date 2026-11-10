# DATA-002 orders hardening: RUNBOOK (PREPARED, NOT APPLIED)

Project: JQ Group Website (`dgeywuxelljfagnelxdg`). Prepared 10 Nov 2026, 14:54–15:10 HKT; **r2 16:14 HKT** (no backfill, NULL guard in one DO block, CHECK added; QA FAIL on #30 `e26f79e5`).
Nothing in this folder has been run against production. The only production access was read-only:
`precheck.sql`, `fingerprint.sql`, and one catalog/count query (all SELECT, no PII columns).

**Gate:** applying needs (1) a branch + PR containing the migration and test that passes QA's required checks (never straight to main), and (2) the Owner's own words for the apply *and for the route*, relayed via CTO and CEO. Draft PR #30 holds r1 (`e26f79e5`); r2 is staged for a cloud agent in the bot store `handoff/DATA-002-r2/`, not pushed.

## Files

| file | purpose |
|---|---|
| `20261110065700_orders_checkout_attempt_and_payment_status.sql` | the migration (goes to `jqj-store/supabase/migrations/`) |
| `tests/003_orders_checkout_attempt_and_payment_status.sql` | SQL test in QA-002's framework (goes to `jqj-store/supabase/tests/`) |
| `tests/004_orders_payment_status_null_guard.sql` | r2: NULL-guard test; re-runs the migration via `\ir ../migrations/...` (goes to `jqj-store/supabase/tests/`) |
| `rollback.sql` | one-transaction rollback, idempotent, also removes the history row if present |
| `precheck.sql` | read-only go/no-go (counts + catalog + lock/session counts only) |
| `compare_fingerprints.py` | before/after pass check over `fingerprint.sql` output |
| `apply_via_connector.sql` + `gen_connector.py` | route C only: migration verbatim + CLI-identical history row, one transaction |
| `test_harness/` | local throwaway Postgres harness (`run_db_gate.sh`, `run_scenarios.sh`), QA-002 framework copied unchanged from PR #8, PR #7's migration copy |
| `evidence/` | logs and JSON from local runs; read-only production precheck/fingerprint at prep time; PR #20 diff at a849d5b |

## 1. What it changes

A) `public.orders.checkout_attempt_id uuid NULL` + constraint `orders_provider_checkout_attempt_key UNIQUE (payment_provider, checkout_attempt_id)` (index built plain, then attached `USING INDEX`; NULLs distinct, no `NULLS NOT DISTINCT`) + (r2) `orders_checkout_attempt_requires_provider_chk CHECK (checkout_attempt_id IS NULL OR payment_provider IS NOT NULL)`, added only if missing.
B) `public.orders.payment_status`: `SET DEFAULT 'unpaid'` (unchanged value), then ONE DO block: own `lock_timeout 3s`; skip if already NOT NULL; `LOCK TABLE orders IN ACCESS EXCLUSIVE MODE`; if any NULL row → `RAISE EXCEPTION` P0001 `DATA-002 guard: N orders row(s) have payment_status IS NULL; refusing to SET NOT NULL`; else `SET NOT NULL`. **No backfill** (r1's CASE mapped `inventory_exception` → 'failed', wrong since PR #9). No CHECK on values.

Expected fingerprint delta: `count_columns +1`, `count_indexes +1`, `count_constraints +2` (UNIQUE + CHECK), `md5_columns` / `md5_indexes` / `md5_constraints` change. Everything else identical (row counts, RLS, policies, grants, functions/RPC md5s, triggers).
Production at prep (15:02 HKT): 139 columns, 31 indexes, 35 constraints, 12 tables, orders 11 rows, 0 NULL payment_status, 0 NULL payment_provider, no name collisions, no locks on orders, 0 idle-in-transaction. Fingerprint identical to DATA-001's 14:00 HKT "after" (no drift since).

## 2. Lock safety and transaction choice

- **CLI finding (r2, source `supabase/cli` v3.1.0 = `d4fc0e5`, copies in `evidence/r2/cli_source_v3.1.0/`).** `db push` (`db-push-core.ts` → `applyMigrations`) and `migration up` (`applyMigrationFile`) both go through `execMigrationBatch` in `migration-apply.ts`:
  - default `transactionMode: "transactional"` (`migration-file.ts`; only a first line `-- pg-delta: transaction=false` turns it off) → the file's statements **plus the history-row INSERT** are sent as one extended-protocol batch with a single final Sync (`DbSession.execBatch`), i.e. one implicit transaction. Any error rolls back the whole file and the history row. Proven locally: S4b (lock) and S4c (NULL guard) left no column, no CHECK and no history row.
  - `RESET ALL` runs before each file, so `set_config(..., true)` from one file can't leak.
  - a file with its own `BEGIN`/`COMMIT` (`hasTransactionControl`, which ignores `BEGIN` inside a function/DO body per its unit test) is run "exactly as written", statement by statement, and the history row is inserted **after** the file's COMMIT, outside it. So an explicit wrapper is accepted but strictly worse for the CLI (non-atomic history), and under `psql -f` it would only matter for db-gate.
  - Statements matching `CREATE INDEX CONCURRENTLY`, `VACUUM`, etc. are pulled out of the batch and run standalone; this file has none.
  - **Decision (CTO):** no BEGIN/COMMIT in the file; the guard and SET NOT NULL are one DO statement, atomic in every runner (CLI batch, route C wrapper, db-gate autocommit).
- Under autocommit `psql -f` (db-gate only, never prod) the earlier statements (column, UNIQUE, CHECK, default) commit one by one; if the guard then raises they stay. Recorded in S2b; harmless (all additive, idempotent; re-run after fixing the data completes).
- `CREATE UNIQUE INDEX CONCURRENTLY` can't run inside a transaction block, so it would need the no-transaction directive and a second migration file to attach the constraint. On an 11-row table that buys nothing: the plain build holds SHARE on orders for milliseconds. **Choice: plain `CREATE UNIQUE INDEX` then `ADD CONSTRAINT ... UNIQUE USING INDEX`** (named constraint, so `ON CONFLICT (payment_provider, checkout_attempt_id)` and `ON CONFLICT ON CONSTRAINT` both work, and 23505 errors name it). Non-partial on purpose: supabase-js `upsert({ onConflict })` can't send a partial-index predicate.
- `ADD COLUMN` (nullable, no default) is catalog-only; `SET NOT NULL` scans 11 rows. All take ACCESS EXCLUSIVE briefly, held until COMMIT (ms).
- `set_config('lock_timeout','3s', true)`: if a session already holds a lock on orders, the migration fails fast and rolls back instead of queueing (a queued ACCESS EXCLUSIVE would stall every later checkout read/write). Tested: S3 (psql single txn) failed after 3.0 s, nothing changed; S4b same via the CLI.
  The setting is transaction-scoped: the top-level one covers the whole file where it runs in a transaction (CLI, route C). The `$check$` and `$not_null$` DO blocks also set it themselves, so the CHECK and the guard/NOT NULL step keep the 3 s limit even under autocommit.
- `payment_provider` is nullable (0 NULLs on prod; every insert path sets it). r2's CHECK refuses a non-NULL attempt id with a NULL provider, so (NULL, X) can no longer repeat; test 003 §7 asserts 23514 and `precheck.sql` reports `attempt_without_provider` (must be 0) and `dup_attempt_null_provider`. Follow-up (not in scope): `SET NOT NULL` on `payment_provider`.

## 3. Migration-tracking state and apply routes

State now: production `supabase_migrations.schema_migrations` = `20261021000000`, `20261022000000`, `20261023190000`. PR #7's `20261110042024` is HELD and unapplied; its file exists only on `cursor/skip-paid-inventory-restore-f7b9` (stacked on PR #3), **not on main**. This file's `20261110065700` sorts after #7's.

`db push` / `migration up` apply every pending local file, so from a tree that contains #7's file, #7 would be applied too. Options:

| route | how | #7 consequence | needs |
|---|---|---|---|
| **A. Wait for #7** | approve/apply #7 first, then this file; CLI applies both in order | none, clean history | #7's QA-002 + Owner yes first |
| **B. CLI, isolated workdir** | scratch `supabase/migrations` holding exactly the 3 baseline files + this one (copies checked by sha256), `supabase migration up --remote=<ref> --yes` | #7 becomes out-of-order: later `db push` refuses unless `--include-all`, or #7's file is re-timestamped after 20261110065700 before it merges | IPv6 host (cloud agent/CI) or pooler + DB password; the box has no IPv6 route (DATA-001 attempt 1 timed out) |
| **C. Connector `execute_sql`** | send `apply_via_connector.sql` (one transaction: guards, migration verbatim, history row byte-identical to the CLI's, post-checks) | same as B | Owner's words for this hand-applied route (guardrail: never hand-edit prod in the SQL editor), as for DATA-001 option c |
| **D. Re-timestamp this file before #7** | rename to `20261110042000_orders_checkout_attempt_and_payment_status.sql` (between 20261023190000 and 20261110042024), then apply via B or C | none: #7 stays in order whenever it lands | same as B/C. Tested locally: QA db-gate with 3 + 20261110042000 + #7 + tests 001/002/003 all ok (`evidence/local_db_gate_route_D_order.log`) |

Recommendation: **A** if #7 is close to approval; otherwise **D + C** (works from the box, keeps #7 untouched and in order). If D is chosen, `gen_connector.py` must be regenerated from a CLI run of the renamed file (version string changes).
Never use the connector's `apply_migration` for this: it writes its own history row with a version it generates at call time and the name you pass, which won't be `20261110065700`. The CLI would then see an unknown remote version and treat this file as pending (and re-run it). If it is ever used by mistake: `delete` its row and insert the CLI-identical one from `apply_via_connector.sql`, in one transaction.
Variant C' (body only, no history row) is not recommended: history would be wrong until a later push re-runs the file (idempotent, but it takes ACCESS EXCLUSIVE again).

## 4. Apply steps (after the PR passes QA and the Owner says yes, for the chosen route)

0. Order with app code: **migration first**, then BACKEND's code that writes `checkout_attempt_id`. The migration is backward-compatible with main, PR #20 (a849d5b), PR #3 and PR #18: no current path writes the column or a NULL `payment_status`.
1. Precheck, read-only: run `precheck.sql`; save `evidence/prod/precheck_before.json`. Go only if: `payment_status_null = 0` (otherwise the guard RAISEs and nothing is applied; stop and report, don't hand-fix), `name_collisions = []` (both names), `checkout_attempt_column = null`, `other_unique_on_same_cols = []`, `locks_on_orders_other_sessions = 0`, `idle_in_txn_sessions = 0`, `longest_open_xact_s < 5`, `migrations` = the 3 baseline versions. Pick a quiet window (no checkout in flight).
2. Before fingerprint: run `/workspace/jqd_tech/changes_2026-11-10/DATA-001-APPLY/evidence/fingerprint.sql` → `evidence/prod/before.json`; `list_migrations` → `evidence/prod/before_list_migrations.json`.
3. Apply, by route:
   - B: `W=$(mktemp -d)/supabase/migrations; mkdir -p $W; cp` the 3 baseline files + this file; `sha256sum -c`; `(cd $W/../.. && supabase migration up --remote="$PROJECT_REF" --yes)`; token from env only, never printed.
   - C: `execute_sql` with the exact contents of `apply_via_connector.sql` (sha256 below). Any error = whole transaction rolled back.
   - On the guard (P0001 `DATA-002 guard: ...`): nothing applied (CLI/route C roll back the whole file and the history row). Stop and report the count; any NULL fix is a separate Owner-approved data change.
   - On lock timeout (55P03): nothing applied. Re-run the precheck and retry once in a quieter moment; otherwise stop and report.
4. After: `fingerprint.sql` → `evidence/prod/after.json`; `precheck.sql` → `evidence/prod/precheck_after.json`; `list_migrations` → `evidence/prod/after_list_migrations.json`.
5. `python3 compare_fingerprints.py evidence/prod/before.json evidence/prod/after.json` must print `PASS (expected-delta)`.

## 5. Pass criteria (all)

- `compare_fingerprints.py` PASS: only the 6 allowed keys change, with +1/+1/+1 counts; `row_counts` identical (orders 11, payments 11, order_items 16, products 9 ...); `rpc_md5` identical (`restore_order_inventory` still md5 457d9c1562b629bf4c8f7629580aa1fb unless #7 has landed).
- precheck after: `checkout_attempt_column = {uuid, nullable YES, default null}`, `dup_attempt_groups = 0`, `attempt_without_provider = 0`, `attempt_provider_check = {c, validated true}`, `payment_status_column = {nullable NO, default 'unpaid'::text}`, `orders_constraints` includes `orders_provider_checkout_attempt_key`, `payment_status_counts` unchanged.
- History: routes B/C/D → exactly the 3 baseline versions + this file's version; `20261110042024` absent (unless route A).
- Any mismatch: stop, report, rollback only on CTO's say-so.

## 6. Rollback

`rollback.sql` (one transaction, `lock_timeout 3s`, idempotent, no-op if never applied): drop the CHECK, the UNIQUE constraint/index and the column, `DROP NOT NULL`, default stays `'unpaid'`, delete history row `20261110065700` if present.
**First** roll back or disable app code that writes `checkout_attempt_id`. Once the column is gone, those inserts fail and card checkout breaks. Data loss: stored attempt ids only.
Tested locally: rollback → fingerprint identical to before; second rollback no-op; re-apply after rollback identical to first apply; route C rollback also removes the history row.

## 7. Checkout risk

- Locks: ms-long ACCESS EXCLUSIVE on orders; worst case a checkout request waits up to ~3 s, or the migration aborts with nothing changed.
- Behaviour now: none. The column is unused until BACKEND ships; NOT NULL matches every write path on main, PR #20 (a849d5b), PR #3, PR #18 (all write non-null literals or `InternalPaymentStatus`; `normalizeAirwallexPaymentStatus` returns `'unknown'`, never null; supabase-js drops `undefined` keys). DB functions don't write `payment_status`.
- Behaviour once BACKEND writes the column: a duplicate attempt now raises 23505 on the order insert. Unhandled, that's a 500 at checkout. BACKEND must catch 23505 on `orders_provider_checkout_attempt_key` (or use `ON CONFLICT DO NOTHING` + select) and reuse the existing order. They must also write the server's **effective** `requestId`, not the raw client key (see README, conflicts).
- PostgREST schema cache: Supabase reloads it on DDL; deploy the app code only after the column exists.
- PR #8 (QA-002 db gate) isn't on main yet. A DATA-002 PR based on main gets `verify`/`e2e` but no `db-migrations` job until #8 merges. Either stack on #8 or land #8 first so the required check exists.

## 8. Local test results

### r2 (Postgres 16.15 throwaway, 127.0.0.1:54329, psql 17.11 client; QA CI uses postgres:16, prod is 17.6)
Inputs checked against GitHub (read-only, connector): main's 3 migrations = local copies (git blobs 5e880c7, 66e407f, b3b44d9); PR #8 head `d4d5d99` (base #7 head `2b5c037`): `ci/db-gate.sh` 7dd3664, `ci/bootstrap.sql` e14dc79, tests 001 a4467a1 / 002 4cdc5d6 = local copies; #7's `20261110042024` same SQL as the local copy (local has 2 extra trailing bytes).
- `test_harness/run_db_gate.sh` → `evidence/r2/local_db_gate_r2.log`: G1 3+#30, tests 003/004 **ok**. G2 main+#7+#8+#30, tests 001/002/003/004 **ok**; manual `psql -f` re-apply → orders schema identical. G3 control (no DATA-002 migration) **fails** (003). G3b 004 alone without the migration **fails**. G4 NULL rows seeded by a test-only earlier file → apply **fails on the guard**; afterwards payment_status nullable, 2 NULL rows untouched, 0 'failed'. G5 mutant with r1's CASE backfill swapped in → **killed by 004**.
- `test_harness/run_scenarios.sh` → `evidence/r2/local_scenarios_r2.log`, JSON in `evidence/r2/local/` (r1 JSON kept in `evidence/r1_local/`): S1 expected-delta PASS, re-apply identical, 003 ok, rollback identical to before, rollback re-run ok, re-apply identical. S2 NULL rows, one txn → P0001, nothing applied. S2b same, autocommit → guard aborts alone (nullable, rows unchanged; column/UNIQUE/CHECK stay), after fixing data the re-run completes. S3 lock → 55P03 after 3.0 s, nothing applied. S4 CLI 3.1.0 repair + `migration up` → applied only this file, 9 statements in history, expected-delta PASS; `apply_via_connector.sql` regenerated (statements md5 9c92037b3287d05a6d87b778c71ca648). S4c CLI with a NULL row → P0001, no column/CHECK/history. S4b CLI under lock → 55P03, nothing applied. S5 connector route → orders schema identical to CLI, history row byte-identical, re-run refused, rollback restores before incl. history. S6 mutant without SET NOT NULL → 003 fails.

### r1 (superseded; Postgres 17.11)
- db-gate G1/G2 ok, G3 control failed as expected; scenarios S1–S6 ok (S2 then used the CASE backfill QA rejected). Logs: `evidence/local_db_gate.log`, `evidence/local_scenarios.log`, `evidence/r1_local/`.
- Route D order (this file before #7): db-gate ok (r1; re-run needed if D is chosen).

## Artifact sha256
See `SHA256SUMS` in this folder (verify with `sha256sum -c SHA256SUMS` before any apply).
