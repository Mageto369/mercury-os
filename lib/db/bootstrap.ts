import { getSql } from '@/lib/db';

export async function bootstrapDatabase() {
  const sql = getSql();
  if (!sql) return { ok: false as const, reason: 'database_not_configured' as const };

  await sql`DO $$ BEGIN
    CREATE TYPE opportunity_state AS ENUM ('DORMANT','ACCUMULATION','IGNITION','BREAKOUT','ACCELERATION','EUPHORIA','EXHAUSTION','DISTRIBUTION');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`;

  await sql`CREATE TABLE IF NOT EXISTS securities (
    id text PRIMARY KEY, symbol text NOT NULL UNIQUE, name text, market text NOT NULL, cik text,
    active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS market_snapshots (
    id text PRIMARY KEY, security_id text NOT NULL REFERENCES securities(id), price numeric(18,8) NOT NULL,
    volume numeric(20,0), dollar_volume numeric(20,2), bid numeric(18,8), ask numeric(18,8), spread_bps integer,
    rvol numeric(10,3), float_rotation numeric(10,3), payload jsonb, observed_at timestamptz NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS market_security_time_idx ON market_snapshots(security_id, observed_at)`;
  await sql`CREATE TABLE IF NOT EXISTS social_mentions (
    id text PRIMARY KEY, security_id text NOT NULL REFERENCES securities(id), source text NOT NULL, source_ref text,
    author_ref text, sentiment integer, promotion_risk integer, engagement integer, payload jsonb, observed_at timestamptz NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS social_security_time_idx ON social_mentions(security_id, observed_at)`;
  await sql`CREATE TABLE IF NOT EXISTS filings (
    id text PRIMARY KEY, security_id text NOT NULL REFERENCES securities(id), accession_number text NOT NULL UNIQUE,
    form text NOT NULL, filed_at timestamptz NOT NULL, url text, parsed jsonb
  )`;
  await sql`CREATE TABLE IF NOT EXISTS share_structures (
    id text PRIMARY KEY, security_id text NOT NULL REFERENCES securities(id), authorized_shares numeric(22,0),
    outstanding_shares numeric(22,0), float_shares numeric(22,0), verified boolean DEFAULT false, source text, observed_at timestamptz NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS share_structure_security_time_idx ON share_structures(security_id, observed_at)`;
  await sql`CREATE TABLE IF NOT EXISTS corporate_actions (
    id text PRIMARY KEY, security_id text NOT NULL REFERENCES securities(id), type text NOT NULL, effective_date timestamptz,
    risk_score integer NOT NULL DEFAULT 0, payload jsonb, observed_at timestamptz NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS opportunities (
    id text PRIMARY KEY, security_id text NOT NULL REFERENCES securities(id), state opportunity_state NOT NULL,
    alpha integer NOT NULL, gem integer NOT NULL, wave integer NOT NULL, asymmetry integer NOT NULL, catalyst integer NOT NULL,
    social integer NOT NULL, liquidity integer NOT NULL, trap_risk integer NOT NULL, peak_risk integer NOT NULL,
    confidence integer NOT NULL, aggression integer NOT NULL, action text NOT NULL, hard_blocked boolean NOT NULL DEFAULT false,
    reasons jsonb NOT NULL, model_version text NOT NULL, observed_at timestamptz NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS opportunity_security_time_idx ON opportunities(security_id, observed_at)`;
  await sql`CREATE TABLE IF NOT EXISTS workflow_runs (
    id text PRIMARY KEY, workflow text NOT NULL, status text NOT NULL, trigger text NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, stats jsonb, error text
  )`;
  await sql`CREATE TABLE IF NOT EXISTS decision_logs (
    id text PRIMARY KEY, security_id text REFERENCES securities(id), opportunity_id text REFERENCES opportunities(id),
    decision text NOT NULL, actor text NOT NULL, model_version text, inputs jsonb, rationale jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS autonomous_actions (
    id text PRIMARY KEY, workflow_run_id text REFERENCES workflow_runs(id), job text NOT NULL, action_type text NOT NULL,
    status text NOT NULL, shadow_only boolean NOT NULL DEFAULT true, provider_requirements jsonb NOT NULL,
    provider_state jsonb NOT NULL, payload jsonb, created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS autonomous_action_job_time_idx ON autonomous_actions(job, created_at)`;
  await sql`CREATE TABLE IF NOT EXISTS system_events (
    id text PRIMARY KEY, event_key text UNIQUE, security_id text REFERENCES securities(id), category text NOT NULL,
    severity text NOT NULL, source text NOT NULL, message text NOT NULL, payload jsonb,
    observed_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS system_event_category_time_idx ON system_events(category, observed_at)`;
  await sql`CREATE INDEX IF NOT EXISTS system_event_security_time_idx ON system_events(security_id, observed_at)`;
  await sql`CREATE TABLE IF NOT EXISTS agent_heartbeats (
    id text PRIMARY KEY, agent_id text NOT NULL, status text NOT NULL, mode text NOT NULL DEFAULT 'shadow', current_mission text,
    last_success_at timestamptz, last_failure_at timestamptz, consecutive_failures integer NOT NULL DEFAULT 0,
    details jsonb, observed_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS agent_heartbeat_agent_time_idx ON agent_heartbeats(agent_id, observed_at)`;
  await sql`CREATE TABLE IF NOT EXISTS alert_deliveries (
    id text PRIMARY KEY, event_key text, severity text NOT NULL, channel text NOT NULL, destination text, status text NOT NULL,
    shadow_only boolean NOT NULL DEFAULT true, attempts integer NOT NULL DEFAULT 0, payload jsonb, error text,
    created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz
  )`;
  await sql`CREATE INDEX IF NOT EXISTS alert_delivery_status_time_idx ON alert_deliveries(status, created_at)`;
  await sql`CREATE TABLE IF NOT EXISTS replay_runs (
    id text PRIMARY KEY, model_version text NOT NULL, status text NOT NULL, lookback_days integer NOT NULL,
    opportunities_reviewed integer NOT NULL DEFAULT 0, decisions_reviewed integer NOT NULL DEFAULT 0,
    drift_detected boolean NOT NULL DEFAULT false, metrics jsonb, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
  )`;
  await sql`CREATE INDEX IF NOT EXISTS replay_run_time_idx ON replay_runs(started_at)`;

  return { ok: true as const, initializedAt: new Date().toISOString() };
}
