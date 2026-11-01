#!/usr/bin/env bash
set -euo pipefail
# An isolated, temporary PostgreSQL instance: never connects to an existing DB.
command -v initdb >/dev/null || { echo 'Install PostgreSQL 15+ or run supabase/tests/policies.sql in an isolated Supabase local database.'; exit 1; }
portfolio_pg="$(mktemp -d "${TMPDIR:-/tmp}/portfolio-pg.XXXXXX")"
cleanup() { pg_ctl -D "$portfolio_pg/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$portfolio_pg"; }
trap cleanup EXIT
initdb -D "$portfolio_pg/data" -A trust --no-locale --encoding=UTF8 >/dev/null
pg_ctl -D "$portfolio_pg/data" -l "$portfolio_pg/server.log" -o "-h '' -k '$portfolio_pg' -p 55439" start >/dev/null
export PGHOST="$portfolio_pg" PGPORT=55439 PGDATABASE=postgres
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
SQL
for portfolio_migration in supabase/migrations/*.sql; do psql -X -v ON_ERROR_STOP=1 -q -f "$portfolio_migration"; done
psql -X -v ON_ERROR_STOP=1 -q -f supabase/seed.sql
psql -X -v ON_ERROR_STOP=1 -q -f supabase/seed.sql
if [ "${PORTFOLIO_GENERATE_TYPES:-0}" = "1" ]; then python3 scripts/generate-db-types.py; fi
psql -X -v ON_ERROR_STOP=1 -q -f supabase/tests/policies.sql
