---
name: damage-state-fusion
description: Fuse NASA FIRMS thermal detections and Telegram text reports into a per-asset damage state (operational/degraded/offline) with confidence and evidence. Use when computing or refreshing live asset state, and for the sample-state fallback before API keys exist.
---

# Damage-State Fusion

Turn noisy, scattered signals into a defensible per-asset state. Two independent sources, combined — and every state keeps the evidence that produced it.

## Inputs
- **FIRMS** detections: `{ lat, lng, frp, confidence, acq_date, acq_time }` (geo-located).
- **Telegram** messages: `{ channelName, date, content, messageUrl }` (NO geo — matched by asset/area name).

## FIRMS → asset
For each detection, find assets within `proximityM` (default 800 m for point assets; bbox for ways/bridges). A hit raises a thermal signal weighted by `frp` × `confidence`, decayed by age (half-life 6 h).

## Telegram → asset
Search messages mentioning the asset `name` (native + `name:en`), its district, or known aliases. A match raises a report signal weighted by channel reliability × recency.

## Fusion → state
```
score      = wF·firmsSignal + wT·telegramSignal           // 0..1
status     = score ≥ 0.66 ? "offline"
           : score ≥ 0.30 ? "degraded"
           :                "operational"
status     = totalEvidence < ε ? "unknown" : status
confidence = saturating(totalWeightedEvidence) × (1 − sourceDisagreement)
```
Persist `asset_state { asset_id, status, confidence, score, evidence jsonb, updated_at }`. `evidence` keeps the FIRMS rows + Telegram `messageUrl`s so a card can show **why it's red**.

## Cascade (optional)
If an asset goes `offline`, flag its **downstream** dependents (from the work-tree) as `degraded` at reduced confidence — surfaced as "at risk", not asserted as damaged.

## Sample-state mode (no keys yet — current default)
When `FIRMS_MAP_KEY` / `TELEGRAM_API_KEY` are unset, seed a realistic spread (a couple `offline`, a few `degraded`, the rest `operational`) with synthetic but well-formed `evidence`. Identical table shape ⇒ live feeds replace it with zero code change. Bias `offline`/`degraded` toward high-criticality assets so the demo reads true.
