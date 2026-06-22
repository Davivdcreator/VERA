/**
 * VERA — Damage Detection Runner
 * Node 22, native fetch, @supabase/supabase-js (already a dep).
 *
 * Pipeline:
 *   1. Load assets from src/data/generated/cards.json
 *   2. Fetch FIRMS clusters + Telegram reports
 *   3. Fuse → damage zones
 *   4. Match assets (haversine ≤ radius_m)
 *   5. Persist to Supabase (unless --dry-run or no service-role key)
 *
 * Env:
 *   SUPABASE_URL            – Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY – service-role key (bypasses RLS)
 *   FIRMS_MAP_KEY           – NASA FIRMS MAP key
 *   TELEGRAM_API_KEY        – Valkyrie tg-search key
 *
 * Flags:
 *   --dry-run   Compute + print zones, no DB writes
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

import { fetchFirmsDetections, clusterFirms } from './sources/firms.mjs';
import { fetchTelegramReports } from './sources/telegram.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Config / flags
// ─────────────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');

const __dirname = dirname(fileURLToPath(import.meta.url));
const CARDS_PATH = join(__dirname, '../src/data/generated/cards.json');

// ─────────────────────────────────────────────────────────────────────────────
// Haversine (metres)
// ─────────────────────────────────────────────────────────────────────────────

function haversineMetres(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @returns {Array<{id:string,name:string,type:string,lat:number,lng:number,criticality:number}>}
 */
