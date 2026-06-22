/**
 * VERA domain model.
 *
 * The whole point of VERA is turning *scattered, uncertain* inputs into a
 * decision that can be **defended afterwards**. So every type here carries its
 * provenance and uncertainty explicitly — nothing is a bare number without a
 * source and a confidence behind it.
 */

/** Categories of public infrastructure VERA triages. */
export type AssetType =
  | "hospital"
  | "water"
  | "power"
  | "bridge"
  | "road"
  | "school"
  | "shelter"
  | "telecom";

/** Operational status of an asset after an event. */
export type AssetStatus =
  | "operational"
  | "degraded"
  | "offline"
  | "unknown";

/** Where a piece of evidence came from. Reliability differs wildly by source. */
export type SourceKind =
  | "sensor" // IoT / SCADA telemetry — high reliability, narrow scope
  | "field_crew" // trained inspector on site — high reliability
  | "satellite" // remote sensing — medium reliability, broad coverage
  | "citizen" // public report — low individual reliability, high volume
  | "partner_agency"; // utility / NGO feed — medium-high reliability

/** What a damage signal is telling us about. */
export type SignalKind =
  | "damage_report" // raises estimated damage severity
  | "service_outage" // essential service down
  | "access_blocked" // route/access impassable
  | "restored" // service/access came back
  | "casualty_risk"; // life-safety concern

/**
 * A single, raw, uncertain observation flowing in from the field.
 * Many of these fuse into one estimate per asset.
 */
export interface Signal {
  id: string;
  assetId: string;
  source: SourceKind;
  kind: SignalKind;
  /** Reporter's claimed severity 0..1 (how bad they say it is). */
  severity: number;
  /** Reporter/source self-confidence 0..1 (how sure they are). */
  confidence: number;
  /** Epoch ms. Older signals decay in influence. */
  timestamp: number;
  /** Free-text note shown in the evidence trail. */
  note?: string;
  /** Optional corroboration handle — signals citing the same ref reinforce. */
  corroborationRef?: string;
}

/** A piece of damaged public infrastructure under consideration. */
export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  /** Normalized position 0..1 on the SVG city canvas (x right, y down). */
  x: number;
  y: number;
  /** People who depend on this asset for service. */
  populationServed: number;
  /** Share of dependents who are vulnerable (elderly/medical/low-mobility) 0..1. */
  vulnerabilityShare: number;
  /** Inherent criticality of the service class 0..1 (hospital > park). */
  baseCriticality: number;
  /** Other asset ids whose usefulness depends on this one being restored. */
  unblocks: string[];
  /** Rough crew-days to restore. Cheap+fast wins break ties. */
  estimatedRepairDays: number;
  status: AssetStatus;
}

/**
 * Result of fusing all signals for one asset.
 * This is the "single source of truth" estimate decisions are built on.
 */
export interface FusedEstimate {
  assetId: string;
  /** Confidence-weighted damage severity 0..1. */
  severity: number;
  /** Aggregate confidence in that estimate 0..1 (data sufficiency + agreement). */
  confidence: number;
  /** How much sources disagree 0..1 (high = needs verification). */
  disagreement: number;
  /** Count of signals that fed this estimate. */
  signalCount: number;
  /** Most recent signal time (epoch ms). */
  lastUpdated: number;
  /** Inferred status from the fused picture. */
  status: AssetStatus;
}

/** The tunable weights that make prioritization explicit and arguable. */
export interface CriteriaWeights {
  population: number;
  criticality: number;
  vulnerability: number;
  dependency: number;
  severity: number;
  speed: number;
}

/** One factor's contribution to a priority score — the audit breakdown. */
export interface ScoreFactor {
  key: keyof CriteriaWeights;
  label: string;
  /** Normalized factor value 0..1 before weighting. */
  raw: number;
  /** Weight applied. */
  weight: number;
  /** raw * weight — the points this factor contributed. */
  contribution: number;
  /** Plain-language justification for the audit trail. */
  rationale: string;
}

/** Full, defensible priority result for one asset. */
export interface PriorityResult {
  assetId: string;
  /** 0..100 priority score. */
  score: number;
  /** Per-factor breakdown — this is what makes the call defensible. */
  factors: ScoreFactor[];
  /**
   * Confidence flag. When data confidence is low, the score is provisional and
   * VERA recommends verification before committing scarce crews.
   */
  confidence: number;
  needsVerification: boolean;
  rank: number;
}

/** Lifecycle of an authority's repair decision — the tracking layer. */
export type DecisionState =
  | "queued"
  | "dispatched"
  | "in_progress"
  | "restored"
  | "deferred";

/**
 * An immutable snapshot taken when an authority commits a decision.
 * Captures *what was known and why* at decision time — the legal/defensible record.
 */
export interface DecisionRecord {
  id: string;
  assetId: string;
  assetName: string;
  state: DecisionState;
  /** Epoch ms the decision was committed. */
  timestamp: number;
  /** Who made the call. */
  actor: string;
  /** Snapshot of the score & factors at the moment of decision. */
  snapshot: {
    score: number;
    rank: number;
    confidence: number;
    factors: ScoreFactor[];
    fused: FusedEstimate;
    weights: CriteriaWeights;
  };
  /** Optional operator note / override justification. */
  note?: string;
}
