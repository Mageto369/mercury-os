do $$ begin
  create type public.opportunity_state as enum ('DORMANT','ACCUMULATION','IGNITION','BREAKOUT','ACCELERATION','EUPHORIA','EXHAUSTION','DISTRIBUTION');
exception when duplicate_object then null; end $$;

create table if not exists public.securities (
  id text primary key,
  symbol text not null unique,
  name text,
  market text not null,
  cik text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_snapshots (
  id text primary key,
  security_id text not null references public.securities(id),
  price numeric(18,8) not null,
  volume numeric(20,0),
  dollar_volume numeric(20,2),
  bid numeric(18,8),
  ask numeric(18,8),
  spread_bps integer,
  rvol numeric(10,3),
  float_rotation numeric(10,3),
  payload jsonb,
  observed_at timestamptz not null
);
create index if not exists market_security_time_idx on public.market_snapshots(security_id, observed_at);

create table if not exists public.social_mentions (
  id text primary key,
  security_id text not null references public.securities(id),
  source text not null,
  source_ref text,
  author_ref text,
  sentiment integer,
  promotion_risk integer,
  engagement integer,
  payload jsonb,
  observed_at timestamptz not null
);
create index if not exists social_security_time_idx on public.social_mentions(security_id, observed_at);

create table if not exists public.filings (
  id text primary key,
  security_id text not null references public.securities(id),
  accession_number text not null unique,
  form text not null,
  filed_at timestamptz not null,
  url text,
  parsed jsonb
);

create table if not exists public.share_structures (
  id text primary key,
  security_id text not null references public.securities(id),
  authorized_shares numeric(22,0),
  outstanding_shares numeric(22,0),
  float_shares numeric(22,0),
  verified boolean default false,
  source text,
  observed_at timestamptz not null
);
create index if not exists share_structure_security_time_idx on public.share_structures(security_id, observed_at);

create table if not exists public.corporate_actions (
  id text primary key,
  security_id text not null references public.securities(id),
  type text not null,
  effective_date timestamptz,
  risk_score integer not null default 0,
  payload jsonb,
  observed_at timestamptz not null
);

create table if not exists public.opportunities (
  id text primary key,
  security_id text not null references public.securities(id),
  state public.opportunity_state not null,
  alpha integer not null,
  gem integer not null,
  wave integer not null,
  asymmetry integer not null,
  catalyst integer not null,
  social integer not null,
  liquidity integer not null,
  trap_risk integer not null,
  peak_risk integer not null,
  confidence integer not null,
  aggression integer not null,
  action text not null,
  hard_blocked boolean not null default false,
  reasons jsonb not null,
  model_version text not null,
  observed_at timestamptz not null
);
create index if not exists opportunity_security_time_idx on public.opportunities(security_id, observed_at);

create table if not exists public.workflow_runs (
  id text primary key,
  workflow text not null,
  status text not null,
  trigger text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  stats jsonb,
  error text
);

create table if not exists public.decision_logs (
  id text primary key,
  security_id text references public.securities(id),
  opportunity_id text references public.opportunities(id),
  decision text not null,
  actor text not null,
  model_version text,
  inputs jsonb,
  rationale jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.autonomous_actions (
  id text primary key,
  workflow_run_id text references public.workflow_runs(id),
  job text not null,
  action_type text not null,
  status text not null,
  shadow_only boolean not null default true,
  provider_requirements jsonb not null,
  provider_state jsonb not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists autonomous_action_job_time_idx on public.autonomous_actions(job, created_at);

create table if not exists public.system_events (
  id text primary key,
  event_key text unique,
  security_id text references public.securities(id),
  category text not null,
  severity text not null,
  source text not null,
  message text not null,
  payload jsonb,
  observed_at timestamptz not null default now()
);
create index if not exists system_event_category_time_idx on public.system_events(category, observed_at);
create index if not exists system_event_security_time_idx on public.system_events(security_id, observed_at);

create table if not exists public.agent_heartbeats (
  id text primary key,
  agent_id text not null,
  status text not null,
  mode text not null default 'shadow',
  current_mission text,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  consecutive_failures integer not null default 0,
  details jsonb,
  observed_at timestamptz not null default now()
);
create index if not exists agent_heartbeat_agent_time_idx on public.agent_heartbeats(agent_id, observed_at);

create table if not exists public.alert_deliveries (
  id text primary key,
  event_key text,
  severity text not null,
  channel text not null,
  destination text,
  status text not null,
  shadow_only boolean not null default true,
  attempts integer not null default 0,
  payload jsonb,
  error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists alert_delivery_status_time_idx on public.alert_deliveries(status, created_at);

create table if not exists public.replay_runs (
  id text primary key,
  model_version text not null,
  status text not null,
  lookback_days integer not null,
  opportunities_reviewed integer not null default 0,
  decisions_reviewed integer not null default 0,
  drift_detected boolean not null default false,
  metrics jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists replay_run_time_idx on public.replay_runs(started_at);

comment on schema public is 'Mercury OS intelligence warehouse. Capital execution remains disabled in shadow mode.';
