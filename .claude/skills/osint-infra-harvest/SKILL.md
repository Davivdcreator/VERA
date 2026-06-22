---
name: osint-infra-harvest
description: Harvest real public-infrastructure assets (hospitals, power plants, substations, water works, major bridges) for a target city from OpenStreetMap via the Overpass API, then normalize them to VERA's asset schema. Use when populating or refreshing the set of infrastructure objects for a region.
---

# OSINT Infrastructure Harvest (OpenStreetMap / Overpass)

Produce a clean, de-duplicated list of ~N **named** public-infrastructure assets for a target region — each with coordinates, a VERA type, and raw OSM tags. This is the backbone every other agent builds on. Never invent assets; only harvest real OSM objects.

## Endpoint
`GET/POST https://overpass-api.de/api/interpreter` with `data=<Overpass QL>`. No API key. Mirror fallback: `https://overpass.kumi.systems/api/interpreter`. Always start `[out:json][timeout:25];` and end `out center tags;` — ways/relations have **no** lat/lon without `out center`.

## Target region (Kyiv)
bbox `(50.36,30.30,50.56,30.75)` = (south,west,north,east). Alternative: `area[name="Київ"][admin_level=4]->.a;` then `(...)(area.a);`.

## Taxonomy → OSM selectors
| VERA `type`       | OSM selector |
|-------------------|--------------|
| `hospital`        | `amenity=hospital` |
| `power_plant`     | `power=plant` (read `plant:source`, `plant:output:electricity`) |
| `substation`      | `power=substation` (read `voltage`) |
| `water_works`     | `man_made=water_works` |
| `wastewater`      | `man_made=wastewater_plant` |
| `pumping_station` | `man_made=pumping_station` |
| `bridge`          | `man_made=bridge`, or `way[bridge=yes][name]` (major named crossings) |
| `heating_plant`   | `power=plant`+`plant:output:hot_water`, or `man_made=works`+`plant:method` |

## Query pattern
```overpass
[out:json][timeout:25];
(
  node["amenity"="hospital"](50.36,30.30,50.56,30.75);
  way["amenity"="hospital"](50.36,30.30,50.56,30.75);
  way["power"="plant"](50.36,30.30,50.56,30.75);
  node["power"="substation"](50.36,30.30,50.56,30.75);
  way["man_made"="water_works"](50.36,30.30,50.56,30.75);
  way["man_made"="wastewater_plant"](50.36,30.30,50.56,30.75);
  way["man_made"="bridge"](50.36,30.30,50.56,30.75);
);
out center tags;
```

## Normalize → asset schema
Per element: `osm_type` (node|way|relation), `osm_id`, `name` = `tags["name:en"] ?? tags.name ?? "<type> #<id>"` (keep native `tags.name` too), `type` (mapped), `lat`/`lng` (node: `lat`/`lon`; way/relation: `center.lat`/`center.lon`), `tags` (raw jsonb — never drop; metrics derive from these), `source="osm"`, `harvested_at=now`.

## Selection (default N=20)
1. Drop unnamed unless it's the only one of its type.
2. Guarantee coverage: ≥1 hospital, power_plant, substation, water/wastewater, bridge.
3. Prefer assets carrying `capacity`/`beds`/`voltage`/`plant:output:*` or a recognizable name.
4. De-dupe by name + ~150 m proximity (hospital campuses = many nodes).

## Output
Upsert into Supabase `assets` (conflict on `osm_type,osm_id`). If Supabase isn't configured, write `src/data/generated/assets.json`. Idempotent.

## Etiquette
One batched query (not 20 small ones); back off on 429/504; use a mirror. Keep raw tags.
