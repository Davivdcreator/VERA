/**
 * Topbar — DESIGN_SYSTEM.md §4.1 / §5.1.
 *
 * 56px, surface-1, bottom border, sticky. Left: region label. Right: live clock
 * (mono data-sm), global status pill, user/menu. Clock hides < sm; region label
 * truncates to its short form < sm. Labels come from src/config/region.ts.
 */
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Clock } from "lucide-react";
import { cn } from "@/lib/cn";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { REGION } from "@/config/region";

function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return format(now, "HH:mm:ss");
}

export interface TopbarProps {
  className?: string;
}

export function Topbar({ className = "" }: TopbarProps) {
  const time = useClock();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center justify-between gap-3",
        "border-b border-border-subtle bg-surface-1 px-4 sm:px-6",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate text-base font-bold text-text-primary sm:hidden">
          {REGION.shortLabel}
        </h1>
        <h1 className="hidden truncate text-base font-bold text-text-primary sm:block">
          {REGION.shortLabel}
          <span className="font-normal text-text-muted">{` · ${REGION.subLabel}`}</span>
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <span className="tabular hidden items-center gap-1.5 font-mono text-xs text-text-secondary sm:inline-flex">
          <Clock size={14} className="text-text-muted" aria-hidden="true" />
          {time}
        </span>
        <StatusBadge status="operational">Operational</StatusBadge>
        <span
          className="grid h-7 w-7 place-items-center rounded-pill bg-surface-3 text-xs font-semibold text-text-secondary"
          aria-label="Account menu"
          role="img"
        >
          MP
        </span>
      </div>
    </header>
  );
}

export default Topbar;
