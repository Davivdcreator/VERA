---
name: vera-cascade-advisor
description: Generate proactive operational advisories for VERA by reasoning about cascading infrastructure failures. Treats dependency graphs as evidence, not ground truth — combines them with current damage state, timing, and judgment to recommend who to warn, what will fail next, and when. Outputs explicit reasoning, uncertainty, and a simple app-ready JSON.
---

# VERA Cascade Advisor

Use this skill when something has happened (an attack, outage, fire, flood, or damage report) and a human needs to know what it means downstream: which assets are now at risk, how long until they are affected, and who should be warned before it happens. The output is for operational decision support and early warning, not for guaranteed prediction or automated control.

## Core Rule

Return a single JSON object matching `references/cascade_advisory.schema.json` unless the user explicitly asks for prose. Keep it simple enough for a basic app screen: header fields, the triggering event, the reasoning chain, the advisories (who to warn and why), confidence, and caveats.

## The Most Important Rule: Think, Don't Just Traverse

**Do not treat the dependency graph as revealed truth.** It is a model built from OSM tags and simple rules — useful, incomplete, and sometimes wrong. Your job is to reason on top of it, not to read it out loud.

Concretely:

- **Use the graph as a starting hypothesis, then sanity-check it.** A missing edge does not mean independence; a present edge does not guarantee impact. Real systems have buffers, redundancy, manual overrides, and backups the graph does not encode.
- **Add your own causal reasoning.** If a water treatment plant is hit, ask what *actually* depends on its output and on what timescale — a hospital may have on-site water reserves that last hours, a residential block may not. The graph might not contain this edge at all; infer it anyway when the physical logic is clear, and label it as inferred.
- **Reason about time, not just topology.** The graph says *what* connects; you must estimate *when* the downstream asset degrades. Buffers (water tanks, fuel reserves, battery/UPS, thermal mass) create delay. State that delay explicitly — "the hospital may lose water access in ~6 hours" is the actionable output, "the hospital depends on the water plant" is not.
- **Prioritize by consequence, not by graph distance.** A two-hop path to a hospital matters more than a one-hop path to a parking lot. Weight critical-care, life-safety, and large-population assets first.
- **Recommend action.** The point of an advisory is to change what a human does next. Each finding should end in a concrete recommendation — usually "notify operator X within Y hours so they can do Z" (top up reserves, switch to backup, begin evacuation prep, dispatch a tanker).
- **Surface where the graph is probably wrong or thin,** so the human can correct it and so the model improves.

A good advisory reads like an experienced operator thinking out loud, e.g.:

> "There was just an attack on the Dniprovska water treatment plant. Hospital No. 7 draws from that supply zone. Hospitals typically hold ~4–8h of on-site water reserve, so it likely retains pressure for now but could lose usable water access in roughly 6 hours if the plant stays offline. Recommend notifying the hospital duty officer now so they can ration, top up reserves, and pre-stage a tanker before it becomes critical."

## Workflow

1. **Anchor the triggering event:**
   - what happened (attack, outage, fire, flood, equipment failure, planned shutdown)
   - which asset(s) it hit, with id/location if known
   - when it happened and the current state (operational / degraded / offline)
   - confidence in the event itself and its source (FIRMS thermal, Telegram report, operator input, manual)

2. **Pull the dependency context, then critique it:**
   - read the dependency work-tree / impact zone for the hit asset (see the `digital-twin-card` and `damage-state-fusion` skills for where state and dependencies come from)
   - list the downstream assets the graph names
   - then add downstream assets the graph *misses* but physical logic implies, and mark which edges are `graph` vs `inferred`
   - note any graph edges you doubt, and why

3. **For each plausibly affected downstream asset, reason about timing and buffers:**
   - what service does it lose (water, power, heat, transport access, comms)
   - what buffer does it likely have, and how long does it last (state the assumption)
   - estimate a `time_to_impact` window (low / expected / high), or `null` + `immediate`/`unknown` if no delay applies
   - estimate severity if the impact lands (criticality of the asset × population/life-safety exposure)

4. **Decide who to warn and how urgently:**
   - turn each significant finding into an advisory with a named recipient role (operator, duty officer, dispatcher, city ops) and a recommended action
   - set urgency from time_to_impact and severity: shorter window + higher severity = higher urgency
   - prefer warning early with stated uncertainty over staying silent until certain

5. **State confidence and what would change the picture:**
   - overall confidence, with drivers (event certainty, graph completeness, buffer assumptions)
   - the key unknowns that, if resolved, would most change the advice (actual reserve levels, real redundancy, whether the plant restarts)

## Reasoning Method

For each candidate downstream asset:

```text
likely_affected = physical_dependency_exists(graph OR inferred) AND no_sufficient_redundancy
time_to_impact   = buffer_duration_estimate (water reserve, fuel, UPS, thermal mass)
severity         = downstream_criticality * exposure(population, life_safety)
urgency          = f(severity, shorter time_to_impact, event_confidence)
recommendation   = who_to_warn + action + deadline (warn before time_to_impact.low)
```

Prefer ranges and explicit assumptions over false precision. Always give the human enough lead time: the recommended notification deadline should sit *before* the low end of the time-to-impact window.

## Output Contract

Use the schema in `references/cascade_advisory.schema.json`. Required top-level keys:

- `schema_version`
- `advisory_id`
- `generated_at`
- `triggering_event`
- `reasoning`
- `affected_assets`
- `advisories`
- `confidence`
- `data_sources`
- `caveats`

Use `null` for unknown scalar values. Do not omit important unknowns, and always mark each dependency edge as `graph` or `inferred` so the human knows when you reasoned beyond the model.
