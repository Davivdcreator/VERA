/**
 * RepairPrioritiesTable — compact data-table row, DESIGN_SYSTEM.md §4.8.
 *
 * Columns: Asset · District · State (pill) · Priority (heat-colored, mono) ·
 * Confidence (mono %) · ETA. Sorted by priority desc upstream.
 *
 * This table is also the accessible equivalent of the map's priority data
 * (§6 accessibility): it conveys the same ranking without a map.
 */
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { RepairPriority } from "@/data/dashboardData";
import { cn } from "@/lib/cn";

/** Map a 0–100 priority score to a heat-ramp text color (low → critical). */
function priorityColor(score: number): string {
  if (score >= 85) return "text-heat-5";
  if (score >= 70) return "text-heat-4";
  if (score >= 50) return "text-heat-3";
  if (score >= 30) return "text-heat-2";
  return "text-heat-1";
}

export interface RepairPrioritiesTableProps {
  rows: RepairPriority[];
}

export function RepairPrioritiesTable({ rows }: RepairPrioritiesTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="h-9 bg-surface-2">
            <Th>Asset</Th>
            <Th>District</Th>
            <Th>State</Th>
            <Th align="right">Priority</Th>
            <Th align="right">Conf.</Th>
            <Th align="right">ETA</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              tabIndex={0}
              className={cn(
                "h-10 border-b border-border-subtle outline-none",
                "transition-colors duration-150 ease-standard",
                "hover:bg-surface-2 focus-visible:shadow-[var(--shadow-focus)]",
              )}
            >
              <td className="max-w-[260px] truncate px-3 text-sm font-semibold text-text-primary">
                {r.asset}
              </td>
              <td className="px-3 text-[13px] text-text-secondary">{r.district}</td>
              <td className="px-3">
                <StatusBadge status={r.state} pulse={r.state === "offline"} />
              </td>
              <td
                className={cn(
                  "tabular px-3 text-right font-mono text-sm font-medium",
                  priorityColor(r.priority),
                )}
              >
                {r.priority}
              </td>
              <td className="tabular px-3 text-right font-mono text-sm text-text-primary">
                {r.confidence}%
              </td>
              <td className="tabular px-3 text-right font-mono text-[13px] text-text-secondary">
                {r.eta}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 text-[11px] font-bold uppercase leading-none tracking-[0.08em] text-text-muted",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

export default RepairPrioritiesTable;
