#!/usr/bin/env bash
# Apply supabase/migrations to an empty local database, then run supabase/tests.
# Refuses any host other than loopback. Never point this at a hosted project.
#
#   db-gate.sh            drop, create, bootstrap, apply, test
#   db-gate.sh apply      drop, create, bootstrap, apply
#   db-gate.sh test       run SQL tests against the database apply just built
#
# Connection (throwaway defaults):
#   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-all}"
DB_NAME="${JQJ_TEST_DB:-jqj_migrations}"

case "$MODE" in
  all|apply|test) ;;
  *)
    echo "usage: db-gate.sh [all|apply|test]" >&2
    exit 2
    ;;
esac

if [[ ! "$DB_NAME" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo "Refusing database name: ${DB_NAME}" >&2
  exit 2
fi

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGPASSWORD:=postgres}"
export PGHOST PGPORT PGUSER PGPASSWORD
export PGOPTIONS="-c client_min_messages=warning"
unset PGDATABASE || true

case "$PGHOST" in
  localhost|127.0.0.1|::1) ;;
  *)
    echo "db-gate.sh only connects to local Postgres (PGHOST=${PGHOST})." >&2
    exit 2
    ;;
esac

mapfile -t MIGRATIONS < <(find "$ROOT/migrations" -maxdepth 1 -type f -name '*.sql' -print | LC_ALL=C sort)
mapfile -t TESTS < <(find "$ROOT/tests" -maxdepth 1 -type f -name '*.sql' -print | LC_ALL=C sort)

if ((${#MIGRATIONS[@]} == 0)); then
  echo "No migrations in ${ROOT}/migrations" >&2
  exit 1
fi
if ((${#TESTS[@]} == 0)); then
  echo "No SQL tests in ${ROOT}/tests" >&2
  exit 1
fi

psql_admin() {
  psql -X -q -d postgres -v ON_ERROR_STOP=1 "$@"
}

psql_db() {
  psql -X -q -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"
}

apply_dir() {
  local label="$1"
  shift
  local file
  for file in "$@"; do
    echo "${label} ${file#${ROOT}/}"
    psql_db -f "$file"
  done
}

prepare_database() {
  # DB_NAME is restricted to [a-z_][a-z0-9_]* above, so it is safe as an identifier.
  echo "db-gate: Postgres $(psql_admin -tA -c 'show server_version') on ${PGHOST}:${PGPORT}, empty database ${DB_NAME}"
  psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" >/dev/null
  psql_admin -c "DROP DATABASE IF EXISTS ${DB_NAME};"
  psql_admin -c "CREATE DATABASE ${DB_NAME};"
  echo "Applying ci/bootstrap.sql"
  psql_db -f "$ROOT/ci/bootstrap.sql"
  apply_dir "Applying" "${MIGRATIONS[@]}"
}

run_tests() {
  apply_dir "Testing" "${TESTS[@]}"
}

case "$MODE" in
  apply)
    prepare_database
    ;;
  test)
    echo "db-gate: SQL tests on ${PGHOST}:${PGPORT}/${DB_NAME}"
    run_tests
    ;;
  all)
    prepare_database
    run_tests
    ;;
esac

echo "db-gate: ${MODE} ok"
