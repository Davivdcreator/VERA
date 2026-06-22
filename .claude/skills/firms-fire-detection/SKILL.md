---
name: firms-fire-detection
description: Ingest NASA FIRMS thermal/fire detections for a bounding box via the area API, parse the CSV, normalize, and cluster nearby hot spots into candidate damage zones. Use when building or debugging the FIRMS side of damage detection.
---

# FIRMS Fire Detection (NASA)

Geo-precise damage signal: satellite thermal anomalies (fires/explosions burn hot).

## Endpoint
`GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{W,S,E,N}/{DAY_RANGE}/{DATE?}`
- `SOURCE`: `VIIRS_NOAA20_NRT` (375 m, preferred) · `VIIRS_SNPP_NRT` · `MODIS_NRT`
- Kyiv area: `30.10,50.15,30.95,50.65` · `DAY_RANGE` 1–5 · `DATE` optional `YYYY-MM-DD`
- CSV cols: `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight`
- Quota 5000 / 10 min per key.

## Normalize
Each row → `{ lat:+latitude, lng:+longitude, frp:+frp, confidence, acqAt: ISO(acq_date + acq_time) }`. Optionally drop `confidence === "l"` (low) when noisy.

## Cluster → candidate zones
Greedy: sort by `frp` desc; for each unclustered point, seed a cluster and absorb points within **~1.2 km**; zone `center` = frp-weighted centroid; `radius_m` = clamp(`300 + 120*sqrt(sumFrp)`, 500, 3000); `intensity` = `1 - exp(-sumFrp / 30)` (0..1).

## Output
`scripts/sources/firms.mjs` (Node 22, native `fetch`, NO deps), reading `process.env.FIRMS_MAP_KEY`:
- `export async function fetchFirmsDetections(bbox, days = 2)` → normalized rows (`[]` if no key).
- `export function clusterFirms(detections)` → `[{ lat, lng, radius_m, intensity, count, frpSum, evidence: [...] }]`.
Pure + testable; never throws on a missing key (returns `[]`).
