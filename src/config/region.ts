/**
 * Operating-region constraint + labels.
 *
 * VERA's map is locked to a single region — currently **Kyiv**. OSM Buildings GL
 * has NO native maxBounds / setMaxBounds, so we enforce the region by clamping on
 * the `change` event: after every camera move we read getPosition()/getZoom(),
 * and if the centre has drifted outside the bbox (or zoom outside range) we snap
 * it back.
 *
 * To retarget the whole app to another city/region, change the values in this
 * one file (center, bbox, zoom envelope, labels) — everything else reads from
 * here. The asset markers + dashboard data live in src/data/ and should be moved
 * to match.
 */
import type { LatLng } from "@/lib/osmb/osmbuildings";

/** Human-facing labels for the active region. */
export const REGION = {
  name: "Kyiv",
  shortLabel: "Kyiv",
  /** Native-script secondary label shown next to the short label. */
  subLabel: "Київ",
} as const;

/** Kyiv city centre — default camera centre. */
export const REGION_CENTER: LatLng = {
  latitude: 50.4501,
  longitude: 30.5234,
};

/**
 * Axis-aligned bounding box for the Kyiv metro area (degrees), rounded outward
 * a little so the user can pan to the edges of the city without fighting the
 * clamp. Covers the city + immediate suburbs (incl. Vyshhorod / Bortnychi).
 */
export const REGION_BBOX = {
  south: 50.15,
  north: 50.65,
  west: 30.1,
  east: 30.95,
} as const;

/**
 * Zoom envelope. Kyiv metro spans ~0.85° lon / ~0.5° lat, so we keep the floor
 * city-level (anything below ~10 would show well outside the region) and the
 * ceiling modest so the 3D building tiles stay performant.
 */
export const REGION_MIN_ZOOM = 10;
export const REGION_MAX_ZOOM = 18;

/** Default zoom on first load (city overview over central Kyiv). */
export const REGION_DEFAULT_ZOOM = 11;

/** Tilt presets per render mode. */
export const TILT_2D = 0;
export const TILT_3D = 45;

export interface ClampResult {
  position: LatLng;
  zoom: number;
  /** true if either value was outside its allowed range and got corrected. */
  changed: boolean;
}

function clampNumber(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Pure clamp: given a candidate centre + zoom, return the nearest legal values.
 * Side-effect free so it is trivially unit-testable.
 */
export function clampToRegion(position: LatLng, zoom: number): ClampResult {
  const latitude = clampNumber(
    position.latitude,
    REGION_BBOX.south,
    REGION_BBOX.north,
  );
  const longitude = clampNumber(
    position.longitude,
    REGION_BBOX.west,
    REGION_BBOX.east,
  );
  const clampedZoom = clampNumber(zoom, REGION_MIN_ZOOM, REGION_MAX_ZOOM);

  const changed =
    latitude !== position.latitude ||
    longitude !== position.longitude ||
    clampedZoom !== zoom;

  return { position: { latitude, longitude }, zoom: clampedZoom, changed };
}
