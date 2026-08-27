import { getSql } from '@/lib/db';

type OutcomeCandidate = {
  opportunity_id: string;
  security_id: string;
  observed_at: string | Date;
  entry_price: string | null;
  price_15m: string | null;
  price_60m: string | null;
  price_1d: string | null;
  max_60m: string | null;
  min_60m: string | null;
  max_1d: string | null;
  min_1d: string | null;
};

function returnPct(entry: number, mark: number | null) {
  if (!Number.isFinite(entry) || entry <= 0 || mark == null || !Number.isFinite(mark)) return null;
  return Number((((mark / entry) - 1) * 100).toFixed(4));
}

export async function matureOpportunityOutcomes(limit = 500) {
  const sql = getSql();
  if (!sql) return { ok: false as const, reason: 'database_not_configured' as const, evaluated: 0, persisted: 0 };

  const rows = await sql`
    SELECT
      o.id AS opportunity_id,
      o.security_id,
      o.observed_at,
      entry.price AS entry_price,
      mark15.price AS price_15m,
      mark60.price AS price_60m,
      mark1d.price AS price_1d,
      range60.max_price AS max_60m,
      range60.min_price AS min_60m,
      range1d.max_price AS max_1d,
      range1d.min_price AS min_1d
    FROM opportunities o
    LEFT JOIN LATERAL (
      SELECT m.price FROM market_snapshots m
      WHERE m.security_id = o.security_id AND m.observed_at <= o.observed_at
      ORDER BY m.observed_at DESC LIMIT 1
    ) entry ON true
    LEFT JOIN LATERAL (
      SELECT m.price FROM market_snapshots m
      WHERE m.security_id = o.security_id AND m.observed_at >= o.observed_at + interval '15 minutes'
      ORDER BY m.observed_at ASC LIMIT 1
    ) mark15 ON true
    LEFT JOIN LATERAL (
      SELECT m.price FROM market_snapshots m
      WHERE m.security_id = o.security_id AND m.observed_at >= o.observed_at + interval '60 minutes'
      ORDER BY m.observed_at ASC LIMIT 1
    ) mark60 ON true
    LEFT JOIN LATERAL (
      SELECT m.price FROM market_snapshots m
      WHERE m.security_id = o.security_id AND m.observed_at >= o.observed_at + interval '1 day'
      ORDER BY m.observed_at ASC LIMIT 1
    ) mark1d ON true
    LEFT JOIN LATERAL (
      SELECT max(m.price) AS max_price, min(m.price) AS min_price FROM market_snapshots m
      WHERE m.security_id = o.security_id AND m.observed_at BETWEEN o.observed_at AND o.observed_at + interval '60 minutes'
    ) range60 ON true
    LEFT JOIN LATERAL (
      SELECT max(m.price) AS max_price, min(m.price) AS min_price FROM market_snapshots m
      WHERE m.security_id = o.security_id AND m.observed_at BETWEEN o.observed_at AND o.observed_at + interval '1 day'
    ) range1d ON true
    WHERE o.observed_at >= now() - interval '45 days'
    ORDER BY o.observed_at DESC
    LIMIT ${Math.max(1, Math.min(2000, limit))}
  ` as unknown as OutcomeCandidate[];

  let persisted = 0;
  let matured15m = 0;
  let matured60m = 0;
  let matured1d = 0;

  for (const row of rows) {
    const entry = Number(row.entry_price);
    if (!Number.isFinite(entry) || entry <= 0) continue;
    const p15 = row.price_15m == null ? null : Number(row.price_15m);
    const p60 = row.price_60m == null ? null : Number(row.price_60m);
    const p1d = row.price_1d == null ? null : Number(row.price_1d);
    const max60 = row.max_60m == null ? null : Number(row.max_60m);
    const min60 = row.min_60m == null ? null : Number(row.min_60m);
    const max1d = row.max_1d == null ? null : Number(row.max_1d);
    const min1d = row.min_1d == null ? null : Number(row.min_1d);
    const m15 = p15 != null;
    const m60 = p60 != null;
    const m1d = p1d != null;

    await sql`
      INSERT INTO opportunity_outcomes (
        id, opportunity_id, security_id, entry_price, return_15m, return_60m, return_1d,
        mfe_60m, mae_60m, mfe_1d, mae_1d, max_price_1d, min_price_1d,
        matured_15m, matured_60m, matured_1d, payload, evaluated_at
      ) VALUES (
        ${`outcome:${row.opportunity_id}`}, ${row.opportunity_id}, ${row.security_id}, ${entry},
        ${returnPct(entry, p15)}, ${returnPct(entry, p60)}, ${returnPct(entry, p1d)},
        ${returnPct(entry, max60)}, ${returnPct(entry, min60)}, ${returnPct(entry, max1d)}, ${returnPct(entry, min1d)},
        ${max1d}, ${min1d}, ${m15}, ${m60}, ${m1d},
        ${sql.json({ method: 'nearest-forward-mark', horizonSet: ['15m', '60m', '1d'], shadowOnly: true })}, now()
      )
      ON CONFLICT (opportunity_id) DO UPDATE SET
        entry_price = excluded.entry_price,
        return_15m = excluded.return_15m,
        return_60m = excluded.return_60m,
        return_1d = excluded.return_1d,
        mfe_60m = excluded.mfe_60m,
        mae_60m = excluded.mae_60m,
        mfe_1d = excluded.mfe_1d,
        mae_1d = excluded.mae_1d,
        max_price_1d = excluded.max_price_1d,
        min_price_1d = excluded.min_price_1d,
        matured_15m = excluded.matured_15m,
        matured_60m = excluded.matured_60m,
        matured_1d = excluded.matured_1d,
        payload = excluded.payload,
        evaluated_at = now()
    `;
    persisted += 1;
    if (m15) matured15m += 1;
    if (m60) matured60m += 1;
    if (m1d) matured1d += 1;
  }

  return {
    ok: true as const,
    mode: 'shadow' as const,
    capitalExecutionEnabled: false as const,
    evaluated: rows.length,
    persisted,
    matured15m,
    matured60m,
    matured1d,
    measuredAt: new Date().toISOString(),
  };
}

