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
