/**
 * Dashboard — VERA command center. DESIGN_SYSTEM.md §5.
 *
 * Layout (main content, column 2 of the shell):
 *   1. KPI stat row        — 4 cards derived from live asset data
 *   2. Map (centerpiece)   — ONE unified Google3DMap, full width
 *   3. Support row         — Repair Priorities table | Live Alerts feed
 *
 * All asset data flows from loadAssetCards() — nothing hardcoded here.
 * Supabase is used when configured; otherwise falls back to cards.json.
 */
import { useState, useEffect, useMemo } from "react";
import { Panel } from "@/components/ui/Panel";
import { KpiCard } from "@/components/ui/KpiCard";
import { IconButton } from "@/components/ui/IconButton";
import { MoreHorizontal } from "lucide-react";
import { MapPanel } from "@/components/dashboard/MapPanel";
import type { MapMode } from "@/components/dashboard/MapPanel";
import { RepairPrioritiesTable } from "@/components/dashboard/RepairPrioritiesTable";
import { LiveAlertsFeed } from "@/components/dashboard/LiveAlertsFeed";
import { AssetCardPanel } from "@/components/dashboard/AssetCardPanel";
import { loadAssetCards, cardsToMarkers } from "@/lib/data/loadCards";
import type { AssetCard } from "@/lib/data/types";
import { REGION } from "@/config/region";
import type { MapLegendProps } from "@/components/ui/MapLegend";
import type { RepairPriority, AlertEvent } from "@/data/dashboardData";

/* ─── legend (stable ref) ───────────────────────────────────────────────── */

const STATE_LEGEND: MapLegendProps = {
  title: "Asset State",
  items: [
    { swatchClass: "bg-status-operational", label: "Operational" },
    { swatchClass: "bg-status-degraded",    label: "Degraded" },
    { swatchClass: "bg-status-offline",     label: "Offline / Critical" },
    { swatchClass: "bg-status-unknown",     label: "No data" },
  ],
};

/* ─── derive table rows + alert events from cards ────────────────────────── */

/** Map an AssetCard to a RepairPriority table row. */
function cardToRepairRow(card: AssetCard): RepairPriority {
  const priority = Math.round(card.criticality * 100);
  const confidence = Math.round(card.state_confidence * 100);
  return {
    id:       card.id,
    asset:    card.name,
    district: card.zones[0] ?? "Kyiv",
    state:    card.status,
    priority,
    confidence,
    eta:      card.status === "operational" ? "Scheduled" : card.status === "unknown" ? "—" : `${Math.round((1 - card.criticality) * 20 + 2)}h`,
  };
}

/** Flatten evidence from non-operational cards into AlertEvent rows. */
function cardsToAlerts(cards: AssetCard[]): AlertEvent[] {
  const nonOp = cards.filter((c) => c.status !== "operational");
  const events: AlertEvent[] = [];

  for (const card of nonOp) {
    for (const ev of card.evidence) {
      events.push({
        id:      `${card.id}-${ev.source}`,
        time:    ev.ts
          ? new Date(ev.ts).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          : "--:--:--",
        asset:   card.name,
        message: ev.detail,
        state:   card.status,
        live:    card.status === "offline",
      });
    }
  }

  // Sort: offline first, then degraded, then unknown; within each by asset name.
  const ORDER = { offline: 0, degraded: 1, unknown: 2, operational: 3 };
  return events
    .sort((a, b) => ORDER[a.state] - ORDER[b.state])
    .slice(0, 20);
}

/* ─── component ─────────────────────────────────────────────────────────── */

