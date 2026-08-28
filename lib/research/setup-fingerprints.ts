import { randomUUID } from 'node:crypto';
import { getSql } from '@/lib/db';
import { bootstrapHistoricalReplay } from '@/lib/db/bootstrap-history';

function stddev(values: number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

export async function computeSetupFingerprints(limit = 500) {
  const sql = getSql();
  if (!sql) return { ok: false as const, reason: 'database_not_configured' as const };
  await bootstrapHistoricalReplay();

  const opportunities = await sql`
    SELECT o.id, o.security_id, o.observed_at
    FROM opportunities o
    LEFT JOIN setup_fingerprints sf ON sf.opportunity_id = o.id
    WHERE sf.id IS NULL
    ORDER BY o.observed_at ASC
    LIMIT ${Math.max(1, Math.min(5000, limit))}
  `;

  let computed = 0;
  let insufficientHistory = 0;
  for (const opportunity of opportunities) {
    const bars = await sql`
      SELECT bar_time, open, high, low, close, volume
      FROM historical_bars
      WHERE security_id = ${String(opportunity.security_id)}
        AND timeframe = '1d'
        AND bar_time < date_trunc('day', ${new Date(String(opportunity.observed_at))})
      ORDER BY bar_time DESC
      LIMIT 21
    `;
    if (bars.length < 6) {
      insufficientHistory += 1;
      continue;
    }
    const ordered = [...bars].reverse();
    const closes = ordered.map((row) => Number(row.close)).filter(Number.isFinite);
    const volumes = ordered.map((row) => Number(row.volume ?? 0)).filter(Number.isFinite);
    if (closes.length < 6) {
      insufficientHistory += 1;
      continue;
    }
    const latest = closes[closes.length - 1];
    const fiveAgo = closes[Math.max(0, closes.length - 6)];
    const first = closes[0];
    const returns = closes.slice(1).map((value, i) => closes[i] > 0 ? (value / closes[i] - 1) : 0);
    const volatility20d = stddev(returns) * Math.sqrt(252) * 100;
    const return5d = fiveAgo > 0 ? (latest / fiveAgo - 1) * 100 : 0;
    const trend20d = first > 0 ? (latest / first - 1) * 100 : 0;
    const peak = Math.max(...closes);
    const drawdown20d = peak > 0 ? (latest / peak - 1) * 100 : 0;
    const recentVolume = volumes[volumes.length - 1] ?? 0;
    const avgVolume = volumes.slice(0, -1).length ? volumes.slice(0, -1).reduce((sum, value) => sum + value, 0) / volumes.slice(0, -1).length : 0;
    const volumeRatio20d = avgVolume > 0 ? recentVolume / avgVolume : 0;
    const latestBar = ordered[ordered.length - 1];
    const high = Number(latestBar.high ?? latest);
    const low = Number(latestBar.low ?? latest);
    const rangePct = latest > 0 ? (high - low) / latest * 100 : 0;

    await sql`
      INSERT INTO setup_fingerprints (
        id, opportunity_id, security_id, return_5d, volatility_20d, volume_ratio_20d, range_pct, trend_20d, drawdown_20d, features, computed_at
      ) VALUES (
        ${randomUUID()}, ${String(opportunity.id)}, ${String(opportunity.security_id)}, ${return5d}, ${volatility20d}, ${volumeRatio20d}, ${rangePct}, ${trend20d}, ${drawdown20d},
        ${JSON.stringify({ historyBars: bars.length })}::jsonb, now()
      )
      ON CONFLICT (opportunity_id) DO NOTHING
    `;
    computed += 1;
  }

  return { ok: true as const, computed, insufficientHistory, reviewed: opportunities.length, mode: 'shadow' as const, capitalExecutionEnabled: false as const };
}
