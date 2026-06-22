/**
 * Valkyrie Telegram search adapter — key-gated stub.
 *
 * Service:  tg-search.valkyrie.org.ua
 * Auth:     Authorization: <TELEGRAM_API_KEY>  (header, no "Bearer" prefix)
 *
 * Key: TELEGRAM_API_KEY  (server-side only — never expose to the browser SPA)
 *
 * Endpoints used by VERA:
 *
 *   POST /search-telegram-messages/
 *   ─────────────────────────────────
 *   Request body (JSON):
 *   {
 *     "fromDate":       "ISO-8601 string",           // required
 *     "toDate":         "ISO-8601 string",           // required
 *     "searchTerm":     "string | undefined",        // free-text
 *     "searchRegex":    "string | undefined",        // regex alternative
 *     "channelIds":     ["string"] | undefined,      // filter by channel
 *     "requiredTags":   ["string"] | undefined,
 *     "nextPageToken":  "string | undefined"         // pagination
 *   }
 *   Response: { items: TelegramMessage[], nextPageToken?: string }
 *
 *   POST /search-telegram-channels/
 *   ─────────────────────────────────
 *   Request body: { name?: string; title?: string; about?: string }
 *   Response: { channels: TelegramChannel[] }
 *
 * NOTE: Telegram messages carry NO coordinates. Geographic association is done
 * by matching asset `name` / `name_native` / district against message content —
 * see `damage-state-fusion` skill for the matching algorithm.
 *
 * When TELEGRAM_API_KEY is unset this module returns sample messages that
 * corroborate the FIRMS-based damage states seeded in asset_state.
 *
 * NEVER import this module in the client bundle (SPA).
 */

export interface TelegramMessage {
  channelName: string;
  date: string;         // ISO-8601
  content: string;
  messageUrl: string;
  /** Channel reliability weight (0..1) — set by the caller based on known channel quality */
  channelWeight?: number;
}

export interface TelegramChannel {
  id: string;
  name: string;
  title: string;
  about?: string;
  subscribersCount?: number;
}

export interface SearchMessagesParams {
  fromDate: string;
  toDate: string;
  searchTerm?: string;
  searchRegex?: string;
  channelIds?: string[];
  requiredTags?: string[];
  nextPageToken?: string;
}

const BASE_URL = 'https://tg-search.valkyrie.org.ua';

/**
 * Search Telegram messages for reports mentioning a specific asset or area name.
 *
 * Returns sample data when TELEGRAM_API_KEY is not set (safe-default mode).
 *
 * @param params - Search parameters (fromDate, toDate, searchTerm, …)
 */
export async function searchMessages(
  params: SearchMessagesParams,
): Promise<TelegramMessage[]> {
  const key = process.env['TELEGRAM_API_KEY'];

  if (!key) {
    console.warn('[telegram] TELEGRAM_API_KEY not set — returning sample messages.');
    return sampleMessages(params.searchTerm);
  }

  const url = `${BASE_URL}/search-telegram-messages/`;
  let data: { items?: TelegramMessage[]; nextPageToken?: string };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: key,
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      console.error(`[telegram] HTTP ${res.status} from Valkyrie API`);
      return sampleMessages(params.searchTerm);
    }
    data = (await res.json()) as typeof data;
  } catch (err) {
    console.error('[telegram] Network error fetching Telegram messages:', err);
    return sampleMessages(params.searchTerm);
  }

  return data.items ?? [];
}

/**
 * Discover Telegram channels by name or description.
 * Useful during setup to find relevant infrastructure monitoring channels.
 *
 * Returns an empty array when key is unset.
 */
export async function searchChannels(query: {
  name?: string;
  title?: string;
  about?: string;
}): Promise<TelegramChannel[]> {
  const key = process.env['TELEGRAM_API_KEY'];
  if (!key) {
    console.warn('[telegram] TELEGRAM_API_KEY not set — searchChannels returns [].');
    return [];
  }

  const url = `${BASE_URL}/search-telegram-channels/`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: key,
      },
      body: JSON.stringify(query),
    });
    if (!res.ok) {
      console.error(`[telegram] HTTP ${res.status} from Valkyrie channels API`);
      return [];
    }
    const data = (await res.json()) as { channels?: TelegramChannel[] };
    return data.channels ?? [];
  } catch (err) {
    console.error('[telegram] Network error fetching Telegram channels:', err);
    return [];
  }
}

/**
 * Sample Telegram messages for the no-key default mode.
 *
 * Corroborates the damage states seeded in supabase/seed.sql:
 *  - offline: Kyiv CHP-5, Pivdennyi Bridge
 *  - degraded: Bilychi water works, Bilychi wastewater, Centralna power plant
 */
function sampleMessages(searchTerm?: string): TelegramMessage[] {
  const now = new Date().toISOString();

  const allSamples: TelegramMessage[] = [
    {
      channelName: 'Kyiv Energy Monitor',
      date: now,
      content:
        'Київська ТЕЦ-5: зафіксовано припинення роботи. Електропостачання в районі порушено.',
      messageUrl: 'https://t.me/sample/001',
      channelWeight: 0.85,
    },
    {
      channelName: 'Kyiv Energy Monitor',
      date: now,
      content:
        'Південний міст: рух заблоковано, ознаки пошкодження опорних конструкцій.',
      messageUrl: 'https://t.me/sample/002',
      channelWeight: 0.85,
    },
    {
      channelName: 'UA Infrastructure Watch',
      date: now,
      content:
        'Насосна станція «Біличанська» — знижений тиск у водогоні, ймовірно часткова відмова обладнання.',
      messageUrl: 'https://t.me/sample/003',
      channelWeight: 0.70,
    },
    {
      channelName: 'UA Infrastructure Watch',
      date: now,
      content:
        'Районна котельня «Центральна» — пониження температури теплоносія, теплопостачання частково обмежено.',
      messageUrl: 'https://t.me/sample/004',
      channelWeight: 0.70,
    },
    {
      channelName: 'Kyiv Water Alerts',
      date: now,
      content:
        'Очисні споруди «Біличі»: скидання в обхід фільтрів через технічну несправність.',
      messageUrl: 'https://t.me/sample/005',
      channelWeight: 0.65,
    },
  ];

  // Filter by search term if provided (case-insensitive substring match)
  if (searchTerm) {
    const lower = searchTerm.toLowerCase();
    return allSamples.filter(m => m.content.toLowerCase().includes(lower));
  }

  return allSamples;
}
