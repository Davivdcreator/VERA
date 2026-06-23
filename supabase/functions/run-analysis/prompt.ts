// Builds the chat messages for the rebuild-cost estimate from a VERA asset.
// The JSON shape is enforced by response_format (json_schema), so the system
// prompt focuses on HOW to estimate well, not on formatting.

import { SCHEMA_VERSION } from "./schema.ts";

export interface AssetContext {
  id: string;
  name: string;
  name_native?: string | null;
  type?: string;
  lat?: number | null;
  lng?: number | null;
  status?: string | null;
  criticality?: number | null;
  metrics?: Record<string, string | number> | null;
  population_affected?: number | null;
  // Dependency edges — only names/kinds are needed for context.
  upstream?: Array<Record<string, unknown>> | null;
  downstream?: Array<Record<string, unknown>> | null;
  evidence?: Array<Record<string, unknown> | string> | null;
  region?: string | null;
}

const SYSTEM_INSTRUCTIONS = `You are VERA's rebuild-cost estimation agent. Produce a planning-level, dependency-aware estimate of the cost to rebuild a damaged infrastructure asset.

This is for administrative prioritization — not procurement, insurance, or quantity surveying. Rules:
- Use only the provided asset context plus clearly-labelled assumptions. Never invent specific measured facts.
- Decide whether the target can be made operational now, or whether upstream dependencies must be rebuilt first. List only genuinely blocking dependencies (rebuild_first: true) and an ordered critical_path (dependencies first, target last).
- Estimate the target cost and each blocking dependency cost as {low, expected, high} ranges with an ISO-4217 currency. Always satisfy low <= expected <= high.
- total_program_cost = target_cost + sum(blocking dependency costs); set includes_dependencies accordingly.
- Decompose spend into line_items with accurate categories (demolition, hard_cost, utilities, soft_cost, dependency, contingency, resilience, other).
- Prefer honest ranges over false precision. Confidence is "low" unless measured area and a damage survey are provided.
- Write a plain-language summary (3-6 sentences) covering the asset, viability, headline expected program cost with range, main blocking dependencies, and confidence.
- schema_version must be exactly "${SCHEMA_VERSION}". Return ONLY the JSON object — no prose, no Markdown.`;

function depNames(edges?: Array<Record<string, unknown>> | null): string {
  if (!Array.isArray(edges) || edges.length === 0) return "none recorded";
  return edges
    .map((e) => {
      const name = (e.name ?? e.label ?? e.target ?? e.id ?? "unknown") as string;
      const kind = e.kind ? ` (${e.kind})` : "";
      return `${name}${kind}`;
    })
    .join("; ");
}

function evidenceLines(evidence?: Array<Record<string, unknown> | string> | null): string {
  if (!Array.isArray(evidence) || evidence.length === 0) return "no damage evidence recorded";
  return evidence
    .slice(0, 8)
    .map((e) => (typeof e === "string" ? e : (e.summary ?? e.note ?? e.text ?? JSON.stringify(e)) as string))
    .join("; ");
}

export function formatAssetContext(asset: AssetContext): string {
  const metrics = asset.metrics && Object.keys(asset.metrics).length
    ? Object.entries(asset.metrics).map(([k, v]) => `${k}: ${v}`).join(", ")
    : "none";
  const loc = asset.lat != null && asset.lng != null ? `${asset.lat.toFixed(5)}, ${asset.lng.toFixed(5)}` : "unknown";

  return [
    `Target asset: ${asset.name}${asset.name_native ? ` (${asset.name_native})` : ""}`,
    `Asset id: ${asset.id}`,
    `Type: ${asset.type ?? "unknown"}`,
    `Region: ${asset.region ?? "unknown"}`,
    `Coordinates: ${loc}`,
    `Operational status: ${asset.status ?? "unknown"}`,
    asset.criticality != null ? `Criticality (0-1): ${asset.criticality}` : null,
    asset.population_affected != null ? `Population affected if offline: ${asset.population_affected}` : null,
    `Type-specific metrics: ${metrics}`,
    `Upstream dependencies (this asset depends on): ${depNames(asset.upstream)}`,
    `Downstream dependents (fail if this fails): ${depNames(asset.downstream)}`,
    `Damage / state evidence: ${evidenceLines(asset.evidence)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildMessages(asset: AssetContext, currency: string, basisDate: string) {
  const context = formatAssetContext(asset);
  return [
    { role: "system", content: SYSTEM_INSTRUCTIONS },
    {
      role: "user",
      content:
        `Estimate the rebuild cost for the following asset.\n` +
        `Requested currency: ${currency}\nPrice basis date: ${basisDate}\n\n` +
        `Asset context:\n${context}`,
    },
  ];
}
