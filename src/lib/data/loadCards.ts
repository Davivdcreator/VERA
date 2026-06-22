/**
 * loadCards — data-layer bridge for VERA asset cards.
 *
 * If Supabase is configured, fetches the `asset_cards` view (20 real Kyiv rows).
 * Otherwise dynamically imports the generated fallback JSON so the build bundle
 * stays lean (the JSON is only loaded when actually needed offline).
 *
 * Also exports the shared STATE_COLOR map and the cardsToMarkers helper so that
 * the pin layer, the card panel, and the map legend all read from one source.
 */
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { AssetCard, InfraStatus } from "@/lib/data/types";
import type { MapMarker } from "@/lib/osmb/OsmBuildingsMap";
import type { DamageEvent } from "@/lib/data/damage";

/** Infrastructure-state → marker / UI color (hex). Single source of truth. */
export const STATE_COLOR: Record<InfraStatus, string> = {
  operational: "#1F9D58",
  degraded:    "#B9791C",
  offline:     "#D23B40",
  unknown:     "#64728C",
};

/**
 * Load all asset cards.
 * - With Supabase: selects all columns from the `asset_cards` view.
 * - Without Supabase: lazy-imports `src/data/generated/cards.json`.
 */
export async function loadAssetCards(): Promise<AssetCard[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from("asset_cards").select("*");
    if (error) {
      console.error("[VERA] Supabase fetch error:", error.message);
      // Fall through to the offline bundle.
    } else if (data) {
      return data as AssetCard[];
    }
  }

  // Offline / no-backend fallback.
  const mod = await import("@/data/generated/cards.json");
  return (mod.default ?? mod) as unknown as AssetCard[];
}

/**
 * Load all damage events.
 * - With Supabase: selects all columns from `damage_events`, ordered newest-first.
 * - Without Supabase: lazy-imports `src/data/generated/damage.json`.
 */
export async function loadDamageEvents(): Promise<DamageEvent[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from("damage_events")
      .select("*")
      .order("detected_at", { ascending: false });
    if (error) {
      console.error("[VERA] Supabase damage_events fetch error:", error.message);
      // Fall through to the offline bundle.
    } else if (data) {
      return data as DamageEvent[];
    }
  }

  // Offline / no-backend fallback.
  const mod = await import("@/data/generated/damage.json");
  return (mod.default ?? mod) as unknown as DamageEvent[];
}

/**
 * Convert an array of AssetCards into MapMarker objects ready for Google3DMap.
 * Color is driven by STATUS_COLOR; label is the English asset name.
 */
export function cardsToMarkers(cards: AssetCard[]): MapMarker[] {
  return cards.map((c) => ({
    id:    c.id,
    lat:   c.lat,
    lng:   c.lng,
    color: STATE_COLOR[c.status],
    label: c.name,
  }));
}
