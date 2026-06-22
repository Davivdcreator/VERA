-- VERA — infrastructure-intelligence schema matching kyiv_infrastructure.csv
-- Schema matches CSV columns: id, name, type, subtype, location, latitude, longitude, capacity, year_built, status, metadata, real
-- Dependencies stored in separate table

-- ── enums ──────────────────────────────────────────────────────────────────
create type infra_type as enum ('transportation', 'critical', 'government', 'utilities');
create type infra_status as enum ('operational', 'degraded', 'offline', 'unknown');

-- ── infrastructure (matches CSV: kyiv_infrastructure.csv) ───────────────────
create table infrastructure (
  id          uuid primary key,
  name        text not null,
  type        infra_type not null,
  subtype     text not null,
  location    text,
  latitude    double precision not null,
  longitude   double precision not null,
  capacity    text,
  year_built  text,
  status      text,
  metadata    jsonb not null default '{}'::jsonb,
  real        boolean not null default true
);

create index infra_type_idx on infrastructure (type);
create index infra_subtype_idx on infrastructure (subtype);
create index infra_location_idx on infrastructure (location);

-- ── dependency work-tree (directed edges) ──────────────────────────────────
create table infrastructure_dependencies (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid not null references infrastructure(id) on delete cascade,
  target_id   uuid not null references infrastructure(id) on delete cascade,
  kind        text not null default 'depends_on',
  weight      double precision not null default 0.5,
  reason      text,
  unique (source_id, target_id, kind),
  check (source_id <> target_id)
);
create index infra_deps_source_idx on infrastructure_dependencies (source_id);
create index infra_deps_target_idx on infrastructure_dependencies (target_id);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table infrastructure enable row level security;
alter table infrastructure_dependencies enable row level security;

create policy "public read infrastructure" on infrastructure for select using (true);
create policy "public read deps" on infrastructure_dependencies for select using (true);
