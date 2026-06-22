#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# ///

"""
Convert PostgreSQL pg_dump COPY format to SQLite INSERT statements.

Handles the COPY ... FROM stdin; ... \. format that pg_dump uses.
Outputs SQLite-compatible INSERT statements for infrastructure_dependencies.
"""

import sys
from pathlib import Path

PG_DUMP = Path(__file__).parent.parent / "pg" / "infra_backup.sql"
OUTPUT = Path(__file__).parent / "deps_sqlite.sql"


def convert_pg_dump_to_sqlite(pg_dump_path: Path, output_path: Path) -> int:
    """Extract dependency rows from pg_dump COPY format and convert to SQLite."""

    content = pg_dump_path.read_text()
    lines = content.split("\n")

    in_deps_copy = False
    deps_rows: list[str] = []

    for line in lines:
        stripped = line.strip()

        # Look for COPY command for infrastructure_dependencies
        if "infrastructure_dependencies" in stripped and "COPY" in stripped:
            in_deps_copy = True
            continue

        # End of COPY block
        if stripped == "\\." and in_deps_copy:
            in_deps_copy = False
            continue

        # Collect data rows (tab-separated)
        if in_deps_copy and stripped:
            deps_rows.append(stripped)

    # Convert to SQLite INSERT statements
    sqlite_inserts: list[str] = []
    for row in deps_rows:
        parts = row.split("\t")
        if len(parts) < 6:
            continue

        # parts[0] = id (UUID)
        # parts[1] = source_id (UUID)
        # parts[2] = target_id (UUID)
        # parts[3] = kind (text)
        # parts[4] = weight (float)
        # parts[5] = reason (text)

        id_val = parts[0]
        source_id = parts[1]
        target_id = parts[2]
        kind = parts[3]
        weight = parts[4]
        reason = parts[5]

        # Build SQLite INSERT - quote UUIDs that aren't already quoted
        if not id_val.startswith("'"):
            id_val = f"'{id_val}'"
        if not source_id.startswith("'"):
            source_id = f"'{source_id}'"
        if not target_id.startswith("'"):
            target_id = f"'{target_id}'"

        sql = f"INSERT INTO infrastructure_dependencies (id, source_id, target_id, kind, weight, reason) VALUES ({id_val}, {source_id}, {target_id}, '{kind}', {weight}, '{reason}');"
        sqlite_inserts.append(sql)

    # Write output
    header = f"""-- SQLite-compatible infrastructure_dependencies
-- Converted from {pg_dump_path.name}
-- {len(sqlite_inserts)} dependency rows

"""

    output_path.write_text(header + "\n".join(sqlite_inserts) + "\n")

    return len(sqlite_inserts)


if __name__ == "__main__":
    print(f"Reading: {PG_DUMP}")
    print(f"Output: {OUTPUT}")

    if not PG_DUMP.exists():
        print(f"ERROR: {PG_DUMP} not found", file=sys.stderr)
        sys.exit(1)

    count = convert_pg_dump_to_sqlite(PG_DUMP, OUTPUT)
    print(f"Converted {count} dependency rows to SQLite format")
