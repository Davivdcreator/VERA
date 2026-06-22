#!/usr/bin/env python3
"""
ETL script for Kyiv infrastructure data.
Combines OSM, fountains, transport stops, and public facilities into unified dataset.
"""

import csv
import json
import re
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path

# UUID namespace for deterministic IDs
NAMESPACE = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")

# Kyiv bbox (from metadata.json)
BBOX_SOUTH = 50.213
BBOX_WEST = 30.239
BBOX_NORTH = 50.59
BBOX_EAST = 30.826
GRID_SIZE = 0.05

# OSM tag to (type, subtype) mapping
OSM_TAG_MAPPING = {
    # Utilities
    "power=generator": ("utilities", "power_plant"),
    "power=plant": ("utilities", "power_plant"),
    "power=substation": ("utilities", "substation"),
    "man_made=pumping_station": ("utilities", "water_treatment"),
    # Transportation
    "railway=station": ("transportation", "railway"),
    "railway=halt": ("transportation", "railway"),
    "aeroway=aerodrome": ("transportation", "airport"),
    # Government
    "amenity=townhall": ("government", "townhall"),
    "amenity=post_office": ("government", "post_office"),
    # Critical
    "amenity=hospital": ("critical", "hospital"),
    "amenity=clinic": ("critical", "clinic"),
    "amenity=pharmacy": ("critical", "pharmacy"),
    "amenity=kindergarten": ("critical", "kindergarten"),
    "amenity=police": ("critical", "police"),
    "amenity=fire_station": ("critical", "fire_station"),
    "amenity=university": ("critical", "university"),
    "amenity=college": ("critical", "college"),
    "shop=supermarket": ("critical", "supermarket"),
    "shop=convenience": ("critical", "convenience_store"),
}

# Category to (type, subtype) mapping for public facilities
FACILITY_CATEGORY_MAPPING = {
    "education": ("critical", "school"),
    "healthcare": ("critical", "hospital"),
    "public_service": ("government", "public_facility"),
    "other_public": ("critical", "facility"),
}


def is_in_bbox(lat, lon):
    """Check if coordinates are within Kyiv bbox."""
    return (BBOX_SOUTH <= lat <= BBOX_NORTH and BBOX_WEST <= lon <= BBOX_EAST)


def grid_to_coords(grid_id):
    """Convert grid_id like 'kyiv_grid_04_05' to (lat, lon) centroid."""
    # grid_id format: kyiv_grid_XX_YY where XX is grid_x and YY is grid_y
    match = re.match(r"kyiv_grid_(-?\d+)_(-?\d+)", grid_id)
    if not match:
        return None, None
    grid_x = int(match.group(1))
    grid_y = int(match.group(2))
    lat_centroid = BBOX_SOUTH + 0.025 + grid_y * GRID_SIZE
    lon_centroid = BBOX_WEST + 0.025 + grid_x * GRID_SIZE
    return lat_centroid, lon_centroid


def generate_uuid(source, source_id):
    """Generate deterministic UUID from source and ID."""
    return str(uuid.uuid5(NAMESPACE, f"{source}:{source_id}"))