export async function getOutcomeEvidence() {
  const sql = getSql();
  if (!sql) return {
    available: false as const, reason: 'database_not_configured' as const, mode: 'shadow' as const,
    capitalExecutionEnabled: false as const, samples: { m15: 0, m60: 0, d1: 0 },
  };

  const [summary] = await sql`
    SELECT
      count(*) FILTER (WHERE matured_15m) AS m15_count,
      count(*) FILTER (WHERE matured_60m) AS m60_count,
      count(*) FILTER (WHERE matured_1d) AS d1_count,
      avg(return_15m) FILTER (WHERE matured_15m) AS avg_15m,
      avg(return_60m) FILTER (WHERE matured_60m) AS avg_60m,
      avg(return_1d) FILTER (WHERE matured_1d) AS avg_1d,
      avg(mfe_60m) FILTER (WHERE matured_60m) AS avg_mfe_60m,
      avg(mae_60m) FILTER (WHERE matured_60m) AS avg_mae_60m,
      avg(CASE WHEN return_60m > 0 THEN 1.0 ELSE 0.0 END) FILTER (WHERE matured_60m) * 100 AS hit_60m
    FROM opportunity_outcomes
  `;

  const value = (key: string) => Number((summary as Record<string, unknown>)?.[key] ?? 0);
  return {
    available: true as const,
    mode: 'shadow' as const,
    capitalExecutionEnabled: false as const,
    samples: { m15: value('m15_count'), m60: value('m60_count'), d1: value('d1_count') },
    returns: {
      average15mPct: Number(value('avg_15m').toFixed(3)),
      average60mPct: Number(value('avg_60m').toFixed(3)),
      average1dPct: Number(value('avg_1d').toFixed(3)),
      hitRate60mPct: Number(value('hit_60m').toFixed(2)),
    },
    excursions: {
      averageMfe60mPct: Number(value('avg_mfe_60m').toFixed(3)),
      averageMae60mPct: Number(value('avg_mae_60m').toFixed(3)),
    },
    measuredAt: new Date().toISOString(),
  };
}
