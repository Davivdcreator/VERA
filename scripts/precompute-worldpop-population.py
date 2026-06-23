#!/usr/bin/env python3
"""
precompute-worldpop-population.py

Voronoipopulation for Kyiv assets: each 100m WorldPop cell is assigned to
the nearest asset of the same subtype.  Ties split population 50/50.

Outputs:
  data/generated/worldpop-population-curated.json  — 20 entries keyed by stable OSM ID
  data/generated/worldpop-population-full.json      — ~1800 entries keyed by CSV `id`
  supabase/update-population.sql                    — UPDATE statements for all rows

Run order in build pipeline:
  1. python3 scripts/precompute-worldpop-population.py
  2. node scripts/build-cards.mjs
  3. node scripts/build-full-infrastructure-cards.mjs
  4. psql ... -f supabase/migrations/0005_infrastructure_population_affected.sql
  5. psql ... -f supabase/update-population.sql
"""

import csv
import json
import math
import sys
import warnings
from collections import defaultdict
from pathlib import Path

# Suppress numpy 2.5 deprecation warning triggered by rasterio window reads
warnings.filterwarnings("ignore", message="Setting the shape on a NumPy array has been deprecated")

# ── deps ──────────────────────────────────────────────────────────────────────
try:
    import rasterio
    import numpy as np
    from scipy.spatial import KDTree
except ImportError as e:
    print(f"[precompute] ERROR: missing dependency {e.name}: pip install rasterio numpy scipy")
    sys.exit(1)

# ── paths ────────────────────────────────────────────────────────────────────
ROOT       = Path(__file__).parent.parent.resolve()
SRC_TIF    = ROOT / "data/worldpop_kyiv/source/ukr_pop_2024_CN_100m_R2025A_v1.tif"
ASSETS_JSON = ROOT / "src/data/generated/assets.json"
INFRA_CSV  = ROOT / "data/databases/pg/data/kyiv_infrastructure.csv"
OUT_CURATED = ROOT / "data/generated/worldpop-population-curated.json"
OUT_FULL    = ROOT / "data/generated/worldpop-population-full.json"
OUT_SQL     = ROOT / "supabase/update-population.sql"
OUT_DIR     = OUT_CURATED.parent

# ── Kyiv bounding box ────────────────────────────────────────────────────────
KYIV_BBOX = [29.5, 49.8, 31.0, 51.0]   # [min_lng, min_lat, max_lng, max_lat]

# ── helpers ───────────────────────────────────────────────────────────────────
def stable_id(osm_type: str, osm_id: int | str) -> str:
    """Deterministic UUIDv4-shaped string from OSM key — matches build-cards.mjs."""
    import hashlib
    h = hashlib.sha256(f"{osm_type}/{osm_id}".encode()).hexdigest()
    return (
        f"{h[:8]}-"
        f"{h[8:12]}-"
        f"4{h[13:16]}-"
        f"{(int(h[16], 16) & 3 | 8):x}{h[17:20]}-"
        f"{h[20:32]}"
    )


def parse_mw(tag: str | None) -> float | None:
    if not tag or tag == "yes":
        return None
    m = __import__("re").search(r"([\d.]+)\s*(MW|GW|kW)?", str(tag), flags=__import__("re").I)
    if not m:
        return None
    v = float(m.group(1))
    unit = (m.group(2) or "MW").upper()
    if unit == "GW":
        return v * 1000
    if unit == "KW":
        return v / 1000
    return v


def parse_voltage_kv(tag: str | None) -> float | None:
    if not tag:
        return None
    parts = [float(s) for s in str(tag).split(";") if s.replace(".", "", 1).lstrip("-").isdigit()]
    if not parts:
        return None
    return max(parts) / 1000


def safe_json(value: str | None) -> dict:
    if not value:
        return {}
    try:
        return json.loads(value)
    except Exception:
        return {}


