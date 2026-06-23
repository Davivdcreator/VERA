/**
 * Dashboard — VERA command center. DESIGN_SYSTEM.md §5.
 *
 * Layout (main content, column 2 of the shell):
 *   1. Map (centerpiece)   — ONE unified Google3DMap, full width
 *   2. Support row         — Repair Priorities table | Live Alerts feed
 *
 * All asset data flows from loadAssetCards() — nothing hardcoded here.
 * Supabase is used when configured; otherwise falls back to cards.json.
 */
import { useState, useEffect, useMemo } from "react";
import { Panel } from "@/components/ui/Panel";
import { IconButton } from "@/components/ui/IconButton";
import { MoreHorizontal } from "lucide-react";
import { MapPanel } from "@/components/dashboard/MapPanel";
import type { MapMode } from "@/components/dashboard/MapPanel";
import { RepairPrioritiesTable } from "@/components/dashboard/RepairPrioritiesTable";
import { LiveAlertsFeed } from "@/components/dashboard/LiveAlertsFeed";
import { AssetCardPanel } from "@/components/dashboard/AssetCardPanel";
import type { RebuildCostReport } from "@/components/dashboard/AssetCardPanel";
import { DamageDetectionsPanel } from "@/components/dashboard/DamageDetectionsPanel";
import { STATE_COLOR, loadAssetCards, cardsToMarkers, loadDamageEvents } from "@/lib/data/loadCards";
import type { AssetCard } from "@/lib/data/types";
import type { DamageEvent, DamageZone } from "@/lib/data/damage";
import type { MapGraphOverlay } from "@/lib/osmb/OsmBuildingsMap";
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

const RELATIONSHIP_GRAPH_DEPTH = 2;

interface AdvisorySummary {
  bestNextAction: string;
  findingsCount: number;
  recommendationsCount: number;
  topFinding?: string;
  topRecommendation?: string;
}

interface AdvisoryApiResponse {
  findings?: Array<{ title?: string }>;
  recommendations?: Array<{ action?: string }>;
  decision_support?: {
    best_next_action?: string;
  };
}

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
    card.evidence.forEach((ev, i) => {
      events.push({
        id:      `${card.id}-${ev.source}-${i}`,
        time:    ev.ts
          ? new Date(ev.ts).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          : "--:--:--",
        asset:   card.name,
        message: ev.detail,
        state:   card.status,
        live:    card.status === "offline",
      });
    });
  }

  // Sort: offline first, then degraded, then unknown; within each by asset name.
  const ORDER = { offline: 0, degraded: 1, unknown: 2, operational: 3 };
  return events
    .sort((a, b) => ORDER[a.state] - ORDER[b.state])
    .slice(0, 20);
}

function buildRelationshipGraph(
  selectedId: string | null,
  cardMap: Map<string, AssetCard>,
  maxDepth = RELATIONSHIP_GRAPH_DEPTH,
): MapGraphOverlay | null {
  if (!selectedId || !cardMap.has(selectedId)) return null;

  const depths = new Map<string, number>([[selectedId, 0]]);
  const queue: Array<{ id: string; depth: number }> = [{ id: selectedId, depth: 0 }];
  const edges = new Map<string, MapGraphOverlay["edges"][number]>();

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const { id, depth } = queue[cursor];
    if (depth >= maxDepth) continue;

    const card = cardMap.get(id);
    if (!card) continue;

    const visit = (nextId: string, sourceId: string, targetId: string, kind: string, weight: number) => {
      if (!cardMap.has(nextId)) return;
      const edgeId = `${sourceId}->${targetId}:${kind}`;
      if (!edges.has(edgeId)) {
        edges.set(edgeId, { id: edgeId, sourceId, targetId, kind, weight });
      }
      const nextDepth = depth + 1;
      const existingDepth = depths.get(nextId);
      if (existingDepth == null || nextDepth < existingDepth) {
        depths.set(nextId, nextDepth);
        queue.push({ id: nextId, depth: nextDepth });
      }
    };

    for (const edge of card.downstream) {
      visit(edge.assetId, id, edge.assetId, edge.kind, edge.weight);
    }
    for (const edge of card.upstream) {
      visit(edge.assetId, edge.assetId, id, edge.kind, edge.weight);
    }
  }

  const nodes = Array.from(depths.entries()).flatMap(([id, depth]) => {
    const card = cardMap.get(id);
    if (!card) return [];
    return [{
      id,
      lat: card.lat,
      lng: card.lng,
      label: card.name,
      color: STATE_COLOR[card.status],
      depth,
      role: depth === 0 ? "selected" as const : "related" as const,
    }];
  });

  return {
    nodes,
    edges: Array.from(edges.values()),
    depth: maxDepth,
  };
}

