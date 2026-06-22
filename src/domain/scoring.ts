import type {
  Asset,
  CriteriaWeights,
  FusedEstimate,
  PriorityResult,
  ScoreFactor,
} from "./types";
import { CRITERIA_LABELS } from "./criteria";
import { clamp01 } from "./fusion";

/** Confidence below this flags a result as provisional / verify-before-commit. */
export const VERIFY_THRESHOLD = 0.45;

/** Log-normalize a population against a reference so one mega-asset can't dominate. */
function populationFactor(pop: number, reference = 50000): number {
  if (pop <= 0) return 0;
  return clamp01(Math.log10(1 + pop) / Math.log10(1 + reference));
}

/** Faster repairs score higher: 1 day ~ 1.0, decaying toward 0 as days grow. */
function speedFactor(repairDays: number): number {
  if (repairDays <= 0) return 1;
  return clamp01(1 / (1 + repairDays / 3));
}

/** Dependency factor from how many other assets this one unblocks (saturating). */
function dependencyFactor(unblocks: number): number {
  return clamp01(1 - Math.exp(-unblocks / 2));
}

/**
 * Compute a single asset's defensible priority.
 *
 * Every factor is normalized to 0..1, multiplied by its policy weight, and the
 * weighted sum is rescaled to 0..100. The per-factor breakdown is returned so
 * the UI (and an after-action review) can show *exactly* why an asset ranked
 * where it did. Severity is multiplied by data confidence, so a scary-but-
 * unverified report doesn't outrank a confirmed one.
 */
export function scoreAsset(
  asset: Asset,
  fused: FusedEstimate,
  weights: CriteriaWeights,
): Omit<PriorityResult, "rank"> {
  const raw: Record<keyof CriteriaWeights, number> = {
    population: populationFactor(asset.populationServed),
    criticality: clamp01(asset.baseCriticality),
    vulnerability: clamp01(asset.vulnerabilityShare),
    dependency: dependencyFactor(asset.unblocks.length),
    // Confidence-weighted severity: uncertain damage counts for less.
    severity: clamp01(fused.severity) * (0.4 + 0.6 * fused.confidence),
    speed: speedFactor(asset.estimatedRepairDays),
  };

  const factors: ScoreFactor[] = (Object.keys(weights) as (keyof CriteriaWeights)[]).map(
    (key) => {
      const weight = weights[key];
      const contribution = raw[key] * weight;
      return {
        key,
        label: CRITERIA_LABELS[key],
        raw: raw[key],
        weight,
        contribution,
        rationale: explain(key, asset, fused, raw[key]),
      };
    },
  );

  const totalWeight = factors.reduce((s, f) => s + f.weight, 0) || 1;
  const totalContribution = factors.reduce((s, f) => s + f.contribution, 0);
  const score = Math.round((totalContribution / totalWeight) * 100);

  return {
    assetId: asset.id,
    score,
    factors: factors.sort((a, b) => b.contribution - a.contribution),
    confidence: fused.confidence,
    needsVerification: fused.confidence < VERIFY_THRESHOLD || fused.disagreement > 0.6,
  };
}

/**
 * Rank a whole portfolio of assets. Returns priority results sorted high→low
 * with ranks assigned — the live repair queue.
 */
export function rankAssets(
  assets: Asset[],
  fusedById: Map<string, FusedEstimate>,
  weights: CriteriaWeights,
): PriorityResult[] {
  const scored = assets.map((a) => {
    const fused =
      fusedById.get(a.id) ?? {
        assetId: a.id,
        severity: 0,
        confidence: 0,
        disagreement: 0,
        signalCount: 0,
        lastUpdated: Date.now(),
        status: "unknown" as const,
      };
    return scoreAsset(a, fused, weights);
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.map((s, i) => ({ ...s, rank: i + 1 }));
}

function explain(
  key: keyof CriteriaWeights,
  asset: Asset,
  fused: FusedEstimate,
  raw: number,
): string {
  const pct = Math.round(raw * 100);
  switch (key) {
    case "population":
      return `${asset.populationServed.toLocaleString()} residents depend on this asset (${pct}% of reference scale).`;
    case "criticality":
      return `${asset.type} is rated ${pct}% on the essential-service scale.`;
    case "vulnerability":
      return `${Math.round(asset.vulnerabilityShare * 100)}% of dependents are in vulnerable groups.`;
    case "dependency":
      return asset.unblocks.length
        ? `Restoring this unblocks ${asset.unblocks.length} other damaged site(s).`
        : `Does not gate any other repairs.`;
    case "severity":
      return `Fused damage ${Math.round(fused.severity * 100)}% at ${Math.round(
        fused.confidence * 100,
      )}% confidence (${fused.signalCount} signals).`;
    case "speed":
      return `~${asset.estimatedRepairDays} crew-day(s) to restore.`;
    default:
      return "";
  }
}
