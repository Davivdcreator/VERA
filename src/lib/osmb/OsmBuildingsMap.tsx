/**
 * <OsmBuildingsMap /> — OSM Buildings GL panel over Google satellite imagery,
 * locked to the configured region (Kyiv). This is the "real 3D for any city"
 * combo: Google's 2D satellite tiles as the ground + OSM building footprints
 * extruded to 3D (Google's photorealistic 3D meshes don't cover Kyiv).
 *
 *   - mode="2d": tilt 0, satellite only (flat).
 *   - mode="3d": tilt ~45, satellite + extruded OSM buildings.
 *
 * Markers: OSMB has no marker/projection API, so we project each lat/lng to a
 * pixel from getBounds() + getSize() and draw a clickable HTML pin over the
 * canvas, re-projecting on every `change`. Exact top-down (2D); a close
 * approximation under 3D tilt.
 *
 * StrictMode-safe; the container MUST have an explicit height.
 */
import { useEffect, useRef, useState } from "react";
import { loadOsmBuildings } from "./loader";
import type { LatLng, OSMBuildingsMap } from "./osmbuildings";
import type { DamageZone } from "@/lib/data/damage";
import {
  BASE_TILE_URL,
  BUILDING_COLOR,
  BUILDING_TILES_URL,
  GOOGLE_ATTRIBUTION,
  MAP_ATTRIBUTION,
  googleSatelliteTileUrl,
} from "./tiles";
import {
  REGION_CENTER,
  REGION_DEFAULT_ZOOM,
  REGION_MAX_ZOOM,
  REGION_MIN_ZOOM,
  TILT_2D,
  TILT_3D,
  clampToRegion,
} from "@/config/region";

/** A geo-located pin to overlay on the map. Color is resolved by the caller. */
export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;
  label?: string;
}

type ProjectedMarker = MapMarker & { x: number; y: number };

interface ProjectedZone extends DamageZone {
  x: number;
  y: number;
  /** Damage circle radius in CSS pixels. */
  radiusPx: number;
}

export interface OsmBuildingsMapProps {
  mode: "2d" | "3d";
  center?: LatLng;
  zoom?: number;
  tilt?: number;
  rotation?: number;
  markers?: MapMarker[];
  /** Fired when an asset pin is clicked. */
  onMarkerClick?: (id: string) => void;
  /** Show the extruded OSM 3D buildings layer (satellite stays either way). */
  showBuildings?: boolean;
  /** Damage zones to draw as translucent red circles over the map. */
  zones?: DamageZone[];
  /** Imperative fly-to: when this object changes, recentre/zoom the camera here. */
  focus?: { lat: number; lng: number; zoom?: number } | null;
  /** Id of the damage zone to emphasize (e.g. the one a user just clicked). */
  highlightZoneId?: string | null;
  className?: string;
}

const CLAMP_THROTTLE_MS = 80;

/** Axis-aligned geographic box derived from the map's view bounds. */
type BBox = { south: number; west: number; north: number; east: number };

/**
 * Normalise OSM Buildings' getBounds() into an axis-aligned {south,west,north,east}.
 *
 * OSMB 4.1.1 returns the *view polygon* as four corner points
 * (`{ longitude, latitude }[]`), NOT the flat `[south, west, north, east]` tuple
 * the older docs (and our .d.ts) describe. Treating the corners as numbers makes
 * every `Number.isFinite` check fail, so marker/zone projection silently bailed
 * and nothing drew. We accept BOTH shapes and, for the polygon, take its bounding
 * box — exact top-down (2D), a close approximation under 3D tilt. Returns null if
 * the bounds aren't readable yet (camera not ready).
 */
