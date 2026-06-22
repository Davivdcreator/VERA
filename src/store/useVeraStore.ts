import { create } from "zustand";
import type {
  Asset,
  CriteriaWeights,
  DecisionRecord,
  DecisionState,
  FusedEstimate,
  PriorityResult,
  Signal,
} from "@/domain/types";
import { fuseSignals } from "@/domain/fusion";
import { rankAssets } from "@/domain/scoring";
import { DEFAULT_WEIGHTS } from "@/domain/criteria";
import { ASSETS, INITIAL_SIGNALS } from "@/data/seed";
import { startSimulator } from "@/data/simulator";

/** Cap retained signals so a long-running demo stays snappy. */
const MAX_SIGNALS = 400;

interface VeraState {
  assets: Asset[];
  signals: Signal[];
  weights: CriteriaWeights;
  fused: Map<string, FusedEstimate>;
  priorities: PriorityResult[];
  decisions: DecisionRecord[];
  selectedAssetId: string | null;
  live: boolean;
  lastSignal: Signal | null;
  _stop: (() => void) | null;

  ingest: (signal: Signal) => void;
  recompute: () => void;
  setWeight: (key: keyof CriteriaWeights, value: number) => void;
  resetWeights: () => void;
  select: (assetId: string | null) => void;
  toggleLive: () => void;
  commitDecision: (assetId: string, state: DecisionState, note?: string) => void;
}

function recomputeFrom(
  assets: Asset[],
  signals: Signal[],
  weights: CriteriaWeights,
): { fused: Map<string, FusedEstimate>; priorities: PriorityResult[] } {
  const now = Date.now();
  const byAsset = new Map<string, Signal[]>();
  for (const a of assets) byAsset.set(a.id, []);
  for (const s of signals) byAsset.get(s.assetId)?.push(s);

  const fused = new Map<string, FusedEstimate>();
  for (const a of assets) {
    fused.set(a.id, fuseSignals(a.id, byAsset.get(a.id) ?? [], now));
  }
  const priorities = rankAssets(assets, fused, weights);
  return { fused, priorities };
}

const initial = recomputeFrom(ASSETS, INITIAL_SIGNALS, DEFAULT_WEIGHTS);

export const useVeraStore = create<VeraState>((set, get) => ({
  assets: ASSETS,
  signals: INITIAL_SIGNALS,
  weights: { ...DEFAULT_WEIGHTS },
  fused: initial.fused,
  priorities: initial.priorities,
  decisions: [],
  selectedAssetId: initial.priorities[0]?.assetId ?? null,
  live: false,
  lastSignal: null,
  _stop: null,

  ingest: (signal) => {
    const signals = [signal, ...get().signals].slice(0, MAX_SIGNALS);
    const { assets, weights } = get();
    const { fused, priorities } = recomputeFrom(assets, signals, weights);
    set({ signals, fused, priorities, lastSignal: signal });
  },

  recompute: () => {
    const { assets, signals, weights } = get();
    set(recomputeFrom(assets, signals, weights));
  },

  setWeight: (key, value) => {
    const weights = { ...get().weights, [key]: value };
    const { assets, signals } = get();
    set({ weights, ...recomputeFrom(assets, signals, weights) });
  },

  resetWeights: () => {
    const weights = { ...DEFAULT_WEIGHTS };
    const { assets, signals } = get();
    set({ weights, ...recomputeFrom(assets, signals, weights) });
  },

  select: (assetId) => set({ selectedAssetId: assetId }),

  toggleLive: () => {
    const { live, _stop } = get();
    if (live) {
      _stop?.();
      set({ live: false, _stop: null });
    } else {
      const stop = startSimulator((s) => get().ingest(s));
      set({ live: true, _stop: stop });
    }
  },

  commitDecision: (assetId, state, note) => {
    const { assets, priorities, fused, weights, decisions } = get();
    const asset = assets.find((a) => a.id === assetId);
    const priority = priorities.find((p) => p.assetId === assetId);
    const fusedEstimate = fused.get(assetId);
    if (!asset || !priority || !fusedEstimate) return;

    const record: DecisionRecord = {
      id: `dec-${Date.now()}`,
      assetId,
      assetName: asset.name,
      state,
      timestamp: Date.now(),
      actor: "Duty Officer",
      note,
      snapshot: {
        score: priority.score,
        rank: priority.rank,
        confidence: priority.confidence,
        factors: priority.factors,
        fused: fusedEstimate,
        weights: { ...weights },
      },
    };
    set({ decisions: [record, ...decisions] });
  },
}));
