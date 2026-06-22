import type { CriteriaWeights } from "./types";

/**
 * Default prioritization policy.
 *
 * These weights are *the policy*. By making them explicit, tunable, and visible
 * in the UI, VERA turns "we just felt the hospital mattered most" into a stated,
 * reviewable rule. Weights are normalized at scoring time, so they need not sum
 * to 1 — they express relative emphasis.
 */
export const DEFAULT_WEIGHTS: CriteriaWeights = {
  population: 1.0, // how many people regain service
  criticality: 1.4, // essential-service class (hospital/water rank high)
  vulnerability: 1.2, // protect those least able to cope
  dependency: 0.9, // unblock other repairs / network effects
  severity: 1.0, // worse damage = more urgent (and confidence-weighted)
  speed: 0.6, // quick wins restore access sooner per crew-day
};

export const CRITERIA_LABELS: Record<keyof CriteriaWeights, string> = {
  population: "People served",
  criticality: "Service criticality",
  vulnerability: "Vulnerable population",
  dependency: "Unblocks network",
  severity: "Damage severity",
  speed: "Speed to restore",
};

export const CRITERIA_HELP: Record<keyof CriteriaWeights, string> = {
  population: "Favors assets that restore service to more residents.",
  criticality: "Favors life-critical services over discretionary ones.",
  vulnerability: "Favors areas with more elderly, medical-dependent, low-mobility residents.",
  dependency: "Favors repairs that unblock access to other damaged sites.",
  severity: "Favors more severely damaged (more service currently lost).",
  speed: "Favors faster, cheaper restorations — more wins per crew-day.",
};
