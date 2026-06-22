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
 * Neutralise OSM Buildings' red "flash".
 *
 * OSMBuildings.js (4.1.1) clears one of its offscreen effect framebuffers to
 * opaque red — `gl.clearColor(1, 0, 0, 1)` — as a placeholder. On real GPUs that
 * red texture composites onto the canvas as a full-map RED WASH during every
 * un-painted moment: initial (re)init, HMR reload, and while map tiles stream in
 * on pan/zoom. (The main scene clears transparent, so the red comes solely from
 * that effect buffer, not the page background.)
 *
 * We monkey-patch `clearColor` on both GL prototypes to remap that EXACT pure-red
 * clear to transparent, so the un-painted buffer contributes nothing instead of a
 * red wash. Scoped to (1,0,0,1) only — every other clear (incl. OSMB's own gray /
 * fog-color clears) passes through untouched. Installed once, before OSMB builds
 * its context, so it also covers the very first frame.
 */
function neutraliseRedClearFlash(): void {
  const flag = "__veraRedClearPatched";
  const w = window as unknown as Record<string, boolean>;
  if (w[flag]) return;
  w[flag] = true;

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
      if (red === 1 && green === 0 && blue === 0 && alpha === 1) {
        // Pure-red placeholder clear → fully transparent (kills the red wash).
        original.call(this, 0, 0, 0, 0);
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
  // Kill the red clear-color flash before any OSMB GL context is created.
  neutraliseRedClearFlash();

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