function formatCardCostContext(card: AssetCard, cardMap: Map<string, AssetCard>): string {
  const upstream = card.upstream.map((edge) => {
    const dependency = cardMap.get(edge.assetId);
    return `${dependency?.name ?? edge.assetId} (${edge.kind}, weight ${Math.round(edge.weight * 100)}%)`;
  });
  const downstream = card.downstream.map((edge) => {
    const dependent = cardMap.get(edge.assetId);
    return `${dependent?.name ?? edge.assetId} (${edge.kind}, weight ${Math.round(edge.weight * 100)}%)`;
  });

  return [
    `Estimate the rebuild cost for this infrastructure asset.`,
    `Asset: ${card.name}`,
    card.name_native ? `Native name: ${card.name_native}` : null,
    `Type: ${card.type}`,
    `Status: ${card.status}`,
    `Location: ${card.lat}, ${card.lng}`,
    card.zones.length > 0 ? `Zones: ${card.zones.join(", ")}` : null,
    `Criticality: ${Math.round(card.criticality * 100)} / 100`,
    `State confidence: ${Math.round(card.state_confidence * 100)}%`,
    `Population at risk: ${card.population_affected.toLocaleString("en-US")}`,
    card.radius_m != null ? `Impact radius: ${card.radius_m} m` : null,
    `Metrics: ${JSON.stringify(card.metrics)}`,
    upstream.length > 0 ? `Blocking/upstream dependencies to evaluate first: ${upstream.join("; ")}` : null,
    downstream.length > 0 ? `Downstream assets affected by this rebuild: ${downstream.join("; ")}` : null,
    card.evidence.length > 0
      ? `Damage evidence: ${card.evidence.map((ev) => `${ev.source}: ${ev.detail}`).join(" | ")}`
      : null,
  ].filter(Boolean).join("\n");
}

function formatCardAdvisoryContext(card: AssetCard, cardMap: Map<string, AssetCard>): string {
  const graph = buildRelationshipGraph(card.id, cardMap);
  const nodeLines = graph?.nodes.map((node) => {
    const asset = cardMap.get(node.id);
    return [
      `${node.id}: ${asset?.name ?? node.label}`,
      asset ? `type=${asset.type}` : null,
      asset ? `status=${asset.status}` : null,
      asset ? `criticality=${Math.round(asset.criticality * 100)}` : null,
      asset ? `population_at_risk=${asset.population_affected}` : null,
      asset?.zones.length ? `zones=${asset.zones.join(", ")}` : null,
    ].filter(Boolean).join(" | ");
  }) ?? [];
  const edgeLines = graph?.edges.map((edge) => {
    const source = cardMap.get(edge.sourceId);
    const target = cardMap.get(edge.targetId);
    return `${source?.name ?? edge.sourceId} -> ${target?.name ?? edge.targetId} | kind=${edge.kind} | weight=${Math.round(edge.weight * 100)}%`;
  }) ?? [];

  return [
    `Analyze this dependency graph and advise on the best operational next action.`,
    `Selected asset: ${card.name} (${card.id})`,
    card.name_native ? `Native name: ${card.name_native}` : null,
    `Selected asset type: ${card.type}`,
    `Selected asset status: ${card.status}`,
    `Selected asset location: ${card.lat}, ${card.lng}`,
    `Selected asset criticality: ${Math.round(card.criticality * 100)} / 100`,
    `State confidence: ${Math.round(card.state_confidence * 100)}%`,
    `Population at risk: ${card.population_affected.toLocaleString("en-US")}`,
    card.evidence.length > 0
      ? `Selected asset evidence: ${card.evidence.map((ev) => `${ev.source}: ${ev.detail}`).join(" | ")}`
      : null,
    ``,
    `Graph nodes:`,
    nodeLines.length > 0 ? nodeLines.join("\n") : `No related graph nodes available beyond selected asset.`,
    ``,
    `Graph edges:`,
    edgeLines.length > 0 ? edgeLines.join("\n") : `No dependency edges available for selected asset.`,
  ].filter((line) => line !== null).join("\n");
}

