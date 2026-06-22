---
name: data-source-integration
description: Integration playbook for VERA's external data sources — OpenStreetMap/Overpass, NASA FIRMS (fire/thermal), the Valkyrie Telegram search API, and population modeling. Documents endpoints, auth, parameters, response shapes, the .env keys, and the server-side ingestion pattern. Use when wiring or debugging any external feed.
---

# Data-Source Integration Playbook

**Secrets never touch the browser.** Ingestion runs server-side (Supabase Edge Function or a Node script) using the keys below and writes rows to Supabase. The SPA only *reads* Supabase with the anon key.

## .env keys
```
# Server-side ingestion (Edge Functions / scripts) — NOT exposed to the client
FIRMS_MAP_KEY=               # https://firms.modaps.eosdis.nasa.gov/api/map_key/
TELEGRAM_API_KEY=            # Authorization header for tg-search.valkyrie.org.ua
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
# Client (SPA) — safe to expose
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## NASA FIRMS — thermal / fire (damage DETECTION)
`GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{W,S,E,N}/{DAY_RANGE}/{DATE?}`
- `SOURCE`: `VIIRS_NOAA20_NRT` (preferred, 375 m), `VIIRS_SNPP_NRT`, `MODIS_NRT`.
- `AREA`: `west,south,east,north` — Kyiv `30.30,50.36,30.75,50.56`.
- `DAY_RANGE`: 1–5. `DATE` optional `YYYY-MM-DD` (omit ⇒ most recent).
- CSV cols: `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight`.
- Quota: 5000 transactions / 10 min per key.
- Role: each row is a thermal anomaly → matched to the nearest asset by `damage-state-fusion`.

## Telegram — Valkyrie tg-search (damage CORROBORATION; returns NO coordinates)
Base `https://tg-search.valkyrie.org.ua`. Auth: `Authorization: <TELEGRAM_API_KEY>` header.
- `POST /search-telegram-messages/` body `{ fromDate, toDate, searchTerm?, searchRegex?, channelIds?, requiredTags?, nextPageToken? }` → `{ channelName, date, content, messageUrl, ... }`.
- `POST /search-telegram-channels/` — find channels by `name/title/about`.
- `GET /search-telegram-users/?usernames=...`; `POST /api/v1/lookup/username|phone`.
- No geo → use it to find text reports mentioning an asset/area **name**; geolocate via the matched asset, not the message.

## OpenStreetMap / Overpass
See skill `osint-infra-harvest`. Asset locations + tags.

## Population (no first-party API yet — model, then swap)
Now: `population_affected ≈ density(district) × impact_area_km²`, with a small district-density lookup. Later: sample a WorldPop / GHSL / Kontur population raster over the impact polygon. Keep the function pluggable behind one interface.

## Ingestion pattern (Edge Function / cron)
1. Read bbox + keys from env. 2. Fetch FIRMS CSV + Telegram messages for the window. 3. Normalize → `events` rows. 4. `damage-state-fusion` derives `asset_state`. Schedule with pg_cron / a Supabase scheduled function. **Until keys exist**, seed `events`/`asset_state` with realistic sample rows — same table shapes, so live data drops in unchanged.
