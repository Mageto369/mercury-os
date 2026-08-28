create table if not exists public.paper_accounts (
  id text primary key,
  name text not null default 'Mercury Paper Account',
  starting_capital numeric(20,4) not null check (starting_capital > 0),
  cash numeric(20,4) not null check (cash >= 0),
  realized_pnl numeric(20,4) not null default 0,
  status text not null default 'active' check (status in ('active','paused','closed')),
  capital_execution_enabled boolean not null default false check (capital_execution_enabled = false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.paper_positions (
  id text primary key,
  account_id text not null references public.paper_accounts(id) on delete cascade,
  security_id text not null references public.securities(id),
  quantity numeric(24,6) not null default 0 check (quantity >= 0),
  average_cost numeric(18,8) not null default 0 check (average_cost >= 0),
  realized_pnl numeric(20,4) not null default 0,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, security_id)
);

create index if not exists paper_positions_account_idx on public.paper_positions(account_id);
create index if not exists paper_positions_security_idx on public.paper_positions(security_id);

alter table public.paper_accounts enable row level security;
alter table public.paper_positions enable row level security;
revoke all on table public.paper_accounts from anon, authenticated;
revoke all on table public.paper_positions from anon, authenticated;

comment on table public.paper_accounts is 'Persistent virtual account state for Mercury paper/shadow execution research only.';
comment on table public.paper_positions is 'Virtual positions for Mercury paper/shadow execution research only; never broker positions.';