function boundsToBox(raw: unknown): BBox | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  // Flat numeric tuple form: [south, west, north, east].
  if (typeof raw[0] === "number") {
    const [south, west, north, east] = raw as number[];
    return [south, west, north, east].every(Number.isFinite)
      ? { south, west, north, east }
      : null;
  }
  // Corner-point form: { longitude, latitude }[].
  const lats: number[] = [];
  const lngs: number[] = [];
  for (const p of raw as Array<{ latitude?: number; longitude?: number }>) {
    if (!p || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return null;
    lats.push(p.latitude as number);
    lngs.push(p.longitude as number);
  }
  return {
    south: Math.min(...lats),
    north: Math.max(...lats),
    west: Math.min(...lngs),
    east: Math.max(...lngs),
  };
}

export function OsmBuildingsMap({
  mode,
  center = REGION_CENTER,
  zoom = REGION_DEFAULT_ZOOM,
  tilt,
  rotation = 0,
  markers,
  onMarkerClick,
  showBuildings = true,
  zones,
  focus,
  highlightZoneId,
  className = "",
}: OsmBuildingsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [projected, setProjected] = useState<ProjectedMarker[]>([]);
  const [projectedZones, setProjectedZones] = useState<ProjectedZone[]>([]);
  // Hides the WebGL canvas behind a neutral cover until OSMB fires its first
  // "load" (tiles painted). OSM Buildings' un-painted canvas reads as a solid
  // RED wash during every (re)init; the cover is what stops the "flashing red".
  const [tilesReady, setTilesReady] = useState(false);

  // Live refs so marker changes re-project WITHOUT re-initialising the map
  // (which would recreate the WebGL context + a fresh Google tile session).
  const mapRef = useRef<OSMBuildingsMap | null>(null);
  const projectRef = useRef<(() => void) | null>(null);
  const markersRef = useRef<MapMarker[] | undefined>(markers);
  markersRef.current = markers;
  const zonesRef = useRef<DamageZone[] | undefined>(zones);
  zonesRef.current = zones;
  const projectZonesRef = useRef<(() => void) | null>(null);
  // Handle for the OSM buildings layer, so we can add/remove it on toggle.
  const buildingsLayerRef = useRef<unknown>(null);
  const showBuildingsRef = useRef(showBuildings);
  showBuildingsRef.current = showBuildings;

  // Latest camera props, read by the (mount-once) init effect via refs so that
  // changing them — above all `mode` (2D/3D) — NO LONGER rebuilds the whole map.
  // A rebuild recreates the WebGL context (red flash) and spins up a fresh
  // Google tile session; `mode` now drives tilt imperatively (separate effect).
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const tiltRef = useRef(tilt);
  tiltRef.current = tilt;
  const centerRef = useRef(center);
  centerRef.current = center;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const rotationRef = useRef(rotation);
  rotationRef.current = rotation;

  useEffect(() => {
    let map: OSMBuildingsMap | null = null;
    let cancelled = false;
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    let onChange: (() => void) | null = null;
    let onLoad: (() => void) | null = null;
    let project: (() => void) | null = null;
    let projectZones: (() => void) | null = null;
    let rafId = 0;
    let revealTimer: ReturnType<typeof setTimeout> | null = null;

    // Fresh map instance → cover it until the first paint (no red flash).
    setTilesReady(false);

    // Load the OSMB engine and create a Google satellite session in parallel.
    Promise.all([loadOsmBuildings(), googleSatelliteTileUrl()])
      .then(([OSMBuildings, satUrl]) => {
        if (cancelled || !containerRef.current) return;

        const start = clampToRegion(centerRef.current, zoomRef.current);
        const effectiveTilt =
          tiltRef.current ?? (modeRef.current === "3d" ? TILT_3D : TILT_2D);

        map = new OSMBuildings({
          container: containerRef.current,
          position: start.position,
          zoom: start.zoom,
          minZoom: REGION_MIN_ZOOM,
          maxZoom: REGION_MAX_ZOOM,
          tilt: effectiveTilt,
          rotation: rotationRef.current,
          attribution: satUrl ? GOOGLE_ATTRIBUTION : MAP_ATTRIBUTION,
        });
        mapRef.current = map;

        // Reveal the canvas only once OSMB has painted its first tiles. The
        // fallback timer guarantees we never strand the cover if "load" is
        // missed (e.g. fully-cached tiles, or a layer that never fires it).
        onLoad = () => {
          if (revealTimer) {
            clearTimeout(revealTimer);
            revealTimer = null;
          }
          setTilesReady(true);
          // First paint done → getBounds()/getSize() are valid now. Re-project
          // overlays in case marker/zone data arrived BEFORE the map was ready:
          // at that point the projection bailed on non-finite bounds and, on an
          // idle map, nothing else would have re-triggered it (zones never drew).
          project?.();
          projectZones?.();
        };
        map.on("load", onLoad);
        // Fallback if "load" is missed (cached tiles, etc.): reveal AND project.
        revealTimer = setTimeout(() => {
          setTilesReady(true);
          project?.();
          projectZones?.();
        }, 2500);

        // Ground: Google satellite (CORS-enabled) → falls back to CARTO if no key.
        map.addMapTiles(satUrl ?? BASE_TILE_URL);

        // 3D extruded OSM buildings — uniform color, toggled independently of tilt.
        if (showBuildingsRef.current) {
          buildingsLayerRef.current = map.addGeoJSONTiles(BUILDING_TILES_URL, {
            color: BUILDING_COLOR,
          });
        }

        // ── Region clamp (OSMB has no maxBounds) ──────────────────────────
        let applying = false;
        const isFinitePos = (p: unknown): p is LatLng =>
          !!p &&
          typeof p === "object" &&
          Number.isFinite((p as LatLng).latitude) &&
          Number.isFinite((p as LatLng).longitude);

        const enforce = () => {
          throttleTimer = null;
          if (!map || applying) return;
          let pos: LatLng | undefined;
          let z: number | undefined;
          try {
            pos = map.getPosition();
            z = map.getZoom();
          } catch {
            return;
          }
          if (!isFinitePos(pos) || !Number.isFinite(z)) return;
          const result = clampToRegion(pos, z as number);
          if (!result.changed) return;
          if (
            !Number.isFinite(result.position.latitude) ||
            !Number.isFinite(result.position.longitude) ||
            !Number.isFinite(result.zoom)
          ) {
            return;
          }
          applying = true;
          try {
            map.setPosition(result.position);
            map.setZoom(result.zoom);
          } catch {
            /* transient setter failure must not kill the loop */
          } finally {
            applying = false;
          }
        };

        onChange = () => {
          if (throttleTimer || applying) return;
          throttleTimer = setTimeout(enforce, CLAMP_THROTTLE_MS);
        };
        map.on("change", onChange);

        // ── Marker projection (reads the latest markers via ref) ──────────
        project = () => {
          if (!map) return;
          const ms = markersRef.current;
          if (!ms || ms.length === 0) {
            setProjected([]);
            return;
          }
          let box: BBox | null;
          let size: { width: number; height: number };
          try {
            box = boundsToBox(map.getBounds());
            size = map.getSize();
          } catch {
            return;
          }
          if (!box || !size || box.east === box.west || box.north === box.south) {
            return;
          }
          const { south, west, north, east } = box;
          const { width: w, height: h } = size;
          const next: ProjectedMarker[] = [];
          for (const m of ms) {
            const x = ((m.lng - west) / (east - west)) * w;
            const y = ((north - m.lat) / (north - south)) * h;
            if (x < -40 || x > w + 40 || y < -40 || y > h + 40) continue;
            next.push({ ...m, x, y });
          }
          setProjected(next);
        };
        projectRef.current = project;
        map.on("change", project);
        map.on("resize", project);

        // ── Zone projection (damage circles) ─────────────────────────────
        projectZones = () => {
          if (!map) return;
          const zs = zonesRef.current;
          if (!zs || zs.length === 0) {
            setProjectedZones([]);
            return;
          }
          let box: BBox | null;
          let size: { width: number; height: number };
          try {
            box = boundsToBox(map.getBounds());
            size = map.getSize();
          } catch {
            return;
          }
          if (!box || !size || box.east === box.west || box.north === box.south) {
            return;
          }
          const { south, west, north, east } = box;
          const { width: w, height: h } = size;
          // metres-per-pixel derived from the lat span of the projected bbox.
          // 1 degree latitude ≈ 111_320 m (close enough for approximate circles).
          const metersPerPx = ((north - south) * 111_320) / h;
          const next: ProjectedZone[] = [];
          for (const z of zs) {
            const x = ((z.lng - west) / (east - west)) * w;
            const y = ((north - z.lat) / (north - south)) * h;
            // Guard a degenerate bbox (tiny span → metersPerPx≈0 → a runaway
            // ring). Hard-cap the pixel radius so one zone can't blanket the
            // panel. (The solid-red full-screen wash was the OSMB canvas itself
            // before tiles paint — handled by the load cover, not here.)
            const rawRadiusPx =
              Number.isFinite(metersPerPx) && metersPerPx > 0.001
                ? z.radius_m / metersPerPx
                : 0;
            const radiusPx = Math.min(rawRadiusPx, 200);
            // Cull by centre position only (fixed margin) — never by the radius.
            if (x < -120 || x > w + 120 || y < -120 || y > h + 120) continue;
            next.push({ ...z, x, y, radiusPx });
          }
          setProjectedZones(next);
        };
        projectZonesRef.current = projectZones;
        map.on("change", projectZones);
        map.on("resize", projectZones);

        rafId = requestAnimationFrame(() => { project?.(); projectZones?.(); });
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[OsmBuildingsMap] failed to initialise:", err);
      });

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (throttleTimer) clearTimeout(throttleTimer);
      if (revealTimer) clearTimeout(revealTimer);
      projectRef.current = null;
      projectZonesRef.current = null;
      mapRef.current = null;
      buildingsLayerRef.current = null;
      if (map) {
        if (onChange) map.off("change", onChange);
        if (onLoad) map.off("load", onLoad);
        if (project) {
          map.off("change", project);
          map.off("resize", project);
        }
        if (projectZones) {
          map.off("change", projectZones);
          map.off("resize", projectZones);
        }
        map.destroy();
        map = null;
      }
    };
    // Mount ONCE. Camera props (mode/center/zoom/tilt/rotation) are read via
    // refs and applied imperatively in the effects below, so toggling 2D/3D
    // never tears down and rebuilds the WebGL context (which would flash red).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-project when the marker set changes (no map rebuild).
  useEffect(() => {
    projectRef.current?.();
  }, [markers]);

  // Re-project zones when the zone set changes (no map rebuild).
  useEffect(() => {
    projectZonesRef.current?.();
  }, [zones]);

  // Imperative fly-to: recentre/zoom the camera when `focus` changes (clamped).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    const result = clampToRegion(
      { latitude: focus.lat, longitude: focus.lng },
      focus.zoom ?? 14,
    );
    try {
      map.setPosition(result.position);
      map.setZoom(result.zoom);
    } catch {
      /* ignore transient setter failure */
    }
    // Re-project overlays immediately rather than waiting for the change event.
    projectZonesRef.current?.();
    projectRef.current?.();
  }, [focus]);

  // Switch 2D/3D by changing tilt IN PLACE — no map rebuild, so no red re-init
  // flash and no redundant Google tile session per toggle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return; // map still initialising → constructor seeds the tilt
    const effectiveTilt = tilt ?? (mode === "3d" ? TILT_3D : TILT_2D);
    try {
      map.setTilt(effectiveTilt);
    } catch {
      /* ignore transient setter failure */
    }
  }, [mode, tilt]);

  // Apply rotation/bearing changes in place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.setRotation(rotation);
    } catch {
      /* ignore transient setter failure */
    }
  }, [rotation]);

  // Toggle the OSM buildings layer live — add/remove without rebuilding the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return; // map still initialising → init() adds it from the ref
    if (showBuildings && !buildingsLayerRef.current) {
      buildingsLayerRef.current = map.addGeoJSONTiles(BUILDING_TILES_URL, {
        color: BUILDING_COLOR,
      });
    } else if (!showBuildings && buildingsLayerRef.current) {
      try {
        map.remove(buildingsLayerRef.current);
      } catch {
        /* ignore — layer may already be gone after a re-init */
      }
      buildingsLayerRef.current = null;
    }
  }, [showBuildings]);

  return (
    <div
      className={`relative h-full w-full ${className}`}
      style={{ minHeight: 240 }}
    >
      {/* Opaque dark backdrop BEHIND the WebGL canvas. OSMB's main scene clears
          transparent (alpha 0), and the loader maps OSMB's red placeholder clear
          to transparent too — so any un-painted frame (init, HMR reload, tile
          gaps while panning/zooming) would otherwise show the white page through
          the canvas as a flash. A dark map-loading tone keeps those frames
          neutral instead of flashing white. */}
      <div
        className="absolute inset-0 z-0"
        style={{ backgroundColor: "#0b1220" }}
        aria-hidden="true"
      />

      {/* OSM Buildings owns this element exclusively (it appends its canvas). */}
      <div ref={containerRef} className="absolute inset-0 z-[1]" />

      {/* Damage zone overlays projected over the canvas (pointer-events-none).
          The radius ring is best-effort (approximate under 3D tilt); the centre
          danger marker is fixed-size so a zone always reads clearly. */}
      {projectedZones.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[4] overflow-hidden">
          {projectedZones.map((z) => {
            const hot = !!highlightZoneId && z.id === highlightZoneId;
            const dotSize = hot ? 18 : 12;
            return (
              <div
                key={z.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${z.x}px`, top: `${z.y}px` }}
              >
                {/* Translucent damage ring (radius-scaled) */}
                <div
                  style={{
                    width: `${Math.max(z.radiusPx, dotSize + 4) * 2}px`,
                    height: `${Math.max(z.radiusPx, dotSize + 4) * 2}px`,
                    border: `2px solid rgba(220,38,38,${hot ? 0.9 : 0.55})`,
                    backgroundColor: `rgba(220,38,38,${hot ? 0.1 : 0.05})`,
                    borderRadius: "50%",
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%,-50%)",
                  }}
                />
                {/* Prominent centre danger marker (always visible, any tilt) */}
                <div
                  style={{
                    width: `${dotSize}px`,
                    height: `${dotSize}px`,
                    borderRadius: "50%",
                    backgroundColor: "#dc2626",
                    border: "2px solid #fff",
                    boxShadow: "0 1px 6px rgba(0,0,0,0.55)",
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%,-50%)",
                    animation: `vera-damage-pulse ${hot ? "1.1s" : "2.2s"} ease-out infinite`,
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Clickable, state-colored asset pins projected over the canvas. */}
      {markers && markers.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
          {projected.map((p) => (
            <div
              key={p.id}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${p.x}px`, top: `${p.y}px` }}
            >
              <button
                type="button"
                onClick={() => onMarkerClick?.(p.id)}
                aria-label={p.label ?? "asset"}
                className="pointer-events-auto block h-3.5 w-3.5 cursor-pointer rounded-full ring-2 ring-white transition-transform hover:scale-125"
                style={{ backgroundColor: p.color, boxShadow: "0 1px 4px rgba(15,23,42,0.55)" }}
              />
              {p.label && (
                <span className="pointer-events-none mt-1 max-w-[128px] truncate rounded-sm bg-surface-overlay px-1.5 py-0.5 text-[10px] font-medium text-text-primary shadow-[var(--shadow-overlay)] backdrop-blur-sm">
                  {p.label}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dark cover shown until OSMB paints its first tiles. Matches the backdrop
          tone (#0b1220) so initial load reads as a dark "map loading" state —
          never a white (or red) flash. */}
      <div
        aria-hidden={tilesReady}
        className={`pointer-events-none absolute inset-0 z-[6] flex items-center justify-center transition-opacity duration-500 ${
          tilesReady ? "opacity-0" : "opacity-100"
        }`}
        style={{ backgroundColor: "#0b1220" }}
      >
        <span className="text-xs font-medium text-slate-300">Loading map…</span>
      </div>
    </div>
  );
}

export default OsmBuildingsMap;
