import { useMemo } from "react";
import {
  Bar as RBar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CheckCircle2,
  CircleSlash,
  FileSearch,
  Truck,
  Wrench,
} from "lucide-react";
import { useVeraStore } from "@/store/useVeraStore";
import { SOURCE_PROFILES } from "@/domain/sources";
import { ASSET_META, scoreColor } from "@/lib/assetMeta";
import { pct, timeAgo } from "@/lib/format";
import type { DecisionState } from "@/domain/types";
import { Bar, Panel, Pill } from "./ui";

export function AssetDetail() {
  const selected = useVeraStore((s) => s.selectedAssetId);
  const assets = useVeraStore((s) => s.assets);
  const priorities = useVeraStore((s) => s.priorities);
  const fused = useVeraStore((s) => s.fused);
  const signals = useVeraStore((s) => s.signals);
  const commit = useVeraStore((s) => s.commitDecision);

  const asset = assets.find((a) => a.id === selected);
  const priority = priorities.find((p) => p.assetId === selected);
  const f = selected ? fused.get(selected) : undefined;

  const evidence = useMemo(
    () => signals.filter((s) => s.assetId === selected).slice(0, 8),
    [signals, selected],
  );

  if (!asset || !priority || !f) {
    return (
      <Panel title="Asset Detail" className="h-full">
        <div className="grid h-full place-items-center p-6 text-center text-sm text-slate-500">
          Select an asset on the map or queue to inspect its evidence and the
          rationale behind its priority.
        </div>
      </Panel>
    );
  }

  const Icon = ASSET_META[asset.type].icon;
  const chartData = priority.factors.map((fac) => ({
    name: fac.label,
    value: Number(fac.contribution.toFixed(3)),
    key: fac.key,
  }));

  const actions: { state: DecisionState; label: string; icon: typeof Truck; cls: string }[] = [
    { state: "dispatched", label: "Dispatch crew", icon: Truck, cls: "bg-sky-500/20 text-sky-200 ring-sky-400/40 hover:bg-sky-500/30" },
    { state: "in_progress", label: "Mark in-progress", icon: Wrench, cls: "bg-amber-500/15 text-amber-200 ring-amber-400/40 hover:bg-amber-500/25" },
    { state: "restored", label: "Restored", icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/40 hover:bg-emerald-500/25" },
    { state: "deferred", label: "Defer", icon: CircleSlash, cls: "bg-slate-700/40 text-slate-300 ring-slate-500/40 hover:bg-slate-700/60" },
  ];

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <Icon className="h-4 w-4 text-sky-400" /> Decision Brief
        </span>
      }
      className="h-full"
      bodyClassName="overflow-y-auto"
    >
      <div className="vera-fade-in space-y-4 p-3.5">
        {/* Headline */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-white">{asset.name}</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {ASSET_META[asset.type].label} · {asset.populationServed.toLocaleString()} served ·
              ~{asset.estimatedRepairDays}d to restore
            </p>
          </div>
          <div className="text-right">
            <div
              className="text-3xl font-extrabold leading-none"
              style={{ color: scoreColor(priority.score) }}
            >
              {priority.score}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              rank #{priority.rank}
            </div>
          </div>
        </div>

        {/* Fused estimate confidence band */}
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Fused damage" value={pct(f.severity)} bar={f.severity} color="#fb7185" />
          <Metric label="Confidence" value={pct(f.confidence)} bar={f.confidence} color="#38bdf8" />
          <Metric
            label="Disagreement"
            value={pct(f.disagreement)}
            bar={f.disagreement}
            color="#fbbf24"
          />
        </div>

        {priority.needsVerification && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            <FileSearch className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <b>Provisional.</b> Evidence is thin or contested ({f.signalCount} signals,{" "}
              {pct(f.disagreement)} disagreement). VERA recommends verification before
              committing scarce crews.
            </span>
          </div>
        )}

        {/* Score breakdown — the defensible part */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-slate-200">Why this rank</h3>
            <Pill className="bg-slate-800/60 text-slate-400">weighted factor contributions</Pill>
          </div>
          <div className="h-[150px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={108}
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(148,163,184,0.08)" }}
                  contentStyle={{
                    background: "#0f1626",
                    border: "1px solid #1f2c46",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  formatter={(v: number) => [v.toFixed(3), "contribution"]}
                />
                <RBar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}>
                  {chartData.map((d) => (
                    <Cell key={d.key} fill={scoreColor(priority.score)} fillOpacity={0.85} />
                  ))}
                </RBar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-1 space-y-1">
            {priority.factors.slice(0, 3).map((fac) => (
              <li key={fac.key} className="text-[11px] text-slate-400">
                <span className="font-medium text-slate-300">{fac.label}:</span> {fac.rationale}
              </li>
            ))}
          </ul>
        </div>

        {/* Evidence trail */}
        <div>
          <h3 className="mb-1.5 text-[12px] font-semibold text-slate-200">
            Evidence trail ({evidence.length})
          </h3>
          <ul className="space-y-1.5">
            {evidence.map((s) => {
              const prof = SOURCE_PROFILES[s.source];
              return (
                <li
                  key={s.id}
                  className="rounded-lg border border-[var(--color-edge)]/70 bg-[var(--color-panel-2)]/60 px-2.5 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[11px] font-semibold ${prof.color}`}>{prof.label}</span>
                    <span className="text-[10px] text-slate-500">{timeAgo(s.timestamp)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-slate-400">
                    <span className="capitalize">{s.kind.replace("_", " ")}</span>
                    <span>· sev {pct(s.severity)}</span>
                    <span>· conf {pct(s.confidence)}</span>
                  </div>
                  {s.note && <p className="mt-0.5 text-[10.5px] text-slate-500">“{s.note}”</p>}
                </li>
              );
            })}
            {evidence.length === 0 && (
              <li className="text-[11px] text-slate-500">No signals yet for this asset.</li>
            )}
          </ul>
        </div>

        {/* Decision actions — commits an immutable snapshot */}
        <div>
          <h3 className="mb-1.5 text-[12px] font-semibold text-slate-200">Commit decision</h3>
          <div className="grid grid-cols-2 gap-2">
            {actions.map((a) => (
              <button
                key={a.state}
                onClick={() => commit(asset.id, a.state)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-[11.5px] font-semibold ring-1 transition ${a.cls}`}
              >
                <a.icon className="h-3.5 w-3.5" />
                {a.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-slate-500">
            Each commit snapshots the score, factors, fused estimate and weights as they stand
            now — an auditable record of <i>what was known and why</i>.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function Metric({
  label,
  value,
  bar,
  color,
}: {
  label: string;
  value: string;
  bar: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-edge)]/70 bg-[var(--color-panel-2)]/50 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="my-1 text-[15px] font-bold" style={{ color }}>
        {value}
      </div>
      <Bar value={bar} color={color} height={4} />
    </div>
  );
}
