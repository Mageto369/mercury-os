import { loadResearchQuotes, type QuoteEvidenceClass } from '@/lib/market/research-quotes';

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

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreLiquidity(dollarVolume: number, spreadBps: number | null, rvol: number | null, floatRotation: number | null) {
  const volumeScore = clamp(Math.log10(Math.max(1, dollarVolume)) * 15 - 30);
  const spreadScore = spreadBps === null ? 50 : clamp(100 - spreadBps / 5);
  const rvolScore = rvol === null ? 50 : clamp(35 + Math.min(65, rvol * 18));
  const rotationScore = floatRotation === null ? 50 : clamp(45 + Math.min(55, floatRotation * 12));
  return clamp(volumeScore * 0.4 + spreadScore * 0.3 + rvolScore * 0.2 + rotationScore * 0.1);
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
  }).sort((a, b) => b.liquidityScore - a.liquidityScore);

  return { snapshotsChecked: rows.length, signals };
}
