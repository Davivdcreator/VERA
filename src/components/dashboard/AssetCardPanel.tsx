/**
 * AssetCardPanel — slide-in detail card for a selected infrastructure asset.
 *
 * Renders over the right side of the dashboard. Contains:
 *   - Header: name, native name, type badge, StatusBadge, close button.
 *   - Criticality bar + breakdown factors.
 *   - Type-specific metrics (MW, voltage, beds, lanes …).
 *   - Impact: radius, population, zones.
 *   - Dependency work-tree: downstream ("Supplies → ") + upstream ("← Depends on").
 *   - Damage evidence list.
 *
 * All data comes from props — no network calls here.
 */
import type { AssetCard } from "@/lib/data/types";
import type { EconomicLossReport } from "@/lib/economics/lossModel";
import { STATE_COLOR } from "@/lib/data/loadCards";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import {
  X,
  ArrowRight,
  ArrowLeft,
  Calculator,
  CircleDollarSign,
  Route,
  ShieldAlert,
  CheckCircle2,
  ListChecks,
  Target,
  Zap,
} from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";

/* ─── helpers ─────────────────────────────────────────────────────────────── */

/** Format a large number with locale thousands separator. */
function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

function fmtMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Pretty-print a dep kind key. */
function kindLabel(kind: string): string {
  const MAP: Record<string, string> = {
    powers:          "Powers",
    supplies_water:  "Supplies water",
    provides_access: "Provides access",
    feeds_heat:      "Feeds heat",
    depends_on:      "Depends on",
    other:           "Connected to",
  };
  return MAP[kind] ?? kind;
}

/** Humanise asset type. */
function typeLabel(t: string): string {
  const MAP: Record<string, string> = {
    hospital:        "Hospital",
    power_plant:     "Power plant",
    substation:      "Substation",
    water_works:     "Water works",
    wastewater:      "Wastewater",
    pumping_station: "Pumping station",
    bridge:          "Bridge",
    heating_plant:   "Heating plant",
    telecom:         "Telecom",
    other:           "Infrastructure",
  };
  return MAP[t] ?? t;
}

/* ─── sub-components ───────────────────────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
      {children}
    </p>
  );
}

function Divider() {
  return <div className="my-4 border-t border-border-subtle" />;
}

interface CriticalityBarProps {
  value: number; // 0..1
  breakdown: Record<string, number>;
}

function CriticalityBar({ value, breakdown }: CriticalityBarProps) {
  const pct = Math.round(value * 100);
  // Color the bar by criticality tier.
  const barColor =
    pct >= 80
      ? "bg-status-offline"
      : pct >= 55
        ? "bg-status-degraded"
        : "bg-status-operational";

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm text-text-secondary">Criticality index</span>
        <span className="tabular font-mono text-sm font-semibold text-text-primary">{pct}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Breakdown factors */}
      {Object.entries(breakdown)
        .filter(([k]) => k !== "total")
        .map(([key, val]) => (
          <div key={key} className="mt-1.5 flex items-center justify-between text-xs text-text-muted">
            <span className="capitalize">{key.replace(/_/g, " ")}</span>
            <span className="tabular font-mono">{(val * 100).toFixed(0)}</span>
          </div>
        ))}
    </div>
  );
}

export interface RebuildCostRange {
  expected: number;
  low: number;
  high: number;
  currency: string;
  confidence?: "low" | "medium" | "high";
  basis_date?: string;
  includes_dependencies?: boolean;
}

export interface RebuildCostReport {
  schema_version: string;
  target: {
    name: string;
    description: string;
    location: string | null;
    asset_type: string;
    scope_summary: string;
  };
  viability: {
    is_viable_now: boolean;
    reason: string;
    blocking_dependencies: string[];
    critical_path: string[];
  };
  dependencies: Array<{
    name: string;
    description: string;
    why_required_first: string;
    rebuild_first: boolean;
    cost: RebuildCostRange;
    assumptions: string[];
    missing_inputs: string[];
  }>;
  target_cost: RebuildCostRange;
  total_program_cost: RebuildCostRange;
  line_items: Array<{
    name: string;
    category: string;
    applies_to: string;
    low: number;
    expected: number;
    high: number;
    notes: string;
  }>;
  assumptions: string[];
  risks: string[];
  missing_inputs: string[];
  recommended_next_steps: string[];
}

