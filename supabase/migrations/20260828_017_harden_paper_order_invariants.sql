alter table public.paper_orders
  add constraint paper_orders_requested_qty_positive check (requested_qty > 0),
  add constraint paper_orders_filled_qty_bounds check (filled_qty >= 0 and filled_qty <= requested_qty),
  add constraint paper_orders_side_check check (side in ('buy','sell')),
  add constraint paper_orders_order_type_check check (order_type in ('market','limit')),
  add constraint paper_orders_time_in_force_check check (time_in_force in ('day','gtc')),
  add constraint paper_orders_fee_nonnegative check (fee_amount >= 0),
  add constraint paper_orders_requested_price_positive check (requested_price is null or requested_price > 0),
  add constraint paper_orders_fill_price_positive check (average_fill_price is null or average_fill_price > 0),
  add constraint paper_orders_latency_nonnegative check (latency_ms is null or latency_ms >= 0),
  add constraint paper_orders_status_check check (status in ('simulated','open','pending','partially_filled','filled','rejected','cancelled'));
