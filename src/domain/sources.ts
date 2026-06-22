import type { SourceKind } from "./types";

/**
 * Source reliability registry.
 *
 * Not all evidence is equal. A SCADA sensor and an anonymous social-media post
 * both report "the bridge is out" — VERA must not treat them the same. Each
 * source gets a baseline reliability that down-weights its influence during
 * fusion. These are policy parameters an agency would calibrate and *publish*,
 * which is exactly what makes the resulting decisions auditable.
 */
export interface SourceProfile {
  kind: SourceKind;
  label: string;
  /** Baseline trust 0..1 applied as a multiplier on the source's confidence. */
  reliability: number;
  /** Short description for the UI legend. */
  description: string;
  /** Tailwind text color token for badges. */
  color: string;
}

export const SOURCE_PROFILES: Record<SourceKind, SourceProfile> = {
  sensor: {
    kind: "sensor",
    label: "IoT / SCADA sensor",
    reliability: 0.95,
    description: "Automated telemetry. Precise but narrow and can fail silently.",
    color: "text-cyan-300",
  },
  field_crew: {
    kind: "field_crew",
    label: "Field crew",
    reliability: 0.92,
    description: "Trained inspector on site. High trust, slow to arrive.",
    color: "text-emerald-300",
  },
  partner_agency: {
    kind: "partner_agency",
    label: "Partner agency",
    reliability: 0.8,
    description: "Utility / NGO / mutual-aid feed. Reliable, varying latency.",
    color: "text-violet-300",
  },
  satellite: {
    kind: "satellite",
    label: "Satellite / remote sensing",
    reliability: 0.7,
    description: "Broad coverage, coarse resolution, cloud-occluded at times.",
    color: "text-amber-300",
  },
  citizen: {
    kind: "citizen",
    label: "Citizen report",
    reliability: 0.45,
    description: "High volume, low individual reliability. Powerful in aggregate.",
    color: "text-rose-300",
  },
};

export function sourceReliability(kind: SourceKind): number {
  return SOURCE_PROFILES[kind]?.reliability ?? 0.5;
}
