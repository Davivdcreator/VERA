import { useMemo } from "react";
import { useVeraStore } from "@/store/useVeraStore";
import { ASSET_META, STATUS_STYLE, scoreColor } from "@/lib/assetMeta";
import type { Asset } from "@/domain/types";

const W = 1000;
const H = 680;

export function CityMap() {
  const assets = useVeraStore((s) => s.assets);
  const priorities = useVeraStore((s) => s.priorities);
  const fused = useVeraStore((s) => s.fused);
  const selected = useVeraStore((s) => s.selectedAssetId);
  const select = useVeraStore((s) => s.select);
  const lastSignal = useVeraStore((s) => s.lastSignal);

  const priorityById = useMemo(
    () => new Map(priorities.map((p) => [p.assetId, p])),
    [priorities],
  );
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#16213a" strokeWidth="1" />
          </pattern>
          <radialGradient id="river" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0e2a3f" />
            <stop offset="100%" stopColor="#0a0f1a" />
          </radialGradient>
        </defs>

        <rect width={W} height={H} fill="url(#river)" />
        <rect width={W} height={H} fill="url(#grid)" />

        {/* Stylized river / flood corridor for context. */}
        <path
          d="M -20 120 C 250 180, 350 360, 620 380 S 980 520, 1040 600"
          fill="none"
          stroke="#0ea5e9"
          strokeOpacity="0.18"
          strokeWidth="60"
          strokeLinecap="round"
        />

        {/* Dependency links: this asset unblocks others. */}
        {assets.flatMap((a) =>
          a.unblocks.map((targetId) => {
            const t = assetById.get(targetId);
            if (!t) return null;
            const active = selected === a.id || selected === targetId;
            return (
              <line
                key={`${a.id}-${targetId}`}
                x1={a.x * W}
                y1={a.y * H}
                x2={t.x * W}
                y2={t.y * H}
                stroke={active ? "#38bdf8" : "#1f3354"}
                strokeWidth={active ? 2 : 1.25}
                strokeDasharray="5 6"
                opacity={active ? 0.9 : 0.5}
              />
            );
          }),
        )}

        {assets.map((a) => (
          <Marker
            key={a.id}
            asset={a}
            score={priorityById.get(a.id)?.score ?? 0}
            rank={priorityById.get(a.id)?.rank ?? 0}
            status={fused.get(a.id)?.status ?? "unknown"}
            selected={selected === a.id}
            pinging={lastSignal?.assetId === a.id}
            onSelect={() => select(a.id)}
          />
        ))}
      </svg>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-[var(--color-edge)] bg-[var(--color-panel)]/85 px-3 py-2 text-[10px] text-slate-400 backdrop-blur">
        <div className="mb-1 font-semibold text-slate-300">Priority heat</div>
        <div className="flex items-center gap-1.5">
          <Dot c="#34d399" /> low
          <Dot c="#facc15" /> <Dot c="#fbbf24" /> elevated
          <Dot c="#fb7185" /> critical
        </div>
        <div className="mt-1 text-slate-500">Marker size = population · dashed = unblocks</div>
      </div>
    </div>
  );
}

function Marker({
  asset,
  score,
  rank,
  status,
  selected,
  pinging,
  onSelect,
}: {
  asset: Asset;
  score: number;
  rank: number;
  status: keyof typeof STATUS_STYLE;
  selected: boolean;
  pinging: boolean;
  onSelect: () => void;
}) {
  const cx = asset.x * W;
  const cy = asset.y * H;
  const r = 14 + Math.min(20, Math.log10(1 + asset.populationServed) * 4);
  const color = scoreColor(score);
  const Icon = ASSET_META[asset.type].icon;
  const statusDot = STATUS_STYLE[status].dot;

  return (
    <g
      transform={`translate(${cx}, ${cy})`}
      onClick={onSelect}
      className="cursor-pointer"
      style={{ transition: "transform 0.3s" }}
    >
      {pinging && (
        <circle r={r + 6} fill="none" stroke={color} strokeWidth="2" className="vera-ping" />
      )}
      {selected && <circle r={r + 9} fill="none" stroke="#38bdf8" strokeWidth="2.5" />}

      <circle r={r} fill={color} fillOpacity={0.16} stroke={color} strokeWidth="2.5" />
      <foreignObject x={-10} y={-10} width={20} height={20}>
        <div className="grid h-5 w-5 place-items-center">
          <Icon style={{ color }} className="h-[15px] w-[15px]" />
        </div>
      </foreignObject>

      {/* rank chip */}
      <g transform={`translate(${r - 4}, ${-r - 2})`}>
        <circle r="11" fill="#0a0f1a" stroke={color} strokeWidth="1.5" />
        <text textAnchor="middle" dy="4" fontSize="12" fontWeight="700" fill="#e2e8f0">
          {rank}
        </text>
      </g>

      {/* status dot */}
      <foreignObject x={-r - 2} y={r - 8} width={12} height={12}>
        <span className={`block h-2.5 w-2.5 rounded-full ${statusDot}`} />
      </foreignObject>

      <text
        textAnchor="middle"
        y={r + 18}
        fontSize="12"
        fill="#94a3b8"
        className="pointer-events-none select-none"
      >
        {asset.name.length > 22 ? asset.name.slice(0, 21) + "…" : asset.name}
      </text>
    </g>
  );
}

function Dot({ c }: { c: string }) {
  return <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: c }} />;
}
