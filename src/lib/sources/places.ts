/**
 * Google Places API (New) enrichment adapter — STUB
 *
 * When VITE_GOOGLE_MAPS_API_KEY is set, this module can enrich VERA assets
 * (hospitals, government buildings, named facilities) with authoritative names,
 * addresses, and operational status from Google Places.
 *
 * Real endpoints (for future implementation):
 *
 *   POST https://places.googleapis.com/v1/places:searchText
 *   POST https://places.googleapis.com/v1/places:searchNearby
 *
 *   Required headers:
 *     X-Goog-Api-Key: <VITE_GOOGLE_MAPS_API_KEY>
 *     X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,
 *                       places.location,places.types,places.regularOpeningHours
 *
 *   searchText body (example):
 *   {
 *     "textQuery": "Олександрівська лікарня Kyiv",
 *     "languageCode": "en",
 *     "locationBias": {
 *       "circle": {
 *         "center": { "latitude": 50.4501, "longitude": 30.5234 },
 *         "radius": 200
 *       }
 *     }
 *   }
 *
 *   searchNearby body (example):
 *   {
 *     "includedTypes": ["hospital", "electric_utility", "water_utility"],
 *     "locationRestriction": {
 *       "circle": {
 *         "center": { "latitude": <asset.lat>, "longitude": <asset.lng> },
 *         "radius": 150
 *       }
 *     }
 *   }
 *
 * Enrichment plan (when key is present):
 *   - For each asset of type "hospital" | "other" (or any where name_native exists):
 *     1. Call searchNearby restricted to a 150 m radius around the asset coords.
 *     2. If a match is found, update name with displayName.text (English), and
 *        attach formattedAddress + google_place_id to the asset tags.
 *   - Hospitals also get regularOpeningHours + types cross-checked.
 *
 * This stub returns the input array unchanged so the rest of the pipeline works
 * whether or not the key is configured.
 */

export interface VeraAsset {
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
  name: string;
  name_native: string | null;
  type:
    | 'hospital'
    | 'power_plant'
    | 'substation'
    | 'water_works'
    | 'wastewater'
    | 'pumping_station'
    | 'bridge'
    | 'heating_plant'
    | 'telecom'
    | 'other';
  lat: number;
  lng: number;
  tags: Record<string, string>;
}

/**
 * Enrich a list of VERA assets with Google Places data.
 *
 * Returns the original array unchanged when `VITE_GOOGLE_MAPS_API_KEY` is not
 * set (which is the case in the current environment).
 *
 * @param assets - Normalised VERA assets from the OSM harvest step.
 * @returns The same array (possibly enriched when the key is available).
 */
export async function enrichWithPlaces(assets: VeraAsset[]): Promise<VeraAsset[]> {
  const apiKey =
    typeof import.meta !== 'undefined'
      ? (import.meta as { env?: { VITE_GOOGLE_MAPS_API_KEY?: string } }).env
          ?.VITE_GOOGLE_MAPS_API_KEY
      : undefined;

  if (!apiKey) {
    // Key not configured — passthrough, no enrichment performed.
    console.debug('[places] VITE_GOOGLE_MAPS_API_KEY not set — skipping enrichment.');
    return assets;
  }

  // ── Real implementation placeholder ───────────────────────────────────────
  // TODO: iterate assets, call searchNearby per asset, merge displayName +
  // formattedAddress, attach google_place_id to tags.
  // Rate-limit to ~10 req/s; cache by osm_id to avoid redundant calls.
  console.warn('[places] Key is set but enrichment is not yet implemented.');
  return assets;
}
