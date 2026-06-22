/**
 * DamageDetectionsPanel — list of fused damage-detection events.
 *
 * Wraps the shared <Panel /> component and renders events newest-first with:
 *   - Title + severity heat bar
 *   - Source chip (FIRMS / Telegram / Fused / Sample)
 *   - Relative detection time (via date-fns)
 *   - Matched keywords
 *   - Affected assets (name + estDamage %)
 *   - Evidence entries with optional links
 *
 * Empty state rendered when no events are present.
 * All data flows from props — no network calls here.
 */
import { formatDistanceToNow } from "date-fns";
import { Panel } from "@/components/ui/Panel";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/cn";
import { MoreHorizontal, ExternalLink } from "lucide-react";
import type { DamageEvent, DamageSource } from "@/lib/data/damage";

/* ─── helpers ─────────────────────────────────────────────────────────────── */

/** Map severity 0–1 to a Tailwind bg class on the heat ramp. */
function severityBarColor(severity: number): string {
  if (severity >= 0.8) return "bg-[#D23B40]";
  if (severity >= 0.6) return "bg-[#E2742F]";
  if (severity >= 0.4) return "bg-[#E0A33E]";
  if (severity >= 0.2) return "bg-[#7FB0C9]";
  return "bg-[#CBD9E8]";
}

/** Source display label + color token. */
function sourceChipProps(source: DamageSource): { label: string; className: string } {
  switch (source) {
    case "firms":
      return {
        label: "FIRMS",
        className: "bg-[rgba(233,115,22,0.12)] text-[#B9791C] ring-[rgba(185,121,28,0.30)]",
      };
    case "telegram":
      return {
        label: "Telegram",
        className: "bg-[rgba(46,125,246,0.10)] text-[#2E7DF6] ring-[rgba(46,125,246,0.28)]",
      };
    case "fused":
      return {
        label: "Fused",
        className: "bg-[rgba(210,59,64,0.10)] text-[#D23B40] ring-[rgba(210,59,64,0.28)]",
      };
    default:
      return {
        label: "Sample",
        className: "bg-surface-2 text-text-muted ring-border-default",
      };
  }
}

/** Format a relative timestamp, e.g. "3 minutes ago". */
function relTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

/* ─── sub-components ───────────────────────────────────────────────────────── */

function SeverityBar({ severity }: { severity: number }) {
  const pct = Math.round(severity * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn("h-full rounded-full transition-all", severityBarColor(severity))}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular min-w-[2.4rem] text-right font-mono text-[11px] text-text-muted">
        {pct}%
      </span>
    </div>
  );
}

function SourceChip({ source }: { source: DamageSource }) {
  const { label, className } = sourceChipProps(source);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] ring-1",
        className,
      )}
    >
      {label}
    </span>
  );
}

/* ─── main card entry ──────────────────────────────────────────────────────── */

function DamageEventCard({ event, onClick }: { event: DamageEvent; onClick?: () => void }) {
  return (
    <article
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      title={onClick ? "Fly to this zone" : undefined}
      className={cn(
        "border-b border-border-subtle px-4 py-3 last:border-b-0",
        onClick && "cursor-pointer transition-colors hover:bg-surface-2",
      )}
    >
      {/* Header row */}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <h4 className="truncate text-sm font-semibold text-text-primary leading-snug" title={event.title}>
          {event.title}
        </h4>
        <SourceChip source={event.source} />
      </div>

      {/* Severity bar */}
      <div className="mb-2">
        <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
          Severity
        </p>
        <SeverityBar severity={event.severity} />
      </div>

      {/* Time + confidence */}
      <div className="mb-2 flex items-center gap-3 text-[11px] text-text-muted">
        <time dateTime={event.detected_at}>{relTime(event.detected_at)}</time>
        <span>·</span>
        <span>Confidence {Math.round(event.confidence * 100)}%</span>
      </div>

      {/* Keywords */}
      {event.keywords.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {event.keywords.map((kw) => (
            <span
              key={kw}
              className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-text-secondary ring-1 ring-border-subtle"
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* Affected assets */}
      {event.affected.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
            Affected assets
          </p>
          <ul className="space-y-0.5">
            {event.affected.map((a) => (
              <li key={a.assetId} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="truncate text-text-secondary" title={a.name}>
                  {a.name}
                </span>
                <span
                  className={cn(
                    "shrink-0 tabular font-mono font-semibold",
                    a.estDamage >= 0.7
                      ? "text-status-offline"
                      : a.estDamage >= 0.4
                        ? "text-status-degraded"
                        : "text-text-muted",
                  )}
                >
                  {Math.round(a.estDamage * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Evidence */}
      {event.evidence.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
            Evidence
          </p>
          <ul className="space-y-1">
            {event.evidence.map((ev, i) => (
              <li key={i} className="rounded-md border border-border-subtle bg-surface-2 px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted">
                    {ev.source}
                    {ev.ts && (
                      <span className="ml-1.5 font-normal normal-case tracking-normal">
                        {new Date(ev.ts).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </span>
                  {ev.url && (
                    <a
                      href={ev.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open source"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 text-accent hover:text-accent-hover"
                    >
                      <ExternalLink size={11} aria-hidden="true" />
                    </a>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] text-text-secondary">{ev.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

/* ─── panel export ─────────────────────────────────────────────────────────── */

export interface DamageDetectionsPanelProps {
  events: DamageEvent[];
  loading?: boolean;
  /** Clicking an event flies the map to its zone. */
  onEventClick?: (event: DamageEvent) => void;
}

export function DamageDetectionsPanel({ events, loading = false, onEventClick }: DamageDetectionsPanelProps) {
  return (
    <Panel
      title="Damage Detections"
      eyebrow="Fused intelligence"
      actions={
        <IconButton size="md" aria-label="Damage detections options">
          <MoreHorizontal size={18} aria-hidden="true" />
        </IconButton>
      }
      flushBody
      className="min-h-[280px]"
      bodyClassName="max-h-[420px] overflow-y-auto"
    >
      {loading ? (
        <p className="px-4 py-6 text-sm text-text-muted">Loading…</p>
      ) : events.length === 0 ? (
        <p className="px-4 py-6 text-sm text-text-muted">No damage events detected.</p>
      ) : (
        <ul aria-label="Damage detections list">
          {events.map((ev) => (
            <li key={ev.id}>
              <DamageEventCard
                event={ev}
                onClick={onEventClick ? () => onEventClick(ev) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default DamageDetectionsPanel;