def parse_osm_file(filepath):
    """Parse OSM XML file and return list of infrastructure records."""
    records = []
    tree = ET.parse(filepath)
    root = tree.getroot()

    for node in root.findall("node"):
        lat = float(node.get("lat"))
        lon = float(node.get("lon"))
        node_id = node.get("id")

        # Skip nodes outside bbox
        if not is_in_bbox(lat, lon):
            continue

        # Collect all tags
        tags = {}
        for tag in node.findall("tag"):
            k = tag.get("k")
            v = tag.get("v")
            if k:
                tags[k] = v

        # Find matching infrastructure type
        infra_type = None
        subtype = None
        for tag_key, (t, s) in OSM_TAG_MAPPING.items():
            if "=" in tag_key:
                key, value = tag_key.split("=", 1)
                if tags.get(key) == value:
                    infra_type = t
                    subtype = s
                    break

        # Skip if no matching infrastructure tag
        if infra_type is None:
            continue

        # Get name: prefer Ukrainian name, then English, then brand
        name = tags.get("name:uk") or tags.get("name:en") or tags.get("name") or tags.get("brand") or None
        if not name:
            # Generate a name from tags if available
            if "ref" in tags:
                name = f"Node {node_id}"
            else:
                continue  # Skip nodes without names

        # Build location from address
        location_parts = []
        if tags.get("addr:street"):
            location_parts.append(tags["addr:street"])
        if tags.get("addr:housenumber"):
            location_parts.append(tags["addr:housenumber"])
        location = ", ".join(location_parts) if location_parts else None

        # Build metadata (all OSM tags except filtered ones)
        metadata_keys = {"name", "name:en", "name:uk", "brand", "addr:street", "addr:housenumber", "addr:city"}
        metadata = {k: v for k, v in tags.items() if k not in metadata_keys}

        record = {
            "id": generate_uuid("osm", node_id),
            "name": name,
            "type": infra_type,
            "subtype": subtype,
            "location": location,
            "latitude": lat,
            "longitude": lon,
            "capacity": None,
            "year_built": None,
            "status": None,
            "metadata": metadata,
        }
        records.append(record)

    return records


def parse_fountains_csv(filepath):
    """Parse fountains CSV and return list of infrastructure records."""
    records = []
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                lat = float(row["lat"])
                lon = float(row["lon"])
            except (ValueError, KeyError):
                continue

            if not is_in_bbox(lat, lon):
                continue

            # Status mapping
            status = None
            if row.get("status") == "працює":
                status = "operational"
            elif row.get("status") == "не працює":
                status = "offline"

            # Location
            location_parts = []
            if row.get("addressThoroughfare"):
                location_parts.append(row["addressThoroughfare"])
            if row.get("addressLocatorDesignator"):
                location_parts.append(row["addressLocatorDesignator"])
            location = ", ".join(location_parts) if location_parts else None

            # Capacity (well depth in meters)
            capacity = None
            if row.get("wellDepth"):
                try:
                    capacity = int(row["wellDepth"])
                except ValueError:
                    pass

            # Metadata
            metadata = {}
            if row.get("generator"):
                metadata["generator"] = row["generator"].upper() == "TRUE"
            if row.get("waterAnalysis"):
                metadata["waterAnalysis"] = row["waterAnalysis"]
            if row.get("organizationId"):
                metadata["organizationId"] = row["organizationId"]
            if row.get("organizationName"):
                metadata["organizationName"] = row["organizationName"]

            record = {
                "id": generate_uuid("fountain", row.get("uid", uuid.uuid4())),
                "name": f"Фountain {row.get('uid', 'unknown')}",
                "type": "utilities",
                "subtype": "water_fountain",
                "location": location,
                "latitude": lat,
                "longitude": lon,
                "capacity": capacity,
                "year_built": None,
                "status": status,
                "metadata": metadata if metadata else None,
            }
            records.append(record)

    return records


def parse_transport_stops_json(filepath):
    """Parse transport stops JSON and return list of infrastructure records."""
    records = []
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Type mapping: 0=bus, 1=trolleybus, 2=tram
    type_mapping = {0: "bus_stop", 1: "trolleybus_stop", 2: "tram_stop"}

    for stop in data:
        try:
            lat = float(stop["lat"])
            lon = float(stop["lon"])
        except (ValueError, KeyError):
            continue

        if not is_in_bbox(lat, lon):
            continue

        # Map type to subtype
        stop_type = stop.get("type")
        if stop_type is not None:
            try:
                stop_type_int = int(stop_type)
                subtype = type_mapping.get(stop_type_int, "transit_stop")
            except ValueError:
                subtype = "transit_stop"
        else:
            subtype = "transit_stop"

        # Location from address
        location = stop.get("addressThoroughfare")

        # Metadata
        metadata = {}
        if stop.get("code"):
            metadata["code"] = stop["code"]
        if stop.get("zoneId") is not None:
            metadata["zoneId"] = stop["zoneId"]
        if stop.get("wheelchairBoarding"):
            metadata["wheelchairBoarding"] = stop["wheelchairBoarding"]
        if stop.get("description"):
            metadata["description"] = stop["description"]

        record = {
            "id": generate_uuid("stop", stop.get("uid", uuid.uuid4())),
            "name": stop.get("label", f"Stop {stop.get('uid', 'unknown')}"),
            "type": "transportation",
            "subtype": subtype,
            "location": location,
            "latitude": lat,
            "longitude": lon,
            "capacity": None,
            "year_built": None,
            "status": None,
            "metadata": metadata if metadata else None,
        }
        records.append(record)

    return records


