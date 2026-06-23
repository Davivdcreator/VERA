/**
 * loadCards — data-layer bridge for VERA asset cards.
 *
 * By default this loads the full Kyiv infrastructure database. If Supabase is
 * configured, it pages through the `infrastructure` table. Otherwise it
 * dynamically imports the generated full-database JSON fallback.
 *
 * Set VITE_ASSET_SOURCE=curated to use the old 20-card digital-twin sample.
 *
 * Also exports the shared STATE_COLOR map and the cardsToMarkers helper so that
 * the pin layer, the card panel, and the map legend all read from one source.
 */
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { AssetCard, InfraStatus } from "@/lib/data/types";
import type { MapMarker } from "@/lib/osmb/OsmBuildingsMap";
import type { DamageEvent } from "@/lib/data/damage";

const PAGE_SIZE = 1000;
const assetSource = import.meta.env.VITE_ASSET_SOURCE as string | undefined;

interface InfrastructureRow {
  id: string;
  name: string;
  type: string;
  subtype: string;
  location: string | null;
  latitude: number;
  longitude: number;
  capacity: string | null;
  year_built: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  real?: boolean | null;
}

/** Infrastructure-state → marker / UI color (hex). Single source of truth. */
export const STATE_COLOR: Record<InfraStatus, string> = {
  operational: "#1F9D58",
  degraded:    "#B9791C",
  offline:     "#D23B40",
  unknown:     "#64728C",
};

function statusFromDb(value: string | null | undefined): InfraStatus {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "offline" || raw === "critical") return "offline";
  if (raw === "degraded" || raw === "maintenance") return "degraded";
  if (raw === "unknown") return "unknown";
  return "operational";
}

function assetTypeFromSubtype(subtype: string): AssetCard["type"] {
  if (subtype === "hospital") return "hospital";
  if (subtype === "substation") return "substation";
  if (subtype === "power_plant") return "power_plant";
  if (subtype === "water_treatment" || subtype === "water_works") return "water_works";
  if (subtype === "wastewater" || subtype === "wastewater_plant") return "wastewater";
  if (subtype === "water_pump_station" || subtype === "pumping_station") return "pumping_station";
  if (subtype === "bridge") return "bridge";
  if (subtype === "heating_plant") return "heating_plant";
  if (subtype === "telecom_hub") return "telecom";
  return "other";
}

function inferZone(lat: number, lng: number): string {
  if (lat > 50.5 && lng < 30.55) return "Obolon";
  if (lat > 50.5 && lng >= 30.55) return "Desna";
  if (lat > 50.46 && lng < 30.45) return "Sviatoshyn";
  if (lat > 50.46 && lng < 30.55) return "Shevchenko";
  if (lat > 50.46) return "Dnipro";
  if (lat > 50.43 && lng < 30.5) return "Solomianskyi";
  if (lat > 50.43 && lng < 30.55) return "Pechersk";
  if (lat > 50.43) return "Darnytsia";
  if (lng < 30.55) return "Holosiiv";
  return "Darnytsia";
}

function serviceClass(dbType: string, subtype: string): number {
  const subtypeScores: Record<string, number> = {
    hospital: 1,
    clinic: 0.78,
    pharmacy: 0.62,
    fire_station: 0.86,
    police: 0.82,
    school: 0.72,
    kindergarten: 0.68,
    university: 0.68,
    substation: 0.86,
    railway: 0.72,
    bus_stop: 0.42,
    post_office: 0.48,
    supermarket: 0.66,
    water_fountain: 0.45,
  };
  return subtypeScores[subtype] ?? (dbType === "critical" ? 0.58 : dbType === "utilities" ? 0.72 : 0.42);
}

