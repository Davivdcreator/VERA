#!/usr/bin/env python3
"""
Estimate residential population for the building at a WGS84 coordinate.

The estimate uses the smallest WorldPop Ukraine grid available here: 100m
R2025A cells. It finds the OSM building containing the coordinate, then
distributes each intersecting WorldPop cell's population across residential
buildings in that cell by estimated residential floor area.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import ssl
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import rasterio
from pyproj import Transformer
from rasterio.windows import Window, from_bounds
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import polygonize, transform, unary_union


DEFAULT_YEAR = 2024
DEFAULT_RESOLUTION = "100m"
DEFAULT_SOURCE_CACHE_DIR = Path("data/worldpop_kyiv/source")
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NODATA_FALLBACK = -99999.0

RESIDENTIAL_BUILDINGS = {
    "apartments",
    "bungalow",
    "cabin",
    "detached",
    "dormitory",
    "farm",
    "ger",
    "house",
    "houseboat",
    "residential",
    "semidetached_house",
    "static_caravan",
    "terrace",
}
MIXED_USE_BUILDINGS = {"yes", "commercial", "retail"}
NON_RESIDENTIAL_BUILDINGS = {
    "church",
    "civic",
    "collapsed",
    "construction",
    "garage",
    "garages",
    "government",
    "greenhouse",
    "hospital",
    "hotel",
    "hut",
    "industrial",
    "kiosk",
    "office",
    "public",
    "religious",
    "retail",
    "roof",
    "school",
    "service",
    "shed",
    "shop",
    "sports_centre",
    "stadium",
    "storage_tank",
    "train_station",
    "transportation",
    "warehouse",
}


@dataclass
class Building:
    osm_ref: str
    tags: dict[str, str]
    geom_wgs84: Polygon
    geom_m: Polygon


def worldpop_url(year: int, resolution: str) -> str:
    if resolution == "100m":
        return (
            "https://data.worldpop.org/GIS/Population/Global_2015_2030/"
            f"R2025A/{year}/UKR/v1/100m/constrained/"
            f"ukr_pop_{year}_CN_100m_R2025A_v1.tif"
        )
    if resolution == "1km":
        return (
            "https://data.worldpop.org/GIS/Population/Global_2015_2030/"
            f"R2025A/{year}/UKR/v1/1km_ua/constrained/"
            f"ukr_pop_{year}_CN_1km_R2025A_UA_v1.tif"
        )
    raise ValueError(f"Unsupported resolution: {resolution}")


def ca_bundle() -> str | None:
    try:
        import certifi

        return certifi.where()
    except ImportError:
        return None


def download_file(url: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    tmp = output.with_suffix(output.suffix + ".part")
    context = ssl.create_default_context(cafile=ca_bundle())
    request = urllib.request.Request(url, headers={"User-Agent": "building-pop-estimator/1.0"})
    with urllib.request.urlopen(request, timeout=300, context=context) as response:
        with tmp.open("wb") as f:
            shutil.copyfileobj(response, f, length=1024 * 1024)
    tmp.replace(output)


def source_raster_path(year: int, resolution: str, cache_dir: Path) -> Path:
    url = worldpop_url(year, resolution)
    path = cache_dir / Path(url).name
    if not path.exists():
        print(f"Downloading WorldPop source raster: {url}")
        download_file(url, path)
    return path


def query_overpass_buildings(west: float, south: float, east: float, north: float) -> dict[str, Any]:
    query = f"""
