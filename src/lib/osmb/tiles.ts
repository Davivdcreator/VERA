/**
 * Tile source configuration for OSM Buildings.
 *
 * Two layers:
 *   1. BASE_TILE_URL — 2D raster basemap, rendered below buildings.
 *   2. BUILDING_TILES_URL — continuous 3D building GeoJSON tiles.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * USAGE POLICY — READ BEFORE SHIPPING TO PRODUCTION
 * ──────────────────────────────────────────────────────────────────────────
 * BASE RASTER:
 *   The OSMB docs example uses openstreetmap.fr's HOT tiles. The main OSM tile
 *   servers (tile.openstreetmap.org) have a strict usage policy that PROHIBITS
 *   heavy / commercial / bulk use and requires a valid HTTP referer + UA. For a
 *   civic dashboard that anyone but a tiny demo audience will hit, switch
 *   BASE_TILE_URL to a tile provider you are entitled to use — e.g. a self-
 *   hosted renderer, MapTiler, Stadia, or Thunderforest with an API key. Do NOT
 *   point production traffic at the public OSM tile cache.
 *
 * BUILDING TILES:
 *   The key in the OSMB docs example (`59fcc2e8`) is a SHARED DEMO KEY on
 *   data.osmbuildings.org. It is rate-limited and not guaranteed to stay up. For
 *   production you must obtain a proper OSM Buildings API key (or self-host the
 *   building tile data) and substitute it below. Treat `59fcc2e8` as demo-only.
 *
 * Override either URL at build time via Vite env vars (see vite-env.d.ts).
 * ──────────────────────────────────────────────────────────────────────────
 */

/** Demo key from the OSMB docs — replace for production. */
const OSMB_DEMO_KEY = "59fcc2e8";

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

/**
 * Create a Google **Map Tiles API** 2D *satellite* session and return a
 * {z}/{x}/{y} URL template for OSM Buildings' `addMapTiles`. Google's satellite
 * tiles send `Access-Control-Allow-Origin`, so they upload into a WebGL texture
 * fine (verified). The session lasts ~2 weeks. Returns null when no key is set
 * (the caller then falls back to BASE_TILE_URL).
 *
 * Why satellite + OSM Buildings: Google Photorealistic 3D meshes only cover a
 * handful of cities (not Kyiv), so we pair Google's satellite *imagery* with
 * OSM building footprints extruded to 3D — real 3D buildings for Kyiv.
 */
export async function googleSatelliteTileUrl(): Promise<string | null> {
  if (!GOOGLE_KEY) return null;
  try {
    const res = await fetch(`https://tile.googleapis.com/v1/createSession?key=${GOOGLE_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapType: "satellite", language: "en-US", region: "US" }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { session?: string };
    if (!data.session) return null;
    return `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${data.session}&key=${GOOGLE_KEY}`;
  } catch {
    return null;
  }
}

/**
 * Uniform building color. Passed to `addGeoJSONTiles({ color })` to override the
 * per-feature OSM `building:colour` / `building:material` colors, so the 3D
 * extrusions read as one clean massing model over the satellite imagery.
 */
export const BUILDING_COLOR = "#cdd6e3";

/** Attribution when Google satellite imagery is the basemap. */
export const GOOGLE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Imagery &copy; Google · &copy; OSM Buildings';

/**
 * 2D raster basemap. {z}/{x}/{y}. Demo-grade default; override in prod.
 *
 * MUST be a CORS-enabled tile source — OSM Buildings GL uploads each tile into a
 * WebGL texture, which fails silently (leaving the GL clear color showing, e.g.
 * a red canvas) if the server omits `Access-Control-Allow-Origin`. The previous
 * default (openstreetmap.fr HOT) does not send CORS headers and produced exactly
 * that. CARTO's basemaps send `access-control-allow-origin: *`, render reliably,
 * and need no API key for light use. We use "Positron" (light_all): a clean,
 * light cartography with clearly legible streets that the dark 3D buildings
 * contrast against.
 */
export const BASE_TILE_URL: string =
  import.meta.env.VITE_OSM_BASE_TILE_URL ??
  "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";

/** 3D building GeoJSON tiles. {s}/{z}/{x}/{y}. Uses the demo key by default. */
export const BUILDING_TILES_URL: string =
  import.meta.env.VITE_OSM_BUILDING_TILES_URL ??
  `https://{s}.data.osmbuildings.org/0.2/${OSMB_DEMO_KEY}/tile/{z}/{x}/{y}.json`;

/** Attribution string — required by OSM/ODbL + CARTO when using these sources. */
export const MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>, &copy; OSM Buildings';
