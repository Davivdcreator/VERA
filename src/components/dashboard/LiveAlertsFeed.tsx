/**
 * LiveAlertsFeed — vertical feed of status-badged events.
 * DESIGN_SYSTEM.md §5.2 (Panel B) — timestamp (mono data-sm) + asset + state
 * change. Scrollable. aria-live="polite" per the a11y checklist (§6).
 */
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AlertEvent } from "@/data/dashboardData";

export interface LiveAlertsFeedProps {
  events: AlertEvent[];
}

export function LiveAlertsFeed({ events }: LiveAlertsFeedProps) {
  return (
    <ul aria-live="polite" className="flex flex-col">
      {events.map((e, i) => (
        <li
          key={e.id}
          className={`flex items-start gap-3 py-3 ${
            i < events.length - 1 ? "border-b border-border-subtle" : ""
          }`}
        >
          <time className="tabular mt-0.5 shrink-0 font-mono text-xs text-text-muted">
            {e.time}
          </time>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-sm font-semibold text-text-primary">
              {e.asset}
            </span>
            <span className="text-[13px] text-text-secondary">{e.message}</span>
          </div>
          <StatusBadge status={e.state} pulse={e.live} className="ml-auto shrink-0" />
        </li>
      ))}
    </ul>
  );
}

export default LiveAlertsFeed;
