#!/usr/bin/env python3
"""
Generate fake Kyiv infrastructure CSV with realistic dependency chains.
Generates ~90 fake records across Kyiv (lat 50.3-50.6, lon 30.3-30.7).
"""

import csv
import random
import uuid
from pathlib import Path

# Kyiv bounds
LAT_MIN, LAT_MAX = 50.3, 50.6
LON_MIN, LON_MAX = 30.3, 30.7

INFRASTRUCTURE_TYPES = [
    # (type, subtype, count, name_prefix)
    ("utilities", "power_plant", 6, "Power Plant"),
    ("utilities", "water_pump_station", 12, "Pump Station"),
    ("utilities", "water_treatment_plant", 6, "Water Treatment"),
    ("utilities", "wastewater_plant", 4, "Wastewater"),
    ("utilities", "heating_plant", 6, "Heating Plant"),
    ("critical", "industrial_facility", 12, "Industrial"),
]


def random_coord():
    return round(random.uniform(LAT_MIN, LAT_MAX), 7), round(random.uniform(LON_MIN, LON_MAX), 7)


def generate_fake_records():
    records = []
    counter_by_subtype = {}

    for infra_type, subtype, count, name_prefix in INFRASTRUCTURE_TYPES:
        for i in range(1, count + 1):
            record_id = uuid.uuid4()
            lat, lon = random_coord()
            name = f"{name_prefix} {i}"
            location = ""
            capacity = ""
            year_built = str(random.randint(1970, 2020))
            status = "operational"
            metadata = '{}'

            records.append({
                "id": str(record_id),
                "name": name,
                "type": infra_type,
                "subtype": subtype,
                "location": location,
                "latitude": lat,
                "longitude": lon,
                "capacity": capacity,
                "year_built": year_built,
                "status": status,
                "metadata": metadata,
                "real": "false",
            })
            counter_by_subtype[subtype] = counter_by_subtype.get(subtype, 0) + 1

    return records


def write_csv(records, path: Path):
    fieldnames = ["id", "name", "type", "subtype", "location", "latitude", "longitude",
                  "capacity", "year_built", "status", "metadata", "real"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)
    print(f"Wrote {len(records)} records to {path}")


if __name__ == "__main__":
    records = generate_fake_records()

    # Write CSV to pg/data directory
    csv_path = Path(__file__).parent.parent / "databases" / "pg" / "data" / "fake_kyiv_infrastructure.csv"
    write_csv(records, csv_path)

    # Summary
    from collections import Counter
    by_subtype = Counter(r["subtype"] for r in records)
    print("\nGenerated records by subtype:")
    for subtype, count in sorted(by_subtype.items()):
        print(f"  {subtype}: {count}")
    print(f"\nTotal: {len(records)} records")
