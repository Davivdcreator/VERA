-- VERA — stored analyses (rebuild-cost, advisory, simulation) per asset.
-- Generic: one row per analysis run. `result` holds the full canonical JSON; the
-- headline cost numbers are denormalized into columns so the Analyses page can
-- list / filter / sort without parsing jsonb.
--
-- `asset_id` is the app-side AssetCard.id (a string loaded from generated JSON),
-- not necessarily a row in any infrastructure table — so there is deliberately
-- no foreign key here.

create table if not exists analyses (
  id             uuid primary key default gen_random_uuid(),
  asset_id       text not null,
  asset_name     text not null,
  asset_type     text,
  kind           text not null check (kind in ('rebuild_cost', 'advisory', 'simulation')),
  schema_version text not null,
  summary        text,
  result         jsonb not null,
  currency       text,
  cost_low       numeric,
  cost_expected  numeric,
  cost_high      numeric,
  confidence     text,
  model          text,
  created_at     timestamptz not null default now()
);

create index if not exists analyses_asset_id_idx   on analyses (asset_id);
create index if not exists analyses_kind_idx        on analyses (kind);
create index if not exists analyses_created_at_idx  on analyses (created_at desc);

alter table analyses enable row level security;

-- Public read: the anon client lists analyses in the app. Writes happen only via
-- the run-analysis edge function using the service-role key (which bypasses RLS),
-- so there is intentionally no public insert/update/delete policy.
create policy "public read analyses"
  on analyses for select using (true);
