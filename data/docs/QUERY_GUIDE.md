# VERA Database Query Guide

Guide for querying infrastructure and dependency relationships in the VERA PostgreSQL database.

## Database Connection

```bash
psql -h localhost -U postgres -d infra
```

## Tables Overview

### `infrastructure`
Main table containing all infrastructure assets from `kyiv_infrastructure.csv`.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Asset name |
| type | infra_type | Category: `transportation`, `critical`, `government`, `utilities` |
| subtype | text | Specific type (e.g., `hospital`, `substation`, `bus_stop`) |
| location | text | Location name |
| latitude | double precision | Y coordinate |
| longitude | double precision | X coordinate |
| capacity | text | Capacity info |
| year_built | text | Build year |
| status | text | Status string |
| metadata | jsonb | Raw OSM tags |

### `infrastructure_dependencies`
Directed edges representing dependencies between infrastructure assets.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| source_id | uuid | FK to source infrastructure |
| target_id | uuid | FK to target infrastructure |
| kind | text | Dependency type (e.g., `powers`, `supplies_water`) |
| weight | double precision | Dependency strength (0-1) |
| reason | text | How derived: `proximity`, `random`, `manual` |

## Common Queries

### Find All Infrastructure by Type

```sql
-- All hospitals
SELECT * FROM infrastructure WHERE subtype = 'hospital';

-- All substations
SELECT * FROM infrastructure WHERE subtype = 'substation';

-- Count by type
SELECT type, subtype, count(*) FROM infrastructure GROUP BY type, subtype ORDER BY count(*) DESC;
```

### Find What an Asset Depends On (Downstream)

```sql
-- What does a specific hospital depend on?
SELECT
  i.*,
  d.kind,
  d.weight,
  d.reason
FROM infrastructure_dependencies d
JOIN infrastructure i ON i.id = d.target_id
WHERE d.source_id = '723ffb97-63c0-5d3b-9be6-d460e894421c';
```

### Find What Depends on an Asset (Upstream)

```sql
-- What depends on a specific substation?
SELECT
  i.*,
  d.kind,
  d.weight,
  d.reason
FROM infrastructure_dependencies d
JOIN infrastructure i ON i.id = d.source_id
WHERE d.target_id = '723ffb97-63c0-5d3b-9be6-d460e894421c';
```

### Find All Dependencies for an Asset (Both Directions)

```sql
-- Combined upstream and downstream for an asset
WITH downstream AS (
  SELECT target_id as related_id, kind, weight, 'downstream' as direction
  FROM infrastructure_dependencies
  WHERE source_id = '723ffb97-63c0-5d3b-9be6-d460e894421c'
),
upstream AS (
  SELECT source_id as related_id, kind, weight, 'upstream' as direction
  FROM infrastructure_dependencies
  WHERE target_id = '723ffb97-63c0-5d3b-9be6-d460e894421c'
)
SELECT
  i.name,
  i.subtype,
  i.latitude,
  i.longitude,
  d.direction,
  d.kind,
  d.weight
FROM (
  SELECT * FROM downstream
  UNION ALL
  SELECT * FROM upstream
) d
JOIN infrastructure i ON i.id = d.related_id;
```

### Find Assets by Dependency Kind

```sql
-- All "powers" dependencies
SELECT
  src.name as source,
  src.subtype as source_type,
  tgt.name as target,
  tgt.subtype as target_type,
  d.weight
FROM infrastructure_dependencies d
JOIN infrastructure src ON src.id = d.source_id
JOIN infrastructure tgt ON tgt.id = d.target_id
WHERE d.kind = 'powers'
LIMIT 20;

-- All dependencies by kind
SELECT kind, count(*) FROM infrastructure_dependencies GROUP BY kind ORDER BY count(*) DESC;
```

### Find Critical Infrastructure (Most Depended-On Assets)

```sql
-- Assets that other infrastructure depends on most (most upstream)
-- These are the critical nodes in the dependency network
SELECT
  i.name,
  i.subtype,
  count(d.id) as upstream_count
FROM infrastructure i
LEFT JOIN infrastructure_dependencies d ON d.target_id = i.id
GROUP BY i.id, i.name, i.subtype
ORDER BY upstream_count DESC
LIMIT 10;
```