[out:json][timeout:180];
(
  way["building"]({south},{west},{north},{east});
  relation["building"]({south},{west},{north},{east});
);
out tags geom;
"""
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    request = urllib.request.Request(
        OVERPASS_URL,
        data=data,
        headers={"User-Agent": "building-pop-estimator/1.0"},
    )
    context = ssl.create_default_context(cafile=ca_bundle())
    with urllib.request.urlopen(request, timeout=240, context=context) as response:
        return json.loads(response.read().decode("utf-8"))


def way_polygon(element: dict[str, Any]) -> Polygon | None:
    coords = [(float(p["lon"]), float(p["lat"])) for p in element.get("geometry") or []]
    if len(coords) < 4 or coords[0] != coords[-1]:
        return None
    poly = Polygon(coords)
    if poly.is_empty:
        return None
    if not poly.is_valid:
        poly = poly.buffer(0)
    if poly.is_empty:
        return None
    return poly


def relation_polygon(element: dict[str, Any]) -> Polygon | None:
    lines = []
    for member in element.get("members") or []:
        coords = [(float(p["lon"]), float(p["lat"])) for p in member.get("geometry") or []]
        if len(coords) >= 2:
            lines.append(LineString(coords))
    if not lines:
        return None
    polygons = list(polygonize(lines))
    if not polygons:
        return None
    geom = unary_union(polygons)
    if geom.geom_type == "MultiPolygon":
        geom = max(geom.geoms, key=lambda g: g.area)
    if geom.is_empty:
        return None
    if not geom.is_valid:
        geom = geom.buffer(0)
    return geom if not geom.is_empty else None


def parse_buildings(osm: dict[str, Any], to_meters: Transformer) -> list[Building]:
    buildings = []
    for element in osm.get("elements", []):
        if element.get("type") == "way":
            geom = way_polygon(element)
        elif element.get("type") == "relation":
            geom = relation_polygon(element)
        else:
            geom = None
        if geom is None:
            continue

        tags = {str(k): str(v) for k, v in (element.get("tags") or {}).items()}
        geom_m = transform(to_meters.transform, geom)
        buildings.append(
            Building(
                osm_ref=f"{element.get('type')}/{element.get('id')}",
                tags=tags,
                geom_wgs84=geom,
                geom_m=geom_m,
            )
        )
    return buildings


def meters_per_degree(lat: float) -> tuple[float, float]:
    return 110_574.0, 111_320.0 * math.cos(math.radians(lat))


def bbox_around_point(lat: float, lon: float, radius_m: float) -> tuple[float, float, float, float]:
    meters_lat, meters_lon = meters_per_degree(lat)
    dlat = radius_m / meters_lat
    dlon = radius_m / meters_lon
    return lon - dlon, lat - dlat, lon + dlon, lat + dlat


def parse_float_tag(tags: dict[str, str], *keys: str) -> float | None:
    for key in keys:
        value = tags.get(key)
        if not value:
            continue
        value = value.strip().replace(",", ".")
        if ";" in value:
            value = value.split(";", 1)[0]
        try:
            parsed = float(value)
        except ValueError:
            continue
        if parsed > 0:
            return parsed
    return None


def estimated_levels(tags: dict[str, str]) -> tuple[float, str]:
    explicit = parse_float_tag(tags, "building:levels", "levels")
    if explicit:
        return explicit, "tagged"

    height = parse_float_tag(tags, "height", "building:height")
    if height:
        return max(height / 3.0, 1.0), "height_default_3m"

    building = tags.get("building", "").lower()
    if building == "apartments":
        return 9.0, "default_apartments"
    if building in {"house", "detached", "semidetached_house", "terrace"}:
        return 2.0, "default_house"
    if building == "dormitory":
        return 5.0, "default_dormitory"
    if building in MIXED_USE_BUILDINGS or building == "residential":
        return 5.0, "default_residential_unknown"
    return 1.0, "default_other"


def residential_factor(tags: dict[str, str]) -> tuple[float, str]:
    building = tags.get("building", "").lower()
    amenity = tags.get("amenity", "").lower()
    shop = tags.get("shop", "").lower()
    office = tags.get("office", "").lower()

    if tags.get("residential") in {"yes", "apartments"}:
        return 1.0, "residential_tag"
    if building in RESIDENTIAL_BUILDINGS:
        return 1.0, "residential_building_type"
    if building in NON_RESIDENTIAL_BUILDINGS or amenity or shop or office:
        return 0.0, "non_residential_tags"
    if building in MIXED_USE_BUILDINGS:
        return 0.5, "unknown_or_mixed_building"
    return 0.0, "non_residential_default"


def building_weight(building: Building, cell_m: Polygon | None = None) -> tuple[float, dict[str, Any]]:
    factor, factor_reason = residential_factor(building.tags)
    if factor <= 0:
        return 0.0, {"residential_factor": factor, "factor_reason": factor_reason}

    geom = building.geom_m
    if cell_m is not None:
        geom = geom.intersection(cell_m)
    footprint_area = geom.area if not geom.is_empty else 0.0
    levels, levels_reason = estimated_levels(building.tags)
    weight = footprint_area * levels * factor
    return weight, {
        "footprint_area_m2": footprint_area,
        "levels": levels,
        "levels_reason": levels_reason,
        "residential_factor": factor,
        "factor_reason": factor_reason,
    }


def raster_cell_polygon(src: rasterio.DatasetReader, row: int, col: int) -> Polygon:
    left, bottom, right, top = rasterio.windows.bounds(Window(col, row, 1, 1), src.transform)
    return box(left, bottom, right, top)


def cells_intersecting_geometry(src: rasterio.DatasetReader, geom: Polygon) -> list[tuple[int, int, Polygon]]:
    west, south, east, north = geom.bounds
    window = from_bounds(west, south, east, north, transform=src.transform)
    col_start = max(math.floor(window.col_off), 0)
    row_start = max(math.floor(window.row_off), 0)
    col_stop = min(math.ceil(window.col_off + window.width), src.width)
    row_stop = min(math.ceil(window.row_off + window.height), src.height)

    cells = []
    for row in range(row_start, row_stop):
        for col in range(col_start, col_stop):
            cell = raster_cell_polygon(src, row, col)
            if geom.intersects(cell):
                cells.append((row, col, cell))
    return cells


def choose_target_building(
    buildings: list[Building],
    point_wgs84: Point,
    point_m: Point,
    nearest_m: float,
) -> tuple[Building | None, str]:
    containing = [b for b in buildings if b.geom_wgs84.covers(point_wgs84)]
    if containing:
        return max(containing, key=lambda b: b.geom_m.area), "coordinate_inside_building"

    candidates = [(b.geom_m.distance(point_m), b) for b in buildings]
    candidates = [(distance, building) for distance, building in candidates if distance <= nearest_m]
    if candidates:
        distance, building = min(candidates, key=lambda item: item[0])
        return building, f"nearest_building_within_{distance:.1f}m"
    return None, "no_building_found"


def estimate_population(
    lat: float,
    lon: float,
    year: int,
    resolution: str,
    cache_dir: Path,
    search_radius_m: float,
    nearest_m: float,
) -> dict[str, Any]:
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:32636", always_xy=True)
    point_wgs84 = Point(lon, lat)
    point_m = transform(transformer.transform, point_wgs84)

    search_bbox = bbox_around_point(lat, lon, search_radius_m)
    osm = query_overpass_buildings(*search_bbox)
    buildings = parse_buildings(osm, transformer)
    target, target_match = choose_target_building(buildings, point_wgs84, point_m, nearest_m)

    raster_path = source_raster_path(year, resolution, cache_dir)
    with rasterio.open(raster_path) as src:
        sample = next(src.sample([(lon, lat)]))
        containing_cell_population = float(sample[0])
        nodata = src.nodata if src.nodata is not None else NODATA_FALLBACK
        if containing_cell_population == nodata:
            containing_cell_population = 0.0

        if target is None:
            return {
                "status": "cell_only",
                "reason": target_match,
                "coordinate": {"lat": lat, "lon": lon},
                "worldpop_year": year,
                "worldpop_resolution": resolution,
                "containing_cell_population": containing_cell_population,
                "osm_buildings_considered": len(buildings),
            }

        cells = cells_intersecting_geometry(src, target.geom_wgs84)
        estimated_population = 0.0
        cell_rows = []
        for row, col, cell_wgs84 in cells:
            cell_population = float(src.read(1, window=Window(col, row, 1, 1))[0, 0])
            if cell_population == nodata:
                cell_population = 0.0

            cell_m = transform(transformer.transform, cell_wgs84)
            relevant_buildings = [b for b in buildings if b.geom_wgs84.intersects(cell_wgs84)]
            weights = []
            target_weight = 0.0
            target_details = {}
            for building in relevant_buildings:
                weight, details = building_weight(building, cell_m)
                weights.append(weight)
                if building.osm_ref == target.osm_ref:
                    target_weight = weight
                    target_details = details

            total_weight = sum(weights)
            share = target_weight / total_weight if total_weight > 0 else 0.0
            contribution = cell_population * share
            estimated_population += contribution
            cell_rows.append(
                {
                    "row": row,
                    "col": col,
                    "cell_population": cell_population,
                    "target_weight": target_weight,
                    "total_residential_weight": total_weight,
                    "share": share,
                    "population_contribution": contribution,
                    "buildings_in_cell": len(relevant_buildings),
                    "target_weight_details": target_details,
                }
            )

    full_weight, full_weight_details = building_weight(target)
    low = estimated_population * 0.6
    high = estimated_population * 1.6
    confidence = "medium"
    if not full_weight_details or full_weight_details.get("levels_reason", "").startswith("default"):
        confidence = "low"
    if estimated_population == 0:
        confidence = "low"

    return {
        "status": "building_estimate",
        "coordinate": {"lat": lat, "lon": lon},
        "worldpop_year": year,
        "worldpop_resolution": resolution,
        "containing_cell_population": containing_cell_population,
        "building_estimated_population": estimated_population,
        "suggested_range": {"low": low, "high": high},
        "confidence": confidence,
        "target_match": target_match,
        "target_building": {
            "osm_ref": target.osm_ref,
            "name": target.tags.get("name") or target.tags.get("name:uk") or target.tags.get("name:en") or "",
            "building": target.tags.get("building", ""),
            "residential": target.tags.get("residential", ""),
            "building_levels": target.tags.get("building:levels", ""),
            "height": target.tags.get("height", ""),
            "footprint_area_m2": target.geom_m.area,
            "weight": full_weight,
            "weight_details": full_weight_details,
        },
        "cells_used": cell_rows,
        "osm_buildings_considered": len(buildings),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lat", type=float, required=True)
    parser.add_argument("--lon", type=float, required=True)
    parser.add_argument("--year", type=int, default=DEFAULT_YEAR, choices=range(2015, 2031))
    parser.add_argument("--resolution", choices=("100m", "1km"), default=DEFAULT_RESOLUTION)
    parser.add_argument("--source-cache-dir", type=Path, default=DEFAULT_SOURCE_CACHE_DIR)
    parser.add_argument("--search-radius-m", type=float, default=250.0)
    parser.add_argument("--nearest-m", type=float, default=25.0)
    parser.add_argument("--json", action="store_true", help="Print full JSON instead of a summary.")
    return parser.parse_args()


def print_summary(result: dict[str, Any]) -> None:
    print(f"Status: {result['status']}")
    print(f"Coordinate: {result['coordinate']['lat']}, {result['coordinate']['lon']}")
    print(f"WorldPop: {result['worldpop_year']} {result['worldpop_resolution']}")
    print(f"Containing cell population: {result['containing_cell_population']:.1f}")

    if result["status"] != "building_estimate":
        print(f"Reason: {result['reason']}")
        print(f"OSM buildings considered: {result['osm_buildings_considered']}")
        return

    building = result["target_building"]
    print(f"Target building: {building['osm_ref']}")
    if building["name"]:
        print(f"Name: {building['name']}")
    print(f"Building tag: {building['building'] or '(missing)'}")
    print(f"Footprint area: {building['footprint_area_m2']:.1f} m2")
    print(f"Estimated population: {result['building_estimated_population']:.1f}")
    print(
        "Suggested range: "
        f"{result['suggested_range']['low']:.0f}-{result['suggested_range']['high']:.0f}"
    )
    print(f"Confidence: {result['confidence']}")
    print(f"Match: {result['target_match']}")
    print(f"WorldPop cells used: {len(result['cells_used'])}")
    print(f"OSM buildings considered: {result['osm_buildings_considered']}")


def main() -> None:
    args = parse_args()
    result = estimate_population(
        lat=args.lat,
        lon=args.lon,
        year=args.year,
        resolution=args.resolution,
        cache_dir=args.source_cache_dir,
        search_radius_m=args.search_radius_m,
        nearest_m=args.nearest_m,
    )
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print_summary(result)


if __name__ == "__main__":
    main()
