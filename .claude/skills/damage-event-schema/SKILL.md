---
name: damage-event-schema
description: Data model + Supabase schema for VERA damage-detection events — geographic damage zones (FIRMS + Telegram fused) and the infrastructure assets they hit. Use when creating/altering the damage_events table or the shared DamageEvent TypeScript type.
---

# Damage-Event Schema

A damage event = an estimated damage **zone** (centre + radius) derived from fused
signals, plus the assets that fall inside it.

## Supabase table `damage_events`
| column | type | notes |
|---|---|---|
| `id` | uuid pk default gen_random_uuid() | |
| `lat`, `lng` | double precision | zone centre |
| `radius_m` | double precision | estimated damage radius |
| `severity` | double precision (0..1) | damage intensity |
| `confidence` | double precision (0..1) | source agreement |
| `source` | enum `damage_source('firms','telegram','fused','sample')` | |
| `title` | text | e.g. "Strike near Kyiv CHP-5" |
| `summary` | text | one line |
| `keywords` | text[] | matched terms |
| `evidence` | jsonb | FIRMS rows + Telegram messages (with url) |
| `affected` | jsonb | `[{assetId,name,type,estDamage,distanceM}]` |
| `detected_at` | timestamptz default now() | |

RLS: `enable row level security` + `public read` policy. Index `detected_at desc`.

## Shared TS type — `src/lib/data/damage.ts`
```ts
export type DamageSource = "firms" | "telegram" | "fused" | "sample";
export interface AffectedAsset { assetId: string; name: string; type: string; estDamage: number; distanceM: number; }
export interface DamageEvidence { source: "firms" | "telegram"; detail: string; url?: string; ts?: string; }
export interface DamageEvent {
  id: string; lat: number; lng: number; radius_m: number;
  severity: number; confidence: number; source: DamageSource;
  title: string; summary?: string; keywords: string[];
  evidence: DamageEvidence[]; affected: AffectedAsset[]; detected_at: string;
}
```

## Output
Write `supabase/migrations/0003_damage_events.sql` + `src/lib/data/damage.ts`. The
orchestrator applies the migration via the Supabase MCP — do NOT call MCP yourself.
Match the existing migration style in `supabase/migrations/0001_infrastructure.sql`.
