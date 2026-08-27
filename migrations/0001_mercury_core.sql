DO $$ BEGIN
  CREATE TYPE opportunity_state AS ENUM ('DORMANT','ACCUMULATION','IGNITION','BREAKOUT','ACCELERATION','EUPHORIA','EXHAUSTION','DISTRIBUTION');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS securities (
  id text PRIMARY KEY,
  symbol text NOT NULL UNIQUE,
  name text,
  market text NOT NULL,
  cik text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id text PRIMARY KEY,
  security_id text NOT NULL REFERENCES securities(id),
  price numeric(18,8) NOT NULL,
  volume numeric(20,0),
  dollar_volume numeric(20,2),
  bid numeric(18,8),
  ask numeric(18,8),
  spread_bps integer,
  rvol numeric(10,3),
  float_rotation numeric(10,3),
  payload jsonb,
  observed_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS market_security_time_idx ON market_snapshots(security_id, observed_at);

CREATE TABLE IF NOT EXISTS social_mentions (
  id text PRIMARY KEY,
  security_id text NOT NULL REFERENCES securities(id),
  source text NOT NULL,
  source_ref text,
  author_ref text,
  sentiment integer,
  promotion_risk integer,
  engagement integer,
  payload jsonb,
  observed_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS social_security_time_idx ON social_mentions(security_id, observed_at);

CREATE TABLE IF NOT EXISTS filings (
  id text PRIMARY KEY,
  security_id text NOT NULL REFERENCES securities(id),
  accession_number text NOT NULL UNIQUE,
  form text NOT NULL,
  filed_at timestamptz NOT NULL,
  url text,
  parsed jsonb
);

CREATE TABLE IF NOT EXISTS share_structures (
  id text PRIMARY KEY,
  security_id text NOT NULL REFERENCES securities(id),
  authorized_shares numeric(22,0),
  outstanding_shares numeric(22,0),
  float_shares numeric(22,0),
  verified boolean DEFAULT false,
  source text,
  observed_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS share_structure_security_time_idx ON share_structures(security_id, observed_at);

CREATE TABLE IF NOT EXISTS corporate_actions (
  id text PRIMARY KEY,
  security_id text NOT NULL REFERENCES securities(id),
  type text NOT NULL,
  effective_date timestamptz,
  risk_score integer NOT NULL DEFAULT 0,
  payload jsonb,
  observed_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS opportunities (
  id text PRIMARY KEY,
  security_id text NOT NULL REFERENCES securities(id),
  state opportunity_state NOT NULL,
  alpha integer NOT NULL,
  gem integer NOT NULL,
  wave integer NOT NULL,
  asymmetry integer NOT NULL,
  catalyst integer NOT NULL,
  social integer NOT NULL,
  liquidity integer NOT NULL,
  trap_risk integer NOT NULL,
  peak_risk integer NOT NULL,
  confidence integer NOT NULL,
  aggression integer NOT NULL,
  action text NOT NULL,
  hard_blocked boolean NOT NULL DEFAULT false,
  reasons jsonb NOT NULL,
  model_version text NOT NULL,
  observed_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS opportunity_security_time_idx ON opportunities(security_id, observed_at);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id text PRIMARY KEY,
  workflow text NOT NULL,
  status text NOT NULL,
  trigger text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  stats jsonb,
  error text
);

CREATE TABLE IF NOT EXISTS decision_logs (
  id text PRIMARY KEY,
  security_id text REFERENCES securities(id),
  opportunity_id text REFERENCES opportunities(id),
  decision text NOT NULL,
  actor text NOT NULL,
  model_version text,
  inputs jsonb,
  rationale jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS autonomous_actions (
  id text PRIMARY KEY,
  workflow_run_id text REFERENCES workflow_runs(id),
  job text NOT NULL,
  action_type text NOT NULL,
  status text NOT NULL,
  shadow_only boolean NOT NULL DEFAULT true,
  provider_requirements jsonb NOT NULL,
  provider_state jsonb NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS autonomous_action_job_time_idx ON autonomous_actions(job, created_at);

CREATE TABLE IF NOT EXISTS system_events (
  id text PRIMARY KEY,
  event_key text UNIQUE,
  security_id text REFERENCES securities(id),
  category text NOT NULL,
  severity text NOT NULL,
  source text NOT NULL,
  message text NOT NULL,
  payload jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE system_events ADD COLUMN IF NOT EXISTS event_key text;
ALTER TABLE system_events ADD COLUMN IF NOT EXISTS security_id text REFERENCES securities(id);
CREATE UNIQUE INDEX IF NOT EXISTS system_event_key_idx ON system_events(event_key) WHERE event_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS system_event_category_time_idx ON system_events(category, observed_at);
CREATE INDEX IF NOT EXISTS system_event_security_time_idx ON system_events(security_id, observed_at);
