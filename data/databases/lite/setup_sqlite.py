#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# ///

"""
Setup SQLite database for VERA infrastructure.

Creates schema, loads CSV data, and loads dependencies from deps_sqlite.sql.
"""

import csv
import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent / "infra.db"
CSV_PATH = Path(__file__).parent.parent / "pg" / "data" / "kyiv_infrastructure.csv"
DEPS_SQL_PATH = Path(__file__).parent / "deps_sqlite.sql"


def setup_sqlite():
    # Remove existing db
    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Create schema
    print("Creating schema...")
    cur.execute("""
        CREATE TABLE infrastructure (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            subtype TEXT NOT NULL,
            location TEXT,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            capacity TEXT,
            year_built TEXT,
            status TEXT,
            metadata TEXT NOT NULL DEFAULT '{}',
            real INTEGER NOT NULL DEFAULT 1
        );
    """)

    cur.execute("""
        CREATE TABLE infrastructure_dependencies (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            weight REAL NOT NULL DEFAULT 0.5,
            reason TEXT,
            UNIQUE(source_id, target_id, kind)
        );
    """)

    # Create indexes
    cur.execute("CREATE INDEX idx_infra_type ON infrastructure(type);")
    cur.execute("CREATE INDEX idx_infra_subtype ON infrastructure(subtype);")
    cur.execute("CREATE INDEX idx_deps_source ON infrastructure_dependencies(source_id);")
    cur.execute("CREATE INDEX idx_deps_target ON infrastructure_dependencies(target_id);")

    conn.commit()

    # Load CSV
    print(f"Loading CSV: {CSV_PATH}")
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = 0
        for row in reader:
            real_val = 1 if row.get("real", "true").lower() in ("true", "1", "yes") else 0
            cur.execute("""
                INSERT INTO infrastructure
                (id, name, type, subtype, location, latitude, longitude, capacity, year_built, status, metadata, real)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                row["id"],
                row["name"],
                row["type"],
                row["subtype"],
                row.get("location", ""),
                float(row["latitude"]),
                float(row["longitude"]),
                row.get("capacity", ""),
                row.get("year_built", ""),
                row.get("status", ""),
                row.get("metadata", "{}"),
                real_val,
            ))
            rows += 1
    conn.commit()
    print(f"Loaded {rows} infrastructure records")

    # Load dependencies SQL
    print(f"Loading deps SQL: {DEPS_SQL_PATH}")
    deps_sql = DEPS_SQL_PATH.read_text()

    # Extract only INSERT statements
    insert_lines = [line for line in deps_sql.split("\n") if line.startswith("INSERT INTO")]
    rows = 0
    for line in insert_lines:
        # Remove semicolon and execute
        line = line.rstrip(";")
        cur.execute(line)
        rows += 1
    conn.commit()
    print(f"Loaded {rows} dependency records")

    # Verification queries
    print("\n=== Verification ===")
    cur.execute("SELECT count(*) FROM infrastructure")
    print(f"Total infrastructure: {cur.fetchone()[0]}")

    cur.execute("SELECT count(*) FROM infrastructure_dependencies")
    print(f"Total dependencies: {cur.fetchone()[0]}")

    cur.execute("""
        SELECT type, count(*) FROM infrastructure
        GROUP BY type ORDER BY count(*) DESC
    """)
    print("\nBy type:")
    for row in cur.fetchall():
        print(f"  {row[0]}: {row[1]}")

    cur.execute("""
        SELECT kind, reason, count(*) FROM infrastructure_dependencies
        GROUP BY kind, reason ORDER BY count(*) DESC
    """)
    print("\nBy dependency kind:")
    for row in cur.fetchall():
        print(f"  {row[0]} ({row[1]}): {row[2]}")

    conn.close()
    print(f"\nSQLite database ready: {DB_PATH}")


if __name__ == "__main__":
    if not CSV_PATH.exists():
        print(f"ERROR: {CSV_PATH} not found", file=sys.stderr)
        sys.exit(1)
    if not DEPS_SQL_PATH.exists():
        print(f"ERROR: {DEPS_SQL_PATH} not found", file=sys.stderr)
        sys.exit(1)

    setup_sqlite()
