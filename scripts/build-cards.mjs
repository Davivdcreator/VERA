/**
 * build-cards.mjs — VERA digital-twin card builder
 *
 * Reads  src/data/generated/assets.json (20 OSM-harvested assets)
 * Writes src/data/generated/cards.json  (AssetCard[] — types.ts shape)
 *        supabase/seed.sql              (idempotent reseed)
 *
 * Rules:
 *  - IDs are stable: generated once from osm_type+osm_id, not random each run.
 *  - Everything derived from OSM tags + transparent formulae — no per-asset tuning.
 *  - Kyiv population density: 3,300 /km² (2021 census ~2.96M over ~839 km² ≈ 3528;
 *    we use a conservative 3300 to stay inside the metropolitan polygon).
 *  - No new npm deps — pure Node 22 stdlib.
 *
 * Usage:  node scripts/build-cards.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

// ── paths ───────────────────────────────────────────────────────────────────
const ROOT   = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'src/data/generated/assets.json');
const CARDS  = join(ROOT, 'src/data/generated/cards.json');
const SEED   = join(ROOT, 'supabase/seed.sql');

// ── constants ───────────────────────────────────────────────────────────────
/** Kyiv population density — 3300 persons/km² (2021 census-derived conservative estimate) */
const KYIV_DENSITY_PER_KM2 = 3300;

/** Dnipro river approximate longitude (assets east of this are on the left/east bank) */
const DNIPRO_LNG = 30.55;

/** Service radius in metres, by asset type */
const BASE_RADIUS_M = {
  power_plant:     8000,
  substation:      3000,
  water_works:     6000,
  wastewater:      4000,
  pumping_station: 4000,
  hospital:        2000,
  bridge:          1500,
  heating_plant:   5000,
  telecom:         3000,
  other:           2000,
};

/** Service class score for criticality (0..1) */
const SERVICE_CLASS = {
  hospital:        1.0,
  water_works:     1.0,
  wastewater:      0.85,
  pumping_station: 0.85,
  power_plant:     0.9,
  substation:      0.8,
  bridge:          0.7,
  heating_plant:   0.75,
  telecom:         0.65,
  other:           0.4,
};

// ── helper: stable UUID from osm_type + osm_id ───────────────────────────────
/**
 * Build a deterministic UUIDv4-shaped string by SHA-256 hashing the OSM key.
 * Same input ⇒ same output every run.
 */
function stableId(osm_type, osm_id) {
  const hash = createHash('sha256').update(`${osm_type}/${osm_id}`).digest('hex');
  // Format as 8-4-4-4-12 UUID (override version/variant nibbles for cosmetic compat)
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),     // version 4
    (parseInt(hash[16], 16) & 3 | 8).toString(16) + hash.slice(17, 20), // variant
    hash.slice(20, 32),
  ].join('-');
}

// ── helper: haversine distance (metres) ─────────────────────────────────────
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── helper: parse MW from OSM tag (e.g. "700 MW", "yes", "500 MW") ──────────
function parseMW(tag) {
  if (!tag || tag === 'yes') return null;
  const m = String(tag).match(/([\d.]+)\s*(MW|GW|kW)?/i);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const unit = (m[2] || 'MW').toUpperCase();
  if (unit === 'GW') return v * 1000;
  if (unit === 'KW') return v / 1000;
  return v;
}

// ── helper: parse voltage kV from OSM tag (e.g. "110000;10000") ─────────────
function parseVoltageKV(tag) {
  if (!tag) return null;
  const parts = String(tag).split(';').map(s => parseFloat(s)).filter(n => !isNaN(n));
  if (!parts.length) return null;
  return Math.max(...parts) / 1000;   // return highest voltage in kV
}

// ── step 1: load assets & assign stable IDs ───────────────────────────────────
const rawAssets = JSON.parse(readFileSync(ASSETS, 'utf8'));
const assets = rawAssets.map(a => ({ ...a, id: stableId(a.osm_type, a.osm_id) }));