/* ─── component ─────────────────────────────────────────────────────────── */

export function Dashboard() {
  const [mapMode, setMapMode]           = useState<MapMode>("3d");
  const [showBuildings, setShowBuildings] = useState(true);
  const [showDamage, setShowDamage]     = useState(true);
  const [cards, setCards]               = useState<AssetCard[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [damageEvents, setDamageEvents] = useState<DamageEvent[]>([]);
  const [damageLoading, setDamageLoading] = useState(true);
  const [mapFocus, setMapFocus]         = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [focusedDamageId, setFocusedDamageId] = useState<string | null>(null);
  const [costReports, setCostReports] = useState<Record<string, RebuildCostReport>>({});
  const [costErrors, setCostErrors] = useState<Record<string, string>>({});
  const [costLoadingId, setCostLoadingId] = useState<string | null>(null);
  const [costDialogId, setCostDialogId] = useState<string | null>(null);
  const [advisories, setAdvisories] = useState<Record<string, AdvisorySummary>>({});
  const [advisoryErrors, setAdvisoryErrors] = useState<Record<string, string>>({});
  const [advisoryLoadingId, setAdvisoryLoadingId] = useState<string | null>(null);

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

  // Load damage events once on mount.
  useEffect(() => {
    let cancelled = false;
    setDamageLoading(true);
    loadDamageEvents()
      .then((data) => {
        if (!cancelled) {
          setDamageEvents(data);
          setDamageLoading(false);
        }
      })
      .catch((err) => {
        console.error("[VERA] loadDamageEvents failed:", err);
        if (!cancelled) setDamageLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Stable marker array derived from cards.
  const markers = useMemo(() => cardsToMarkers(cards), [cards]);

  // Derive damage zones from events (projection-only fields).
  const damageZones = useMemo<DamageZone[]>(
    () =>
      damageEvents.map((ev) => ({
        id:       ev.id,
        lat:      ev.lat,
        lng:      ev.lng,
        radius_m: ev.radius_m,
        severity: ev.severity,
        source:   ev.source,
      })),
    [damageEvents],
  );

  // O(1) lookup map for the card panel dependency work-tree.
  const cardMap = useMemo<Map<string, AssetCard>>(
    () => new Map(cards.map((c) => [c.id, c])),
    [cards],
  );

  const selectedGraph = useMemo(
    () => buildRelationshipGraph(selectedId, cardMap),
    [selectedId, cardMap],
  );

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
  const selectAsset = (id: string) => {
    setSelectedId(id);
    const card = cardMap.get(id);
    if (card) {
      setFocusedDamageId(null);
      setMapFocus({ lat: card.lat, lng: card.lng, zoom: 14.5 });
    }
  };

  const calculateSelectedCost = async () => {
    if (!selectedCard) return;

    setCostLoadingId(selectedCard.id);
    setCostErrors((current) => {
      const next = { ...current };
      delete next[selectedCard.id];
      return next;
    });

    try {
      const response = await fetch("/api/rebuild-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: formatCardCostContext(selectedCard, cardMap),
          target: selectedCard.name,
          currency: "USD",
          basisDate: new Date().toISOString().slice(0, 10),
          agent: "auto",
        }),
      });
      const data = await response.json() as RebuildCostReport & { error?: string; detail?: string };

      if (!response.ok) {
        throw new Error(data.detail || data.error || "Cost calculation failed.");
      }

      if (!data.total_program_cost && !data.target_cost) {
        throw new Error("Cost calculation returned no estimate.");
      }

      setCostReports((current) => ({ ...current, [selectedCard.id]: data }));
      setCostDialogId(selectedCard.id);
    } catch (error) {
      setCostErrors((current) => ({
        ...current,
        [selectedCard.id]: error instanceof Error ? error.message : "Cost calculation failed.",
      }));
    } finally {
      setCostLoadingId((current) => (current === selectedCard.id ? null : current));
    }
  };

  const runSelectedAdvisory = async () => {
    if (!selectedCard) return;

    setAdvisoryLoadingId(selectedCard.id);
    setAdvisoryErrors((current) => {
      const next = { ...current };
      delete next[selectedCard.id];
      return next;
    });

    try {
      const response = await fetch("/api/advisory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: formatCardAdvisoryContext(selectedCard, cardMap),
          objective: `Advise the next operational action for ${selectedCard.name}.`,
          databaseRoot: "data",
          catalogs: ["src/data/generated/cards.json"],
          agent: "auto",
        }),
      });
      const data = await response.json() as AdvisoryApiResponse & { error?: string; detail?: string };

      if (!response.ok) {
        throw new Error(data.detail || data.error || "Advisory failed.");
      }

      const bestNextAction = data.decision_support?.best_next_action;
      if (!bestNextAction) {
        throw new Error("Advisory returned no next action.");
      }

      setAdvisories((current) => ({
        ...current,
        [selectedCard.id]: {
          bestNextAction,
          findingsCount: data.findings?.length ?? 0,
          recommendationsCount: data.recommendations?.length ?? 0,
          topFinding: data.findings?.[0]?.title,
          topRecommendation: data.recommendations?.[0]?.action,
        },
      }));
    } catch (error) {
      setAdvisoryErrors((current) => ({
        ...current,
        [selectedCard.id]: error instanceof Error ? error.message : "Advisory failed.",
      }));
    } finally {
      setAdvisoryLoadingId((current) => (current === selectedCard.id ? null : current));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 p-4 sm:p-4 lg:gap-6 lg:p-6">
      {/* 1 — Map (centerpiece) */}
      <section
        aria-label="Infrastructure map"
        className="relative h-[calc(100vh-2rem)] min-h-[560px] lg:h-[calc(100vh-3rem)] lg:min-h-[720px]"
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
          onMarkerClick={selectAsset}
          showBuildings={showBuildings}
          onToggleBuildings={() => setShowBuildings((v) => !v)}
          zones={damageZones}
          graph={selectedGraph}
          showDamage={showDamage}
          onToggleDamage={() => setShowDamage((v) => !v)}
          focus={mapFocus}
          highlightZoneId={focusedDamageId}
          active
        />

        {/* Asset card panel — overlays the right side of the map section */}
        {selectedCard && (
          <AssetCardPanel
            card={selectedCard}
            cardMap={cardMap}
            costReport={costReports[selectedCard.id] ?? null}
            costLoading={costLoadingId === selectedCard.id}
            costError={costErrors[selectedCard.id] ?? null}
            onCalculateCost={calculateSelectedCost}
            costDialogOpen={costDialogId === selectedCard.id}
            onOpenCostDetails={() => setCostDialogId(selectedCard.id)}
            onCloseCostDetails={() => setCostDialogId(null)}
            advisory={advisories[selectedCard.id] ?? null}
            advisoryLoading={advisoryLoadingId === selectedCard.id}
            advisoryError={advisoryErrors[selectedCard.id] ?? null}
            onRunAdvisory={runSelectedAdvisory}
            onClose={() => setSelectedId(null)}
          />
        )}
      </section>

      {/* 2 — Support row */}
      <section
        aria-label="Operations detail"
        className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr_1fr] lg:gap-6"
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

        <DamageDetectionsPanel
          events={damageEvents}
          loading={damageLoading}
          onEventClick={(ev) => {
            setShowDamage(true);
            setFocusedDamageId(ev.id);
            setMapFocus({ lat: ev.lat, lng: ev.lng, zoom: 14 });
          }}
        />
      </section>
    </div>
  );
}

export default Dashboard;
