/**
 * VERA — Telegram OSINT adapter (Valkyrie tg-search)
 * Node 22, native fetch, no external deps.
 *
 * Env: TELEGRAM_API_KEY
 */

const BASE_URL = 'https://tg-search.valkyrie.org.ua';

// ─────────────────────────────────────────────
// Attack / damage keywords  (UA / RU / EN)
// ─────────────────────────────────────────────
export const ATTACK_KEYWORDS = [
  // Ukrainian
  'обстріл',
  'приліт',
  'вибух',
  'пожежа',
  'удар',
  'ракет',
  'шахед',
  'дрон',
  'влучання',
  'тривога',
  // English
  'attack',
  'strike',
  'fire',
  'explosion',
  'missile',
  'drone',
];

// ─────────────────────────────────────────────
// Kyiv district → centroid lookup
// ─────────────────────────────────────────────

/**
 * Each entry: { patterns: RegExp[], district, lat, lng }
 * Patterns match both Cyrillic and Latin forms (case-insensitive).
 */
const DISTRICT_TABLE = [
  {
    district: 'Pechersk',
    lat: 50.425,
    lng: 30.54,
    patterns: [/печерськ/i, /pechersk/i],
  },
  {
    district: 'Obolon',
    lat: 50.51,
    lng: 30.50,
    patterns: [/оболон/i, /obolon/i],
  },
  {
    district: 'Darnytsia',
    lat: 50.43,
    lng: 30.62,
    patterns: [/дарниц/i, /darnytsi/i, /darnitsa/i],
  },
  {
    district: 'Podil',
    lat: 50.47,
    lng: 30.52,
    patterns: [/поділ/i, /podil/i, /podol/i],
  },
  {
    district: 'Solomianka',
    lat: 50.43,
    lng: 30.44,
    patterns: [/солом['']янк/i, /solomian/i, /solomyank/i],
  },
  {
    district: 'Sviatoshyn',
    lat: 50.46,
    lng: 30.36,
    patterns: [/святошин/i, /sviatoshyn/i, /svyatoshin/i],
  },
  {
    district: 'Holosiiv',
    lat: 50.36,
    lng: 30.51,
    patterns: [/голосіїв/i, /holosiiv/i, /goloseyev/i, /голосеїв/i],
  },
  {
    district: 'Desnianskyi',
    lat: 50.52,
    lng: 30.60,
    patterns: [/деснянськ/i, /desnians/i, /desnyansk/i],
  },
  {
    district: 'Dniprovskyi',
    lat: 50.45,
    lng: 30.62,
    patterns: [/дніпровськ/i, /dniprovs/i, /dniprovsky/i],
  },
  {
    district: 'Shevchenkivskyi',
    lat: 50.45,
    lng: 30.49,
    patterns: [/шевченківськ/i, /shevchenkivs/i, /shevchenkovsk/i],
  },
];

/**
 * Match district / raion names in text → { district, lat, lng } or null.
 * @param {string} text
 * @returns {{ district: string, lat: number, lng: number } | null}
 */
export function geolocateText(text) {
  if (!text) return null;
  for (const entry of DISTRICT_TABLE) {
    for (const re of entry.patterns) {
      if (re.test(text)) {
        return { district: entry.district, lat: entry.lat, lng: entry.lng };
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Build ISO date strings for a window ending now. */
function buildDateWindow(sinceHours) {
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - sinceHours * 60 * 60 * 1000);
  return {
    fromDate: fromDate.toISOString(),
    toDate: toDate.toISOString(),
  };
}

/** Find which keywords appear in a piece of text (case-insensitive). */
function matchedKeywords(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return ATTACK_KEYWORDS.filter((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Safely extract the array of messages from whatever shape the API returns.
 * Handles: { results: [] }, { messages: [] }, { data: [] }, or a bare array.
 */
function extractMessages(body) {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.results)) return body.results;
  if (body && Array.isArray(body.messages)) return body.messages;
  if (body && Array.isArray(body.data)) return body.data;
  return [];
}

/** Normalise a single raw message object into our schema. */
function normalise(raw) {
  const content = raw.content ?? raw.text ?? raw.message ?? '';
  const ts =
    raw.date ?? raw.timestamp ?? raw.created_at ?? raw.ts ?? null;
  const url =
    raw.messageUrl ?? raw.message_url ?? raw.url ?? raw.link ?? null;
  const channelName =
    raw.channelName ?? raw.channel_name ?? raw.channel ?? raw.chat ?? '';

  const matched = matchedKeywords(content);
  const geo = geolocateText(content);

  return {
    channelName,
    content,
    url,
    ts,
    matched,
    ...(geo ?? {}), // spreads district/lat/lng when found, nothing otherwise
  };
}

// ─────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────

/**
 * Fetch Telegram reports from Valkyrie tg-search for the last `sinceHours`.
 *
 * Returns [] (never throws) when TELEGRAM_API_KEY is unset or the request fails.
 *
 * @param {number} sinceHours
 * @returns {Promise<Array<{
 *   channelName: string,
 *   content: string,
 *   url: string | null,
 *   ts: string | null,
 *   matched: string[],
 *   district?: string,
 *   lat?: number,
 *   lng?: number,
 * }>>}
 */
export async function fetchTelegramReports(sinceHours = 24) {
  const apiKey = process.env.TELEGRAM_API_KEY;
  if (!apiKey) return [];

  const searchTerm = ATTACK_KEYWORDS.join(' OR ');
  const { fromDate, toDate } = buildDateWindow(sinceHours);

  const results = [];
  let nextPageToken = undefined;

  try {
    do {
      const body = {
        fromDate,
        toDate,
        searchTerm,
        ...(nextPageToken ? { nextPageToken } : {}),
      };

      const response = await fetch(`${BASE_URL}/search-telegram-messages/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        // Non-2xx: log quietly and bail
        console.warn(
          `[telegram] API returned ${response.status} ${response.statusText}`
        );
        break;
      }

      const data = await response.json();
      const messages = extractMessages(data);
      results.push(...messages.map(normalise));

      // Advance pagination token (may be undefined → loop ends)
      nextPageToken =
        data?.nextPageToken ?? data?.next_page_token ?? undefined;
    } while (nextPageToken);
  } catch (err) {
    console.warn('[telegram] fetch failed:', err.message);
    return [];
  }

  return results;
}