# ── curated radius (for radius_m field only — not used in population calc) ───
BASE_RADIUS_M = {
    "power_plant":      8000,
    "substation":       3000,
    "water_works":      6000,
    "wastewater":       4000,
    "pumping_station":  4000,
    "hospital":         2000,
    "bridge":           1500,
    "heating_plant":    5000,
    "telecom":          3000,
    "other":            2000,
}


def radius_for_curated(asset_type: str, tags: dict, capacity_mw: float | None, voltage_kv: float | None) -> int:
    base = BASE_RADIUS_M.get(asset_type, 2000)
    if asset_type == "power_plant" and capacity_mw is not None:
        base = max(4000, min(12000, round(base * (capacity_mw / 300))))
    if asset_type == "substation" and voltage_kv is not None:
        base = max(1000, min(6000, round(1000 * math.log10(voltage_kv + 1) * 1800)))
    return int(base)


TYPE_RADIUS_M_FULL = {
    "hospital": 2000,
    "clinic": 1200,
    "pharmacy": 800,
    "fire_station": 2200,
    "police": 2000,
    "school": 1400,
    "kindergarten": 1200,
    "university": 1600,
    "substation": 2500,
    "railway": 1800,
    "bus_stop": 500,
    "post_office": 900,
    "supermarket": 1000,
    "water_fountain": 500,
}


def radius_for_subtype(subtype: str) -> int:
    return TYPE_RADIUS_M_FULL.get(subtype, 900)


# ── haversine (metres) ───────────────────────────────────────────────────────
def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── pixel centre coordinates ─────────────────────────────────────────────────
def pixel_centre(row: int, col: int, transform) -> tuple[float, float]:
    """Return (lat, lng) of cell centre from rasterio Affine transform."""
    lng, lat = transform * (col + 0.5, row + 0.5)
    return lat, lng


