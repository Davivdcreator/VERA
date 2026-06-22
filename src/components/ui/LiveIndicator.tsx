/**
 * LiveIndicator — DESIGN_SYSTEM.md §4.7.
 *
 * 8px dot (accent / operational when healthy, unknown when stale) with a slow
 * pulse, plus an overline LIVE / STALE label.
 */
import { cn } from "@/lib/cn";

export interface LiveIndicatorProps {
  /** Feed health. "live" → pulsing accent dot, "stale" → static unknown dot. */
  state?: "live" | "stale";
  className?: string;
}

export function LiveIndicator({ state = "live", className = "" }: LiveIndicatorProps) {
  const live = state === "live";
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "h-2 w-2 rounded-pill",
          live ? "bg-accent animate-pulse-live" : "bg-status-unknown",
        )}
        aria-hidden="true"
      />
      <span className="text-[11px] font-bold uppercase leading-none tracking-[0.08em] text-text-secondary">
        {live ? "Live" : "Stale"}
      </span>
    </span>
  );
}

export default LiveIndicator;
