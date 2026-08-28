CREATE TABLE IF NOT EXISTS open_data_observations (
  id text PRIMARY KEY,
  security_id text REFERENCES securities(id),
  provider text NOT NULL,
  dataset text NOT NULL,
  evidence_class text NOT NULL,
  confidence integer NOT NULL DEFAULT 50,
  observation_key text NOT NULL UNIQUE,
  event_date timestamptz,
  payload jsonb NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS open_data_provider_dataset_time_idx ON open_data_observations(provider, dataset, observed_at);
CREATE INDEX IF NOT EXISTS open_data_security_time_idx ON open_data_observations(security_id, observed_at);

CREATE TABLE IF NOT EXISTS provider_health (
  provider text PRIMARY KEY,
  provider_group text NOT NULL,
  configured boolean NOT NULL DEFAULT false,
  authoritative boolean NOT NULL DEFAULT false,
  last_status text NOT NULL DEFAULT 'never_run',
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  latency_ms integer,
  records_received integer NOT NULL DEFAULT 0,
  last_error text,
  metadata jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_health_group_idx ON provider_health(provider_group, updated_at);

CREATE TABLE IF NOT EXISTS sec_company_facts (
  id text PRIMARY KEY,
  security_id text NOT NULL REFERENCES securities(id),
  cik text NOT NULL,
  taxonomy text NOT NULL,
  concept text NOT NULL,
  unit text NOT NULL,
  value numeric,
  form text,
  accession_number text,
  filed_at timestamptz,
  period_start date,
  period_end date,
  fiscal_year integer,
  fiscal_period text,
  frame text,
  source text NOT NULL DEFAULT 'sec-companyfacts',
  payload jsonb,
  UNIQUE(security_id, taxonomy, concept, unit, accession_number, period_end)
);
CREATE INDEX IF NOT EXISTS sec_facts_security_concept_idx ON sec_company_facts(security_id, concept, period_end);

CREATE TABLE IF NOT EXISTS finra_regsho_daily (
  id text PRIMARY KEY,
  security_id text REFERENCES securities(id),
  symbol text NOT NULL,
  trade_date date NOT NULL,
  market_code text,
  reporting_facility text,
  total_quantity numeric(22,0),
  short_quantity numeric(22,0),
  short_exempt_quantity numeric(22,0),
  short_ratio numeric(12,6),
  source text NOT NULL DEFAULT 'finra-regsho',
  payload jsonb,
  UNIQUE(symbol, trade_date, market_code, reporting_facility)
);
CREATE INDEX IF NOT EXISTS finra_regsho_symbol_date_idx ON finra_regsho_daily(symbol, trade_date);
