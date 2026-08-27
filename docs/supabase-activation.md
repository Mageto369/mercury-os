# Supabase Activation Runbook

Mercury OS uses Supabase as a standard Postgres intelligence warehouse. Runtime code connects through `DATABASE_URL`; no Supabase-specific client is required for the current backend.

## Required project value

Set `DATABASE_URL` to the Supabase pooled Postgres connection string for the Mercury project. Keep this value server-side only.

## Schema

The canonical Supabase migration is:

`supabase/migrations/20260827_001_mercury_warehouse.sql`

It creates the Mercury warehouse entities, operational audit tables, agent heartbeat history, alert delivery history, replay history, indexes, and the `opportunity_state` enum.

The application also exposes a protected idempotent bootstrap endpoint at `POST /api/admin/bootstrap`. The SQL migration and application bootstrap intentionally describe the same warehouse shape.

## Activation order

1. Create or select the Supabase project.
2. Apply the migration.
3. Configure `DATABASE_URL` in the Mercury runtime environment.
4. Configure `CRON_SECRET`.
5. Call `POST /api/admin/bootstrap` with the bearer secret as an idempotency verification step.
6. Call `POST /api/admin/seed-validation` to seed the synthetic validation universe.
7. Call `POST /api/activation/launch` to run the 12-agent shadow proving loop.
8. Verify `/api/activation/readiness`, `/api/agents/health`, `/api/performance/shadow`, and `/api/activation/promotion`.

## Verification SQL

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'securities','market_snapshots','social_mentions','filings','share_structures',
    'corporate_actions','opportunities','workflow_runs','decision_logs','autonomous_actions',
    'system_events','agent_heartbeats','alert_deliveries','replay_runs'
  )
order by table_name;
```

Expected table count: 14.

Check the enum:

```sql
select enumlabel
from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'opportunity_state'
order by enumsortorder;
```

## Safety state

Supabase activation does not enable trading. Mercury stays in shadow mode and `capitalExecutionEnabled` remains false. Missing, stale, or incomplete data causes autonomous jobs to skip or degrade rather than manufacture live signals.

## Synthetic validation data

Rows produced by the validation seed carry synthetic metadata such as `validationDataset = mercury-v1`. They must remain distinguishable from real provider observations and must never be used as production market data.
