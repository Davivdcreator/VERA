/**
 * MapLegend — DESIGN_SYSTEM.md §4.7 (legend overlay).
 *
 * Bottom-left overlay card on a map panel. Supports two shapes:
 *   - swatch rows (status / categorical) via `items`
 *   - a continuous heat ramp (Low → Critical) via `heatRamp`
 *
 * Always labelled (never color-only).
 */
import { cn } from "@/lib/cn";

export interface LegendItem {
  /** A swatch color, expressed as a Tailwind bg-* class from the theme. */
  swatchClass: string;
  label: string;
}

export interface MapLegendProps {
  title: string;
  items?: LegendItem[];
  /** Render the 5-stop heat ramp as a continuous bar with end labels. */
  heatRamp?: boolean;
  className?: string;
}

const HEAT_STOPS = [
  "bg-heat-1",
  "bg-heat-2",
  "bg-heat-3",
  "bg-heat-4",
  "bg-heat-5",
];

export function MapLegend({ title, items, heatRamp = false, className = "" }: MapLegendProps) {
  return (
    <div
      className={cn(
        "max-w-[200px] rounded-md border border-border-subtle bg-surface-overlay p-3 shadow-[var(--shadow-overlay)] backdrop-blur-md",
        className,
      )}
    >
      <div className="mb-2 text-[11px] font-bold uppercase leading-none tracking-[0.08em] text-text-muted">
        {title}
      </div>

      {items && (
        <ul className="flex flex-col gap-1.5">
          {items.map((it) => (
            <li key={it.label} className="flex items-center gap-2">
              <span
                className={cn("h-2.5 w-2.5 shrink-0 rounded-xs", it.swatchClass)}
                aria-hidden="true"
              />
              <span className="text-[13px] text-text-secondary">{it.label}</span>
            </li>
          ))}
        </ul>
      )}

      {heatRamp && (
        <div>
          <div className="flex h-2 overflow-hidden rounded-xs" aria-hidden="true">
            {HEAT_STOPS.map((c) => (
              <span key={c} className={cn("flex-1", c)} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-text-muted">
            <span>Low</span>
            <span>Critical</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default MapLegend;
