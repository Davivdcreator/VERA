/**
 * <OsmBuildingsMap /> — OSM Buildings GL panel over Google satellite imagery,
 * locked to the configured region (Kyiv). This is the "real 3D for any city"
 * combo: Google's 2D satellite tiles as the ground + OSM building footprints
 * extruded to 3D (Google's photorealistic 3D meshes don't cover Kyiv).
 *
 *   - mode="2d": tilt 0, satellite only (flat).
 *   - mode="3d": tilt ~45, satellite + extruded OSM buildings.
 *
 * Markers: projected through OSMB's own camera matrix (`map.project`) and drawn
 * as HTML/SVG overlays over the canvas, re-projecting on every frame while the
 * map moves. They are not depth-tested WebGL geometry, but they stay anchored
 * to the same 3D camera as the building layer.
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

export interface MapGraphNode {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  color: string;
  depth: number;
  role: "selected" | "related";
}

export interface MapGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: string;
  weight: number;
}

export interface MapGraphOverlay {
  nodes: MapGraphNode[];
  edges: MapGraphEdge[];
  depth: number;
}

interface ProjectedZone extends DamageZone {
  x: number;
  y: number;
  /** Damage circle radius in CSS pixels. */
  radiusPx: number;
}

interface ProjectedGraphNode extends MapGraphNode {
  x: number;
  y: number;
  visible: boolean;
}

interface ProjectedGraphEdge extends MapGraphEdge {
  source: ProjectedGraphNode;
  target: ProjectedGraphNode;
}

interface ProjectedGraphOverlay {
  nodes: ProjectedGraphNode[];
  edges: ProjectedGraphEdge[];
  depth: number;
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
  /** Relationship graph to draw over the map for a selected asset. */
  graph?: MapGraphOverlay | null;
  /** Imperative fly-to: when this object changes, recentre/zoom the camera here. */
  focus?: { lat: number; lng: number; zoom?: number } | null;
  /** Id of the damage zone to emphasize (e.g. the one a user just clicked). */
  highlightZoneId?: string | null;
  className?: string;
}

const CLAMP_THROTTLE_MS = 80;

function projectMapPoint(
  map: OSMBuildingsMap,
  lat: number,
  lng: number,
  altitude = 0,
): { x: number; y: number; z: number } | null {
  const point = map.project(lat, lng, altitude);
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
    ? point
    : null;
}

function projectedPointVisible(
  point: { x: number; y: number; z: number },
  size: { width: number; height: number },
  margin = 80,
): boolean {
  return (
    point.x >= -margin &&
    point.x <= size.width + margin &&
    point.y >= -margin &&
    point.y <= size.height + margin &&
    point.z >= -0.25 &&
    point.z <= 1.25
  );
}

