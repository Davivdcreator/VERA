/**
 * Shared data contract for VERA's infrastructure cards.
 *
 * This mirrors the `asset_cards` Supabase view (one row per asset, joining
 * state + impact + dependencies). The same shape is produced offline into
 * `src/data/generated/cards.json` as the no-backend fallback, so the UI reads
 * one type whether the source is Supabase or the generated file.
 */
export type AssetType =
  | "hospital"
  | "power_plant"
  | "substation"
  | "water_works"
  | "wastewater"
  | "pumping_station"
  | "bridge"
  | "heating_plant"
  | "telecom"
  | "other";

export type InfraStatus = "operational" | "degraded" | "offline" | "unknown";

export type DepKind = "powers" | "supplies_water" | "provides_access" | "feeds_heat" | "other";

/** A directed dependency edge in the work-tree (references another asset's id). */
export interface DepEdge {
  assetId: string;
  kind: DepKind;
  weight: number;
}

/** One piece of damage evidence behind a state (FIRMS detection / Telegram report). */
export interface Evidence {
  source: "firms" | "telegram" | "sample";
  detail: string;
  ref?: string;
  ts?: string;
}

/** A full digital-twin card — what the map pin and the card panel render. */
export interface AssetCard {
  id: string;
  osm_type: string | null;
  osm_id: number | null;
  name: string;
  name_native: string | null;
  type: AssetType;
  lat: number;
  lng: number;

  criticality: number; // 0..1
  criticality_breakdown: Record<string, number>;
  metrics: Record<string, string | number>; // type-specific (MW, beds, voltage…)
  tags: Record<string, unknown>; // raw OSM tags

  status: InfraStatus;
  state_confidence: number;
  evidence: Evidence[];

  radius_m: number | null;
  population_affected: number;
  zones: string[];

  downstream: DepEdge[]; // assets that fail if THIS fails
  upstream: DepEdge[]; // assets THIS depends on

  source?: string;
  harvested_at?: string;
}
