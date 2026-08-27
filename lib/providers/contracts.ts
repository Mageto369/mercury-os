export interface ProviderHealth {
  provider: string;
  configured: boolean;
  healthy: boolean;
  checkedAt: string;
  detail?: string;
}

export interface FilingEvent {
  symbol?: string;
  cik: string;
  accessionNumber: string;
  form: string;
  filedAt: string;
  url: string;
}

export interface SocialSignal {
  symbol: string;
  source: "reddit" | "discord" | "telegram" | "facebook";
  mentions: number;
  velocity: number;
  sentiment: number;
  promotionRisk: number;
  crowding: number;
  observedAt: string;
}

export interface MarketSignal {
  symbol: string;
  price: number;
  volume: number;
  dollarVolume: number;
  rvol?: number;
  spreadBps?: number;
  floatRotation?: number;
  observedAt: string;
}
