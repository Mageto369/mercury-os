create table if not exists public.integration_configs (
  id text primary key,
  category text not null,
  provider text not null,
  display_name text not null,
  base_url text,
  model text,
  enabled boolean not null default false,
  capabilities jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  health_status text not null default 'unknown',
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(category, provider)
);
create index if not exists integration_configs_category_idx on public.integration_configs(category, enabled);

create table if not exists public.integration_secrets (
  id text primary key,
  integration_id text not null references public.integration_configs(id) on delete cascade,
  secret_name text not null,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  masked_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(integration_id, secret_name)
);
create index if not exists integration_secrets_integration_idx on public.integration_secrets(integration_id);

create table if not exists public.ingestion_settings (
  id text primary key,
  pipeline_key text not null unique,
  display_name text not null,
  enabled boolean not null default false,
  cadence_minutes integer not null default 60 check (cadence_minutes between 1 and 10080),
  batch_size integer not null default 100 check (batch_size between 1 and 10000),
  source_priority jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  last_status text not null default 'never_run',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monitoring_checks (
  id text primary key,
  check_key text not null unique,
  display_name text not null,
  category text not null,
  enabled boolean not null default true,
  status text not null default 'unknown',
  latency_ms integer,
  details jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_log (
  id text primary key,
  action text not null,
  target_type text not null,
  target_ref text,
  outcome text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_time_idx on public.admin_audit_log(created_at desc);

alter table public.integration_configs enable row level security;
alter table public.integration_secrets enable row level security;
alter table public.ingestion_settings enable row level security;
alter table public.monitoring_checks enable row level security;
alter table public.admin_audit_log enable row level security;
revoke all on public.integration_configs, public.integration_secrets, public.ingestion_settings, public.monitoring_checks, public.admin_audit_log from anon, authenticated;
