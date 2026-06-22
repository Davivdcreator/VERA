/**
 * Static placeholder data for the VERA dashboard.
 *
 * Representative civic infrastructure-intelligence content for the Kyiv metro
 * area. This is intentionally STATIC — wire to Supabase / a live feed in a later
 * task. Values are illustrative and should not be treated as real telemetry.
 */
import type { InfraStatus } from "@/components/ui/StatusBadge";

export interface RepairPriority {
  id: string;
  asset: string;
  district: string;
  state: InfraStatus;
  /** Priority score 0–100; drives the heat-colored cell. */
  priority: number;
  /** Model confidence 0–100. */
  confidence: number;
  /** Human ETA label. */
  eta: string;
}

export interface AlertEvent {
  id: string;
  time: string;
  asset: string;
  message: string;
  state: InfraStatus;
  /** Pulse the dot for a live critical alarm. */
  live?: boolean;
}

/** Sorted by priority desc (the table renders them in this order). */
export const REPAIR_PRIORITIES: RepairPriority[] = [
  { id: "UA-KYV-0192", asset: "Paton Bridge — span E4", district: "Pechersk", state: "offline", priority: 96, confidence: 92, eta: "< 2h" },
  { id: "UA-KYV-0044", asset: "Bortnychi Aeration Station", district: "Darnytsia", state: "offline", priority: 88, confidence: 79, eta: "4h" },
  { id: "UA-KYV-0210", asset: "Substation Pivnichna", district: "Obolon", state: "degraded", priority: 74, confidence: 84, eta: "9h" },
  { id: "UA-KYV-0007", asset: "Dnipro Water Main D-220", district: "Podil", state: "degraded", priority: 61, confidence: 71, eta: "1d" },
  { id: "UA-KYV-0451", asset: "Traffic Grid Pechersk", district: "Pechersk", state: "degraded", priority: 53, confidence: 66, eta: "1d" },
  { id: "UA-KYV-0033", asset: "Darnytsia Rail Bridge — joint", district: "Dniprovskyi", state: "unknown", priority: 41, confidence: 38, eta: "—" },
  { id: "UA-KYV-0118", asset: "Feeder Line Obolon O-4", district: "Obolon", state: "operational", priority: 22, confidence: 90, eta: "Scheduled" },
];

export const LIVE_ALERTS: AlertEvent[] = [
  { id: "a1", time: "14:22:07", asset: "Paton Bridge", message: "Strain sensor → critical threshold", state: "offline", live: true },
  { id: "a2", time: "14:19:51", asset: "Bortnychi Aeration Station", message: "Lost telemetry uplink", state: "offline", live: true },
  { id: "a3", time: "14:11:30", asset: "Substation Pivnichna", message: "Load shed to 60% capacity", state: "degraded" },
  { id: "a4", time: "13:58:02", asset: "Dnipro Water Main D-220", message: "Pressure drop detected", state: "degraded" },
  { id: "a5", time: "13:40:44", asset: "Feeder Line Obolon O-4", message: "Restored to nominal", state: "operational" },
  { id: "a6", time: "13:22:18", asset: "Darnytsia Rail Bridge", message: "Sensor data stale > 30m", state: "unknown" },
];