function loadAssets() {
  const raw = JSON.parse(readFileSync(CARDS_PATH, 'utf8'));
  return raw.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    lat: a.lat,
    lng: a.lng,
    criticality: a.criticality ?? 0,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Fusion: FIRMS clusters + Telegram reports → damage zones
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Telegram zone radius when no FIRMS cluster is nearby.
 */
const TG_ZONE_RADIUS_M = 2500;

/**
 * Maximum distance between a Telegram geo-centroid and an existing zone centre
 * for the report to be considered "inside" that zone.
 */
const TG_MERGE_RADIUS_M = 5000;

/**
 * @param {Array<ReturnType<typeof clusterFirms>[0]>} firmsClusters
 * @param {Awaited<ReturnType<typeof fetchTelegramReports>>} telegramReports
 * @param {ReturnType<typeof loadAssets>} assets
 * @returns {Array<DamageZone>}
 *
 * @typedef {{
 *   lat: number,
 *   lng: number,
 *   radius_m: number,
 *   severity: number,
 *   confidence: number,
 *   source: 'firms'|'telegram'|'fused'|'sample',
 *   title: string,
 *   summary: string,
 *   keywords: string[],
 *   evidence: Array<{source:string,detail:string,ts:string,url?:string}>,
 *   affected: Array<{assetId:string,name:string,type:string,estDamage:number,distanceM:number}>,
 * }} DamageZone
 */
function fuseZones(firmsClusters, telegramReports, assets) {
  // ── 1. Seed zones from FIRMS clusters ────────────────────────────────────
  /** @type {DamageZone[]} */
  const zones = firmsClusters.map((cluster) => ({
    lat: cluster.lat,
    lng: cluster.lng,
    radius_m: cluster.radius_m,
    severity: cluster.intensity,       // (0,1), frp-derived
    confidence: 0.65,                  // FIRMS alone: moderate confidence
    source: 'firms',
    title: '',                         // filled later
    summary: '',
    keywords: ['fire', 'thermal-anomaly'],
    evidence: [...cluster.evidence],
    affected: [],
  }));

  // ── 2. Integrate Telegram reports ────────────────────────────────────────
  const tgWithGeo  = telegramReports.filter((r) => r.lat != null && r.lng != null);
  const tgNoGeo    = telegramReports.filter((r) => r.lat == null || r.lng == null);

  // Reports with geo: try to merge into an existing zone, else create a new one
  for (const report of tgWithGeo) {
    // Find the nearest existing zone whose centre is within TG_MERGE_RADIUS_M
    let nearest = null;
    let nearestDist = Infinity;
    for (const z of zones) {
      const d = haversineMetres(report.lat, report.lng, z.lat, z.lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = z;
      }
    }

    const tgEvidence = {
      source: 'telegram',
      detail: `[${report.channelName ?? 'unknown'}] ${report.content.slice(0, 200)}`,
      ts: report.ts ?? new Date().toISOString(),
      ...(report.url ? { url: report.url } : {}),
    };

    if (nearest && nearestDist <= TG_MERGE_RADIUS_M) {
      // Merge: boost confidence + severity, escalate source to fused
      nearest.source = 'fused';
      nearest.confidence = clamp(nearest.confidence + 0.15, 0, 1);
      nearest.severity   = clamp(nearest.severity   + 0.10, 0, 1);
      nearest.evidence.push(tgEvidence);
      if (report.district) nearest.keywords.push(report.district.toLowerCase());
      report.matched?.forEach((kw) => {
        if (!nearest.keywords.includes(kw)) nearest.keywords.push(kw);
      });
    } else {
      // Create a Telegram-only zone
      const newZone = {
        lat: report.lat,
        lng: report.lng,
        radius_m: TG_ZONE_RADIUS_M,
        severity: 0.45,
        confidence: 0.40,
        source: 'telegram',
        title: '',
        summary: '',
        keywords: ['telegram', ...(report.matched ?? [])],
        evidence: [tgEvidence],
        affected: [],
      };
      if (report.district) newZone.keywords.push(report.district.toLowerCase());
      zones.push(newZone);
    }
  }

  // Reports without geo: raise global confidence on all zones proportionally
  if (tgNoGeo.length > 0 && zones.length > 0) {
    const boost = clamp(0.05 * tgNoGeo.length, 0, 0.15);
    for (const z of zones) {
      z.confidence = clamp(z.confidence + boost, 0, 1);
    }
  }

  // ── 3. Build titles ───────────────────────────────────────────────────────
  for (const z of zones) {
    const nearest = nearestAsset(z.lat, z.lng, assets);
    z.title = nearest
      ? `Strike near ${nearest.name}`
      : `Strike at ${z.lat.toFixed(4)},${z.lng.toFixed(4)}`;

    const srcLabel = z.source === 'fused'
      ? 'FIRMS + Telegram-corroborated'
      : z.source === 'telegram'
        ? 'Telegram-reported'
        : 'FIRMS thermal-anomaly';

    z.summary =
      `${srcLabel} damage zone. Severity ${(z.severity * 100).toFixed(0)}%, ` +
      `confidence ${(z.confidence * 100).toFixed(0)}%. ` +
      `Evidence: ${z.evidence.length} signal(s).`;
  }

  return zones;
}

/** Return the asset closest to (lat, lng). */
function nearestAsset(lat, lng, assets) {
  let best = null;
  let bestDist = Infinity;
  for (const a of assets) {
    const d = haversineMetres(lat, lng, a.lat, a.lng);
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * For each zone, find assets within radius_m and compute estDamage.
 * Mutates zone.affected in place.
 */
function matchAssets(zones, assets) {
  for (const zone of zones) {
    zone.affected = [];
    for (const asset of assets) {
      const dist = haversineMetres(zone.lat, zone.lng, asset.lat, asset.lng);
      if (dist <= zone.radius_m) {
        const ratio = dist / zone.radius_m;
        const estDamage = clamp(zone.severity * Math.sqrt(1 - ratio), 0, 1);
        zone.affected.push({
          assetId: asset.id,
          name: asset.name,
          type: asset.type,
          estDamage: Math.round(estDamage * 1000) / 1000,
          distanceM: Math.round(dist),
        });
      }
    }
    // Sort by estDamage desc
    zone.affected.sort((a, b) => b.estDamage - a.estDamage);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sample mode — synthesize 3 realistic zones near the highest-criticality assets
// ─────────────────────────────────────────────────────────────────────────────

function buildSampleZones(assets) {
  // Pick the top-3 assets by criticality as zone seeds
  const top3 = [...assets]
    .sort((a, b) => b.criticality - a.criticality)
    .slice(0, 3);

  const sampleTemplates = [
    {
      severity: 0.82,
      confidence: 0.88,
      source: 'fused',
      radius_m: 1800,
      keywords: ['strike', 'missile', 'fire', 'explosion', 'thermal-anomaly'],
      summary_suffix: 'FIRMS thermal anomaly (FRP 85 MW) corroborated by 3 Telegram reports.',
    },
    {
      severity: 0.61,
      confidence: 0.72,
      source: 'firms',
      radius_m: 1400,
      keywords: ['fire', 'thermal-anomaly', 'drone'],
      summary_suffix: 'FIRMS VIIRS hotspot cluster (FRP 42 MW, 4 pixels).',
    },
    {
      severity: 0.47,
      confidence: 0.55,
      source: 'telegram',
      radius_m: 2500,
      keywords: ['strike', 'explosion', 'attack', 'обстріл'],
      summary_suffix: 'Telegram district-level report, no FIRMS corroboration.',
    },
  ];

  const now = new Date().toISOString();

  return top3.map((asset, i) => {
    const tmpl = sampleTemplates[i];
    // Jitter the zone centre slightly from the asset location
    const jitterLat = (Math.random() - 0.5) * 0.006; // ±~330 m
    const jitterLng = (Math.random() - 0.5) * 0.008;

    const zone = {
      lat: asset.lat + jitterLat,
      lng: asset.lng + jitterLng,
      radius_m: tmpl.radius_m,
      severity: tmpl.severity,
      confidence: tmpl.confidence,
      source: tmpl.source,
      title: `Strike near ${asset.name}`,
      summary:
        `Sample damage zone near ${asset.name} (criticality ${asset.criticality.toFixed(2)}). ` +
        tmpl.summary_suffix,
      keywords: tmpl.keywords,
      evidence: [
        {
          source: 'sample',
          detail: `Synthetic detection near ${asset.name} for development/preview.`,
          ts: now,
        },
      ],
      affected: [],
    };
    return zone;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase persistence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * State ordering for "take the max" logic.
 * Higher index = worse state.
 */
const STATE_ORDER = ['operational', 'degraded', 'offline'];

function maxState(a, b) {
  const ia = STATE_ORDER.indexOf(a);
  const ib = STATE_ORDER.indexOf(b);
  return ia > ib ? a : b;
}

/**
 * Severity → asset_state escalation thresholds.
 * @param {number} severity 0..1
 * @param {string} currentState
 * @returns {string}
 */
function estimateState(severity, currentState) {
  let targetState;
  if (severity >= 0.75) targetState = 'offline';
  else if (severity >= 0.40) targetState = 'degraded';
  else targetState = 'operational';
  return maxState(currentState ?? 'operational', targetState);
}

async function persist(zones, assets) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log('[detect] No SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — skipping DB write.');
    return;
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  // ── a. Clear prior auto events ────────────────────────────────────────────
  const { error: delErr } = await supabase
    .from('damage_events')
    .delete()
    .neq('source', 'sample');

  if (delErr) {
    console.error('[detect] delete error:', delErr.message);
    return;
  }

  // ── b. Filter zones to insert ─────────────────────────────────────────────
  const toInsert = zones.filter(
    (z) => z.affected.length >= 1 || z.severity >= 0.6
  );

  if (toInsert.length === 0) {
    console.log('[detect] No qualifying zones to insert.');
    return;
  }

  // ── c. Insert damage_events ───────────────────────────────────────────────
  const rows = toInsert.map((z) => ({
    lat: z.lat,
    lng: z.lng,
    radius_m: z.radius_m,
    severity: z.severity,
    confidence: z.confidence,
    source: z.source,
    title: z.title,
    summary: z.summary,
    keywords: z.keywords,
    evidence: z.evidence,
    affected: z.affected,
    detected_at: new Date().toISOString(),
  }));

  const { error: insErr } = await supabase.from('damage_events').insert(rows);
  if (insErr) {
    console.error('[detect] insert error:', insErr.message);
    return;
  }
  console.log(`[detect] Inserted ${rows.length} damage_event(s).`);

  // ── d. Raise asset_state for affected assets ───────────────────────────────
  // Build a map: assetId → { severity, evidence }
  /** @type {Map<string,{severity:number,evidenceItems:Array}>} */
  const assetUpdates = new Map();

  for (const z of toInsert) {
    for (const aff of z.affected) {
      const existing = assetUpdates.get(aff.assetId) ?? { severity: 0, evidenceItems: [] };
      existing.severity = Math.max(existing.severity, z.severity);
      existing.evidenceItems.push({
        source: z.source,
        detail: `Damage zone "${z.title}" — estDamage ${(aff.estDamage * 100).toFixed(0)}%, dist ${aff.distanceM} m`,
        ts: new Date().toISOString(),
      });
      assetUpdates.set(aff.assetId, existing);
    }
  }

  const assetMap = new Map(assets.map((a) => [a.id, a]));

  for (const [assetId, update] of assetUpdates.entries()) {
    // Fetch current asset_state to apply "max" logic
    const { data: rows, error: fetchErr } = await supabase
      .from('assets')          // table name per the VERA schema
      .select('status, evidence')
      .eq('id', assetId)
      .limit(1);

    if (fetchErr) {
      // Table may not exist yet (pre-migration). Warn and skip.
      console.warn(`[detect] asset fetch error for ${assetId}:`, fetchErr.message);
      continue;
    }

    if (!rows || rows.length === 0) continue;
    const current = rows[0];

    const newState = estimateState(update.severity, current.status ?? 'operational');
    const newEvidence = [
      ...(Array.isArray(current.evidence) ? current.evidence : []),
      ...update.evidenceItems,
    ];

    const { error: updErr } = await supabase
      .from('assets')
      .update({ status: newState, evidence: newEvidence })
      .eq('id', assetId);

    if (updErr) {
      console.warn(`[detect] asset update error for ${assetId}:`, updErr.message);
    }
  }

  console.log(`[detect] Updated asset_state for ${assetUpdates.size} asset(s).`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // ── 1. Load assets ─────────────────────────────────────────────────────────
  const assets = loadAssets();
  console.log(`[detect] Loaded ${assets.length} assets.`);

  // ── 2. Determine sample mode ───────────────────────────────────────────────
  const sampleMode = !process.env.FIRMS_MAP_KEY && !process.env.TELEGRAM_API_KEY;

  let zones;

  if (sampleMode) {
    console.log('[detect] No API keys — sample mode: synthesizing zones.');
    zones = buildSampleZones(assets);
    matchAssets(zones, assets);
  } else {
    // ── 3. Fetch signals ──────────────────────────────────────────────────────
    console.log('[detect] Fetching FIRMS detections…');
    const firmsDetections = await fetchFirmsDetections();
    console.log(`[detect]   FIRMS detections: ${firmsDetections.length}`);

    const firmsClusters = clusterFirms(firmsDetections);
    console.log(`[detect]   FIRMS clusters:   ${firmsClusters.length}`);

    console.log('[detect] Fetching Telegram reports…');
    const telegramReports = await fetchTelegramReports();
    console.log(`[detect]   Telegram reports: ${telegramReports.length}`);

    // ── 4. Fuse ───────────────────────────────────────────────────────────────
    zones = fuseZones(firmsClusters, telegramReports, assets);
    console.log(`[detect] Fused zones: ${zones.length}`);

    // ── 5. Match assets ───────────────────────────────────────────────────────
    matchAssets(zones, assets);
  }

  // ── 6. Print results ────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════');
  console.log(` VERA Detection Run — ${new Date().toISOString()}`);
  console.log(` Mode: ${sampleMode ? 'SAMPLE' : 'LIVE'}${DRY_RUN ? ' | DRY-RUN' : ''}`);
  console.log('════════════════════════════════════════════════════════════\n');

  for (const [i, z] of zones.entries()) {
    console.log(`Zone #${i + 1}  [${z.source.toUpperCase()}]`);
    console.log(`  Title      : ${z.title}`);
    console.log(`  Position   : ${z.lat.toFixed(5)}, ${z.lng.toFixed(5)}  radius=${z.radius_m} m`);
    console.log(`  Severity   : ${(z.severity * 100).toFixed(0)}%   Confidence: ${(z.confidence * 100).toFixed(0)}%`);
    console.log(`  Keywords   : ${z.keywords.join(', ')}`);
    console.log(`  Summary    : ${z.summary}`);
    console.log(`  Evidence   : ${z.evidence.length} item(s)`);
    if (z.affected.length > 0) {
      console.log(`  Affected assets (${z.affected.length}):`);
      for (const a of z.affected) {
        console.log(`    • ${a.name} [${a.type}]  estDamage=${(a.estDamage * 100).toFixed(1)}%  dist=${a.distanceM} m`);
      }
    } else {
      console.log('  Affected assets: none within radius');
    }
    console.log();
  }

  // ── 7. Persist (skip in dry-run) ────────────────────────────────────────────
  if (DRY_RUN) {
    console.log('[detect] --dry-run: skipping DB writes.');
    return;
  }

  await persist(zones, assets);
}

main().catch((err) => {
  console.error('[detect] Fatal error:', err);
  process.exit(1);
});
