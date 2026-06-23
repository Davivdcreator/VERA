/**
 * CDN loader for OSM Buildings GL 4.1.1.
 *
 * OSM Buildings is a UMD global, not an npm package. We inject the CSS <link>
 * and JS <script> exactly once, memoize the in-flight promise so concurrent
 * callers (e.g. two map panels mounting at the same time) share one network
 * request, and resolve with the `window.OSMBuildings` constructor.
 *
 * Safe under React 18 StrictMode double-invoke: the memoized promise means the
 * second effect run reuses the first load rather than injecting a second script.
 */
import type { OSMBuildingsConstructor } from "./osmbuildings";

const OSMB_VERSION = "4.1.1";
const CSS_URL = `https://cdn.osmbuildings.org/${OSMB_VERSION}/OSMBuildings.css`;
const JS_URL = `https://cdn.osmbuildings.org/${OSMB_VERSION}/OSMBuildings.js`;

/** Stable ids so we never inject duplicates across HMR / re-mounts. */
const CSS_ID = "osmb-css";
const JS_ID = "osmb-js";

let cached: Promise<OSMBuildingsConstructor> | null = null;

/**
 * Neutral mid-tone for un-painted map regions (≈ satellite-imagery average).
 * Tile-loading gaps clear to this instead of flashing. KEEP IN SYNC with the
 * CSS backdrop/cover colour in OsmBuildingsMap.tsx (#5C6367).
 */
const MAP_GAP_RGB = { r: 92, g: 99, b: 103 };

/**
 * Harden OSM Buildings' canvas against the flicker/flash family of bugs.
 *
 * Two independent root causes, both patched here BEFORE OSMB creates its GL
 * context (so even the first frame is covered):
 *
 * 1. TRANSPARENT CANVAS. OSMB requests its context without `alpha:false`, so it
 *    defaults to transparent and clears with alpha 0 every frame. Any un-painted
 *    region — initial (re)init, HMR reload, and tile streaming + zoom-level swaps
 *    while interacting — therefore shows THROUGH the canvas to whatever sits
 *    behind it. That is why the artefact kept changing colour as we changed the
 *    backdrop (red effect-buffer → white page → dark backdrop) and flickered on
 *    pan/zoom. We force `alpha:false` so the canvas is OPAQUE and never reveals
 *    anything behind it again. Safe app-wide: OSMB is the only WebGL user here
 *    (deck.gl / cesium are unused deps).
 *
 * 2. FLASHING CLEAR COLOURS. With an opaque canvas the un-painted colour becomes
 *    OSMB's own clear colour. Its offscreen effect buffer clears to opaque RED
 *    (1,0,0,1); the main scene clears to fog (#e8e0d8, near-white) with alpha 0.
 *    Both would flash. We remap the red placeholder to transparent, and the main
 *    alpha-0 clear to an opaque neutral mid-gray (~satellite tone) so tile gaps
 *    BLEND into the imagery instead of flickering.
 */
