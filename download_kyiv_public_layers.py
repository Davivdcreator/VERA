#!/usr/bin/env python3
"""
Download public OSM layers for Kyiv and write safe graph starter files.

The public-services output keeps facility names and coarse grid cells. The
power output is intentionally aggregate-only: no exact plant/substation names,
coordinates, or plant-to-building dependency links are written.
"""

from __future__ import annotations

import csv
import json
import math
import ssl
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path


OUT_DIR = Path("data/kyiv_public_layers")
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Approximate Kyiv city bbox: south, west, north, east.
BBOX = (50.213, 30.239, 50.590, 30.826)
GRID_DEGREES = 0.05


PUBLIC_FACILITY_QUERY = f"""
[out:json][timeout:180];
(
  nwr["amenity"~"^(hospital|clinic|doctors|school|university|college|kindergarten|townhall|police|fire_station|post_office|social_facility)$"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  nwr["healthcare"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  nwr["building"~"^(hospital|school|university|college|kindergarten|public|government)$"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
);
out tags center qt;
"""

POWER_AGGREGATE_QUERY = f"""
[out:json][timeout:180];
(
  nwr["power"~"^(plant|substation|generator)$"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
);
out tags center qt;
"""


def overpass(query: str) -> dict:
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    request = urllib.request.Request(
        OVERPASS_URL,
        data=data,
        headers={"User-Agent": "kyiv-public-layer-downloader/1.0"},
    )
    context = ssl.create_default_context(cafile=ca_bundle())
    with urllib.request.urlopen(request, timeout=240, context=context) as response:
        return json.loads(response.read().decode("utf-8"))


def ca_bundle() -> str | None:
    try:
        import certifi

        return certifi.where()
    except ImportError:
        return None


def element_lon_lat(element: dict) -> tuple[float | None, float | None]:
    if "lon" in element and "lat" in element:
        return float(element["lon"]), float(element["lat"])
    center = element.get("center") or {}
    if "lon" in center and "lat" in center:
        return float(center["lon"]), float(center["lat"])
    return None, None


def grid_id(lon: float, lat: float) -> str:
    south, west, _north, _east = BBOX
    x = math.floor((lon - west) / GRID_DEGREES)
    y = math.floor((lat - south) / GRID_DEGREES)
    return f"kyiv_grid_{x:02d}_{y:02d}"


