#!/usr/bin/env node
/**
 * Build VERA AssetCard-compatible rows from the full Kyiv infrastructure CSV.
 *
 * Input:  data/databases/pg/data/kyiv_infrastructure.csv
 *         data/databases/lite/deps_sqlite.sql
 * Output: src/data/generated/full-infrastructure-cards.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT = join(ROOT, "data/databases/pg/data/kyiv_infrastructure.csv");
const DEPS_INPUT = join(ROOT, "data/databases/lite/deps_sqlite.sql");
const OUTPUT = join(ROOT, "src/data/generated/full-infrastructure-cards.json");

const SERVICE_CLASS = {
  hospital: 1,
  clinic: 0.78,
  pharmacy: 0.62,
  fire_station: 0.86,
  police: 0.82,
  museum: 0.54,
  school: 0.72,
  kindergarten: 0.68,
  university: 0.68,
  substation: 0.86,
  railway: 0.72,
  bus_stop: 0.42,
  post_office: 0.48,
  supermarket: 0.66,
  water_fountain: 0.45,
};

const TYPE_RADIUS_M = {
  hospital: 2000,
  clinic: 1200,
  pharmacy: 800,
  fire_station: 2200,
  police: 2000,
  museum: 1200,
  school: 1400,
  kindergarten: 1200,
  university: 1600,
  substation: 2500,
  railway: 1800,
  bus_stop: 500,
  post_office: 900,
  supermarket: 1000,
  water_fountain: 500,
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === "\"" && text[i + 1] === "\"") {
        cell += "\"";
        i += 1;
      } else if (ch === "\"") {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === "\"") {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function statusFromDb(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "offline" || raw === "critical") return "offline";
  if (raw === "degraded" || raw === "maintenance") return "degraded";
  if (raw === "unknown") return "unknown";
  return "operational";
}

function assetTypeFromSubtype(subtype) {
  const s = String(subtype ?? "");
  if (s === "hospital") return "hospital";
  if (s === "clinic") return "clinic";
  if (s === "pharmacy") return "pharmacy";
  if (s === "fire_station") return "fire_station";
  if (s === "police") return "police";
  if (s === "museum") return "museum";
  if (s === "post_office") return "post_office";
  if (s === "bus_stop") return "bus_stop";
  if (s === "supermarket") return "supermarket";
  if (s === "water_fountain") return "water_fountain";
  if (s === "substation") return "substation";
  if (s === "power_plant") return "power_plant";
  if (s === "water_treatment" || s === "water_works") return "water_works";
  if (s === "wastewater" || s === "wastewater_plant") return "wastewater";
  if (s === "water_pump_station" || s === "pumping_station") return "pumping_station";
  if (s === "bridge") return "bridge";
  if (s === "heating_plant") return "heating_plant";
  if (s === "telecom_hub") return "telecom";
  return "other";
}

function inferZone(lat, lng) {
  if (lat > 50.5 && lng < 30.55) return "Obolon";
  if (lat > 50.5 && lng >= 30.55) return "Desna";
  if (lat > 50.46 && lng < 30.45) return "Sviatoshyn";
  if (lat > 50.46 && lng < 30.55) return "Shevchenko";
  if (lat > 50.46) return "Dnipro";
  if (lat > 50.43 && lng < 30.5) return "Solomianskyi";
  if (lat > 50.43 && lng < 30.55) return "Pechersk";
  if (lat > 50.43) return "Darnytsia";
  if (lng < 30.55) return "Holosiiv";
  return "Darnytsia";
}

function criticalityFor(type, subtype, metadata, status) {
  const service = SERVICE_CLASS[subtype] ?? (type === "critical" ? 0.58 : type === "utilities" ? 0.72 : 0.42);
  const statusBoost = status === "offline" ? 0.3 : status === "degraded" ? 0.16 : status === "unknown" ? 0.06 : 0;
  const tagBoost = Math.min(0.14, Object.keys(metadata).length / 120);
  return Math.min(1, +(0.18 + service * 0.5 + statusBoost + tagBoost).toFixed(4));
}

function safeJson(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function depKind(value) {
  const raw = String(value ?? "").trim();
  if (
    raw === "powers" ||
    raw === "supplies_water" ||
    raw === "provides_access" ||
    raw === "feeds_heat" ||
    raw === "depends_on"
  ) {
    return raw;
  }
  return "other";
}

function loadDependencies() {
  const sql = readFileSync(DEPS_INPUT, "utf8");
  const deps = [];
  const pattern =
    /INSERT INTO infrastructure_dependencies \(id, source_id, target_id, kind, weight, reason\) VALUES \('[^']+', '([^']+)', '([^']+)', '([^']+)', ([\d.]+), '[^']*'\);/g;
  let match;
  while ((match = pattern.exec(sql)) !== null) {
    deps.push({
      sourceId: match[1],
      targetId: match[2],
      kind: depKind(match[3]),
      weight: Number(match[4]) || 0.5,
    });
  }
  return deps;
}

const text = readFileSync(INPUT, "utf8");
const rows = parseCsv(text);
const header = rows.shift();
const index = Object.fromEntries(header.map((name, i) => [name, i]));

const cards = rows.flatMap((row) => {
  const lat = Number(row[index.latitude]);
  const lng = Number(row[index.longitude]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const id = row[index.id];
  const name = row[index.name] || `${row[index.subtype]} ${id.slice(0, 8)}`;
  const dbType = row[index.type] || "critical";
  const subtype = row[index.subtype] || "unknown";
  const metadata = safeJson(row[index.metadata]);
  const status = statusFromDb(row[index.status]);
  const criticality = criticalityFor(dbType, subtype, metadata, status);
  const radius = TYPE_RADIUS_M[subtype] ?? 900;
  const radiusKm = radius / 1000;
  const populationAffected = Math.round(3300 * Math.PI * radiusKm * radiusKm);

  return [{
    id,
    osm_type: null,
    osm_id: null,
    name,
    name_native: metadata["name:uk"] && metadata["name:uk"] !== name ? metadata["name:uk"] : null,
    type: assetTypeFromSubtype(subtype),
    lat: +lat.toFixed(7),
    lng: +lng.toFixed(7),
    criticality,
    criticality_breakdown: {
      population_component: +(Math.min(0.25, populationAffected / 500000 * 0.35)).toFixed(4),
      service_class: +((SERVICE_CLASS[subtype] ?? 0.45) * 0.3).toFixed(4),
      dependency_fanout: 0,
      capacity_component: row[index.capacity] ? 0.05 : 0,
      total: criticality,
    },
    metrics: {
      source_type: dbType,
      subtype,
      capacity: row[index.capacity] || "unknown",
      year_built: row[index.year_built] || "unknown",
    },
    tags: metadata,
    status,
    state_confidence: row[index.status] ? 0.82 : 0.55,
    evidence: [{
      source: "sample",
      detail: row[index.status]
        ? `Database status: ${row[index.status]}`
        : "Loaded from full Kyiv infrastructure database",
    }],
    radius_m: radius,
    population_affected: populationAffected,
    zones: [inferZone(lat, lng)],
    downstream: [],
    upstream: [],
    source: row[index.real] === "false" ? "synthetic-db" : "kyiv-infrastructure-db",
    harvested_at: new Date().toISOString(),
  }];
});

const cardById = new Map(cards.map((card) => [card.id, card]));
const dependencies = loadDependencies();

for (const dep of dependencies) {
  const dependent = cardById.get(dep.sourceId);
  const provider = cardById.get(dep.targetId);
  if (!dependent || !provider || dependent.id === provider.id) continue;

  dependent.upstream.push({
    assetId: provider.id,
    kind: dep.kind,
    weight: dep.weight,
  });

  provider.downstream.push({
    assetId: dependent.id,
    kind: dep.kind,
    weight: dep.weight,
  });
}

for (const card of cards) {
  const fanout = card.downstream.length + card.upstream.length;
  card.criticality_breakdown.dependency_fanout = +(Math.min(1, fanout / 20) * 0.2).toFixed(4);
  card.criticality_breakdown.total = +Math.min(
    1,
    card.criticality + card.criticality_breakdown.dependency_fanout,
  ).toFixed(4);
  card.criticality = card.criticality_breakdown.total;
}

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(cards, null, 2)}\n`, "utf8");
console.log(`[build-full-infrastructure-cards] Wrote ${cards.length} cards and ${dependencies.length} dependencies -> ${OUTPUT}`);