### Find Substations Powering Most Assets

```sql
-- Substations that power the most things (critical power infrastructure)
SELECT
  i.name,
  i.subtype,
  count(d.source_id) as assets_powered
FROM infrastructure i
JOIN infrastructure_dependencies d ON d.target_id = i.id AND d.kind = 'powers'
WHERE i.subtype = 'substation'
GROUP BY i.id, i.name, i.subtype
ORDER BY assets_powered DESC
LIMIT 10;
```

### Find Assets Most Dependent on Others

```sql
-- Assets that depend on the most other assets (most downstream)
-- Useful for understanding which assets have the most dependencies
SELECT
  i.name,
  i.subtype,
  count(d.id) as downstream_count
FROM infrastructure i
LEFT JOIN infrastructure_dependencies d ON d.source_id = i.id
GROUP BY i.id, i.name, i.subtype
ORDER BY downstream_count DESC
LIMIT 10;
```

### Find Assets by Location/Area

```sql
-- Assets in a bounding box (Kyiv area example)
SELECT * FROM infrastructure
WHERE latitude BETWEEN 50.3 AND 50.6
  AND longitude BETWEEN 30.2 AND 30.7;

-- Assets in a specific district
SELECT * FROM infrastructure WHERE location = 'Kyiv';
```

### Find Critical Infrastructure (Substations with Most Downstream)

```sql
-- Substations that power the most things
SELECT
  i.name,
  i.subtype,
  count(d.source_id) as assets_powered
FROM infrastructure i
JOIN infrastructure_dependencies d ON d.target_id = i.id AND d.kind = 'powers'
WHERE i.subtype = 'substation'
GROUP BY i.id, i.name, i.subtype
ORDER BY assets_powered DESC
LIMIT 10;
```

### Dependency Chain Analysis

```sql
-- Find hospitals that are 2+ hops away from power sources
WITH direct_power AS (
  SELECT source_id
  FROM infrastructure_dependencies
  WHERE target_id IN (
    SELECT id FROM infrastructure WHERE subtype = 'substation'
  )
  AND kind = 'powers'
)
SELECT DISTINCT i.name, i.subtype
FROM infrastructure i
WHERE i.subtype = 'hospital'
  AND i.id NOT IN (SELECT source_id FROM direct_power);
```

## Dependency Functions

### Seed All Dependencies

```sql
SELECT seed_infrastructure_dependencies();
```

### Clear All Dependencies

```sql
SELECT clear_infrastructure_dependencies();
```

### Create Proximity-Based Dependencies

```sql
-- For each source_subtype, find closest target_subtype and create dependency
SELECT calculate_dependencies_proximity(
  'hospital',      -- source subtype
  'substation',    -- target subtype
  'powers'         -- dependency kind
);
```

### Create Random Dependencies

```sql
-- Randomly create dependencies based on ratio, within max_distance
SELECT calculate_dependencies_random(
  'clinic',        -- source subtype
  'substation',    -- target subtype
  0.5,             -- max_distance (degrees, ~50km)
  0.3,             -- ratio (30% chance per asset)
  'powers'         -- dependency kind
);
```

## Coordinate Distance

The database uses Euclidean distance for proximity calculations. To convert to approximate kilometers:

```sql
-- 1 degree latitude ≈ 111 km
-- 1 degree longitude at Kyiv's latitude ≈ 73 km

-- Example: find assets within ~5km of a point
SELECT * FROM infrastructure
WHERE sqrt(
  power(latitude - 50.45, 2) +
  power((longitude - 30.52) * 0.66, 2)  -- longitude correction
) < 0.045;  -- ≈ 5km
```

## Quick Stats

```sql
-- Total infrastructure
SELECT count(*) FROM infrastructure;

-- Total dependencies
SELECT count(*) FROM infrastructure_dependencies;

-- Breakdown by type
SELECT type, count(*) FROM infrastructure GROUP BY type ORDER BY count(*) DESC;

-- Breakdown by dependency kind
SELECT kind, reason, count(*) FROM infrastructure_dependencies GROUP BY kind, reason ORDER BY count(*) DESC;
```
