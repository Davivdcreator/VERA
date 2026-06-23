// Canonical rebuild-cost estimate contract (runtime mirror of
// .agents/skills/vera-rebuild-cost-estimator/references/rebuild_cost_estimate.schema.json).
// Kept here so the edge function can pass it verbatim to OpenRouter as
// response_format.json_schema and validate against the same shape.

export const SCHEMA_VERSION = "vera.rebuild_cost_estimate.v2";

export const LINE_ITEM_CATEGORIES = [
  "demolition",
  "hard_cost",
  "utilities",
  "soft_cost",
  "dependency",
  "contingency",
  "resilience",
  "other",
] as const;

const costRange = (extra: Record<string, unknown> = {}, extraRequired: string[] = []) => ({
  type: "object",
  additionalProperties: false,
  required: ["currency", "low", "expected", "high", ...extraRequired],
  properties: {
    currency: { type: "string" },
    low: { type: "number" },
    expected: { type: "number" },
    high: { type: "number" },
    ...extra,
  },
});

// Strict-output safe: every object sets additionalProperties:false and lists all
// keys in required, no min/max/length keywords. enum (not const) for the version.
export const REBUILD_COST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "summary",
    "target",
    "viability",
    "dependencies",
    "target_cost",
    "total_program_cost",
    "line_items",
    "assumptions",
    "risks",
    "missing_inputs",
    "recommended_next_steps",
  ],
  properties: {
    schema_version: { type: "string", enum: [SCHEMA_VERSION] },
    summary: { type: "string" },
    target: {
      type: "object",
      additionalProperties: false,
      required: ["name", "description", "location", "asset_type", "scope_summary"],
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        location: { type: ["string", "null"] },
        asset_type: { type: "string" },
        scope_summary: { type: "string" },
      },
    },
    viability: {
      type: "object",
      additionalProperties: false,
      required: ["is_viable_now", "reason", "blocking_dependencies", "critical_path"],
      properties: {
        is_viable_now: { type: "boolean" },
        reason: { type: "string" },
        blocking_dependencies: { type: "array", items: { type: "string" } },
        critical_path: { type: "array", items: { type: "string" } },
      },
    },
    dependencies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "description",
          "why_required_first",
          "rebuild_first",
          "cost",
          "assumptions",
          "missing_inputs",
        ],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          why_required_first: { type: "string" },
          rebuild_first: { type: "boolean" },
          cost: costRange({ confidence: { type: "string", enum: ["low", "medium", "high"] } }, ["confidence"]),
          assumptions: { type: "array", items: { type: "string" } },
          missing_inputs: { type: "array", items: { type: "string" } },
        },
      },
    },
    target_cost: costRange(
      {
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        basis_date: { type: "string" },
      },
      ["confidence", "basis_date"],
    ),
    total_program_cost: costRange({ includes_dependencies: { type: "boolean" } }, ["includes_dependencies"]),
    line_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "category", "applies_to", "low", "expected", "high", "notes"],
        properties: {
          name: { type: "string" },
          category: { type: "string", enum: [...LINE_ITEM_CATEGORIES] },
          applies_to: { type: "string" },
          low: { type: "number" },
          expected: { type: "number" },
          high: { type: "number" },
          notes: { type: "string" },
        },
      },
    },
    assumptions: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    missing_inputs: { type: "array", items: { type: "string" } },
    recommended_next_steps: { type: "array", items: { type: "string" } },
  },
} as const;

export interface CostRange {
  currency: string;
  low: number;
  expected: number;
  high: number;
  confidence?: "low" | "medium" | "high";
  basis_date?: string;
  includes_dependencies?: boolean;
}

export interface RebuildCostReport {
  schema_version: string;
  summary: string;
  target: { name: string; description: string; location: string | null; asset_type: string; scope_summary: string };
  viability: { is_viable_now: boolean; reason: string; blocking_dependencies: string[]; critical_path: string[] };
  dependencies: Array<{
    name: string;
    description: string;
    why_required_first: string;
    rebuild_first: boolean;
    cost: CostRange;
    assumptions: string[];
    missing_inputs: string[];
  }>;
  target_cost: CostRange;
  total_program_cost: CostRange;
  line_items: Array<{ name: string; category: string; applies_to: string; low: number; expected: number; high: number; notes: string }>;
  assumptions: string[];
  risks: string[];
  missing_inputs: string[];
  recommended_next_steps: string[];
}
