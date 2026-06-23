---
name: vera-rebuild-cost-estimator
description: Estimate planning-level rebuild cost for a damaged VERA infrastructure asset, including the prerequisite dependencies that must be rebuilt first, with explicit assumptions, uncertainty ranges, and a single app-ready JSON object.
---

# VERA Rebuild Cost Estimator

Use this skill to estimate the cost to repair, demolish, replace, or rebuild a damaged asset for VERA. The output is for administrative planning and prioritization — not procurement, insurance settlement, or final quantity surveying.

## Core Rule

Return a **single JSON object** that conforms exactly to `references/rebuild_cost_estimate.schema.json` (`schema_version: "vera.rebuild_cost_estimate.v2"`). Return JSON only — no Markdown, no prose outside the JSON. Use exact numbers (not strings) for every cost field. Use `null` only where the schema allows it; never omit a required key.

This is a **dependency-aware** estimate: the asset is part of a network, so the cost to make it viable again may require rebuilding upstream dependencies first.

## Workflow

1. **Identify the target** from the provided asset context: name, type, location, and a short scope summary of what rebuilding entails.

2. **Assess viability.** Decide whether the target can be rebuilt and made operational *now*, or whether upstream dependencies must be restored first. List blocking dependencies and an ordered `critical_path` (dependencies first, target last).

3. **Cost the dependencies.** For each *blocking* dependency (set `rebuild_first: true`), estimate its rebuild cost as a range with currency and confidence. Do not list nice-to-have work as a blocking dependency — only what is genuinely required first.

4. **Cost the target** (`target_cost`) as a `{low, expected, high}` range with currency, confidence, and a `basis_date`.

5. **Build `line_items`** that decompose the spend. Each item has a `category` (one of: `demolition`, `hard_cost`, `utilities`, `soft_cost`, `dependency`, `contingency`, `resilience`, `other`), an `applies_to` (the target or a dependency name), and `{low, expected, high}`. These power the app's cost-structure chart, so keep categories accurate.

6. **Compute `total_program_cost`** = target cost + all blocking dependency costs. Set `includes_dependencies` accordingly. Ensure `low <= expected <= high` for every range.

7. **Write the `summary`** (3–6 sentences, plain language): what the target is, whether it's viable now, the headline expected program cost with range, the main blocking dependencies, and the confidence level. This is shown verbatim in the app.

8. **Fill `assumptions`, `risks`, `missing_inputs`, `recommended_next_steps`** as arrays of short strings. Flag the blockers that would most improve the estimate (measured GFA/footprint, damage grade, demolition quantities, ownership, utility reconnection, local price index).

## Estimating Method

For a concept-level estimate:

```text
hard_cost          = gross_floor_area_m2 * base_rebuild_cost_per_m2
line_item.expected = quantity * unit_cost.expected
line_item.low/high = expected widened by an uncertainty band
target_cost        = sum(target line_items)
total_program_cost = target_cost + sum(blocking dependency costs)
confidence         = f(input completeness, source reliability, range width)
```

Prefer ranges over false precision. When building specifics are missing, assume conservatively and record it in `assumptions`:

- Central urban residential replacement: 3,000–8,000 m² GFA unless a size is given.
- Demolition/debris/site prep: 8–18% of new-build hard cost for severe destruction on constrained urban sites.
- Soft costs (design/permits/supervision): 10–18% of hard cost.
- Utilities/external works/access/resilience: 6–15% of hard cost.
- Contingency/escalation: 12–25% at concept stage.
- Confidence is usually `low` unless measured GFA and a damage survey are available.

Round planning totals sensibly: under 1M → nearest 10,000; 1M–20M → nearest 100,000; above 20M → nearest 500,000 or 1,000,000.

## Output Contract

Top-level keys (all required): `schema_version`, `summary`, `target`, `viability`, `dependencies`, `target_cost`, `total_program_cost`, `line_items`, `assumptions`, `risks`, `missing_inputs`, `recommended_next_steps`.

See `references/rebuild_cost_estimate.schema.json` for the exact shape. The schema is strict-output safe and is passed to the model as `response_format: { type: "json_schema" }`.