function hardenOsmbGl(): void {
  const flag = "__veraGlHardened";
  const w = window as unknown as Record<string, boolean>;
  if (w[flag]) return;
  w[flag] = true;

  // (1) Force opaque WebGL contexts so the canvas never shows what's behind it.
  type GetContext = typeof HTMLCanvasElement.prototype.getContext;
  const origGetContext = HTMLCanvasElement.prototype.getContext as (
    this: HTMLCanvasElement,
    id: string,
    options?: unknown,
  ) => RenderingContext | null;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    id: string,
    options?: unknown,
  ): RenderingContext | null {
    if (id === "webgl" || id === "webgl2" || id === "experimental-webgl") {
      return origGetContext.call(this, id, { ...(options as object), alpha: false });
    }
    return origGetContext.call(this, id, options);
  } as GetContext;

  // (2) Remap OSMB's flash-causing clear colours.
  const r0 = MAP_GAP_RGB.r / 255;
  const g0 = MAP_GAP_RGB.g / 255;
  const b0 = MAP_GAP_RGB.b / 255;
  const protos = [
    typeof WebGLRenderingContext !== "undefined" ? WebGLRenderingContext.prototype : null,
    typeof WebGL2RenderingContext !== "undefined" ? WebGL2RenderingContext.prototype : null,
  ];
  for (const proto of protos) {
    if (!proto) continue;
    const original = proto.clearColor;
    proto.clearColor = function patchedClearColor(
      this: WebGLRenderingContext,
      red: number,
      green: number,
      blue: number,
      alpha: number,
    ): void {
      // Red placeholder buffer → transparent (no red wash from the effect FBO).
      if (red === 1 && green === 0 && blue === 0 && alpha === 1) {
        original.call(this, 0, 0, 0, 0);
        return;
      }
      // Main scene's transparent clear → opaque neutral mid-gray, so un-painted
      // tile gaps blend with the satellite imagery instead of flashing.
      if (alpha === 0) {
        original.call(this, r0, g0, b0, 1);
        return;
      }
      original.call(this, red, green, blue, alpha);
    };
  }
}

function injectCss(): void {
  if (document.getElementById(CSS_ID)) return;
  const link = document.createElement("link");
  link.id = CSS_ID;
  link.rel = "stylesheet";
  link.href = CSS_URL;
  document.head.appendChild(link);
}

function injectScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Already present (e.g. a prior load, or HMR re-eval): don't add twice.
    const existing = document.getElementById(JS_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.OSMBuildings) {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Failed to load OSMBuildings.js")),
          { once: true },
        );
      }
      return;
    }

    const script = document.createElement("script");
    script.id = JS_ID;
    script.src = JS_URL;
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Failed to load OSMBuildings.js from CDN")),
      { once: true },
    );
    document.head.appendChild(script);
  });
}

/**
 * Loads OSM Buildings once and resolves with the global constructor.
 * Subsequent calls return the same memoized promise.
 *
 * @throws if the CDN script fails to load or never exposes window.OSMBuildings.
 */
export function loadOsmBuildings(): Promise<OSMBuildingsConstructor> {
  // Make the canvas opaque + neutralise OSMB's flash clears, before any GL
  // context is created (covers the very first frame).
  hardenOsmbGl();

  // Fast path: already on window (loaded earlier, or by another bundle).
  if (window.OSMBuildings) {
    cached ??= Promise.resolve(window.OSMBuildings);
    return cached;
  }

  cached ??= (async () => {
    injectCss();
    await injectScript();
    const ctor = window.OSMBuildings;
    if (!ctor) {
      // Reset so a later retry can attempt a fresh load instead of being
      // stuck on a rejected-but-cached promise.
      cached = null;
      throw new Error(
        "OSMBuildings.js loaded but window.OSMBuildings is undefined",
      );
    }
    return ctor;
  })();

  // If the load rejects, clear the cache so callers can retry.
  cached.catch(() => {
    cached = null;
  });

  return cached;
}

/** Test/HMR helper — forget the memoized loader. Not used in normal flow. */
export function __resetOsmBuildingsLoader(): void {
  cached = null;
}

/**
 * Full reset: clears the cached promise AND the OSMB global.
 * Call this on component unmount if the map is being destroyed and you
 * plan to create a new OSMB instance on the same page.
 * Without this, OSMB's internal global WebGL state can persist and cause
 * context loss / flickering on the next map instance after client-side
 * navigation between pages that both use OSMB.
 */
export function __resetOsmBuildings(): void {
  cached = null;
  // Deliberately null out the global to force re-init.
  window.OSMBuildings = undefined;
  // Also remove the injected script so it can be re-added fresh
  const script = document.getElementById(JS_ID);
  if (script) script.remove();
  // Remove the CSS too
  const css = document.getElementById(CSS_ID);
  if (css) css.remove();
}
