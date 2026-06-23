/**
 * Reports — outage/incident reporting page (hardcoded demo data).
 *
 * Audience tabs switch the report style:
 *   • Citizens   — a plain-language public-notice feed (what's down, where, why,
 *                  how long), in the spirit of a gov-services app like Diia.
 *   • Utilities  — a standardized incident register (table) for operators.
 *
 * A service filter narrows by water / power / heating.
 */
import { useMemo, useState } from "react";
import { Droplet, Zap, Flame, AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/cn";
import type { InfraStatus } from "@/lib/data/types";

type Service = "water" | "power" | "heat";
type Audience = "citizen" | "utility";
type Severity = "low" | "medium" | "high" | "critical";

interface Incident {
  id: string;
  reportId: string;
  service: Service;
  district: string;
  asset: string;
  citizenTitle: string;
  citizenReason: string;
  startedHoursAgo: number;
  etaHours: number | null;
  status: InfraStatus;
  severity: Severity;
  cause: string;
  affectedPopulation: number;
  crew: string;
  issuedAt: string;
}

const INCIDENTS: Incident[] = [
  {
    id: "1",
    reportId: "HEAT-2026-0231",
    service: "heat",
    district: "Darnytskyi",
    asset: "Kyiv CHP-5 Power Plant",
    citizenTitle: "No heating",
    citizenReason:
      "CHP-5 is offline after a strike, so district heating across the left bank is suspended while crews work to restore it.",
    startedHoursAgo: 18,
    etaHours: 72,
    status: "offline",
    severity: "critical",
    cause: "Generation plant damage (turbine hall + switchyard)",
    affectedPopulation: 120000,
    crew: "Kyivteploenergo brigade #2",
    issuedAt: "Today 06:10",
  },
  {
    id: "2",
    reportId: "WTR-2026-0612",
    service: "water",
    district: "Sviatoshynskyi",
    asset: "Bilychanska Water Pumping Station",
    citizenTitle: "No water",
    citizenReason:
      "The Bilychanska pumping station lost power after drone damage, so western districts are without running water until the feed is restored.",
    startedHoursAgo: 4,
    etaHours: 12,
    status: "degraded",
    severity: "high",
    cause: "Pumping station electrical feed down",
    affectedPopulation: 85000,
    crew: "Kyivvodokanal crew #3",
    issuedAt: "Today 08:40",
  },
  {
    id: "3",
    reportId: "PWR-2026-0488",
    service: "power",
    district: "Pecherskyi",
    asset: "Tsentr 110kV Substation",
    citizenTitle: "Power outage",
    citizenReason:
      "A central substation was damaged, so there are rolling blackouts in the centre. Supply is being rerouted from other lines.",
    startedHoursAgo: 2,
    etaHours: 8,
    status: "offline",
    severity: "high",
    cause: "110 kV substation feeder damage",
    affectedPopulation: 60000,
    crew: "DTEK emergency brigade",
    issuedAt: "Today 10:25",
  },
  {
    id: "4",
    reportId: "WTR-2026-0598",
    service: "water",
    district: "Podilskyi",
    asset: "Podil distribution main",
    citizenTitle: "Low water pressure",
    citizenReason:
      "Pressure is reduced while a damaged main is repaired. Supply continues at lower flow, mainly affecting upper floors.",
    startedHoursAgo: 6,
    etaHours: 6,
    status: "degraded",
    severity: "medium",
    cause: "Distribution main partial rupture",
    affectedPopulation: 25000,
    crew: "Kyivvodokanal crew #1",
    issuedAt: "Today 06:55",
  },
  {
    id: "5",
    reportId: "HEAT-2026-0244",
    service: "heat",
    district: "Holosiivskyi",
    asset: "Holosiiv boiler house",
    citizenTitle: "No heating",
    citizenReason: "A local boiler house is offline. Heating returns once a replacement circulation pump is installed.",
    startedHoursAgo: 9,
    etaHours: 24,
    status: "degraded",
    severity: "medium",
    cause: "Boiler-house circulation pump failure",
    affectedPopulation: 18000,
    crew: "Kyivteploenergo brigade #5",
    issuedAt: "Today 02:30",
  },
  {
    id: "6",
    reportId: "PWR-2026-0471",
    service: "power",
    district: "Obolonskyi",
    asset: "Obolon feeder line",
    citizenTitle: "Power restored",
    citizenReason: "Power is back — the damaged feeder line has been repaired and supply is normal.",
    startedHoursAgo: 10,
    etaHours: null,
    status: "operational",
    severity: "low",
    cause: "Feeder line repaired and re-energized",
    affectedPopulation: 40000,
    crew: "DTEK brigade #4",
    issuedAt: "Yesterday 22:15",
  },
];

const SERVICE_META: Record<Service, { label: string; Icon: typeof Droplet; color: string }> = {
  water: { label: "Water", Icon: Droplet, color: "var(--color-viz-2)" },
  power: { label: "Power", Icon: Zap, color: "var(--color-warning)" },
  heat: { label: "Heating", Icon: Flame, color: "var(--color-status-offline)" },
};

const SEVERITY_DOT: Record<Severity, string> = {
  low: "var(--color-text-muted)",
  medium: "var(--color-warning)",
  high: "var(--color-status-offline)",
  critical: "var(--color-status-offline)",
};

function fmtDuration(hours: number): string {
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${d}d ${h}h` : `${d}d`;
}

const fmtPop = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

// ─── Citizen: public-notice feed row ─────────────────────────────────────────
function NoticeRow({ incident }: { incident: Incident }) {
  const meta = SERVICE_META[incident.service];
  const resolved = incident.status === "operational";
  return (
    <li className="flex gap-3 px-4 py-3.5">
      <meta.Icon size={17} className="mt-0.5 shrink-0" style={{ color: meta.color }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[14px] font-semibold text-text-primary">{incident.citizenTitle}</h3>
          <span className="shrink-0 text-[11px] text-text-muted">{fmtDuration(incident.startedHoursAgo)} ago</span>
        </div>
        <p className="text-[12px] text-text-muted">
          {incident.district} district · {meta.label}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">{incident.citizenReason}</p>
        <p className="mt-1.5 text-[12px]">
          {resolved ? (
            <span className="font-medium text-status-operational">Service restored</span>
          ) : (
            <span className="text-text-secondary">
              Estimated restoration in <span className="font-semibold">~{fmtDuration(incident.etaHours ?? 0)}</span>
            </span>
          )}
        </p>
      </div>
    </li>
  );
}

// ─── Utility: incident register row ──────────────────────────────────────────
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

function RegisterRow({ incident }: { incident: Incident }) {
  const meta = SERVICE_META[incident.service];
  return (
    <tr className="border-b border-border-subtle align-top transition-colors duration-150 ease-standard hover:bg-surface-2">
      <td className="px-3 py-2.5">
        <span className="flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: SEVERITY_DOT[incident.severity] }}
            title={`${incident.severity} severity`}
            aria-hidden="true"
          />
          <span className="font-mono text-[12px] font-medium text-text-primary">{incident.reportId}</span>
        </span>
        <span className="mt-0.5 block pl-3.5 text-[11px] text-text-muted">{incident.issuedAt}</span>
      </td>
      <td className="max-w-[200px] px-3 py-2.5">
        <span className="block truncate text-[13px] font-medium text-text-primary">{incident.asset}</span>
        <span className="block text-[11px] text-text-muted">{incident.district}</span>
      </td>
      <td className="px-3 py-2.5 text-[13px] text-text-secondary">{meta.label}</td>
      <td className="max-w-[260px] px-3 py-2.5">
        <span className="block text-[13px] text-text-secondary">{incident.cause}</span>
        <span className="block text-[11px] text-text-muted">{incident.crew}</span>
      </td>
      <td className="tabular px-3 py-2.5 text-right font-mono text-[13px] text-text-primary">
        {fmtPop(incident.affectedPopulation)}
      </td>
      <td className="tabular px-3 py-2.5 text-right font-mono text-[13px] text-text-secondary">
        {incident.etaHours == null ? "—" : `~${fmtDuration(incident.etaHours)}`}
      </td>
      <td className="px-3 py-2.5">
        <StatusBadge status={incident.status} pulse={incident.status === "offline"} />
      </td>
    </tr>
  );
}

export function Reports() {
  const [audience, setAudience] = useState<Audience>("citizen");
  const [service, setService] = useState<Service | "all">("all");

  const filtered = useMemo(
    () => INCIDENTS.filter((i) => service === "all" || i.service === service),
    [service],
  );

  const summary = useMemo(() => {
    const active = INCIDENTS.filter((i) => i.status !== "operational");
    const people = active.reduce((s, i) => s + i.affectedPopulation, 0);
    return `${active.length} active incidents · ${fmtPop(people)} people affected`;
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-5 py-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Reports</h1>
          <p className="text-[13px] text-text-muted">Outage and incident reporting · Kyiv</p>
        </div>
        <p className="text-[12px] text-text-muted">{summary} · updated 12:41</p>
      </header>

      {/* Tabs + service filter */}
      <div className="mb-5 border-b border-border-subtle">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
          <nav className="-mb-px flex gap-6" aria-label="Report audience">
            {([
              { key: "citizen", label: "Citizens" },
              { key: "utility", label: "Utilities" },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setAudience(key)}
                aria-current={audience === key}
                className={cn(
                  "-mb-px border-b-2 px-0.5 pb-2.5 pt-1 text-[13px] font-semibold outline-none transition-colors",
                  audience === key
                    ? "border-accent text-text-primary"
                    : "border-transparent text-text-muted hover:text-text-secondary",
                )}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-3 pb-2">
            <span className="text-[11px] uppercase tracking-[0.08em] text-text-muted">Service</span>
            {([
              { key: "all", label: "All" },
              { key: "water", label: "Water" },
              { key: "power", label: "Power" },
              { key: "heat", label: "Heating" },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setService(key)}
                className={cn(
                  "text-[12px] font-medium outline-none transition-colors",
                  service === key ? "text-accent" : "text-text-muted hover:text-text-secondary",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-subtle px-4 py-10 text-center text-sm text-text-muted">
          <AlertTriangle size={18} className="mx-auto mb-2 text-text-muted" aria-hidden="true" />
          No reports for this service.
        </div>
      ) : audience === "citizen" ? (
        <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface-1">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-text-muted">Public service notices</h2>
            <span className="text-[11px] text-text-muted">{filtered.length} shown</span>
          </div>
          <ul className="divide-y divide-border-subtle">
            {filtered.map((i) => (
              <NoticeRow key={i.id} incident={i} />
            ))}
          </ul>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface-1">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-text-muted">Incident register</h2>
            <span className="text-[11px] text-text-muted">{filtered.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="h-9 bg-surface-2">
                  <Th>Ref</Th>
                  <Th>Asset</Th>
                  <Th>Service</Th>
                  <Th>Cause</Th>
                  <Th align="right">Affected</Th>
                  <Th align="right">ETA</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <RegisterRow key={i.id} incident={i} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default Reports;
