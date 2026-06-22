-- VERA — damage-events schema.
-- Fused damage zones derived from FIRMS + Telegram signals, with affected assets.
-- Applied by the orchestrator via the Supabase MCP after this file is committed.

-- ── enums ──────────────────────────────────────────────────────────────────
create type damage_source as enum ('firms', 'telegram', 'fused', 'sample');

-- ── damage events (fused FIRMS + Telegram zone detections) ─────────────────
create table damage_events (
  id          uuid primary key default gen_random_uuid(),
  lat         double precision not null,
  lng         double precision not null,
  radius_m    double precision not null,
  severity    double precision not null default 0 check (severity between 0 and 1),
  confidence  double precision not null default 0 check (confidence between 0 and 1),
  source      damage_source not null,
  title       text not null,
  summary     text,
  keywords    text[] not null default '{}',
  evidence    jsonb not null default '[]'::jsonb,  -- FIRMS rows + Telegram messages (with url)
  affected    jsonb not null default '[]'::jsonb,  -- [{assetId,name,type,estDamage,distanceM}]
  detected_at timestamptz not null default now()
);

create index damage_events_detected_at_idx on damage_events (detected_at desc);

-- ── RLS: public read for the SPA (anon); writes only via service role ───────
alter table damage_events enable row level security;

create policy "public read damage_events" on damage_events for select using (true);
-- The service role bypasses RLS, so ingestion writes need no anon write policy.
