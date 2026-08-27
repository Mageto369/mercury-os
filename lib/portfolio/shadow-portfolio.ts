import { randomUUID } from 'node:crypto';
import { getSql } from '@/lib/db';
import { simulateExecution } from '@/lib/execution/simulator';

export async function buildShadowPortfolio() {
  const sql = getSql();
  if (!sql) return { ok: false as const, reason: 'database_not_configured' as const, positions: [] };

  const baseCapital = Math.max(1_000, Number(process.env.SHADOW_CAPITAL_BASE ?? 100_000));
  const maxGrossPct = Math.max(1, Math.min(100, Number(process.env.SHADOW_MAX_GROSS_PCT ?? 35)));
  const maxPositionPct = Math.max(0.25, Math.min(25, Number(process.env.SHADOW_MAX_POSITION_PCT ?? 7.5)));
  const maxGross = baseCapital * maxGrossPct / 100;
  const maxPosition = baseCapital * maxPositionPct / 100;

  const rows = await sql`
    SELECT DISTINCT ON (o.security_id)
      o.id AS opportunity_id, o.security_id, s.symbol, o.action, o.alpha, o.asymmetry, o.confidence,
      o.trap_risk, o.peak_risk, o.hard_blocked, o.observed_at,
      m.price, m.dollar_volume, m.spread_bps, m.rvol, m.float_rotation
    FROM opportunities o
    JOIN securities s ON s.id = o.security_id
    LEFT JOIN LATERAL (
      SELECT price, dollar_volume, spread_bps, rvol, float_rotation
      FROM market_snapshots
      WHERE security_id = o.security_id
      ORDER BY observed_at DESC LIMIT 1
    ) m ON true
    WHERE o.observed_at >= now() - interval '90 minutes'
      AND o.hard_blocked = false
      AND o.action IN ('PRESS','WAVE_ACTIVE','GEM_WATCH','WATCH')
    ORDER BY o.security_id, o.observed_at DESC
  `;

  const ranked = rows.map((row) => {
    const quality = Math.max(0, Number(row.asymmetry ?? 0) * 0.45 + Number(row.alpha ?? 0) * 0.25 + Number(row.confidence ?? 0) * 0.2 - Number(row.trap_risk ?? 0) * 0.07 - Number(row.peak_risk ?? 0) * 0.08);
    return { row, quality };
  }).sort((a, b) => b.quality - a.quality);

  const positions: Array<Record<string, unknown>> = [];
  let grossExposure = 0;
  let liquidityAtRisk = 0;

  for (const candidate of ranked) {
    if (grossExposure >= maxGross) break;
    const row = candidate.row;
    const dollarVolume = Number(row.dollar_volume ?? 0);
    const price = Number(row.price ?? 0);
    if (!Number.isFinite(dollarVolume) || dollarVolume <= 0 || !Number.isFinite(price) || price <= 0) continue;
    const convictionScale = Math.max(0.1, Math.min(1, candidate.quality / 100));
    const desired = Math.min(maxPosition * convictionScale, maxGross - grossExposure);
    const execution = simulateExecution({
      notional: desired,
      price,
      dollarVolume,
      spreadBps: Number(row.spread_bps ?? 0),
      rvol: Number(row.rvol ?? 1),
      floatRotation: Number(row.float_rotation ?? 0),
    });
    const notional = Math.min(desired, execution.estimatedCapacityNotional);
    if (notional < baseCapital * 0.001) continue;
    grossExposure += notional;
    if (execution.discontinuityRisk === 'high' || execution.discontinuityRisk === 'extreme') liquidityAtRisk += notional;
    positions.push({
      symbol: row.symbol,
      opportunityId: row.opportunity_id,
      action: row.action,
      notional: Number(notional.toFixed(2)),
      weightPct: Number((notional / baseCapital * 100).toFixed(3)),
      qualityScore: Number(candidate.quality.toFixed(2)),
      price,
      execution,
      shadowOnly: true,
    });
  }

  const concentration = positions.length ? Math.min(100, Math.round(100 * Math.max(...positions.map((position) => Number(position.weightPct))) / Math.max(0.01, grossExposure / baseCapital * 100))) : 0;
  const limits = { baseCapital, maxGrossPct, maxPositionPct, brokerAuthority: false, shadowOnly: true };
  const id = randomUUID();
  await sql`
    INSERT INTO shadow_portfolio_snapshots (
      id, gross_exposure, net_exposure, expected_shortfall, drawdown_pct, liquidity_at_risk,
      concentration_score, regime, positions, limits, observed_at
    ) VALUES (
      ${id}, ${grossExposure}, ${grossExposure}, ${null}, ${0}, ${liquidityAtRisk}, ${concentration},
      'research-shadow', ${sql.json(positions as any)}, ${sql.json(limits)}, now()
    )
  `;

  return {
    ok: true as const,
    mode: 'shadow' as const,
    capitalExecutionEnabled: false as const,
    snapshotId: id,
    grossExposure: Number(grossExposure.toFixed(2)),
    grossExposurePct: Number((grossExposure / baseCapital * 100).toFixed(2)),
    liquidityAtRisk: Number(liquidityAtRisk.toFixed(2)),
    concentrationScore: concentration,
    positions,
    limits,
    measuredAt: new Date().toISOString(),
  };
}

export async function getLatestShadowPortfolio() {
  const sql = getSql();
  if (!sql) return { available: false as const, reason: 'database_not_configured' as const, positions: [] };
  try {
    const [row] = await sql`SELECT * FROM shadow_portfolio_snapshots ORDER BY observed_at DESC LIMIT 1`;
    if (!row) return { available: true as const, mode: 'shadow' as const, capitalExecutionEnabled: false as const, positions: [] };
    return { available: true as const, mode: 'shadow' as const, capitalExecutionEnabled: false as const, ...row };
  } catch {
    return { available: false as const, reason: 'shadow_portfolio_schema_not_initialized' as const, positions: [] };
  }
}