def parse_public_facilities_csv(filepath):
    """Parse public facilities CSV (grid-only) and return list of infrastructure records."""
    records = []
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            grid_id = row.get("grid_id")
            if not grid_id:
                continue

            lat, lon = grid_to_coords(grid_id)
            if lat is None or lon is None:
                continue

            if not is_in_bbox(lat, lon):
                continue

            category = row.get("category", "")
            subtype = row.get("subtype", "")

            # Map category to (type, default_subtype)
            if category in FACILITY_CATEGORY_MAPPING:
                infra_type, default_subtype = FACILITY_CATEGORY_MAPPING[category]
            else:
                infra_type, default_subtype = "critical", "facility"

            # Use subtype from CSV if available, otherwise use default
            final_subtype = subtype if subtype else default_subtype

            # Build location from address
            location_parts = []
            if row.get("addr_street"):
                location_parts.append(row["addr_street"])
            if row.get("addr_housenumber"):
                location_parts.append(row["addr_housenumber"])
            location = ", ".join(location_parts) if location_parts else None

            # Name
            name = row.get("name") or f"{subtype or category} in {grid_id}"

            # Metadata (only non-null fields)
            metadata = {"coord_precision": "grid_cell_0.05deg", "grid_id": grid_id}
            if row.get("osm_ref"):
                metadata["osm_ref"] = row["osm_ref"]
            if row.get("operator"):
                metadata["operator"] = row["operator"]
            if row.get("ownership"):
                metadata["ownership"] = row["ownership"]

            record = {
                "id": generate_uuid("facility", row.get("facility_id", uuid.uuid4())),
                "name": name,
                "type": infra_type,
                "subtype": final_subtype,
                "location": location,
                "latitude": lat,
                "longitude": lon,
                "capacity": None,
                "year_built": None,
                "status": None,
                "metadata": metadata,
            }
            records.append(record)

    return records


def write_sql_inserts(records, output_path):
    """Write records as SQL INSERT statements."""
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("-- Kyiv Infrastructure Import\n")
        f.write("-- Generated by etl_kyiv.py\n\n")
        f.write("BEGIN;\n\n")

        for record in records:
            # Build metadata JSON
            if record["metadata"]:
                items = []
                for k, v in record["metadata"].items():
                    v_escaped = str(v).replace('"', '\\"').replace('\n', '\\n')
                    items.append(f'"{k}": "{v_escaped}"')
                metadata_json = "E'{" + ", ".join(items) + "}'"
            else:
                metadata_json = "NULL"

            # Build location
            if record["location"]:
                loc_escaped = record["location"].replace("'", "''")
                location = f"'{loc_escaped}'"
            else:
                location = "NULL"

            # Build name with proper escaping
            name_escaped = record["name"].replace("'", "''")

            # Status
            if record["status"]:
                status = f"'{record['status']}'"
            else:
                status = "NULL"

            # Capacity and year_built
            capacity = "NULL" if record["capacity"] is None else str(record["capacity"])
            year_built = "NULL" if record["year_built"] is None else str(record["year_built"])

            sql = (
                f"INSERT INTO infrastructure (id, name, type, subtype, location, latitude, longitude, capacity, year_built, status, metadata) VALUES (\n"
                f"  '{record['id']}',\n"
                f"  E'{name_escaped}',\n"
                f"  '{record['type']}',\n"
                f"  '{record['subtype']}',\n"
                f"  {location},\n"
                f"  {record['latitude']},\n"
                f"  {record['longitude']},\n"
                f"  {capacity},\n"
                f"  {year_built},\n"
                f"  {status},\n"
                f"  {metadata_json}\n"
                f");\n\n"
            )

            f.write(sql)

        f.write("COMMIT;\n")


