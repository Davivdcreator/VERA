# OSM Buildings Map Integration Blueprint — VERA

Civic "Infrastructure Intelligence" dashboard. Map is **OSM Buildings GL 4.1.1**,
loaded from CDN, locked to the **Kyiv metro area**, Ukraine.

This blueprint ships the reusable core so the execution developer can drop it
into the dashboard. All code below is **already written into the repo** and
**passes `npm run typecheck`** against the project's strict TS config.

> No new npm deps. OSM Buildings is a **UMD global loaded from CDN**, not a
> package. `package.json` is untouched by design.

---

## 0. File layout (created)

```
src/
  config/
    region.ts                 # bbox, center, zoom envelope, clampToRegion()
  lib/
    osmb/
      osmbuildings.d.ts        # ambient typings for window.OSMBuildings + instance
      loader.ts                # loadOsmBuildings(): memoized CDN injector
      tiles.ts                 # base raster + 3D building tile URLs + policy notes
      OsmBuildingsMap.tsx      # reusable React component (mode: '2d' | '3d')
  vite-env.d.ts                # + VITE_OSM_BASE_TILE_URL / VITE_OSM_BUILDING_TILES_URL
```

The `@/*` path alias (→ `src/`) is already configured in both `tsconfig.json`
and `vite.config.ts`, so imports like `@/config/region` resolve.

---

## 1. Script loader — `src/lib/osmb/loader.ts`

`loadOsmBuildings()` injects the CSS `<link>` and JS `<script>` **once**,
memoizes the in-flight promise, and resolves with the global constructor.

Key properties:

- **Memoized promise** (`cached`) — concurrent callers (the 2D and 3D panels
  mounting together) share **one** network request and **one** script tag.
- **Fast path** — if `window.OSMBuildings` already exists (HMR, prior load,
  another bundle), it resolves immediately.
- **Idempotent injection** — `CSS_ID` / `JS_ID` element ids prevent duplicate
  tags across StrictMode re-mounts and Vite HMR.
- **Retryable failure** — on reject, the cache is cleared so a later mount can
  re-attempt instead of being stuck on a rejected promise.

```ts
const OSMB_VERSION = "4.1.1";
const CSS_URL = `https://cdn.osmbuildings.org/${OSMB_VERSION}/OSMBuildings.css`;
const JS_URL  = `https://cdn.osmbuildings.org/${OSMB_VERSION}/OSMBuildings.js`;

