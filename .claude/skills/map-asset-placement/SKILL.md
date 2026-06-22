---
name: map-asset-placement
description: Place infrastructure assets as clickable, state-colored points on VERA's 2D/3D OSM Buildings map, opening each asset's digital-twin card on click, with damaged assets shown red. Use when wiring assets and state onto the map.
---

# Map Asset Placement

Render every asset as a clickable pin on the existing OSM Buildings map; clicking opens its digital-twin card. Damaged assets glow red.

## Reuse what exists — do not rebuild the map
The map is `src/lib/google3d/Google3DMap.tsx` — Google **Photorealistic 3D Tiles** (Map Tiles API) rendered with deck.gl. It already takes `markers: MapMarker[]` (each `{ id, lat, lng, color, label }`) as a pickable `ScatterplotLayer` and fires `onMarkerClick(id)`. So:
- Build `MapMarker`s from the cards, coloring by **live state**: operational `#1F9D58`, degraded `#B9791C`, **offline/damaged `#D23B40` (red)**, unknown `#64728C` (keep one `STATE_COLOR` map shared by pin + card + legend).
- Pass `onMarkerClick` up to the dashboard to open the card panel for that asset.
- Offline assets should read at a glance (larger / brighter) — adjust the marker layer if needed, but keep the change inside `Google3DMap`.

## Data flow (nothing hardcoded)
1. SPA loads assets + cards + state from Supabase view `asset_cards` via supabase-js; falls back to `src/data/generated/*` when Supabase isn't configured.
2. Each asset → `MapMarker { id, lat, lng, color: STATE_COLOR[state], label }`.
3. Click → `setSelectedAsset(id)` → slide-in **Card panel**: criticality bar, type metrics, impact (radius + population), the **dependency work-tree** (downstream/upstream lists), and the damage evidence.
4. On card/pin hover, draw connector lines from the asset to its dependents' pins (reuse the same projection).

## Consistency
`STATE_COLOR` lives in one module; pin, card, and legend all read it. Projection is exact in 2D, approximate under 3D tilt (documented). Pins sit above the canvas (z-5), below chrome (z-10). No asset coordinates or states hardcoded in components — everything flows from the data layer.
