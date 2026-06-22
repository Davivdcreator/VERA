-- VERA · real-time backend schema (optional)
-- Apply with the Supabase CLI or MCP. The app runs without this; provide
-- VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY to switch the data plane on.

create type asset_type as enum
  ('hospital','water','power','bridge','road','school','shelter','telecom');
create type asset_status as enum ('operational','degraded','offline','unknown');
create type source_kind as enum
  ('sensor','field_crew','satellite','citizen','partner_agency');
create type signal_kind as enum
  ('damage_report','service_outage','access_blocked','restored','casualty_risk');
create type decision_state as enum
  ('queued','dispatched','in_progress','restored','deferred');

-- Infrastructure assets under triage.
create table assets (
  id                   text primary key,
  name                 text not null,
  type                 asset_type not null,
  x                    double precision not null,   -- 0..1 canvas coords
  y                    double precision not null,
  population_served    integer not null default 0,
  vulnerability_share  double precision not null default 0,  -- 0..1
  base_criticality     double precision not null default 0.5,-- 0..1
  unblocks             text[] not null default '{}',
  estimated_repair_days numeric not null default 1,
  status               asset_status not null default 'unknown',
  created_at           timestamptz not null default now()
);

-- Raw, uncertain observations. Fused in the app / an edge function.
create table signals (
  id            uuid primary key default gen_random_uuid(),
  asset_id      text not null references assets(id) on delete cascade,
  source        source_kind not null,
  kind          signal_kind not null,
  severity      double precision not null check (severity between 0 and 1),
  confidence    double precision not null check (confidence between 0 and 1),
  note          text,
  corroboration_ref text,
  created_at    timestamptz not null default now()
);
create index signals_asset_idx on signals (asset_id, created_at desc);

-- Immutable decision/audit records (snapshot stored as jsonb).
create table decisions (
  id          uuid primary key default gen_random_uuid(),
  asset_id    text not null references assets(id),
  asset_name  text not null,
  state       decision_state not null,
  actor       text not null,
  note        text,
  snapshot    jsonb not null,          -- score, rank, factors, fused, weights
  created_at  timestamptz not null default now()
);

-- Realtime: stream new signals + decisions to every connected console.
alter publication supabase_realtime add table signals;
alter publication supabase_realtime add table decisions;

-- Demo-friendly RLS: read for all, controlled writes.
alter table assets enable row level security;
alter table signals enable row level security;
alter table decisions enable row level security;

create policy "read assets"    on assets    for select using (true);
create policy "read signals"   on signals   for select using (true);
create policy "read decisions" on decisions for select using (true);

-- Intake (sensors/crews/citizens) can append signals.
create policy "insert signals" on signals for insert with check (true);
-- Authenticated operators commit decisions.
create policy "insert decisions" on decisions
  for insert to authenticated with check (true);