function pointDistancePx(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
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
  graph,
  focus,
  highlightZoneId,
  className = "",
}: OsmBuildingsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Asset-pin DOM nodes, positioned imperatively (no React state in the hot
  // path) so they track the map every frame and never lag behind it — see the
  // rAF loop in the init effect.
  const markerEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const [projectedZones, setProjectedZones] = useState<ProjectedZone[]>([]);
  const [projectedGraph, setProjectedGraph] = useState<ProjectedGraphOverlay | null>(null);
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
  const graphRef = useRef<MapGraphOverlay | null | undefined>(graph);
  graphRef.current = graph;
  const projectGraphRef = useRef<(() => void) | null>(null);
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
    let positionMarkers: (() => void) | null = null;
    let projectZones: (() => void) | null = null;
    let projectGraph: (() => void) | null = null;
    let rafId = 0;
    let markerRaf = 0;
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
          // First paint done → the camera projection is valid now. Re-project
          // overlays in case marker/zone data arrived BEFORE the map was ready:
          // at that point the projection bailed on non-finite bounds and, on an
          // idle map, nothing else would have re-triggered it (zones never drew).
          positionMarkers?.();
          projectZones?.();
        };
        map.on("load", onLoad);
        // Fallback if "load" is missed (cached tiles, etc.): reveal AND project.
        revealTimer = setTimeout(() => {
          setTilesReady(true);
          positionMarkers?.();
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

        // ── Marker positioning (direct DOM writes — no React state) ───────
        // Each pin's position is written straight to its node's `transform`, so
        // pins never lag a frame behind the map (the old React-state path made
        // them "swim"). transform writes don't trigger layout, so this is cheap.
        positionMarkers = () => {
          if (!map) return;
          const ms = markersRef.current;
          if (!ms || ms.length === 0) return;
          let size: { width: number; height: number };
          try {
            size = map.getSize();
          } catch {
            return;
          }
          for (const m of ms) {
            const el = markerEls.current.get(m.id);
            if (!el) continue;
            const point = projectMapPoint(map, m.lat, m.lng);
            if (!point || !projectedPointVisible(point, size, 40)) {
              el.style.visibility = "hidden";
            } else {
              el.style.visibility = "visible";
              el.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`;
            }
          }
        };
        projectRef.current = positionMarkers;

        // Re-position pins every frame so they stay locked to the map during
        // pan/zoom/rotate (OSMB's `change` event can fire less often than it
        // renders, which is what let pins lag). Runs until unmount.
        const markerTick = () => {
          if (cancelled) return;
          positionMarkers?.();
          markerRaf = requestAnimationFrame(markerTick);
        };
        markerRaf = requestAnimationFrame(markerTick);

        // ── Zone projection (damage circles) ─────────────────────────────
        projectZones = () => {
          if (!map) return;
          const zs = zonesRef.current;
          if (!zs || zs.length === 0) {
            setProjectedZones([]);
            return;
          }
          let size: { width: number; height: number };
          try {
            size = map.getSize();
          } catch {
            return;
          }
          const next: ProjectedZone[] = [];
          for (const z of zs) {
            const center = projectMapPoint(map, z.lat, z.lng);
            if (!center || !projectedPointVisible(center, size, 120)) continue;

            // Project one north/south and one east/west radius sample through
            // the camera matrix. A true ground circle becomes an ellipse under
            // tilt; this keeps the displayed ring scale close without trying to
            // draw full 3D geometry.
            const latOffset = z.radius_m / 111_320;
            const metersPerLng = 111_320 * Math.cos((z.lat * Math.PI) / 180);
            const lngOffset = metersPerLng > 1 ? z.radius_m / metersPerLng : 0;
            const north = projectMapPoint(map, z.lat + latOffset, z.lng);
            const east = projectMapPoint(map, z.lat, z.lng + lngOffset);
            const rawRadiusPx = Math.max(
              north ? pointDistancePx(center, north) : 0,
              east ? pointDistancePx(center, east) : 0,
            );
            const radiusPx = Math.min(rawRadiusPx, 200);
            next.push({ ...z, x: center.x, y: center.y, radiusPx });
          }
          setProjectedZones(next);
        };
        projectZonesRef.current = projectZones;
        map.on("change", projectZones);
        map.on("resize", projectZones);

        // ── Relationship graph projection ────────────────────────────────
        projectGraph = () => {
          if (!map) return;
          const liveMap = map;
          const g = graphRef.current;
          if (!g || g.nodes.length === 0) {
            setProjectedGraph(null);
            return;
          }
          let size: { width: number; height: number };
          try {
            size = map.getSize();
          } catch {
            return;
          }
          const nodes = g.nodes.flatMap((n) => {
            const point = projectMapPoint(liveMap, n.lat, n.lng);
            if (!point) return [];
            return {
              ...n,
              x: point.x,
              y: point.y,
              visible: projectedPointVisible(point, size, 80),
            };
          });
          const nodeMap = new Map(nodes.map((n) => [n.id, n]));
          const edges = g.edges.flatMap((e) => {
            const source = nodeMap.get(e.sourceId);
            const target = nodeMap.get(e.targetId);
            if (!source || !target || !source.visible || !target.visible) return [];
            return [{ ...e, source, target }];
          });
          setProjectedGraph({ nodes, edges, depth: g.depth });
        };
        projectGraphRef.current = projectGraph;
        map.on("change", projectGraph);
        map.on("resize", projectGraph);

        rafId = requestAnimationFrame(() => {
          positionMarkers?.();
          projectZones?.();
          projectGraph?.();
        });
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[OsmBuildingsMap] failed to initialise:", err);
      });

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (markerRaf) cancelAnimationFrame(markerRaf);
      if (throttleTimer) clearTimeout(throttleTimer);
      if (revealTimer) clearTimeout(revealTimer);
      projectRef.current = null;
      projectZonesRef.current = null;
      projectGraphRef.current = null;
      mapRef.current = null;
      buildingsLayerRef.current = null;
      if (map) {
        if (onChange) map.off("change", onChange);
        if (onLoad) map.off("load", onLoad);
        if (projectZones) {
          map.off("change", projectZones);
          map.off("resize", projectZones);
        }
        if (projectGraph) {
          map.off("change", projectGraph);
          map.off("resize", projectGraph);
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

  // Re-project graph overlays when the selected graph changes (no map rebuild).
  useEffect(() => {
    projectGraphRef.current?.();
  }, [graph]);

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
    projectGraphRef.current?.();
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
      {/* Neutral mid-gray backdrop BEHIND the WebGL canvas — a fallback only.
          loader.ts forces the canvas to be opaque (alpha:false) so it no longer
          reveals anything behind it, but should a browser ignore that, this
          matches the in-canvas gap colour (#5C6367 ≈ satellite tone) so nothing
          flashes. */}
      <div
        className="absolute inset-0 z-0"
        style={{ backgroundColor: "#5C6367" }}
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

      {/* Relationship graph overlay. Lines sit below pins; halos identify the
          selected asset and its depth-N neighbors without stealing clicks. */}
      {projectedGraph && (
        <div className="pointer-events-none absolute inset-0 z-[4] overflow-hidden">
          <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
            <defs>
              <marker
                id="vera-graph-arrow"
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L7,3.5 L0,7 Z" fill="rgba(210,59,64,0.9)" />
              </marker>
            </defs>
            {projectedGraph.edges.map((e) => {
              const opacity = Math.max(0.35, Math.min(0.9, e.weight));
              const stroke =
                e.kind === "powers"
                  ? "rgba(210,59,64,0.92)"
                  : e.kind === "supplies_water"
                    ? "rgba(239,68,68,0.82)"
                    : e.kind === "provides_access"
                      ? "rgba(185,28,28,0.78)"
                      : "rgba(248,113,113,0.78)";
              return (
                <line
                  key={e.id}
                  x1={e.source.x}
                  y1={e.source.y}
                  x2={e.target.x}
                  y2={e.target.y}
                  stroke={stroke}
                  strokeOpacity={opacity}
                  strokeWidth={e.kind === "powers" ? 2.4 : 1.8}
                  strokeLinecap="round"
                  markerEnd="url(#vera-graph-arrow)"
                />
              );
            })}
          </svg>

          {projectedGraph.nodes.filter((n) => n.visible).map((n) => {
            const selected = n.role === "selected";
            const size = selected ? 34 : Math.max(18, 28 - n.depth * 4);
            return (
              <div
                key={n.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${n.x}px`,
                  top: `${n.y}px`,
                  width: `${size}px`,
                  height: `${size}px`,
                  border: `${selected ? 3 : 2}px solid rgba(255,255,255,0.9)`,
                  backgroundColor: selected ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
                  boxShadow: `0 0 0 ${selected ? 7 : 4}px ${n.color}33, 0 2px 10px rgba(15,23,42,0.45)`,
                }}
              >
                {selected && (
                  <>
                    <span
                      className="absolute inset-0 rounded-full border-2 border-status-offline"
                      style={{ animation: "vera-graph-selected-pulse 1.6s ease-out infinite" }}
                    />
                    <span
                      className="absolute inset-0 rounded-full border-2 border-status-offline"
                      style={{ animation: "vera-graph-selected-pulse 1.6s ease-out 0.55s infinite" }}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Clickable, state-colored asset pins. Each node is positioned by the rAF
          loop via `transform` (left/top fixed at 0,0) so it tracks the map with
          no React-state lag. Hidden until first positioned. */}
      {markers && markers.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
          {markers.map((m) => (
            <div
              key={m.id}
              ref={(el) => {
                if (el) markerEls.current.set(m.id, el);
                else markerEls.current.delete(m.id);
              }}
              className="absolute left-0 top-0 flex flex-col items-center"
              style={{ visibility: "hidden", willChange: "transform" }}
            >
              <button
                type="button"
                onClick={() => onMarkerClick?.(m.id)}
                aria-label={m.label ?? "asset"}
                className="pointer-events-auto block h-3.5 w-3.5 cursor-pointer rounded-full ring-2 ring-white transition-transform hover:scale-125"
                style={{ backgroundColor: m.color, boxShadow: "0 1px 4px rgba(15,23,42,0.55)" }}
              />
              {m.label && (
                <span className="pointer-events-none mt-1 max-w-[128px] truncate rounded-sm bg-surface-overlay px-1.5 py-0.5 text-[10px] font-medium text-text-primary shadow-[var(--shadow-overlay)] backdrop-blur-sm">
                  {m.label}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Neutral cover shown until OSMB paints its first tiles. Matches the gap
          tone (#5C6367) so initial load reads as a quiet "map loading" state —
          never a white, red, or dark flash. */}
      <div
        aria-hidden={tilesReady}
        className={`pointer-events-none absolute inset-0 z-[6] flex items-center justify-center transition-opacity duration-500 ${
          tilesReady ? "opacity-0" : "opacity-100"
        }`}
        style={{ backgroundColor: "#5C6367" }}
      >
        <span className="text-xs font-medium text-slate-300">Loading map…</span>
      </div>
    </div>
  );
}

export default OsmBuildingsMap;
