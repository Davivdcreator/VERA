/**
 * Sidebar — left nav. DESIGN_SYSTEM.md §4.1 / §5.2.
 *
 * 240px expanded · 64px collapsed icon rail (responsive: collapses at lg).
 * Brand block at top, grouped nav items, section labels.
 *
 * Single-page app — items are presentational state (active item highlighted),
 * no router. The active item carries the accent rail + accent-soft fill.
 */
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  LayoutDashboard,
  Layers,
  MapPin,
  Settings,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard },
      { id: "map", label: "Live Map", icon: MapPin },
      { id: "telemetry", label: "Telemetry", icon: Activity },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "alerts", label: "Alerts", icon: AlertTriangle },
      { id: "repairs", label: "Repair Queue", icon: Wrench },
      { id: "assets", label: "Asset Registry", icon: Layers },
    ],
  },
  {
    label: "System",
    items: [{ id: "settings", label: "Settings", icon: Settings }],
  },
];

export interface SidebarProps {
  className?: string;
}

export function Sidebar({ className = "" }: SidebarProps) {
  const [active, setActive] = useState("overview");

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex h-full flex-col border-r border-border-subtle bg-surface-1",
        className,
      )}
    >
      {/* Brand block. */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand text-sm font-extrabold text-white"
          aria-hidden="true"
        >
          V
        </span>
        <span className="text-base font-bold text-text-primary lg:max-xl:hidden">
          VERA
        </span>
        <span
          className="ml-auto h-1.5 w-1.5 rounded-pill bg-accent lg:max-xl:hidden"
          aria-hidden="true"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4 pt-1">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label ?? `group-${gi}`} className="flex flex-col gap-0.5">
            {group.label && (
              <span className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase leading-none tracking-[0.08em] text-text-muted lg:max-xl:hidden">
                {group.label}
              </span>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === active;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setActive(item.id)}
                  title={item.label}
                  className={cn(
                    "relative flex h-10 items-center gap-3 rounded-md px-3 text-sm",
                    "transition-colors duration-150 ease-standard outline-none",
                    "focus-visible:shadow-[var(--shadow-focus)]",
                    "lg:max-xl:justify-center lg:max-xl:px-0",
                    isActive
                      ? "bg-accent-soft text-text-primary"
                      : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
                  )}
                >
                  {isActive && (
                    <span
                      className="absolute inset-y-0 left-0 w-0.5 rounded-pill bg-accent"
                      aria-hidden="true"
                    />
                  )}
                  <Icon
                    size={18}
                    className={cn("shrink-0", isActive && "text-accent")}
                    aria-hidden="true"
                  />
                  <span className="truncate lg:max-xl:hidden">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}

export default Sidebar;
