-- VERA — dynamic state for full infrastructure assets.
-- Raw infrastructure rows stay stable; live FIRMS/Telegram damage state lives here.

create table infrastructure_asset_state (
  asset_id    uuid primary key references infrastructure(id) on delete cascade,
  status      infra_status not null default 'operational',
  confidence  double precision,
  score       double precision,
  evidence    jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

create index infrastructure_asset_state_status_idx on infrastructure_asset_state (status);
create index infrastructure_asset_state_updated_at_idx on infrastructure_asset_state (updated_at desc);

alter table infrastructure_asset_state enable row level security;

create policy "public read infrastructure_asset_state"
  on infrastructure_asset_state for select using (true);

