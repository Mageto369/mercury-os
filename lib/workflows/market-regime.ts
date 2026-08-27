import { gte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { marketSnapshots } from '@/lib/db/schema';

export type DerivedMarketRegime = 'RISK_ON' | 'SELECTIVE' | 'DEFENSIVE';

export interface MarketRegimeResult {
  snapshotsChecked: number;
  symbolsObserved: number;
  medianRvol: number;
  medianSpreadBps: number;
  avgFloatRotation: number;
  breadthProxy: number;
  outlookScore: number;
  regime: DerivedMarketRegime;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function runMarketRegimeWorkflow(): Promise<MarketRegimeResult> {
  const db = getDb();
  if (!db) throw new Error('DATABASE_URL is not configured');

  const lookbackMinutes = Math.max(5, Math.min(120, Number(process.env.REGIME_LOOKBACK_MINUTES ?? 30)));
  const cutoff = new Date(Date.now() - lookbackMinutes * 60 * 1000);

  const rows = await db
    .select({
      securityId: marketSnapshots.securityId,
      dollarVolume: marketSnapshots.dollarVolume,
      spreadBps: marketSnapshots.spreadBps,
      rvol: marketSnapshots.rvol,
      floatRotation: marketSnapshots.floatRotation,
    })
    .from(marketSnapshots)
    .where(gte(marketSnapshots.observedAt, cutoff))
    .limit(5000);

  const symbolsObserved = new Set(rows.map((row) => row.securityId)).size;
  const rvolValues = rows.map((row) => row.rvol === null ? 0 : Number(row.rvol)).filter((value) => value > 0);
  const spreadValues = rows.map((row) => row.spreadBps).filter((value): value is number => value !== null);
  const rotationValues = rows.map((row) => row.floatRotation === null ? 0 : Number(row.floatRotation)).filter((value) => value >= 0);
  const liquidRows = rows.filter((row) => Number(row.dollarVolume ?? 0) >= 250_000 && (row.spreadBps ?? 1000) <= 300);

  const medianRvol = median(rvolValues);
  const medianSpreadBps = median(spreadValues);
  const avgFloatRotation = rotationValues.length ? rotationValues.reduce((sum, value) => sum + value, 0) / rotationValues.length : 0;
  const breadthProxy = rows.length ? (liquidRows.length / rows.length) * 100 : 0;

  const rvolScore = clamp(35 + medianRvol * 18);
  const spreadScore = clamp(100 - medianSpreadBps / 5);
  const rotationScore = clamp(45 + avgFloatRotation * 12);
  const outlookScore = clamp(breadthProxy * 0.35 + rvolScore * 0.3 + spreadScore * 0.25 + rotationScore * 0.1);
  const regime: DerivedMarketRegime = outlookScore >= 72 ? 'RISK_ON' : outlookScore >= 48 ? 'SELECTIVE' : 'DEFENSIVE';

  return {
    snapshotsChecked: rows.length,
    symbolsObserved,
    medianRvol: Number(medianRvol.toFixed(2)),
    medianSpreadBps: Math.round(medianSpreadBps),
    avgFloatRotation: Number(avgFloatRotation.toFixed(2)),
    breadthProxy: Number(breadthProxy.toFixed(1)),
    outlookScore,
    regime,
  };
}
