---
name: vera-rebuild-cost-estimator
description: Estimate planning-level demolition and rebuild costs for damaged residential or civic buildings in VERA, using available local context, explicit assumptions, uncertainty bands, and a simple app-ready JSON output.
---

# VERA Rebuild Cost Estimator

Use this skill when estimating the cost to repair, demolish, replace, or rebuild a damaged building for VERA. The output is for administrative planning and prioritization, not procurement, insurance settlement, or final quantity surveying.

## Core Rule

Return a single JSON object matching `references/rebuild_cost_estimate.schema.json` unless the user explicitly asks for prose. Keep it simple enough for a basic app screen: header fields, context, assumptions, cost rows, totals, confidence, caveats, and next steps.

## Workflow

1. Identify the estimate type:
   - `repair`: partial works where the structure remains.
   - `demolish_and_rebuild`: damaged beyond economical repair or policy favors replacement.
   - `new_build`: replacement capacity without a known existing asset.
   - `unknown`: insufficient scope clarity.

2. Collect or infer minimum inputs:
   - location or grid cell
   - building use, default `residential`
   - gross floor area in square meters
   - floors, footprint, unit count, or occupancy if available
   - damage state and whether demolition is required
   - planning currency and price basis date
   - local constraints: dense center, access difficulty, heritage constraints, utilities, site security

3. Enrich from VERA/local data when available:
   - population and density context
   - nearby civic facilities and service pressure
   - transit access and road/access constraints
   - air-alert or hazard exposure history
   - administrative boundary or grid id
   - source freshness and confidence

4. If building specifics are missing, make conservative assumptions and mark them:
   - Central urban residential replacement: 3,000-8,000 m2 GFA unless user gives size.
   - Demolition/debris/site prep: 8-18% of new-build hard cost for severe destruction in constrained urban sites.
   - Soft costs: 10-18% of hard cost.
   - External works, utilities, access, resilience upgrades: 6-15% of hard cost.
   - Contingency/escalation: 12-25% at concept stage.
   - Planning-level confidence should usually be `low` unless a measured GFA and damage survey are available.

5. Build line items:
   - demolition_debris_and_site_safety
   - new_build_hard_cost
   - utilities_and_external_works
   - design_permits_supervision
   - resilience_and_accessibility_upgrades
   - contingency_and_escalation
   - optional: temporary_housing_or_relocation, heritage_or_complex_site_premium

6. Compute totals:
   - `low`, `expected`, `high`
   - `per_square_meter.low/expected/high`
   - include `currency`, `price_basis_date`, and `vat_included` if known

7. Flag missing blockers:
   - measured GFA/footprint
   - damage grade and structural assessment
   - demolition waste quantity
   - ownership/cadastre
   - heritage status
   - utility reconnection needs
   - procurement/VAT/local index assumptions

## Cost Method

For a concept estimate:

```text
hard_cost = gross_floor_area_m2 * base_rebuild_cost_per_m2
line_item.expected = quantity * unit_cost.expected
line_item.low/high = expected adjusted by uncertainty range
total = sum(line_items)
confidence = function(input completeness, source reliability, variance width)
```

Prefer ranges over false precision. Round planning totals to sensible increments:

- under 1M: nearest 10,000
- 1M-20M: nearest 100,000
- above 20M: nearest 500,000 or 1,000,000

## Output Contract

Use the schema in `references/rebuild_cost_estimate.schema.json`. Required top-level keys:

- `schema_version`
- `estimate_id`
- `estimate_kind`
- `summary`
- `location_context`
- `building_assumptions`
- `damage_assessment`
- `cost_model`
- `line_items`
- `totals`
- `confidence`
- `data_sources`
- `caveats`
- `recommended_next_steps`

Use `null` for unknown scalar values. Do not omit important unknowns.
