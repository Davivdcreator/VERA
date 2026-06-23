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
import { useMemo, useState } from "react";
import { Box, Building2, Compass, Map as MapIcon, MapPin, Maximize2, MoreHorizontal, Minus, Plus, Search, TriangleAlert, X } from "lucide-react";
import { OsmBuildingsMap } from "@/lib/osmb/OsmBuildingsMap";
import type { MapGraphOverlay, MapMarker } from "@/lib/osmb/OsmBuildingsMap";
import type { DamageZone } from "@/lib/data/damage";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/IconButton";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { MapLegend } from "@/components/ui/MapLegend";
import type { MapLegendProps } from "@/components/ui/MapLegend";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

export type MapMode = "2d" | "3d";

export interface MapObjectSearchItem {
  id: string;
  name: string;
  subtitle?: string;
  type?: string;
  status?: string;
  source?: string;
}

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
  /** Selected asset relationship graph to render over the map. */
  graph?: MapGraphOverlay | null;
  /** Whether the damage zone layer is visible. */
  showDamage?: boolean;
  /** Toggle the damage zone overlay. */
  onToggleDamage?: () => void;
  /** Imperative fly-to target for the map camera. */
  focus?: { lat: number; lng: number; zoom?: number } | null;
  /** Searchable map objects. */
  searchItems?: MapObjectSearchItem[];
  /** Fired when a search result is selected. */
  onSearchSelect?: (id: string) => void;
  /** Damage zone id to emphasize on the map. */
  highlightZoneId?: string | null;
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
  graph,
  showDamage = true,
  onToggleDamage,
  focus,
  searchItems = [],
  onSearchSelect,
  highlightZoneId,
  feed = "live",
  active = false,
  onActivate,
  className = "",
}: MapPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];

    return searchItems
      .map((item) => {
        const name = item.name.toLowerCase();
        const id = item.id.toLowerCase();
        const subtitle = item.subtitle?.toLowerCase() ?? "";
        const type = item.type?.toLowerCase() ?? "";
        const status = item.status?.toLowerCase() ?? "";
        const source = item.source?.toLowerCase() ?? "";
        const haystack = `${name} ${id} ${subtitle} ${type} ${status} ${source}`;

        if (!haystack.includes(normalizedQuery)) return null;

        const score =
          id === normalizedQuery || name === normalizedQuery ? 0
            : id.startsWith(normalizedQuery) || name.startsWith(normalizedQuery) ? 1
              : name.includes(normalizedQuery) ? 2
                : haystack.includes(normalizedQuery) ? 3
                  : 4;

        return { item, score };
      })
      .filter((result): result is { item: MapObjectSearchItem; score: number } => result != null)
      .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name))
      .slice(0, 8)
      .map(({ item }) => item);
  }, [normalizedQuery, searchItems]);

  const selectSearchResult = (id: string) => {
    onSearchSelect?.(id);
    setSearchQuery("");
  };

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
          graph={graph}
          focus={focus}
          highlightZoneId={highlightZoneId}
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

      {/* Object search (top-left overlay). */}
      {onSearchSelect && (
        <div className="absolute left-3 right-3 top-14 z-10 max-w-[28rem] sm:right-auto sm:w-[28rem]">
          <div className="relative">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchResults[0]) {
                  event.preventDefault();
                  selectSearchResult(searchResults[0].id);
                }
                if (event.key === "Escape") {
                  setSearchQuery("");
                }
              }}
              placeholder="Search map objects"
              aria-label="Search map objects"
              className="h-10 w-full rounded-md border border-border-default bg-surface-overlay py-2 pl-9 pr-9 text-sm font-medium text-text-primary shadow-[var(--shadow-overlay)] outline-none backdrop-blur-md transition-colors placeholder:text-text-muted focus:border-border-accent focus:shadow-[var(--shadow-focus)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear object search"
                className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary focus-visible:shadow-[var(--shadow-focus)]"
              >
                <X size={15} aria-hidden="true" />
              </button>
            )}
          </div>

          {normalizedQuery && (
            <div className="mt-1.5 max-h-[20rem] overflow-y-auto rounded-md border border-border-default bg-surface-overlay shadow-[var(--shadow-overlay)] backdrop-blur-md">
              {searchResults.length > 0 ? (
                <ul className="divide-y divide-border-subtle">
                  {searchResults.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => selectSearchResult(item.id)}
                        className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left outline-none transition-colors hover:bg-surface-2 focus-visible:shadow-[var(--shadow-focus)]"
                      >
                        <MapPin size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-text-primary">
                            {item.name}
                          </span>
                          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-muted">
                            <span className="font-mono">{item.id}</span>
                            {item.subtitle && <span className="truncate">{item.subtitle}</span>}
                            {item.type && <span className="capitalize">{item.type.replace(/_/g, " ")}</span>}
                            {item.status && <span className="capitalize">{item.status}</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-2.5 text-sm font-medium text-text-muted">No objects found.</p>
              )}
            </div>
          )}
        </div>
      )}

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