def classify_public(tags: dict) -> tuple[str, str]:
    amenity = tags.get("amenity")
    healthcare = tags.get("healthcare")
    building = tags.get("building")

    if amenity in {"hospital", "clinic", "doctors"} or healthcare:
        return "healthcare", healthcare or amenity or ""
    if amenity in {"school", "university", "college", "kindergarten"}:
        return "education", amenity
    if building in {"school", "university", "college", "kindergarten"}:
        return "education", building
    if amenity in {"townhall", "police", "fire_station", "post_office", "social_facility"}:
        return "public_service", amenity
    if building in {"public", "government"}:
        return "public_service", building
    return "other_public", amenity or healthcare or building or ""


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_public_outputs(osm: dict) -> None:
    rows = []
    grid_counts: dict[tuple[str, str, str], int] = defaultdict(int)
    seen = set()

    for element in osm.get("elements", []):
        tags = element.get("tags") or {}
        lon, lat = element_lon_lat(element)
        if lon is None or lat is None:
            continue

        ref = f"{element.get('type')}/{element.get('id')}"
        if ref in seen:
            continue
        seen.add(ref)

        category, subtype = classify_public(tags)
        gid = grid_id(lon, lat)
        grid_counts[(gid, category, subtype)] += 1
        rows.append(
            {
                "facility_id": f"osm_{element.get('type')}_{element.get('id')}",
                "osm_ref": ref,
                "category": category,
                "subtype": subtype,
                "name": tags.get("name") or tags.get("name:uk") or tags.get("name:en") or "",
                "operator": tags.get("operator") or "",
                "ownership": tags.get("ownership") or "",
                "addr_street": tags.get("addr:street") or "",
                "addr_housenumber": tags.get("addr:housenumber") or "",
                "grid_id": gid,
                "power_source_id": "",
                "power_source_name": "",
                "power_zone_id": "",
                "power_connection_type": "",
                "backup_power": "",
                "backup_power_capacity_kw": "",
                "dependency_confidence": "",
                "dependency_notes": "",
                "source": "OpenStreetMap Overpass API",
            }
        )

    with (OUT_DIR / "kyiv_public_facilities_redacted.csv").open("w", newline="", encoding="utf-8") as f:
        fieldnames = [
            "facility_id",
            "osm_ref",
            "category",
            "subtype",
            "name",
            "operator",
            "ownership",
            "addr_street",
            "addr_housenumber",
            "grid_id",
            "power_source_id",
            "power_source_name",
            "power_zone_id",
            "power_connection_type",
            "backup_power",
            "backup_power_capacity_kw",
            "dependency_confidence",
            "dependency_notes",
            "source",
        ]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(sorted(rows, key=lambda row: (row["category"], row["subtype"], row["name"])))

    with (OUT_DIR / "kyiv_public_facility_grid_counts.csv").open("w", newline="", encoding="utf-8") as f:
        fieldnames = ["grid_id", "category", "subtype", "count", "source"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for (gid, category, subtype), count in sorted(grid_counts.items()):
            writer.writerow(
                {
                    "grid_id": gid,
                    "category": category,
                    "subtype": subtype,
                    "count": count,
                    "source": "OpenStreetMap Overpass API",
                }
            )


def write_power_aggregate(osm: dict) -> None:
    by_type = Counter()
    by_source = Counter()

    for element in osm.get("elements", []):
        tags = element.get("tags") or {}
        power_type = tags.get("power") or "unknown"
        by_type[power_type] += 1
        if tags.get("generator:source"):
            by_source[tags["generator:source"]] += 1

    with (OUT_DIR / "kyiv_power_infrastructure_aggregate.csv").open("w", newline="", encoding="utf-8") as f:
        fieldnames = ["metric", "value", "count", "source"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for value, count in sorted(by_type.items()):
            writer.writerow(
                {
                    "metric": "osm_power_type",
                    "value": value,
                    "count": count,
                    "source": "OpenStreetMap Overpass API",
                }
            )
        for value, count in sorted(by_source.items()):
            writer.writerow(
                {
                    "metric": "osm_generator_source",
                    "value": value,
                    "count": count,
                    "source": "OpenStreetMap Overpass API",
                }
            )


def write_graph_seed() -> None:
    rows = [
        {
            "from_node_type": "power_resilience_zone",
            "from_id": "kyiv_power_zone_unassigned",
            "edge_type": "supplies_public_services_aggregate",
            "to_node_type": "grid_cell",
            "to_id": "*",
            "weight": "",
            "confidence": "placeholder_requires_authorized_internal_data",
            "notes": "No plant-to-building dependency is inferred from public data.",
        },
        {
            "from_node_type": "grid_cell",
            "from_id": "*",
            "edge_type": "contains_public_facility_count",
            "to_node_type": "facility_category",
            "to_id": "*",
            "weight": "facility_count",
            "confidence": "public_osm",
            "notes": "Join to kyiv_public_facility_grid_counts.csv.",
        },
    ]
    with (OUT_DIR / "graph_seed_edges.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    public_osm = overpass(PUBLIC_FACILITY_QUERY)
    time.sleep(5)
    power_osm = overpass(POWER_AGGREGATE_QUERY)

    write_json(
        OUT_DIR / "metadata.json",
        {
            "created_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "area": "Kyiv, Ukraine",
            "bbox_south_west_north_east": BBOX,
            "grid_degrees": GRID_DEGREES,
            "sources": [
                "https://www.openstreetmap.org",
                "https://overpass-api.de",
            ],
            "safety_note": (
                "Public-service facility outputs are redacted to coarse grid cells. "
                "Power infrastructure output is aggregate-only and contains no exact "
                "names, coordinates, or dependency links."
            ),
        },
    )
    write_public_outputs(public_osm)
    write_power_aggregate(power_osm)
    write_graph_seed()


if __name__ == "__main__":
    main()