function radiusForSubtype(subtype: string): number {
  const radii: Record<string, number> = {
    hospital: 2000,
    clinic: 1200,
    pharmacy: 800,
    fire_station: 2200,
    police: 2000,
    school: 1400,
    kindergarten: 1200,
    university: 1600,
    substation: 2500,
    railway: 1800,
    bus_stop: 500,
    post_office: 900,
    supermarket: 1000,
    water_fountain: 500,
  };
  return radii[subtype] ?? 900;
}

function rowToAssetCard(row: InfrastructureRow): AssetCard {
  const status = statusFromDb(row.status);
  const metadata = row.metadata ?? {};
  const radius = radiusForSubtype(row.subtype);
  const radiusKm = radius / 1000;
  const populationAffected = Math.round(3300 * Math.PI * radiusKm * radiusKm);
  const service = serviceClass(row.type, row.subtype);
  const statusBoost = status === "offline" ? 0.3 : status === "degraded" ? 0.16 : status === "unknown" ? 0.06 : 0;
  const tagBoost = Math.min(0.14, Object.keys(metadata).length / 120);
  const criticality = Math.min(1, +(0.18 + service * 0.5 + statusBoost + tagBoost).toFixed(4));
  const nativeName = metadata["name:uk"];

  return {
    id: row.id,
    osm_type: null,
    osm_id: null,
    name: row.name,
    name_native: typeof nativeName === "string" && nativeName !== row.name ? nativeName : null,
    type: assetTypeFromSubtype(row.subtype),
    lat: row.latitude,
    lng: row.longitude,
    criticality,
    criticality_breakdown: {
      population_component: +(Math.min(0.25, (populationAffected / 500000) * 0.35)).toFixed(4),
      service_class: +(service * 0.3).toFixed(4),
      dependency_fanout: 0,
      capacity_component: row.capacity ? 0.05 : 0,
      total: criticality,
    },
    metrics: {
      source_type: row.type,
      subtype: row.subtype,
      capacity: row.capacity ?? "unknown",
      year_built: row.year_built ?? "unknown",
    },
    tags: metadata,
    status,
    state_confidence: row.status ? 0.82 : 0.55,
    evidence: [{
      source: "sample",
      detail: row.status
        ? `Database status: ${row.status}`
        : "Loaded from full Kyiv infrastructure database",
    }],
    radius_m: radius,
    population_affected: populationAffected,
    zones: [row.location || inferZone(row.latitude, row.longitude)],
    downstream: [],
    upstream: [],
    source: row.real === false ? "synthetic-db" : "kyiv-infrastructure-db",
  };
}

async function loadCuratedAssetCards(): Promise<AssetCard[]> {
  const mod = await import("@/data/generated/cards.json");
  return (mod.default ?? mod) as unknown as AssetCard[];
}

async function loadFullGeneratedAssetCards(): Promise<AssetCard[]> {
  const mod = await import("@/data/generated/full-infrastructure-cards.json");
  return (mod.default ?? mod) as unknown as AssetCard[];
}

async function loadInfrastructureFromSupabase(): Promise<AssetCard[] | null> {
  if (!supabase) return null;

  const rows: InfrastructureRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("infrastructure")
      .select("id,name,type,subtype,location,latitude,longitude,capacity,year_built,status,metadata,real")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("[VERA] Supabase infrastructure fetch error:", error.message);
      return null;
    }

    const page = (data ?? []) as InfrastructureRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows.map(rowToAssetCard);
}

/**
 * Load all asset cards.
 * - Default: full infrastructure database.
 * - VITE_ASSET_SOURCE=curated: old 20-card generated sample.
 */
export async function loadAssetCards(): Promise<AssetCard[]> {
  if (assetSource === "curated") {
    return loadCuratedAssetCards();
  }

  if (isSupabaseConfigured && supabase) {
    const data = await loadInfrastructureFromSupabase();
    if (data?.length) return data;
  }

  try {
    return await loadFullGeneratedAssetCards();
  } catch (error) {
    console.error("[VERA] full infrastructure fallback missing; using curated sample:", error);
    return loadCuratedAssetCards();
  }
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
