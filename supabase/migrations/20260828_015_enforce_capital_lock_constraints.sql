alter table public.paper_orders
  drop constraint if exists paper_orders_capital_execution_disabled;

alter table public.paper_orders
  add constraint paper_orders_capital_execution_disabled
  check (capital_execution_enabled = false);

alter table public.portfolio_decisions
  drop constraint if exists portfolio_decisions_capital_execution_disabled;

alter table public.portfolio_decisions
  add constraint portfolio_decisions_capital_execution_disabled
  check (capital_execution_enabled = false);
