/**
 * DangerZones — dedicated subpage for fused damage-zone alerts.
 *
 * Its own map (zones + asset pins) plus the full alerts list. Clicking an alert
 * flies the map to the zone and highlights it. Data flows from loadDamageEvents
 * / loadAssetCards — nothing hardcoded.
 */
import { useEffect, useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { MapPanel } from "@/components/dashboard/MapPanel";
import type { MapMode } from "@/components/dashboard/MapPanel";
import { DamageDetectionsPanel } from "@/components/dashboard/DamageDetectionsPanel";
import { KpiCard } from "@/components/ui/KpiCard";
import { loadAssetCards, loadDamageEvents, cardsToMarkers } from "@/lib/data/loadCards";
import type { AssetCard } from "@/lib/data/types";
import type { DamageEvent, DamageZone } from "@/lib/data/damage";
import type { MapMarker } from "@/lib/osmb/OsmBuildingsMap";
import type { MapLegendProps } from "@/components/ui/MapLegend";
import { REGION } from "@/config/region";

const DAMAGE_LEGEND: MapLegendProps = {
  title: "Damage",
  items: [
    { swatchClass: "bg-status-offline", label: "Damage zone" },
    { swatchClass: "bg-status-degraded", label: "At-risk asset" },
  ],
};

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function DangerZones() {
  const [events, setEvents] = useState<DamageEvent[]>([]);
  const [cards, setCards] = useState<AssetCard[]>([]);
  const [loading, setLoading] = useState(true);

  const [mapMode, setMapMode] = useState<MapMode>("3d");
  const [showBuildings, setShowBuildings] = useState(false);
  const [showDamage, setShowDamage] = useState(true);
  const [mapFocus, setMapFocus] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadDamageEvents(), loadAssetCards()])
      .then(([ev, cd]) => {
        if (cancelled) return;
        setEvents(ev);
        setCards(cd);
        setLoading(false);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[DangerZones] load failed:", err);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const markers = useMemo<MapMarker[]>(() => cardsToMarkers(cards), [cards]);
  const zones = useMemo<DamageZone[]>(
    () =>
      events.map((e) => ({
        id: e.id,
        lat: e.lat,
        lng: e.lng,
        radius_m: e.radius_m,
        severity: e.severity,
        source: e.source,
      })),
    [events],
  );

  const kpi = useMemo(() => {
    const cardById = new Map(cards.map((c) => [c.id, c]));
    const affected = new Set(events.flatMap((e) => e.affected.map((a) => a.assetId)));
    const maxSev = events.reduce((m, e) => Math.max(m, e.severity), 0);
    let pop = 0;
    for (const id of affected) pop += cardById.get(id)?.population_affected ?? 0;
    return { count: events.length, maxSev, affected: affected.size, pop };
  }, [events, cards]);

  const onEventClick = (ev: DamageEvent) => {
    setShowDamage(true);
    setFocusedId(ev.id);
    setMapFocus({ lat: ev.lat, lng: ev.lng, zoom: 14 });
  };

  return (
    <div className="flex flex-col gap-4 p-4 lg:gap-6 lg:p-6">
      {/* Header */}
      <header className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[rgba(210,59,64,0.12)] text-status-offline">
          <TriangleAlert size={18} aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-lg font-bold text-text-primary">Danger Zones</h1>
          <p className="text-xs text-text-muted">
            Fused FIRMS + Telegram damage detections across {REGION.name}
          </p>
        </div>
      </header>

      {/* KPI row */}
      <section
        aria-label="Damage summary"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 lg:gap-6"
      >
        <KpiCard
          label="Active Zones"
          value={loading ? "—" : String(kpi.count)}
          statusRail={kpi.count > 0 ? "offline" : "operational"}
          delta={{ value: "fused detections", tone: kpi.count > 0 ? "bad" : "neutral" }}
        />
        <KpiCard
          label="Peak Severity"
          value={loading ? "—" : `${Math.round(kpi.maxSev * 100)}%`}
          delta={{ value: "worst zone", tone: kpi.maxSev >= 0.66 ? "bad" : "neutral" }}
        />
        <KpiCard
          label="Assets Hit"
          value={loading ? "—" : String(kpi.affected)}
          delta={{ value: "in a damage zone", tone: kpi.affected > 0 ? "bad" : "neutral" }}
        />
        <KpiCard
          label="Population at Risk"
          value={loading ? "—" : compact(kpi.pop)}
          delta={{ value: "in affected zones", tone: kpi.pop > 500_000 ? "bad" : "neutral" }}
        />
      </section>

      {/* Map + alerts */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr] lg:gap-6">
        <div className="h-[420px] sm:h-[520px] lg:h-[600px]">
          <MapPanel
            title={`${REGION.name} · Danger Zones`}
            mode={mapMode}
            onModeChange={setMapMode}
            legend={DAMAGE_LEGEND}
            markers={markers}
            zones={zones}
            showBuildings={showBuildings}
            onToggleBuildings={() => setShowBuildings((v) => !v)}
            showDamage={showDamage}
            onToggleDamage={() => setShowDamage((v) => !v)}
            focus={mapFocus}
            highlightZoneId={focusedId}
            active
          />
        </div>
        <div className="min-h-[420px]">
          <DamageDetectionsPanel events={events} loading={loading} onEventClick={onEventClick} />
        </div>
      </section>
    </div>
  );
}

export default DangerZones;
