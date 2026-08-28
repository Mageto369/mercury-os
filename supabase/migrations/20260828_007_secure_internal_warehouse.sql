-- Mercury OS is currently an internal server-side intelligence warehouse.
-- Keep all public-schema tables inaccessible to anon/authenticated Data API roles.
-- Server-side Postgres connections continue to operate with their database role.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', r.tablename);
  END LOOP;
END $$;

COMMENT ON SCHEMA public IS 'Mercury OS internal intelligence warehouse. RLS enabled; anon/authenticated access revoked. Capital execution remains disabled.';
