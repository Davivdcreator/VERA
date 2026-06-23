/**
 * Ambient typings for OSM Buildings GL 4.1.1.
 *
 * OSM Buildings is NOT an npm package — it is a UMD global loaded from CDN
 * (see `loader.ts`). These declarations give us type-safety against the global
 * constructor and instance without resorting to `any` throughout the app.
 *
 * Surface intentionally limited to the methods/events VERA actually uses plus
 * the documented API. If you call something not declared here, add it rather
 * than reaching for `any`.
 *
 * Docs: https://osmbuildings.org/documentation/viewer/
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface LatLngBounds {
  /** [south, west, north, east] per OSMB getBounds() */
  0: number;
  1: number;
  2: number;
  3: number;
  length: 4;
}

export interface OSMBuildingsOptions {
  /** id of a DOM element, or the element itself. */
  container: string | HTMLElement;
  position?: LatLng;
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  /** Camera tilt in degrees. 0 = straight down (2D), ~45 = isometric (3D). */
  tilt?: number;
  /** Camera rotation/bearing in degrees. */
  rotation?: number;
  /** Attribution string shown bottom-right. */
  attribution?: string;
  /** Effects such as ['shadows']. Optional. */
  effects?: string[];
}

/**
 * Options accepted by addGeoJSON / addGeoJSONTiles / addOBJ.
 * OSMB is loose here; we declare the commonly-used keys.
 */
export interface OSMBuildingsLayerOptions {
  id?: string;
  /** Hex color string, e.g. '#ffcc00'. */
  color?: string;
  /** Fixed height override (meters). */
  height?: number;
  /** Min zoom at which the layer renders. */
  minZoom?: number;
  maxZoom?: number;
  /** Elevation offset (meters). */
  elevation?: number;
  [key: string]: unknown;
}

/** Union of all OSMB event names (the `change` event is the one we clamp on). */
export type OSMBuildingsEvent =
  | "busy"
  | "change"
  | "doubleclick"
  | "gesture"
  | "idle"
  /** Fires after the initial map + first tile set have painted. */
  | "load"
  | "loadfeature"
  | "move"
  | "pointerdown"
  | "pointermove"
  | "pointerup"
  | "resize"
  | "rotate"
  | "tilt"
  | "zoom";

/**
 * A live OSM Buildings map instance.
 * Mirrors the documented method set for 4.1.1.
 */
export interface OSMBuildingsMap {
  setPosition(position: LatLng): this;
  getPosition(): LatLng;

  setZoom(zoom: number): this;
  getZoom(): number;

  setTilt(tilt: number): this;
  getTilt(): number;

  setRotation(rotation: number): this;
  getRotation(): number;

  setSize(size: { width: number; height: number }): this;
  getSize(): { width: number; height: number };

  /** 2D raster base layer. URL template uses {z}/{x}/{y}. Renders below buildings. */
  addMapTiles(urlTemplate: string, options?: OSMBuildingsLayerOptions): unknown;

  /** Single GeoJSON file or in-memory FeatureCollection of polygonal features. */
  addGeoJSON(urlOrData: string | object, options?: OSMBuildingsLayerOptions): unknown;

  /** Continuous tiled 3D building coverage. URL template uses {s}/{z}/{x}/{y}. */
  addGeoJSONTiles(url: string, options?: OSMBuildingsLayerOptions): unknown;

  /** Single OBJ mesh. */
  addOBJ(url: string, position: LatLng, options?: OSMBuildingsLayerOptions): unknown;

  /** Remove a layer/feature previously returned by an add* call. */
  remove(feature: unknown): void;

  on(type: OSMBuildingsEvent, fn: (e?: unknown) => void): this;
  off(type: OSMBuildingsEvent, fn: (e?: unknown) => void): this;

  /** Sets the sun position for shadows. */
  setDate(date: Date): this;

  highlight(feature: unknown): void;

  /**
   * Projects a WGS84 coordinate into canvas pixels using OSMB's current camera
   * matrix. Present in the 4.1.1 bundle even though the public docs barely
   * surface it. `altitude` is meters above the map plane.
   */
  project(latitude: number, longitude: number, altitude?: number): { x: number; y: number; z: number };

  /** Converts canvas pixels back to a ground-plane WGS84 coordinate. */
  unproject(x: number, y: number): LatLng | undefined;

  /**
   * View bounds. NOTE: OSMB 4.1.1 actually returns the four view-polygon CORNERS
   * as `{ longitude, latitude }` points (a trapezoid under 3D tilt), NOT a flat
   * [south, west, north, east] tuple.
   */
  getBounds(): LatLngBounds | number[] | Array<{ latitude: number; longitude: number }>;

  /** Tear down WebGL context + DOM. Always call on unmount. */
  destroy(): void;

  /** Pause/resume interaction + rendering. */
  setDisabled(flag: boolean): this;
}

/** The global constructor exposed by OSMBuildings.js. */
export interface OSMBuildingsConstructor {
  new (options: OSMBuildingsOptions): OSMBuildingsMap;
  readonly VERSION?: string;
}

declare global {
  interface Window {
    OSMBuildings?: OSMBuildingsConstructor;
  }
}

export {};
