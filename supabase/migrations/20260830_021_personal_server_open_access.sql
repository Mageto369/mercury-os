-- Mercury runs as an open personal-server application. Remove database access
-- policies while preserving every capital-execution and shadow-evidence CHECK.
do $$
declare
  target record;
begin
  for target in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I disable row level security', target.tablename);
    execute format(
      'grant select, insert, update, delete on table public.%I to anon, authenticated',
      target.tablename
    );
  end loop;
end
$$;

grant usage on schema public to anon, authenticated;
grant usage, select, update on all sequences in schema public to anon, authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant usage, select, update on sequences to anon, authenticated;