export interface AdvisoryReport {
  schema_version: string;
  objective: string;
  graph_summary: {
    nodes_considered: string[];
    critical_dependencies: string[];
    key_paths: Array<{
      name: string;
      path: string[];
      why_it_matters: string;
    }>;
  };
  database_queries: Array<{
    source: string;
    query_or_method: string;
    reason: string;
    result_summary: string;
  }>;
  findings: Array<{
    title: string;
    severity: "low" | "medium" | "high" | "critical";
    confidence: "low" | "medium" | "high";
    affected_nodes: string[];
    evidence: string[];
    rationale: string;
  }>;
  recommendations: Array<{
    action: string;
    priority: "low" | "medium" | "high" | "urgent";
    target_nodes: string[];
    expected_effect: string;
    dependencies: string[];
  }>;
  decision_support: {
    best_next_action: string;
    tradeoffs: string[];
    watchpoints: string[];
  };
  assumptions: string[];
  missing_inputs: string[];
}

function CostStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "accent" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        tone === "accent"
          ? "border-border-accent bg-accent-soft"
          : tone === "warning"
            ? "border-[rgba(185,121,28,0.36)] bg-warning-soft"
            : "border-border-subtle bg-surface-2",
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-semibold text-text-primary" title={value}>
        {value}
      </p>
    </div>
  );
}

function TextList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-[13px] text-text-muted">{empty}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2 text-[13px] text-text-secondary">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function recommendationPriorityRank(priority: AdvisoryReport["recommendations"][number]["priority"]): number {
  const ranks = { urgent: 0, high: 1, medium: 2, low: 3 };
  return ranks[priority] ?? 4;
}

function recommendationTone(priority: AdvisoryReport["recommendations"][number]["priority"]): string {
  if (priority === "urgent") return "border-status-offline bg-danger-soft text-status-offline";
  if (priority === "high") return "border-[rgba(185,121,28,0.36)] bg-warning-soft text-warning";
  if (priority === "medium") return "border-border-accent bg-accent-soft text-accent";
  return "border-border-subtle bg-surface-2 text-text-secondary";
}

