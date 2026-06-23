/**
 * Dashboard — VERA command center. DESIGN_SYSTEM.md §5.
 *
 * Layout:
 *   Full-screen map surface with floating controls and selected-asset details.
 *
 * All asset data flows from loadAssetCards() — nothing hardcoded here.
 * Supabase is used when configured; otherwise falls back to cards.json.
 */
import { useState, useEffect, useMemo } from "react";
import { MapPanel } from "@/components/dashboard/MapPanel";
import type { MapMode, MapObjectSearchItem } from "@/components/dashboard/MapPanel";
import { AssetCardPanel } from "@/components/dashboard/AssetCardPanel";
import type { AdvisoryReport, RebuildCostReport } from "@/components/dashboard/AssetCardPanel";
import { STATE_COLOR, loadAssetCards, cardsToMarkers, loadDamageEvents } from "@/lib/data/loadCards";
import type { AssetCard } from "@/lib/data/types";
import type { DamageEvent, DamageZone } from "@/lib/data/damage";
import type { MapGraphOverlay } from "@/lib/osmb/OsmBuildingsMap";
import { REGION } from "@/config/region";
import type { MapLegendProps } from "@/components/ui/MapLegend";

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
const REBUILD_COST_STORAGE_KEY = "vera.rebuildCostReports.v1";
const ADVISORY_STORAGE_KEY = "vera.advisoryReports.v1";

function loadStoredCostReports(): Record<string, RebuildCostReport> {
  try {
    const raw = window.localStorage.getItem(REBUILD_COST_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, RebuildCostReport>
      : {};
  } catch {
    return {};
  }
}

function storeCostReports(reports: Record<string, RebuildCostReport>) {
  try {
    window.localStorage.setItem(REBUILD_COST_STORAGE_KEY, JSON.stringify(reports));
  } catch (error) {
    console.warn("[VERA] Failed to persist rebuild cost reports:", error);
  }
}

function loadStoredAdvisories(): Record<string, AdvisoryReport> {
  try {
    const raw = window.localStorage.getItem(ADVISORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, AdvisoryReport>
      : {};
  } catch {
    return {};
  }
}

function storeAdvisories(advisories: Record<string, AdvisoryReport>) {
  try {
    window.localStorage.setItem(ADVISORY_STORAGE_KEY, JSON.stringify(advisories));
  } catch (error) {
    console.warn("[VERA] Failed to persist advisory reports:", error);
  }
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
  const [mapFocus, setMapFocus]         = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [focusedDamageId, setFocusedDamageId] = useState<string | null>(null);
  const [costReports, setCostReports] = useState<Record<string, RebuildCostReport>>(() => loadStoredCostReports());
  const [costErrors, setCostErrors] = useState<Record<string, string>>({});
  const [costLoadingId, setCostLoadingId] = useState<string | null>(null);
  const [costDialogId, setCostDialogId] = useState<string | null>(null);
  const [advisories, setAdvisories] = useState<Record<string, AdvisoryReport>>(() => loadStoredAdvisories());
  const [advisoryErrors, setAdvisoryErrors] = useState<Record<string, string>>({});
  const [advisoryLoadingId, setAdvisoryLoadingId] = useState<string | null>(null);
  const [advisoryDialogId, setAdvisoryDialogId] = useState<string | null>(null);

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
    loadDamageEvents()
      .then((data) => {
        if (!cancelled) {
          setDamageEvents(data);
        }
      })
      .catch((err) => {
        console.error("[VERA] loadDamageEvents failed:", err);
      });
    return () => { cancelled = true; };
  }, []);

  // Stable marker array derived from cards.
  const markers = useMemo(() => cardsToMarkers(cards), [cards]);

  // Searchable object list for the map overlay.
  const mapSearchItems = useMemo<MapObjectSearchItem[]>(
    () =>
      cards.map((card) => ({
        id: card.id,
        name: card.name,
        subtitle: card.name_native || card.zones[0] || "Kyiv",
        type: card.type,
        status: card.status,
        source: card.source,
      })),
    [cards],
  );

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

    if (costReports[selectedCard.id]) {
      setCostDialogId(selectedCard.id);
      return;
    }

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

      setCostReports((current) => {
        const next = { ...current, [selectedCard.id]: data };
        storeCostReports(next);
        return next;
      });
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

    if (advisories[selectedCard.id]) {
      setAdvisoryDialogId(selectedCard.id);
      return;
    }

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
      const data = await response.json() as AdvisoryReport & { error?: string; detail?: string };

      if (!response.ok) {
        throw new Error(data.detail || data.error || "Advisory failed.");
      }

      if (!data.decision_support?.best_next_action) {
        throw new Error("Advisory returned no next action.");
      }

      setAdvisories((current) => {
        const next = {
          ...current,
          [selectedCard.id]: data,
        };
        storeAdvisories(next);
        return next;
      });
      setAdvisoryDialogId(selectedCard.id);
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
    <section aria-label="Infrastructure map" className="fixed inset-0 z-40 overflow-hidden bg-surface-0">
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
        searchItems={mapSearchItems}
        onSearchSelect={selectAsset}
        highlightZoneId={focusedDamageId}
        active
        className="rounded-none border-0 shadow-none"
      />

      {/* Asset card panel — overlays the right side of the full-screen map. */}
      {selectedCard && (
        <AssetCardPanel
          card={selectedCard}
          cardMap={cardMap}
          onSelectAsset={selectAsset}
          costReport={costReports[selectedCard.id] ?? null}
          costLoading={costLoadingId === selectedCard.id}
          costError={costErrors[selectedCard.id] ?? null}
          onCalculateCost={calculateSelectedCost}
          costDialogOpen={costDialogId === selectedCard.id}
          onOpenCostDetails={() => setCostDialogId(selectedCard.id)}
          onCloseCostDetails={() => setCostDialogId(null)}
          advisoryReport={advisories[selectedCard.id] ?? null}
          advisoryLoading={advisoryLoadingId === selectedCard.id}
          advisoryError={advisoryErrors[selectedCard.id] ?? null}
          onRunAdvisory={runSelectedAdvisory}
          advisoryDialogOpen={advisoryDialogId === selectedCard.id}
          onOpenAdvisoryDetails={() => setAdvisoryDialogId(selectedCard.id)}
          onCloseAdvisoryDetails={() => setAdvisoryDialogId(null)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </section>
  );
}

export default Dashboard;
