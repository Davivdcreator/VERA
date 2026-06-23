/**
 * Analyses — archive of stored analyses, organized by object/asset.
 *
 * Reads the `analyses` table (written by the run-analysis edge function), groups
 * by asset, and lets you filter by asset category + analysis kind. Each asset
 * expands to its runs; rebuild-cost runs render the summary + charts.
 */
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Calculator, ChevronDown, ChevronRight, Route, Activity } from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { RebuildCostCharts } from "@/components/charts/CostCharts";
import { cn } from "@/lib/cn";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  groupByAsset,
  listAnalyses,
  type AnalysisKind,
  type StoredAnalysis,
} from "@/lib/data/analyses";
import type { RebuildCostReport } from "@/components/dashboard/AssetCardPanel";

const KIND_LABEL: Record<AnalysisKind, string> = {
  rebuild_cost: "Rebuild cost",
  advisory: "Advisory",
  simulation: "Simulation",
};

const KIND_ICON: Record<AnalysisKind, typeof Calculator> = {
  rebuild_cost: Calculator,
  advisory: Route,
  simulation: Activity,
};

function assetTypeLabel(t: string | null): string {
  if (!t) return "Other";
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtMoney(value: number | null | undefined, currency: string | null): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-pill px-3 py-1 text-[12px] font-semibold transition-colors outline-none focus-visible:shadow-[var(--shadow-focus)]",
        active
          ? "bg-accent-soft text-accent ring-1 ring-border-accent"
          : "bg-surface-2 text-text-secondary ring-1 ring-border-default hover:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}

function KindBadge({ kind }: { kind: AnalysisKind }) {
  const Icon = KIND_ICON[kind] ?? Calculator;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-text-secondary ring-1 ring-border-subtle">
      <Icon size={12} aria-hidden="true" />
      {KIND_LABEL[kind] ?? kind}
    </span>
  );
}

