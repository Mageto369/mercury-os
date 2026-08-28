-- Simulated slippage was applied after the limit-cross check, so a marketable
-- limit order could be recorded as filling through its own limit price (a buy
-- above it, a sell below it). The engine now clamps the fill; this constraint
-- makes an impossible limit fill unrepresentable in the first place.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'paper_orders_limit_price_respected'
      and conrelid = 'public.paper_orders'::regclass
  ) then
    alter table public.paper_orders
      add constraint paper_orders_limit_price_respected check (
        order_type <> 'limit'
        or average_fill_price is null
        or requested_price is null
        or (side = 'buy' and average_fill_price <= requested_price)
        or (side = 'sell' and average_fill_price >= requested_price)
      );
  end if;
end
$$;
