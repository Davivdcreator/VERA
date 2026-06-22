import { Download, ScrollText } from "lucide-react";
import { useVeraStore } from "@/store/useVeraStore";
import { scoreColor } from "@/lib/assetMeta";
import { timeAgo } from "@/lib/format";
import type { DecisionState } from "@/domain/types";
import { Panel, Pill } from "./ui";

const STATE_STYLE: Record<DecisionState, string> = {
  queued: "bg-slate-700/50 text-slate-300",
  dispatched: "bg-sky-500/15 text-sky-300",
  in_progress: "bg-amber-500/15 text-amber-300",
  restored: "bg-emerald-500/15 text-emerald-300",
  deferred: "bg-slate-700/40 text-slate-400",
};

export function DecisionLog() {
  const decisions = useVeraStore((s) => s.decisions);

  function exportLog() {
    const blob = new Blob([JSON.stringify(decisions, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vera-decision-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel
      title="Decision & Audit Log"
      icon={<ScrollText className="h-4 w-4 text-sky-400" />}
      actions={
        <button
          onClick={exportLog}
          disabled={decisions.length === 0}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 disabled:opacity-40"
        >
          <Download className="h-3 w-3" /> export
        </button>
      }
      className="h-full"
      bodyClassName="overflow-y-auto"
    >
      {decisions.length === 0 ? (
        <div className="grid h-full place-items-center p-6 text-center text-[12px] text-slate-500">
          No decisions committed yet. Actions from the Decision Brief are recorded here with a
          full snapshot of the evidence and weights that justified them.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-edge)]/60">
          {decisions.map((d) => (
            <li key={d.id} className="vera-fade-in px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12.5px] font-medium text-slate-100">
                  {d.assetName}
                </span>
                <Pill className={STATE_STYLE[d.state]}>{d.state.replace("_", " ")}</Pill>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-slate-500">
                <span>
                  score{" "}
                  <b style={{ color: scoreColor(d.snapshot.score) }}>{d.snapshot.score}</b> · rank #
                  {d.snapshot.rank}
                </span>
                <span>conf {Math.round(d.snapshot.confidence * 100)}%</span>
                <span>by {d.actor}</span>
                <span>{timeAgo(d.timestamp)}</span>
              </div>
              <div className="mt-1 text-[10px] text-slate-600">
                top factor: {d.snapshot.factors[0]?.label} ·{" "}
                weights captured: {Object.values(d.snapshot.weights).map((w) => w.toFixed(1)).join("/")}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
