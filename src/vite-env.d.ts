/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Override the 2D raster basemap tile URL ({z}/{x}/{y}). */
  readonly VITE_OSM_BASE_TILE_URL?: string;
  /** Override the 3D building GeoJSON tile URL ({s}/{z}/{x}/{y}). */
  readonly VITE_OSM_BUILDING_TILES_URL?: string;
  /**
   * Google Maps / Places API key (New).
   * When set, src/lib/sources/places.ts enriches infrastructure assets
   * with authoritative names and addresses from Google Places.
   */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
