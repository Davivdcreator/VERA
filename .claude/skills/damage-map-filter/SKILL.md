---
name: damage-map-filter
description: Surface damage events in the VERA app — a "Damage Detections" card list and a turn-on/off map filter that draws damage zones (circles) over the map and flags affected assets. Use when wiring damage data into the UI.
---

# Damage Map Filter & Cards

Make detected damage visible: a card list + a toggleable map overlay.

## Data
Add `loadDamageEvents(): Promise<DamageEvent[]>` (in `src/lib/data/loadCards.ts` or a sibling): `supabase.from("damage_events").select("*")` when `isSupabaseConfigured`, else lazy-import `src/data/generated/damage.json`. Type from `src/lib/data/damage.ts`.

## Map filter (turn on/off) — extend the existing pattern
`OsmBuildingsMap` already projects markers via `getBounds()` + `getSize()`. Add a `zones?: DamageZone[]` prop and a **Damage** toggle in `MapPanel` chrome (mirror the existing Buildings toggle, with `onToggleDamage`). When on, for each zone draw a translucent **red circle** over the canvas — project the centre to a pixel and convert `radius_m` to pixels at the current bounds (metres-per-pixel from the projected bbox), plus a pulsing centre dot. Give affected asset pins a red ring/halo. Keep it in the HTML overlay (`pointer-events-none`), re-projecting on `change`. Exact in 2D, approximate under tilt (documented).

## Cards
A "Damage Detections" `Panel` listing events newest-first: `title`, a severity bar (heat color), `source` chip (FIRMS/Telegram/Fused), `detected_at` (relative), `keywords`, the `affected` assets (name + estDamage %), and `evidence` (FIRMS rows + Telegram messages as links). Empty state when none.

## Wiring
`Dashboard` owns `showDamage` state, loads events on mount, derives zones, passes `zones` + `showDamage` to `MapPanel`/`OsmBuildingsMap` and the events to the panel. Reuse `STATE_COLOR` / design tokens. Nothing hardcoded — all from `loadDamageEvents()`.
