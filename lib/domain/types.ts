export type MarketRegime = "RISK_ON" | "SELECTIVE" | "DEFENSIVE";
export type OpportunityState = "DORMANT" | "ACCUMULATION" | "IGNITION" | "BREAKOUT" | "ACCELERATION" | "EUPHORIA" | "EXHAUSTION" | "DISTRIBUTION";
export type DecisionAction = "BLOCK" | "WATCH" | "GEM_WATCH" | "WAVE_ACTIVE" | "PRESS" | "REDUCE" | "EXIT";

export interface OpportunityInput {
  symbol: string;
  market: "OTC" | "NASDAQ" | "NYSE" | "AMEX";
  price: number;
  marketCapUsd: number;
  floatShares: number;
  avgDollarVolume20d: number;
  gem: number;
  wave: number;
  catalyst: number;
  social: number;
  liquidity: number;
  marketOutlook: number;
  reverseSplitRisk: number;
  dilutionRisk: number;
  promotionRisk: number;
  trapRisk: number;
  peakRisk: number;
  confidence: number;
  state: OpportunityState;
}

export interface OpportunityDecision {
  symbol: string;
  alpha: number;
  asymmetry: number;
  aggression: 0 | 1 | 2 | 3 | 4 | 5;
  action: DecisionAction;
  hardBlocked: boolean;
  reasons: string[];
  suggestedRiskMultiplier: number;
}
