import {
  Activity,
  Antenna,
  Building2,
  Droplets,
  GraduationCap,
  TentTree,
  Waypoints,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AssetStatus, AssetType } from "@/domain/types";

/** Icon + label per infrastructure class, for map markers and lists. */
export const ASSET_META: Record<AssetType, { label: string; icon: LucideIcon }> = {
  hospital: { label: "Hospital", icon: Activity },
  water: { label: "Water", icon: Droplets },
  power: { label: "Power", icon: Zap },
  bridge: { label: "Bridge", icon: Waypoints },
  road: { label: "Road", icon: Waypoints },
  school: { label: "School / Relief", icon: GraduationCap },
  shelter: { label: "Shelter", icon: TentTree },
  telecom: { label: "Telecom", icon: Antenna },
};

export const FALLBACK_ICON = Building2;

/** Status → display color tokens (text + ring + dot). */
export const STATUS_STYLE: Record<
  AssetStatus,
  { label: string; text: string; ring: string; dot: string }
> = {
  operational: {
    label: "Operational",
    text: "text-emerald-300",
    ring: "ring-emerald-400/40",
    dot: "bg-emerald-400",
  },
  degraded: {
    label: "Degraded",
    text: "text-amber-300",
    ring: "ring-amber-400/40",
    dot: "bg-amber-400",
  },
  offline: {
    label: "Offline",
    text: "text-rose-300",
    ring: "ring-rose-400/50",
    dot: "bg-rose-400",
  },
  unknown: {
    label: "Unknown",
    text: "text-slate-400",
    ring: "ring-slate-500/40",
    dot: "bg-slate-500",
  },
};

/** Map a 0..100 priority score to a heat color (green→amber→red). */
export function scoreColor(score: number): string {
  if (score >= 70) return "#fb7185"; // rose-400
  if (score >= 50) return "#fbbf24"; // amber-400
  if (score >= 30) return "#facc15"; // yellow-400
  return "#34d399"; // emerald-400
}
