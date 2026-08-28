import { getSql } from '@/lib/db';

export async function bootstrapOpenSourceIntelligence() {
  const sql = getSql();
  if (!sql) return { ok: false as const, reason: 'database_not_configured' as const };

  await sql`CREATE TABLE IF NOT EXISTS security_identities (
    id text PRIMARY KEY, security_id text REFERENCES securities(id), cik text, ticker text, issuer_name text,
    exchange text, cusip text, isin text, figi text, source text NOT NULL, evidence_class text NOT NULL,
    valid_from timestamptz, valid_to timestamptz, payload jsonb, observed_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS security_identity_cik_idx ON security_identities(cik)`;
  await sql`CREATE INDEX IF NOT EXISTS security_identity_ticker_idx ON security_identities(ticker)`;

  await sql`CREATE TABLE IF NOT EXISTS insider_transactions (
    id text PRIMARY KEY, security_id text REFERENCES securities(id), cik text, accession_number text,
    owner_name text, owner_role text, transaction_code text, transaction_date date, shares numeric(24,6),
    price numeric(18,8), ownership_after numeric(24,6), derivative boolean DEFAULT false,
    source text NOT NULL DEFAULT 'sec-edgar', payload jsonb, observed_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS insider_security_date_idx ON insider_transactions(security_id, transaction_date)`;

  await sql`CREATE TABLE IF NOT EXISTS institutional_holdings (
    id text PRIMARY KEY, security_id text REFERENCES securities(id), manager_cik text, manager_name text,
    report_date date, accession_number text, shares numeric(24,6), value_usd numeric(24,2),
    source text NOT NULL DEFAULT 'sec-edgar', payload jsonb, observed_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS institutional_security_date_idx ON institutional_holdings(security_id, report_date)`;

  await sql`CREATE TABLE IF NOT EXISTS financing_events (
    id text PRIMARY KEY, security_id text REFERENCES securities(id), accession_number text, form text,
    event_type text NOT NULL, announced_at timestamptz, amount_usd numeric(24,2), shares numeric(24,6),
    exercise_price numeric(18,8), confidence numeric(6,5), source text NOT NULL DEFAULT 'sec-edgar',
    payload jsonb, observed_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS financing_security_time_idx ON financing_events(security_id, announced_at)`;

  await sql`CREATE TABLE IF NOT EXISTS market_sessions (
    id text PRIMARY KEY, exchange text NOT NULL, session_date date NOT NULL, open_at timestamptz,
    close_at timestamptz, early_close boolean NOT NULL DEFAULT false, source text NOT NULL,
    payload jsonb, UNIQUE(exchange, session_date)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS macro_observations (
    id text PRIMARY KEY, series_id text NOT NULL, observation_date date NOT NULL, vintage_date date NOT NULL,
    value numeric(24,8), source text NOT NULL DEFAULT 'fred-alfred', authoritative boolean NOT NULL DEFAULT true,
    payload jsonb, UNIQUE(series_id, observation_date, vintage_date)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS macro_series_vintage_idx ON macro_observations(series_id, vintage_date, observation_date)`;

  await sql`CREATE TABLE IF NOT EXISTS research_experiments (
    id text PRIMARY KEY, engine text NOT NULL, model_version text, hypothesis text NOT NULL, dataset_hash text,
    train_window jsonb, test_window jsonb, parameters jsonb, metrics jsonb, leakage_checks jsonb,
    status text NOT NULL, shadow_only boolean NOT NULL DEFAULT true, started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
  )`;

  await sql`CREATE TABLE IF NOT EXISTS proof_metrics (
    id text PRIMARY KEY, scope text NOT NULL, model_version text, as_of timestamptz NOT NULL,
    expectancy numeric(18,8), sharpe numeric(18,8), sortino numeric(18,8), calmar numeric(18,8),
    max_drawdown numeric(18,8), expected_shortfall numeric(18,8), profit_factor numeric(18,8),
    win_rate numeric(18,8), monte_carlo_ruin_probability numeric(18,8), metrics jsonb,
    source_engine text NOT NULL, shadow_only boolean NOT NULL DEFAULT true
  )`;

  return { ok: true as const, initializedAt: new Date().toISOString() };
}
