#!/usr/bin/env node
/**
 * VERA Infrastructure Harvester
 * Region: Kyiv, Ukraine
 * Bbox: (50.36,30.30,50.56,30.75) — (south,west,north,east)
 *
 * Queries Overpass API for real public-infrastructure assets, normalises
 * them to VERA's asset schema, de-dupes, selects ~20 with type coverage,
 * and writes src/data/generated/assets.json.
 *
 * Runs with Node 22+ native fetch. No npm dependencies beyond Node builtins.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const OUT_DIR    = join(__dirname, '../src/data/generated');
const OUT_PATH   = join(OUT_DIR, 'assets.json');

// ── Overpass endpoints ────────────────────────────────────────────────────────
const PRIMARY = 'https://overpass-api.de/api/interpreter';
const MIRROR  = 'https://overpass.kumi.systems/api/interpreter';

// ── Kyiv bounding box (south,west,north,east) ────────────────────────────────
const BBOX = '50.36,30.30,50.56,30.75';

// ── Batched Overpass QL query ─────────────────────────────────────────────────
// `out center tags;` ensures ways/relations include a centroid lat/lon.
const QUERY = `
[out:json][timeout:25];
(
  node["amenity"="hospital"](${BBOX});
  way["amenity"="hospital"](${BBOX});
  relation["amenity"="hospital"](${BBOX});
  node["power"="plant"](${BBOX});
  way["power"="plant"](${BBOX});
  relation["power"="plant"](${BBOX});
  node["power"="substation"](${BBOX});
  way["power"="substation"](${BBOX});
  node["man_made"="water_works"](${BBOX});
  way["man_made"="water_works"](${BBOX});
  node["man_made"="wastewater_plant"](${BBOX});
  way["man_made"="wastewater_plant"](${BBOX});
  node["man_made"="pumping_station"](${BBOX});
  way["man_made"="pumping_station"](${BBOX});
  way["man_made"="bridge"]["name"](${BBOX});
  way["bridge"="yes"]["name"](${BBOX});
);
out center tags;
`.trim();

// ── VERA type mapping ─────────────────────────────────────────────────────────
function mapType(tags) {
  if (tags.amenity === 'hospital') return 'hospital';
  if (tags.power === 'plant') {
    if (tags['plant:output:hot_water'] && !tags['plant:output:electricity']) {
      return 'heating_plant';
    }
    return 'power_plant';
  }
  if (tags.power === 'substation')          return 'substation';
  if (tags.man_made === 'water_works')      return 'water_works';
  if (tags.man_made === 'wastewater_plant') return 'wastewater';
  if (tags.man_made === 'pumping_station')  return 'pumping_station';
  if (tags.man_made === 'bridge' || tags.bridge === 'yes') return 'bridge';
  return 'other';
}

// ── Fetch with GET + mirror fallback on 429/504 ──────────────────────────────
// Overpass reliably accepts GET requests with ?data=<urlencoded QL>
async function fetchOverpass(query) {
  const endpoints = [PRIMARY, MIRROR];
  for (const url of endpoints) {
    try {
      console.log(`  querying ${url} …`);
      // Overpass blocks Node's default User-Agent; POST with explicit UA works.
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'VERA-harvest/1.0 (civic-infrastructure-intelligence; osm-etiquette: single-batched-query)',
        },
        body: 'data=' + encodeURIComponent(query),
      });
      if (res.status === 429 || res.status === 504) {
        console.warn(`  ${res.status} from ${url} (rate-limited/timeout), trying mirror…`);
        // Brief back-off before mirror
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} from ${url} — ${text.slice(0, 300)}`);
      }
      return await res.json();
    } catch (err) {
      if (url === MIRROR) throw err;
      console.warn(`  Error from ${url}: ${err.message}. Trying mirror…`);
    }
  }
}

// ── Normalise a single OSM element to VERA asset schema ──────────────────────
function normalise(el) {
  const tags = el.tags || {};

  // Coordinates: nodes have lat/lon; ways/relations get center from `out center`
  let lat, lng;
  if (el.type === 'node') {
    lat = el.lat;
    lng = el.lon;
  } else if (el.center) {
    lat = el.center.lat;
    lng = el.center.lon;
  }
  if (lat == null || lng == null) return null;

  const type = mapType(tags);

  // Name resolution: prefer English variant, keep native separately
  const nameEn     = tags['name:en'] ?? null;
  const nameNative = tags.name       ?? null;
  const name       = nameEn ?? nameNative ?? `${type} #${el.id}`;
  const name_native = (nameNative && nameNative !== name) ? nameNative : null;

  return {
    osm_type:    el.type,            // "node" | "way" | "relation"
    osm_id:      el.id,
    name,
    name_native,
    type,
    lat:         +lat.toFixed(6),
    lng:         +lng.toFixed(6),
    tags,                            // raw tags — downstream metrics read these
  };
}

// ── Haversine distance in metres ─────────────────────────────────────────────
const EARTH_R = 6371000;

function haversineM(a, b) {
  const dLat = (b.lat - a.lat) * (Math.PI / 180);
  const dLng = (b.lng - a.lng) * (Math.PI / 180);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) *
    Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

// ── De-duplicate: same type + same name OR within 150 m ──────────────────────
function dedupe(assets) {
  const kept = [];
  for (const a of assets) {
    const isDupe = kept.some(
      k => k.type === a.type && (k.name === a.name || haversineM(k, a) < 150)
    );
    if (!isDupe) kept.push(a);
  }
  return kept;
}

// ── Quality score (prefer richly-tagged and named assets) ────────────────────
function qualityScore(a) {
  let s = 0;
  if (!a.name.startsWith(a.type + ' #'))    s += 3;  // has real name
  if (a.name_native)                         s += 1;
  if (a.tags.beds)                           s += 2;
  if (a.tags.voltage)                        s += 2;
  if (a.tags['plant:output:electricity'])    s += 2;
  if (a.tags['plant:output:hot_water'])      s += 1;
  if (a.tags.capacity)                       s += 1;
  if (a.tags.operator)                       s += 1;
  if (a.tags.website)                        s += 1;
  if (a.tags['addr:street'])                 s += 1;
  if (a.tags['plant:source'])                s += 1;
  return s;
}

// ── Select ~20 with guaranteed type coverage and per-type caps ───────────────
const REQUIRED_TYPES = ['hospital', 'power_plant', 'substation', 'water_works', 'wastewater', 'bridge'];
const TARGET = 20;

// How many slots each type can consume before we stop adding more of it.
// Ensures diversity rather than filling with 12 substations.
const TYPE_CAPS = {
  hospital:         4,
  power_plant:      4,
  substation:       4,
  water_works:      3,
  wastewater:       2,
  pumping_station:  2,
  bridge:           4,
  heating_plant:    2,
  telecom:          2,
  other:            2,
};

function select(assets) {
  const sorted = [...assets].sort((a, b) => qualityScore(b) - qualityScore(a));

  const chosen = new Set();
  const countByType = {};

  const add = (a) => {
    if (chosen.has(a)) return;
    countByType[a.type] = (countByType[a.type] || 0) + 1;
    chosen.add(a);
  };

  // Pass 1: guarantee at least one of each required type (best quality first)
  for (const rt of REQUIRED_TYPES) {
    const candidate = sorted.find(a => a.type === rt && !chosen.has(a));
    if (candidate) add(candidate);
  }

  // Pass 2: fill remaining slots, respecting per-type caps
  for (const a of sorted) {
    if (chosen.size >= TARGET) break;
    const cap = TYPE_CAPS[a.type] ?? 2;
    if ((countByType[a.type] || 0) < cap) {
      add(a);
    }
  }

  // Pass 3: if still short, relax caps and fill from highest quality
  if (chosen.size < TARGET) {
    for (const a of sorted) {
      if (chosen.size >= TARGET) break;
      add(a);
    }
  }

  return [...chosen].slice(0, TARGET);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' VERA Infrastructure Harvester — Kyiv, Ukraine');
  console.log(' Bbox:', BBOX);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. Fetch from Overpass (primary + mirror fallback)
  console.log('[1/5] Fetching from Overpass API…');
  const data = await fetchOverpass(QUERY);
  const elements = data?.elements ?? [];
  console.log(`      Raw elements: ${elements.length}\n`);

  // 2. Normalise to VERA schema
  console.log('[2/5] Normalising…');
  const normalised = elements.map(normalise).filter(Boolean);
  console.log(`      With coordinates: ${normalised.length}\n`);

  // 3. Drop unnamed assets unless they are the sole representative of a type
  console.log('[3/5] Filtering unnamed…');
  const typeCounts = {};
  for (const a of normalised) typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;

  const named = normalised.filter(a => {
    const hasFallbackName = a.name.startsWith(a.type + ' #');
    // Keep if it has a real name, OR if it's the only asset of its type
    return !hasFallbackName || typeCounts[a.type] === 1;
  });
  console.log(`      After filter: ${named.length}\n`);

  // 4. De-duplicate
  console.log('[4/5] De-duplicating (name + 150 m)…');
  const deduped = dedupe(named);
  console.log(`      After de-dup: ${deduped.length}\n`);

  // 5. Select ~20 with type coverage
  console.log('[5/5] Selecting up to', TARGET, 'with type coverage…');
  const selected = select(deduped);

  // ── Report ──────────────────────────────────────────────────────────────────
  const counts = {};
  for (const a of selected) counts[a.type] = (counts[a.type] || 0) + 1;

  console.log('\nType breakdown:');
  for (const [type, count] of Object.entries(counts).sort()) {
    console.log(`  ${type.padEnd(20)} ${count}`);
  }

  console.log('\nFinal asset list:');
  for (const a of selected) {
    const nameStr = a.name.length > 48 ? a.name.slice(0, 45) + '…' : a.name;
    console.log(`  [${a.type.padEnd(15)}]  ${nameStr.padEnd(48)}  ${a.lat}, ${a.lng}`);
  }

  // ── Write JSON ───────────────────────────────────────────────────────────────
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(selected, null, 2), 'utf8');
  console.log(`\nWrote ${selected.length} assets → ${OUT_PATH}`);
}

main().catch(err => {
  console.error('\nHarvest failed:', err.message);
  process.exit(1);
});
