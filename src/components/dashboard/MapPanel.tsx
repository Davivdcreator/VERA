/**
 * MapPanel — map-chrome container per DESIGN_SYSTEM.md §4.7.
 *
 * Wraps the existing <OsmBuildingsMap /> (unchanged) with VERA chrome:
 *   - top title bar (scrim): title + LiveIndicator + 2D/3D SegmentedControl + menu
 *   - bottom-left legend overlay
 *   - bottom-right zoom / tilt control stack
 *   - selected-panel emphasis (accent border) when `active`
 *
 * IMPORTANT layout contract: the map canvas needs an explicit height. This
 * component is `h-full` and `relative`; the *parent* (Dashboard map row) owns
 * the real height. The OsmBuildingsMap also keeps a defensive minHeight.
 *
 * Note on controls: OSMB owns its own gesture/zoom handling internally and the
 * map instance is encapsulated inside OsmBuildingsMap. The zoom/tilt buttons
 * here are spec'd chrome; they are rendered (and keyboard-focusable) but are
 * presentational for now — wiring them would require lifting the OSMB instance
 * out of the existing component, which is out of scope for this task.
 */
import { Box, Building2, Compass, Map as MapIcon, Maximize2, MoreHorizontal, Minus, Plus, TriangleAlert } from "lucide-react";
import { OsmBuildingsMap } from "@/lib/osmb/OsmBuildingsMap";
import type { MapMarker } from "@/lib/osmb/OsmBuildingsMap";
import type { DamageZone } from "@/lib/data/damage";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/IconButton";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { MapLegend } from "@/components/ui/MapLegend";
import type { MapLegendProps } from "@/components/ui/MapLegend";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

export type MapMode = "2d" | "3d";

export interface MapPanelProps {
  title: string;
  mode: MapMode;
  onModeChange: (mode: MapMode) => void;
  legend: MapLegendProps;
  /** State-colored asset pins overlaid on the map. */
  markers?: MapMarker[];
  /** Fired when an asset pin is clicked (opens its card). */
  onMarkerClick?: (id: string) => void;
  /** Whether the OSM 3D buildings layer is shown (satellite stays regardless). */
  showBuildings?: boolean;
  /** Toggle the OSM 3D buildings layer. */
  onToggleBuildings?: () => void;
  /** Damage zones to render as translucent red circles on the map. */
  zones?: DamageZone[];
  /** Whether the damage zone layer is visible. */
  showDamage?: boolean;
  /** Toggle the damage zone overlay. */
  onToggleDamage?: () => void;
  /** Feed state for the live indicator. */
  feed?: "live" | "stale";
  /** Highlight this panel as the active/selected one (accent border). */
  active?: boolean;
  /** Bring focus to this panel (sets it active). */
  onActivate?: () => void;
  className?: string;
}

export function MapPanel({
  title,
  mode,
  onModeChange,
  legend,
  markers,
  onMarkerClick,
  showBuildings = true,
  onToggleBuildings,
  zones,
  showDamage = true,
  onToggleDamage,
  feed = "live",
  active = false,
  onActivate,
  className = "",
}: MapPanelProps) {
  return (
    <section
      onPointerDown={onActivate}
      className={cn(
        "relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl bg-surface-1 shadow-[var(--shadow-md)]",
        active ? "border border-border-accent" : "border border-border-subtle",
        className,
      )}
    >
      {/* Map canvas — fills the container, chrome floats on top. */}
      <div className="absolute inset-0">
        <OsmBuildingsMap
          mode={mode}
          markers={markers}
          onMarkerClick={onMarkerClick}
          showBuildings={showBuildings}
          zones={showDamage ? zones : undefined}
        />
      </div>

      {/* Title bar (top overlay scrim). */}
      <header className="absolute inset-x-0 top-0 z-10 flex h-11 items-center justify-between gap-3 border-b border-border-subtle bg-surface-overlay px-3.5 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <h3 className="truncate text-base font-semibold text-text-primary">{title}</h3>
          <LiveIndicator state={feed} />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <SegmentedControl<MapMode>
            aria-label={`${title} render mode`}
            value={mode}
            onChange={onModeChange}
            options={[
              { value: "2d", label: "2D", icon: <MapIcon size={14} aria-hidden="true" /> },
              { value: "3d", label: "3D", icon: <Box size={14} aria-hidden="true" /> },
            ]}
          />
          {onToggleBuildings && (
            <button
              type="button"
              onClick={onToggleBuildings}
              aria-pressed={showBuildings}
              aria-label="Toggle 3D buildings"
              title={showBuildings ? "Hide 3D buildings" : "Show 3D buildings"}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold ring-1 transition-colors",
                showBuildings
                  ? "bg-accent-soft text-accent ring-border-accent"
                  : "bg-surface-2 text-text-muted ring-border-default hover:text-text-secondary",
              )}
            >
              <Building2 size={14} aria-hidden="true" />
              Buildings
            </button>
          )}
          {onToggleDamage && (
            <button
              type="button"
              onClick={onToggleDamage}
              aria-pressed={showDamage}
              aria-label="Toggle damage zones"
              title={showDamage ? "Hide damage zones" : "Show damage zones"}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold ring-1 transition-colors",
                showDamage
                  ? "bg-[rgba(210,59,64,0.10)] text-status-offline ring-[rgba(210,59,64,0.40)]"
                  : "bg-surface-2 text-text-muted ring-border-default hover:text-text-secondary",
              )}
            >
              <TriangleAlert size={14} aria-hidden="true" />
              Damage
            </button>
          )}
          <IconButton size="sm" aria-label={`${title} options`}>
            <MoreHorizontal size={16} aria-hidden="true" />
          </IconButton>
        </div>
      </header>

      {/* Legend (bottom-left overlay). */}
      <div className="absolute bottom-3 left-3 z-10">
        <MapLegend {...legend} />
      </div>

      {/* Zoom / tilt controls (bottom-right overlay). */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col overflow-hidden rounded-md border border-border-default bg-surface-overlay shadow-[var(--shadow-overlay)] backdrop-blur-md">
        <IconButton size="sm" aria-label="Zoom in" className="rounded-none">
          <Plus size={16} aria-hidden="true" />
        </IconButton>
        <IconButton
          size="sm"
          aria-label="Zoom out"
          className="rounded-none border-t border-border-subtle"
        >
          <Minus size={16} aria-hidden="true" />
        </IconButton>
        {mode === "3d" && (
          <IconButton
            size="sm"
            aria-label="Reset tilt and bearing"
            className="rounded-none border-t border-border-subtle"
          >
            <Compass size={16} aria-hidden="true" />
          </IconButton>
        )}
        <IconButton
          size="sm"
          aria-label="Fullscreen"
          className="rounded-none border-t border-border-subtle"
        >
          <Maximize2 size={16} aria-hidden="true" />
        </IconButton>
      </div>
    </section>
  );
}

export default MapPanel;
