CREATE TABLE IF NOT EXISTS structure_intelligence (
  id text PRIMARY KEY,
  security_id text NOT NULL REFERENCES securities(id),
  effective_float numeric(24,6),
  outstanding_shares numeric(24,6),
  authorized_shares numeric(24,6),
  reserved_dilution_shares numeric(24,6),
  dilution_overhang_pct numeric(12,4),
  dilution_risk integer NOT NULL DEFAULT 0,
  float_confidence integer NOT NULL DEFAULT 0,
  risk_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS structure_intelligence_security_time_idx ON structure_intelligence(security_id, observed_at);

CREATE TABLE IF NOT EXISTS ownership_intelligence (
  id text PRIMARY KEY,
  security_id text NOT NULL REFERENCES securities(id),
  insider_net_shares numeric(24,6) NOT NULL DEFAULT 0,
  insider_buy_value numeric(24,2) NOT NULL DEFAULT 0,
  insider_sell_value numeric(24,2) NOT NULL DEFAULT 0,
  institutional_shares numeric(24,6) NOT NULL DEFAULT 0,
  ownership_alignment_score integer NOT NULL DEFAULT 50,
  confidence integer NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ownership_intelligence_security_time_idx ON ownership_intelligence(security_id, observed_at);

CREATE TABLE IF NOT EXISTS catalyst_intelligence (
  id text PRIMARY KEY,
  security_id text NOT NULL REFERENCES securities(id),
  catalyst_type text NOT NULL,
  materiality integer NOT NULL DEFAULT 0,
  novelty integer NOT NULL DEFAULT 0,
  credibility integer NOT NULL DEFAULT 0,
  half_life_minutes integer,
  source_event_id text,
  source text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS catalyst_intelligence_security_time_idx ON catalyst_intelligence(security_id, observed_at);

CREATE TABLE IF NOT EXISTS opportunity_dynamics (
  id text PRIMARY KEY,
  opportunity_id text NOT NULL UNIQUE REFERENCES opportunities(id),
  security_id text NOT NULL REFERENCES securities(id),
  half_life_minutes integer,
  peak_probability integer NOT NULL DEFAULT 0,
  crowding_score integer NOT NULL DEFAULT 0,
  liquidity_decay_score integer NOT NULL DEFAULT 0,
  structural_risk_score integer NOT NULL DEFAULT 0,
  ownership_alignment_score integer NOT NULL DEFAULT 50,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS opportunity_dynamics_security_time_idx ON opportunity_dynamics(security_id, computed_at);

CREATE TABLE IF NOT EXISTS signal_performance (
  id text PRIMARY KEY,
  signal_key text NOT NULL,
  family text NOT NULL,
  regime text NOT NULL DEFAULT 'all',
  observations integer NOT NULL DEFAULT 0,
  hit_rate numeric(12,6),
  average_return numeric(18,8),
  marginal_expectancy numeric(18,8),
  correlation_to_alpha numeric(18,8),
  decay_minutes integer,
  status text NOT NULL DEFAULT 'shadow',
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(signal_key, regime)
);
CREATE INDEX IF NOT EXISTS signal_performance_status_idx ON signal_performance(status, evaluated_at);