function CostDetailsModal({
  report,
  onClose,
}: {
  report: RebuildCostReport;
  onClose: () => void;
}) {
  const currency = report.total_program_cost.currency || report.target_cost.currency;
  const dependencyTotal = report.dependencies.reduce((sum, dep) => sum + dep.cost.expected, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(14,22,38,0.48)] p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Rebuild cost estimate details"
    >
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border-default bg-surface-1 shadow-[var(--shadow-lg)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border-subtle bg-surface-2 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
              Rebuild cost estimate
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold text-text-primary" title={report.target.name}>
              {report.target.name}
            </h2>
            <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
              {report.target.scope_summary || report.target.description}
            </p>
          </div>
          <IconButton size="sm" aria-label="Close cost estimate" onClick={onClose} className="shrink-0">
            <X size={16} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <CostStat
              label="Total expected"
              value={fmtMoney(report.total_program_cost.expected, currency)}
              tone="accent"
            />
            <CostStat label="Program range" value={`${fmtMoney(report.total_program_cost.low, currency)} - ${fmtMoney(report.total_program_cost.high, currency)}`} />
            <CostStat label="Target expected" value={fmtMoney(report.target_cost.expected, report.target_cost.currency)} />
            <CostStat label="Dependency expected" value={fmtMoney(dependencyTotal, currency)} tone={dependencyTotal > 0 ? "warning" : "neutral"} />
          </section>

          <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-md border border-border-subtle bg-surface-1 p-4">
              <div className="mb-3 flex items-center gap-2">
                <CircleDollarSign size={17} aria-hidden="true" className="text-accent" />
                <h3 className="text-sm font-semibold text-text-primary">Cost structure</h3>
              </div>
              <div className="overflow-hidden rounded-md border border-border-subtle">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-surface-2 text-[10px] uppercase tracking-[0.08em] text-text-muted">
                    <tr>
                      <th className="px-3 py-2 font-bold">Item</th>
                      <th className="px-3 py-2 font-bold">Applies to</th>
                      <th className="px-3 py-2 text-right font-bold">Expected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {report.line_items.map((item, index) => (
                      <tr key={`${item.name}-${index}`} className="align-top">
                        <td className="px-3 py-2">
                          <p className="font-semibold text-text-primary">{item.name}</p>
                          <p className="mt-0.5 text-text-muted">{item.category}</p>
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{item.applies_to}</td>
                        <td className="px-3 py-2 text-right font-mono text-text-primary">
                          {fmtMoney(item.expected, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-md border border-border-subtle bg-surface-1 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Route size={17} aria-hidden="true" className="text-accent" />
                <h3 className="text-sm font-semibold text-text-primary">Viability path</h3>
              </div>
              <div className={cn(
                "rounded-md border px-3 py-2 text-sm",
                report.viability.is_viable_now
                  ? "border-[rgba(31,157,88,0.36)] bg-success-soft text-text-secondary"
                  : "border-[rgba(185,121,28,0.36)] bg-warning-soft text-text-secondary",
              )}>
                <span className="font-semibold text-text-primary">
                  {report.viability.is_viable_now ? "Viable now" : "Dependencies first"}:
                </span>{" "}
                {report.viability.reason}
              </div>
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Critical path</p>
                <div className="flex flex-wrap gap-2">
                  {report.viability.critical_path.map((step, index) => (
                    <span key={`${step}-${index}`} className="rounded-md border border-border-subtle bg-surface-2 px-2 py-1 text-[12px] text-text-secondary">
                      {index + 1}. {step}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Blocking dependencies</p>
                <TextList items={report.viability.blocking_dependencies} empty="No blocking dependencies reported." />
              </div>
            </div>
          </section>

          {report.dependencies.length > 0 && (
            <section className="mt-5 rounded-md border border-border-subtle bg-surface-1 p-4">
              <h3 className="text-sm font-semibold text-text-primary">Dependencies to rebuild first</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                {report.dependencies.map((dep) => (
                  <article key={dep.name} className="rounded-md border border-border-subtle bg-surface-2 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold text-text-primary" title={dep.name}>{dep.name}</h4>
                        <p className="mt-1 text-[12px] text-text-secondary">{dep.why_required_first}</p>
                      </div>
                      <span className="shrink-0 rounded-md bg-warning-soft px-2 py-1 font-mono text-[12px] font-semibold text-warning">
                        {fmtMoney(dep.cost.expected, dep.cost.currency)}
                      </span>
                    </div>
                    {dep.assumptions.length > 0 && (
                      <p className="mt-2 text-[12px] text-text-muted">
                        {dep.assumptions.join(" ")}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-border-subtle bg-surface-1 p-4">
              <div className="flex items-center gap-2">
                <ShieldAlert size={16} aria-hidden="true" className="text-status-offline" />
                <h3 className="text-sm font-semibold text-text-primary">Risks</h3>
              </div>
              <div className="mt-3">
                <TextList items={report.risks} empty="No risks reported." />
              </div>
            </div>
            <div className="rounded-md border border-border-subtle bg-surface-1 p-4">
              <h3 className="text-sm font-semibold text-text-primary">Next steps</h3>
              <div className="mt-3">
                <TextList items={report.recommended_next_steps} empty="No next steps reported." />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function AdvisoryDetailsModal({
  report,
  onClose,
}: {
  report: AdvisoryReport;
  onClose: () => void;
}) {
  const recommendations = [...report.recommendations].sort(
    (a, b) => recommendationPriorityRank(a.priority) - recommendationPriorityRank(b.priority),
  );
  const firstRecommendation = recommendations[0] ?? null;
  const urgentCount = recommendations.filter((item) => item.priority === "urgent").length;
  const highCount = recommendations.filter((item) => item.priority === "high").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(14,22,38,0.48)] p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Advisory details"
    >
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border-default bg-surface-1 shadow-[var(--shadow-lg)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border-subtle bg-surface-2 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
              Dependency advisory
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold text-text-primary" title={report.objective}>
              {report.objective}
            </h2>
            <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
              {report.decision_support.best_next_action}
            </p>
          </div>
          <IconButton size="sm" aria-label="Close advisory" onClick={onClose} className="shrink-0">
            <X size={16} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <CostStat label="Recommendations" value={String(report.recommendations.length)} tone="accent" />
            <CostStat label="Urgent actions" value={String(urgentCount)} tone={urgentCount > 0 ? "warning" : "neutral"} />
            <CostStat label="High priority" value={String(highCount)} tone={highCount > 0 ? "warning" : "neutral"} />
            <CostStat label="Findings" value={String(report.findings.length)} tone={report.findings.length > 0 ? "warning" : "neutral"} />
          </section>

          {firstRecommendation && (
            <section className="mt-5 overflow-hidden rounded-md border border-border-accent bg-surface-1">
              <div className="border-b border-border-subtle bg-accent-soft px-5 py-4">
                <div className="flex items-center gap-2">
                  <Zap size={18} aria-hidden="true" className="text-accent" />
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Do first</p>
                </div>
                <h3 className="mt-2 text-xl font-semibold leading-snug text-text-primary">
                  {firstRecommendation.action}
                </h3>
                <p className="mt-2 text-sm text-text-secondary">
                  {firstRecommendation.expected_effect}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
                <div className="rounded-md border border-border-subtle bg-surface-2 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Target size={15} aria-hidden="true" className="text-accent" />
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Targets</p>
                  </div>
                  <TextList items={firstRecommendation.target_nodes} empty="No target nodes reported." />
                </div>
                <div className="rounded-md border border-border-subtle bg-surface-2 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <ListChecks size={15} aria-hidden="true" className="text-accent" />
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">Prerequisites</p>
                  </div>
                  <TextList items={firstRecommendation.dependencies} empty="No prerequisites reported." />
                </div>
              </div>
            </section>
          )}

          <section className="mt-5 rounded-md border border-border-subtle bg-surface-1 p-4">
            <div className="mb-4 flex items-center gap-2">
              <CheckCircle2 size={17} aria-hidden="true" className="text-accent" />
              <h3 className="text-base font-semibold text-text-primary">Recommended action order</h3>
            </div>
            <div className="space-y-3">
              {recommendations.length > 0 ? recommendations.map((recommendation, index) => (
                <article
                  key={`${recommendation.action}-${index}`}
                  className="grid grid-cols-[2.75rem_1fr] gap-3 rounded-md border border-border-subtle bg-surface-2 p-3"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-md border border-border-subtle bg-surface-1 font-mono text-sm font-semibold text-text-primary">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h4 className="min-w-0 text-sm font-semibold leading-snug text-text-primary">
                        {recommendation.action}
                      </h4>
                      <span className={cn(
                        "shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold uppercase",
                        recommendationTone(recommendation.priority),
                      )}>
                        {recommendation.priority}
                      </span>
                    </div>
                    <p className="mt-2 text-[12px] leading-snug text-text-secondary">
                      {recommendation.expected_effect}
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Targets</p>
                        <TextList items={recommendation.target_nodes} empty="No target nodes reported." />
                      </div>
                      <div>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Prerequisites</p>
                        <TextList items={recommendation.dependencies} empty="No prerequisites reported." />
                      </div>
                    </div>
                  </div>
                </article>
              )) : (
                <p className="text-[13px] text-text-muted">No recommendations reported.</p>
              )}
            </div>
          </section>

          <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-md border border-border-subtle bg-surface-1 p-4">
              <div className="flex items-center gap-2">
                <ShieldAlert size={16} aria-hidden="true" className="text-status-offline" />
                <h3 className="text-sm font-semibold text-text-primary">Supporting findings</h3>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                {report.findings.length > 0 ? report.findings.map((finding) => (
                  <article key={finding.title} className="rounded-md border border-border-subtle bg-surface-2 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="text-sm font-semibold text-text-primary">{finding.title}</h4>
                      <span className="shrink-0 rounded-md bg-warning-soft px-2 py-1 text-[11px] font-semibold uppercase text-warning">
                        {finding.severity}
                      </span>
                    </div>
                    <p className="mt-2 text-[12px] leading-snug text-text-secondary">{finding.rationale}</p>
                    <p className="mt-2 text-[11px] text-text-muted">Confidence: {finding.confidence}</p>
                  </article>
                )) : (
                  <p className="text-[13px] text-text-muted">No findings reported.</p>
                )}
              </div>
            </div>

            <div className="rounded-md border border-border-subtle bg-surface-1 p-4">
              <h3 className="text-sm font-semibold text-text-primary">Assumptions</h3>
              <div className="mt-3">
                <TextList items={report.assumptions} empty="No assumptions reported." />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ─── main component ───────────────────────────────────────────────────────── */

/**
 * Economic outage loss — compact, scenario-based estimate of the economic
 * activity + emergency cost lost while the asset is unavailable. Distinct from
 * rebuild cost (capital reconstruction). Reuses CostStat / fmtMoney.
 */
function EconomicLossCard({
  report,
  outageHours,
  onOutageHoursChange,
}: {
  report: EconomicLossReport | null | undefined;
  outageHours: number | undefined;
  onOutageHoursChange: ((hours: number) => void) | undefined;
}) {
  if (!report) return null;

  return (
    <section className="rounded-md border border-border-subtle bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
            Economic outage loss
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Scenario estimate, not observed loss
          </p>
        </div>

        <select
          className="rounded-md border border-border-subtle bg-surface-2 px-2 py-1 text-xs text-text-primary"
          value={outageHours ?? report.outage_hours}
          onChange={(event) => onOutageHoursChange?.(Number(event.target.value))}
          aria-label="Economic outage duration"
        >
          <option value={6}>6h</option>
          <option value={12}>12h</option>
          <option value={24}>24h</option>
          <option value={48}>48h</option>
          <option value={72}>72h</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <CostStat
          label="Expected"
          value={fmtMoney(report.total_expected, report.currency)}
          tone="accent"
        />
        <CostStat
          label="Low to high"
          value={`${fmtMoney(report.low, report.currency)} - ${fmtMoney(report.high, report.currency)}`}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <CostStat label="Direct" value={fmtMoney(report.direct_loss, report.currency)} />
        <CostStat label="Cascade" value={fmtMoney(report.cascading_loss, report.currency)} />
        <CostStat label="Emergency" value={fmtMoney(report.emergency_loss, report.currency)} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <CostStat label="Severity" value={`${Math.round(report.severity * 100)}%`} />
        <CostStat label="Confidence" value={`${Math.round(report.confidence * 100)}%`} />
      </div>

      {report.affected_downstream_assets.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
            Main downstream effects
          </p>
          <ul className="space-y-1.5">
            {report.affected_downstream_assets.slice(0, 3).map((asset) => (
              <li key={asset.id} className="text-[12px] text-text-secondary">
                <span className="font-medium text-text-primary">{asset.name}</span>
                {": "}
                {fmtMoney(asset.expected_loss, report.currency)}{" "}
                <span className="text-text-muted">
                  ({Math.round(asset.propagated_severity * 100)}% propagated)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="mt-3 rounded-md border border-border-subtle bg-surface-2 p-3">
        <summary className="cursor-pointer text-[12px] font-semibold text-text-secondary">
          Assumptions
        </summary>
        <ul className="mt-2 space-y-1.5">
          {report.assumptions.map((item, index) => (
            <li key={`${item}-${index}`} className="text-[12px] text-text-muted">
              {item}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

export interface AssetCardPanelProps {
  card: AssetCard;
  /** All cards by id — used to resolve dependency names. */
  cardMap: Map<string, AssetCard>;
  /** Selects a related card and flies the map to it. */
  onSelectAsset?: (id: string) => void;
  /** Scenario-based economic outage loss for this asset (null = disabled/none). */
  economicLossReport?: EconomicLossReport | null;
  /** Current scenario outage duration (hours) for the loss estimate. */
  economicOutageHours?: number;
  /** Change the scenario outage duration. */
  onEconomicOutageHoursChange?: (hours: number) => void;
  costReport?: RebuildCostReport | null;
  costLoading?: boolean;
  costError?: string | null;
  onCalculateCost?: () => void;
  costDialogOpen?: boolean;
  onOpenCostDetails?: () => void;
  onCloseCostDetails?: () => void;
  advisoryReport?: AdvisoryReport | null;
  advisoryLoading?: boolean;
  advisoryError?: string | null;
  onRunAdvisory?: () => void;
  advisoryDialogOpen?: boolean;
  onOpenAdvisoryDetails?: () => void;
  onCloseAdvisoryDetails?: () => void;
  onClose: () => void;
}

export function AssetCardPanel({
  card,
  cardMap,
  onSelectAsset,
  economicLossReport,
  economicOutageHours,
  onEconomicOutageHoursChange,
  costReport,
  costLoading = false,
  costError,
  onCalculateCost,
  costDialogOpen = false,
  onOpenCostDetails,
  onCloseCostDetails,
  advisoryReport,
  advisoryLoading = false,
  advisoryError,
  onRunAdvisory,
  advisoryDialogOpen = false,
  onOpenAdvisoryDetails,
  onCloseAdvisoryDetails,
  onClose,
}: AssetCardPanelProps) {
  const statusColor = STATE_COLOR[card.status];
  const costEstimate = costReport?.total_program_cost ?? costReport?.target_cost ?? null;
  const advisory = advisoryReport
    ? {
        bestNextAction: advisoryReport.decision_support.best_next_action,
        findingsCount: advisoryReport.findings.length,
        recommendationsCount: advisoryReport.recommendations.length,
      }
    : null;

  return (
    /* Slide-in from the right; z-20 keeps it above map chrome (z-10). */
    <aside
      aria-label={`Asset detail: ${card.name}`}
      className={cn(
        "pointer-events-auto absolute inset-y-0 right-0 z-20 flex w-80 flex-col",
        "border-l border-border-subtle bg-surface-1 shadow-[var(--shadow-overlay)]",
        "animate-in slide-in-from-right-4 duration-200",
      )}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
            {typeLabel(card.type)}
          </p>
          <h2
            className="mt-0.5 text-base font-semibold text-text-primary leading-snug truncate"
            title={card.name}
          >
            {card.name}
          </h2>
          {card.name_native && (
            <p className="mt-0.5 truncate text-[13px] text-text-secondary" title={card.name_native}>
              {card.name_native}
            </p>
          )}
          <div className="mt-2">
            <StatusBadge status={card.status} pulse={card.status === "offline"} />
          </div>
        </div>
        <IconButton size="sm" aria-label="Close asset panel" onClick={onClose} className="shrink-0">
          <X size={16} aria-hidden="true" />
        </IconButton>
      </header>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-text-secondary">
        {onCalculateCost && (
          <div className="mb-4 rounded-md border border-border-subtle bg-surface-2 p-3">
            <Button
              variant="primary"
              size="md"
              className="w-full"
              onClick={onCalculateCost}
              disabled={costLoading}
            >
              <Calculator size={16} aria-hidden="true" />
              {costLoading ? "Calculating..." : "Calculate cost"}
            </Button>

            {costEstimate && (
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Low</dt>
                  <dd className="mt-0.5 truncate font-mono text-[12px] text-text-secondary">
                    {fmtMoney(costEstimate.low, costEstimate.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">Expected</dt>
                  <dd className="mt-0.5 truncate font-mono text-[12px] font-semibold text-text-primary">
                    {fmtMoney(costEstimate.expected, costEstimate.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">High</dt>
                  <dd className="mt-0.5 truncate font-mono text-[12px] text-text-secondary">
                    {fmtMoney(costEstimate.high, costEstimate.currency)}
                  </dd>
                </div>
              </dl>
            )}

            {costReport && onOpenCostDetails && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3 w-full"
                onClick={onOpenCostDetails}
              >
                View detailed estimate
              </Button>
            )}

            {costError && (
              <p className="mt-2 text-[12px] leading-snug text-status-offline">
                {costError}
              </p>
            )}
          </div>
        )}

        {onRunAdvisory && (
          <div className="mb-4 rounded-md border border-border-subtle bg-surface-2 p-3">
            <Button
              variant="secondary"
              size="md"
              className="w-full"
              onClick={onRunAdvisory}
              disabled={advisoryLoading}
            >
              <Route size={16} aria-hidden="true" />
              {advisoryLoading ? "Analyzing..." : "Run advisory"}
            </Button>

            {advisory && (
              <div className="mt-3 rounded-md border border-border-subtle bg-surface-1 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
                  Best next action
                </p>
                <p className="mt-1 text-[13px] font-semibold leading-snug text-text-primary">
                  {advisory.bestNextAction}
                </p>
                <p className="mt-2 text-[12px] text-text-muted">
                  {advisory.findingsCount} findings · {advisory.recommendationsCount} recommendations
                </p>
                {onOpenAdvisoryDetails && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={onOpenAdvisoryDetails}
                  >
                    View advisory details
                  </Button>
                )}
              </div>
            )}

            {advisoryError && (
              <p className="mt-2 text-[12px] leading-snug text-status-offline">
                {advisoryError}
              </p>
            )}
          </div>
        )}

        {/* Criticality */}
        <SectionLabel>Criticality</SectionLabel>
        <CriticalityBar value={card.criticality} breakdown={card.criticality_breakdown} />

        <Divider />

        {/* Impact */}
        <SectionLabel>Impact</SectionLabel>
        <dl className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-[13px] text-text-muted">Radius</dt>
            <dd className="tabular font-mono text-[13px] text-text-primary">
              {card.radius_m != null ? `${fmt(card.radius_m)} m` : "—"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-[13px] text-text-muted">Population at risk</dt>
            <dd className="tabular font-mono text-[13px] text-text-primary">
              {fmt(card.population_affected)}
            </dd>
          </div>
          {card.zones.length > 0 && (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-[13px] text-text-muted">Zones</dt>
              <dd className="text-[13px] text-text-primary text-right">
                {card.zones.join(", ")}
              </dd>
            </div>
          )}
        </dl>

        {/* Economic outage loss (scenario estimate) */}
        {economicLossReport && (
          <EconomicLossCard
            report={economicLossReport}
            outageHours={economicOutageHours}
            onOutageHoursChange={onEconomicOutageHoursChange}
          />
        )}

        {/* Dependencies */}
        {(card.downstream.length > 0 || card.upstream.length > 0) && (
          <>
            <Divider />
            <SectionLabel>Dependencies</SectionLabel>

            {card.downstream.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-text-secondary">
                  <ArrowRight size={13} aria-hidden="true" className="text-status-operational" />
                  Supplies / powers
                </p>
                <ul className="space-y-1">
                  {card.downstream.map((edge) => {
                    const target = cardMap.get(edge.assetId);
                    const name = target?.name ?? edge.assetId;
                    const canSelect = target != null && onSelectAsset != null;
                    return (
                      <li key={edge.assetId} className="flex items-center justify-between gap-2 text-[13px]">
                        {canSelect ? (
                          <button
                            type="button"
                            onClick={() => onSelectAsset(edge.assetId)}
                            className="min-w-0 truncate text-left font-medium text-accent transition-colors hover:text-accent-hover focus-visible:rounded-sm focus-visible:shadow-[var(--shadow-focus)]"
                            title={`Show ${name} on map`}
                          >
                            {name}
                          </button>
                        ) : (
                          <span className="truncate text-text-secondary" title={name}>{name}</span>
                        )}
                        <span className="shrink-0 text-text-muted">
                          {kindLabel(edge.kind)} · {Math.round(edge.weight * 100)}%
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {card.upstream.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-text-secondary">
                  <ArrowLeft size={13} aria-hidden="true" className="text-status-degraded" />
                  Depends on
                </p>
                <ul className="space-y-1">
                  {card.upstream.map((edge) => {
                    const target = cardMap.get(edge.assetId);
                    const name = target?.name ?? edge.assetId;
                    const canSelect = target != null && onSelectAsset != null;
                    return (
                      <li key={edge.assetId} className="flex items-center justify-between gap-2 text-[13px]">
                        {canSelect ? (
                          <button
                            type="button"
                            onClick={() => onSelectAsset(edge.assetId)}
                            className="min-w-0 truncate text-left font-medium text-accent transition-colors hover:text-accent-hover focus-visible:rounded-sm focus-visible:shadow-[var(--shadow-focus)]"
                            title={`Show ${name} on map`}
                          >
                            {name}
                          </button>
                        ) : (
                          <span className="truncate text-text-secondary" title={name}>{name}</span>
                        )}
                        <span className="shrink-0 text-text-muted">
                          {kindLabel(edge.kind)} · {Math.round(edge.weight * 100)}%
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}

        {/* Evidence */}
        {card.evidence.length > 0 && (
          <>
            <Divider />
            <SectionLabel>Damage evidence</SectionLabel>
            <ul className="space-y-2">
              {card.evidence.map((ev, i) => (
                <li key={i} className="rounded-md border border-border-subtle bg-surface-2 px-3 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
                    {ev.source}
                    {ev.ts && (
                      <span className="ml-2 font-normal normal-case tracking-normal">
                        {new Date(ev.ts).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[13px] text-text-secondary">{ev.detail}</p>
                  {ev.ref && (
                    <p className="mt-0.5 font-mono text-[11px] text-text-muted">{ev.ref}</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Confidence row */}
        <Divider />
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-text-muted">State confidence</span>
          <span
            className="tabular font-mono font-semibold"
            style={{ color: statusColor }}
          >
            {Math.round(card.state_confidence * 100)}%
          </span>
        </div>
      </div>
      {costDialogOpen && costReport && onCloseCostDetails && (
        <CostDetailsModal report={costReport} onClose={onCloseCostDetails} />
      )}
      {advisoryDialogOpen && advisoryReport && onCloseAdvisoryDetails && (
        <AdvisoryDetailsModal report={advisoryReport} onClose={onCloseAdvisoryDetails} />
      )}
    </aside>
  );
}

export default AssetCardPanel;
