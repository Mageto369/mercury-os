alter table public.paper_orders add column if not exists order_type text not null default 'market';
alter table public.paper_orders add column if not exists time_in_force text not null default 'day';
alter table public.paper_orders add column if not exists fee_amount numeric(18,6) not null default 0;
alter table public.paper_orders add column if not exists cancelled_at timestamptz;
alter table public.paper_orders add column if not exists updated_at timestamptz not null default now();

create table if not exists public.paper_order_events (
  id text primary key,
  order_id text not null references public.paper_orders(id) on delete cascade,
  event_type text not null,
  status text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists paper_order_events_order_idx on public.paper_order_events(order_id,created_at);

create table if not exists public.paper_trade_journal (
  id text primary key,
  order_id text references public.paper_orders(id) on delete set null,
  security_id text not null references public.securities(id),
  opportunity_id text references public.opportunities(id),
  thesis text,
  catalyst text,
  risk_notes text,
  context jsonb not null default '{}'::jsonb,
  outcome jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists paper_trade_journal_security_idx on public.paper_trade_journal(security_id,created_at);

create table if not exists public.paper_account_snapshots (
  id text primary key,
  account_id text not null references public.paper_accounts(id) on delete cascade,
  cash numeric(20,4) not null,
  market_value numeric(20,4) not null,
  equity numeric(20,4) not null,
  realized_pnl numeric(20,4) not null,
  unrealized_pnl numeric(20,4) not null,
  gross_exposure numeric(20,4) not null,
  position_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);
create index if not exists paper_account_snapshots_time_idx on public.paper_account_snapshots(account_id,observed_at);

alter table public.paper_order_events enable row level security;
alter table public.paper_trade_journal enable row level security;
alter table public.paper_account_snapshots enable row level security;
revoke all on table public.paper_order_events from anon, authenticated;
revoke all on table public.paper_trade_journal from anon, authenticated;
revoke all on table public.paper_account_snapshots from anon, authenticated;
