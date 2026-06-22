import type { AssetStatus, FusedEstimate, Signal } from "./types";
import { sourceReliability } from "./sources";

/** Half-life (ms) for signal influence decay. Default: 45 minutes. */
export const SIGNAL_HALF_LIFE_MS = 45 * 60 * 1000;

/**
 * Time-decay weight for a signal. Fresh evidence dominates; a two-hour-old
 * citizen report shouldn't outvote a sensor reading from a minute ago.
 */
export function recencyWeight(
  timestamp: number,
  now: number,
  halfLife = SIGNAL_HALF_LIFE_MS,
): number {
  const age = Math.max(0, now - timestamp);
  return Math.pow(0.5, age / halfLife);
}

/**
 * Effective weight of a single signal = source reliability × self-confidence ×
 * recency. This is the core of "fusing uncertain data": every input is admitted,
 * but its pull on the estimate is proportional to how much we should trust it.
 */
export function signalWeight(signal: Signal, now: number): number {
  return (
    sourceReliability(signal.source) *
    clamp01(signal.confidence) *
    recencyWeight(signal.timestamp, now)
  );
}

const RESTORING_KINDS: Signal["kind"][] = ["restored"];

/**
 * Fuse all signals for one asset into a single confidence-scored estimate.
 *
 * Design choices that make the output defensible:
 *  - Weighted mean of severity, not a raw average — trust-proportional.
 *  - "restored" signals pull severity *down*, modelling recovery.
 *  - Aggregate confidence rises with both total trusted weight (data sufficiency)
 *    and agreement between sources, and falls when sources disagree.
 *  - Disagreement (weighted variance) is surfaced so an operator knows when the
 *    picture is contested and verification is warranted.
 */
export function fuseSignals(
  assetId: string,
  signals: Signal[],
  now: number = Date.now(),
): FusedEstimate {
  if (signals.length === 0) {
    return {
      assetId,
      severity: 0,
      confidence: 0,
      disagreement: 0,
      signalCount: 0,
      lastUpdated: now,
      status: "unknown",
    };
  }

  let weightSum = 0;
  let severityAccum = 0;
  let lastUpdated = 0;

  const weighted: { value: number; weight: number }[] = [];

  for (const s of signals) {
    const w = signalWeight(s, now);
    // A "restored" report is evidence of *low* severity for this asset.
    const effectiveSeverity = RESTORING_KINDS.includes(s.kind)
      ? clamp01(1 - s.severity)
      : clamp01(s.severity);
    weightSum += w;
    severityAccum += effectiveSeverity * w;
    weighted.push({ value: effectiveSeverity, weight: w });
    if (s.timestamp > lastUpdated) lastUpdated = s.timestamp;
  }

  const severity = weightSum > 0 ? severityAccum / weightSum : 0;

  // Weighted variance → disagreement among sources (0..1, capped).
  let varianceAccum = 0;
  for (const { value, weight } of weighted) {
    varianceAccum += weight * Math.pow(value - severity, 2);
  }
  const variance = weightSum > 0 ? varianceAccum / weightSum : 0;
  const disagreement = clamp01(Math.sqrt(variance) * 2);

  // Data-sufficiency: saturating curve on total trusted weight.
  const sufficiency = 1 - Math.exp(-weightSum / 1.5);

  // Confidence rewards sufficiency, penalizes disagreement.
  const confidence = clamp01(sufficiency * (1 - 0.5 * disagreement));

  return {
    assetId,
    severity: clamp01(severity),
    confidence,
    disagreement,
    signalCount: signals.length,
    lastUpdated,
    status: inferStatus(severity, confidence),
  };
}

function inferStatus(severity: number, confidence: number): AssetStatus {
  if (confidence < 0.2) return "unknown";
  if (severity >= 0.66) return "offline";
  if (severity >= 0.3) return "degraded";
  return "operational";
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
