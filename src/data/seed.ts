import type { Asset, Signal, SignalKind, SourceKind } from "@/domain/types";

/**
 * Scenario: "Rivermouth" — a mid-size coastal county 18 hours after a major
 * flood. Power, water, transport and care infrastructure are all degraded at
 * once and crews are scarce. This is the seed world the simulator then perturbs
 * in real time.
 */
export const SCENARIO = {
  name: "Rivermouth County",
  event: "Severe riverine flood + storm surge",
  hoursSinceEvent: 18,
};

export const ASSETS: Asset[] = [
  {
    id: "hosp-central",
    name: "Rivermouth General Hospital",
    type: "hospital",
    x: 0.52,
    y: 0.34,
    populationServed: 84000,
    vulnerabilityShare: 0.62,
    baseCriticality: 1.0,
    unblocks: [],
    estimatedRepairDays: 2,
    status: "degraded",
  },
  {
    id: "water-north",
    name: "North Bank Water Treatment",
    type: "water",
    x: 0.41,
    y: 0.18,
    populationServed: 120000,
    vulnerabilityShare: 0.34,
    baseCriticality: 0.95,
    unblocks: ["hosp-central", "school-east"],
    estimatedRepairDays: 4,
    status: "offline",
  },
  {
    id: "power-sub-7",
    name: "Substation 7 (Grid Spine)",
    type: "power",
    x: 0.6,
    y: 0.5,
    populationServed: 150000,
    vulnerabilityShare: 0.3,
    baseCriticality: 0.9,
    unblocks: ["water-north", "telecom-hub", "hosp-central"],
    estimatedRepairDays: 3,
    status: "offline",
  },
  {
    id: "bridge-harbor",
    name: "Harbor Crossing Bridge",
    type: "bridge",
    x: 0.5,
    y: 0.7,
    populationServed: 60000,
    vulnerabilityShare: 0.28,
    baseCriticality: 0.7,
    unblocks: ["shelter-south", "hosp-central"],
    estimatedRepairDays: 9,
    status: "offline",
  },
  {
    id: "road-evac-1",
    name: "Coastal Evac Route A1",
    type: "road",
    x: 0.74,
    y: 0.64,
    populationServed: 42000,
    vulnerabilityShare: 0.4,
    baseCriticality: 0.65,
    unblocks: ["shelter-south"],
    estimatedRepairDays: 1,
    status: "degraded",
  },
  {
    id: "school-east",
    name: "Eastside School (Relief Center)",
    type: "school",
    x: 0.78,
    y: 0.3,
    populationServed: 9000,
    vulnerabilityShare: 0.5,
    baseCriticality: 0.55,
    unblocks: [],
    estimatedRepairDays: 2,
    status: "degraded",
  },
  {
    id: "shelter-south",
    name: "Southport Emergency Shelter",
    type: "shelter",
    x: 0.46,
    y: 0.86,
    populationServed: 5200,
    vulnerabilityShare: 0.75,
    baseCriticality: 0.8,
    unblocks: [],
    estimatedRepairDays: 1,
    status: "degraded",
  },
  {
    id: "telecom-hub",
    name: "Central Telecom Hub",
    type: "telecom",
    x: 0.34,
    y: 0.56,
    populationServed: 110000,
    vulnerabilityShare: 0.25,
    baseCriticality: 0.72,
    unblocks: ["school-east"],
    estimatedRepairDays: 2,
    status: "degraded",
  },
];

let seq = 0;
function mkSignal(
  assetId: string,
  source: SourceKind,
  kind: SignalKind,
  severity: number,
  confidence: number,
  ageMinutes: number,
  note?: string,
): Signal {
  return {
    id: `seed-${seq++}`,
    assetId,
    source,
    kind,
    severity,
    confidence,
    timestamp: Date.now() - ageMinutes * 60 * 1000,
    note,
  };
}

/** Initial scattered, partly-contradictory evidence the operator starts with. */
export const INITIAL_SIGNALS: Signal[] = [
  // Substation 7 — strongly corroborated outage.
  mkSignal("power-sub-7", "sensor", "service_outage", 0.95, 0.98, 12, "SCADA: bus voltage 0kV"),
  mkSignal("power-sub-7", "field_crew", "damage_report", 0.88, 0.9, 30, "Transformer yard flooded"),
  mkSignal("power-sub-7", "citizen", "service_outage", 0.9, 0.6, 8, "Whole neighborhood dark"),

  // Water north — sensor down, conflicting citizen reports (high disagreement).
  mkSignal("water-north", "satellite", "damage_report", 0.8, 0.65, 40, "Intake structure submerged"),
  mkSignal("water-north", "citizen", "service_outage", 0.7, 0.5, 15, "No pressure on North Bank"),
  mkSignal("water-north", "citizen", "restored", 0.3, 0.4, 6, "Tap working again?"),

  // Hospital — running on generators, degraded not offline.
  mkSignal("hosp-central", "field_crew", "damage_report", 0.45, 0.92, 20, "On backup power, fuel ~30h"),
  mkSignal("hosp-central", "partner_agency", "casualty_risk", 0.5, 0.8, 25, "Dialysis capacity at risk"),

  // Harbor bridge — confirmed structural, single high-trust source.
  mkSignal("bridge-harbor", "field_crew", "access_blocked", 0.9, 0.95, 50, "Pier scour, closed to traffic"),
  mkSignal("bridge-harbor", "satellite", "damage_report", 0.85, 0.7, 60),

  // Evac route — light damage, quick win.
  mkSignal("road-evac-1", "citizen", "access_blocked", 0.5, 0.5, 10, "Debris but passable by 4x4"),
  mkSignal("road-evac-1", "sensor", "access_blocked", 0.4, 0.85, 5, "Traffic counter offline"),

  // Telecom — partial.
  mkSignal("telecom-hub", "partner_agency", "service_outage", 0.55, 0.82, 22, "3 of 8 sectors down"),

  // School relief center — minor.
  mkSignal("school-east", "field_crew", "damage_report", 0.3, 0.9, 35, "Roof leak, generator OK"),

  // Shelter — life-safety, vulnerable population.
  mkSignal("shelter-south", "partner_agency", "casualty_risk", 0.6, 0.85, 14, "240 evacuees, low water"),
  mkSignal("shelter-south", "citizen", "service_outage", 0.65, 0.5, 9),
];
