-- VERA — infrastructure-intelligence schema.
-- Applied to the pinned VERA Supabase project once its MCP is authenticated.
-- Real data only: assets come from OSM, state from FIRMS+Telegram fusion.

-- ── enums ──────────────────────────────────────────────────────────────────
create type asset_type as enum (
  'hospital','power_plant','substation','water_works','wastewater',
  'pumping_station','bridge','heating_plant','telecom','other'
);
create type infra_status as enum ('operational','degraded','offline','unknown');
create type dep_kind as enum ('powers','supplies_water','provides_access','feeds_heat','other');
create type event_source as enum ('firms','telegram','manual','sample');

-- ── assets (harvested from OpenStreetMap) ──────────────────────────────────
create table assets (
  id          uuid primary key default gen_random_uuid(),
  osm_type    text,
  osm_id      bigint,
  name        text not null,
  name_native text,
  type        asset_type not null,
  lat         double precision not null,
  lng         double precision not null,
  criticality double precision not null default 0 check (criticality between 0 and 1),
  criticality_breakdown jsonb not null default '{}'::jsonb,
  metrics     jsonb not null default '{}'::jsonb,  -- type-specific (MW, beds, voltage…)
  tags        jsonb not null default '{}'::jsonb,  -- raw OSM tags
  source      text not null default 'osm',
  harvested_at timestamptz not null default now(),
  unique (osm_type, osm_id)
);

-- ── dependency work-tree (directed edges) ──────────────────────────────────
create table asset_dependencies (
  id        uuid primary key default gen_random_uuid(),
  source_id uuid not null references assets(id) on delete cascade,
  target_id uuid not null references assets(id) on delete cascade,
  kind      dep_kind not null,
  weight    double precision not null default 0.5,
  unique (source_id, target_id, kind),
  check (source_id <> target_id)
);
create index asset_deps_source_idx on asset_dependencies (source_id);
create index asset_deps_target_idx on asset_dependencies (target_id);

-- ── impact zones (area + population affected) ──────────────────────────────
create table impact_zones (
  asset_id            uuid primary key references assets(id) on delete cascade,
  radius_m            double precision not null,
  population_affected integer not null default 0,
  zones               text[] not null default '{}'
);

-- ── live damage state (fused FIRMS + Telegram) ─────────────────────────────
create table asset_state (
  asset_id   uuid primary key references assets(id) on delete cascade,
  status     infra_status not null default 'unknown',
  confidence double precision not null default 0 check (confidence between 0 and 1),
  score      double precision not null default 0,
  evidence   jsonb not null default '[]'::jsonb,  -- FIRMS rows + Telegram messageUrls
  updated_at timestamptz not null default now()
);

-- ── raw events (ingestion log: FIRMS detections, Telegram reports) ──────────
create table events (
  id       uuid primary key default gen_random_uuid(),
  source   event_source not null,
  asset_id uuid references assets(id) on delete set null,
  lat      double precision,
  lng      double precision,
  payload  jsonb not null default '{}'::jsonb,
  ts       timestamptz not null default now()
);
create index events_asset_idx on events (asset_id, ts desc);

-- ── one-row-per-asset card view (what the SPA reads) ───────────────────────
create view asset_cards with (security_invoker = on) as
select
  a.*,
  coalesce(s.status, 'unknown')      as status,
  coalesce(s.confidence, 0)          as state_confidence,
  coalesce(s.evidence, '[]'::jsonb)  as evidence,
  iz.radius_m,
  coalesce(iz.population_affected, 0) as population_affected,
  coalesce(iz.zones, '{}')           as zones,
  coalesce(d.downstream, '[]'::jsonb) as downstream,
  coalesce(u.upstream, '[]'::jsonb)   as upstream
from assets a
left join asset_state s   on s.asset_id = a.id
left join impact_zones iz on iz.asset_id = a.id
left join lateral (
  select jsonb_agg(jsonb_build_object('assetId', dep.target_id, 'kind', dep.kind, 'weight', dep.weight)) as downstream
  from asset_dependencies dep where dep.source_id = a.id
) d on true
left join lateral (
  select jsonb_agg(jsonb_build_object('assetId', dep.source_id, 'kind', dep.kind, 'weight', dep.weight)) as upstream
  from asset_dependencies dep where dep.target_id = a.id
) u on true;

-- ── RLS: public read for the SPA (anon); writes only via service role ───────
alter table assets             enable row level security;
alter table asset_dependencies enable row level security;
alter table impact_zones       enable row level security;
alter table asset_state        enable row level security;
alter table events             enable row level security;

create policy "public read assets" on assets             for select using (true);
create policy "public read deps"   on asset_dependencies for select using (true);
create policy "public read impact" on impact_zones       for select using (true);
create policy "public read state"  on asset_state        for select using (true);
create policy "public read events" on events             for select using (true);
-- The service role bypasses RLS, so ingestion writes need no anon write policy.
