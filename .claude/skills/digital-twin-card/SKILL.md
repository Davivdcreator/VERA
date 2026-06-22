---
name: digital-twin-card
description: Build a simplified digital-twin "card" for each infrastructure asset — dependency work-tree, impact zone, population affected, criticality score, and type-specific metrics — all derived from real OSM tags and transparent rules. Use when generating or refreshing asset cards.
---

# Digital-Twin Card

Each asset gets one card — the "Pokémon card" of public infrastructure. Every field is **derived from real data** (OSM tags + modeled rules), never hand-invented per asset.

## Card shape
```ts
interface AssetCard {
  asset: Asset;                              // id, name, type, lat, lng, tags
  criticality: number;                       // 0..1 (+ stored breakdown)
  metrics: Record<string, string | number>; // type-specific (below)
  impact: { radiusM: number; populationAffected: number; zones: string[] };
  dependencies: { downstream: DepEdge[]; upstream: DepEdge[] }; // the work-tree
  state: { status: InfraStatus; confidence: number; evidence: Evidence[] };
}
interface DepEdge { assetId: string; kind: "powers"|"supplies_water"|"provides_access"|"feeds_heat"; weight: number; }
```

## Type metrics (from OSM tags, with type fallbacks)
- `power_plant`: `capacity_mw` (`plant:output:electricity`→MW), `source` (`plant:source`), `avg_output_mw` ≈ 0.55×capacity.
- `substation`: `voltage_kv` (`voltage`/1000), `role`.
- `hospital`: `beds` (`beds`/`capacity:beds`), `emergency`.
- `water_works`/`wastewater`: `capacity_m3_day` (`capacity`), `population_served`.
- `bridge`: `lanes`, `length_m`, `structure`, `crosses`.

## Dependency work-tree (rules, not hand-authored)
Derive edges from type + geography:
- `substation --powers--> {hospital, water_works, wastewater, pumping_station}` within service radius.
- `power_plant --powers--> substation` (nearest k).
- `water_works --supplies_water--> {hospital, district}` within radius.
- `bridge --provides_access--> assets on the opposite Dnipro bank` (river ≈ lng 30.55; compare bank side).
- `heating_plant --feeds_heat--> district`.
Edge `weight = f(distance, downstream criticality)`. Store BOTH directions: **downstream** = what fails if this fails; **upstream** = what this needs to run.

## Impact zone
`radiusM` by type (substation 3 km, power_plant 8 km, water_works 6 km, hospital 2 km, bridge 1.5 km), scaled by capacity/voltage. `zones` = districts intersected. `populationAffected` via the population model (see `data-source-integration`).

## Criticality (0..1 — transparent weighted sum; keep the breakdown)
`0.35·norm(populationAffected) + 0.30·serviceClass(type) + 0.20·dependencyFanout + 0.15·norm(capacity)`.
`serviceClass`: hospital/water 1.0, power 0.9, bridge 0.7, … A card must be able to show *why* it scored what it did.

## Output
Persist to `assets` (`criticality`, `metrics` jsonb), `asset_dependencies`, `impact_zones`. The card itself is a read-time view (`asset_cards`) joining asset + deps + impact + state — not a duplicated table.
