/**
 * Sidebar — left nav. DESIGN_SYSTEM.md §4.1 / §5.2.
 *
 * 240px expanded · 64px collapsed icon rail (collapses at lg). Brand block at
 * top, grouped nav items, section labels. Routed items use react-router NavLink
 * (active = current route); items without a route yet render as inert buttons.
 */
import { NavLink } from "react-router-dom";
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
  /** Route path; omit for not-yet-built (inert) items. */
  to?: string;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard, to: "/" },
      { id: "map", label: "Live Map", icon: MapPin },
      { id: "telemetry", label: "Telemetry", icon: Activity },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "danger", label: "Danger Zones", icon: AlertTriangle, to: "/danger-zones" },
      { id: "repairs", label: "Repair Queue", icon: Wrench },
      { id: "assets", label: "Asset Registry", icon: Layers },
    ],
  },
  {
    label: "System",
    items: [{ id: "settings", label: "Settings", icon: Settings }],
  },
];

const BASE =
  "relative flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150 ease-standard outline-none focus-visible:shadow-[var(--shadow-focus)] lg:max-xl:justify-center lg:max-xl:px-0";
const ACTIVE = "bg-accent-soft text-text-primary";
const INACTIVE = "text-text-secondary hover:bg-surface-2 hover:text-text-primary";

function NavRow({ item }: { item: NavItem }) {
  const Icon = item.icon;

  if (item.to) {
    return (
      <NavLink
        to={item.to}
        title={item.label}
        end={item.to === "/"}
        className={({ isActive }) => cn(BASE, isActive ? ACTIVE : INACTIVE)}
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span
                className="absolute inset-y-0 left-0 w-0.5 rounded-pill bg-accent"
                aria-hidden="true"
              />
            )}
            <Icon size={18} className={cn("shrink-0", isActive && "text-accent")} aria-hidden="true" />
            <span className="truncate lg:max-xl:hidden">{item.label}</span>
          </>
        )}
      </NavLink>
    );
  }

  return (
    <button type="button" title={item.label} className={cn(BASE, INACTIVE)}>
      <Icon size={18} className="shrink-0" aria-hidden="true" />
      <span className="truncate lg:max-xl:hidden">{item.label}</span>
    </button>
  );
}

export interface SidebarProps {
  className?: string;
}

export function Sidebar({ className = "" }: SidebarProps) {
  return (
    <nav
      aria-label="Primary"
      className={cn("flex h-full flex-col border-r border-border-subtle bg-surface-1", className)}
    >
      {/* Brand block. */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand text-sm font-extrabold text-white"
          aria-hidden="true"
        >
          V
        </span>
        <span className="text-base font-bold text-text-primary lg:max-xl:hidden">VERA</span>
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
            {group.items.map((item) => (
              <NavRow key={item.id} item={item} />
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}

export default Sidebar;
