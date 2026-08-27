import { getSql } from '@/lib/db';

type MarkoutRow = {
  id: string;
  symbol: string;
  action: string;
  alpha: number;
  asymmetry: number;
  observed_at: string | Date;
  entry_price: string | null;
  mark_15_price: string | null;
  mark_60_price: string | null;
};

function pct(entry: number, exit: number) {
  if (!entry || !Number.isFinite(entry) || !Number.isFinite(exit)) return null;
  return ((exit / entry) - 1) * 100;
}

function aggregate(values: number[]) {
  if (!values.length) return { count: 0, averageReturnPct: 0, medianReturnPct: 0, hitRatePct: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    count: values.length,
    averageReturnPct: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)),
    medianReturnPct: Number(median.toFixed(2)),
    hitRatePct: Number((100 * values.filter((value) => value > 0).length / values.length).toFixed(2)),
  };
}

export async function getShadowPerformance() {
  const sql = getSql();
  if (!sql) {
    return {
      available: false as const,
      reason: 'database_not_configured' as const,
      mode: 'shadow' as const,
      capitalExecutionEnabled: false as const,
      horizons: { m15: aggregate([]), m60: aggregate([]) },
      byAction: {},
      evaluated: 0,
    };
  }

  const rows = await sql`
    SELECT
      o.id, s.symbol, o.action, o.alpha, o.asymmetry, o.observed_at,
      entry.price AS entry_price,
      mark15.price AS mark_15_price,
      mark60.price AS mark_60_price
    FROM opportunities o
    JOIN securities s ON s.id = o.security_id
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
    WHERE o.observed_at >= now() - interval '30 days'
    ORDER BY o.observed_at DESC
    LIMIT 500
  ` as unknown as MarkoutRow[];

  const m15: number[] = [];
  const m60: number[] = [];
  const byActionValues = new Map<string, { m15: number[]; m60: number[] }>();

  for (const row of rows) {
    const entry = Number(row.entry_price);
    const r15 = row.mark_15_price == null ? null : pct(entry, Number(row.mark_15_price));
    const r60 = row.mark_60_price == null ? null : pct(entry, Number(row.mark_60_price));
    const bucket = byActionValues.get(row.action) ?? { m15: [], m60: [] };
    if (r15 != null) { m15.push(r15); bucket.m15.push(r15); }
    if (r60 != null) { m60.push(r60); bucket.m60.push(r60); }
    byActionValues.set(row.action, bucket);
  }

  const byAction = Object.fromEntries([...byActionValues.entries()].map(([action, values]) => [action, {
    m15: aggregate(values.m15),
    m60: aggregate(values.m60),
  }]));

  return {
    available: true as const,
    mode: 'shadow' as const,
    capitalExecutionEnabled: false as const,
    evaluated: rows.length,
    matured15m: m15.length,
    matured60m: m60.length,
    horizons: { m15: aggregate(m15), m60: aggregate(m60) },
    byAction,
    measuredAt: new Date().toISOString(),
  };
}
