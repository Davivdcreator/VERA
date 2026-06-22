import { Rss } from "lucide-react";
import { useVeraStore } from "@/store/useVeraStore";
import { SOURCE_PROFILES } from "@/domain/sources";
import { ASSET_META } from "@/lib/assetMeta";
import { pct, timeAgo } from "@/lib/format";
import { Panel } from "./ui";

export function SignalFeed() {
  const signals = useVeraStore((s) => s.signals);
  const assets = useVeraStore((s) => s.assets);
  const select = useVeraStore((s) => s.select);
  const assetById = new Map(assets.map((a) => [a.id, a]));

  return (
    <Panel
      title="Incoming Signal Feed"
      icon={<Rss className="h-4 w-4 text-sky-400" />}
      actions={<span className="text-[11px] text-slate-500">fused on arrival</span>}
      className="h-full"
      bodyClassName="overflow-y-auto"
    >
      <ul className="divide-y divide-[var(--color-edge)]/50">
        {signals.slice(0, 40).map((s, i) => {
          const asset = assetById.get(s.assetId);
          if (!asset) return null;
          const prof = SOURCE_PROFILES[s.source];
          const Icon = ASSET_META[asset.type].icon;
          return (
            <li
              key={s.id}
              className={`flex items-center gap-2.5 px-3 py-2 ${i === 0 ? "vera-fade-in bg-sky-500/5" : ""}`}
            >
              <span className={`text-[10px] font-bold uppercase ${prof.color} w-14 shrink-0`}>
                {s.source === "partner_agency" ? "agency" : s.source}
              </span>
              <button
                onClick={() => select(asset.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span className="truncate text-[12px] text-slate-200 hover:text-sky-300">
                  {asset.name}
                </span>
              </button>
              <span className="hidden shrink-0 text-[10.5px] capitalize text-slate-500 sm:inline">
                {s.kind.replace("_", " ")}
              </span>
              <span className="shrink-0 text-[10.5px] text-slate-400">sev {pct(s.severity)}</span>
              <span className="w-16 shrink-0 text-right text-[10px] text-slate-500">
                {timeAgo(s.timestamp)}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
