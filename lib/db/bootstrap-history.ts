import { getSql } from '@/lib/db';

export async function bootstrapHistoricalReplay() {
  const sql = getSql();
  if (!sql) return { ok: false as const, reason: 'database_not_configured' as const };

  await sql`CREATE TABLE IF NOT EXISTS historical_bars (
    id text PRIMARY KEY,
    security_id text NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
    timeframe text NOT NULL DEFAULT '1d',
    bar_time timestamptz NOT NULL,
    open numeric(18,8), high numeric(18,8), low numeric(18,8), close numeric(18,8) NOT NULL,
    volume numeric(20,0), vwap numeric(18,8), transactions integer,
    adjusted boolean NOT NULL DEFAULT true,
    source text NOT NULL,
    payload jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(security_id, timeframe, bar_time, source)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS historical_bars_security_time_idx ON historical_bars(security_id, timeframe, bar_time DESC)`;

  await sql`CREATE TABLE IF NOT EXISTS backfill_runs (
    id text PRIMARY KEY,
    provider text NOT NULL,
    status text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    symbols_requested integer NOT NULL DEFAULT 0,
    bars_received integer NOT NULL DEFAULT 0,
    bars_inserted integer NOT NULL DEFAULT 0,
    errors jsonb,
    shadow_only boolean NOT NULL DEFAULT true,
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
  )`;
  await sql`CREATE INDEX IF NOT EXISTS backfill_runs_started_idx ON backfill_runs(started_at DESC)`;

  await sql`CREATE TABLE IF NOT EXISTS setup_fingerprints (
    id text PRIMARY KEY,
    opportunity_id text NOT NULL UNIQUE REFERENCES opportunities(id) ON DELETE CASCADE,
    security_id text NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
    regime text,
    return_5d numeric(12,6),
    volatility_20d numeric(12,6),
    volume_ratio_20d numeric(12,6),
    range_pct numeric(12,6),
    trend_20d numeric(12,6),
    drawdown_20d numeric(12,6),
    features jsonb NOT NULL DEFAULT '{}'::jsonb,
    computed_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS setup_fingerprints_security_idx ON setup_fingerprints(security_id, computed_at DESC)`;

  return { ok: true as const, initializedAt: new Date().toISOString() };
}
