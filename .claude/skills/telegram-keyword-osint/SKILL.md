---
name: telegram-keyword-osint
description: Search Telegram (Valkyrie tg-search) for attack/fire keywords across Ukrainian channels, and geolocate text reports to Kyiv districts. Use when building or debugging the Telegram side of damage detection.
---

# Telegram Keyword OSINT

Corroborating damage signal: public reports of strikes/fires. No coordinates from
the API — geolocate by matching place names in the text.

## Endpoint
Base `https://tg-search.valkyrie.org.ua`. Auth header `Authorization: <TELEGRAM_API_KEY>`.
`POST /search-telegram-messages/` body `{ fromDate, toDate, searchTerm, channelIds?, requiredTags?, nextPageToken? }` (ISO dates; Lucene `searchTerm`) → `PaginatedResponse` of `TelegramMessage { channelName, date, content, messageUrl, ... }`. Paginate via `nextPageToken`.

## Keywords (UA / RU / EN)
`обстріл, приліт, вибух, пожежа, удар, ракет, шахед, дрон, влучання, тривога, attack, strike, fire, explosion, missile, drone`. Build `searchTerm` by joining with ` OR `.

## Geolocate (district lookup)
Match district / raion / landmark names in `content` against a Kyiv table → district centroid:
Pechersk/Печерськ, Obolon/Оболонь, Darnytsia/Дарниця, Podil/Поділ, Solomianka/Солом'янка, Sviatoshyn/Святошин, Holosiiv/Голосіїв, Desnianskyi/Деснянський, Dniprovskyi/Дніпровський, Shevchenkivskyi/Шевченківський. No match → location-less (counts as corroboration only).

## Output
`scripts/sources/telegram.mjs` (Node 22, native `fetch`, NO deps), reading `process.env.TELEGRAM_API_KEY`:
- `export async function fetchTelegramReports(sinceHours = 24)` → `[{ channelName, content, url, ts, matched: string[], district?, lat?, lng? }]` (`[]` if no key).
- `export const ATTACK_KEYWORDS` + `export function geolocateText(text)` (district → centroid).
Never throws on a missing key.
