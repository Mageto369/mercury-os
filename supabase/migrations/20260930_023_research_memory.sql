create table if not exists public.research_decisions (
  id text primary key,
  session_date date not null,
  symbol text not null,
  card_version text not null,
  card_hash text not null,
  evidence_class text not null,
  price numeric(18,8),
  return_5 numeric(12,4),
  relative_volume numeric(12,4),
  extension_20 numeric(12,4),
  close_location numeric(12,4),
  rise_score numeric(8,2),
  room boolean not null default false,
  blocks_room boolean not null default false,
  social_hype numeric(8,2),
  catalyst_score numeric(8,2),
  rank integer,
  eligible boolean not null default false,
  expectancy_pct numeric(12,4),
  projected_gain_pct numeric(12,4),
  projected_low_pct numeric(12,4),
  projected_high_pct numeric(12,4),
  edge numeric(12,4),
  win_rate_pct numeric(12,4),
  payoff numeric(12,4),
  adverse_pct numeric(12,4),
  favorable_pct numeric(12,4),
  target_first_pct numeric(12,4),
  analogs integer,
  shadow_action text,
  gate_pass boolean not null default false,
  regime text,
  payload jsonb,
  created_at timestamptz not null default now(),
  observed_at timestamptz not null default now(),
  unique (session_date, symbol, card_version)
);
create index if not exists research_decision_session_idx on public.research_decisions(session_date, symbol);

create table if not exists public.research_labels (
  id text primary key,
  decision_id text not null unique references public.research_decisions(id),
  symbol text not null,
  session_date date not null,
  horizon_sessions integer not null default 5,
  forward_5_pct numeric(12,4),
  adverse_pct numeric(12,4),
  favorable_pct numeric(12,4),
  target_first boolean,
  entry_close numeric(18,8),
  exit_close numeric(18,8),
  bar_dates jsonb,
  evidence_class text not null default 'delayed-reference',
  source text not null default 'nasdaq-delayed',
  labeled_at timestamptz not null default now()
);
create index if not exists research_label_session_idx on public.research_labels(session_date, symbol);

comment on table public.research_decisions is 'Shadow research decisions for the analog rank. A row does not submit an order or unlock capital.';
comment on table public.research_labels is 'Realized 5-session paths from delayed daily bars. Delayed-reference evidence, not live proof.';
