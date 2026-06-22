#!/bin/bash
# VERA database setup script
# Orchestrates full database setup: PostgreSQL + SQLite from a single source
#
# 1. Creates PostgreSQL database with migrations, CSV data, and seed data
# 2. Creates SQL dump from PostgreSQL
# 3. Converts SQL dump to SQLite-compatible deps file
# 4. Creates SQLite database from CSV + deps

set -e

DB_NAME="infra"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PG_DIR="${SCRIPT_DIR}/pg"
LITE_DIR="${SCRIPT_DIR}/lite"

CSV_PATH="${PG_DIR}/data/kyiv_infrastructure.csv"
MIGRATION_PATH="${PG_DIR}/migrations"
PG_DUMP_PATH="${PG_DIR}/infra_backup.sql"
DEPS_SQL_PATH="${LITE_DIR}/deps_sqlite.sql"
SQLITE_DB_PATH="${LITE_DIR}/infra.db"

# =============================================================================
# POSTGRESQL SETUP
# =============================================================================

echo "=============================================="
echo "=== POSTGRESQL SETUP"
echo "=============================================="

echo ""
echo "=== Dropping existing PostgreSQL database ==="
psql -h localhost -U postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"

echo ""
echo "=== Creating fresh PostgreSQL database ==="
psql -h localhost -U postgres -c "CREATE DATABASE ${DB_NAME};"

echo ""
echo "=== Applying migration 0001 (schema) ==="
psql -h localhost -U postgres -d ${DB_NAME} -f "${MIGRATION_PATH}/0001_infrastructure.sql"

echo ""
echo "=== Applying migration 0002 (dependency functions) ==="
psql -h localhost -U postgres -d ${DB_NAME} -f "${MIGRATION_PATH}/0002_dependency_functions.sql"

echo ""
echo "=== Loading CSV data ==="
psql -h localhost -U postgres -d ${DB_NAME} -c "COPY infrastructure(id, name, type, subtype, location, latitude, longitude, capacity, year_built, status, metadata) FROM '${CSV_PATH}' WITH (FORMAT csv, HEADER true);"

echo ""
echo "=== Loading fake CSV data ==="
FAKE_CSV_PATH="${PG_DIR}/data/fake_kyiv_infrastructure.csv"
psql -h localhost -U postgres -d ${DB_NAME} -c "COPY infrastructure(id, name, type, subtype, location, latitude, longitude, capacity, year_built, status, metadata) FROM '${FAKE_CSV_PATH}' WITH (FORMAT csv, HEADER true);"

echo ""
echo "=== Seeding dependencies ==="
psql -h localhost -U postgres -d ${DB_NAME} -c "SELECT seed_infrastructure_dependencies();"

echo ""
echo "=== PostgreSQL Verification ==="
echo "Infrastructure counts:"
psql -h localhost -U postgres -d ${DB_NAME} -c "SELECT type, count(*) FROM infrastructure GROUP BY type ORDER BY count(*) DESC;"

echo ""
echo "Dependency counts:"
psql -h localhost -U postgres -d ${DB_NAME} -c "SELECT kind, reason, count(*) FROM infrastructure_dependencies GROUP BY kind, reason ORDER BY count(*) DESC;"

echo ""
echo "=== PostgreSQL database ${DB_NAME} ready! ==="

# =============================================================================
# CREATE SQL DUMP
# =============================================================================

echo ""
echo "=============================================="
echo "=== CREATING SQL DUMP"
echo "=============================================="

pg_dump -h localhost -U postgres -d ${DB_NAME} -f "${PG_DUMP_PATH}"
echo "SQL dump saved to ${PG_DUMP_PATH}"

# =============================================================================
# CONVERT PG DUMP TO SQLITE FORMAT
# =============================================================================

echo ""
echo "=============================================="
echo "=== CONVERTING PG DUMP TO SQLITE FORMAT"
echo "=============================================="

uv run --script "${LITE_DIR}/convert_pg_dump_to_sqlite.py"

# =============================================================================
# SQLITE SETUP
# =============================================================================

echo ""
echo "=============================================="
echo "=== SQLITE SETUP"
echo "=============================================="

uv run --script "${LITE_DIR}/setup_sqlite.py"

echo ""
echo "=== Verifying SQLite database ==="
sqlite3 "${SQLITE_DB_PATH}" ".tables"

echo ""
echo "=============================================="
echo "=== ALL DATABASES READY ==="
echo "=============================================="
echo "PostgreSQL: ${DB_NAME} (localhost)"
echo "SQLite:     ${SQLITE_DB_PATH}"
echo ""