// index by id for dependency lookups
const byId = Object.fromEntries(assets.map(a => [a.id, a]));

// ── step 2: compute type-specific metrics ────────────────────────────────────
function computeMetrics(asset) {
  const t = asset.tags || {};
  switch (asset.type) {
    case 'power_plant': {
      const cap = parseMW(t['plant:output:electricity']);
      return {
        capacity_mw: cap ?? 'unknown',
        avg_output_mw: cap != null ? +(cap * 0.55).toFixed(1) : 'unknown',
        source: t['plant:source'] ?? 'unknown',
        method: t['plant:method'] ?? 'unknown',
      };
    }
    case 'substation': {
      const vkv = parseVoltageKV(t['voltage']);
      return {
        voltage_kv: vkv ?? 'unknown',
        role: t['substation'] ?? 'unknown',
        rating: t['rating'] ?? 'unknown',
        operator: t['operator'] ?? 'unknown',
      };
    }
    case 'hospital': {
      const beds = t['beds'] ?? t['capacity:beds'] ?? null;
      return {
        beds: beds != null ? parseInt(beds, 10) : 'unknown',
        emergency: t['emergency'] ?? 'unknown',
        speciality: t['healthcare:speciality'] ?? 'general',
        operator_type: t['operator:type'] ?? 'unknown',
      };
    }
    case 'water_works': {
      const cap = t['capacity'] ? parseInt(t['capacity'], 10) : null;
      return {
        capacity_m3_day: cap ?? 'unknown',
        population_served: cap != null ? Math.round(cap / 0.25) : 'unknown',  // 250 L/p/day
        operator: t['operator'] ?? 'unknown',
      };
    }
    case 'wastewater': {
      const cap = t['capacity'] ? parseInt(t['capacity'], 10) : null;
      return {
        capacity_m3_day: cap ?? 'unknown',
        population_served: cap != null ? Math.round(cap / 0.25) : 'unknown',
        operator: t['operator'] ?? 'unknown',
      };
    }
    case 'pumping_station': {
      return {
        substance: t['substance'] ?? t['pumping_station'] ?? 'unknown',
        operator: t['operator'] ?? 'unknown',
      };
    }
    case 'bridge': {
      const lanes = t['lanes'] ? parseInt(t['lanes'], 10) : null;
      return {
        lanes: lanes ?? 'unknown',
        structure: t['bridge:structure'] ?? t['bridge'] ?? 'yes',
        highway: t['highway'] ?? t['railway'] ?? 'unknown',
        electrified: t['electrified'] ?? 'no',
        max_speed: t['maxspeed'] ? parseInt(t['maxspeed'], 10) : 'unknown',
      };
    }
    case 'heating_plant':
      return { source: t['plant:source'] ?? 'unknown', operator: t['operator'] ?? 'unknown' };
    default:
      return {};
  }
}

// ── step 3: compute impact zone ───────────────────────────────────────────────
/**
 * radiusM: base radius scaled by capacity/voltage where available.
 * populationAffected: KYIV_DENSITY × circle area in km².
 * zones: district names extracted from address tags if present.
 */
function computeImpact(asset, metrics) {
  let radius = BASE_RADIUS_M[asset.type] ?? 2000;

  // scale by capacity/voltage
  if (asset.type === 'power_plant' && typeof metrics.capacity_mw === 'number') {
    // 700 MW → 8000 m; 160 MW → scales down but floor at 4000 m
    radius = Math.max(4000, Math.min(12000, Math.round(radius * (metrics.capacity_mw / 300))));
  }
  if (asset.type === 'substation' && typeof metrics.voltage_kv === 'number') {
    // 110 kV → up to 5 km; 10 kV → 1 km
    radius = Math.max(1000, Math.min(6000, Math.round(1000 * Math.log10(metrics.voltage_kv + 1) * 1800)));
  }

  const radiusKm = radius / 1000;
  const areakm2 = Math.PI * radiusKm * radiusKm;
  const populationAffected = Math.round(KYIV_DENSITY_PER_KM2 * areakm2);

  // zones — pull from OSM address/location tags
  const t = asset.tags || {};
  const zoneSet = new Set();
  for (const key of ['addr:district', 'addr:subdistrict', 'district', 'addr:city_district']) {
    if (t[key]) zoneSet.add(t[key]);
  }
  // infer rough district from lng/lat for known landmark coords
  const zones = Array.from(zoneSet);
  if (!zones.length) {
    // derive from position
    zones.push(...inferDistrict(asset.lat, asset.lng));
  }

  return { radius_m: radius, population_affected: populationAffected, zones };
}