export function loadOsmBuildings(): Promise<OSMBuildingsConstructor> {
  if (window.OSMBuildings) {
    cached ??= Promise.resolve(window.OSMBuildings);
    return cached;
  }
  cached ??= (async () => {
    injectCss();
    await injectScript();          // resolves on <script> load
    const ctor = window.OSMBuildings;
    if (!ctor) { cached = null; throw new Error("…undefined"); }
    return ctor;
  })();
  cached.catch(() => { cached = null; });  // allow retry
  return cached;
}
```

See the file for `injectCss()` / `injectScript()` (both id-guarded) and the
`__resetOsmBuildingsLoader()` test/HMR helper.

---

## 2. TypeScript typings — `src/lib/osmb/osmbuildings.d.ts`

Ambient declarations so we are type-safe without `any` sprinkled everywhere.

- `OSMBuildingsOptions` — full constructor option bag (`container`, `position`,
  `zoom`, `minZoom`, `maxZoom`, `tilt`, `rotation`, `attribution`, `effects`).
- `OSMBuildingsMap` — instance interface covering every documented 4.1.1 method:
  `setPosition`/`getPosition`, `setZoom`/`getZoom`, `setTilt`/`getTilt`,
  `setRotation`/`getRotation`, `setSize`/`getSize`, `addMapTiles`, `addGeoJSON`,
  `addGeoJSONTiles`, `addOBJ`, `remove`, `on`/`off`, `setDate`, `highlight`,
  `getBounds`, `destroy`, `setDisabled`.
- `OSMBuildingsEvent` — string union of all events
  (`busy | change | doubleclick | gesture | idle | loadfeature | pointerdown |
  pointermove | pointerup | resize | rotate | tilt | zoom`). The clamp listens
  on `change`.
- `OSMBuildingsConstructor` — `new (options) => OSMBuildingsMap`.
- `declare global { interface Window { OSMBuildings?: OSMBuildingsConstructor } }`
  so `window.OSMBuildings` is typed everywhere.

> Method coverage is deliberately scoped to what's documented + what VERA uses.
> If you need something not declared, **add it** rather than casting to `any`.
> `add*` return values are typed `unknown` (OSMB hands back opaque layer
> handles); pass them straight to `map.remove(handle)`.

---

## 3. React component — `src/lib/osmb/OsmBuildingsMap.tsx`

```tsx
<OsmBuildingsMap mode="2d" />     // flat raster map
<OsmBuildingsMap mode="3d" />     // tilted, with 3D building tiles
```

Props: `mode: '2d' | '3d'` (required) + optional `center`, `zoom`, `tilt`,
`rotation`, `className`.

### Mode behaviour

| mode | tilt | layers |
|------|------|--------|
| `2d` | `0`  | `addMapTiles(BASE_TILE_URL)` only |
| `3d` | `45` | `addMapTiles(BASE_TILE_URL)` + `addGeoJSONTiles(BUILDING_TILES_URL)` |

### StrictMode-safe lifecycle (the important part)

React 18 StrictMode runs effects **mount → unmount → mount** in dev. Two GL
contexts on one container, or a `destroy()` racing an in-flight init, would
break things. The component guards every boundary:

- All mutable state (`map`, `cancelled`, `throttleTimer`, `onChange`) lives in
  **per-effect-run closures**, not refs — so run #1's cleanup can never touch
  run #2's instance.
- A `cancelled` flag is checked **after** the async `loadOsmBuildings()`
  resolves: if the effect was torn down (or the ref vanished) before the CDN
  responded, we **never construct** a map.
- Cleanup always: clears the throttle timer, `map.off('change', onChange)`,
  then `map.destroy()` (which releases the WebGL context).

```tsx
useEffect(() => {
  let map: OSMBuildingsMap | null = null;
  let cancelled = false;
  // …
  loadOsmBuildings().then((OSMBuildings) => {
    if (cancelled || !containerRef.current) return;     // ← StrictMode guard
    const start = clampToRegion(center, zoom);
    map = new OSMBuildings({ container: containerRef.current, ...start, ... });
    map.addMapTiles(BASE_TILE_URL);
    if (mode === "3d") map.addGeoJSONTiles(BUILDING_TILES_URL);
    map.on("change", onChange);                          // ← region clamp
  });
  return () => {
    cancelled = true;
    if (throttleTimer) clearTimeout(throttleTimer);
    if (map) { map.off("change", onChange); map.destroy(); map = null; }
  };
}, [mode, center, zoom, tilt, rotation]);
```

The container renders `h-full w-full` with a defensive `minHeight: 240` (OSMB
measures its element — a zero-height div renders nothing; see §6 gotchas).

> `center` is an **object**; passing a fresh object literal each render
> re-runs the effect (re-inits the map). Callers should memoize it or pass the
> default. Documented inline in the component.

---

## 4. Region constraint — `src/config/region.ts`

OSM Buildings has **no native `maxBounds` / `setMaxBounds`**. We enforce the
region by clamping on the `change` event.

Config values:

```ts
REGION_CENTER = { latitude: 50.4501, longitude: 30.5234 }; // Kyiv
REGION_BBOX   = { south: 50.15, north: 50.65, west: 30.1, east: 30.95 };
REGION_MIN_ZOOM = 10;
REGION_MAX_ZOOM = 18;
REGION_DEFAULT_ZOOM = 11;
TILT_2D = 0;  TILT_3D = 45;
```

`clampToRegion(position, zoom)` is a **pure, side-effect-free** function (so it
is trivially unit-testable) returning `{ position, zoom, changed }`.

The component wires it into a **throttled, re-entrancy-guarded** `change`
handler. This is the load-bearing detail: `setPosition()` / `setZoom()`
**themselves emit `change`**, so a naive handler recurses forever. We guard with
an `applying` flag and an 80 ms throttle (one correction per ~frame):

```tsx
let applying = false;
const enforce = () => {
  throttleTimer = null;
  if (!map || applying) return;
  const result = clampToRegion(map.getPosition(), map.getZoom());
  if (!result.changed) return;              // already legal → no-op
  applying = true;
  map.setPosition(result.position);         // these fire `change`…
  map.setZoom(result.zoom);                 // …but `applying` swallows it
  applying = false;
};
const onChange = () => {
  if (throttleTimer || applying) return;
  throttleTimer = setTimeout(enforce, CLAMP_THROTTLE_MS);
};
map.on("change", onChange);
```

The bbox is rounded slightly **outward** from the Kyiv city/metro boundary so
users can pan to the region's edge without fighting the clamp. Refine against the
official admin boundary if you ever need pixel accuracy; today's values
comfortably contain the city and its immediate suburbs.

> **Edge polish (optional):** because the clamp acts on the **centre**, the
> viewport can still show a sliver outside the bbox at the corners. If that
> matters, either (a) shrink the effective bbox by half the viewport span, or
> (b) clamp against `getBounds()` instead of `getPosition()`. The centre-clamp
> is the simplest correct baseline and is what's shipped.

---

## 5. Tile sources & config — `src/lib/osmb/tiles.ts`

```ts
BASE_TILE_URL      // 2D raster, {z}/{x}/{y}
BUILDING_TILES_URL // 3D buildings GeoJSON, {s}/{z}/{x}/{y}
MAP_ATTRIBUTION    // OSM/ODbL required attribution
```

Both URLs are overridable at build time via `VITE_OSM_BASE_TILE_URL` /
`VITE_OSM_BUILDING_TILES_URL` (declared in `vite-env.d.ts`).

### ⚠️ Usage-policy callouts (must address before production)

- **Base raster default** points at `tile-a.openstreetmap.fr/hot/...` (the OSMB
  docs example). The **public OSM tile servers have a strict usage policy** that
  prohibits heavy/commercial/bulk use. A civic dashboard with real traffic
  **must** switch to an entitled provider (self-hosted renderer, MapTiler,
  Stadia, Thunderforest, …). **Do not point production at the public OSM cache.**
- **Building tiles default** uses the OSMB docs' **shared demo key `59fcc2e8`**
  on `data.osmbuildings.org`. It is **rate-limited and not guaranteed to stay
  up**. Production needs a **proper OSM Buildings API key** (or self-hosted
  building tiles). Treat `59fcc2e8` as **demo-only** — this is flagged in the
  file header too.
- **Attribution is mandatory** under OSM/ODbL — passed via the constructor's
  `attribution` option (`MAP_ATTRIBUTION`).

---

## 6. Integration notes for the implementer

### Two panels, one component

The dashboard's 2D and 3D map panels are the **same component** with different
`mode`:

```tsx
<div className="grid grid-cols-2 gap-4">
  <section className="h-[480px] rounded-lg overflow-hidden">
    <OsmBuildingsMap mode="2d" />
  </section>
  <section className="h-[480px] rounded-lg overflow-hidden">
    <OsmBuildingsMap mode="3d" />
  </section>