export function Dashboard() {
  const [mapMode, setMapMode]           = useState<MapMode>("3d");
  const [showBuildings, setShowBuildings] = useState(true);
  const [cards, setCards]               = useState<AssetCard[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedId, setSelectedId]     = useState<string | null>(null);

  // Load cards once on mount.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadAssetCards()
      .then((data) => {
        if (!cancelled) {
          setCards(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("[VERA] loadAssetCards failed:", err);
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Stable marker array derived from cards.
  const markers = useMemo(() => cardsToMarkers(cards), [cards]);

  // O(1) lookup map for the card panel dependency work-tree.
  const cardMap = useMemo<Map<string, AssetCard>>(
    () => new Map(cards.map((c) => [c.id, c])),
    [cards],
  );

  // KPI derivations.
  const kpi = useMemo(() => {
    const total       = cards.length;
    const offline     = cards.filter((c) => c.status === "offline").length;
    const degraded    = cards.filter((c) => c.status === "degraded").length;
    const operational = cards.filter((c) => c.status === "operational").length;
    const pctOp       = total > 0 ? Math.round((operational / total) * 100) : 0;
    const popAtRisk   = cards
      .filter((c) => c.status !== "operational")
      .reduce((acc, c) => acc + c.population_affected, 0);

    return { total, offline, degraded, pctOp, popAtRisk };
  }, [cards]);

  // Repair priority rows: sort by criticality desc, take top 8.
  const repairRows = useMemo<RepairPriority[]>(
    () =>
      [...cards]
        .sort((a, b) => b.criticality - a.criticality)
        .slice(0, 8)
        .map(cardToRepairRow),
    [cards],
  );

  // Alert events derived from non-operational cards' evidence.
  const alertEvents = useMemo<AlertEvent[]>(
    () => cardsToAlerts(cards),
    [cards],
  );

  // Selected card (resolved from id).
  const selectedCard = selectedId != null ? cardMap.get(selectedId) ?? null : null;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-4 lg:gap-6 lg:p-6">
      {/* 1 — KPI stat row */}
      <section
        aria-label="Key metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 lg:gap-6"
      >
        <KpiCard
          label="Assets Monitored"
          value={loading ? "—" : String(kpi.total)}
          delta={{ value: "live Kyiv data", tone: "neutral", direction: "flat" }}
        />
        <KpiCard
          label="Critical / Offline"
          value={loading ? "—" : String(kpi.offline)}
          statusRail={kpi.offline > 0 ? "offline" : "operational"}
          delta={{
            value: `+${kpi.degraded} degraded`,
            tone: kpi.offline > 0 ? "bad" : "neutral",
          }}
        />
        <KpiCard
          label="% Operational"
          value={loading ? "—" : `${kpi.pctOp}%`}
          delta={{
            value: `${kpi.total - kpi.offline - kpi.degraded} fully nominal`,
            tone: kpi.pctOp >= 80 ? "good" : kpi.pctOp >= 50 ? "neutral" : "bad",
            direction: kpi.pctOp >= 80 ? "up" : "down",
          }}
        />
        <KpiCard
          label="Population at Risk"
          value={loading ? "—" : kpi.popAtRisk > 1_000_000
            ? `${(kpi.popAtRisk / 1_000_000).toFixed(1)}M`
            : kpi.popAtRisk > 1_000
              ? `${Math.round(kpi.popAtRisk / 1_000)}K`
              : String(kpi.popAtRisk)}
          delta={{
            value: "non-operational assets",
            tone: kpi.popAtRisk > 500_000 ? "bad" : "neutral",
          }}
        />
      </section>

      {/* 2 — Map (centerpiece) */}
      <section
        aria-label="Infrastructure map"
        className="relative h-[440px] sm:h-[520px] lg:h-[600px]"
      >
        {loading && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <span className="rounded-md border border-border-subtle bg-surface-overlay px-4 py-2 text-sm font-medium text-text-muted backdrop-blur-md">
              Loading assets…
            </span>
          </div>
        )}
        <MapPanel
          title={mapMode === "3d" ? `${REGION.name} · 3D Structural` : `${REGION.name} · 2D Tactical`}
          mode={mapMode}
          onModeChange={setMapMode}
          legend={STATE_LEGEND}
          markers={markers}
          onMarkerClick={setSelectedId}
          showBuildings={showBuildings}
          onToggleBuildings={() => setShowBuildings((v) => !v)}
          active
        />

        {/* Asset card panel — overlays the right side of the map section */}
        {selectedCard && (
          <AssetCardPanel
            card={selectedCard}
            cardMap={cardMap}
            onClose={() => setSelectedId(null)}
          />
        )}
      </section>

      {/* 3 — Support row */}
      <section
        aria-label="Operations detail"
        className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr] lg:gap-6"
      >
        <Panel
          title="Repair Priorities"
          eyebrow="Triage queue"
          actions={
            <IconButton size="md" aria-label="Repair priorities options">
              <MoreHorizontal size={18} aria-hidden="true" />
            </IconButton>
          }
          flushBody
          className="min-h-[280px]"
        >
          {repairRows.length > 0
            ? <RepairPrioritiesTable rows={repairRows} />
            : (
              <p className="px-4 py-6 text-sm text-text-muted">
                {loading ? "Loading…" : "No data available."}
              </p>
            )}
        </Panel>

        <Panel
          title="Live Alerts"
          eyebrow="Evidence feed"
          actions={
            <IconButton size="md" aria-label="Live alerts options">
              <MoreHorizontal size={18} aria-hidden="true" />
            </IconButton>
          }
          className="min-h-[280px]"
          bodyClassName="max-h-[420px] overflow-y-auto"
        >
          {alertEvents.length > 0
            ? <LiveAlertsFeed events={alertEvents} />
            : (
              <p className="text-sm text-text-muted">
                {loading ? "Loading…" : "No active alerts."}
              </p>
            )}
        </Panel>
      </section>
    </div>
  );
}

export default Dashboard;