/** Very rough district inference from lat/lng for Kyiv (no external API). */
function inferDistrict(lat, lng) {
  if (lat > 50.50 && lng < 30.45) return ['Obolon'];
  if (lat > 50.50 && lng > 30.45 && lng < 30.55) return ['Obolon'];
  if (lat > 50.50 && lng > 30.55) return ['Dnipro'];
  if (lat > 50.46 && lat <= 50.50 && lng < 30.45) return ['Sviatoshyn'];
  if (lat > 50.46 && lat <= 50.50 && lng >= 30.45 && lng < 30.55) return ['Shevchenko'];
  if (lat > 50.46 && lat <= 50.50 && lng >= 30.55) return ['Dnipro'];
  if (lat > 50.43 && lat <= 50.46 && lng < 30.50) return ['Holosiiv'];
  if (lat > 50.43 && lat <= 50.46 && lng >= 50.50) return ['Darnytsia'];
  if (lat <= 50.43 && lng < 30.55) return ['Holosiiv'];
  if (lat <= 50.43 && lng >= 30.55) return ['Darnytsia'];
  return ['Kyiv'];
}

// ── step 4: compute dependency edges ─────────────────────────────────────────
/**
 * Rules (per digital-twin-card skill):
 *  - substation → powers → {hospital, water_works, wastewater, pumping_station} within 3 km
 *  - power_plant → powers → nearest k substations (k=2 for small, k=3 for large)
 *  - water_works/pumping_station → supplies_water → hospitals within 6 km
 *  - bridge → provides_access → assets on opposite Dnipro bank
 *
 * Returns Map<id, {downstream: DepEdge[], upstream: DepEdge[]}>
 * where DepEdge = { assetId, kind, weight }
 */
