# Infrastructure Data Structure

This document describes the PostgreSQL data structure for the VERA infrastructure dependency graph.

## Overview

The infrastructure dataset models critical infrastructure nodes and their dependencies, enabling analysis of cascading failures and resilience planning.

## Tables

### `infrastructure`

Core table storing all infrastructure nodes with geographic coordinates.

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | Yes | Primary key |
| `name` | TEXT | Yes | Human-readable name |
| `type` | TEXT | Yes | Category: `utilities`, `transportation`, `government`, `critical` |
| `subtype` | TEXT | Yes | Specific type (see Subtypes below) |
| `location` | TEXT | No | City, State format |
| `latitude` | FLOAT | Yes | Decimal degrees (WGS84) |
| `longitude` | FLOAT | Yes | Decimal degrees (WGS84) |
| `capacity` | BIGINT | No | Type-specific capacity metric |
| `year_built` | INTEGER | No | Construction year |
| `status` | TEXT | No | `operational`, `maintenance`, `offline` |
| `metadata` | JSONB | No | Type-specific additional data |

**Indexes:**
- `idx_infrastructure_subtype` on `subtype`
- `idx_infrastructure_type` on `type`

### `dependencies`

Stores directed relationships between infrastructure nodes.

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | UUID | Yes | Primary key (auto-generated) |
| `source_id` | UUID | Yes | FK to infrastructure.id |
| `target_id` | UUID | Yes | FK to infrastructure.id |
| `relationship_type` | TEXT | Yes | Always `DEPENDS_ON` |
| `dependency_reason` | TEXT | No | `proximity` or `random` |

**Indexes:**
- `idx_dependencies_source` on `source_id`
- `idx_dependencies_target` on `target_id`

## Infrastructure Subtypes

### Utilities
- `power_plant` — Power generation (capacity: MW)
- `substation` — Power distribution (capacity: MVA)
- `water_treatment` — Water purification (capacity: MGD)
- `gas_pipeline` — Natural gas distribution (capacity: MMCF/day)
- `telecom_hub` — Network switching (capacity: Gbps)
- `solar_farm` — Solar generation (capacity: MW)
- `wind_farm` — Wind generation (capacity: MW)

### Transportation
- `highway` — Major roads (capacity: vehicles/day)
- `bridge` — Road bridges (capacity: tonnes)
- `airport` — Airports (capacity: passengers/year)
- `railway` — Rail lines (capacity: trains/day)
- `port` — Seaports (capacity: TEU/year)
- `traffic_control` — Traffic management centers (capacity: intersections)

### Government
- `federal_building` — Federal facilities (capacity: employees)
- `courthouse` — Court facilities (capacity: cases/year)
- `military_base` — Military installations (capacity: personnel)
- `emergency_ops` — Emergency operations centers (capacity: response_time_min)
- `prison` — Correctional facilities (capacity: inmates)

### Critical
- `hospital` — Medical facilities (capacity: beds)
- `data_center` — Computing facilities (capacity: servers)
- `fire_station` — Fire departments (capacity: trucks)
- `police_station` — Police departments (capacity: officers)
- `school` — Educational facilities (capacity: students)

## Extending the Schema

The schema is designed to be extended. Suggested additions:

### Per-Type Columns
```sql
-- Add power plant specific fields
ALTER TABLE infrastructure ADD COLUMN fuel_type TEXT;
ALTER TABLE infrastructure ADD COLUMN operator TEXT;
ALTER TABLE infrastructure ADD COLUMN grid_connection_voltage_kv INTEGER;

-- Add medical facility specific fields
ALTER TABLE infrastructure ADD COLUMN trauma_center BOOLEAN;
ALTER TABLE infrastructure ADD COLUMN helipad BOOLEAN;
ALTER TABLE infrastructure ADD COLUMN bed_count INTEGER;
```

### Spatial Extensions
```sql
-- Add precise geometry for more accurate distance calculations
ALTER TABLE infrastructure ADD COLUMN geom GEOMETRY(Point, 4326);

-- Create spatial index
CREATE INDEX idx_infrastructure_geom ON infrastructure USING GIST(geom);
```

### Additional Relationship Types
```sql
-- Add other relationship types
ALTER TABLE dependencies ADD COLUMN relationship_type TEXT DEFAULT 'DEPENDS_ON';
-- Values: 'DEPENDS_ON', 'CONNECTED_TO', 'SUPPORTS', 'LOCATED_NEAR'
```

### Metadata Enrichment
```sql
-- Add columns derived from metadata JSONB
ALTER TABLE infrastructure ADD COLUMN owner TEXT;
ALTER TABLE infrastructure ADD COLUMN inspection_date DATE;

-- Extract from metadata:
UPDATE infrastructure SET owner = metadata->>'owner' WHERE metadata->>'owner' IS NOT NULL;
```

## Example Queries

### Find all dependencies for a specific node
```sql
SELECT i.*, d.relationship_type, d.dependency_reason
FROM dependencies d
JOIN infrastructure i ON d.target_id = i.id
WHERE d.source_id = 'uuid-here';
```

### Count dependencies by type pair
```sql
SELECT s.subtype AS source, t.subtype AS target, COUNT(*) AS count
FROM dependencies d
JOIN infrastructure s ON d.source_id = s.id
JOIN infrastructure t ON d.target_id = t.id
GROUP BY s.subtype, t.subtype
ORDER BY count DESC;
```

### Find nodes with most dependents (critical nodes)
```sql
SELECT i.name, i.subtype, COUNT(d.source_id) AS dependent_count
FROM infrastructure i
LEFT JOIN dependencies d ON d.target_id = i.id
GROUP BY i.id, i.name, i.subtype
ORDER BY dependent_count DESC;
```

### Find all hospitals and their power dependencies
```sql
SELECT h.name AS hospital, h.location, p.name AS power_plant, p.location
FROM dependencies d
JOIN infrastructure h ON d.source_id = h.id
JOIN infrastructure p ON d.target_id = p.id
WHERE h.subtype = 'hospital' AND p.subtype = 'power_plant';
```

## Current Data Statistics

- **Total nodes:** 500
- **Total dependencies:** ~189 (181 proximity + 8 random)
- **Cities covered:** 40 US cities with lat/long coordinates

