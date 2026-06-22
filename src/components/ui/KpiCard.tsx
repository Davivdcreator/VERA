/**
 * KpiCard / StatCard — DESIGN_SYSTEM.md §4.2.
 *
 * surface-2, subtle border, lg radius, 20px padding, shadow-sm, min-height 108.
 * Label (overline) · Value (mono data-lg) · optional delta row.
 *
 * Delta direction is encoded with icon + sign + color (never color alone) so it
 * stays colorblind-safe. Optional left status rail when the KPI is a single
 * asset's state.
 */
import type { ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { InfraStatus } from "./StatusBadge";

export type DeltaTone = "good" | "bad" | "neutral";

export interface KpiDelta {
  /** Pre-formatted delta text, e.g. "+2.4%" or "3 in 24h". */
  value: string;
  /** good → operational green, bad → offline red, neutral → muted. */
  tone: DeltaTone;
  /** Trend arrow direction. Defaults from tone (good=up, bad=down). */
  direction?: "up" | "down" | "flat";
}

const RAIL_COLOR: Record<InfraStatus, string> = {
  operational: "bg-status-operational",
  degraded: "bg-status-degraded",
  offline: "bg-status-offline",
  unknown: "bg-status-unknown",
};

const DELTA_TONE: Record<DeltaTone, string> = {
  good: "text-status-operational",
  bad: "text-status-offline",
  neutral: "text-text-muted",
};

export interface KpiCardProps {
  label: ReactNode;
  value: ReactNode;
  delta?: KpiDelta;
  /** Left 3px status rail when this KPI represents a single asset's state. */
  statusRail?: InfraStatus;
  className?: string;
}

function DeltaIcon({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "up") return <ArrowUpRight size={14} aria-hidden="true" />;
  if (direction === "down") return <ArrowDownRight size={14} aria-hidden="true" />;
  return <Minus size={14} aria-hidden="true" />;
}

export function KpiCard({ label, value, delta, statusRail, className = "" }: KpiCardProps) {
  const direction =
    delta?.direction ??
    (delta?.tone === "good" ? "up" : delta?.tone === "bad" ? "down" : "flat");

  return (
    <div
      className={cn(
        "relative flex min-h-[108px] flex-col gap-2 overflow-hidden rounded-lg border border-border-subtle bg-surface-2 p-5 shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      {statusRail && (
        <span
          className={cn("absolute inset-y-0 left-0 w-[3px]", RAIL_COLOR[statusRail])}
          aria-hidden="true"
        />
      )}

      <span className="text-[11px] font-bold uppercase leading-none tracking-[0.08em] text-text-muted">
        {label}
      </span>

      <span className="tabular font-mono text-[32px] font-bold leading-none tracking-[-0.01em] text-text-primary">
        {value}
      </span>

      {delta && (
        <span
          className={cn(
            "tabular inline-flex items-center gap-1 font-mono text-xs leading-none",
            DELTA_TONE[delta.tone],
          )}
        >
          <DeltaIcon direction={direction} />
          {delta.value}
        </span>
      )}
    </div>
  );
}

export default KpiCard;
