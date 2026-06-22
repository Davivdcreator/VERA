import { AlertTriangle, ListOrdered } from "lucide-react";
import { useVeraStore } from "@/store/useVeraStore";
import { ASSET_META, STATUS_STYLE, scoreColor } from "@/lib/assetMeta";
import { compactNumber } from "@/lib/format";
import { Panel } from "./ui";

export function PriorityQueue() {
  const priorities = useVeraStore((s) => s.priorities);
  const assets = useVeraStore((s) => s.assets);
  const fused = useVeraStore((s) => s.fused);
  const decisions = useVeraStore((s) => s.decisions);
  const selected = useVeraStore((s) => s.selectedAssetId);
  const select = useVeraStore((s) => s.select);

  const assetById = new Map(assets.map((a) => [a.id, a]));
  const decidedIds = new Set(decisions.map((d) => d.assetId));

  return (
    <Panel
      title="Repair Priority Queue"
      icon={<ListOrdered className="h-4 w-4 text-sky-400" />}
      actions={<span className="text-[11px] text-slate-500">live ranking</span>}
      className="h-full"
      bodyClassName="overflow-y-auto"
    >
      <ul className="divide-y divide-[var(--color-edge)]/60">
        {priorities.map((p) => {
          const asset = assetById.get(p.assetId)!;
          const f = fused.get(p.assetId);
          const Icon = ASSET_META[asset.type].icon;
          const status = f?.status ?? "unknown";
          const isSel = selected === p.assetId;
          return (
            <li key={p.assetId}>
              <button
                onClick={() => select(p.assetId)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                  isSel ? "bg-sky-500/10" : "hover:bg-slate-800/40"
                }`}
              >
                <div
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[13px] font-bold"
                  style={{ background: `${scoreColor(p.score)}22`, color: scoreColor(p.score) }}
                >
                  {p.rank}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate text-[13px] font-medium text-slate-100">
                      {asset.name}
                    </span>
                    {decidedIds.has(p.assetId) && (
                      <span className="rounded bg-emerald-500/15 px-1 text-[9px] font-semibold uppercase text-emerald-300">
                        actioned
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-slate-500">
                    <span className={STATUS_STYLE[status].text}>
                      {STATUS_STYLE[status].label}
                    </span>
                    <span>·</span>
                    <span>{compactNumber(asset.populationServed)} served</span>
                    {p.needsVerification && (
                      <span className="inline-flex items-center gap-0.5 text-amber-400">
                        <AlertTriangle className="h-3 w-3" /> verify
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className="text-[17px] font-bold leading-none"
                    style={{ color: scoreColor(p.score) }}
                  >
                    {p.score}
                  </div>
                  <div className="text-[9px] uppercase tracking-wide text-slate-500">
                    {Math.round(p.confidence * 100)}% conf
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
