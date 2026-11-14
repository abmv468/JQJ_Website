#!/usr/bin/env python3
"""Compare two fingerprint.sql outputs (before/after DATA-002 orders hardening).

Usage: compare_fingerprints.py before.json after.json [--expect-identical]

Default mode (after apply): PASS only if every key is identical except the
ones this migration is allowed to change, and those change exactly as expected:
  count_columns      +1   (orders.checkout_attempt_id)
  count_indexes      +1   (orders_provider_checkout_attempt_key)
  count_constraints  +2   (UNIQUE orders_provider_checkout_attempt_key,
                           CHECK orders_checkout_attempt_requires_provider_chk)
  md5_columns        changed (new column; payment_status is_nullable YES->NO)
  md5_indexes        changed
  md5_constraints    changed
row_counts, RLS flags, policies, grants, functions, RPC md5s, triggers and
counts of tables/policies/functions must be identical.
--expect-identical: every key except captured_at must match (rollback check).
Input files may be raw JSON or psql -At output (last non-empty line is used).
"""
import json, sys

def load(p):
    lines = [l for l in open(p).read().splitlines() if l.strip()]
    return json.loads(lines[-1])

args = [a for a in sys.argv[1:] if not a.startswith("--")]
identical = "--expect-identical" in sys.argv
b, a = load(args[0]), load(args[1])
for d in (a, b):
    d.pop("captured_at", None)

allowed = {"count_columns": 1, "count_indexes": 1, "count_constraints": 2,
           "md5_columns": None, "md5_indexes": None, "md5_constraints": None}
fail = []
for k in sorted(set(a) | set(b)):
    if k not in a or k not in b:
        fail.append(f"{k}: missing on one side"); continue
    if identical or k not in allowed:
        if a[k] != b[k]:
            fail.append(f"{k}: unexpected change {json.dumps(b[k])[:200]} -> {json.dumps(a[k])[:200]}")
    else:
        delta = allowed[k]
        if delta is None:
            if a[k] == b[k]:
                fail.append(f"{k}: expected a change, unchanged")
        elif int(a[k]) - int(b[k]) != delta:
            fail.append(f"{k}: expected +{delta}, got {b[k]} -> {a[k]}")
mode = "identical" if identical else "expected-delta"
if fail:
    print(f"FAIL ({mode})"); [print("  " + f) for f in fail]; sys.exit(1)
print(f"PASS ({mode}): row_counts={json.dumps(a['row_counts'], sort_keys=True)}")