</div>
```

The loader's memoization means the CDN script loads **once** even with both
panels mounting simultaneously.

### Gotchas

1. **Container MUST have explicit height.** OSMB measures its element; a
   zero-height div renders blank. Always give the wrapper a height
   (`h-[480px]`, a flex/grid track, etc.). The component sets `minHeight: 240`
   defensively but the parent should own real layout height.

2. **WebGL context limits — two GL maps on one page.** Browsers cap live WebGL
   contexts (commonly ~8–16; the *oldest* context is dropped when exceeded).
   Two OSMB canvases is fine, but be disciplined:
   - **`destroy()` on unmount is non-negotiable** — the component does this. A
     leaked context (e.g. from a missing cleanup) burns the budget and can blank
     a *different* map.
   - Prefer **one 3D panel** at a time (3D is the expensive one). If the UX
     allows, consider a **mode toggle on a single map** instead of two
     simultaneous canvases — cheaper on both GPU memory and the building-tile
     rate limit. The single component supports this directly: flip the `mode`
     prop (it re-inits cleanly via the effect).
   - Avoid mounting/unmounting maps rapidly (e.g. in a fast-switching tab UI)
     without letting `destroy()` settle.

3. **StrictMode in dev** double-invokes effects — already handled (§3). Don't
   "fix" the double-mount by removing StrictMode; the guards are the right fix.

4. **`center` prop identity** — pass a stable/memoized object or rely on the
   default, else the map re-inits each render (§3).

5. **Error path** — init failures are currently `console.error`'d. Wire this
   into VERA's error reporter and render a fallback panel for production.

### Suggested next steps for execution

- Mount the two panels in the dashboard shell; give each a fixed-height section.
- Replace the demo building-tiles key and the public OSM raster with entitled
  production sources via the `VITE_OSM_*` env vars (§5).
- Add a unit test for `clampToRegion` (pure function — fast, no DOM).
- (Optional) Add a `mode` toggle to collapse to a single GL canvas if GPU
  budget on the target hardware is tight.
```
