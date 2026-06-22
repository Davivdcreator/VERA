/**
 * StatusBadge / Pill — DESIGN_SYSTEM.md §4.5.
 *
 * Pill shape, leading 8px status dot (never color-only: dot + text label),
 * colored by infrastructure state. Optional slow pulse on the dot for live
 * critical alarms.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Infrastructure-state vocabulary — DESIGN_SYSTEM.md §2.5. */
export type InfraStatus = "operational" | "degraded" | "offline" | "unknown";

interface StatusStyle {
  text: string;
  bg: string;
  dot: string;
  label: string;
}

const STATUS_STYLES: Record<InfraStatus, StatusStyle> = {
  operational: {
    text: "text-status-operational",
    bg: "bg-status-operational-soft",
    dot: "bg-status-operational",
    label: "Operational",
  },
  degraded: {
    text: "text-status-degraded",
    bg: "bg-status-degraded-soft",
    dot: "bg-status-degraded",
    label: "Degraded",
  },
  offline: {
    text: "text-status-offline",
    bg: "bg-status-offline-soft",
    dot: "bg-status-offline",
    label: "Offline",
  },
  unknown: {
    text: "text-status-unknown",
    bg: "bg-status-unknown-soft",
    dot: "bg-status-unknown",
    label: "Unknown",
  },
};

export interface StatusBadgeProps {
  status: InfraStatus;
  /** Override the default label text. */
  children?: ReactNode;
  /** Slow-pulse the dot (live critical alarm). */
  pulse?: boolean;
  className?: string;
}

export function StatusBadge({
  status,
  children,
  pulse = false,
  className = "",
}: StatusBadgeProps) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-pill px-2.5 text-[13px] font-semibold leading-none",
        s.text,
        s.bg,
        className,
      )}
    >
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-pill",
          s.dot,
          pulse && "animate-pulse-live",
        )}
        aria-hidden="true"
      />
      {children ?? s.label}
    </span>
  );
}

export default StatusBadge;
