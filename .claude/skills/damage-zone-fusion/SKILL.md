---
name: damage-zone-fusion
description: Fuse FIRMS clusters + Telegram reports into damage zones, match infrastructure assets inside each zone, estimate per-asset damage, and write damage_events + update asset_state. Use when building the detection runner.
---

# Damage-Zone Fusion + Detection Runner

Combine the two signals into damage zones and figure out which infrastructure they hit.

## Fuse → zones
- Seed zones from **FIRMS clusters** (geo-precise; `source: "firms"`).
- For each **Telegram report**: if it has coords (district centroid) within an existing zone → attach as evidence and raise `confidence` + `severity`, set `source: "fused"`; else if it has a district centroid → create a Telegram-only zone (`radius_m ≈ 2500`, lower confidence, `source: "telegram"`); location-less reports only raise global confidence.
- Zone fields: `{ lat, lng, radius_m, severity 0..1, confidence 0..1, source, title, summary, keywords, evidence }`. `severity` from FIRMS intensity boosted by corroboration; `title` like `"Strike near <nearest asset/district>"`.

## Asset matching (point-in-zone)
For each asset, haversine distance to each zone centre; if `distance ≤ radius_m` → affected. `estDamage = clamp(severity * (1 - distance/radius)^0.5, 0, 1)`. Record `{ assetId, name, type, estDamage, distanceM }`.

## Persist (orchestrator applies; runner writes via service role)
For each zone with ≥1 affected asset (or `severity ≥ 0.6`): insert into `damage_events`. For each affected asset, raise `asset_state` toward `degraded`/`offline` (take the max with the existing state) and append evidence.

## Runner — `scripts/detect.mjs`
Node 22. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FIRMS_MAP_KEY`, `TELEGRAM_API_KEY`.
Imports `scripts/sources/firms.mjs` + `scripts/sources/telegram.mjs` (skills firms-fire-detection / telegram-keyword-osint). Pipeline: fetch FIRMS + Telegram → fuse → match assets → write. **Sample mode**: with no FIRMS/Telegram keys, emit 2–3 realistic zones near high-criticality assets (CHP-5/CHP-6/Centralna) so the UI works. Writes via `@supabase/supabase-js` with the service-role key; clears prior auto events (e.g. `delete where source != 'sample'` then insert) so it's re-runnable. Reuse the asset list from Supabase or `src/data/generated/cards.json`.
