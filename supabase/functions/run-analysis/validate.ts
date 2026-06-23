// Runtime validation for the canonical rebuild-cost estimate. Ported from
// src/feature-scripts/rebuild_cost_agent.py (validate_estimate / validate_cost_range)
// and adapted to schema vera.rebuild_cost_estimate.v2. Returns a list of human
// readable errors; empty means valid. Used to drive a one-shot repair retry.

import { LINE_ITEM_CATEGORIES, SCHEMA_VERSION } from "./schema.ts";

// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;

function requireKeys(obj: Obj, keys: string[], path: string): string[] {
  return keys.filter((k) => !(k in obj)).map((k) => `${path}.${k} is missing`);
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function validateCostRange(obj: unknown, path: string, requireCurrency = true): string[] {
  if (typeof obj !== "object" || obj === null) return [`${path} must be an object`];
  const o = obj as Obj;
  const errors: string[] = [];
  if (requireCurrency && typeof o.currency !== "string") errors.push(`${path}.currency must be a string`);
  for (const k of ["low", "expected", "high"]) {
    if (!isNum(o[k])) errors.push(`${path}.${k} must be a number`);
  }
  if (isNum(o.low) && isNum(o.expected) && isNum(o.high)) {
    if (!(o.low <= o.expected && o.expected <= o.high)) {
      errors.push(`${path} must satisfy low <= expected <= high`);
    }
  }
  return errors;
}

export function validateRebuildEstimate(obj: unknown): string[] {
  if (typeof obj !== "object" || obj === null) return ["$ must be an object"];
  const o = obj as Obj;

  const errors: string[] = requireKeys(
    o,
    [
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
    "$",
  );

  if (o.schema_version !== SCHEMA_VERSION) errors.push(`$.schema_version must be "${SCHEMA_VERSION}"`);
  if (typeof o.summary !== "string" || o.summary.trim() === "") errors.push("$.summary must be a non-empty string");

  if (typeof o.target !== "object" || o.target === null) errors.push("$.target must be an object");
  else errors.push(...requireKeys(o.target, ["name", "description", "asset_type", "scope_summary"], "$.target"));

  if (typeof o.viability !== "object" || o.viability === null) errors.push("$.viability must be an object");
  else errors.push(...requireKeys(o.viability, ["is_viable_now", "reason", "blocking_dependencies", "critical_path"], "$.viability"));

  if (!Array.isArray(o.dependencies)) {
    errors.push("$.dependencies must be an array");
  } else {
    o.dependencies.forEach((dep: unknown, i: number) => {
      const p = `$.dependencies[${i}]`;
      if (typeof dep !== "object" || dep === null) {
        errors.push(`${p} must be an object`);
        return;
      }
      const d = dep as Obj;
      errors.push(...requireKeys(d, ["name", "why_required_first", "rebuild_first", "cost"], p));
      if ("cost" in d) errors.push(...validateCostRange(d.cost, `${p}.cost`));
    });
  }

  errors.push(...validateCostRange(o.target_cost, "$.target_cost"));
  errors.push(...validateCostRange(o.total_program_cost, "$.total_program_cost"));

  if (!Array.isArray(o.line_items)) {
    errors.push("$.line_items must be an array");
  } else {
    o.line_items.forEach((li: unknown, i: number) => {
      const p = `$.line_items[${i}]`;
      if (typeof li !== "object" || li === null) {
        errors.push(`${p} must be an object`);
        return;
      }
      const item = li as Obj;
      errors.push(...requireKeys(item, ["name", "category", "applies_to", "low", "expected", "high", "notes"], p));
      for (const k of ["low", "expected", "high"]) {
        if (k in item && !isNum(item[k])) errors.push(`${p}.${k} must be a number`);
      }
      if (typeof item.category === "string" && !LINE_ITEM_CATEGORIES.includes(item.category as never)) {
        errors.push(`${p}.category "${item.category}" is not one of ${LINE_ITEM_CATEGORIES.join(", ")}`);
      }
    });
  }

  for (const k of ["assumptions", "risks", "missing_inputs", "recommended_next_steps"]) {
    if (!Array.isArray(o[k])) errors.push(`$.${k} must be an array`);
  }

  return errors;
}
