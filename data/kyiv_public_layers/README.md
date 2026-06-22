# Kyiv Public Layers

Downloaded public OpenStreetMap-derived layers for Kyiv graph prototyping.

## Files

- `kyiv_public_facilities_redacted.csv`: public/civic facility records with stable `facility_id`, category, name/address fields, coarse `grid_id`, and blank power-dependency fields for authorized manual enrichment.
- `kyiv_public_facility_grid_counts.csv`: aggregate facility counts by coarse grid cell, category, and subtype.
- `kyiv_power_infrastructure_aggregate.csv`: aggregate OSM power infrastructure counts only. It intentionally contains no exact names, coordinates, or dependencies.
- `graph_seed_edges.csv`: starter graph edge patterns.
- `metadata.json`: source, bbox, grid size, timestamp, and safety notes.

## Manual Power Fields

Use these columns in `kyiv_public_facilities_redacted.csv` when adding authorized internal data:

- `power_source_id`: internal ID for a plant, feeder, substation, or approved abstract source node.
- `power_source_name`: optional human-readable internal name.
- `power_zone_id`: service zone or circuit grouping used by your model.
- `power_connection_type`: direct, feeder, district_zone, backup_only, unknown, etc.
- `backup_power`: yes/no/unknown.
- `backup_power_capacity_kw`: numeric capacity when available.
- `dependency_confidence`: confirmed, inferred, estimated, unknown.
- `dependency_notes`: bounded internal note.

The downloader script is at `scripts/download_kyiv_public_layers.py`.
