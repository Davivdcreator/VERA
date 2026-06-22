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
import { STATE_COLOR } from "@/lib/data/loadCards";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import { X, ArrowRight, ArrowLeft } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";

/* ─── helpers ─────────────────────────────────────────────────────────────── */

/** Format a large number with locale thousands separator. */
function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

/** Format a metric value (may be string "unknown"). */
function fmtMetric(v: string | number): string {
  if (v === "unknown" || v === null || v === undefined) return "—";
  return String(v);
}

/** Pretty-print a dep kind key. */
function kindLabel(kind: string): string {
  const MAP: Record<string, string> = {
    powers:          "Powers",
    supplies_water:  "Supplies water",
    provides_access: "Provides access",
    feeds_heat:      "Feeds heat",
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

/* ─── metric rows for each asset type ─────────────────────────────────────── */

const METRIC_LABELS: Record<string, string> = {
  capacity_mw:        "Capacity (MW)",
  avg_output_mw:      "Avg output (MW)",
  source:             "Energy source",
  method:             "Method",
  voltage_kv:         "Voltage (kV)",
  beds:               "Beds",
  emergency:          "Emergency",
  speciality:         "Speciality",
  operator_type:      "Operator",
  population_served:  "Population served",
  lanes:              "Lanes",
  maxspeed:           "Max speed",
  max_weight:         "Max weight (t)",
  heating_type:       "Heating type",
  power_output_mw:    "Power output (MW)",
  technology:         "Technology",
  capacity_bps:       "Capacity (bps)",
  redundancy:         "Redundancy",
};

function MetricsTable({ metrics }: { metrics: Record<string, string | number> }) {
  const entries = Object.entries(metrics).filter(([, v]) => v !== null && v !== undefined);
  if (!entries.length) return null;
  return (
    <dl className="space-y-1">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-2">
          <dt className="text-[13px] text-text-muted">{METRIC_LABELS[k] ?? k.replace(/_/g, " ")}</dt>
          <dd className="tabular font-mono text-[13px] text-text-primary">{fmtMetric(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ─── main component ───────────────────────────────────────────────────────── */

export interface AssetCardPanelProps {
  card: AssetCard;
  /** All cards by id — used to resolve dependency names. */
  cardMap: Map<string, AssetCard>;
  onClose: () => void;
}

export function AssetCardPanel({ card, cardMap, onClose }: AssetCardPanelProps) {
  const statusColor = STATE_COLOR[card.status];

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

        {/* Criticality */}
        <SectionLabel>Criticality</SectionLabel>
        <CriticalityBar value={card.criticality} breakdown={card.criticality_breakdown} />

        <Divider />

        {/* Type-specific metrics */}
        <SectionLabel>Metrics</SectionLabel>
        <MetricsTable metrics={card.metrics} />

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
                    return (
                      <li key={edge.assetId} className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="truncate text-text-secondary" title={name}>{name}</span>
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
                    return (
                      <li key={edge.assetId} className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="truncate text-text-secondary" title={name}>{name}</span>
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
    </aside>
  );
}

export default AssetCardPanel;
