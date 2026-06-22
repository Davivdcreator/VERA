import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useVeraStore } from "@/store/useVeraStore";
import { CRITERIA_HELP, CRITERIA_LABELS } from "@/domain/criteria";
import type { CriteriaWeights } from "@/domain/types";
import { Panel } from "./ui";

const KEYS = Object.keys(CRITERIA_LABELS) as (keyof CriteriaWeights)[];

export function WeightsPanel() {
  const weights = useVeraStore((s) => s.weights);
  const setWeight = useVeraStore((s) => s.setWeight);
  const reset = useVeraStore((s) => s.resetWeights);

  return (
    <Panel
      title="Prioritization Policy"
      icon={<SlidersHorizontal className="h-4 w-4 text-sky-400" />}
      actions={
        <button
          onClick={reset}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
        >
          <RotateCcw className="h-3 w-3" /> reset
        </button>
      }
      className="h-full"
      bodyClassName="overflow-y-auto p-3.5 space-y-3"
    >
      <p className="text-[11px] text-slate-500">
        These weights <i>are</i> the policy. Adjust them and the whole queue re-ranks live —
        and the active values are captured with every decision for after-action review.
      </p>
      {KEYS.map((key) => (
        <div key={key}>
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-medium text-slate-200">
              {CRITERIA_LABELS[key]}
            </label>
            <span className="tabular-nums text-[12px] font-semibold text-sky-300">
              {weights[key].toFixed(1)}×
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={weights[key]}
            onChange={(e) => setWeight(key, Number(e.target.value))}
            className="mt-1 w-full accent-sky-400"
          />
          <p className="text-[10px] leading-tight text-slate-500">{CRITERIA_HELP[key]}</p>
        </div>
      ))}
    </Panel>
  );
}
