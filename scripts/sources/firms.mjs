/**
 * NASA FIRMS thermal/fire detection ingestion + clustering adapter.
 * Node 22, native fetch, no npm deps.
 *
 * Reads process.env.FIRMS_MAP_KEY for authentication.
 * Returns [] (never throws) when the key is absent or any request fails.
 */

// ---------------------------------------------------------------------------
// Haversine distance helper (returns metres)
// ---------------------------------------------------------------------------

/**
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} distance in metres
 */
function haversineMetres(lat1, lng1, lat2, lng2) {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

/**
 * Parse a FIRMS area CSV string into an array of row objects keyed by header.
 * Robust to Windows line endings, empty lines, and BOM.
 *
 * @param {string} csvText
 * @returns {Array<Record<string,string>>}
 */
function parseCsv(csvText) {
  // Strip BOM if present
  const text = csvText.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);

  // Find the header line (first non-empty line)
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "") {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const headers = lines[headerIdx].split(",").map((h) => h.trim());
  const rows = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;
    const values = line.split(",");
    if (values.length < headers.length) continue; // malformed row
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Convert a raw FIRMS CSV row into a normalized detection object.
 * Returns null for rows that cannot be parsed (missing lat/lng/frp).
 *
 * @param {Record<string,string>} row
 * @returns {{ lat: number, lng: number, frp: number, confidence: string, acqAt: string } | null}
 */
function normalizeRow(row) {
  const lat = parseFloat(row["latitude"]);
  const lng = parseFloat(row["longitude"]);
  const frp = parseFloat(row["frp"]);

  if (!isFinite(lat) || !isFinite(lng) || !isFinite(frp)) return null;

  // acq_date: "YYYY-MM-DD", acq_time: "HHMM" (zero-padded to 4 digits)
  const acqDate = (row["acq_date"] ?? "").trim();
  const acqTime = (row["acq_time"] ?? "0000").trim().padStart(4, "0");
  let acqAt = "";
  if (acqDate) {
    const hh = acqTime.slice(0, 2);
    const mm = acqTime.slice(2, 4);
    acqAt = `${acqDate}T${hh}:${mm}:00Z`;
  }

  const confidence = (row["confidence"] ?? "").trim().toLowerCase();

  return { lat, lng, frp, confidence, acqAt };
}

// ---------------------------------------------------------------------------
// Public API: fetchFirmsDetections
// ---------------------------------------------------------------------------

const FIRMS_API_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const FIRMS_SOURCE = "VIIRS_NOAA20_NRT";

/**
 * Fetch FIRMS thermal detections for a bounding box via the NASA FIRMS area API.
 * Parses the CSV and returns normalized detection objects.
 *
 * @param {{ west: number, south: number, east: number, north: number }} [bbox]
 * @param {number} [days=2]  1–5
 * @returns {Promise<Array<{ lat: number, lng: number, frp: number, confidence: string, acqAt: string }>>}
 */
export async function fetchFirmsDetections(
  bbox = { west: 30.10, south: 50.15, east: 30.95, north: 50.65 },
  days = 2
) {
  const key = process.env.FIRMS_MAP_KEY;
  if (!key) {
    return [];
  }

  const { west, south, east, north } = bbox;
  // Endpoint: /csv/{MAP_KEY}/{SOURCE}/{W,S,E,N}/{DAY_RANGE}
  const url = `${FIRMS_API_BASE}/${key}/${FIRMS_SOURCE}/${west},${south},${east},${north}/${days}`;

  let csvText;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      // Non-2xx: log but don't throw
      console.error(`[FIRMS] HTTP ${resp.status} for ${url}`);
      return [];
    }
    csvText = await resp.text();
  } catch (err) {
    console.error("[FIRMS] Fetch error:", err.message ?? err);
    return [];
  }

  let rows;
  try {
    rows = parseCsv(csvText);
  } catch (err) {
    console.error("[FIRMS] CSV parse error:", err.message ?? err);
    return [];
  }

  const detections = [];
  for (const row of rows) {
    const det = normalizeRow(row);
    if (det !== null) {
      detections.push(det);
    }
  }

  return detections;
}

// ---------------------------------------------------------------------------
// Public API: clusterFirms
// ---------------------------------------------------------------------------

const CLUSTER_RADIUS_M = 1200; // ~1.2 km greedy absorption radius

/**
 * Greedy frp-sorted clustering of FIRMS detections into candidate damage zones.
 *
 * Algorithm:
 *  1. Sort detections by frp descending.
 *  2. For each unclustered point, seed a new cluster; absorb all remaining
 *     unclustered points within CLUSTER_RADIUS_M (1.2 km).
 *  3. Compute frp-weighted centroid, radius, and intensity.
 *
 * @param {Array<{ lat: number, lng: number, frp: number, confidence: string, acqAt: string }>} detections
 * @returns {Array<{
 *   lat: number,
 *   lng: number,
 *   radius_m: number,
 *   intensity: number,
 *   count: number,
 *   frpSum: number,
 *   evidence: Array<{ source: string, detail: string, ts: string }>
 * }>}
 */
export function clusterFirms(detections) {
  if (!detections || detections.length === 0) return [];

  // Sort descending by frp so the hottest point seeds first
  const sorted = [...detections].sort((a, b) => b.frp - a.frp);

  const assigned = new Uint8Array(sorted.length); // 0 = unassigned
  const clusters = [];

  for (let i = 0; i < sorted.length; i++) {
    if (assigned[i]) continue;

    const seed = sorted[i];
    const members = [seed];
    assigned[i] = 1;

    for (let j = i + 1; j < sorted.length; j++) {
      if (assigned[j]) continue;
      const dist = haversineMetres(seed.lat, seed.lng, sorted[j].lat, sorted[j].lng);
      if (dist <= CLUSTER_RADIUS_M) {
        members.push(sorted[j]);
        assigned[j] = 1;
      }
    }

    // frp-weighted centroid
    let frpSum = 0;
    let wLat = 0;
    let wLng = 0;
    for (const m of members) {
      frpSum += m.frp;
      wLat += m.lat * m.frp;
      wLng += m.lng * m.frp;
    }
    const lat = wLat / frpSum;
    const lng = wLng / frpSum;

    // radius_m clamped to [500, 3000]
    const radius_m = Math.min(3000, Math.max(500, 300 + 120 * Math.sqrt(frpSum)));

    // intensity in (0, 1)
    const intensity = 1 - Math.exp(-frpSum / 30);

    // Evidence: up to 3 hottest members summarized
    const hottest = [...members].sort((a, b) => b.frp - a.frp).slice(0, 3);
    const evidence = hottest.map((m) => ({
      source: "firms",
      detail: `VIIRS hotspot lat=${m.lat.toFixed(4)} lng=${m.lng.toFixed(4)} frp=${m.frp.toFixed(1)} MW conf=${m.confidence}`,
      ts: m.acqAt,
    }));

    clusters.push({
      lat,
      lng,
      radius_m,
      intensity,
      count: members.length,
      frpSum,
      evidence,
    });
  }

  // Return hottest clusters first
  return clusters.sort((a, b) => b.frpSum - a.frpSum);
}
