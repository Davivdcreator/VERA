import { describe, expect, it } from "vitest";
import { fuseSignals, recencyWeight, signalWeight } from "@/domain/fusion";
import { rankAssets, scoreAsset } from "@/domain/scoring";
import { DEFAULT_WEIGHTS } from "@/domain/criteria";
import type { Asset, Signal } from "@/domain/types";

const now = 1_700_000_000_000;

function sig(partial: Partial<Signal>): Signal {
  return {
    id: Math.random().toString(36),
    assetId: "a1",
    source: "sensor",
    kind: "damage_report",
    severity: 0.8,
    confidence: 0.9,
    timestamp: now,
    ...partial,
  };
}

describe("fusion", () => {
  it("returns zero-confidence unknown when there is no evidence", () => {
    const f = fuseSignals("a1", [], now);
    expect(f.confidence).toBe(0);
    expect(f.status).toBe("unknown");
  });

  it("weights a high-reliability sensor above a low-reliability citizen report", () => {
    const sensor = signalWeight(sig({ source: "sensor", confidence: 0.9 }), now);
    const citizen = signalWeight(sig({ source: "citizen", confidence: 0.9 }), now);
    expect(sensor).toBeGreaterThan(citizen);
  });

  it("decays older signals", () => {
    const fresh = recencyWeight(now, now);
    const old = recencyWeight(now - 45 * 60 * 1000, now); // one half-life
    expect(fresh).toBeCloseTo(1, 5);
    expect(old).toBeCloseTo(0.5, 2);
  });

  it("lets a trusted sensor outweigh contradicting citizen reports", () => {
    const f = fuseSignals(
      "a1",
      [
        sig({ source: "sensor", severity: 0.9, confidence: 0.95 }),
        sig({ source: "citizen", severity: 0.1, confidence: 0.4 }),
        sig({ source: "citizen", severity: 0.15, confidence: 0.4 }),
      ],
      now,
    );
    expect(f.severity).toBeGreaterThan(0.5);
  });

  it("surfaces disagreement when sources conflict", () => {
    const agree = fuseSignals(
      "a1",
      [sig({ severity: 0.8 }), sig({ severity: 0.82 })],
      now,
    );
    const conflict = fuseSignals(
      "a1",
      [sig({ severity: 0.95 }), sig({ severity: 0.05 })],
      now,
    );
    expect(conflict.disagreement).toBeGreaterThan(agree.disagreement);
  });

  it("treats a 'restored' report as evidence of low severity", () => {
    const f = fuseSignals("a1", [sig({ kind: "restored", severity: 0.9 })], now);
    expect(f.severity).toBeLessThan(0.3);
  });
});

describe("scoring", () => {
  const hospital: Asset = {
    id: "h",
    name: "Hospital",
    type: "hospital",
    x: 0.5,
    y: 0.5,
    populationServed: 80000,
    vulnerabilityShare: 0.6,
    baseCriticality: 1,
    unblocks: ["x", "y"],
    estimatedRepairDays: 2,
    status: "degraded",
  };
  const park: Asset = {
    ...hospital,
    id: "p",
    name: "Park",
    type: "road",
    populationServed: 2000,
    vulnerabilityShare: 0.1,
    baseCriticality: 0.2,
    unblocks: [],
    estimatedRepairDays: 8,
  };

  it("scores within 0..100 and returns a full factor breakdown", () => {
    const f = fuseSignals(hospital.id, [sig({ assetId: hospital.id })], now);
    const r = scoreAsset(hospital, f, DEFAULT_WEIGHTS);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.factors).toHaveLength(Object.keys(DEFAULT_WEIGHTS).length);
    const total = r.factors.reduce((s, x) => s + x.contribution, 0);
    expect(total).toBeGreaterThan(0);
  });

  it("ranks a critical hospital above a minor road, all else equal", () => {
    const fused = new Map([
      [hospital.id, fuseSignals(hospital.id, [sig({ assetId: hospital.id })], now)],
      [park.id, fuseSignals(park.id, [sig({ assetId: park.id })], now)],
    ]);
    const ranked = rankAssets([park, hospital], fused, DEFAULT_WEIGHTS);
    expect(ranked[0].assetId).toBe(hospital.id);
    expect(ranked[0].rank).toBe(1);
  });

  it("flags low-confidence estimates for verification", () => {
    const thin = fuseSignals(
      hospital.id,
      [sig({ assetId: hospital.id, source: "citizen", confidence: 0.3 })],
      now,
    );
    const r = scoreAsset(hospital, thin, DEFAULT_WEIGHTS);
    expect(r.needsVerification).toBe(true);
  });
});
