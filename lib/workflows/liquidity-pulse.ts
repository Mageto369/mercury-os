import { loadResearchQuotes, type QuoteEvidenceClass } from '@/lib/market/research-quotes';
import { scoreLiquidity } from '@/lib/workflows/research-scores';

export interface LiquiditySignal {
  symbol: string;
  price: number;
  dollarVolume: number;
  spreadBps: number | null;
  rvol: number | null;
  floatRotation: number | null;
  liquidityScore: number;
  status: 'healthy' | 'watch' | 'thin';
  observedAt: string;
  evidenceClass: QuoteEvidenceClass;
}

export interface LiquidityPulseResult {
  snapshotsChecked: number;
  signals: LiquiditySignal[];
}

export async function runLiquidityPulseWorkflow(): Promise<LiquidityPulseResult> {
  const lookbackMinutes = Math.max(1, Math.min(30, Number(process.env.MARKET_LOOKBACK_MINUTES ?? 5)));
  const rows = await loadResearchQuotes(lookbackMinutes);

  const signals = rows.map((row) => {
    const price = row.price;
    const dollarVolume = row.dollarVolume;
    const rvol = row.rvol;
    const floatRotation = row.floatRotation;
    const score = scoreLiquidity(dollarVolume, row.spreadBps, rvol, floatRotation);
    return {
      symbol: row.symbol,
      price,
      dollarVolume,
      spreadBps: row.spreadBps,
      rvol,
      floatRotation,
      liquidityScore: score,
      status: score >= 75 ? 'healthy' as const : score >= 50 ? 'watch' as const : 'thin' as const,
      observedAt: row.observedAt.toISOString(),
      evidenceClass: row.evidenceClass,
    };
  }).sort((a, b) => b.liquidityScore - a.liquidityScore || b.dollarVolume - a.dollarVolume);

  return { snapshotsChecked: rows.length, signals };
}
