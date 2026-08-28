create index if not exists paper_trade_journal_order_idx
  on public.paper_trade_journal(order_id);

create index if not exists paper_trade_journal_opportunity_idx
  on public.paper_trade_journal(opportunity_id);
