import { getSql } from '@/lib/db';

export async function bootstrapIntelligenceLab() {
  const sql = getSql();
  if (!sql) return { ok: false as const, reason: 'database_not_configured' as const };

  await sql`CREATE TABLE IF NOT EXISTS signal_observations (
    id text PRIMARY KEY, security_id text NOT NULL REFERENCES securities(id), opportunity_id text REFERENCES opportunities(id),
    family text NOT NULL, signal_key text NOT NULL, value numeric(18,6), normalized_score integer,
    direction text NOT NULL DEFAULT 'neutral', source text, confidence integer, payload jsonb, observed_at timestamptz NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS signal_security_time_idx ON signal_observations(security_id, observed_at)`;
  await sql`CREATE INDEX IF NOT EXISTS signal_family_time_idx ON signal_observations(family, observed_at)`;

  await sql`CREATE TABLE IF NOT EXISTS opportunity_outcomes (
    id text PRIMARY KEY, opportunity_id text NOT NULL UNIQUE REFERENCES opportunities(id), security_id text NOT NULL REFERENCES securities(id),
    entry_price numeric(18,8), return_15m numeric(12,4), return_60m numeric(12,4), return_1d numeric(12,4),
    mfe_60m numeric(12,4), mae_60m numeric(12,4), mfe_1d numeric(12,4), mae_1d numeric(12,4),
    max_price_1d numeric(18,8), min_price_1d numeric(18,8), matured_15m boolean NOT NULL DEFAULT false,
    matured_60m boolean NOT NULL DEFAULT false, matured_1d boolean NOT NULL DEFAULT false, payload jsonb,
    evaluated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS outcome_security_time_idx ON opportunity_outcomes(security_id, evaluated_at)`;

  await sql`CREATE TABLE IF NOT EXISTS model_registry (
    id text PRIMARY KEY, model_key text NOT NULL, version text NOT NULL, role text NOT NULL DEFAULT 'challenger',
    status text NOT NULL DEFAULT 'shadow', strategy text NOT NULL, regime text, feature_manifest jsonb NOT NULL,
    training_window jsonb, validation_metrics jsonb, promotion_metrics jsonb, parent_version text,
    created_at timestamptz NOT NULL DEFAULT now(), promoted_at timestamptz, retired_at timestamptz,
    UNIQUE(model_key, version)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS model_registry_status_idx ON model_registry(status, role)`;

  await sql`CREATE TABLE IF NOT EXISTS experiment_runs (
    id text PRIMARY KEY, model_key text NOT NULL, model_version text NOT NULL, experiment_type text NOT NULL,
    status text NOT NULL, regime text, sample_size integer NOT NULL DEFAULT 0, metrics jsonb, leakage_checks jsonb,
    cost_assumptions jsonb, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
  )`;
  await sql`CREATE INDEX IF NOT EXISTS experiment_model_time_idx ON experiment_runs(model_key, started_at)`;

  await sql`CREATE TABLE IF NOT EXISTS source_reputation (
    id text PRIMARY KEY, source_type text NOT NULL, source_ref text NOT NULL, observations integer NOT NULL DEFAULT 0,
    lead_rate numeric(8,4) NOT NULL DEFAULT 0, late_rate numeric(8,4) NOT NULL DEFAULT 0,
    promotion_rate numeric(8,4) NOT NULL DEFAULT 0, positive_60m_rate numeric(8,4) NOT NULL DEFAULT 0,
    median_lead_minutes numeric(10,2), reliability_score integer NOT NULL DEFAULT 50, payload jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(source_type, source_ref)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS entity_relationships (
    id text PRIMARY KEY, security_id text REFERENCES securities(id), entity_type text NOT NULL, entity_ref text NOT NULL,
    relationship_type text NOT NULL, related_entity_type text, related_entity_ref text, risk_score integer NOT NULL DEFAULT 0,
    confidence integer NOT NULL DEFAULT 50, source text, evidence jsonb, observed_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS entity_security_time_idx ON entity_relationships(security_id, observed_at)`;
  await sql`CREATE INDEX IF NOT EXISTS entity_ref_idx ON entity_relationships(entity_type, entity_ref)`;

  await sql`CREATE TABLE IF NOT EXISTS shadow_portfolio_snapshots (
    id text PRIMARY KEY, gross_exposure numeric(18,4) NOT NULL DEFAULT 0, net_exposure numeric(18,4) NOT NULL DEFAULT 0,
    expected_shortfall numeric(12,4), drawdown_pct numeric(12,4), liquidity_at_risk numeric(18,4),
    concentration_score integer, regime text, positions jsonb NOT NULL, limits jsonb NOT NULL,
    observed_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS shadow_portfolio_time_idx ON shadow_portfolio_snapshots(observed_at)`;

  await sql`CREATE TABLE IF NOT EXISTS risk_incidents (
    id text PRIMARY KEY, security_id text REFERENCES securities(id), incident_type text NOT NULL, severity text NOT NULL,
    trigger_value jsonb, action_taken text NOT NULL, resolved boolean NOT NULL DEFAULT false, resolution jsonb,
    observed_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
  )`;
  await sql`CREATE INDEX IF NOT EXISTS risk_incident_time_idx ON risk_incidents(severity, observed_at)`;

  return { ok: true as const, initializedAt: new Date().toISOString() };
}
