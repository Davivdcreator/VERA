# Database Files

This folder contains all database-related files for VERA, organized by database system.

## Structure

```
data/databases/
├── setup_db.sh                    # Master setup script (creates PG + SQLite)
│
├── pg/                            # PostgreSQL / Supabase infra DB
│   ├── data/
│   │   ├── kyiv_infrastructure.csv      # Real OSM data (~5.7MB, ~16k records)
│   │   └── fake_kyiv_infrastructure.csv # Generated test data (46 records)
│   ├── migrations/
│   │   ├── 0001_infrastructure.sql
│   │   └── 0002_dependency_functions.sql
│   ├── seed.sql
│   └── infra_backup.sql           # pg_dump as SQL
│
├── lite/                          # SQLite local fallback
│   ├── infra.db                   # SQLite database
│   ├── deps_sqlite.sql            # Dependency INSERTs (converted from PG dump)
│   ├── setup_sqlite.py            # Creates DB, loads data, seeds
│   └── convert_pg_dump_to_sqlite.py
│
└── scripts/                       # Data generation scripts
    ├── etl_kyiv.py                # ETL script → kyiv_infrastructure.csv
    └── generate_fake_infrastructure.py  # Test data generator
```

## Quick Start

To set up **both** PostgreSQL and SQLite databases from scratch:

```bash
cd data/databases
./setup_db.sh
```

This single command will:
1. Drop and recreate the PostgreSQL `infra` database
2. Apply migrations (schema + functions)
3. Load CSV data from `pg/data/kyiv_infrastructure.csv` (real OSM data)
4. Load fake test data from `pg/data/fake_kyiv_infrastructure.csv`
5. Seed infrastructure dependencies
6. Create a PostgreSQL SQL dump (`pg/infra_backup.sql`)
7. Convert the SQL dump to SQLite format (`lite/deps_sqlite.sql`)
8. Create the SQLite database (`lite/infra.db`)

## pg/ — PostgreSQL Details

### What it contains
- **migrations/** — Schema and function definitions for the infrastructure database
- **seed.sql** — Seed data for dependencies
- **infra_backup.sql** — Full pg_dump of the database for backup/restore

### Re-seeding PostgreSQL only

After modifying seed data or migrations:

```bash
cd data/databases
./setup_db.sh
```

To seed only (without recreating the database):

```bash
psql -h localhost -U postgres -d infra -c "SELECT seed_infrastructure_dependencies();"
```

## lite/ — SQLite Details

### What it contains
- **infra.db** — SQLite database file
- **deps_sqlite.sql** — Dependency rows converted from PostgreSQL pg_dump format
- **setup_sqlite.py** — Creates schema, loads CSV, loads dependencies
- **convert_pg_dump_to_sqlite.py** — Converts PG dump COPY format to SQLite INSERTs

### Setting up SQLite only

If you already have a PostgreSQL dump and just want to rebuild SQLite:

```bash
cd data/databases/lite
uv run --script convert_pg_dump_to_sqlite.py   # Convert dump
uv run --script setup_sqlite.py                 # Create SQLite DB
```

### Verify SQLite database

```bash
sqlite3 data/databases/lite/infra.db ".tables"
```

## pg/data/ — Source Data Files

### kyiv_infrastructure.csv
Real infrastructure assets for Kyiv from OpenStreetMap (~16,200 records). Loaded by both PostgreSQL and SQLite setups.

### fake_kyiv_infrastructure.csv
Generated test data for resilience testing (46 records across power_plant, heating_plant, water_pump_station, water_treatment_plant, wastewater_plant, and industrial_facility). Created by `../scripts/generate_fake_infrastructure.py`.

## scripts/ — Data Generation

### etl_kyiv.py
ETL script that processes OpenStreetMap data into the `kyiv_infrastructure.csv` format.

### generate_fake_infrastructure.py
Generates fake test infrastructure data for resilience scenarios. Run with:
```bash
python3 scripts/generate_fake_infrastructure.py
```

## Population Workflow

To regenerate data end-to-end:

1. **Run ETL** (if refreshing from OSM):
   ```bash
   cd data/databases/scripts
   uv run --script etl_kyiv.py
   ```

2. **Regenerate fake test data** (optional):
   ```bash
   cd data/databases/scripts
   python3 generate_fake_infrastructure.py
   ```

3. **Set up both databases**:
   ```bash
   cd data/databases
   ./setup_db.sh
   ```

## Environment Variables

Currently no environment variables are required for database setup. Both PostgreSQL and SQLite are configured to use local defaults:

- **PostgreSQL**: `localhost:5432`, user `postgres`, database `infra`
- **SQLite**: Local file `infra.db`

Future environment variables may include:
- `DATABASE_URL` — Connection string for PostgreSQL
- `SUPABASE_URL` / `SUPABASE_KEY` — For Supabase cloud database

## Notes

- The `supabase/` folder at the repository root is for app-level Supabase config and is not affected by this reorganization
- Application code in `src/lib/supabase.ts` and `src/lib/data/loadCards.ts` is unaffected
- The two database systems (PostgreSQL and SQLite) are kept in sync via the shared CSV and conversion scripts
