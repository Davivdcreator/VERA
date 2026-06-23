import type { AssetCard, InfraStatus } from "@/lib/data/types";
import {
  BACKUP_FACTOR,
  DEPENDENCY_KIND_MULTIPLIER,
  ECONOMIC_SCENARIO,
  EMERGENCY_COST_PER_PERSON_DAY,
  TYPE_MULTIPLIER,
  type EconomicScenario,
} from "@/config/economics";

export interface EconomicLossReport {
  asset_id: string;
  asset_name: string;
  currency: "USD";
  outage_hours: number;
  direct_loss: number;
  cascading_loss: number;
  emergency_loss: number;
  total_expected: number;
  low: number;
  high: number;
  confidence: number;
  severity: number;
  hourly_value_per_person: number;
  affected_downstream_assets: Array<{
    id: string;
    name: string;
    type: string;
    propagated_severity: number;
    expected_loss: number;
  }>;
  assumptions: string[];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function severityFromStatus(status: InfraStatus): number {
  if (status === "offline") return 1.0;
  if (status === "degraded") return 0.5;
  if (status === "unknown") return 0.15;
  return 0;
}

function criticalityPremium(asset: AssetCard): number {
  return 0.75 + 0.5 * clamp(asset.criticality, 0, 1);
}

function assetLoss(
  asset: AssetCard,
  severity: number,
  outageHours: number,
  hourlyValuePerPerson: number,
) {
  return (
    asset.population_affected *
    hourlyValuePerPerson *
    outageHours *
    severity *
    TYPE_MULTIPLIER[asset.type] *
    criticalityPremium(asset) *
    (1 - BACKUP_FACTOR[asset.type])
  );
}

function emergencyLoss(asset: AssetCard, severity: number, outageHours: number) {
  return (
    (outageHours / 24) *
    asset.population_affected *
    EMERGENCY_COST_PER_PERSON_DAY[asset.type] *
    severity
  );
}

export function computeEconomicLoss({
  selectedAssetId,
  cards,
  outageHours = ECONOMIC_SCENARIO.defaultOutageHours,
  scenario = ECONOMIC_SCENARIO,
}: {
  selectedAssetId: string;
  cards: AssetCard[];
  outageHours?: number;
  scenario?: EconomicScenario;
}): EconomicLossReport | null {
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const selected = cardMap.get(selectedAssetId);
  if (!selected) return null;

  const hourlyValuePerPerson =
    scenario.kyivAnnualGvaUsd / (365 * 24 * scenario.kyivPopulation);

  const baseSeverity = severityFromStatus(selected.status);
  const directLoss = assetLoss(
    selected,
    baseSeverity,
    outageHours,
    hourlyValuePerPerson,
  );

  const reached = new Map<
    string,
    { severity: number; depth: number }
  >();

  const queue: Array<{ asset: AssetCard; severity: number; depth: number }> = [
    { asset: selected, severity: baseSeverity, depth: 0 },
  ];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current.depth >= scenario.cascadeDepth) continue;

    for (const edge of current.asset.downstream) {
      const next = cardMap.get(edge.assetId);
      if (!next || next.id === selected.id) continue;

      const propagatedSeverity = clamp(
        current.severity *
          edge.weight *
          DEPENDENCY_KIND_MULTIPLIER[edge.kind] *
          scenario.cascadeDecay,
        0,
        1,
      );

      const existing = reached.get(next.id);
      if (!existing || propagatedSeverity > existing.severity) {
        reached.set(next.id, {
          severity: propagatedSeverity,
          depth: current.depth + 1,
        });

        queue.push({
          asset: next,
          severity: propagatedSeverity,
          depth: current.depth + 1,
        });
      }
    }
  }

  const downstreamRows = Array.from(reached.entries()).flatMap(([id, item]) => {
    const asset = cardMap.get(id);
    if (!asset) return [];

    const expectedLoss = assetLoss(
      asset,
      item.severity,
      outageHours,
      hourlyValuePerPerson,
    );

    return [{
      id: asset.id,
      name: asset.name,
      type: asset.type,
      propagated_severity: item.severity,
      expected_loss: expectedLoss,
    }];
  });

  const cascadingLoss =
    scenario.cascadeDoubleCountGuard *
    downstreamRows.reduce((sum, row) => sum + row.expected_loss, 0);

  const emergency =
    emergencyLoss(selected, baseSeverity, outageHours) +
    downstreamRows.reduce((sum, row) => {
      const asset = cardMap.get(row.id);
      if (!asset) return sum;
      return sum + emergencyLoss(asset, row.propagated_severity, outageHours);
    }, 0);

  const expected = directLoss + cascadingLoss + emergency;
  const confidence = clamp(selected.state_confidence ?? 0.55, 0, 1);

  return {
    asset_id: selected.id,
    asset_name: selected.name,
    currency: scenario.currency,
    outage_hours: outageHours,
    direct_loss: Math.round(directLoss),
    cascading_loss: Math.round(cascadingLoss),
    emergency_loss: Math.round(emergency),
    total_expected: Math.round(expected),
    low: Math.round(expected * (0.5 + 0.3 * confidence)),
    high: Math.round(expected * (1.2 + 1.3 * (1 - confidence))),
    confidence,
    severity: baseSeverity,
    hourly_value_per_person: hourlyValuePerPerson,
    affected_downstream_assets: downstreamRows
      .sort((a, b) => b.expected_loss - a.expected_loss)
      .slice(0, 8)
      .map((row) => ({
        ...row,
        expected_loss: Math.round(row.expected_loss),
      })),
    assumptions: [
      scenario.basisLabel,
      `Outage duration: ${outageHours} hours`,
      "Direct loss uses affected population, Kyiv output per person-hour, status severity, sector multiplier, criticality premium and backup factor.",
      "Cascading loss follows downstream dependencies up to depth 2 and applies a double-counting guard.",
      "Emergency loss uses provisional sector-level emergency cost per affected person-day.",
      "This is a scenario estimate, not an observed factual loss.",
    ],
  };
}
