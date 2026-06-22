# VERA — Verified Emergency Resource Allocation

**Fuse scattered, uncertain data into reliable, real-time intelligence for
infrastructure decisions that must be made fast and defended afterwards.**

> Hackathon theme — *Infrastructure Intelligence*: How can authorities decide
> which damaged public infrastructure to repair or rebuild first when needs far
> exceed resources, and the choice determines who regains access to essential
> services?

VERA is a live triage console for an emergency operations center. Messy evidence
streams in — IoT sensors, field crews, satellite passes, partner agencies and
the public — and VERA continuously turns it into a **ranked, explainable repair
queue** plus an **immutable audit trail** for every decision.

---

## The four moves

1. **Fuse uncertain data** (`src/domain/fusion.ts`)
   Every signal is admitted but weighted by *source reliability × self-confidence
   × recency*. The result is a confidence-scored damage estimate per asset, with
   **disagreement** surfaced so contested pictures are flagged, not hidden.

2. **Decide, defensibly** (`src/domain/scoring.ts`, `criteria.ts`)
   A transparent multi-criteria model ranks assets on people served, service
   criticality, vulnerable population, network dependency, confidence-weighted
   severity and speed-to-restore. Every score ships with a **per-factor
   breakdown** — the "why" behind the rank.

3. **Decide fast** (real-time)
   Signals fuse and the queue re-ranks on arrival. The weights *are* the policy —
   tune them live and watch the portfolio reorder.

4. **Defend afterwards** (`src/components/DecisionLog.tsx`)
   Committing a decision snapshots the score, factors, fused estimate **and the
   weights in force at that moment** — an exportable record of *what was known
   and why*.

## Stack

- **Vite 6 + React 18 + TypeScript** — typed domain model, fast HMR
- **Tailwind v4** — `@tailwindcss/vite`, zero-config
- **Zustand** — the live signal → fusion → ranking → decision pipeline
- **Recharts** — factor-contribution visualization
- **Custom SVG map** — no API keys / tiles, so it demos anywhere offline
- **Supabase (optional)** — Postgres + Realtime data plane, schema included
- **Vitest** — unit tests on the deterministic decision engine

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173 — click "Start live feed"
npm test         # exercise the fusion + scoring engine
npm run build    # typecheck + production build
```

Runs fully in the browser on a deterministic simulator — no backend required.

## Go live with Supabase (optional)

1. `cp .env.example .env` and fill in `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
2. Apply `supabase/migrations/0001_init.sql`.
3. Replace `startSimulator()` in `src/store/useVeraStore.ts` with a Realtime
   subscription on the `signals` table (snippet in `src/lib/supabase.ts`).

The fusion/scoring/UI layers are unchanged — only the data source swaps.

## Map of the code

```
src/
  domain/        # pure, testable decision core
    types.ts       data model (provenance + uncertainty are first-class)
    sources.ts     source reliability registry (the trust policy)
    fusion.ts      confidence-weighted signal fusion + disagreement
    criteria.ts    prioritization weights (the decision policy)
    scoring.ts     multi-criteria ranking + per-factor rationale
  data/          # seed scenario + real-time signal simulator
  store/         # Zustand store wiring the live pipeline
  components/    # ops console: map, queue, brief, policy, feed, audit log
  lib/           # supabase client, formatting, asset/status styling
supabase/        # optional Postgres + Realtime schema
tests/           # vitest coverage of the engine
```

## Design stance

Uncertainty is modelled, not erased. A scary anonymous report does **not**
outrank a confirmed sensor reading; thin or contested evidence is marked
*provisional — verify before committing scarce crews*. The point isn't to hide
the doubt — it's to make the call **inspectable and defensible** when it's
questioned later.
