/**
 * Analyses data layer.
 *
 * `runRebuildCost` invokes the `run-analysis` Supabase Edge Function (which calls
 * Qwen via OpenRouter, validates, and persists), and `listAnalyses` reads stored
 * analyses back for the /analyses page. Everything is guarded on a configured
 * Supabase client.
 */
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { REGION } from "@/config/region";
import type { AssetCard } from "./types";
import type { RebuildCostReport } from "@/components/dashboard/AssetCardPanel";

export type AnalysisKind = "rebuild_cost" | "advisory" | "simulation";

/** A row from the `analyses` table (schema: supabase/migrations/0005_analyses.sql). */
export interface StoredAnalysis {
  id: string;
  asset_id: string;
  asset_name: string;
  asset_type: string | null;
  kind: AnalysisKind;
  schema_version: string;
  summary: string | null;
  result: RebuildCostReport | Record<string, unknown>;
  currency: string | null;
  cost_low: number | null;
  cost_expected: number | null;
  cost_high: number | null;
  confidence: string | null;
  model: string | null;
  created_at: string;
}

/** Resolve dependency edges (which reference asset ids) to readable names. */
function depPayload(edges: AssetCard["upstream"], cardMap: Map<string, AssetCard>) {
  return edges.map((e) => ({ name: cardMap.get(e.assetId)?.name ?? e.assetId, kind: e.kind }));
}

/** Build the structured asset context the edge function turns into a prompt. */
function assetPayload(card: AssetCard, cardMap: Map<string, AssetCard>) {
  return {
    id: card.id,
    name: card.name,
    name_native: card.name_native,
    type: card.type,
    lat: card.lat,
    lng: card.lng,
    status: card.status,
    criticality: card.criticality,
    metrics: card.metrics,
    population_affected: card.population_affected,
    upstream: depPayload(card.upstream, cardMap),
    downstream: depPayload(card.downstream, cardMap),
    evidence: card.evidence.map((e) => e.detail),
    region: REGION.name,
  };
}

/** Pull a useful message out of a Supabase Functions error (reads the response body). */
async function invokeErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    return body?.detail || body?.error || error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export interface RunAnalysisResult {
  id: string | null;
  report: RebuildCostReport;
}

/** Run a rebuild-cost estimate for an asset via the edge function. */
export async function runRebuildCost(
  card: AssetCard,
  cardMap: Map<string, AssetCard>,
): Promise<RunAnalysisResult> {
  if (!supabase) throw new Error("Supabase is not configured — analyses are unavailable.");

  const { data, error } = await supabase.functions.invoke("run-analysis", {
    body: { kind: "rebuild_cost", asset: assetPayload(card, cardMap), currency: "USD" },
  });

  if (error) throw new Error(await invokeErrorMessage(error, "Cost analysis failed."));
  const report = (data as { report?: RebuildCostReport } | null)?.report;
  if (!report) throw new Error("Cost analysis returned no estimate.");
  return { id: (data as { id?: string | null }).id ?? null, report };
}

/** List stored analyses (optionally filtered by kind), newest first. */
export async function listAnalyses(kind?: AnalysisKind): Promise<StoredAnalysis[]> {
  if (!supabase) return [];
  let query = supabase.from("analyses").select("*").order("created_at", { ascending: false });
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as StoredAnalysis[];
}

/** Group analyses by asset for the by-object Analyses page. */
export interface AssetAnalysisGroup {
  assetId: string;
  assetName: string;
  assetType: string | null;
  analyses: StoredAnalysis[];
  latestAt: string;
}

export function groupByAsset(rows: StoredAnalysis[]): AssetAnalysisGroup[] {
  const groups = new Map<string, AssetAnalysisGroup>();
  for (const row of rows) {
    let g = groups.get(row.asset_id);
    if (!g) {
      g = {
        assetId: row.asset_id,
        assetName: row.asset_name,
        assetType: row.asset_type,
        analyses: [],
        latestAt: row.created_at,
      };
      groups.set(row.asset_id, g);
    }
    g.analyses.push(row);
    if (row.created_at > g.latestAt) g.latestAt = row.created_at;
  }
  // rows arrive newest-first, so each group's latest is already first.
  return [...groups.values()].sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1));
}