def write_csv(records, output_path):
    """Write records as CSV for psql COPY."""
    with open(output_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "id", "name", "type", "subtype", "location",
            "latitude", "longitude", "capacity", "year_built", "status", "metadata"
        ])

        for record in records:
            metadata = ""
            if record["metadata"]:
                metadata = json.dumps(record["metadata"], ensure_ascii=False)

            writer.writerow([
                record["id"],
                record["name"],
                record["type"],
                record["subtype"],
                record["location"] or "",
                record["latitude"],
                record["longitude"],
                record["capacity"] or "",
                record["year_built"] or "",
                record["status"] or "",
                metadata,
            ])


def main():
    base_path = Path("/Users/justmac/GitHub/hackathon/VERA")
    data_path = base_path / "data"

    all_records = []

    # 1. Parse OSM data
    print("Parsing OSM data...")
    osm_file = data_path / "osm" / "kyiv_infrastructure.osm"
    if osm_file.exists():
        osm_records = parse_osm_file(osm_file)
        print(f"  Found {len(osm_records)} OSM infrastructure nodes")
        all_records.extend(osm_records)
    else:
        print(f"  Warning: OSM file not found: {osm_file}")

    # 2. Parse fountains
    print("Parsing fountains...")
    fountain_file = data_path / "kyiv_resilience_data" / "kyivcity" / "biuvetni-kompleksy-dep-zhki" / "buvets_ff603658-be8d-49d5-951a-d3f034aed5a1.csv"
    if fountain_file.exists():
        fountain_records = parse_fountains_csv(fountain_file)
        print(f"  Found {len(fountain_records)} fountains")
        all_records.extend(fountain_records)
    else:
        print(f"  Warning: Fountain file not found: {fountain_file}")

    # 3. Parse transport stops
    print("Parsing transport stops...")
    stops_file = data_path / "kyiv_resilience_data" / "kyivcity" / "dani-pro-mistse-rozmishchennia-zupynok-miskoho-elektrychnoho-ta-avtomobilnoho-transpor-dep-transport" / "31725604_stops_269ffb2e-dac0-4978-9552-10d29a30724b.json"
    if stops_file.exists():
        stop_records = parse_transport_stops_json(stops_file)
        print(f"  Found {len(stop_records)} transport stops")
        all_records.extend(stop_records)
    else:
        print(f"  Warning: Stops file not found: {stops_file}")

    # 4. Parse public facilities
    print("Parsing public facilities...")
    facilities_file = data_path / "kyiv_public_layers" / "kyiv_public_facilities_redacted.csv"
    if facilities_file.exists():
        facility_records = parse_public_facilities_csv(facilities_file)
        print(f"  Found {len(facility_records)} public facilities")
        all_records.extend(facility_records)
    else:
        print(f"  Warning: Facilities file not found: {facilities_file}")

    print(f"\nTotal records: {len(all_records)}")

    # Check for duplicate UUIDs
    ids = [r["id"] for r in all_records]
    if len(ids) != len(set(ids)):
        print("Warning: Duplicate UUIDs detected!")
        from collections import Counter
        dupes = [id_ for id_, count in Counter(ids).items() if count > 1]
        print(f"  Duplicate IDs: {dupes[:10]}")

    # Verify bbox for all records
    out_of_bbox = sum(1 for r in all_records if not is_in_bbox(r["latitude"], r["longitude"]))
    if out_of_bbox > 0:
        print(f"Warning: {out_of_bbox} records outside Kyiv bbox")

    # Output SQL
    sql_path = base_path / "sql" / "kyiv_infrastructure_import.sql"
    sql_path.parent.mkdir(exist_ok=True)
    print(f"\nWriting SQL to {sql_path}...")
    write_sql_inserts(all_records, sql_path)

    # Output CSV
    csv_path = data_path / "kyiv_infrastructure.csv"
    print(f"Writing CSV to {csv_path}...")
    write_csv(all_records, csv_path)

    print("\nDone!")


if __name__ == "__main__":
    main()
