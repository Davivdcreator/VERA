/**
 * Repair Queue — prioritized repair backlog (hardcoded demo data).
 *
 * Same register-table style as Reports. Each row is tied to a real point on the
 * main map: "Locate" deep-links to /?lat=&lng=&zoom=, which the Dashboard reads
 * and flies the map to.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import type { InfraStatus } from "@/lib/data/types";

interface RepairItem {
  id: string;
  asset: string;
  type: string;
  district: string;
  status: InfraStatus;
  /** 0–100; drives the heat-colored cell and the ranking. */
  priority: number;
  eta: string;
  crew: string;
  lat: number;
  lng: number;
}

// Tied to real Kyiv asset coordinates so the map link lands on the right point.
const REPAIRS: RepairItem[] = [
  { id: "RPR-2026-0231", asset: "Kyiv CHP-5 Power Plant", type: "Power plant", district: "Darnytskyi", status: "offline", priority: 96, eta: "3d", crew: "Kyivteploenergo #2", lat: 50.394218, lng: 30.568362 },
  { id: "RPR-2026-0488", asset: "Tsentr 110kV Substation", type: "Substation", district: "Pecherskyi", status: "offline", priority: 88, eta: "8h", crew: "DTEK emergency brigade", lat: 50.437982, lng: 30.523286 },
  { id: "RPR-2026-0612", asset: "Bilychanska Water Pumping Station", type: "Water works", district: "Sviatoshynskyi", status: "degraded", priority: 81, eta: "12h", crew: "Kyivvodokanal #3", lat: 50.477214, lng: 30.339344 },
  { id: "RPR-2026-0140", asset: "Pivdennyi Bridge", type: "Bridge", district: "Dniprovskyi", status: "degraded", priority: 73, eta: "5d", crew: "Mostobud unit", lat: 50.39734, lng: 30.572299 },
  { id: "RPR-2026-0301", asset: "Kyiv CHP-6 Power Plant", type: "Power plant", district: "Desnianskyi", status: "offline", priority: 64, eta: "4d", crew: "Kyivteploenergo #4", lat: 50.531233, lng: 30.666985 },
  { id: "RPR-2026-0077", asset: "Smorodynska Pumping Station", type: "Pumping station", district: "Holosiivskyi", status: "degraded", priority: 52, eta: "1d", crew: "Kyivvodokanal #1", lat: 50.473806, lng: 30.474483 },
  { id: "RPR-2026-0455", asset: "Darnytska TEC-4", type: "Power plant", district: "Dniprovskyi", status: "operational", priority: 28, eta: "Scheduled", crew: "Centerenergo crew", lat: 50.447978, lng: 30.64408 },
];

/** Map a 0–100 priority to a heat-ramp text color (low → critical). */
function priorityColor(score: number): string {
  if (score >= 85) return "text-heat-5";
  if (score >= 70) return "text-heat-4";
  if (score >= 50) return "text-heat-3";
  if (score >= 30) return "text-heat-2";
  return "text-heat-1";
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

export function RepairQueue() {
  const rows = useMemo(() => [...REPAIRS].sort((a, b) => b.priority - a.priority), []);
  const summary = useMemo(() => {
    const critical = REPAIRS.filter((r) => r.status === "offline").length;
    return `${REPAIRS.length} assets queued · ${critical} offline`;
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-5 py-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Repair Queue</h1>
          <p className="text-[13px] text-text-muted">Prioritized repair backlog · Kyiv</p>
        </div>
        <p className="text-[12px] text-text-muted">{summary} · updated 12:41</p>
      </header>

      <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface-1">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-text-muted">Repair priority register</h2>
          <span className="text-[11px] text-text-muted">{rows.length} records · ranked</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="h-9 bg-surface-2">
                <Th align="right">Priority</Th>
                <Th>Asset</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th align="right">ETA</Th>
                <Th>Crew</Th>
                <Th>Location</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border-subtle align-top transition-colors duration-150 ease-standard hover:bg-surface-2"
                >
                  <td className={cn("tabular px-3 py-2.5 text-right font-mono text-sm font-semibold", priorityColor(r.priority))}>
                    {r.priority}
                  </td>
                  <td className="max-w-[220px] px-3 py-2.5">
                    <span className="block truncate text-[13px] font-medium text-text-primary">{r.asset}</span>
                    <span className="block font-mono text-[11px] text-text-muted">{r.id}</span>
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-text-secondary">{r.type}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.status} pulse={r.status === "offline"} />
                  </td>
                  <td className="tabular px-3 py-2.5 text-right font-mono text-[13px] text-text-secondary">{r.eta}</td>
                  <td className="px-3 py-2.5 text-[12px] text-text-muted">{r.crew}</td>
                  <td className="px-3 py-2.5">
                    <Link
                      to={`/?lat=${r.lat}&lng=${r.lng}&zoom=15`}
                      title={`${r.district} — show on map`}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-accent outline-none hover:underline focus-visible:shadow-[var(--shadow-focus)]"
                    >
                      <MapPin size={13} aria-hidden="true" />
                      {r.district}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-text-muted">
        Ranked by VERA priority score (criticality × confidence × population at risk). Click a location to view it on the map.
      </p>
    </div>
  );
}

export default RepairQueue;