# ── main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    print("[precompute] Starting Voronoi WorldPop population pre-computation")

    # ── 1. Open and crop WorldPop TIF ─────────────────────────────────────────
    print(f"[precompute] Opening {SRC_TIF}")
    with rasterio.open(SRC_TIF) as ds:
        src_crs = ds.crs
        nodata = ds.nodata
        # Confirm CRS is EPSG:4326 (WGS84)
        if src_crs and src_crs.to_epsg() != 4326:
            print(f"[precompute] WARNING: unexpected CRS {src_crs}, expected EPSG:4326")

        # Crop window to Kyiv bbox (much smaller than full TIF)
        from rasterio.windows import from_bounds
        window = from_bounds(*KYIV_BBOX, transform=ds.transform)

        # Round to integer pixel boundaries for clean reads
        row_start = max(0, int(math.floor(window.row_off)))
        col_start = max(0, int(math.floor(window.col_off)))
        row_end   = min(ds.height, int(math.ceil(window.row_off + window.height)))
        col_end   = min(ds.width,  int(math.ceil(window.col_off + window.width)))

        win_data = ds.read(1, window=rasterio.windows.Window(
            col_start, row_start, col_end - col_start, row_end - row_start))
        transform = ds.transform
        # Adjust transform to match the cropped window's top-left origin
        transform = rasterio.Affine(
            transform.a, transform.b,
            transform.c + col_start * transform.a + row_start * transform.d,
            transform.d, transform.e,
            transform.f + col_start * transform.b + row_start * transform.e,
        )

    print(f"[precompute] Cropped TIF window: {win_data.shape[0]} rows x {win_data.shape[1]} cols")
    print(f"[precompute] nodata value: {nodata}")

    # ── 2. Load curated assets ────────────────────────────────────────────────
    print(f"[precompute] Loading curated assets from {ASSETS_JSON}")
    curated_raw = json.loads(ASSETS_JSON.read_text())

    # Group curated assets by subtype (maps to AssetCard.type)
    # For curated, subtype == asset["type"]
    curated_by_subtype = defaultdict(list)
    for asset in curated_raw:
        curated_by_subtype[asset["type"]].append(asset)

    # Compute radius_m for each curated asset (for output JSON only)
    curated_radii = {}
    for asset in curated_raw:
        tags = asset.get("tags", {})
        capacity_mw = parse_mw(tags.get("plant:output:electricity"))
        voltage_kv  = parse_voltage_kv(tags.get("voltage"))
        curated_radii[stable_id(asset["osm_type"], asset["osm_id"])] = radius_for_curated(
            asset["type"], tags, capacity_mw, voltage_kv)

    # ── 3. Load full infrastructure CSV ──────────────────────────────────────
    print(f"[precompute] Loading full infrastructure from {INFRA_CSV}")
    with open(INFRA_CSV, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        csv_rows = list(reader)

    # Group full infra by subtype
    full_by_subtype = defaultdict(list)
    for row in csv_rows:
        lat_str = row.get("latitude", "")
        lng_str = row.get("longitude", "")
        try:
            lat = float(lat_str)
            lng = float(lng_str)
        except (ValueError, TypeError):
            continue
        if not (-90 <= lat <= 90):
            continue
        row_id  = row.get("id", "")
        subtype = row.get("subtype", "unknown")
        full_by_subtype[subtype].append({
            "id":    row_id,
            "lat":   lat,
            "lng":   lng,
            "name":  row.get("name", f"{subtype} {row_id[:8]}"),
            "row":   row,
        })

    # ── 4. Build per-subtype KD-trees and accumulate Voronoi population ───────
    TIE_TOL = 1e-8  # radians (≈ 1 µm at equator — floating-point epsilon)

    curated_pop  = defaultdict(float)   # stable_id → population
    full_pop     = defaultdict(float)   # row_id    → population

    # KDTree cache: keyed by subtype so we build each tree only once
    curated_kdtrees: dict[str, KDTree] = {}
    full_kdtrees:    dict[str, KDTree] = {}

    rows_total, rows_processed = win_data.shape[0], win_data.shape[1]

    # Iterate over all pixels in cropped window
    for r in range(win_data.shape[0]):
        if r % 200 == 0:
            print(f"[precompute]   row {r}/{win_data.shape[0]}…")

        for c in range(win_data.shape[1]):
            val = win_data[r, c]
            if val == nodata or val <= 0:
                continue

            pop = float(val)
            lat, lng = pixel_centre(r, c, transform)

            # ── curated assets ────────────────────────────────────────────────
            for subtype, assets in curated_by_subtype.items():
                if not assets:
                    continue

                # Build KDTree on demand (cached per subtype)
                if subtype not in curated_kdtrees:
                    coords = np.deg2rad([[a["lat"], a["lng"]] for a in assets])
                    curated_kdtrees[subtype] = KDTree(coords)

                tree = curated_kdtrees[subtype]
                point = np.deg2rad([[lat, lng]])
                n = len(assets)

                if n == 1:
                    dists, indices = tree.query(point, k=1)
                    sid = stable_id(assets[0]["osm_type"], assets[0]["osm_id"])
                    curated_pop[sid] += pop
                    continue

                # n >= 2: always k=2, dists shape is (1, 2)
                dists, indices = tree.query(point, k=2)
                dist1 = float(dists[0, 0])
                idx1  = int(indices[0, 0])
                dist2 = float(dists[0, 1])
                idx2  = int(indices[0, 1])

                if abs(dist1 - dist2) < TIE_TOL:
                    # Tie: split 50/50
                    sid1 = stable_id(assets[idx1]["osm_type"], assets[idx1]["osm_id"])
                    curated_pop[sid1] += pop * 0.5
                    sid2 = stable_id(assets[idx2]["osm_type"], assets[idx2]["osm_id"])
                    curated_pop[sid2] += pop * 0.5
                else:
                    sid = stable_id(assets[idx1]["osm_type"], assets[idx1]["osm_id"])
                    curated_pop[sid] += pop

            # ── full infrastructure ───────────────────────────────────────────
            for subtype, items in full_by_subtype.items():
                if not items:
                    continue

                if subtype not in full_kdtrees:
                    coords = np.deg2rad([[item["lat"], item["lng"]] for item in items])
                    full_kdtrees[subtype] = KDTree(coords)

                tree = full_kdtrees[subtype]
                point = np.deg2rad([[lat, lng]])
                n = len(items)

                if n == 1:
                    dists, indices = tree.query(point, k=1)
                    full_pop[items[0]["id"]] += pop
                    continue

                dists, indices = tree.query(point, k=2)
                dist1 = float(dists[0, 0])
                idx1  = int(indices[0, 0])
                dist2 = float(dists[0, 1])
                idx2  = int(indices[0, 1])

                if abs(dist1 - dist2) < TIE_TOL:
                    full_pop[items[idx1]["id"]] += pop * 0.5
                    full_pop[items[idx2]["id"]] += pop * 0.5
                else:
                    full_pop[items[idx1]["id"]] += pop

    # ── 5. Build output dicts ──────────────────────────────────────────────────
    print(f"[precompute] Assembling output JSONs…")

    curated_results = {}
    for asset in curated_raw:
        sid = stable_id(asset["osm_type"], asset["osm_id"])
        curated_results[sid] = {
            "population_affected": int(round(curated_pop.get(sid, 0))),
            "radius_m": curated_radii.get(sid, 2000),
        }
        print(f"[precompute]   {asset['name']} ({asset['type']}) → {curated_results[sid]['population_affected']:,} people")

    full_results = {}
    for row in csv_rows:
        row_id = row.get("id", "")
        if row_id:
            full_results[row_id] = {
                "population_affected": int(round(full_pop.get(row_id, 0))),
                "radius_m": radius_for_subtype(row.get("subtype", "")),
            }

    # ── 6. Write outputs ───────────────────────────────────────────────────────
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_CURATED.write_text(json.dumps(curated_results, indent=2))
    print(f"[precompute] Wrote {len(curated_results)} curated entries → {OUT_CURATED}")

    OUT_FULL.write_text(json.dumps(full_results, indent=2))
    print(f"[precompute] Wrote {len(full_results)} full infrastructure entries → {OUT_FULL}")

    print(f"[precompute] Writing SQL backfill → {OUT_SQL}")
    lines = [
        "-- WorldPop-derived population_affected backfill (Voronoi partitioning)",
        "-- Generated by scripts/precompute-worldpop-population.py",
        f"-- Source: {SRC_TIF.name}",
        f"-- Rows: {len(full_results)}",
        "",
        "BEGIN;",
        "",
    ]
    for row_id, entry in full_results.items():
        lines.append(
            f"UPDATE infrastructure SET population_affected = {entry['population_affected']} WHERE id = '{row_id}';"
        )

    lines.extend(["", "COMMIT;", ""])
    OUT_SQL.write_text("\n".join(lines))
    print(f"[precompute] Wrote SQL backfill → {OUT_SQL}")

    # ── 7. Sanity report ───────────────────────────────────────────────────────
    pops = [v["population_affected"] for v in curated_results.values()]
    print(f"\n── Sanity Report ──────────────────────────────────────────────────")
    print(f"  Curated assets:           {len(curated_results)}")
    print(f"  Full infrastructure:      {len(full_results)}")
    if pops:
        print(f"  Population range (curated): {min(pops):,} – {max(pops):,}")
        print(f"  Median population (curated): {sorted(pops)[len(pops)//2]:,}")
    print(f"\n  WorldPop TIF:  {SRC_TIF}")
    print(f"  Output curated: {OUT_CURATED}")
    print(f"  Output full:   {OUT_FULL}")
    print(f"  Output SQL:    {OUT_SQL}")
    print("\n[precompute] Done.")


if __name__ == "__main__":
    main()