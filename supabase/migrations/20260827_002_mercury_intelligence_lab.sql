create table if not exists public.signal_observations (
  id text primary key,
  security_id text not null references public.securities(id),
  opportunity_id text references public.opportunities(id),
  family text not null,
  signal_key text not null,
  value numeric(18,6),
  normalized_score integer,
  direction text not null default 'neutral',
  source text,
  confidence integer,
  payload jsonb,
  observed_at timestamptz not null
);
create index if not exists signal_security_time_idx on public.signal_observations(security_id, observed_at);
create index if not exists signal_family_time_idx on public.signal_observations(family, observed_at);

create table if not exists public.opportunity_outcomes (
  id text primary key,
  opportunity_id text not null unique references public.opportunities(id),
  security_id text not null references public.securities(id),
  entry_price numeric(18,8),
  return_15m numeric(12,4),
  return_60m numeric(12,4),
  return_1d numeric(12,4),
  mfe_60m numeric(12,4),
  mae_60m numeric(12,4),
  mfe_1d numeric(12,4),
  mae_1d numeric(12,4),
  max_price_1d numeric(18,8),
  min_price_1d numeric(18,8),
  matured_15m boolean not null default false,
  matured_60m boolean not null default false,
  matured_1d boolean not null default false,
  payload jsonb,
  evaluated_at timestamptz not null default now()
);
create index if not exists outcome_security_time_idx on public.opportunity_outcomes(security_id, evaluated_at);

create table if not exists public.model_registry (
  id text primary key,
  model_key text not null,
  version text not null,
  role text not null default 'challenger',
  status text not null default 'shadow',
  strategy text not null,
  regime text,
  feature_manifest jsonb not null,
  training_window jsonb,
  validation_metrics jsonb,
  promotion_metrics jsonb,
  parent_version text,
  created_at timestamptz not null default now(),
  promoted_at timestamptz,
  retired_at timestamptz,
  unique(model_key, version)
);
create index if not exists model_registry_status_idx on public.model_registry(status, role);

create table if not exists public.experiment_runs (
  id text primary key,
  model_key text not null,
  model_version text not null,
  experiment_type text not null,
  status text not null,
  regime text,
  sample_size integer not null default 0,
  metrics jsonb,
  leakage_checks jsonb,
  cost_assumptions jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists experiment_model_time_idx on public.experiment_runs(model_key, started_at);

create table if not exists public.source_reputation (
  id text primary key,
  source_type text not null,
  source_ref text not null,
  observations integer not null default 0,
  lead_rate numeric(8,4) not null default 0,
  late_rate numeric(8,4) not null default 0,
  promotion_rate numeric(8,4) not null default 0,
  positive_60m_rate numeric(8,4) not null default 0,
  median_lead_minutes numeric(10,2),
  reliability_score integer not null default 50,
  payload jsonb,
  updated_at timestamptz not null default now(),
  unique(source_type, source_ref)
);

create table if not exists public.entity_relationships (
  id text primary key,
  security_id text references public.securities(id),
  entity_type text not null,
  entity_ref text not null,
  relationship_type text not null,
  related_entity_type text,
  related_entity_ref text,
  risk_score integer not null default 0,
  confidence integer not null default 50,
  source text,
  evidence jsonb,
  observed_at timestamptz not null default now()
);
create index if not exists entity_security_time_idx on public.entity_relationships(security_id, observed_at);
create index if not exists entity_ref_idx on public.entity_relationships(entity_type, entity_ref);

create table if not exists public.shadow_portfolio_snapshots (
  id text primary key,
  gross_exposure numeric(18,4) not null default 0,
  net_exposure numeric(18,4) not null default 0,
  expected_shortfall numeric(12,4),
  drawdown_pct numeric(12,4),
  liquidity_at_risk numeric(18,4),
  concentration_score integer,
  regime text,
  positions jsonb not null,
  limits jsonb not null,
  observed_at timestamptz not null default now()
);
create index if not exists shadow_portfolio_time_idx on public.shadow_portfolio_snapshots(observed_at);

create table if not exists public.risk_incidents (
  id text primary key,
  security_id text references public.securities(id),
  incident_type text not null,
  severity text not null,
  trigger_value jsonb,
  action_taken text not null,
  resolved boolean not null default false,
  resolution jsonb,
  observed_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists risk_incident_time_idx on public.risk_incidents(severity, observed_at);

comment on table public.opportunity_outcomes is 'Forward-return and excursion evidence for Mercury shadow opportunities.';
comment on table public.model_registry is 'Champion/challenger model governance. No model row grants broker authority.';
comment on table public.shadow_portfolio_snapshots is 'Research-only portfolio simulation state. Capital execution remains disabled.';
