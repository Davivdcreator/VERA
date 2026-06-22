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
  className?: string;
}

const CLAMP_THROTTLE_MS = 80;

export function OsmBuildingsMap({
  mode,
  center = REGION_CENTER,
  zoom = REGION_DEFAULT_ZOOM,
  tilt,
  rotation = 0,
  markers,
  onMarkerClick,
  showBuildings = true,
  className = "",
}: OsmBuildingsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [projected, setProjected] = useState<ProjectedMarker[]>([]);

  // Live refs so marker changes re-project WITHOUT re-initialising the map
  // (which would recreate the WebGL context + a fresh Google tile session).
  const mapRef = useRef<OSMBuildingsMap | null>(null);
  const projectRef = useRef<(() => void) | null>(null);
  const markersRef = useRef<MapMarker[] | undefined>(markers);
  markersRef.current = markers;
  // Handle for the OSM buildings layer, so we can add/remove it on toggle.
  const buildingsLayerRef = useRef<unknown>(null);
  const showBuildingsRef = useRef(showBuildings);
  showBuildingsRef.current = showBuildings;

  useEffect(() => {
    let map: OSMBuildingsMap | null = null;
    let cancelled = false;
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    let onChange: (() => void) | null = null;
    let project: (() => void) | null = null;
    let rafId = 0;

    const effectiveTilt = tilt ?? (mode === "3d" ? TILT_3D : TILT_2D);

    // Load the OSMB engine and create a Google satellite session in parallel.
    Promise.all([loadOsmBuildings(), googleSatelliteTileUrl()])
      .then(([OSMBuildings, satUrl]) => {
        if (cancelled || !containerRef.current) return;

        const start = clampToRegion(center, zoom);

        map = new OSMBuildings({
          container: containerRef.current,
          position: start.position,
          zoom: start.zoom,
          minZoom: REGION_MIN_ZOOM,
          maxZoom: REGION_MAX_ZOOM,
          tilt: effectiveTilt,
          rotation,
          attribution: satUrl ? GOOGLE_ATTRIBUTION : MAP_ATTRIBUTION,
        });
        mapRef.current = map;

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
          let south: number, west: number, north: number, east: number;
          let size: { width: number; height: number };
          try {
            const b = map.getBounds() as number[]; // [south, west, north, east]
            [south, west, north, east] = b;
            size = map.getSize();
          } catch {
            return;
          }
          if (
            ![south, west, north, east].every(Number.isFinite) ||
            !size ||
            east === west ||
            north === south
          ) {
            return;
          }
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
        rafId = requestAnimationFrame(() => project?.());
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[OsmBuildingsMap] failed to initialise:", err);
      });

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (throttleTimer) clearTimeout(throttleTimer);
      projectRef.current = null;
      mapRef.current = null;
      buildingsLayerRef.current = null;
      if (map) {
        if (onChange) map.off("change", onChange);
        if (project) {
          map.off("change", project);
          map.off("resize", project);
        }
        map.destroy();
        map = null;
      }
    };
    // NOT re-initialising on `markers` — a separate effect re-projects instead.
  }, [mode, center, zoom, tilt, rotation]);

  // Re-project when the marker set changes (no map rebuild).
  useEffect(() => {
    projectRef.current?.();
  }, [markers]);

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
      {/* OSM Buildings owns this element exclusively (it appends its canvas). */}
      <div ref={containerRef} className="absolute inset-0" />

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
    </div>
  );
}

export default OsmBuildingsMap;
