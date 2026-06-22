#!/bin/bash
# VERA database setup script
# Drops and recreates infra database, applies migrations, loads CSV data, seeds dependencies

set -e

DB_NAME="infra"
CSV_PATH="/Users/justmac/GitHub/hackathon/VERA/data/kyiv_infrastructure.csv"
MIGRATION_PATH="/Users/justmac/GitHub/hackathon/VERA/supabase/migrations"

echo "=== Dropping existing database ==="
psql -h localhost -U postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"

echo "=== Creating fresh database ==="
psql -h localhost -U postgres -c "CREATE DATABASE ${DB_NAME};"

echo "=== Applying migration 0001 (schema) ==="
psql -h localhost -U postgres -d ${DB_NAME} -f "${MIGRATION_PATH}/0001_infrastructure.sql"

echo "=== Applying migration 0002 (dependency functions) ==="
psql -h localhost -U postgres -d ${DB_NAME} -f "${MIGRATION_PATH}/0002_dependency_functions.sql"

echo "=== Loading CSV data ==="
psql -h localhost -U postgres -d ${DB_NAME} -c "COPY infrastructure(id, name, type, subtype, location, latitude, longitude, capacity, year_built, status, metadata) FROM '${CSV_PATH}' WITH (FORMAT csv, HEADER true);"

echo "=== Seeding dependencies ==="
psql -h localhost -U postgres -d ${DB_NAME} -c "SELECT seed_infrastructure_dependencies();"

echo ""
echo "=== Verification ==="
echo "Infrastructure counts:"
psql -h localhost -U postgres -d ${DB_NAME} -c "SELECT type, count(*) FROM infrastructure GROUP BY type ORDER BY count(*) DESC;"

echo ""
echo "Dependency counts:"
psql -h localhost -U postgres -d ${DB_NAME} -c "SELECT kind, reason, count(*) FROM infrastructure_dependencies GROUP BY kind, reason ORDER BY count(*) DESC;"

echo ""
echo "Dependencies by source subtype:"
psql -h localhost -U postgres -d ${DB_NAME} -c "SELECT i.subtype, count(*) as dep_count FROM infrastructure_dependencies d JOIN infrastructure i ON i.id = d.source_id GROUP BY i.subtype ORDER BY dep_count DESC LIMIT 15;"

echo ""
echo "=== Database ${DB_NAME} ready! ==="