function AnalysisDetail({ analysis }: { analysis: StoredAnalysis }) {
  const isCost = analysis.kind === "rebuild_cost";
  const report = isCost ? (analysis.result as RebuildCostReport) : null;

  return (
    <div className="border-t border-border-subtle bg-surface-0 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <KindBadge kind={analysis.kind} />
        <span className="text-[11px] text-text-muted">{fmtDate(analysis.created_at)}</span>
        {analysis.model && (
          <span className="font-mono text-[11px] text-text-muted">· {analysis.model}</span>
        )}
        {analysis.confidence && (
          <span className="text-[11px] text-text-muted">· {analysis.confidence} confidence</span>
        )}
      </div>

      {analysis.summary && (
        <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">{analysis.summary}</p>
      )}

      {report && (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border border-border-subtle bg-surface-1 px-2 py-1.5">
              <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Low</dt>
              <dd className="mt-0.5 font-mono text-[12px] text-text-secondary">{fmtMoney(report.total_program_cost?.low, analysis.currency)}</dd>
            </div>
            <div className="rounded-md border border-border-accent bg-surface-1 px-2 py-1.5">
              <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Expected</dt>
              <dd className="mt-0.5 font-mono text-[12px] font-semibold text-text-primary">{fmtMoney(report.total_program_cost?.expected, analysis.currency)}</dd>
            </div>
            <div className="rounded-md border border-border-subtle bg-surface-1 px-2 py-1.5">
              <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">High</dt>
              <dd className="mt-0.5 font-mono text-[12px] text-text-secondary">{fmtMoney(report.total_program_cost?.high, analysis.currency)}</dd>
            </div>
          </dl>

          <div className="mt-3">
            <RebuildCostCharts report={report} />
          </div>

          {report.recommended_next_steps?.length > 0 && (
            <div className="mt-3 rounded-md border border-border-subtle bg-surface-1 p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Recommended next steps</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12px] text-text-secondary">
                {report.recommended_next_steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Analyses() {
  const [rows, setRows] = useState<StoredAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<AnalysisKind | "all">("all");
  const [typeFilter, setTypeFilter] = useState<string | "all">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await listAnalyses();
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load analyses.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const assetTypes = useMemo(
    () => [...new Set(rows.map((r) => r.asset_type).filter((t): t is string => Boolean(t)))].sort(),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) => (kindFilter === "all" || r.kind === kindFilter) && (typeFilter === "all" || r.asset_type === typeFilter),
      ),
    [rows, kindFilter, typeFilter],
  );

  const groups = useMemo(() => groupByAsset(filtered), [filtered]);

  const kpis = useMemo(() => {
    const costRows = rows.filter((r) => r.kind === "rebuild_cost" && r.cost_expected != null);
    // latest rebuild cost per asset (rows are newest-first)
    const latestByAsset = new Map<string, StoredAnalysis>();
    for (const r of costRows) if (!latestByAsset.has(r.asset_id)) latestByAsset.set(r.asset_id, r);
    const sumExpected = [...latestByAsset.values()].reduce((s, r) => s + (r.cost_expected ?? 0), 0);
    const currency = costRows[0]?.currency ?? "USD";
    return {
      total: rows.length,
      assets: new Set(rows.map((r) => r.asset_id)).size,
      sumExpected: fmtMoney(sumExpected, currency),
      last: rows[0] ? fmtDate(rows[0].created_at) : "—",
    };
  }, [rows]);

  const toggle = (id: string) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="mx-auto max-w-5xl px-5 py-6">
      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-md bg-accent-soft text-accent">
          <BarChart3 size={18} aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Analyses</h1>
          <p className="text-[13px] text-text-muted">Stored rebuild-cost and decision analyses, grouped by asset.</p>
        </div>
      </header>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Analyses" value={kpis.total} />
        <KpiCard label="Assets analysed" value={kpis.assets} />
        <KpiCard label="Σ expected program cost" value={kpis.sumExpected} />
        <KpiCard label="Last analysis" value={kpis.last} />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Kind</span>
          <Chip active={kindFilter === "all"} onClick={() => setKindFilter("all")}>All</Chip>
          {(["rebuild_cost", "advisory", "simulation"] as AnalysisKind[]).map((k) => (
            <Chip key={k} active={kindFilter === k} onClick={() => setKindFilter(k)}>{KIND_LABEL[k]}</Chip>
          ))}
        </div>
        {assetTypes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Category</span>
            <Chip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>All</Chip>
            {assetTypes.map((t) => (
              <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>{assetTypeLabel(t)}</Chip>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      {!isSupabaseConfigured ? (
        <EmptyState text="Supabase isn't configured, so stored analyses are unavailable. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env." />
      ) : loading ? (
        <EmptyState text="Loading analyses…" />
      ) : error ? (
        <EmptyState text={error} tone="error" />
      ) : groups.length === 0 ? (
        <EmptyState text="No analyses yet. Open an asset on the map and run a cost estimate to populate this page." />
      ) : (
        <div className="grid gap-3">
          {groups.map((group) => {
            const isOpen = expanded.has(group.assetId);
            const latestCost = group.analyses.find((a) => a.kind === "rebuild_cost" && a.cost_expected != null);
            return (
              <section key={group.assetId} className="overflow-hidden rounded-lg border border-border-subtle bg-surface-1">
                <button
                  type="button"
                  onClick={() => toggle(group.assetId)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-surface-2 focus-visible:shadow-[var(--shadow-focus)]"
                >
                  {isOpen ? <ChevronDown size={16} className="shrink-0 text-text-muted" /> : <ChevronRight size={16} className="shrink-0 text-text-muted" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-primary">{group.assetName}</p>
                    <p className="text-[11px] text-text-muted">{assetTypeLabel(group.assetType)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {latestCost && (
                      <span className="font-mono text-[12px] text-text-secondary">
                        {fmtMoney(latestCost.cost_expected, latestCost.currency)}
                      </span>
                    )}
                    <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-text-muted ring-1 ring-border-subtle">
                      {group.analyses.length} {group.analyses.length === 1 ? "run" : "runs"}
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div>
                    {group.analyses.map((a) => (
                      <AnalysisDetail key={a.id} analysis={a} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ text, tone = "muted" }: { text: string; tone?: "muted" | "error" }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed px-4 py-10 text-center text-sm",
        tone === "error" ? "border-status-offline/40 text-status-offline" : "border-border-subtle text-text-muted",
      )}
    >
      {text}
    </div>
  );
}

export default Analyses;
