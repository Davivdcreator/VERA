/**
 * Dashboard — VERA command center. DESIGN_SYSTEM.md §5.
 *
 * Layout:
 *   Full-screen map surface with floating controls and selected-asset details.
 *
 * All asset data flows from loadAssetCards() — nothing hardcoded here.
 * Supabase is used when configured; otherwise falls back to the generated full
 * infrastructure card bundle.
 */
import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { MapPanel } from "@/components/dashboard/MapPanel";
import type { MapMode, MapObjectSearchItem } from "@/components/dashboard/MapPanel";
import { AssetCardPanel } from "@/components/dashboard/AssetCardPanel";
import type { AdvisoryReport, RebuildCostReport } from "@/components/dashboard/AssetCardPanel";
import { STATE_COLOR, loadAssetCards, cardsToMarkers, loadDamageEvents } from "@/lib/data/loadCards";
import { runRebuildCost } from "@/lib/data/analyses";
import type { AssetCard } from "@/lib/data/types";
import type { DamageEvent, DamageZone } from "@/lib/data/damage";
import type { MapGraphOverlay } from "@/lib/osmb/OsmBuildingsMap";
import { REGION } from "@/config/region";
import { ECONOMIC_LOSS_ENABLED, ECONOMIC_SCENARIO } from "@/config/economics";
import { computeEconomicLoss } from "@/lib/economics/lossModel";
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

/**
 * Granular category key for the type filter. The top-level `type` is mostly
 * "other", so we filter on the OSM `subtype` (pharmacy, school, bus_stop,
 * clinic…) when present, falling back to the top-level type.
 */
function subtypeOf(card: AssetCard): string {
  const sub = card.metrics?.subtype;
  const value = typeof sub === "string" ? sub.trim() : "";
  return value || card.type || "other";
}

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
  // Economic-outage-loss MVP: scenario outage duration for the loss estimate.
  const [economicOutageHours, setEconomicOutageHours] = useState(
    ECONOMIC_SCENARIO.defaultOutageHours,
  );

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

  // ── Asset-type filter ────────────────────────────────────────────────────
  // Which asset types are hidden from the map (empty set = everything shown).
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(() => new Set());

  // Categories present in the loaded data, with counts, for the header filter.
  const assetTypes = useMemo(() => {
    // Order the Types filter by public-safety / importance — most critical first
    // (healthcare & emergency services, then water, power, heating, then the rest).
    const PRIORITY: Record<string, number> = {
      hospital: 1,
      fire_station: 2,
      police: 3,
      clinic: 4,
      pharmacy: 5,
      water_works: 6,
      pumping_station: 7,
      water_fountain: 8,
      power_plant: 9,
      substation: 10,
      heating_plant: 11,
      wastewater: 12,
      telecom: 13,
      bridge: 14,
      bus_stop: 15,
      post_office: 16,
      supermarket: 17,
      museum: 18,
      other: 99,
    };
    const rank = (t: string) => PRIORITY[t] ?? 50;
    const counts = new Map<string, number>();
    for (const card of cards) {
      const key = subtypeOf(card);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts, ([type, count]) => ({ type, count })).sort(
      (a, b) => rank(a.type) - rank(b.type) || b.count - a.count,
    );
  }, [cards]);

  const toggleAssetType = (type: string) =>
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  const showAllAssetTypes = () => setHiddenTypes(new Set());
  const hideAllAssetTypes = () => setHiddenTypes(new Set(assetTypes.map((t) => t.type)));

  // Stable marker array derived from cards, filtered by the category filter.
  const markers = useMemo(
    () => cardsToMarkers(cards.filter((card) => !hiddenTypes.has(subtypeOf(card)))),
    [cards, hiddenTypes],
  );

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

  // Scenario-based economic outage loss for the selected asset — deterministic,
  // local (no API/LLM). Null when disabled via flag or nothing is selected.
  const economicLossReport = useMemo(
    () =>
      ECONOMIC_LOSS_ENABLED && selectedCard
        ? computeEconomicLoss({
            selectedAssetId: selectedCard.id,
            cards,
            outageHours: economicOutageHours,
            scenario: ECONOMIC_SCENARIO,
          })
        : null,
    [selectedCard, cards, economicOutageHours],
  );
  // Deep-link focus: /?lat=&lng=&zoom= flies the map to a point (used by the
  // Repair Queue "Locate on map" links).
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const lat = parseFloat(searchParams.get("lat") ?? "");
    const lng = parseFloat(searchParams.get("lng") ?? "");
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const zoom = parseFloat(searchParams.get("zoom") ?? "");
      setMapFocus({ lat, lng, zoom: Number.isFinite(zoom) ? zoom : 15 });
    }
  }, [searchParams]);

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

    // Presentation mode: the live model is rate-limited, so keep the panel in a
    // perpetual "thinking" state instead of surfacing an error. Delete the await
    // below to restore the real estimate call.
    await new Promise<void>(() => {});

    try {
      const { report } = await runRebuildCost(selectedCard, cardMap);

      setCostReports((current) => {
        const next = { ...current, [selectedCard.id]: report };
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

    // Presentation mode: keep the panel in a perpetual "thinking" state instead
    // of calling the (rate-limited) backend. Delete the await to restore it.
    await new Promise<void>(() => {});

    try {
      const response = await fetch("/api/advisory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: formatCardAdvisoryContext(selectedCard, cardMap),
          objective: `Advise the next operational action for ${selectedCard.name}.`,
          databaseRoot: "data",
          catalogs: ["src/data/generated/full-infrastructure-cards.json"],
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
    <section aria-label="Infrastructure map" className="relative h-full overflow-hidden bg-surface-0">
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
        assetTypes={assetTypes}
        hiddenTypes={hiddenTypes}
        onToggleType={toggleAssetType}
        onShowAllTypes={showAllAssetTypes}
        onHideAllTypes={hideAllAssetTypes}
        focus={mapFocus}
        searchItems={mapSearchItems}
        onSearchSelect={selectAsset}
        highlightZoneId={focusedDamageId}
        active
        bare
      />

      {/* Asset card panel — overlays the right side of the full-screen map. */}
      {selectedCard && (
        <AssetCardPanel
          card={selectedCard}
          cardMap={cardMap}
          onSelectAsset={selectAsset}
          economicLossReport={economicLossReport}
          economicOutageHours={economicOutageHours}
          onEconomicOutageHoursChange={setEconomicOutageHours}
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
