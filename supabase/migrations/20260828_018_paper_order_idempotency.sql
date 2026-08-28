alter table public.paper_orders
  add column if not exists idempotency_key text,
  add column if not exists request_fingerprint text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'paper_orders_idempotency_fields_paired'
      and conrelid = 'public.paper_orders'::regclass
  ) then
    alter table public.paper_orders
      add constraint paper_orders_idempotency_fields_paired
      check ((idempotency_key is null) = (request_fingerprint is null));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'paper_orders_idempotency_key_format'
      and conrelid = 'public.paper_orders'::regclass
  ) then
    alter table public.paper_orders
      add constraint paper_orders_idempotency_key_format
      check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'paper_orders_request_fingerprint_format'
      and conrelid = 'public.paper_orders'::regclass
  ) then
    alter table public.paper_orders
      add constraint paper_orders_request_fingerprint_format
      check (request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{64}$');
  end if;
end
$$;

create unique index if not exists paper_orders_idempotency_key_unique
  on public.paper_orders(idempotency_key)
  where idempotency_key is not null;
