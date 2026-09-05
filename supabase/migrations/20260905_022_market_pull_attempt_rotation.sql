CREATE TABLE IF NOT EXISTS public.market_pull_attempts (
  security_id text NOT NULL REFERENCES public.securities(id) ON DELETE CASCADE,
  provider text NOT NULL,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_status text NOT NULL CHECK (last_status IN ('success', 'failed')),
  last_error text,
  PRIMARY KEY (security_id, provider)
);

CREATE INDEX IF NOT EXISTS market_pull_attempts_provider_time_idx
  ON public.market_pull_attempts(provider, last_attempt_at);
