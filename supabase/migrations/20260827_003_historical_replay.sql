create table if not exists historical_bars (
  id text primary key,
  security_id text not null references securities(id) on delete cascade,
  timeframe text not null default '1d',
  bar_time timestamptz not null,
  open numeric(18,8), high numeric(18,8), low numeric(18,8), close numeric(18,8) not null,
  volume numeric(20,0), vwap numeric(18,8), transactions integer,
  adjusted boolean not null default true,
  source text not null,
  payload jsonb,
  created_at timestamptz not null default now(),
  unique(security_id, timeframe, bar_time, source)
);
create index if not exists historical_bars_security_time_idx on historical_bars(security_id, timeframe, bar_time desc);

create table if not exists backfill_runs (
  id text primary key,
  provider text not null,
  status text not null,
  start_date date not null,
  end_date date not null,
  symbols_requested integer not null default 0,
  bars_received integer not null default 0,
  bars_inserted integer not null default 0,
  errors jsonb,
  shadow_only boolean not null default true,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists backfill_runs_started_idx on backfill_runs(started_at desc);

create table if not exists setup_fingerprints (
  id text primary key,
  opportunity_id text not null unique references opportunities(id) on delete cascade,
  security_id text not null references securities(id) on delete cascade,
  regime text,
  return_5d numeric(12,6),
  volatility_20d numeric(12,6),
  volume_ratio_20d numeric(12,6),
  range_pct numeric(12,6),
  trend_20d numeric(12,6),
  drawdown_20d numeric(12,6),
  features jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now()
);
create index if not exists setup_fingerprints_security_idx on setup_fingerprints(security_id, computed_at desc);