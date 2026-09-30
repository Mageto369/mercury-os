import { loadResearchQuotes } from '@/lib/market/research-quotes';
import { deriveResearchOutlook, type DerivedMarketRegime, type RegimeBasis } from '@/lib/workflows/research-scores';

export type { DerivedMarketRegime };

export interface MarketRegimeResult {
  snapshotsChecked: number;
  symbolsObserved: number;
  medianRvol: number | null;
  medianSpreadBps: number | null;
  avgFloatRotation: number | null;
  breadthProxy: number;
  outlookScore: number;
  regime: DerivedMarketRegime;
  basis: RegimeBasis;
}

export async function runMarketRegimeWorkflow(): Promise<MarketRegimeResult> {
  const lookbackMinutes = Math.max(5, Math.min(120, Number(process.env.REGIME_LOOKBACK_MINUTES ?? 30)));
  const quotes = await loadResearchQuotes(lookbackMinutes);
  const outlook = deriveResearchOutlook(quotes.map((quote) => ({
    dollarVolume: quote.dollarVolume,
    spreadBps: quote.spreadBps,
    rvol: quote.rvol,
    floatRotation: quote.floatRotation,
  })));

  return {
    snapshotsChecked: quotes.length,
    symbolsObserved: new Set(quotes.map((quote) => quote.securityId)).size,
    ...outlook,
  };
}
