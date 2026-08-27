export type MarketProviderName = 'massive' | 'intrinio';

export interface NormalizedMarketSnapshot {
  symbol: string;
  price: number;
  volume: number;
  dollarVolume: number;
  bid?: number;
  ask?: number;
  spreadBps?: number;
  rvol?: number;
  observedAt: Date;
  source: MarketProviderName;
  providerPayload?: Record<string, unknown>;
}

export interface MarketProviderPullResult {
  provider: MarketProviderName;
  ok: boolean;
  snapshots: NormalizedMarketSnapshot[];
  requested: number;
  received: number;
  errors: Array<{ symbol?: string; message: string }>;
  startedAt: string;
  completedAt: string;
}

export interface MarketProvider {
  name: MarketProviderName;
  configured(): boolean;
  pull(symbols: string[]): Promise<MarketProviderPullResult>;
}
