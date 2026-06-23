/**
 * NASA FIRMS thermal-anomaly adapter — key-gated stub.
 *
 * Endpoint (when FIRMS_MAP_KEY is set, server-side only):
 *   GET https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{AREA}/{DAY_RANGE}
 *
 *   SOURCE:    VIIRS_NOAA20_NRT  (375 m resolution, preferred)
 *              VIIRS_SNPP_NRT    (375 m, fallback)
 *              MODIS_NRT         (1 km, last resort)
 *   AREA:      west,south,east,north  — Kyiv bbox: 30.30,50.36,30.75,50.56
 *   DAY_RANGE: 1–5  (integer, most recent N days)
 *   DATE:      optional YYYY-MM-DD suffix — omit for latest
 *
 * Full example:
 *   https://firms.modaps.eosdis.nasa.gov/api/area/csv/MYKEY/VIIRS_NOAA20_NRT/30.30,50.36,30.75,50.56/1
 *
 * CSV columns returned:
 *   latitude, longitude, bright_ti4, scan, track, acq_date, acq_time,
 *   satellite, confidence, version, bright_ti5, frp, daynight
 *
 * Quota: 5000 transactions / 10 min per key.
 *
 * When the key is absent this module returns a sample detection near the
 * highest-criticality offline assets so the damage-state-fusion pipeline
 * still produces realistic output. Same shape — live data drops in with zero
 * code change.
 *
 * NEVER import this module in the client bundle (SPA). It belongs in:
 *   - supabase/functions/ingest-firms/index.ts   (edge function)
 *   - scripts/fetch-firms.mjs                    (local ingestion script)
 */

export interface FirmsDetection {
  /** WGS-84 latitude */
  lat: number;
  /** WGS-84 longitude */
  lng: number;
  /** Fire Radiative Power (MW) */
  frp: number;
  /** Confidence: 'low' | 'nominal' | 'high' (VIIRS) or 0–100 (MODIS) */
  confidence: string | number;
  /** Acquisition date YYYY-MM-DD */
  acq_date: string;
  /** Acquisition time HHMM UTC */
  acq_time: string;
  /** Satellite identifier */
  satellite: string;
}

/** Kyiv bounding box for FIRMS area queries */
export const KYIV_BBOX = '30.30,50.36,30.75,50.56';

/** Preferred FIRMS data source */
export const FIRMS_SOURCE = 'VIIRS_NOAA20_NRT';

/** Base URL for FIRMS area CSV endpoint */
const FIRMS_BASE = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';

function getServerEnv(name: string): string | undefined {
  const processRef = (globalThis as {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  return processRef?.env?.[name];
}

/**
 * Fetch FIRMS thermal detections for the Kyiv region.
 *
 * Returns sample data when FIRMS_MAP_KEY is not set (safe-default mode).
 *
 * @param dayRange - How many days of data to fetch (1–5). Defaults to 1.
 * @param date     - Optional specific date (YYYY-MM-DD). Omit for most recent.
 */
export async function fetchFirmsDetections(
  dayRange = 1,
  date?: string,
): Promise<FirmsDetection[]> {
  const key = getServerEnv('FIRMS_MAP_KEY');

  if (!key) {
    console.warn('[firms] FIRMS_MAP_KEY not set — returning sample detections.');
    return sampleDetections();
  }

  const dateSegment = date ? `/${date}` : '';
  const url = `${FIRMS_BASE}/${key}/${FIRMS_SOURCE}/${KYIV_BBOX}/${dayRange}${dateSegment}`;

  let text: string;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[firms] HTTP ${res.status} from FIRMS API`);
      return sampleDetections();
    }
    text = await res.text();
  } catch (err) {
    console.error('[firms] Network error fetching FIRMS:', err);
    return sampleDetections();
  }

  return parseFirmsCSV(text);
}

/**
 * Parse the FIRMS area CSV response into structured detections.
 * Handles the standard VIIRS_NOAA20_NRT column order.
 */
function parseFirmsCSV(csv: string): FirmsDetection[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map(h => h.trim());
  const idxLat  = header.indexOf('latitude');
  const idxLng  = header.indexOf('longitude');
  const idxFrp  = header.indexOf('frp');
  const idxConf = header.indexOf('confidence');
  const idxDate = header.indexOf('acq_date');
  const idxTime = header.indexOf('acq_time');
  const idxSat  = header.indexOf('satellite');

  const detections: FirmsDetection[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 7) continue;
    detections.push({
      lat:        parseFloat(cols[idxLat] ?? '0'),
      lng:        parseFloat(cols[idxLng] ?? '0'),
      frp:        parseFloat(cols[idxFrp] ?? '0'),
      confidence: cols[idxConf]?.trim() ?? 'nominal',
      acq_date:   cols[idxDate]?.trim() ?? '',
      acq_time:   cols[idxTime]?.trim() ?? '',
      satellite:  cols[idxSat]?.trim()  ?? '',
    });
  }
  return detections;
}

/**
 * Sample detections — used when FIRMS_MAP_KEY is unset.
 *
 * Placed near the Kyiv CHP-5 Power Plant and Pivdennyi Bridge (high-criticality
 * assets that are seeded as `offline` in the sample state) to make the demo
 * read true without any live API calls.
 */
function sampleDetections(): FirmsDetection[] {
  const now = new Date();
  const acq_date = now.toISOString().slice(0, 10);
  const acq_time = now.toISOString().slice(11, 16).replace(':', '');

  return [
    // Near Kyiv CHP-5 (lat 50.394, lng 30.568)
    {
      lat: 50.393,
      lng: 30.570,
      frp: 48.3,
      confidence: 'high',
      acq_date,
      acq_time,
      satellite: 'NOAA-20',
    },
    // Near Pivdennyi Bridge (lat 50.397, lng 30.572)
    {
      lat: 50.396,
      lng: 30.573,
      frp: 22.1,
      confidence: 'nominal',
      acq_date,
      acq_time,
      satellite: 'NOAA-20',
    },
    // Weak signal near Bilychi water works (lat 50.477, lng 30.339) — degraded
    {
      lat: 50.476,
      lng: 30.341,
      frp: 9.5,
      confidence: 'low',
      acq_date,
      acq_time,
      satellite: 'Suomi-NPP',
    },
  ];
}
