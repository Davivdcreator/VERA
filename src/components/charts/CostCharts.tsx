/**
 * VERA-themed rebuild-cost charts (Recharts, themed with the app's --color-viz-*
 * / surface / text tokens). Follows the shadcn chart approach — a thin, themed
 * wrapper over Recharts — adapted to VERA's design system instead of shadcn's.
 *
 * We measure the container width ourselves and render a fixed-size <BarChart>
 * rather than using <ResponsiveContainer>, which renders blank in some flex/grid
 * + React 18 StrictMode setups (the cause of the empty chart boxes).
 *
 * Each chart takes a RebuildCostReport and reads it directly, so they render the
 * exact numbers the agent produced.
 */
import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, Cell, Tooltip, XAxis, YAxis } from "recharts";
import type { RebuildCostReport } from "@/components/dashboard/AssetCardPanel";

const VIZ = [
  "var(--color-viz-1)",
  "var(--color-viz-2)",
  "var(--color-viz-3)",
  "var(--color-viz-4)",
  "var(--color-viz-5)",
  "var(--color-viz-6)",
];

const CATEGORY_LABELS: Record<string, string> = {
  demolition: "Demolition",
  hard_cost: "Hard cost",
  utilities: "Utilities",
  soft_cost: "Soft cost",
  dependency: "Dependency",
  contingency: "Contingency",
  resilience: "Resilience",
  other: "Other",
};

const CHART_HEIGHT = 200;

function fmtCompact(value: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
}

function fmtFull(value: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  }
}

interface Row {
  label: string;
  expected: number;
  low: number;
  high: number;
}

const toRow = (label: string, low: number, expected: number, high: number): Row => ({ label, low, expected, high });

/** Track the live width of a block so we can give Recharts an explicit pixel size. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TooltipContent({ active, payload, currency }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Row;
  return (
    <div className="rounded-md border border-border-default bg-surface-overlay px-2.5 py-2 text-[12px] shadow-[var(--shadow-overlay)] backdrop-blur-md">
      <p className="font-semibold text-text-primary">{row.label}</p>
      <p className="mt-0.5 font-mono text-text-secondary">
        {fmtFull(row.expected, currency)} <span className="text-text-muted">expected</span>
      </p>
      <p className="font-mono text-[11px] text-text-muted">
        {fmtFull(row.low, currency)} – {fmtFull(row.high, currency)}
      </p>
    </div>
  );
}

/** A titled, self-measuring horizontal bar chart of {expected} per row. */
function BarFrame({ title, rows, currency }: { title: string; rows: Row[]; currency: string }) {
  const { ref, width } = useWidth();
  if (rows.length === 0) return null;
  return (
    <div className="rounded-md border border-border-subtle bg-surface-1 p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">{title}</p>
      <div ref={ref} className="w-full" style={{ height: CHART_HEIGHT }}>
        {width > 0 && (
          <BarChart
            width={width}
            height={CHART_HEIGHT}
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 18, bottom: 4, left: 8 }}
          >
            <XAxis
              type="number"
              tickFormatter={(v) => fmtCompact(Number(v), currency)}
              tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
              stroke="var(--color-border-subtle)"
            />
            <YAxis
              type="category"
              dataKey="label"
              width={96}
              tick={{ fill: "var(--color-text-secondary)", fontSize: 11 }}
              stroke="var(--color-border-subtle)"
            />
            <Tooltip cursor={{ fill: "var(--color-surface-2)" }} content={<TooltipContent currency={currency} />} />
            <Bar dataKey="expected" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
              {rows.map((_, i) => (
                <Cell key={i} fill={VIZ[i % VIZ.length]} />
              ))}
            </Bar>
          </BarChart>
        )}
      </div>
    </div>
  );
}

/** Spend grouped by line-item category. */
export function CostByCategoryChart({ report }: { report: RebuildCostReport }) {
  const currency = report.total_program_cost?.currency || report.target_cost?.currency || "USD";
  const byCat = new Map<string, { low: number; expected: number; high: number }>();
  for (const li of report.line_items ?? []) {
    const acc = byCat.get(li.category) ?? { low: 0, expected: 0, high: 0 };
    acc.low += li.low || 0;
    acc.expected += li.expected || 0;
    acc.high += li.high || 0;
    byCat.set(li.category, acc);
  }
  const rows = [...byCat.entries()]
    .map(([cat, v]) => toRow(CATEGORY_LABELS[cat] ?? cat, v.low, v.expected, v.high))
    .sort((a, b) => b.expected - a.expected);
  return <BarFrame title="Cost structure by category" rows={rows} currency={currency} />;
}

/** Target rebuild cost vs each blocking dependency. */
export function TargetVsDependenciesChart({ report }: { report: RebuildCostReport }) {
  const currency = report.target_cost?.currency || "USD";
  const rows: Row[] = [
    toRow(report.target?.name || "Target", report.target_cost.low, report.target_cost.expected, report.target_cost.high),
    ...(report.dependencies ?? []).map((d) => toRow(d.name, d.cost.low, d.cost.expected, d.cost.high)),
  ];
  return <BarFrame title="Target vs blocking dependencies" rows={rows} currency={currency} />;
}

/** Program cost spread shown as Low / Expected / High bars. */
export function CostRangeChart({ report }: { report: RebuildCostReport }) {
  const currency = report.total_program_cost?.currency || "USD";
  const tp = report.total_program_cost;
  const rows: Row[] = [
    toRow("Low", tp.low, tp.low, tp.low),
    toRow("Expected", tp.expected, tp.expected, tp.expected),
    toRow("High", tp.high, tp.high, tp.high),
  ];
  return <BarFrame title="Program cost range (low · expected · high)" rows={rows} currency={currency} />;
}

/** All three charts stacked — used in the Analyses detail and the cost modal. */
export function RebuildCostCharts({ report }: { report: RebuildCostReport }) {
  return (
    <div className="grid gap-3">
      <CostRangeChart report={report} />
      <CostByCategoryChart report={report} />
      {report.dependencies && report.dependencies.length > 0 && <TargetVsDependenciesChart report={report} />}
    </div>
  );
}
