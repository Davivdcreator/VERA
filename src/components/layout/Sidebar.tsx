/**
 * Sidebar — left nav. DESIGN_SYSTEM.md §4.1 / §5.2.
 *
 * 64px collapsed icon rail. Brand block at top, grouped nav icons.
 * Routed items use react-router NavLink
 * (active = current route); items without a route yet render as inert buttons.
 */
import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  FileText,
  LayoutDashboard,
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
    items: [{ id: "overview", label: "Overview", icon: LayoutDashboard, to: "/" }],
  },
  {
    label: "Operations",
    items: [
      { id: "analyses", label: "Analyses", icon: BarChart3, to: "/analyses" },
      { id: "reports", label: "Reports", icon: FileText, to: "/reports" },
      { id: "danger", label: "Danger Zones", icon: AlertTriangle, to: "/danger-zones" },
      { id: "repairs", label: "Repair Queue", icon: Wrench, to: "/repairs" },
    ],
  },
];

const BASE =
  "relative flex h-10 items-center justify-center rounded-md px-0 text-sm transition-colors duration-150 ease-standard outline-none focus-visible:shadow-[var(--shadow-focus)]";
const ACTIVE = "bg-accent-soft text-text-primary";
const INACTIVE = "text-text-secondary hover:bg-surface-2 hover:text-text-primary";

// Label flyout — appears to the right of the icon on hover/focus. Replaces the
// native `title` tooltip so it's styled, instant, and keyboard-accessible.
function HoverLabel({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-border-subtle bg-surface-2 px-2 py-1 text-xs font-medium text-text-primary opacity-0 shadow-md transition-opacity duration-150 ease-standard group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {label}
    </span>
  );
}

function NavRow({ item }: { item: NavItem }) {
  const Icon = item.icon;

  if (item.to) {
    return (
      <NavLink
        to={item.to}
        aria-label={item.label}
        end={item.to === "/"}
        className={({ isActive }) => cn("group", BASE, isActive ? ACTIVE : INACTIVE)}
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
            <HoverLabel label={item.label} />
          </>
        )}
      </NavLink>
    );
  }

  return (
    <button type="button" aria-label={item.label} className={cn("group", BASE, INACTIVE)}>
      <Icon size={18} className="shrink-0" aria-hidden="true" />
      <HoverLabel label={item.label} />
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
      {/* Brand block — VERA "V" mark (public/logo/vera fav.svg). */}
      <div className="flex h-14 shrink-0 items-center justify-center">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand text-white"
          aria-label="VERA"
        >
          <svg
            viewBox="0 0 142.61 139.05"
            className="h-4 w-4"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M0,139.05l.46-3.04L59.98.67c4.14-.37,22.12-1.82,24.09,1.2,17.89,45.62,40.62,89.63,58.5,135.16.25,1.1-.7,2.03-1.07,2.03h-23L71.5,28.15l-48,110.9H0Z" />
            <circle cx="71.8" cy="91.65" r="9.62" />
          </svg>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 px-3 pb-4 pt-1">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label ?? `group-${gi}`} className="flex flex-col gap-0.5">
            {group.label && (
              <span className="sr-only">
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
