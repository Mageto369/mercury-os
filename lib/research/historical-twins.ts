import { getSql } from '@/lib/db';

export async function getHistoricalTwins(opportunityId: string, limit = 20) {
  const sql = getSql();
  if (!sql) return { available: false as const, reason: 'database_not_configured' as const, twins: [] };

  try {
    const rows = await sql`
      WITH target AS (
        SELECT o.*, sf.return_5d, sf.volatility_20d, sf.volume_ratio_20d, sf.range_pct, sf.trend_20d, sf.drawdown_20d
        FROM opportunities o
        LEFT JOIN setup_fingerprints sf ON sf.opportunity_id = o.id
        WHERE o.id = ${opportunityId}
        LIMIT 1
      ), scored AS (
        SELECT
          o.id, s.symbol, o.state, o.action, o.alpha, o.gem, o.wave, o.asymmetry, o.catalyst,
          o.social, o.liquidity, o.trap_risk, o.peak_risk, o.confidence, o.observed_at,
          oo.return_15m, oo.return_60m, oo.return_1d, oo.mfe_60m, oo.mae_60m,
          sf.return_5d, sf.volatility_20d, sf.volume_ratio_20d, sf.range_pct, sf.trend_20d, sf.drawdown_20d,
          sqrt(
            power(o.alpha - t.alpha, 2) +
            power(o.gem - t.gem, 2) +
            power(o.wave - t.wave, 2) +
            power(o.asymmetry - t.asymmetry, 2) +
            power(o.catalyst - t.catalyst, 2) +
            power(o.social - t.social, 2) +
            power(o.liquidity - t.liquidity, 2) +
            power(o.trap_risk - t.trap_risk, 2) +
            power(o.peak_risk - t.peak_risk, 2) +
            power(o.confidence - t.confidence, 2) +
            power(coalesce(sf.return_5d, 0) - coalesce(t.return_5d, 0), 2) * 0.5 +
            power(coalesce(sf.volatility_20d, 0) - coalesce(t.volatility_20d, 0), 2) * 0.15 +
            power(coalesce(sf.volume_ratio_20d, 0) - coalesce(t.volume_ratio_20d, 0), 2) * 8 +
            power(coalesce(sf.range_pct, 0) - coalesce(t.range_pct, 0), 2) * 0.5 +
            power(coalesce(sf.trend_20d, 0) - coalesce(t.trend_20d, 0), 2) * 0.25 +
            power(coalesce(sf.drawdown_20d, 0) - coalesce(t.drawdown_20d, 0), 2) * 0.25
          ) AS distance
        FROM opportunities o
        JOIN target t ON true
        JOIN securities s ON s.id = o.security_id
        LEFT JOIN opportunity_outcomes oo ON oo.opportunity_id = o.id
        LEFT JOIN setup_fingerprints sf ON sf.opportunity_id = o.id
        WHERE o.id <> t.id AND o.state = t.state
      )
      SELECT * FROM scored
      ORDER BY distance ASC, observed_at DESC
      LIMIT ${Math.max(1, Math.min(100, limit))}
    `;

    const matured = rows.filter((row) => row.return_60m != null);
    const returns = matured.map((row) => Number(row.return_60m)).filter(Number.isFinite);
    const hitRate60mPct = returns.length ? Number((returns.filter((value) => value > 0).length / returns.length * 100).toFixed(2)) : 0;
    const averageReturn60mPct = returns.length ? Number((returns.reduce((sum, value) => sum + value, 0) / returns.length).toFixed(2)) : 0;
    const positiveMfe = matured.map((row) => Number(row.mfe_60m ?? 0)).filter(Number.isFinite);
    const downsideMae = matured.map((row) => Number(row.mae_60m ?? 0)).filter(Number.isFinite);

    return {
      available: true as const,
      mode: 'shadow' as const,
      capitalExecutionEnabled: false as const,
      opportunityId,
      twinCount: rows.length,
      matured60m: returns.length,
      hitRate60mPct,
      averageReturn60mPct,
      averageMfe60mPct: positiveMfe.length ? Number((positiveMfe.reduce((a, b) => a + b, 0) / positiveMfe.length).toFixed(2)) : 0,
      averageMae60mPct: downsideMae.length ? Number((downsideMae.reduce((a, b) => a + b, 0) / downsideMae.length).toFixed(2)) : 0,
      similarityModel: 'opportunity-plus-market-fingerprint-v2',
      twins: rows,
      measuredAt: new Date().toISOString(),
    };
  } catch {
    return { available: false as const, reason: 'historical_replay_schema_not_initialized' as const, twins: [] };
  }
}