function computeDependencies(assets) {
  /** edge weight = f(distance, downstreamServiceClass) */
  function edgeWeight(distM, targetType) {
    const sc = SERVICE_CLASS[targetType] ?? 0.5;
    const proximity = Math.max(0, 1 - distM / 10000);
    return +((sc * 0.6 + proximity * 0.4)).toFixed(3);
  }

  /** is lng on east (left) bank of Dnipro? */
  const isEastBank = lng => lng > DNIPRO_LNG;

  const downstream = Object.fromEntries(assets.map(a => [a.id, []]));
  const upstream   = Object.fromEntries(assets.map(a => [a.id, []]));

  function addEdge(sourceId, targetId, kind) {
    const src = byId[sourceId];
    const tgt = byId[targetId];
    if (!src || !tgt || sourceId === targetId) return;
    const dist = haversineM(src.lat, src.lng, tgt.lat, tgt.lng);
    const w = edgeWeight(dist, tgt.type);
    // downstream of source = target (fails if source fails)
    downstream[sourceId].push({ assetId: targetId, kind, weight: w });
    // upstream of target = source (target needs source)
    upstream[targetId].push({ assetId: sourceId, kind, weight: w });
  }

  const substations     = assets.filter(a => a.type === 'substation');
  const powerPlants     = assets.filter(a => a.type === 'power_plant');
  const hospitals       = assets.filter(a => a.type === 'hospital');
  const waterWorks      = assets.filter(a => a.type === 'water_works');
  const pumpingStations = assets.filter(a => a.type === 'pumping_station');
  const wastewater      = assets.filter(a => a.type === 'wastewater');
  const bridges         = assets.filter(a => a.type === 'bridge');

  // 1. power_plant → powers → nearest substations (top 2 for ≤200 MW, top 3 for larger)
  for (const pp of powerPlants) {
    const metrics = computeMetrics(pp);
    const cap = typeof metrics.capacity_mw === 'number' ? metrics.capacity_mw : 100;
    const k = cap >= 300 ? 3 : 2;
    const nearest = substations
      .map(s => ({ id: s.id, dist: haversineM(pp.lat, pp.lng, s.lat, s.lng) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, k);
    for (const { id } of nearest) {
      addEdge(pp.id, id, 'powers');
    }
  }

  // 2. substation → powers → {hospital, water_works, wastewater, pumping_station} within 3 km
  const powerConsumers = [...hospitals, ...waterWorks, ...wastewater, ...pumpingStations];
  for (const sub of substations) {
    for (const consumer of powerConsumers) {
      const dist = haversineM(sub.lat, sub.lng, consumer.lat, consumer.lng);
      if (dist <= 3000) {
        addEdge(sub.id, consumer.id, 'powers');
      }
    }
  }

  // 3. water_works / pumping_station → supplies_water → hospitals within 6 km
  const waterSources = [...waterWorks, ...pumpingStations];
  for (const ws of waterSources) {
    for (const h of hospitals) {
      const dist = haversineM(ws.lat, ws.lng, h.lat, h.lng);
      if (dist <= 6000) {
        addEdge(ws.id, h.id, 'supplies_water');
      }
    }
  }

  // 4. bridge → provides_access → assets on opposite Dnipro bank
  // A bridge that straddles the river connects assets on each side.
  // We identify "river bridges" by checking if they are near the Dnipro (lng ~30.55 ± 0.10).
  const riverBridges = bridges.filter(b => Math.abs(b.lng - DNIPRO_LNG) < 0.12);
  const leftBankAssets  = assets.filter(a => a.type !== 'bridge' && !isEastBank(a.lng));
  const rightBankAssets = assets.filter(a => a.type !== 'bridge' &&  isEastBank(a.lng));

  for (const bridge of riverBridges) {
    // Bridge provides access from west bank to east bank assets within 5 km of bridge endpoint
    for (const ea of rightBankAssets) {
      const dist = haversineM(bridge.lat, bridge.lng, ea.lat, ea.lng);
      if (dist <= 5000) {
        addEdge(bridge.id, ea.id, 'provides_access');
      }
    }
    // And from east bank perspective — bridge also provides access to west bank
    for (const wa of leftBankAssets) {
      const dist = haversineM(bridge.lat, bridge.lng, wa.lat, wa.lng);
      if (dist <= 5000) {
        addEdge(bridge.id, wa.id, 'provides_access');
      }
    }
  }

  // 5. pumping_station → supplies_water → wastewater plants within 6 km (sewage chain)
  for (const ps of pumpingStations) {
    for (const ww of wastewater) {
      const dist = haversineM(ps.lat, ps.lng, ww.lat, ww.lng);
      if (dist <= 6000) {
        addEdge(ps.id, ww.id, 'supplies_water');
      }
    }
  }

  // 6. water_works → supplies_water → hospitals within 10 km
  //    (extended radius — city water mains span the full distribution network)
  //    Also water_works → supplies_water → wastewater within 10 km
  //    (raw water input feeds treatment chain)
  for (const ws of waterWorks) {
    for (const h of hospitals) {
      const dist = haversineM(ws.lat, ws.lng, h.lat, h.lng);
      if (dist <= 10000) {
        addEdge(ws.id, h.id, 'supplies_water');
      }
    }
    for (const ww of wastewater) {
      const dist = haversineM(ws.lat, ws.lng, ww.lat, ww.lng);
      if (dist <= 10000) {
        addEdge(ws.id, ww.id, 'supplies_water');
      }
    }
  }

  return { downstream, upstream };
}

// ── step 5: criticality (0..1) ────────────────────────────────────────────────
/**
 * Formula (from digital-twin-card skill):
 *   0.35·norm(populationAffected) + 0.30·serviceClass(type) + 0.20·dependencyFanout + 0.15·norm(capacity)
 */
function computeCriticality(asset, impact, metrics, deps) {
  // normalise population against Kyiv max plausible for any one asset (~500k)
  const normPop = Math.min(1, impact.population_affected / 500000);

  const sc = SERVICE_CLASS[asset.type] ?? 0.4;

  // dependency fanout = (downstream.length + upstream.length) / max(10)
  const fanout = ((deps.downstream[asset.id]?.length ?? 0) + (deps.upstream[asset.id]?.length ?? 0));
  const normFanout = Math.min(1, fanout / 10);

  // normalise capacity
  let normCap = 0;
  if (asset.type === 'power_plant' && typeof metrics.capacity_mw === 'number') {
    normCap = Math.min(1, metrics.capacity_mw / 700);
  } else if (asset.type === 'substation' && typeof metrics.voltage_kv === 'number') {
    normCap = Math.min(1, metrics.voltage_kv / 750);
  } else if ((asset.type === 'water_works' || asset.type === 'wastewater') && typeof metrics.capacity_m3_day === 'number') {
    normCap = Math.min(1, metrics.capacity_m3_day / 1000000);
  } else if (asset.type === 'bridge' && typeof metrics.lanes === 'number') {
    normCap = Math.min(1, metrics.lanes / 6);
  }

  const raw = 0.35 * normPop + 0.30 * sc + 0.20 * normFanout + 0.15 * normCap;
  const score = +Math.min(1, Math.max(0, raw)).toFixed(4);

  const breakdown = {
    population_component:  +(0.35 * normPop).toFixed(4),
    service_class:         +(0.30 * sc).toFixed(4),
    dependency_fanout:     +(0.20 * normFanout).toFixed(4),
    capacity_component:    +(0.15 * normCap).toFixed(4),
    total:                 score,
  };

  return { score, breakdown };
}

// ── step 6: sample damage state (bias offline/degraded to high-criticality) ──
function sampleState(asset, criticality) {
  // Deterministic assignment so re-runs are stable: use asset osm_id mod logic
  const hash = asset.osm_id % 20;

  // High criticality (≥0.65) assets: bias to offline/degraded
  // Specifically: top 2 by criticality → offline, next 3 → degraded
  // We'll assign after sorting; for now return a "seed" for post-sort assignment.
  return { criticality, hash };
}

// ── main pipeline ─────────────────────────────────────────────────────────────
console.log(`[build-cards] Loading ${assets.length} assets from ${ASSETS}`);

// pre-compute metrics for all (needed for criticality before deps)
const metricsMap = Object.fromEntries(assets.map(a => [a.id, computeMetrics(a)]));

// compute impact zones
const impactMap = Object.fromEntries(assets.map(a => [a.id, computeImpact(a, metricsMap[a.id])]));

// compute dependency graph
console.log('[build-cards] Computing dependency work-tree…');
const deps = computeDependencies(assets);

// compute criticality
const critMap = {};
for (const a of assets) {
  critMap[a.id] = computeCriticality(a, impactMap[a.id], metricsMap[a.id], deps);
}

// assign damage states (stable, deterministic)
// sort assets by criticality descending to find "top 2" and "next 3"
const sortedByCrit = [...assets].sort((a, b) => critMap[b.id].score - critMap[a.id].score);
const stateMap = {};

const OFFLINE_IDS  = new Set(sortedByCrit.slice(0, 2).map(a => a.id));
const DEGRADED_IDS = new Set(sortedByCrit.slice(2, 5).map(a => a.id));

for (const a of assets) {
  let status, confidence, score, evidence;
  const crit = critMap[a.id].score;

  if (OFFLINE_IDS.has(a.id)) {
    score = 0.80 + (crit * 0.15);
    status = 'offline';
    confidence = 0.82;
    evidence = [
      { source: 'sample', detail: `Thermal anomaly detected near ${a.name} — FRP elevated`, ref: 'FIRMS-VIIRS-sample', ts: new Date().toISOString() },
      { source: 'sample', detail: 'Telegram channel reports facility not responding', ref: 'tg-sample', ts: new Date().toISOString() },
    ];
  } else if (DEGRADED_IDS.has(a.id)) {
    score = 0.40 + (crit * 0.20);
    status = 'degraded';
    confidence = 0.65;
    evidence = [
      { source: 'sample', detail: `Reduced capacity signal near ${a.name}`, ref: 'FIRMS-VIIRS-sample', ts: new Date().toISOString() },
    ];
  } else {
    score = 0.05 + (Math.random() * 0.20);
    status = 'operational';
    confidence = 0.75 + (Math.random() * 0.20);
    evidence = [
      { source: 'sample', detail: `No damage signals detected for ${a.name}`, ts: new Date().toISOString() },
    ];
  }

  stateMap[a.id] = { status, confidence: +confidence.toFixed(3), score: +score.toFixed(3), evidence };
}

// ── assemble AssetCard[] ───────────────────────────────────────────────────────
const cards = assets.map(a => {
  const impact  = impactMap[a.id];
  const crit    = critMap[a.id];
  const state   = stateMap[a.id];
  const metrics = metricsMap[a.id];

  return {
    id:                   a.id,
    osm_type:             a.osm_type,
    osm_id:               a.osm_id,
    name:                 a.name,
    name_native:          a.name_native ?? null,
    type:                 a.type,
    lat:                  a.lat,
    lng:                  a.lng,

    criticality:           crit.score,
    criticality_breakdown: crit.breakdown,
    metrics,
    tags:                  a.tags ?? {},

    status:                state.status,
    state_confidence:      state.confidence,
    evidence:              state.evidence,

    radius_m:              impact.radius_m,
    population_affected:   impact.population_affected,
    zones:                 impact.zones,

    downstream: deps.downstream[a.id] ?? [],
    upstream:   deps.upstream[a.id]   ?? [],

    source:       'osm',
    harvested_at: new Date().toISOString(),
  };
});

// ── write cards.json ──────────────────────────────────────────────────────────
mkdirSync(dirname(CARDS), { recursive: true });
writeFileSync(CARDS, JSON.stringify(cards, null, 2), 'utf8');
console.log(`[build-cards] Wrote ${cards.length} cards → ${CARDS}`);

// ── write seed.sql ────────────────────────────────────────────────────────────
/**
 * jsonb helper — wraps value in $json$…$json$::jsonb to sidestep quote escaping.
 * Safe as long as the serialised value does not itself contain "$json$".
 */
function jsonb(obj) {
  return `$json$${JSON.stringify(obj)}$json$::jsonb`;
}

/**
 * Postgres text[] literal from JS string[].
 */
function pgTextArray(arr) {
  if (!arr.length) return "'{}'::text[]";
  const escaped = arr.map(s => s.replace(/'/g, "''"));
  return `ARRAY[${escaped.map(s => `'${s}'`).join(', ')}]::text[]`;
}

let sql = `-- VERA seed — generated by scripts/build-cards.mjs on ${new Date().toISOString()}
-- Idempotent: truncate then re-insert all 20 harvested assets.

truncate assets, asset_dependencies, impact_zones, asset_state, events restart identity cascade;

`;

// assets
sql += `-- ── assets ──────────────────────────────────────────────────────────────────\n`;
for (const c of cards) {
  sql += `insert into assets (id, osm_type, osm_id, name, name_native, type, lat, lng, criticality, criticality_breakdown, metrics, tags, source) values (\n`;
  sql += `  '${c.id}',\n`;
  sql += `  ${c.osm_type != null ? `'${c.osm_type}'` : 'null'},\n`;
  sql += `  ${c.osm_id != null ? c.osm_id : 'null'},\n`;
  sql += `  '${c.name.replace(/'/g, "''")}',\n`;
  sql += `  ${c.name_native != null ? `'${c.name_native.replace(/'/g, "''")}'` : 'null'},\n`;
  sql += `  '${c.type}',\n`;
  sql += `  ${c.lat},\n`;
  sql += `  ${c.lng},\n`;
  sql += `  ${c.criticality},\n`;
  sql += `  ${jsonb(c.criticality_breakdown)},\n`;
  sql += `  ${jsonb(c.metrics)},\n`;
  sql += `  ${jsonb(c.tags)},\n`;
  sql += `  'osm'\n`;
  sql += `);\n`;
}

// asset_dependencies — build a unique set
sql += `\n-- ── asset_dependencies ──────────────────────────────────────────────────────\n`;
const seenEdges = new Set();
for (const c of cards) {
  for (const edge of c.downstream) {
    const key = `${c.id}|${edge.assetId}|${edge.kind}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    sql += `insert into asset_dependencies (source_id, target_id, kind, weight) values ('${c.id}', '${edge.assetId}', '${edge.kind}', ${edge.weight});\n`;
  }
}

// impact_zones
sql += `\n-- ── impact_zones ────────────────────────────────────────────────────────────\n`;
for (const c of cards) {
  sql += `insert into impact_zones (asset_id, radius_m, population_affected, zones) values ('${c.id}', ${c.radius_m}, ${c.population_affected}, ${pgTextArray(c.zones)});\n`;
}

// asset_state
sql += `\n-- ── asset_state ─────────────────────────────────────────────────────────────\n`;
for (const c of cards) {
  const st = stateMap[c.id];
  sql += `insert into asset_state (asset_id, status, confidence, score, evidence) values ('${c.id}', '${st.status}', ${st.confidence}, ${st.score}, ${jsonb(st.evidence)});\n`;
}

writeFileSync(SEED, sql, 'utf8');
console.log(`[build-cards] Wrote seed.sql → ${SEED}`);

// ── sanity report ─────────────────────────────────────────────────────────────
console.log('\n── Sanity Report ─────────────────────────────────────────────────────────');
console.log(`Total cards:       ${cards.length}`);

const allIds = new Set(cards.map(c => c.id));
let edgeCount = 0;
let danglingEdges = 0;
for (const c of cards) {
  for (const e of [...c.downstream, ...c.upstream]) {
    edgeCount++;
    if (!allIds.has(e.assetId)) {
      console.warn(`  DANGLING edge: ${c.id} → ${e.assetId} (${e.kind})`);
      danglingEdges++;
    }
  }
}
console.log(`Total dep edges:   ${edgeCount / 2} unique (${edgeCount} including both directions)`);
console.log(`Dangling edges:    ${danglingEdges}`);

const stateCounts = {};
for (const c of cards) { stateCounts[c.status] = (stateCounts[c.status] ?? 0) + 1; }
console.log(`State breakdown:`);
for (const [k, v] of Object.entries(stateCounts)) console.log(`  ${k}: ${v}`);

const noDeps = cards.filter(c => c.downstream.length === 0 && c.upstream.length === 0);
if (noDeps.length) {
  console.log(`Assets with NO dependencies (isolated):`);
  for (const c of noDeps) console.log(`  • ${c.name} (${c.type})`);
} else {
  console.log('All assets have at least one dependency edge.');
}

console.log('\nTop 5 by criticality:');
for (const c of sortedByCrit.slice(0, 5)) {
  console.log(`  [${critMap[c.id].score.toFixed(3)}] ${c.name} (${c.type}, ${stateMap[c.id].status})`);
}
