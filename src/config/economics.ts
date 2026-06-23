import type { AssetType, DepKind } from "@/lib/data/types";

export interface EconomicScenario {
  currency: "USD";
  kyivAnnualGvaUsd: number;
  kyivPopulation: number;
  defaultOutageHours: number;
  cascadeDepth: number;
  cascadeDecay: number;
  cascadeDoubleCountGuard: number;
  basisLabel: string;
}

/**
 * Minimal scenario assumptions for VERA MVP.
 *
 * These are NOT observed factual values.
 * Replace kyivAnnualGvaUsd and kyivPopulation with sourced Kyiv data later.
 *
 * The estimate produced from this file should be labelled:
 * "Scenario estimate, not observed loss."
 */
export const ECONOMIC_SCENARIO: EconomicScenario = {
  currency: "USD",

  /**
   * Provisional macro assumption.
   * Replace later with sourced Kyiv GRP/GVA/GDP converted to USD.
   */
  kyivAnnualGvaUsd: 35_000_000_000,

  /**
   * Provisional population assumption.
   * Replace later with official or scenario-specific Kyiv population.
   */
  kyivPopulation: 3_000_000,

  defaultOutageHours: 24,
  cascadeDepth: 2,
  cascadeDecay: 0.75,
  cascadeDoubleCountGuard: 0.65,
  basisLabel: "Scenario estimate, provisional Kyiv macro assumptions",
};

/**
 * Feature flag.
 *
 * To disable without reverting code:
 *
 * VITE_ENABLE_ECONOMIC_LOSS=false npm run dev
 */
export const ECONOMIC_LOSS_ENABLED =
  import.meta.env.VITE_ENABLE_ECONOMIC_LOSS !== "false";

export const TYPE_MULTIPLIER: Record<AssetType, number> = {
  power_plant: 1.4,
  substation: 1.3,
  bridge: 1.25,
  telecom: 1.2,
  water_works: 1.15,
  wastewater: 1.15,
  pumping_station: 1.15,
  hospital: 1.1,
  heating_plant: 1.1,
  other: 1.0,
};

export const BACKUP_FACTOR: Record<AssetType, number> = {
  hospital: 0.35,
  telecom: 0.25,
  water_works: 0.2,
  wastewater: 0.2,
  pumping_station: 0.2,
  heating_plant: 0.15,
  power_plant: 0.1,
  substation: 0.1,
  bridge: 0.1,
  other: 0.1,
};

export const EMERGENCY_COST_PER_PERSON_DAY: Record<AssetType, number> = {
  hospital: 8,
  water_works: 6,
  wastewater: 6,
  pumping_station: 6,
  heating_plant: 5,
  power_plant: 4,
  substation: 4,
  bridge: 3,
  telecom: 2,
  other: 1,
};

export const DEPENDENCY_KIND_MULTIPLIER: Record<DepKind, number> = {
  powers: 1.0,
  supplies_water: 0.9,
  feeds_heat: 0.85,
  provides_access: 0.65,
  depends_on: 0.55,
  other: 0.5,
};
