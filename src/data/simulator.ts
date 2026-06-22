import type { Signal, SignalKind, SourceKind } from "@/domain/types";
import { ASSETS } from "./seed";

/**
 * Real-time signal simulator.
 *
 * Stands in for the live, messy intake of a real operations center: sensors,
 * crews, satellites and the public all reporting at different rates and trust
 * levels. It emits one fresh Signal per tick so the fusion + scoring pipeline
 * visibly recomputes. Swap this for a Supabase Realtime subscription and the
 * rest of the app is unchanged (see lib/supabase.ts).
 */

const SOURCES: { source: SourceKind; weight: number }[] = [
  { source: "citizen", weight: 0.5 }, // public reports dominate volume
  { source: "sensor", weight: 0.2 },
  { source: "field_crew", weight: 0.12 },
  { source: "satellite", weight: 0.1 },
  { source: "partner_agency", weight: 0.08 },
];

const KINDS: SignalKind[] = [
  "damage_report",
  "service_outage",
  "access_blocked",
  "casualty_risk",
  "restored",
];

const NOTES: Partial<Record<SignalKind, string[]>> = {
  damage_report: ["Visible structural cracks", "Water ingress reported", "Debris field expanding"],
  service_outage: ["No service in sector", "Pressure dropping", "Intermittent outage"],
  access_blocked: ["Road impassable", "Flooding at junction", "Downed lines across lane"],
  casualty_risk: ["Medically-dependent residents trapped", "Shelter supplies low"],
  restored: ["Service appears restored", "Crew reports partial recovery"],
};

function pickWeighted(): SourceKind {
  const r = Math.random();
  let acc = 0;
  for (const s of SOURCES) {
    acc += s.weight;
    if (r <= acc) return s.source;
  }
  return "citizen";
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

let counter = 0;

/** Generate one plausible new signal "now". */
export function generateSignal(now: number = Date.now()): Signal {
  const asset = pick(ASSETS);
  const source = pickWeighted();
  const kind = pick(KINDS);

  // Citizens over-report severity and under-report confidence; sensors precise.
  const severityBias = source === "citizen" ? 0.15 : 0;
  const baseSeverity =
    kind === "restored" ? 0.2 + Math.random() * 0.3 : 0.35 + Math.random() * 0.6;

  const confidence =
    source === "sensor" || source === "field_crew"
      ? 0.8 + Math.random() * 0.2
      : source === "citizen"
        ? 0.3 + Math.random() * 0.4
        : 0.55 + Math.random() * 0.35;

  return {
    id: `sim-${now}-${counter++}`,
    assetId: asset.id,
    source,
    kind,
    severity: Math.min(1, baseSeverity + severityBias),
    confidence,
    timestamp: now,
    note: NOTES[kind] ? pick(NOTES[kind]!) : undefined,
  };
}

/**
 * Start a ticking stream. Returns a stop() function.
 * @param onSignal callback fired with each new signal
 * @param intervalMs base cadence (jittered ±40%)
 */
export function startSimulator(
  onSignal: (s: Signal) => void,
  intervalMs = 2200,
): () => void {
  let timer: ReturnType<typeof setTimeout>;
  let stopped = false;

  const loop = () => {
    if (stopped) return;
    onSignal(generateSignal());
    const jitter = intervalMs * (0.6 + Math.random() * 0.8);
    timer = setTimeout(loop, jitter);
  };

  timer = setTimeout(loop, intervalMs);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
